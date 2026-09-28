/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS script, same style as scripts/smoke-test-core-pages.js */
/**
 * verify-db-authz.js - Phase 1 database authorization verification harness
 * =========================================================================
 * Spec:   .kiro/specs/p0-database-authorization-lockdown (Requirement 11)
 * Matrix: PRIORITIZED_ACTION_PLAN.md §1.7. Every row is labelled PROD-SAFE,
 *         MANUAL-PRODUCTION-FLOW or STAGING-ONLY (run `matrix` to list them).
 * Catalog checks (ACLs, search_path, dropped objects, profiles column grants,
 * ledger, fingerprints) live in scripts/sql/phase1_postcheck.sql.
 *
 * THE HARNESS REFUSES PRODUCTION MUTATION BY DEFAULT.
 *
 * COMMANDS
 *   node scripts/verify-db-authz.js help
 *   node scripts/verify-db-authz.js matrix          every matrix row, its label and where it runs
 *   node scripts/verify-db-authz.js checklist       the MANUAL-PRODUCTION-FLOW checklist
 *   node scripts/verify-db-authz.js fingerprints    local only: expected G-7 body fingerprints from
 *                                                   migration 1A, cross-checked with phase1_postcheck.sql
 *   node scripts/verify-db-authz.js --stage=<stage>                  PROD-SAFE probes (default mode)
 *   node scripts/verify-db-authz.js --mode=staging --stage=<stage>   STAGING-ONLY behavioural tests
 *
 * STAGES (the state of the target when you run it)
 *   baseline  R1 not deployed, 1A not applied     post-r1  R1 deployed, 1A not applied
 *   post-1a   1A applied, 1B not applied          post-1b  1A and 1B applied
 *   PASS means "matches what this stage should look like". At `baseline` and
 *   `post-r1` that includes the known pre-1A exposures (the recorded baseline).
 *
 * PROD-SAFE MODE (default; targets NEXT_PUBLIC_SUPABASE_URL from env or .env.local)
 *   Allowlisted probes only. Every probe either reads, or has no effect:
 *     F-5   anon get_pending_deadline_reminders(): zero rows requested, count only
 *     F-5   service_role get_pending_deadline_reminders(): same, only if AUTHZ_SERVICE_PROBE=1
 *     F-6   anon mark_deadline_reminder_sent('{}'): empty array only (matches no row)
 *     F-12  anon is_admin(<random uuid>)
 *     F-8/F-15  anon get_public_builder_profile(<random uuid>) and (<AUTHZ_TARGET_IDS>)
 *     R-1/R-2   GET <AUTHZ_SITE_URL>/api/builder-track-record/<id> without cookies
 *   It never: creates users, teams or conversations; writes rate_limits; runs
 *   cleanup_lapsed_streaks; modifies profiles; deletes accounts; generates
 *   notifications or emails; passes p_caller_id; logs row values. The only output is
 *   pass/fail, permission outcomes, shape flags and aggregate counts.
 *
 * STAGING MODE (--mode=staging; STAGING-ONLY rows; creates and deletes throwaway data)
 *   Requires ALL of:
 *     AUTHZ_ALLOW_MUTATION=1
 *     AUTHZ_STAGING_URL, AUTHZ_STAGING_ANON_KEY, AUTHZ_STAGING_SERVICE_ROLE_KEY
 *       (never read from .env.local)
 *   Refuses to start when the staging URL or keys match HackerMate production (the
 *   known production project ref, the .env.local URL/keys, or AUTHZ_PROD_PROJECT_REFS).
 *   The staging database must allow email/password sign-in for the test users and
 *   must NOT carry the production notification-webhook URL or secret.
 *   Test data: authz-test-<run>-<role>@example.invalid users, a test-authz-<run>
 *   team, and synthetic authz-test-<run>-rl rate-limit keys. Everything created is
 *   deleted in `finally`, scoped to the IDs this run created.
 *
 * OPTIONAL ENV (prod-safe mode)
 *   AUTHZ_SITE_URL      e.g. https://<site> or http://localhost:3000 (enables R-1/R-2)
 *   AUTHZ_TARGET_IDS    comma-separated existing profile UUIDs (enables R-2, F-8/F-15 targets)
 *   AUTHZ_SERVICE_PROBE=1  enables the service_role count-only F-5 probe
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const FRONTEND_DIR = path.join(__dirname, "..");
const MIGRATION_1A = path.join(FRONTEND_DIR, "supabase", "migrations", "20260928100000_phase1a_definer_function_privileges.sql");
const POSTCHECK_SQL = path.join(FRONTEND_DIR, "scripts", "sql", "phase1_postcheck.sql");

// HackerMate production Supabase project ref(s). Staging mode refuses these.
const PRODUCTION_PROJECT_REFS = ["rhryjrbebfrrfhtyyzbs"];
const STAGES = ["baseline", "post-r1", "post-1a", "post-1b"];
const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

// -----------------------------------------------------------------------------
// Matrix (PRIORITIZED_ACTION_PLAN.md §1.7): id, label, where it runs, what it checks
// -----------------------------------------------------------------------------
const MATRIX = [
  ["R-1", "PROD-SAFE", "harness prod-safe", "Track-record route, nonexistent target, no cookies: 200 {success:true,data:null}"],
  ["R-2", "PROD-SAFE", "harness prod-safe", "Track-record route, existing target, no cookies: baseline 200 masked; post-r1 500 {success:false}; post-1a 200 with data"],
  ["R-3", "MANUAL-PRODUCTION-FLOW", "manual", "A opens own profile: before 1A no track record + browser console.error; after 1A the full record"],
  ["R-4", "MANUAL-PRODUCTION-FLOW", "manual", "One /api/contact submission is delivered, no 503 (repeat right after 1A)"],
  ["R-5", "STAGING-ONLY", "preview / non-production environment", "Contact and send-email return 503 when the service key is missing or the rate-limit RPC fails"],
  ["R-6", "MANUAL-PRODUCTION-FLOW", "manual", "Connection request C -> A sends exactly one email (repeat right after 1A)"],
  ["R-7", "MANUAL-PRODUCTION-FLOW", "manual", "Nudge modal save (bio or skills missing) persists; no 42501; errors console.error'd"],
  ["F-1", "PROD-SAFE", "phase1_postcheck.sql", "add_user_to_team EXECUTE false for PUBLIC, anon, authenticated, service_role"],
  ["F-1s", "STAGING-ONLY", "harness staging", "Authenticated non-owner calls add_user_to_team(team, self, 'owner'): permission denied"],
  ["F-2", "MANUAL-PRODUCTION-FLOW", "manual", "A invites B, B accepts: B is a member and a team-chat participant"],
  ["F-2s", "STAGING-ONLY", "harness staging", "Invite accept, automated"],
  ["F-3", "MANUAL-PRODUCTION-FLOW", "manual", "B requests to join, A accepts: B is a member"],
  ["F-3s", "STAGING-ONLY", "harness staging", "Join request accept, automated"],
  ["F-4", "STAGING-ONLY", "harness staging", "generate_team_invite_token -> join_team_instantly: member (no UI produces invite links)"],
  ["F-5", "PROD-SAFE", "phase1_postcheck.sql + harness prod-safe", "get_pending_deadline_reminders: anon/authenticated denied, service_role permitted; count only"],
  ["F-5s", "STAGING-ONLY", "harness staging", "Reminder RPCs: anon/authenticated denied, service_role permitted"],
  ["F-6", "PROD-SAFE", "phase1_postcheck.sql + harness prod-safe", "mark_deadline_reminder_sent: anon denied (probe passes '{}' only)"],
  ["F-7", "PROD-SAFE", "phase1_postcheck.sql", "check_rate_limit EXECUTE: service_role only"],
  ["F-7s", "STAGING-ONLY", "harness staging", "check_rate_limit atomicity (N+1 concurrent calls allow exactly N); synthetic key deleted in finally"],
  ["F-8", "PROD-SAFE", "phase1_postcheck.sql + harness prod-safe", "Track-record email for anon is null; body has no admin branch and uses auth.uid()"],
  ["F-8m", "MANUAL-PRODUCTION-FLOW", "manual", "Flag on: target / teammate / stranger / admin -> email shown / shown / null / null"],
  ["F-8s", "STAGING-ONLY", "harness staging", "Flag on email matrix, automated (incl. admin who is not a teammate)"],
  ["F-9", "PROD-SAFE", "phase1_postcheck.sql", "get_authorized_profile_email (both signatures) absent"],
  ["F-10", "PROD-SAFE", "phase1_postcheck.sql", "Policy conversation_participants_insert absent"],
  ["F-10m", "MANUAL-PRODUCTION-FLOW", "manual", "DM creation and team join still add participants"],
  ["F-10s", "STAGING-ONLY", "harness staging", "Direct insert into conversation_participants denied; RPC paths still add participants"],
  ["F-11", "PROD-SAFE", "phase1_postcheck.sql", "1A-8 functions: anon false, authenticated true, service_role false"],
  ["F-11m", "MANUAL-PRODUCTION-FLOW", "manual", "Send message, react, delete own message, streak widget, connect"],
  ["F-11s", "STAGING-ONLY", "harness staging", "Anon denial per function; authenticated flows work; link join; delete a test account"],
  ["F-12", "PROD-SAFE", "phase1_postcheck.sql + harness prod-safe", "is_admin: anon denied, authenticated true, service_role false"],
  ["F-12m", "MANUAL-PRODUCTION-FLOW", "manual", "/admin loads for the admin; /challenges loads"],
  ["F-13", "PROD-SAFE", "phase1_postcheck.sql", "cleanup_lapsed_streaks EXECUTE: service_role only"],
  ["F-13b", "PROD-SAFE", "read-only log inspection", "Next 03:30 UTC cron run: rpc/cleanup_lapsed_streaks 200 as service_role; no streak warning. Never invoked by the harness"],
  ["F-13s", "STAGING-ONLY", "harness staging", "cleanup_lapsed_streaks: authenticated denied, service_role runs"],
  ["F-14", "PROD-SAFE", "phase1_postcheck.sql", "send_connection_request(uuid) absent"],
  ["F-14m", "MANUAL-PRODUCTION-FLOW", "manual", "Profile Connect button (2-arg function) creates a request"],
  ["F-15", "PROD-SAFE", "phase1_postcheck.sql + harness prod-safe + logs", "projects is always []; no team_projects reference; no new 42P01 for team_projects"],
  ["F-16", "MANUAL-PRODUCTION-FLOW", "manual", "Flag off: anon / stranger / teammate / target -> restricted x3 / full; email null / null / shown / shown"],
  ["F-16s", "STAGING-ONLY", "harness staging", "Flag off matrix, automated, plus admin (restricted, email null)"],
  ["P-1..P-10", "MANUAL-PRODUCTION-FLOW", "manual", "Writers W1..W10 still save (founder accounts; G-3 account for W1-W3)"],
  ["P-11", "PROD-SAFE", "phase1_postcheck.sql", "profiles.email not updatable by anon or authenticated"],
  ["P-12", "PROD-SAFE", "phase1_postcheck.sql", "profiles.role / is_banned not updatable"],
  ["P-13", "PROD-SAFE", "phase1_postcheck.sql", "Streak, nudge, created_at, username, full_name not updatable"],
  ["P-11s..P-13s", "STAGING-ONLY", "harness staging", "Behavioural UPDATE attempts on those columns are denied; a whitelisted column still saves"],
  ["P-14", "PROD-SAFE", "phase1_postcheck.sql", "Exactly the 20 whitelisted columns updatable by authenticated; none by anon"],
  ["G-1", "PROD-SAFE", "phase1_postcheck.sql", "Four-role ACL + search_path: touched = final model, untouched = snapshot, anon allowlist"],
  ["G-2", "PROD-SAFE", "node scripts/smoke-test-core-pages.js", "Smoke test passes (output has real names: don't paste it into artifacts)"],
  ["G-2m", "MANUAL-PRODUCTION-FLOW", "manual", "Core pages as anon, A and B"],
  ["G-3", "MANUAL-PRODUCTION-FLOW", "manual", "New OAuth sign-up creates a profile row"],
  ["G-4", "MANUAL-PRODUCTION-FLOW", "manual", "Offline-notification webhook still fires for a notification from a manual flow"],
  ["G-5", "MANUAL-PRODUCTION-FLOW", "manual", "Browser console on core pages: no 42501, no track-record errors after 1A"],
  ["G-6", "PROD-SAFE", "phase1_postcheck.sql", "Ledger: exactly one new row per migration (131 -> 132 -> 133)"],
  ["G-7", "PROD-SAFE", "phase1_postcheck.sql (+ `fingerprints` locally)", "Live bodies of the three replaced functions match the migration text"],
];

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------
function readEnvLocal() {
  const envPath = path.join(FRONTEND_DIR, ".env.local");
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function projectRefFromUrl(url) {
  try {
    return new URL(url).hostname.split(".")[0].toLowerCase();
  } catch {
    return null;
  }
}

function normalizeUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "").toLowerCase();
}

function outcomeOf(error) {
  if (!error) return "permitted";
  if (error.code === "42501") return "denied";
  if (error.code === "PGRST202") return "not-found";
  return `error ${error.code || "unknown"}`;
}

class Report {
  constructor(mode, stage) {
    this.mode = mode;
    this.stage = stage;
    this.rows = [];
  }
  add(id, label, check, ok, detail) {
    this.rows.push({ id, label, check, result: ok ? "PASS" : "FAIL", detail });
  }
  skip(id, label, check, reason) {
    this.rows.push({ id, label, check, result: "SKIP", detail: reason });
  }
  expect(id, label, check, actualOutcome, expectedOutcome) {
    this.add(id, label, check, actualOutcome === expectedOutcome, `${actualOutcome} (expected ${expectedOutcome})`);
  }
  get failed() {
    return this.rows.filter((r) => r.result === "FAIL").length;
  }
  print() {
    console.log("");
    for (const r of this.rows) {
      console.log(`[${r.result}] ${r.id.padEnd(8)} ${r.label.padEnd(13)} ${r.check}`);
      if (r.detail) console.log(`         ${r.detail}`);
    }
    const count = (s) => this.rows.filter((r) => r.result === s).length;
    console.log("");
    console.log(`mode=${this.mode} stage=${this.stage}  PASS=${count("PASS")} FAIL=${count("FAIL")} SKIP=${count("SKIP")}`);
  }
}

// Shape of a get_public_builder_profile response, reported as flags only (never values).
function trackRecordState(data) {
  const keys = ["profile", "registrations", "teams", "submissions", "projects"];
  const isObj = data !== null && typeof data === "object";
  const shapeOk =
    isObj &&
    keys.every((k) => k in data) &&
    data.profile !== null &&
    typeof data.profile === "object" &&
    ["registrations", "teams", "submissions", "projects"].every((k) => Array.isArray(data[k]));
  if (!shapeOk) {
    return { shapeOk: false, projectsEmpty: false, emailVisible: false, restricted: false, teamCount: 0, flagOff: false };
  }
  const arrays = ["registrations", "teams", "submissions", "projects"];
  return {
    shapeOk: true,
    projectsEmpty: data.projects.length === 0,
    emailVisible: data.profile.email !== null && data.profile.email !== undefined,
    restricted: arrays.every((k) => data[k].length === 0),
    teamCount: data.teams.length,
    flagOff: data.profile.show_track_record === false,
  };
}

function describeState(s) {
  if (!s.shapeOk) return "unexpected response shape";
  return `shape ok, projects=${s.projectsEmpty ? "[]" : "NOT EMPTY"}, email=${s.emailVisible ? "visible" : "null"}, ${s.restricted ? "restricted" : `full (teams=${s.teamCount})`}`;
}

// -----------------------------------------------------------------------------
// Commands that never touch a database
// -----------------------------------------------------------------------------
function printHelp() {
  const src = fs.readFileSync(__filename, "utf8");
  const header = src.slice(src.indexOf("/**"), src.indexOf("*/", src.indexOf("/**")) + 2);
  console.log(header);
}

function printMatrix() {
  console.log("Phase 1 verification matrix (PRIORITIZED_ACTION_PLAN.md §1.7)\n");
  for (const [id, label, where, check] of MATRIX) {
    console.log(`${id.padEnd(13)} ${label.padEnd(23)} ${where}`);
    console.log(`${" ".repeat(14)}${check}`);
  }
}

function printChecklist() {
  console.log("MANUAL-PRODUCTION-FLOW checklist (founder-controlled accounts only)");
  console.log("  A = founder, owns an existing team (role = 'admin' for the admin case)");
  console.log("  B = joins A's team (teammate)    C = shares no team with A or B (stranger)");
  console.log("  Record only null vs non-null / empty vs non-empty. Never record field values.\n");
  for (const [id, label, , check] of MATRIX) {
    if (label === "MANUAL-PRODUCTION-FLOW") console.log(`[ ] ${id.padEnd(10)} ${check}`);
  }
}

function fingerprints() {
  const sql = fs.readFileSync(MIGRATION_1A, "utf8").replace(/\r\n/g, "\n");
  const postcheck = fs.existsSync(POSTCHECK_SQL) ? fs.readFileSync(POSTCHECK_SQL, "utf8") : "";
  let problems = 0;
  console.log("G-7 expected body fingerprints (md5 of the LF-normalised prosrc)\n");
  for (const name of ["add_user_to_team", "get_public_builder_profile", "check_rate_limit"]) {
    const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$`);
    const m = sql.match(re);
    if (!m) {
      console.log(`${name.padEnd(28)} body not found in migration 1A`);
      problems++;
      continue;
    }
    const body = m[1];
    const md5 = crypto.createHash("md5").update(body, "utf8").digest("hex");
    const inPostcheck = postcheck.includes(md5);
    console.log(`${name.padEnd(28)} ${md5}  ${inPostcheck ? "matches phase1_postcheck.sql" : "NOT FOUND in phase1_postcheck.sql"}`);
    if (!inPostcheck) problems++;
    if (name === "get_public_builder_profile") {
      for (const forbidden of ["team_projects", "is_admin", "p_caller_id"]) {
        if (body.includes(forbidden)) {
          console.log(`${" ".repeat(29)}FORBIDDEN token in body: ${forbidden}`);
          problems++;
        }
      }
      if (!body.includes("'projects', '[]'::jsonb")) {
        console.log(`${" ".repeat(29)}missing "'projects', '[]'::jsonb"`);
        problems++;
      }
    }
    if (/[^\x00-\x7F]/.test(body)) {
      console.log(`${" ".repeat(29)}body contains non-ASCII characters`);
      problems++;
    }
  }
  console.log(problems ? `\n${problems} problem(s)` : "\nok");
  process.exitCode = problems ? 1 : 0;
}

// -----------------------------------------------------------------------------
// PROD-SAFE mode
// -----------------------------------------------------------------------------
async function runProdSafe(stage) {
  const local = readEnvLocal();
  const pick = (k) => process.env[k] || local[k] || "";
  const url = pick("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = pick("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = process.env.AUTHZ_SERVICE_PROBE === "1" ? pick("SUPABASE_SERVICE_ROLE_KEY") : "";
  const siteUrl = (process.env.AUTHZ_SITE_URL || "").trim().replace(/\/+$/, "");
  const targetIds = (process.env.AUTHZ_TARGET_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

  if (!url || !anonKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    process.exit(2);
  }

  console.log("PROD-SAFE mode: read-only and zero-effect probes only. Nothing is written.");
  console.log(`target project ref: ${projectRefFromUrl(url) || "?"}   stage: ${stage}`);

  const { createClient } = require("@supabase/supabase-js");
  const anon = createClient(url, anonKey, NO_SESSION);
  const pre1a = stage === "baseline" || stage === "post-r1";
  const exposed = pre1a ? "permitted" : "denied";
  const report = new Report("prod-safe", stage);

  // F-5: reminder RPC. Zero rows requested, and only saved_id is selected, so no
  // email value can leave the database. Only the outcome and the count are kept.
  {
    const { error, count } = await anon
      .rpc("get_pending_deadline_reminders", {}, { count: "exact" })
      .select("saved_id")
      .limit(0);
    const outcome = outcomeOf(error);
    report.add(
      "F-5", "PROD-SAFE", "anon get_pending_deadline_reminders (zero rows, count only)",
      outcome === exposed,
      `${outcome}${outcome === "permitted" ? `, rows=${count ?? "?"}` : ""} (expected ${exposed})`
    );
  }
  if (serviceKey) {
    const service = createClient(url, serviceKey, NO_SESSION);
    const { error, count } = await service
      .rpc("get_pending_deadline_reminders", {}, { count: "exact" })
      .select("saved_id")
      .limit(0);
    const outcome = outcomeOf(error);
    report.add(
      "F-5", "PROD-SAFE", "service_role get_pending_deadline_reminders (zero rows, count only)",
      outcome === "permitted",
      `${outcome}${outcome === "permitted" ? `, rows=${count ?? "?"}` : ""} (expected permitted)`
    );
  } else {
    report.skip("F-5", "PROD-SAFE", "service_role get_pending_deadline_reminders", "set AUTHZ_SERVICE_PROBE=1 to run the count-only service_role probe");
  }

  // F-6: empty array only, so no row can match even where the call is permitted.
  {
    const { error } = await anon.rpc("mark_deadline_reminder_sent", { p_saved_ids: [] });
    report.expect("F-6", "PROD-SAFE", "anon mark_deadline_reminder_sent('{}')", outcomeOf(error), exposed);
  }

  // F-12: random UUID, read-only.
  {
    const { error } = await anon.rpc("is_admin", { user_id: crypto.randomUUID() });
    report.expect("F-12", "PROD-SAFE", "anon is_admin(<random uuid>)", outcomeOf(error), exposed);
  }

  // F-8 / F-15: never passes p_caller_id.
  {
    const { data, error } = await anon.rpc("get_public_builder_profile", { p_target_id: crypto.randomUUID() });
    report.add(
      "F-8", "PROD-SAFE", "anon get_public_builder_profile(<random uuid>) returns null",
      !error && data === null,
      error ? `error ${error.code}` : data === null ? "null" : "unexpected non-null result"
    );
  }
  if (targetIds.length === 0) {
    report.skip("F-15", "PROD-SAFE", "anon get_public_builder_profile(<existing targets>)", "set AUTHZ_TARGET_IDS to existing profile UUIDs");
  }
  for (const [i, id] of targetIds.entries()) {
    const { data, error } = await anon.rpc("get_public_builder_profile", { p_target_id: id });
    if (pre1a) {
      report.add(
        "F-15", "PROD-SAFE", `anon get_public_builder_profile(target #${i + 1}) fails with the known FUN-06 42P01`,
        Boolean(error) && error.code === "42P01",
        error ? `error ${error.code} (expected 42P01)` : "no error (expected the FUN-06 42P01 failure)"
      );
    } else {
      const s = trackRecordState(data);
      const flagRuleOk = !s.flagOff || s.restricted;
      report.add(
        "F-15", "PROD-SAFE", `anon get_public_builder_profile(target #${i + 1}): shape, projects [], email null, flag rule`,
        !error && s.shapeOk && s.projectsEmpty && !s.emailVisible && flagRuleOk,
        error ? `error ${error.code}` : `${describeState(s)}${s.flagOff ? ", show_track_record=false" : ""}`
      );
    }
  }

  // R-1 / R-2: the track-record route without cookies (anon visitor).
  if (!siteUrl) {
    report.skip("R-1", "PROD-SAFE", "track-record route probes", "set AUTHZ_SITE_URL to run R-1/R-2");
  } else {
    const get = async (id) => {
      const res = await fetch(`${siteUrl}/api/builder-track-record/${encodeURIComponent(id)}`, {
        headers: { accept: "application/json" },
        redirect: "manual",
      });
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { status: res.status, body };
    };

    const r1 = await get(crypto.randomUUID());
    report.add(
      "R-1", "PROD-SAFE", "GET track-record route for a nonexistent target",
      r1.status === 200 && r1.body && r1.body.success === true && r1.body.data === null,
      `HTTP ${r1.status}, success=${r1.body ? r1.body.success : "?"}, data=${r1.body && r1.body.data === null ? "null" : "not null"}`
    );

    if (targetIds.length === 0) {
      report.skip("R-2", "PROD-SAFE", "GET track-record route for existing targets", "set AUTHZ_TARGET_IDS");
    }
    for (const [i, id] of targetIds.entries()) {
      const r = await get(id);
      let ok;
      let expected;
      if (stage === "baseline") {
        expected = "200 {success:true,data:null} (pre-R1 masking of FUN-06)";
        ok = r.status === 200 && r.body && r.body.success === true && r.body.data === null;
      } else if (stage === "post-r1") {
        expected = "500 {success:false} (R1 error contract; FUN-06 still present)";
        ok = r.status === 500 && r.body && r.body.success === false;
      } else {
        expected = "200 {success:true} with data, projects [], email null";
        const s = trackRecordState(r.body ? r.body.data : null);
        ok = r.status === 200 && r.body && r.body.success === true && s.shapeOk && s.projectsEmpty && !s.emailVisible;
      }
      report.add(
        "R-2", "PROD-SAFE", `GET track-record route for target #${i + 1}`,
        Boolean(ok),
        `HTTP ${r.status}, success=${r.body ? r.body.success : "?"}; expected ${expected}`
      );
    }
  }

  report.print();
  console.log("\nCatalog checks: run scripts/sql/phase1_postcheck.sql (read-only).");
  console.log("MANUAL-PRODUCTION-FLOW rows: node scripts/verify-db-authz.js checklist");
  process.exitCode = report.failed ? 1 : 0;
}

// -----------------------------------------------------------------------------
// STAGING mode
// -----------------------------------------------------------------------------
function stagingProblems() {
  const problems = [];
  const local = readEnvLocal();
  const url = process.env.AUTHZ_STAGING_URL || "";
  const anonKey = process.env.AUTHZ_STAGING_ANON_KEY || "";
  const serviceKey = process.env.AUTHZ_STAGING_SERVICE_ROLE_KEY || "";

  if (process.env.AUTHZ_ALLOW_MUTATION !== "1") problems.push("AUTHZ_ALLOW_MUTATION=1 is not set (deliberate opt-in required)");
  if (!url) problems.push("AUTHZ_STAGING_URL is not set (staging mode never reads .env.local)");
  if (!anonKey) problems.push("AUTHZ_STAGING_ANON_KEY is not set");
  if (!serviceKey) problems.push("AUTHZ_STAGING_SERVICE_ROLE_KEY is not set");

  if (url) {
    const denied = new Set(PRODUCTION_PROJECT_REFS);
    for (const r of (process.env.AUTHZ_PROD_PROJECT_REFS || "").split(",")) {
      if (r.trim()) denied.add(r.trim().toLowerCase());
    }
    const prodUrls = [local.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].filter(Boolean);
    for (const u of prodUrls) {
      const r = projectRefFromUrl(u);
      if (r) denied.add(r);
    }
    const ref = projectRefFromUrl(url);
    const lowerUrl = url.toLowerCase();
    if (!ref) problems.push("AUTHZ_STAGING_URL is not a valid URL");
    if ((ref && denied.has(ref)) || [...denied].some((r) => lowerUrl.includes(r))) {
      problems.push("AUTHZ_STAGING_URL points at HackerMate production (or at the .env.local project); refusing");
    }
    if (prodUrls.some((u) => normalizeUrl(u) === normalizeUrl(url))) {
      problems.push("AUTHZ_STAGING_URL equals the .env.local / NEXT_PUBLIC_SUPABASE_URL value; refusing");
    }
  }
  const prodKeys = [
    local.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    local.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter(Boolean);
  if ((anonKey && prodKeys.includes(anonKey)) || (serviceKey && prodKeys.includes(serviceKey))) {
    problems.push("a staging key equals a .env.local / production key; refusing");
  }
  return problems;
}

async function createTestUser(admin, newClient, runId, role, created) {
  const email = `authz-test-${runId}-${role}@example.invalid`;
  const password = crypto.randomBytes(24).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `authz-test ${role}` },
  });
  if (error || !data || !data.user) throw new Error(`createUser(${role}) failed: ${error ? error.message : "no user"}`);
  created.users.push(data.user.id);
  const client = newClient();
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signInWithPassword(${role}) failed: ${signInErr.message}`);
  return { id: data.user.id, client };
}

// Keeps the test users "online" so the offline-notification trigger doesn't
// try to email the @example.invalid addresses.
async function keepOnline(admin, ids) {
  if (ids.length === 0) return;
  await admin.from("profiles").update({ last_seen_at: new Date().toISOString() }).in("id", ids);
}

async function memberRole(admin, teamId, userId) {
  const { data } = await admin.from("team_members").select("role").eq("team_id", teamId).eq("user_id", userId).maybeSingle();
  return data ? data.role : null;
}

async function isParticipant(admin, conversationId, userId) {
  if (!conversationId) return false;
  const { data } = await admin
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

async function cleanup(admin, created, report) {
  const warnings = [];
  const step = async (label, fn) => {
    try {
      const res = await fn();
      if (res && res.error) warnings.push(`${label}: ${res.error.message}`);
    } catch (e) {
      warnings.push(`${label}: ${e.message}`);
    }
  };
  const users = created.users.filter(Boolean);
  const convs = created.conversations.filter(Boolean);
  const teams = created.teams.filter(Boolean);

  // Every delete is scoped to IDs or keys this run created.
  if (created.rateLimitKeys.length) {
    await step("rate_limits", () => admin.from("rate_limits").delete().in("ip", created.rateLimitKeys));
  }
  if (convs.length) {
    let messageIds = [];
    try {
      const { data } = await admin.from("messages").select("id").in("conversation_id", convs);
      messageIds = (data || []).map((m) => m.id);
    } catch (e) {
      warnings.push(`messages lookup: ${e.message}`);
    }
    if (messageIds.length) {
      await step("message_reactions", () => admin.from("message_reactions").delete().in("message_id", messageIds));
    }
    await step("messages", () => admin.from("messages").delete().in("conversation_id", convs));
    await step("conversation_participants", () => admin.from("conversation_participants").delete().in("conversation_id", convs));
    await step("conversations", () => admin.from("conversations").delete().in("id", convs));
  }
  if (teams.length) {
    await step("team_invites", () => admin.from("team_invites").delete().in("team_id", teams));
    await step("team_join_requests", () => admin.from("team_join_requests").delete().in("team_id", teams));
    await step("team_members", () => admin.from("team_members").delete().in("team_id", teams));
    await step("teams", () => admin.from("teams").delete().in("id", teams));
  }
  if (users.length) {
    await step("friend_requests (sender)", () => admin.from("friend_requests").delete().in("sender_id", users));
    await step("friend_requests (receiver)", () => admin.from("friend_requests").delete().in("receiver_id", users));
    await step("notifications", () => admin.from("notifications").delete().in("user_id", users));
    for (const id of users) {
      await step(`auth user ${id.slice(0, 8)}`, async () => {
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error && !/not.?found/i.test(error.message)) return { error };
        return {};
      });
    }
    await step("profiles (leftovers)", () => admin.from("profiles").delete().in("id", users));
  }
  report.add("CLEANUP", "STAGING-ONLY", "delete every row this run created", warnings.length === 0, warnings.length ? warnings.join("; ") : "ok");
}

async function runStaging(stage) {
  const problems = stagingProblems();
  if (problems.length) {
    console.error("Refusing to run staging mode:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(2);
  }
  if (stage !== "post-1a" && stage !== "post-1b") {
    console.error("Staging tests target the post-1A / post-1B state. Apply the migrations to staging, then use --stage=post-1a or --stage=post-1b.");
    process.exit(2);
  }

  const url = process.env.AUTHZ_STAGING_URL;
  const anonKey = process.env.AUTHZ_STAGING_ANON_KEY;
  const serviceKey = process.env.AUTHZ_STAGING_SERVICE_ROLE_KEY;
  console.log("STAGING mode: creates and deletes throwaway test data in a NON-PRODUCTION database.");
  console.log(`target project ref: ${projectRefFromUrl(url)}   stage: ${stage}`);

  const { createClient } = require("@supabase/supabase-js");
  const admin = createClient(url, serviceKey, NO_SESSION);
  const anon = createClient(url, anonKey, NO_SESSION);
  const newClient = () => createClient(url, anonKey, NO_SESSION);
  const runId = crypto.randomBytes(4).toString("hex");
  const created = { users: [], teams: [], conversations: [], rateLimitKeys: [] };
  const report = new Report("staging", stage);
  const S = "STAGING-ONLY";
  const rand = () => crypto.randomUUID();

  try {
    // ---- Setup ------------------------------------------------------------
    const A = await createTestUser(admin, newClient, runId, "owner", created);
    const B = await createTestUser(admin, newClient, runId, "invitee", created);
    const C = await createTestUser(admin, newClient, runId, "stranger", created);
    const D = await createTestUser(admin, newClient, runId, "requester", created);
    const L = await createTestUser(admin, newClient, runId, "linkjoiner", created);
    const E = await createTestUser(admin, newClient, runId, "admin", created);
    await keepOnline(admin, created.users);

    const { data: teamId, error: teamErr } = await A.client.rpc("create_team_with_owner", {
      p_name: `test-authz-${runId}`,
      p_description: "Phase 1 authorization harness (staging only)",
      p_max_members: 6,
      p_college: null,
      p_hackathon_id: null,
      p_hackathon_name: null,
      p_skills: [],
      p_roles_needed: [],
    });
    if (teamErr || !teamId) throw new Error(`create_team_with_owner failed: ${teamErr ? teamErr.message : "no id"}`);
    created.teams.push(teamId);
    const { data: convRow } = await admin
      .from("conversations")
      .select("id")
      .eq("team_id", teamId)
      .eq("type", "team")
      .limit(1)
      .maybeSingle();
    const teamConvId = convRow ? convRow.id : null;
    if (teamConvId) created.conversations.push(teamConvId);

    await admin.from("profiles").update({ role: "admin" }).eq("id", E.id);
    const { data: eRow } = await admin.from("profiles").select("role").eq("id", E.id).maybeSingle();
    const adminReady = Boolean(eRow && eRow.role === "admin");

    // ---- F-1s: direct add_user_to_team is denied ---------------------------
    {
      const { error } = await B.client.rpc("add_user_to_team", { p_team_id: teamId, p_user_id: B.id, p_role: "owner" });
      report.expect("F-1s", S, "authenticated non-owner add_user_to_team(team, self, 'owner')", outcomeOf(error), "denied");
      const { error: anonErr } = await anon.rpc("add_user_to_team", { p_team_id: teamId, p_user_id: rand(), p_role: "member" });
      report.expect("F-1s", S, "anon add_user_to_team", outcomeOf(anonErr), "denied");
    }

    // ---- F-2s: invite -> accept ---------------------------------------------
    {
      await keepOnline(admin, created.users);
      const inv = await A.client.rpc("send_team_invite", { p_team_id: teamId, p_invited_user_id: B.id });
      const acc = inv.error ? null : await B.client.rpc("accept_team_invite", { p_invite_id: inv.data });
      const role = await memberRole(admin, teamId, B.id);
      const part = await isParticipant(admin, teamConvId, B.id);
      report.add(
        "F-2s", S, "owner invites B, B accepts",
        !inv.error && acc && !acc.error && role === "member" && part,
        `invite=${outcomeOf(inv.error)}, accept=${acc ? outcomeOf(acc.error) : "not run"}, role=${role}, participant=${part}`
      );
    }

    // ---- F-3s: join request -> owner accepts ---------------------------------
    {
      await keepOnline(admin, created.users);
      const req = await D.client.rpc("request_to_join_team", { p_team_id: teamId });
      const { data: reqRow } = await admin
        .from("team_join_requests")
        .select("id")
        .eq("team_id", teamId)
        .eq("user_id", D.id)
        .limit(1)
        .maybeSingle();
      const acc = reqRow ? await A.client.rpc("accept_team_join_request", { p_request_id: reqRow.id }) : null;
      const role = await memberRole(admin, teamId, D.id);
      report.add(
        "F-3s", S, "D requests to join, owner accepts",
        !req.error && acc && !acc.error && role === "member",
        `request=${outcomeOf(req.error)}, accept=${acc ? outcomeOf(acc.error) : "no request row"}, role=${role}`
      );
    }

    // ---- F-4: signed-link join ----------------------------------------------
    {
      const tok = await A.client.rpc("generate_team_invite_token", { p_team_id: teamId });
      const join = tok.error ? null : await L.client.rpc("join_team_instantly", { p_team_id: teamId, p_token: tok.data });
      const role = await memberRole(admin, teamId, L.id);
      report.add(
        "F-4", S, "owner generates a token, L joins instantly",
        !tok.error && join && !join.error && role === "member",
        `token=${outcomeOf(tok.error)}, join=${join ? outcomeOf(join.error) : "not run"}, role=${role}`
      );
    }

    // ---- F-5s / F-6s: reminder RPCs -----------------------------------------
    {
      const q = (client) => client.rpc("get_pending_deadline_reminders", {}, { count: "exact" }).select("saved_id").limit(0);
      report.expect("F-5s", S, "anon get_pending_deadline_reminders", outcomeOf((await q(anon)).error), "denied");
      report.expect("F-5s", S, "authenticated get_pending_deadline_reminders", outcomeOf((await q(A.client)).error), "denied");
      const svc = await q(admin);
      report.add("F-5s", S, "service_role get_pending_deadline_reminders (count only)", !svc.error, `${outcomeOf(svc.error)}, rows=${svc.count ?? "?"}`);
      report.expect("F-6s", S, "anon mark_deadline_reminder_sent('{}')", outcomeOf((await anon.rpc("mark_deadline_reminder_sent", { p_saved_ids: [] })).error), "denied");
      report.expect("F-6s", S, "authenticated mark_deadline_reminder_sent('{}')", outcomeOf((await A.client.rpc("mark_deadline_reminder_sent", { p_saved_ids: [] })).error), "denied");
    }

    // ---- F-7s: atomic rate limiter ------------------------------------------
    {
      const key = `authz-test-${runId}-rl`;
      created.rateLimitKeys.push(key);
      const N = 3;
      const args = { p_ip: key, p_limit: N, p_window_interval: "1 hour" };
      const calls = await Promise.all(Array.from({ length: N + 1 }, () => admin.rpc("check_rate_limit", args)));
      const errors = calls.filter((c) => c.error).length;
      const allowed = calls.filter((c) => !c.error && Array.isArray(c.data) && c.data[0] && c.data[0].allowed === true).length;
      report.add("F-7s", S, `${N + 1} concurrent check_rate_limit calls with limit ${N}`, errors === 0 && allowed === N, `allowed=${allowed}, errors=${errors} (expected allowed=${N}, errors=0)`);
      report.expect("F-7s", S, "anon check_rate_limit", outcomeOf((await anon.rpc("check_rate_limit", args)).error), "denied");
      report.expect("F-7s", S, "authenticated check_rate_limit", outcomeOf((await A.client.rpc("check_rate_limit", args)).error), "denied");
    }

    // ---- F-8s: track record, flag on ----------------------------------------
    const viewAs = async (client) => client.rpc("get_public_builder_profile", { p_target_id: A.id });
    const trackCase = async (id, who, client, expectEmail, expectFull) => {
      const { data, error } = await viewAs(client);
      const s = trackRecordState(data);
      const ok = !error && s.shapeOk && s.projectsEmpty && s.emailVisible === expectEmail && (expectFull ? !s.restricted && s.teamCount > 0 : s.restricted);
      report.add(
        id, S, `${who}: email ${expectEmail ? "shown" : "null"}, ${expectFull ? "full" : "restricted"}, projects []`,
        ok,
        error ? `error ${error.code}` : describeState(s)
      );
    };
    await trackCase("F-8s", "flag on, target (self)", A.client, true, true);
    await trackCase("F-8s", "flag on, teammate", B.client, true, true);
    await trackCase("F-8s", "flag on, stranger", C.client, false, true);
    await trackCase("F-8s", "flag on, anon", anon, false, true);
    if (adminReady) await trackCase("F-8s", "flag on, admin (not a teammate)", E.client, false, true);
    else report.skip("F-8s", S, "flag on, admin (not a teammate)", "could not give the test user role = 'admin' in staging");

    // ---- F-16s: track record, flag off --------------------------------------
    {
      const { error: flagErr } = await admin.from("profiles").update({ show_track_record: false }).eq("id", A.id);
      if (flagErr) {
        report.add("F-16s", S, "set show_track_record = false on the target", false, flagErr.message);
      } else {
        await trackCase("F-16s", "flag off, anon", anon, false, false);
        await trackCase("F-16s", "flag off, stranger", C.client, false, false);
        await trackCase("F-16s", "flag off, teammate", B.client, true, false);
        if (adminReady) await trackCase("F-16s", "flag off, admin (not a teammate)", E.client, false, false);
        else report.skip("F-16s", S, "flag off, admin (not a teammate)", "could not give the test user role = 'admin' in staging");
        await trackCase("F-16s", "flag off, target (self)", A.client, true, true);
        await admin.from("profiles").update({ show_track_record: true }).eq("id", A.id);
      }
    }

    // ---- F-9: dropped email RPCs ---------------------------------------------
    {
      const { error } = await anon.rpc("get_authorized_profile_email", { p_target_user_id: rand() });
      report.expect("F-9", S, "get_authorized_profile_email is gone", outcomeOf(error), "not-found");
    }

    // ---- F-10s: participant injection ----------------------------------------
    if (teamConvId) {
      const { error } = await C.client.from("conversation_participants").insert({ conversation_id: teamConvId, user_id: C.id });
      report.add("F-10s", S, "stranger inserts itself into the team conversation", Boolean(error), error ? `denied (${error.code})` : "INSERT SUCCEEDED (policy still present?)");
    } else {
      report.skip("F-10s", S, "direct participant insert", "team conversation not found");
    }

    // ---- F-11s: anon denial per function -------------------------------------
    {
      const calls = [
        ["delete_message", { p_message_id: rand() }],
        ["delete_user_completely", { p_target_user_id: rand() }],
        ["generate_team_invite_token", { p_team_id: rand() }],
        ["join_team_instantly", { p_team_id: rand(), p_token: "authz-test" }],
        ["record_daily_visit", {}],
        ["send_connection_request", { p_receiver_id: rand(), p_message: null }],
        ["send_message_with_mentions", { p_conversation_id: rand(), p_content: "authz-test", p_mentions: [] }],
        ["toggle_message_reaction", { p_message_id: rand(), p_emoji: "\u{1F44D}" }],
        ["is_admin", { user_id: rand() }],
      ];
      for (const [fn, fnArgs] of calls) {
        const { error } = await anon.rpc(fn, fnArgs);
        report.expect("F-11s", S, `anon ${fn}`, outcomeOf(error), "denied");
      }
    }

    // ---- F-11s / F-10s: authenticated flows still work -------------------------
    {
      await keepOnline(admin, created.users);
      const cr = await C.client.rpc("send_connection_request", { p_receiver_id: A.id, p_message: null });
      let requestId = typeof cr.data === "string" ? cr.data : null;
      if (!requestId) {
        const { data: fr } = await admin.from("friend_requests").select("id").eq("sender_id", C.id).eq("receiver_id", A.id).limit(1).maybeSingle();
        requestId = fr ? fr.id : null;
      }
      const ac = requestId ? await A.client.rpc("accept_connection_request", { p_request_id: requestId }) : null;
      report.add("F-11s", S, "send_connection_request + accept_connection_request", !cr.error && ac && !ac.error, `send=${outcomeOf(cr.error)}, accept=${ac ? outcomeOf(ac.error) : "no request row"}`);

      const dm = await A.client.rpc("get_or_create_dm", { other_user_id: C.id });
      if (typeof dm.data === "string") created.conversations.push(dm.data);
      const dmOk = !dm.error && typeof dm.data === "string" && (await isParticipant(admin, dm.data, A.id)) && (await isParticipant(admin, dm.data, C.id));
      report.add("F-10s", S, "get_or_create_dm still adds both participants", dmOk, `dm=${outcomeOf(dm.error)}`);

      if (teamConvId) {
        const sent = await B.client.rpc("send_message_with_mentions", { p_conversation_id: teamConvId, p_content: `authz harness message ${runId}`, p_mentions: [] });
        const { data: msg } = await admin.from("messages").select("id").eq("conversation_id", teamConvId).eq("sender_id", B.id).limit(1).maybeSingle();
        const msgId = msg ? msg.id : null;
        const react = msgId ? await A.client.rpc("toggle_message_reaction", { p_message_id: msgId, p_emoji: "\u{1F44D}" }) : null;
        const del = msgId ? await B.client.rpc("delete_message", { p_message_id: msgId }) : null;
        report.add(
          "F-11s", S, "send message, react, delete own message",
          !sent.error && react && !react.error && del && !del.error,
          `send=${outcomeOf(sent.error)}, react=${react ? outcomeOf(react.error) : "no message"}, delete=${del ? outcomeOf(del.error) : "no message"}`
        );
      }

      const visit = await A.client.rpc("record_daily_visit");
      report.add("F-11s", S, "record_daily_visit", !visit.error, outcomeOf(visit.error));
    }

    // ---- F-13s: streak maintenance --------------------------------------------
    {
      report.expect("F-13s", S, "authenticated cleanup_lapsed_streaks", outcomeOf((await A.client.rpc("cleanup_lapsed_streaks")).error), "denied");
      const svc = await admin.rpc("cleanup_lapsed_streaks");
      report.add("F-13s", S, "service_role cleanup_lapsed_streaks (staging data only)", !svc.error, outcomeOf(svc.error));
    }

    // ---- P-11s..P-13s: protected profile columns (after 1B) --------------------
    if (stage === "post-1b") {
      const now = new Date().toISOString();
      const attempts = [
        ["P-11s", "email", `authz-changed-${runId}@example.invalid`],
        ["P-12s", "role", "admin"],
        ["P-12s", "is_banned", true],
        ["P-13s", "current_streak", 99],
        ["P-13s", "longest_streak", 99],
        ["P-13s", "last_active_date", "2000-01-01"],
        ["P-13s", "onboarding_nudge_sent_at", now],
        ["P-13s", "last_onboarding_nudge_sent_at", now],
        ["P-13s", "profile_nudge_count", 99],
        ["P-13s", "last_nudge_sent_at", now],
        ["P-13s", "sih_broadcast_sent_at", now],
        ["P-13s", "created_at", "2000-01-01T00:00:00Z"],
        ["P-13s", "username", `authz-${runId}`],
        ["P-13s", "full_name", "authz changed"],
      ];
      for (const [id, col, value] of attempts) {
        const { error } = await A.client.from("profiles").update({ [col]: value }).eq("id", A.id);
        report.expect(id, S, `authenticated UPDATE own profiles.${col}`, outcomeOf(error), "denied");
      }
      const bio = `authz bio ${runId}`;
      const { error: bioErr } = await A.client.from("profiles").update({ bio }).eq("id", A.id);
      const { data: bioRow } = await admin.from("profiles").select("bio").eq("id", A.id).maybeSingle();
      report.add("P-1s", S, "authenticated UPDATE own profiles.bio (whitelisted) persists", !bioErr && bioRow && bioRow.bio === bio, outcomeOf(bioErr));
    } else {
      report.skip("P-11s", S, "protected profile columns", "run with --stage=post-1b after applying 1B to staging");
    }

    // ---- F-11s: delete a test account (last use of L) ---------------------------
    {
      const del = await L.client.rpc("delete_user_completely", { p_target_user_id: L.id });
      const { data: after } = await admin.auth.admin.getUserById(L.id);
      const gone = !after || !after.user;
      report.add("F-11s", S, "delete_user_completely on own test account", !del.error && gone, `delete=${outcomeOf(del.error)}, auth user ${gone ? "gone" : "still present"}`);
    }
  } catch (err) {
    report.add("SETUP", S, "harness run", false, `aborted: ${err.message}`);
  } finally {
    await cleanup(admin, created, report);
  }

  report.print();
  process.exitCode = report.failed ? 1 : 0;
}

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  let command = "run";
  let mode = "prod-safe";
  let stage = null;
  for (const arg of argv) {
    if (["help", "--help", "-h"].includes(arg)) command = "help";
    else if (["matrix", "checklist", "fingerprints"].includes(arg)) command = arg;
    else if (arg.startsWith("--mode=")) mode = arg.slice("--mode=".length);
    else if (arg.startsWith("--stage=")) stage = arg.slice("--stage=".length);
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }

  if (command === "help") return printHelp();
  if (command === "matrix") return printMatrix();
  if (command === "checklist") return printChecklist();
  if (command === "fingerprints") return fingerprints();

  if (!stage || !STAGES.includes(stage)) {
    console.error(`--stage is required: one of ${STAGES.join(", ")}. Run with "help" for details.`);
    process.exit(2);
  }
  if (mode === "prod-safe") return runProdSafe(stage);
  if (mode === "staging") return runStaging(stage);
  console.error(`Unknown --mode=${mode} (use prod-safe or staging).`);
  process.exit(2);
}

main().catch((err) => {
  console.error("verify-db-authz failed:", err && err.message ? err.message : err);
  process.exit(1);
});
