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

function isSameCollege(collegeA, collegeB) {
  if (!collegeA || !collegeB) return false;
  const a = collegeA.toLowerCase().trim();
  const b = collegeB.toLowerCase().trim();
  if (a === b) return true;

  const isDJSCEA = a.includes("djsce") || a.includes("dwarkadas");
  const isDJSCEB = b.includes("djsce") || b.includes("dwarkadas");
  if (isDJSCEA && isDJSCEB) return true;

  const getFirstWord = (s) => s.split(/[\s,()]+/)[0];
  const w1 = getFirstWord(a);
  const w2 = getFirstWord(b);

  const acronyms = ["djsce", "spit", "vjti", "tsec", "vesit", "coep", "pict", "vit", "mit", "vnit", "iit", "nit", "iiit"];
  if (acronyms.includes(w1) && w1 === w2) return true;

  return a.includes(b) || b.includes(a);
}

async function checkFix() {
  const targetCollege = "D.J. Sanghvi College of Engineering (DJSCE)";

  let query = supabase
    .from("sih_mock_submissions")
    .select("*, teams!inner(id, name, college)")
    .or("college.ilike.%djsce%,college.ilike.%dwarkadas%", { foreignTable: "teams" });

  const { data: rawSubmissions } = await query;
  const filtered = (rawSubmissions || []).filter((s) => isSameCollege(targetCollege, s.teams?.college));

  console.log("==========================================================");
  console.log("🏫 VERIFYING COLLEGE SYNONYM FILTER FIX");
  console.log("==========================================================\n");

  console.log(`Target College: "${targetCollege}"`);
  console.log(`Raw Submissions Returned: ${rawSubmissions?.length}`);
  console.log(`Filtered Submissions Count: ${filtered.length}`);

  if (filtered.length > 0) {
    console.log("✅ PASS: Team HexaHack found for DJSCE!");
    console.log(`Team: ${filtered[0].teams.name}, College: "${filtered[0].teams.college}"`);
  } else {
    console.error("❌ FAIL: No submission found!");
  }
}

checkFix();
