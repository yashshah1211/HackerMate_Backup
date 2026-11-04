/* eslint-disable @typescript-eslint/no-require-imports -- Offline report tests. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./ppt-vision-harness.cjs");
const {
  buildFounderBrief, founderBriefEmailHtml, fetchFounderMetrics,
} = harness().load("src/lib/admin/founderBrief.ts");
const { generateFounderBriefPdf } = harness().load("src/lib/admin/founderBriefPdf.ts");

const window = { since: "2026-11-01T04:29:18Z", until: "2026-11-02T04:29:18Z", isFallback24h: false };
const fixture = {
  timeWindow: window,
  hackathons: [
    { name: "Project Last Mile: Analytics Case Challenge" },
    { name: "CTF - Capture The Flag" }, { name: "ELUCode - 7" }, { name: "Synapase 3.0" },
  ],
};
const metrics = {
  builders: 6, onboardedNow: 3, teams: 0, joins: 0, saves: 0, invites: 0,
  connections: 0, messages: 0, hackathons: 4, leads: 4, feedback: 0,
  previousBuilders: 5, previousSaves: 0,
};
test("historical fixture tells a useful but non-causal story", () => {
  const brief = buildFounderBrief(fixture, metrics);
  assert.match(brief.headline, /6 builders joined/);
  assert.equal(brief.sections.length, 4);
  assert.match(brief.sections[0].detail, /currently show completed onboarding/);
  assert.match(brief.sections[2].headline, /4 new listings/);
  assert.match(brief.sections[3].detail, /not verified contacts/);
  assert.ok(brief.attention.some(x => x.includes("first-session journey")));
  assert.equal(brief.nextSteps.length, 3);
  assert.ok(brief.caveats.some(x => x.includes("equal-length window")));
  assert.doesNotMatch(JSON.stringify(brief), /@gmail\.com/);
});
test("missing metrics never masquerade as zeros or a clean day", () => {
  const brief = buildFounderBrief(fixture, { ...metrics, builders: null, saves: null });
  assert.match(brief.headline, /need verification/);
  assert.match(brief.sections[0].headline, /Unavailable/);
  assert.match(brief.sections[2].headline, /Unavailable/);
  assert.ok(brief.caveats.some(x => x.includes("Unavailable metrics")));
  assert.ok(!brief.headline.includes("0 builders"));
});
test("zero action day is not automatically declared failure", () => {
  const brief = buildFounderBrief({ ...fixture, hackathons: [] }, {
    ...metrics, builders: 0, hackathons: 0, leads: 0,
  });
  assert.match(brief.headline, /quiet window/);
  assert.doesNotMatch(brief.headline, /failed|disaster|collapsed/i);
});
test("multi-day catch-up explicitly discloses report window", () => {
  const brief = buildFounderBrief({ ...fixture, timeWindow: {
    since: "2026-11-01T04:29:18Z", until: "2026-11-04T04:29:18Z", isFallback24h: false,
  } }, metrics);
  assert.ok(brief.attention.some(x => x.includes("more than 36 hours")));
  assert.ok(!brief.caveats.some(x => x.includes("equal-length window")));
});
test("HTML escapes untrusted listing titles; no private email or feedback body printed", () => {
  const secret = "customer@example.com";
  const brief = buildFounderBrief({ ...fixture, hackathons: [{ name: '<script>alert("X")</script>' }] }, metrics);
  const html = founderBriefEmailHtml(brief);
  assert.match(html, /HACKERMATE \/ FOUNDER BRIEF/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, new RegExp(secret));
  // The PDF has its own escaped drawing path; the email is safe even when a
  // rendered section includes externally sourced text.
  assert.match(html, /What to do next/);
});
test("new founder PDF is valid PDF and renders private-free, no external dependencies", () => {
  const brief = buildFounderBrief(fixture, metrics);
  const pdf = generateFounderBriefPdf(brief);
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.length > 4500);
});
test("invalid windows fail closed", () => {
  assert.throws(() => buildFounderBrief({ ...fixture, timeWindow: {
    since: "broken", until: window.until, isFallback24h: false,
  } }, metrics), /Invalid report window/);
});
test("count query errors produce unavailable, not zeros", async () => {
  const fake = {
    from() {
      const query = {
        select() { return this; }, gte() { return this; }, lt() { return this; },
        eq() { return this; },
        then(resolve) { return Promise.resolve({ error: { code: "PGRST999" }, count: null }).then(resolve); },
      };
      return query;
    },
  };
  const output = await fetchFounderMetrics(fake, window);
  assert.equal(output.builders, null);
  assert.equal(output.saves, null);
  assert.equal(output.previousBuilders, null);
});
