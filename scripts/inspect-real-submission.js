// Inspect real database record for HexaHack / SIH1365 submission

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
let key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url && fs.existsSync(".env.local")) {
  const envText = fs.readFileSync(".env.local", "utf8");
  const matchUrl = envText.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  const matchKey = envText.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  if (matchUrl) url = matchUrl[1].trim();
  if (matchKey) key = matchKey[1].trim();
}

const supabase = createClient(url, key);

async function inspectSubmission() {
  console.log("==========================================================");
  console.log("🔍 INSPECTING REAL DB SUBMISSION FOR PS #SIH1365 / HexaHack");
  console.log("==========================================================\n");

  const { data: subs, error } = await supabase
    .from("sih_mock_submissions")
    .select("*, teams(name, college)")
    .or("ps_number.eq.SIH1365,ps_number.eq.1365");

  if (error || !subs || subs.length === 0) {
    console.log("No exact match for SIH1365. Fetching latest 5 submissions:");
    const { data: latest } = await supabase
      .from("sih_mock_submissions")
      .select("id, ps_number, ppt_url, total_score, grade, ai_feedback, teams(name)")
      .order("created_at", { ascending: false })
      .limit(5);

    console.log(JSON.stringify(latest, null, 2));
    return;
  }

  for (const sub of subs) {
    console.log(`[Submission ID: ${sub.id}]`);
    console.log(`Team: ${sub.teams?.name} | PS: #${sub.ps_number} (${sub.ps_title})`);
    console.log(`PPT URL: ${sub.ppt_url}`);
    console.log(`Total Score: ${sub.total_score} | Grade: ${sub.grade}`);
    console.log(`AI Feedback Object:`, JSON.stringify(sub.ai_feedback, null, 2));
  }
}

inspectSubmission();
