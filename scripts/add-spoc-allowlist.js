/**
 * HackerMate - SPOC Allowlist Management Utility Script
 * 
 * Usage:
 *   node scripts/add-spoc-allowlist.js <email> <college_name> [role]
 * 
 * Example:
 *   node scripts/add-spoc-allowlist.js spoc@djsce.ac.in "D.J. Sanghvi College of Engineering (DJSCE)" spoc
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

function getEnv() {
  const envPath = path.join(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌ .env.local file not found in frontend directory.");
    process.exit(1);
  }
  const envContent = fs.readFileSync(envPath, "utf8");
  const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
  const serviceKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

  if (!url || !serviceKey) {
    console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  return { url, serviceKey };
}

async function main() {
  const args = process.argv.slice(2);
  const email = args[0]?.toLowerCase().trim();
  const collegeName = args[1]?.trim();
  const role = args[2]?.toLowerCase().trim() || "spoc";

  if (!email || !collegeName) {
    console.log(`
🛡️ HackerMate SPOC Allowlist CLI Tool
==================================================
Usage:
  node scripts/add-spoc-allowlist.js <email> <college_name> [role]

Example:
  node scripts/add-spoc-allowlist.js "spoc@djsce.ac.in" "D.J. Sanghvi College of Engineering (DJSCE)" "spoc"
==================================================
`);
    process.exit(0);
  }

  const { url, serviceKey } = getEnv();
  const supabase = createClient(url, serviceKey);

  console.log(`⏳ Adding/Updating SPOC allowlist entry for: ${email}`);
  console.log(`   College: ${collegeName}`);
  console.log(`   Role: ${role}`);

  // 1. Try upsert into sih_spoc_allowlist table
  const { data: allowData, error: allowErr } = await supabase
    .from("sih_spoc_allowlist")
    .upsert(
      {
        email,
        college_name: collegeName,
        role,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    )
    .select();

  if (allowErr) {
    console.warn("⚠️ sih_spoc_allowlist table write warning:", allowErr.message);
  } else {
    console.log("✅ Successfully written to sih_spoc_allowlist table!");
  }

  // 2. Also update matching profile college & role (unless user is Super Admin)
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    const isSuperAdmin = email === "yashshah7117@gmail.com" || existingProfile.role === "admin";
    const newRole = isSuperAdmin ? "admin" : role;

    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        role: newRole,
        college: collegeName,
      })
      .eq("id", existingProfile.id);

    if (profErr) {
      console.warn("⚠️ Failed to update profiles table role:", profErr.message);
    } else {
      console.log(`✅ Updated existing user profile (${existingProfile.full_name || email}) to role='${newRole}' and college='${collegeName}'`);
    }
  } else {
    console.log(`ℹ️ Note: User (${email}) has not registered an auth account yet. Once they sign in, their email on the allowlist will grant immediate SPOC access.`);
  }

  console.log("\n🎉 SPOC Allowlist provisioning complete!");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
