/* eslint-disable */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

// ─── Fetch from Unstop ────────────────────────────────────────────────────────
async function fetchUnstop(target = 1000) {
  console.log(`\n📦 Fetching up to ${target} hackathons from Unstop...`);
  const PER_PAGE = 100;
  let opportunities = [];
  let page = 1;

  while (opportunities.length < target) {
    const url = `https://unstop.com/api/public/opportunity/search-new?opportunity=hackathons&per_page=${PER_PAGE}&page=${page}`;
    console.log(`  → Page ${page} (${opportunities.length} collected so far)...`);

    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`Unstop page ${page} failed: ${res.status}`);

    const payload = await res.json();
    const batch = payload?.data?.data || [];
    if (batch.length === 0) { console.log(`  No more results after page ${page - 1}. Stopping.`); break; }

    opportunities.push(...batch);
    page++;

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 300));
  }

  opportunities = opportunities.slice(0, target);
  console.log(`  ✓ Fetched ${opportunities.length} from Unstop.`);

  return opportunities.map((opp) => {
    const uuid = `00000000-0000-0000-0000-${opp.id.toString().padStart(12, "0")}`;
    const name = opp.title.trim();
    const description = (opp.details || "No description provided.").trim();
    const start_date = opp.start_date || null;
    const end_date = opp.end_date || null;

    let location = "Online", mode = "online";
    if (opp.locations?.length > 0) {
      location = opp.locations.join(", "); mode = "in-person";
    } else if (opp.subtype?.toLowerCase().includes("offline")) {
      location = "Venue in India"; mode = "in-person";
    }

    let prize_pool = "Certificate & Perks";
    if (opp.prizes?.length > 0) {
      const top = opp.prizes[0];
      if (top.cash) {
        prize_pool = `₹ ${Number(top.cash).toLocaleString("en-IN")}`;
        if (top.pre_placement_interview || top.pre_placement_opportunity) prize_pool += " + PPI";
      } else if (top.others) {
        prize_pool = top.others.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, "").trim().slice(0, 50);
      }
    }

    const tagsList = (opp.tags || []).filter((t) => t.name).map((t) => t.name.trim());
    const titleLower = name.toLowerCase();
    if (titleLower.includes("ai") || titleLower.includes("intelligence") || titleLower.includes("gpt")) tagsList.push("AI");
    if (titleLower.includes("web3") || titleLower.includes("blockchain") || titleLower.includes("crypto")) tagsList.push("Web3");
    if (titleLower.includes("design") || titleLower.includes("ui") || titleLower.includes("ux")) tagsList.push("Design");
    if (titleLower.includes("code") || titleLower.includes("coding") || titleLower.includes("dev")) tagsList.push("Coding");

    return {
      id: uuid,
      name,
      description,
      start_date,
      end_date,
      location,
      mode,
      prize_pool,
      website_url: `https://unstop.com/${opp.public_url}`,
      type: "external",
      tags: [...new Set(tagsList)].slice(0, 5) || null,
    };
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function runDirectSeed() {
  // 1. Parse service role key
  const serviceRoleKey = process.argv[2];
  if (!serviceRoleKey) {
    console.error("ERROR: Please provide your Supabase Service Role Key as an argument.");
    console.log("Usage: node scripts/direct_seed.js <your_service_role_key>");
    process.exit(1);
  }

  // 2. Read Supabase URL from .env.local
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("ERROR: .env.local file not found in frontend directory.");
    process.exit(1);
  }
  const envContent = fs.readFileSync(envPath, "utf8");
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
  if (!urlMatch?.[1]) {
    console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL not found in .env.local");
    process.exit(1);
  }
  const supabaseUrl = urlMatch[1].trim();

  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log("Initializing Supabase Admin Client...");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 3. Fetch from Unstop (fetch broadly, filter to upcoming only)
    const all = await fetchUnstop(1000);
    const today = new Date().toISOString().split("T")[0];

    // Only keep hackathons that are upcoming or active (end_date >= today or no end_date)
    const hackathons = all.filter((h) => !h.end_date || h.end_date >= today);
    const pastCount = all.length - hackathons.length;

    console.log(`\n📊 Fetched ${all.length} total  →  ${hackathons.length} upcoming  |  ${pastCount} past (skipped)`);

    if (hackathons.length === 0) {
      console.error("\nNo upcoming hackathons found. Aborting.");
      return;
    }

    // 4. Delete externally-seeded hackathons that have already ended (keep DB clean)
    console.log("\n🧹 Removing expired external hackathons from database...");
    const { error: deleteError } = await supabase
      .from("hackathons")
      .delete()
      .eq("type", "external")
      .lt("end_date", today);

    if (deleteError) {
      console.warn("  ⚠️  Could not clean up expired hackathons:", deleteError.message);
    } else {
      console.log("  ✓ Expired hackathons removed.");
    }

    // 5. Upsert upcoming hackathons in batches of 100
    console.log(`\nUploading ${hackathons.length} upcoming hackathons to Supabase...`);
    const BATCH = 100;
    let uploaded = 0;
    for (let i = 0; i < hackathons.length; i += BATCH) {
      const chunk = hackathons.slice(i, i + BATCH);
      const { error } = await supabase.from("hackathons").upsert(chunk, { onConflict: "id" });
      if (error) throw error;
      uploaded += chunk.length;
      console.log(`  → Uploaded ${uploaded}/${hackathons.length}...`);
    }

    console.log(`\n✅ SUCCESS: ${hackathons.length} upcoming hackathons imported! 🎉`);
    console.log(`   Re-run this script weekly to keep listings fresh.`);
  } catch (err) {
    console.error("\n❌ Seeding Failed:", err.message || err);
  }
}

runDirectSeed();
