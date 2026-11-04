/* eslint-disable @typescript-eslint/no-require-imports -- Offline visual evidence generator. */
const fs = require("node:fs");
const path = require("node:path");
const { harness } = require("./ppt-vision-harness.cjs");
const h = harness();
const { buildFounderBrief, founderBriefEmailHtml } = h.load("src/lib/admin/founderBrief.ts");
const { generateFounderBriefPdf } = h.load("src/lib/admin/founderBriefPdf.ts");
const fixture = {
  timeWindow: {
    since: "2026-11-01T04:29:18Z",
    until: "2026-11-02T04:29:18Z",
    isFallback24h: false,
  },
  hackathons: [
    { name: "Project Last Mile: Analytics Case Challenge" },
    { name: "CTF - Capture The Flag" },
    { name: "ELUCode - 7" },
    { name: "Synapase 3.0" },
  ],
};
const metrics = {
  builders: 6, onboardedNow: 3, teams: 0, joins: 0, saves: 0,
  invites: 0, connections: 0, messages: 0, hackathons: 4, leads: 4,
  feedback: 0, previousBuilders: 5, previousSaves: 0,
};
const brief = buildFounderBrief(fixture, metrics);
const dir = path.resolve("artifacts/founder-brief-preview");
fs.mkdirSync(dir, { recursive: true });
const pdf = generateFounderBriefPdf(brief);
if (pdf.subarray(0, 4).toString() !== "%PDF") throw new Error("Invalid PDF preview");
fs.writeFileSync(path.join(dir, "founder-brief-synthetic-2026-11-02.pdf"), pdf);
fs.writeFileSync(path.join(dir, "founder-brief-email.html"), founderBriefEmailHtml(brief));
fs.writeFileSync(path.join(dir, "NOTE.txt"), "Synthetic presentation of real aggregate November 2 baseline; current-state onboarding check is retrospective. No personal details or real emails are included. Not sent or deployed.\n");
console.log("Founder Brief preview generated locally without network, database, or mail side effects.");
