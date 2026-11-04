/* eslint-disable @typescript-eslint/no-require-imports -- Offline tests. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { canonicalUrl, selectCandidates } = require("./discover-organizer-candidates.cjs");
const at = new Date("2026-11-05T05:00:00Z");
function event(overrides = {}) {
  const url = "https://unstop.com/hackathons/new-build-123";
  return { name: "Sample", website_url: url, type: "external", status: "approved",
    archived: false, organizer_id: null, college: "Listed host", source_metadata: {
      version: 1, provider: "unstop", canonical_url: url, category: "hackathon",
      check_status: "ok", event_status: "upcoming", source_hash: "a".repeat(64),
      checked_at: "2026-11-05T04:00:00Z", expires_at: "2026-11-06T04:00:00Z",
      facts: { registration_status: "open" },
    }, ...overrides };
}
test("existing CRM URLs always prevent re-prospecting", () => {
  assert.equal(canonicalUrl("https://www.unstop.com/hackathons/new-build-123/?utm=x"),
    canonicalUrl("https://unstop.com/hackathons/new-build-123"));
  assert.equal(canonicalUrl("javascript:alert(1)"), null);
  assert.equal(selectCandidates([event()], ["https://www.unstop.com/hackathons/new-build-123/?utm=x"], at).length, 0);
});
test("verified source is only a contact-unverified candidate", () => {
  const list = selectCandidates([event(), event()], [], at);
  assert.equal(list.length, 1);
  assert.equal(list[0].review_status, "requires_manual_organizer_and_contact_verification");
  assert.equal("organizer_email" in list[0], false);
});
test("reject protected, stale, closed and mismatched events", () => {
  const m = event().source_metadata;
  for (const change of [
    { type: "native" }, { organizer_id: "owner" }, { archived: true },
    { source_metadata: { ...m, check_status: "failed" } },
    { source_metadata: { ...m, provider: "devfolio" } },
    { source_metadata: { ...m, event_status: "ended" } },
    { source_metadata: { ...m, expires_at: "2026-11-04T04:00:00Z" } },
    { source_metadata: { ...m, canonical_url: "https://unstop.com/hackathons/other" } },
    { source_metadata: { ...m, facts: { registration_status: "closed" } } },
  ]) assert.equal(selectCandidates([event(change)], [], at).length, 0);
});
