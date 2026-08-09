// Re-evaluate HexaHack submission in the database dynamically

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

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
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sub } = await supabase
    .from("sih_mock_submissions")
    .select("id")
    .eq("ps_number", "SIH1365")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!sub) {
    console.error("HexaHack submission not found!");
    return;
  }

  console.log("==========================================================");
  console.log(`🔄 RE-EVALUATING HEXAHACK SUBMISSION (${sub.id}) IN DATABASE`);
  console.log("==========================================================\n");

  const res = await evaluateSubmission(sub.id);

  console.log(`[Re-Evaluation Complete] Total Score: ${res.submission.total_score} | Grade: ${res.submission.grade}`);
  console.log(`Format Violations (${res.evaluation.formatViolations.length}):`);
  res.evaluation.formatViolations.forEach((fv) => console.log(`  • ${fv}`));

  console.log("\n==========================================================");
  console.log("✅ DATABASE RECORD UPDATED SUCCESSFULLY!");
}

reEvaluateHexaHack();
