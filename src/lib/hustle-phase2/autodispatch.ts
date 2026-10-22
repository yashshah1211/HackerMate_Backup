import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { enabled, json, type Team } from "./server";
import { deliveryConfig, deliveryEnabled, deliveryEntries, providerGet, providerPreflight } from "./delivery";
import { PARTICIPANT_DELIVERY_AT, sha256, submitInvitation } from "./delivery-core";
import { EVENT_ID } from "./core";
import { inspectScheduleInventory } from "./delivery-inventory";

export const AUTODISPATCH_SOURCE_APPROVED = true; // Source reviewed for launch; production still requires separate env, manifest and communication approvals.
const START = Date.parse("2026-10-23T00:45:00Z"), END = Date.parse("2026-10-23T01:45:00Z");
const IO_MS = 1_000, BUDGET_MS = 270_000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function cronAuthenticated(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && secret.length >= 32 && !!header
    && timingSafeEqual(Buffer.from(sha256(header), "hex"), Buffer.from(sha256(`Bearer ${secret}`), "hex"));
}
export function autodispatchEnabled() {
  return AUTODISPATCH_SOURCE_APPROVED && enabled() && deliveryEnabled()
    && process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production"
    && process.env.VERCEL_PROJECT_ID === "prj_dXTET08w44oZnkTBXh72Nu9nqACT"
    && process.env.HUSTLE_PHASE2_AUTODISPATCH_ENABLED === "true"
    && process.env.HUSTLE_PHASE2_AUTODISPATCH_RELEASE_APPROVED === "true"
    && process.env.HUSTLE_PHASE2_EARLY_PROVIDER_SUBMISSION_APPROVED === "true";
}
type Report = { deliveries: { team_id: string; status: string; provider_id: string | null }[] };
type Batch = { id: string; source_digest: string; row_count: number; activated_at: string | null };

/** GET metadata only. Pending participant schedules are never cancelled/repaired here. */
export async function verifyNoOldSchedules() {
  return inspectScheduleInventory((after, timeout) => providerGet(`/emails?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`, timeout));
}

export const CANARY_DELIVERY_AT = "2026-10-23T00:15:00.000Z"; // 05:45 IST; created tonight, after-reset delivery.
const emptyRecipients = (value: unknown) => value === null || (Array.isArray(value) && value.length === 0);
/** Exact system-provided deployment URL, never a request-derived wildcard allowlist. */
export function cronHostAllowed(value: string) {
  const host = process.env.VERCEL_URL || "";
  if (!/^hacker-mate-backup-[a-z0-9]{6,32}-yashshah1211s-projects\.vercel\.app$/.test(host)) return false;
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === host && !url.port && !url.username && !url.password; }
  catch { return false; }
}

