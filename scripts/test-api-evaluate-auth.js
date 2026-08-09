// Test server-side auth gate on /api/sih/mock-evaluate

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

async function testApiAuth() {
  console.log("==========================================================");
  console.log("🔒 TESTING SERVER-SIDE AUTHORIZATION GATE ON MOCK-EVALUATE API");
  console.log("==========================================================\n");

  const { data: sub } = await supabase
    .from("sih_mock_submissions")
    .select("id, team_id, teams(name, owner_id)")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!sub) {
    console.error("No submission found for testing!");
    return;
  }

  console.log(`Testing Submission ID: ${sub.id} (Team: ${sub.teams?.name})`);

  // Test 1: Unauthenticated request (no cookie) -> Expect 401
  const res1 = await fetch("http://localhost:3000/api/sih/mock-evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionId: sub.id }),
  });

  const data1 = await res1.json();
  console.log(`\n[Test 1: Unauthenticated Request] HTTP ${res1.status}`);
  console.log(`Response:`, JSON.stringify(data1, null, 2));

  if (res1.status === 401) {
    console.log("✅ PASS: Unauthenticated request correctly blocked with 401 Unauthorized!");
  } else {
    console.error(`❌ FAIL: Expected 401, got ${res1.status}`);
  }
}

testApiAuth();
