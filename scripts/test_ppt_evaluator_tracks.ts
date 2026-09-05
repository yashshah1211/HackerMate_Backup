import { detectJudgingTrack } from "../src/lib/evaluator/trackDetection";
import { generateHeuristicEvaluation } from "../src/lib/ppt/evaluatorEngine";

console.log("==========================================================");
console.log("🧪 RUNNING TRACK-AWARE PPT EVALUATOR & BOUNDARY TESTS");
console.log("==========================================================\n");

let failures = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
  } else {
    console.error(`❌ FAIL: ${testName}`, details || "");
    failures++;
  }
}

// ---------------------------------------------------------------------------
// TEST SUITE 1: WORD-BOUNDARY TRACK AUTO-DETECTION TESTS
// ---------------------------------------------------------------------------
console.log("--- 1. Boundary-Safe Word Matching & False-Positive Prevention ---");

const coincidentalSubstringCases = [
  { name: "Chennai Civic Hackathon", desc: "Municipal governance portal" },
  { name: "Kailash Tech Fest", desc: "Annual college tech fest" },
  { name: "Email Deliverability Marathon", desc: "SMTP and newsletter optimization" },
  { name: "Retail Solutions Hack", desc: "POS and barcode inventory" },
  { name: "HTML & CSS Design Challenge", desc: "Pure CSS art competition" },
];

for (const c of coincidentalSubstringCases) {
  const result = detectJudgingTrack({ name: c.name, description: c.desc });
  assert(
    result.isConfident === false && result.detectedTrack === "web_dev",
    `No false-positive for: "${c.name}" (detected: ${result.detectedTrack}, confident: ${result.isConfident})`
  );
}

const legitimateTrackCases = [
  { input: { name: "Chennai ML Summit" }, expectedTrack: "ai_genai", expectedConfident: true },
  { input: { name: "Kailash AI Innovate" }, expectedTrack: "ai_genai", expectedConfident: true },
  { input: { name: "Smart India Hackathon 2026" }, expectedTrack: "sih", expectedConfident: true },
  { input: { name: "SIH Internal College Screening" }, expectedTrack: "sih", expectedConfident: true },
  { input: { name: "Next.js Full-Stack Web Sprint" }, expectedTrack: "web_dev", expectedConfident: true },
];

for (const c of legitimateTrackCases) {
  const result = detectJudgingTrack(c.input);
  assert(
    result.detectedTrack === c.expectedTrack && result.isConfident === c.expectedConfident,
    `Legitimate match for: "${c.input.name}" -> ${result.detectedTrack} (confident: ${result.isConfident})`
  );
}

// ---------------------------------------------------------------------------
// TEST SUITE 2: EVALUATOR ENGINE TRACK BEHAVIOR (4-MEMBER SQUAD, 0 FEMALE)
// ---------------------------------------------------------------------------
console.log("\n--- 2. Evaluator Engine Squad & Gender Rules per Track ---");

const samplePitchSlideText = `
[Slide 1] Title Page: DevOrbit - Edge Collaborative Developer Platform. Team The Builders.
[Slide 2] Proposed Solution: Real-time collaborative IDE with CRDT sync solving fragmented tools for 50,000 developers.
[Slide 3] Technical Approach: Next.js 15, TypeScript, PostgreSQL, Supabase RLS, Redis caching, Yjs WebSockets. Pipeline ingests -> processes -> syncs state.
[Slide 4] Feasibility & Risks: Sub-30ms latency mitigation via edge gateways and offline CRDT queue fallback.
[Slide 5] Impact & Benefits: 40% reduction in code review turnaround, saving $12,000 per engineering team annually.
[Slide 6] Research & References: Cites CRDT papers (Shapiro et al.), RFC 6455 WebSockets, and ACM distributed systems.
`;

const mockTeamInfo = {
  name: "The Builders",
  memberCount: 4,
  hasFemaleMember: false,
  members: [
    { name: "Builder 1", skills: ["React", "TypeScript", "Frontend"] },
    { name: "Builder 2", skills: ["Node.js", "PostgreSQL", "Backend"] },
    { name: "Builder 3", skills: ["Docker", "DevOps", "Cloud"] },
    { name: "Builder 4", skills: ["System Architecture", "Security"] },
  ],
};

// 2A. SIH Track Evaluation
const sihEval = generateHeuristicEvaluation(
  "DevOrbit",
  "software",
  samplePitchSlideText,
  mockTeamInfo,
  4,
  false,
  "sih"
);

assert(
  sihEval.grade === "High SPOC Risk 🚨",
  "SIH Track: 4 members and 0 female flags 'High SPOC Risk 🚨'",
  { grade: sihEval.grade, totalScore: sihEval.totalScore }
);
assert(
  sihEval.spocRedFlags.some(f => f.includes("Incomplete Squad Size") && f.includes("4/6")),
  "SIH Track: Red flag present for Incomplete Squad Size (4/6 members)"
);
assert(
  sihEval.spocRedFlags.some(f => f.includes("Missing Female Teammate")),
  "SIH Track: Red flag present for Missing Female Teammate"
);
assert(
  sihEval.scoreTeam <= 6,
  `SIH Track: Team score is heavily penalized (${sihEval.scoreTeam}/15)`
);

// 2B. AI / GenAI Track Evaluation
const aiEval = generateHeuristicEvaluation(
  "DevOrbit",
  "software",
  samplePitchSlideText,
  mockTeamInfo,
  4,
  false,
  "ai_genai"
);

assert(
  aiEval.grade !== "High SPOC Risk 🚨",
  `AI/GenAI Track: Grade is NOT High SPOC Risk (Got: "${aiEval.grade}")`
);
assert(
  !aiEval.spocRedFlags.some(f => f.toLowerCase().includes("female")),
  "AI/GenAI Track: Zero female teammate red flags"
);
assert(
  !aiEval.spocRedFlags.some(f => f.toLowerCase().includes("incomplete squad")),
  "AI/GenAI Track: Zero incomplete squad (<6) red flags"
);
assert(
  aiEval.scoreTeam >= 13,
  `AI/GenAI Track: Full/high squad points awarded for viable 4-member squad (${aiEval.scoreTeam}/15)`
);

// 2C. Web Dev Track Evaluation
const webEval = generateHeuristicEvaluation(
  "DevOrbit",
  "software",
  samplePitchSlideText,
  mockTeamInfo,
  4,
  false,
  "web_dev"
);

assert(
  webEval.grade !== "High SPOC Risk 🚨",
  `Web Dev Track: Grade is NOT High SPOC Risk (Got: "${webEval.grade}")`
);
assert(
  !webEval.spocRedFlags.some(f => f.toLowerCase().includes("female")),
  "Web Dev Track: Zero female teammate red flags"
);
assert(
  !webEval.spocRedFlags.some(f => f.toLowerCase().includes("incomplete squad")),
  "Web Dev Track: Zero incomplete squad (<6) red flags"
);
assert(
  webEval.scoreTeam >= 13,
  `Web Dev Track: Full/high squad points awarded for viable 4-member squad (${webEval.scoreTeam}/15)`
);

// ---------------------------------------------------------------------------
// TEST SUMMARY
// ---------------------------------------------------------------------------
console.log("\n==========================================================");
if (failures === 0) {
  console.log("🎉 ALL TRACK-AWARE PPT EVALUATOR TESTS PASSED CLEANLY!");
} else {
  console.error(`💥 ${failures} TESTS FAILED.`);
  process.exit(1);
}
console.log("==========================================================");
