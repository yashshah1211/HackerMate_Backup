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

async function checkAndRestorePartners() {
  console.log("==========================================================");
  console.log("🔍  CHECK & RESTORE PARTNER PORTALS");
  console.log("==========================================================\n");

  // 1. Fetch all partner configs
  const { data: configs, error: configErr } = await supabaseAdmin
    .from("partner_configs")
    .select("*");

  if (configErr) {
    console.error("❌ Error reading partner_configs:", configErr.message);
  } else {
    console.log(`Found ${configs?.length || 0} partner_configs rows in DB:`);
    (configs || []).forEach((c) => console.log(`  - [${c.slug}] => hackathon_id: ${c.hackathon_id}`));
  }

  // 2. Check if Axcentra exists in partner_configs
  const axcentraConfig = configs?.find((c) => c.slug === "axcentra");
  const axcentraHackathonId = "00000000-0000-0000-0000-000001703933";

  // Check if hackathon 00000000-0000-0000-0000-000001703933 exists in hackathons table
  const { data: hackathonRow, error: hErr } = await supabaseAdmin
    .from("hackathons")
    .select("id, name, type, start_date, end_date")
    .eq("id", axcentraHackathonId)
    .maybeSingle();

  console.log(`\nAxcentra Hackathon Row in DB:`, hackathonRow || "MISSING ❌");

  if (!hackathonRow) {
    console.log("🛠️ Re-creating Axcentra hackathon in public.hackathons...");
    const { error: insertHErr } = await supabaseAdmin.from("hackathons").upsert({
      id: axcentraHackathonId,
      name: "Axcentra x All India Hackathon",
      description: "The Flagship 72-Hour National Innovation Sprint. Find your team and build the future.",
      type: "official", // Set type = 'official' so scraper auto-purge NEVER targets it!
      start_date: "2026-08-01",
      end_date: "2026-08-31",
      location: "India / Online",
      mode: "online",
      prize_pool: "₹1,00,000+",
      currency: "INR",
      website_url: "https://unstop.com/o/1703933",
      college: "Axcentra National Team",
      tags: ["Axcentra", "Coding", "Hackathon", "Official Partner"],
    });

    if (insertHErr) {
      console.error("❌ Error recreating Axcentra hackathon:", insertHErr.message);
    } else {
      console.log("✅ Successfully recreated Axcentra hackathon record with type = 'official'.");
    }
  } else if (hackathonRow.type === "external") {
    // Upgrade type to 'official' so it never gets auto-purged
    await supabaseAdmin
      .from("hackathons")
      .update({ type: "official" })
      .eq("id", axcentraHackathonId);
    console.log("✅ Upgraded Axcentra hackathon type to 'official'.");
  }

  if (!axcentraConfig) {
    console.log("🛠️ Re-creating Axcentra partner_configs entry...");
    const { error: insertPErr } = await supabaseAdmin.from("partner_configs").upsert({
      slug: "axcentra",
      hackathon_id: axcentraHackathonId,
      partner_name: "Axcentra x All India Hackathon",
      tagline: "The Flagship 72-Hour National Innovation Sprint. Find your team and build the future.",
      brand_color: "#3B82F6",
      accent_color: "#8B5CF6",
      logo_url: "/partners/axcentra-full-logo-transparent.png",
      override_prize_pool: "₹1,00,000+ Prize Pool",
      features: {
        website_url: "https://unstop.com/o/1703933",
      },
    });

    if (insertPErr) {
      console.error("❌ Error recreating Axcentra partner_config:", insertPErr.message);
    } else {
      console.log("✅ Successfully recreated Axcentra partner_config.");
    }
  }

  // 3. Ensure ALL partner hackathons in partner_configs have type = 'official' so auto-purge skips them
  const partnerHackathonIds = (configs || []).map((c) => c.hackathon_id).filter(Boolean);
  if (partnerHackathonIds.length > 0) {
    const { error: updateTypeErr } = await supabaseAdmin
      .from("hackathons")
      .update({ type: "official" })
      .in("id", partnerHackathonIds);

    if (updateTypeErr) {
      console.error("❌ Error upgrading partner hackathons type:", updateTypeErr.message);
    } else {
      console.log(`✅ Ensured all ${partnerHackathonIds.length} partner hackathons have type = 'official'.`);
    }
  }

  console.log("\n==========================================================");
  console.log("🎉  PARTNER PORTAL RESTORE CHECK COMPLETE");
  console.log("==========================================================");
}

checkAndRestorePartners();