/** A separately authorized, nonparticipant scheduling canary must already be delivered. */
export async function verifyCanary(leaderEmails: Set<string>, sender: string, now: number) {
  const id = process.env.HUSTLE_PHASE2_CANARY_ID || "", email = process.env.HUSTLE_PHASE2_CANARY_EMAIL || "";
  const schedule = process.env.HUSTLE_PHASE2_CANARY_SCHEDULED_AT || "";
  const reset = Date.parse(process.env.HUSTLE_PHASE2_EXPECTED_RESET_AT || "");
  if (process.env.HUSTLE_PHASE2_CANARY_APPROVED !== "true" || !UUID.test(id) || leaderEmails.has(email)
    || email !== email.trim().toLowerCase() || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw Error("Approved nonparticipant canary required.");
  const c = await providerGet(`/emails/${id}`, IO_MS);
  if (c.id !== id || c.last_event !== "delivered" || c.from !== sender || JSON.stringify(c.to) !== JSON.stringify([email])
    || c.subject !== "HackerMate scheduling canary — no participant invitation"
    || !emptyRecipients(c.cc) || !emptyRecipients(c.bcc)
    || schedule !== CANARY_DELIVERY_AT || Date.parse(schedule) !== Date.parse(c.scheduled_at)
    || !Number.isFinite(Date.parse(c.created_at)) || Date.parse(c.created_at) >= Date.parse(schedule) || Date.parse(schedule) >= now
    || Date.parse(c.created_at) < Date.parse("2026-10-22T17:00:00Z") || !Number.isFinite(reset)
    || Date.parse(c.created_at) >= reset || Date.parse(schedule) <= reset) throw Error("Canary scheduling proof unavailable.");
}

/** One invocation only. Its durable claim is consumed by every subsequent failure. */
export async function runAutodispatch() {
  const started = Date.now(), deadline = started + BUDGET_MS;
  const guardBudget = () => { if (Date.now() > deadline - 5_000) throw Error("Execution budget exhausted."); };
  const actor = process.env.HUSTLE_PHASE2_AUTODISPATCH_ADMIN_ID || "";
  if (!UUID.test(actor)) throw Error("Approved background administrator required.");
  const { manifest, from, secret } = deliveryConfig();
  if (manifest.batches.length !== 2 || manifest.batches.map(b => b.count).sort((a,b) => a-b).join() !== "9,42") throw Error("Exact 42 plus 9 batch approval required.");
  // No browser session is impersonated: explicitly delegated background authority,
  // current Auth identity and SQL founder/admin+ban checks on every mutation.
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => { guardBudget(); return fetch(input, { ...init, signal: AbortSignal.timeout(IO_MS) }); } },
  });
  const { data: user, error: authError } = await db.auth.admin.getUserById(actor);
  if (authError) { console.error("[hustle-autodispatch] Auth lookup failed", { code: authError.code }); throw Error("Background identity unavailable."); }
  if (user.user?.id !== actor || user.user.is_anonymous !== false || !user.user.email_confirmed_at
    || (user.user.banned_until && (!Number.isFinite(Date.parse(user.user.banned_until)) || Date.parse(user.user.banned_until) > started))) throw Error("Verified background identity required.");
  const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    guardBudget(); const { data, error } = await db.rpc(name, args);
    if (error) { console.error("[hustle-autodispatch] RPC failed", { operation: name, code: error.code }); throw Error("Database operation unresolved."); }
    if (data === null) throw Error("Database acknowledgement missing.");
    return data as T;
  };
  const manifestHash = sha256(JSON.stringify(manifest));
  const claimed = await rpc<boolean>("hustle_phase2_autodispatch_claim", { p_actor: actor, p_manifest: manifestHash });
  if (claimed !== true) throw Error("One-time job already consumed; no retry.");
  let problem: string | null = null;
  try {
    const reset = Date.parse(process.env.HUSTLE_PHASE2_EXPECTED_RESET_AT || "");
    const usage = await providerPreflight(52, IO_MS);
    if (!Number.isFinite(reset) || reset < Date.parse("2026-10-22T17:00:00Z") || reset >= START
      || started <= reset || !Number.isFinite(Date.parse(usage.resetAt)) || Date.parse(usage.resetAt) <= started
      || !Number.isInteger(usage.rateLimit?.limit) || usage.rateLimit.limit < 10 || usage.rateLimit?.duration !== "1000ms") throw Error("Reset or rate-limit proof unavailable.");
    await verifyNoOldSchedules();
    const teamResult = await db.from("hustle_phase2_teams").select("id,batch_id,team_name,leader_email,decision").eq("event_id", EVENT_ID).retry(false);
    const batchResult = await db.from("hustle_phase2_batches").select("id,source_digest,row_count,activated_at").eq("event_id", EVENT_ID).retry(false);
    if (teamResult.error || batchResult.error) {
      console.error("[hustle-autodispatch] Scope lookup failed", { teamCode: teamResult.error?.code, batchCode: batchResult.error?.code }); throw Error("Scope unavailable.");
    }
    const teams = teamResult.data as Team[], batches = batchResult.data as Batch[];
    if (teams.length !== 51 || batches.length !== 2 || teams.some(t => t.decision !== "pending")
      || new Set(teams.map(t => t.leader_email)).size !== 51
      || manifest.batches.some(b => !batches.some(x => x.id === b.batchId && x.source_digest === b.digest && x.row_count === b.count && x.activated_at === null))) throw Error("Approved inactive roster mismatch.");
    const before = await rpc<Report>("hustle_phase2_delivery_report", { p_actor: actor });
    if (before.deliveries.length) throw Error("Existing deliveries require reconciliation.");
    await verifyCanary(new Set(teams.map(t => t.leader_email)), from, started);
    const rows = manifest.batches.flatMap(b => deliveryEntries(b, teams, secret, from, PARTICIPANT_DELIVERY_AT));
    for (const batch of manifest.batches) {
      await rpc("hustle_phase2_delivery_prepare", { p_actor: actor, p_batch: batch.batchId, p_digest: batch.digest, p_count: batch.count,
        p_scheduled: PARTICIPANT_DELIVERY_AT, p_entries: rows.filter(r => r.team.batch_id === batch.batchId).map(({ team_id, token_hash, payload_hash }) => ({ team_id, token_hash, payload_hash })) });
    }
    const verified = new Map<string, string>();
    for (const row of rows) {
      guardBudget();
      const reservation = await rpc<{ id: string } | false>("hustle_phase2_delivery_claim", { p_actor: actor, p_team: row.team_id, p_hash: row.token_hash, p_payload: row.payload_hash });
      if (!reservation || !UUID.test(reservation.id)) throw Error("Delivery reservation unresolved.");
      const outcome = await submitInvitation(process.env.RESEND_API_KEY!.trim(), row.message, reservation.id, IO_MS);
      problem = outcome.providerId;
      await rpc("hustle_phase2_delivery_finish", { p_actor: actor, p_team: row.team_id, p_status: outcome.status,
        p_provider: outcome.status === "accepted" ? outcome.providerId : null, p_code: outcome.code });
      if (outcome.status !== "accepted" || !outcome.providerId || [...verified.values()].includes(outcome.providerId)) throw Error("Provider scheduling unresolved.");
      verified.set(row.team_id, outcome.providerId); problem = null;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const after = await rpc<Report>("hustle_phase2_delivery_report", { p_actor: actor });
    if (verified.size !== 51 || after.deliveries.length !== 51 || new Set(after.deliveries.map(d => d.team_id)).size !== 51
      || after.deliveries.some(d => d.status !== "accepted" || verified.get(d.team_id) !== d.provider_id)) throw Error("Final ledger reconciliation failed.");
    await rpc("hustle_phase2_autodispatch_finish", { p_actor: actor, p_manifest: manifestHash, p_complete: true, p_problem: null });
    return { scheduled: 51, scheduledAt: PARTICIPANT_DELIVERY_AT, inboxDeliveryVerified: false };
  } catch {
    // A failed finish leaves running = consumed. Neither state can ever be reclaimed.
    try { await rpc("hustle_phase2_autodispatch_finish", { p_actor: actor, p_manifest: manifestHash, p_complete: false, p_problem: problem }); }
    catch { console.error("[hustle-autodispatch] Job outcome unresolved; STOP, no retry."); }
    throw Error("Autodispatch stopped; reconcile before any further operation.");
  }
}

export async function handleAutodispatch(request: Request) {
  if (!cronAuthenticated(request.headers.get("authorization"))) return json({ error: "Unauthorized" }, 401);
  if (!autodispatchEnabled()) return json({ error: "Autodispatch approval is OFF" }, 503);
  if (new URL(request.url).search || !cronHostAllowed(request.url)
    || Date.now() < START || Date.now() >= END) return json({ error: "Job scope or date rejected" }, 409);
  try { return json(await runAutodispatch()); }
  catch { return json({ error: "STOP: job unavailable or consumed; no automatic retry" }, 503); }
}
