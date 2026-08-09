const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Read .env.local
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf8");
  envConfig.split("\n").forEach((line) => {
    const parts = line.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim().replace(/^["']|["']$/g, "");
      process.env[key] = val;
    }
  });
}

const SIH_HACKATHON_ID = "c5fb54c9-7e50-4d51-871d-195f1373507b";
const MOCK_SIH_ID = "00000000-0000-0000-0000-000001703935";

async function testIncognitoFix() {
  console.log("==========================================================");
  console.log("🧪 TESTING UN-AUTHENTICATED SIH TEAMS FETCH LOGIC");
  console.log("==========================================================\n");

  const supabaseAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Proposed Universal Query for Anonymous & Logged In Users:
  // Fetch teams where hackathon_id IN (SIH_HACKATHON_ID, MOCK_SIH_ID) or hackathon_name ILIKE %sih% or team_id IN sih_mock_submissions_public
  const { data: sihMockSubs } = await supabaseAnon
    .from("sih_mock_submissions_public")
    .select("team_id");

  const mockTeamIds = (sihMockSubs || []).map((s) => s.team_id).filter(Boolean);

  const { data: sihTeamsData, error: sihTeamsErr } = await supabaseAnon
    .from("teams")
    .select("*, team_members(*, profiles(id, full_name, avatar_url, college, skills, gender, role))")
    .or(`hackathon_id.eq.${SIH_HACKATHON_ID},hackathon_id.eq.${MOCK_SIH_ID},hackathon_name.ilike.%sih%,hackathon_name.ilike.%smart india%${mockTeamIds.length > 0 ? `,id.in.(${mockTeamIds.join(",")})` : ""}`);

  if (sihTeamsErr) {
    console.error("❌ Error fetching SIH teams:", sihTeamsErr);
    return;
  }

  console.log(`✅ Universal Query returned ${sihTeamsData?.length || 0} total SIH teams!`);

  // Group by college DJSCE
  const djsceTeams = (sihTeamsData || []).filter((t) => {
    const col = (t.college || "").toLowerCase();
    return col.includes("djsce") || col.includes("dwarkadas");
  });

  console.log(`✅ DJSCE SIH Teams Count: ${djsceTeams.length}`);
  djsceTeams.forEach((t, i) => {
    console.log(`   Team ${i + 1}: ${t.name} (Owner: ${t.owner_id}, Members: ${t.team_members?.length || 0})`);
  });
}

testIncognitoFix();
