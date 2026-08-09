// Re-evaluate HexaHack submission in the database to update its evaluation record

const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");
  envText.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const k = trimmed.substring(0, idx).trim();
        const v = trimmed.substring(idx + 1).trim();
        process.env[k] = v;
      }
    }
  });
}

const { evaluateSubmission } = require("../src/lib/sihEvaluator");

async function reEvaluateHexaHack() {
  const subId = "81233b10-a01e-4ab5-877c-b835d84d0ab9"; // HexaHack submission ID
  console.log("==========================================================");
  console.log("🔄 RE-EVALUATING HEXAHACK SUBMISSION IN DATABASE");
  console.log("==========================================================\n");

  const res = await evaluateSubmission(subId);

  console.log(`[Re-Evaluation Complete] Total Score: ${res.submission.total_score} | Grade: ${res.submission.grade}`);
  console.log(`Format Violations (${res.evaluation.formatViolations.length}):`);
  res.evaluation.formatViolations.forEach((fv) => console.log(`  • ${fv}`));

  console.log(`\nUpdated AI Feedback in DB:`, JSON.stringify(res.submission.ai_feedback, null, 2));
  console.log("\n==========================================================");
  console.log("✅ DATABASE RECORD UPDATED SUCCESSFULLY!");
}

reEvaluateHexaHack();
