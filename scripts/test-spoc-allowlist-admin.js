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

const SUPER_ADMIN_EMAIL = "yashshah7117@gmail.com";

async function testSpocAllowlistAdmin() {
  console.log("==========================================================");
  console.log("🛡️ TESTING SUPER ADMIN SPOC ALLOWLIST MANAGEMENT");
  console.log("==========================================================\n");

  const supabaseService = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 1. Fetch current sih_spoc_allowlist entries via service role client
  console.log("1. Fetching current SPOC allowlist entries from DB:");
  const { data: list, error: listErr } = await supabaseService
    .from("sih_spoc_allowlist")
    .select("*");

  if (listErr) {
    console.error("   ❌ Error fetching allowlist:", listErr);
  } else {
    console.log(`   Total Allowlist Entries: ${list?.length || 0}`);
    (list || []).forEach((e) => {
      console.log(`   - Email: ${e.email} | College: "${e.college_name}" | Role: ${e.role} | Active: ${e.is_active}`);
    });
  }

  // 2. Test Super Admin Email Guard Logic
  console.log("\n2. Testing Super Admin Authorization Gate Logic:");
  const testEmails = [
    { email: "yashshah7117@gmail.com", expected: true },
    { email: "randomstudent@djsce.ac.in", expected: false },
    { email: "faculty@somewhere.com", expected: false },
  ];

  testEmails.forEach(({ email, expected }) => {
    const isSuperAdmin = email.toLowerCase().trim() === SUPER_ADMIN_EMAIL;
    if (isSuperAdmin === expected) {
      console.log(`   ✅ PASS: Email ${email} -> Super Admin Access: ${isSuperAdmin}`);
    } else {
      console.error(`   ❌ FAIL: Authorization gate mis-evaluated for ${email}`);
    }
  });
}

testSpocAllowlistAdmin();
