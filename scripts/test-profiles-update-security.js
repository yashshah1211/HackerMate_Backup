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

async function testProfilesUpdateProjection() {
  console.log("==========================================================");
  console.log("🛡️ TESTING PROFILES TABLE EXPLICIT COLUMN SELECT PROJECTION");
  console.log("==========================================================\n");

  const supabaseAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Test 1: Wildcard select() on profiles table (which triggers permission denied on restricted columns)
  console.log("1. Testing wildcard .select() query on profiles:");
  const { error: wildcardErr } = await supabaseAnon
    .from("profiles")
    .select("*")
    .limit(1);

  if (wildcardErr) {
    console.log("   ⚠️ Wildcard select error (Expected on restricted columns):", wildcardErr.message);
  }

  // Test 2: Safe explicit columns projection (SAFE_PROFILE_COLUMNS)
  console.log("\n2. Testing safe explicit column projection on profiles:");
  const { data: safeData, error: safeErr } = await supabaseAnon
    .from("profiles")
    .select("id, full_name, avatar_url, college, skills, gender, role, bio, github_url, linkedin_url, onboarding_completed, is_available")
    .limit(1);

  if (safeErr) {
    console.error("   ❌ Safe Column Select Error:", safeErr);
  } else {
    console.log(`   ✅ PASS: Safe explicit column projection succeeded! Loaded profile ID: ${safeData?.[0]?.id}`);
  }
}

testProfilesUpdateProjection();
