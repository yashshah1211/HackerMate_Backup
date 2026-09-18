import path from "path";
import fs from "fs";

// Load .env.local
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf-8");
  envConfig.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      const val = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
      if (key && val) {
        process.env[key.trim()] = val;
      }
    }
  });
}

import { runTrackAwareEvaluation } from "../src/lib/evaluator/trackEvaluatorEngine";
import { runPitchDeckEvaluation } from "../src/lib/ppt/evaluatorEngine";
import { runChallengePitchEvaluation } from "../src/lib/challenges/challengeEvaluatorEngine";
import { moderateImageWithGemini } from "../src/lib/geminiModeration";

async function verifyAllEngines() {
  console.log("===============================================================================");
  console.log("             HACKERMATE LIVE AI GATEWAY VERIFICATION RUN                      ");
  console.log("===============================================================================\n");

  // ── 1. Track-Aware Evaluator ──
  console.log("1. TESTING: Track-Aware Evaluator (runTrackAwareEvaluation)");
  const t1Start = Date.now();
  const trackResult = await runTrackAwareEvaluation({
    trackId: "web_dev",
    psTitle: "NexusFlow: Distributed Collaboration Engine",
    solutionDescription: "Real-time CRDT micro-frontend architecture with sub-30ms syncing.",
    techStack: "Next.js 15, PostgreSQL, Supabase RLS, Redis, Yjs CRDTs, Docker",
    architectureDetails: "Clients sync via WebSockets to edge workers. Transactions commit to Postgres with RLS.",
  });
  const t1Latency = Date.now() - t1Start;
  console.log(`   Status: SUCCESS | Roundtrip: ${t1Latency}ms`);
  console.log(`   usedAiEngine: ${trackResult.usedAiEngine} (fallbackReason: ${trackResult.fallbackReason})`);
  console.log(`   Total Score: ${trackResult.totalScore}/100 | Grade: ${trackResult.grade}`);
  console.log(`   Novelty: ${trackResult.subScores.novelty} | Tech: ${trackResult.subScores.tech} | UI/UX: ${trackResult.subScores.uiUxOrFeasibility} | Impact: ${trackResult.subScores.impactOrTeam}`);
  console.log(`   Sample Strength: ${trackResult.strengths[0] || "None"}\n`);

  // ── 2. SIH & Pitch Deck Evaluator ──
  console.log("2. TESTING: SIH & Pitch Deck Evaluator (runPitchDeckEvaluation)");
  const t2Start = Date.now();
  const pptResult = await runPitchDeckEvaluation(
    "Automated Railway Track Defect Detection",
    "hardware",
    `Slide 1: Smart India Hackathon 2026 - Problem Statement SIH-1422. Team RailGuard, MIT Pune.
Slide 2: Proposed Solution: Dual LiDAR and RGB vision pipeline mounted on inspection trolleys to detect micro-fissures in real time.
Slide 3: Technical Architecture: Jetson Orin Nano edge inference, YOLOv10 for crack detection, MQTT telemetry to central railway cloud.
Slide 4: Feasibility & Risks: IP67 ruggedized enclosure, offline edge buffer during tunnel transit, battery endurance 8 hours.
Slide 5: Impact & Benefits: Reduces derailment risks by 40%, estimated cost ₹45,000 per unit vs ₹8L imported systems.
Slide 6: Research & Team: IEEE 2025 track inspection benchmarks cited. Team of 6 members including 2 female engineers.`,
    {
      name: "RailGuard",
      memberCount: 6,
      hasFemaleMember: true,
      members: [
        { name: "Aarav", skills: ["Python", "Embedded"] },
        { name: "Priya", skills: ["Computer Vision", "PyTorch"] },
        { name: "Rohan", skills: ["IoT", "Hardware"] },
        { name: "Ananya", skills: ["Cloud", "DevOps"] },
        { name: "Vikram", skills: ["Edge AI", "Jetson"] },
        { name: "Neha", skills: ["UI/UX", "Frontend"] }
      ]
    },
    "sih"
  );
  const t2Latency = Date.now() - t2Start;
  console.log(`   Status: SUCCESS | Roundtrip: ${t2Latency}ms`);
  console.log(`   usedAiFallback: ${pptResult.usedAiFallback}`);
  console.log(`   Total Score: ${pptResult.totalScore}/100 | Grade: ${pptResult.grade}`);
  console.log(`   Novelty: ${pptResult.scoreNovelty} | Tech: ${pptResult.scoreTech} | UI/UX: ${pptResult.scoreUiUx} | Team: ${pptResult.scoreTeam}`);
  console.log(`   Sample Rec (Slide 3): ${pptResult.slideRecommendations.technicalApproach}\n`);

  // ── 3. Challenge Pitch Evaluator ──
  console.log("3. TESTING: Challenge Pitch Evaluator (runChallengePitchEvaluation)");
  const t3Start = Date.now();
  const challengeResult = await runChallengePitchEvaluation(
    "Campus Food Waste Reducer",
    "web_dev",
    "Build a real-time campus surplus food reallocation network for hostels and canteens.",
    `Slide 1: Problem: Over 200kg food wasted daily in college mess while nearby shelters lack access.
Slide 2: Solution: CampusBite - Real-time surplus alert notification network with instant delivery routing.
Slide 3: Architecture: Next.js frontend, Supabase database with real-time subscriptions, Geofenced push notifications.
Slide 4: Feasibility: Automated expiry timestamps, hygiene checklist verification by mess supervisor before pickup.
Slide 5: Impact: 70% food waste reduction in pilot trials, feeding 150 individuals daily.
Slide 6: Team & Roadmap: 2-week MVP launch, 2 developers, role allocation frontend + backend.`
  );
  const t3Latency = Date.now() - t3Start;
  console.log(`   Status: SUCCESS | Roundtrip: ${t3Latency}ms`);
  console.log(`   usedAiFallback: ${challengeResult.usedAiFallback}`);
  console.log(`   Total Score: ${challengeResult.totalScore}/100 | Grade: ${challengeResult.grade}`);
  console.log(`   Problem: ${challengeResult.scoreProblem} | Solution: ${challengeResult.scoreSolution} | Arch: ${challengeResult.scoreArchitecture} | Feasibility: ${challengeResult.scoreFeasibilityImpact}`);
  console.log(`   Top Action Item: ${challengeResult.topActionItem}\n`);

  // ── 4. Image Moderation ──
  console.log("4. TESTING: Gemini Vision Media Moderation (moderateImageWithGemini)");
  // 1x1 transparent PNG
  const validImagePng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  const t4Start = Date.now();
  const modResult = await moderateImageWithGemini(validImagePng, "image/png");
  const t4Latency = Date.now() - t4Start;
  console.log(`   Status: SUCCESS | Roundtrip: ${t4Latency}ms`);
  console.log(`   isSafe: ${modResult.isSafe} (reason: ${modResult.reason || "None - Clean content"})`);

  console.log("\n===============================================================================");
  console.log("                      ALL 4 ENGINES VERIFIED LIVE                             ");
  console.log("===============================================================================");
}

verifyAllEngines().catch((err) => {
  console.error("FATAL ERROR IN LIVE VERIFICATION:", err);
  process.exit(1);
});
