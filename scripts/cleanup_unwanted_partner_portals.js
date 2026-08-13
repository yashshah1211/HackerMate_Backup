const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "../.env.local");
const env = fs.readFileSync(envPath, "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const serviceRoleKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

if (!url || !serviceRoleKey) {
  console.error("❌ Missing Supabase URL or Service Role Key in .env.local");
  process.exit(1);
}

const supabaseAdmin = createClient(url, serviceRoleKey);

async function cleanupPartnerPortals() {
  console.log("==========================================================");
  console.log("🧹  PARTNER PORTALS CLEANUP SCRIPT");
  console.log("==========================================================\n");

  const allowedSlugs = ["axcentra", "gamnexis", "orvix", "aethos", "aethos-day-zero", "startupx"];

  // 1. Fetch all partner configs
  const { data: allConfigs, error: fetchErr } = await supabaseAdmin
    .from("partner_configs")
    .select("id, slug, partner_name");

  if (fetchErr) {
    console.error("❌ Error fetching partner_configs:", fetchErr.message);
    process.exit(1);
  }

  console.log("Current partner pages in DB:");
  allConfigs.forEach((c) => console.log(`  - [${c.slug}] : "${c.partner_name}"`));

  const configsToDelete = allConfigs.filter((c) => !allowedSlugs.includes(c.slug));

  if (configsToDelete.length === 0) {
    console.log("\n✅ No unwanted partner pages found. Database is already clean!");
    return;
  }

  console.log(`\nDeleting ${configsToDelete.length} unwanted partner page(s):`);
  configsToDelete.forEach((c) => console.log(`  ❌ Removing [${c.slug}] (${c.partner_name})`));

  const idsToDelete = configsToDelete.map((c) => c.id);

  const { error: deleteErr } = await supabaseAdmin
    .from("partner_configs")
    .delete()
    .in("id", idsToDelete);

  if (deleteErr) {
    console.error("❌ Error deleting unwanted partner pages:", deleteErr.message);
  } else {
    console.log(`\n🎉 Successfully deleted ${configsToDelete.length} partner page(s)!`);
  }

  // 2. Fetch remaining partner configs to verify
  const { data: remaining } = await supabaseAdmin
    .from("partner_configs")
    .select("slug, partner_name");

  console.log("\nRemaining Active Partner Pages:");
  (remaining || []).forEach((c) => console.log(`  ✅ [${c.slug}] : "${c.partner_name}"`));

  console.log("\n==========================================================");
}

cleanupPartnerPortals();
