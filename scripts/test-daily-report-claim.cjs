/* eslint-disable @typescript-eslint/no-require-imports -- Offline CommonJS harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./ppt-vision-harness.cjs");
const { indiaReportDate, claimScheduledDatabaseReport, recordScheduledDatabaseReportOutcome } =
  harness().load("src/lib/admin/dailyReportClaim.ts");

function fakeDb({ unavailable = false } = {}) {
  const rows = new Map();
  return {
    rows,
    from(table) {
      assert.equal(table, "app_settings");
      return {
        async insert(value) {
          if (unavailable) return { error: { code: "42501" } };
          if (rows.has(value.key)) return { error: { code: "23505" } };
          rows.set(value.key, value.value);
          return { error: null };
        },
        update(value) {
          return {
            async eq(column, key) {
              assert.equal(column, "key");
              if (!rows.has(key)) return { error: { code: "PGRST116" } };
              rows.set(key, value.value);
              return { error: null };
            },
          };
        },
      };
    },
  };
}

test("IST day boundary uses 18:30 UTC", () => {
  assert.equal(indiaReportDate(new Date("2026-11-04T18:29:59Z")), "2026-11-04");
  assert.equal(indiaReportDate(new Date("2026-11-04T18:30:00Z")), "2026-11-05");
});
test("atomic first writer wins; concurrent duplicates fail closed", async () => {
  const db = fakeDb(), at = new Date("2026-11-05T03:30:00Z");
  const outcomes = await Promise.all([
    claimScheduledDatabaseReport(db, at),
    claimScheduledDatabaseReport(db, at),
    claimScheduledDatabaseReport(db, at),
  ]);
  assert.equal(outcomes.filter(x => x.status === "reserved").length, 1);
  assert.equal(outcomes.filter(x => x.status === "duplicate").length, 2);
  const key = outcomes.find(x => x.status === "reserved").key;
  assert.equal(await recordScheduledDatabaseReportOutcome(db, key, "accepted", at), true);
  assert.equal(JSON.parse(db.rows.get(key)).status, "accepted");
  assert.equal((await claimScheduledDatabaseReport(db, at)).status, "duplicate");
});
test("database failure blocks emails and next IST day can reserve", async () => {
  assert.equal((await claimScheduledDatabaseReport(fakeDb({ unavailable: true }), new Date())).status, "unavailable");
  const db = fakeDb();
  assert.equal((await claimScheduledDatabaseReport(db, new Date("2026-11-04T17:00:00Z"))).status, "reserved");
  assert.equal((await claimScheduledDatabaseReport(db, new Date("2026-11-04T19:00:00Z"))).status, "reserved");
  assert.equal(db.rows.size, 2);
});
