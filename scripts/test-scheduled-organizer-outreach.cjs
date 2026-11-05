/* eslint-disable @typescript-eslint/no-require-imports -- Offline guarded outreach tests. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { harness } = require("./ppt-vision-harness.cjs");

const validUrl = "https://unstop.com/competitions/fixture-hackathon-12345";
const nextUrl = "https://unstop.com/competitions/another-hackathon-12346";
const now = new Date("2026-11-06T05:17:00Z");
const originalLead = () => ({
  id: "lead-a", title: "Fixture Hackathon", status: "new",
  organizer_email: "organizer@example.org", unstop_url: validUrl,
  last_sent_to: null, pitch_sent_at: null,
  notes: "[HACKERMATE_OUTREACH_APPROVED_V1]",
});

function setup(options = {}) {
  const leads = (options.leads || [originalLead()]).map(x => ({ ...x }));
  const state = { leads, claims: new Map(), sends: [], budgetChecks: 0, counter: 0 };
  const h = harness({
    "@/lib/emailDispatch": {
      dispatchEmail: async payload => {
        state.sends.push(payload);
        return options.provider || {
          attempted: true, intendedRecipientAccepted: true, sandbox: false,
          status: "accepted", reason: "Provider accepted", retrySafe: false,
        };
      },
    },
    "@/lib/admin/emailBudgetGuard": {
      checkEmailBudget: async () => {
        state.budgetChecks++;
        if (options.budgetUnavailable) throw new Error("Budget unavailable");
        return { allowedCount: options.allowedCount ?? 5 };
      },
      recordEmailSendSuccess: async () => {
        state.counter++;
        return { status: options.accountingFailure ? "failed" : "recorded" };
      },
    },
  });
  if (!options.noProvider) {
    h.env.RESEND_API_KEY = "offline-not-real-key";
    h.env.RESEND_FROM_EMAIL = options.sender || "HackerMate <team@hackermate.in>";
  }

  const db = {
    from(table) {
      assert.ok(["app_settings", "organizer_leads"].includes(table));
      let action = "read", payload, id, status, email, nullTime, start, end, selected;
      const build = {
        select() { selected = true; return build; },
        order() { return build; },
        range(a, b) { start = a; end = b; return build; },
        eq(col, value) {
          if (col === "id") id = value;
          if (col === "status") status = value;
          if (col === "organizer_email") email = value;
          if (col === "key") id = value;
          return build;
        },
        is(col, value) { if (col === "pitch_sent_at") nullTime = value; return build; },
        maybeSingle() {
          const found = state.leads.find(x => x.id === id);
          return Promise.resolve({ data: found || null, error: options.freshReadFailure ? { code: "NO_READ" } : null });
        },
        insert(record) {
          if (table !== "app_settings") throw Error("Unexpected insert table");
          if (options.claimUnavailable) return Promise.resolve({ error: { code: "42501" } });
          if (state.claims.has(record.key)) return Promise.resolve({ error: { code: "23505" } });
          state.claims.set(record.key, record.value);
          return Promise.resolve({ error: null });
        },
        update(record) { action = "update"; payload = record; return build; },
        then(resolve, reject) {
          let response;
          if (table === "organizer_leads" && action === "read") {
            response = options.crmReadFailure
              ? { error: { code: "NO_READ" }, data: null }
              : { error: null, data: state.leads.slice(start || 0, end === undefined ? undefined : end + 1) };
          } else if (table === "organizer_leads" && action === "update") {
            const item = state.leads.find(x => x.id === id && x.status === status &&
              x.pitch_sent_at === null && x.organizer_email === email);
            if (options.crmWriteFailure || !item) response = { error: options.crmWriteFailure ? { code: "FAIL" } : null, data: [] };
            else { Object.assign(item, payload); response = { error: null, data: [item] }; }
          } else if (table === "app_settings" && action === "update") {
            if (options.claimOutcomeFailure || !state.claims.has(id))
              response = { error: { code: "NO_WRITE" }, data: [] };
            else { state.claims.set(id, payload.value); response = { error: null, data: [{ key: id }] }; }
          } else throw Error("Unexpected mocked database operation");
          return Promise.resolve(response).then(resolve, reject);
        },
      };
      return build;
    },
  };
  const mod = h.load("src/lib/admin/scheduledOrganizerOutreach.ts");
  return { mod, state, db, h };
}

test("normalizes one address, rejects comma lists, controls and invalid email syntax", () => {
  const { mod } = setup();
  assert.equal(mod.normalizedOrganizerEmail("  Team@EXAMPLE.ORG  "), "team@example.org");
  for (const bad of ["a@example.org,b@example.org", "a@example.org\nBcc:x", "not an email", "", null]) {
    assert.equal(mod.normalizedOrganizerEmail(bad), null);
  }
});

test("IST date boundary determines one claim day", () => {
  const { mod } = setup();
  assert.equal(mod.outreachDateIST(new Date("2026-11-05T18:29:59Z")), "2026-11-05");
  assert.equal(mod.outreachDateIST(new Date("2026-11-05T18:30:00Z")), "2026-11-06");
});

test("no verified new CRM lead means zero email, not recycling removed records", async () => {
  const { mod, db, state } = setup({ leads: [
    { ...originalLead(), status: "removed", pitch_sent_at: "2026-10-01T00:00:00Z" },
    { ...originalLead(), id: "another", status: "new" },
  ]});
  const result = await mod.runScheduledOrganizerOutreach(db, now);
  assert.equal(result.status, "no_eligible");
  assert.equal(result.eligible, 0);
  assert.equal(state.sends.length, 0);
  assert.equal(state.claims.size, 0);
});

test("a new CRM row without explicit organizer-contact approval is never sent", async () => {
  const { mod, db, state } = setup({ leads: [{ ...originalLead(), notes: "contact from unverified HTML" }] });
  const result = await mod.runScheduledOrganizerOutreach(db, now);
  assert.equal(result.eligible, 0);
  assert.equal(state.sends.length, 0);
});

test("fresh verified lead sends one email and records provider acceptance; same day cannot resend", async () => {
  const { mod, db, state } = setup();
  const first = await mod.runScheduledOrganizerOutreach(db, now);
  assert.equal(first.status, "sent");
  assert.equal(first.accepted, 1);
  assert.equal(first.attempted, 1);
  assert.equal(state.sends.length, 1);
  assert.match(state.sends[0].subject, /HackerMate partnership/);
  assert.match(state.sends[0].html, /co-branded partner page/);
  assert.equal(state.leads[0].status, "pitch_sent");
  assert.equal(state.counter, 1);
  assert.equal(state.claims.size, 2);
  const second = await mod.runScheduledOrganizerOutreach(db, now);
  assert.equal(second.status, "no_eligible");
  assert.equal(state.sends.length, 1);
});

test("two competing daily runs claim before sending and only one contacts recipient", async () => {
  const { mod, db, state } = setup();
  const outcomes = await Promise.all([
    mod.runScheduledOrganizerOutreach(db, now), mod.runScheduledOrganizerOutreach(db, now),
  ]);
  assert.equal(state.sends.length, 1);
  assert.equal(outcomes.filter(x => x.status === "sent").length, 1);
  assert.equal(outcomes.filter(x => x.status === "duplicate").length, 1);
});

test("unknown provider outcome remains held across later dates", async () => {
  const { mod, db, state } = setup({ provider: {
    attempted: true, intendedRecipientAccepted: false, sandbox: false,
    status: "unknown", reason: "Unknown", retrySafe: false,
  }});
  const first = await mod.runScheduledOrganizerOutreach(db, now);
  assert.equal(first.status, "partial");
  assert.equal(first.unknown, 1);
  assert.equal(state.leads[0].status, "email_outcome_unknown");
  const again = await mod.runScheduledOrganizerOutreach(db, new Date("2026-11-07T05:17:00Z"));
  assert.equal(again.status, "no_eligible");
  assert.equal(state.sends.length, 1);
});

test("provider-accepted but CRM bookkeeping failed never retries a recipient on following day", async () => {
  const { mod, db, state } = setup({ crmWriteFailure: true });
  const first = await mod.runScheduledOrganizerOutreach(db, now);
  assert.equal(first.status, "partial");
  assert.equal(first.accepted, 1);
  const later = await mod.runScheduledOrganizerOutreach(db, new Date("2026-11-07T05:17:00Z"));
  assert.equal(later.held, 1);
  assert.equal(state.sends.length, 1);
});

test("claim store outage and budget outage block all sends", async () => {
  for (const option of [{ claimUnavailable: true }, { budgetUnavailable: true }, { noProvider: true }, { sender: "onboarding@resend.dev" }]) {
    const { mod, db, state } = setup(option);
    const result = await mod.runScheduledOrganizerOutreach(db, now);
    assert.equal(result.status, "blocked");
    assert.equal(state.sends.length, 0);
  }
});

test("eligibility read failure blocks without a claim or provider attempt", async () => {
  const { mod, db, state } = setup({ crmReadFailure: true });
  await assert.rejects(mod.runScheduledOrganizerOutreach(db, now), /CRM read unavailable/);
  assert.equal(state.sends.length, 0);
  assert.equal(state.claims.size, 0);
});

test("invalid event URLs and multiple contacts are never contacted", async () => {
  const { mod, db, state } = setup({ leads: [
    { ...originalLead(), unstop_url: "http://unstop.com/competitions/fixture-hackathon-12345" },
    { ...originalLead(), id: "b", unstop_url: nextUrl, organizer_email: "a@example.org,b@example.org" },
  ]});
  const result = await mod.runScheduledOrganizerOutreach(db, now);
  assert.equal(result.eligible, 0);
  assert.equal(state.sends.length, 0);
});

test("day limit is five, even when budget allows more", async () => {
  const leads = Array.from({ length: 9 }, (_, i) => ({
    ...originalLead(), id: "lead-" + i, organizer_email: "organizer" + i + "@example.org",
    unstop_url: "https://unstop.com/competitions/fixture-" + (12345 + i),
  }));
  const { mod, db, state } = setup({ leads, allowedCount: 50 });
  const result = await mod.runScheduledOrganizerOutreach(db, now);
  assert.equal(result.accepted, 5);
  assert.equal(result.deferred, 4);
  assert.equal(state.sends.length, 5);
});

test("workflow has a single daily schedule, fixed endpoint and absolutely no curl retry", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/organizer-partnership-outreach.yml"), "utf8");
  assert.match(workflow, /cron: '17 5 \* \* \*'/);
  assert.equal((workflow.match(/^\s+- cron:/gm) || []).length, 1);
  assert.match(workflow, /--retry 0/);
  assert.match(workflow, /github.repository == 'yashshah1211\/HackerMate_Backup'/);
  assert.match(workflow, /https:\/\/www\.hackermate\.in\/api\/cron\/organizer-outreach/);
  assert.doesNotMatch(workflow, /--retry [1-9]|--location|--request POST|RESEND_API_KEY/);
});

test("suspended/failed CRM state does not override historical contact suppression", async () => {
  const leads = [
    { ...originalLead(), id: "old", status: "email_outcome_unknown", pitch_sent_at: null, organizer_email: "Shared@Example.org" },
    { ...originalLead(), id: "new", status: "new", unstop_url: nextUrl, organizer_email: "shared@example.org" },
  ];
  const { mod, db, state } = setup({ leads });
  const res = await mod.runScheduledOrganizerOutreach(db, now);
  assert.equal(res.eligible, 0);
  assert.equal(state.sends.length, 0);
});
