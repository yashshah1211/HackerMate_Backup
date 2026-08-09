// Inspect HexaHack team owner and members in DB

const { createClient } = require("@supabase/supabase-js");
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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTeam() {
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, owner_id, team_members(id, user_id, role, profiles(id, full_name, email))")
    .ilike("name", "%HexaHack%");

  console.log("==========================================================");
  console.log("👥 INSPECTING HEXAHACK TEAM IN DB");
  console.log("==========================================================\n");

  console.log(JSON.stringify(teams, null, 2));

  const { data: userYash } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .ilike("full_name", "%Yash%");

  console.log("\n--- YASH PROFILES IN DB ---");
  console.log(JSON.stringify(userYash, null, 2));
}

checkTeam();
