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
    const registration_start =
      opp.regnRequirements?.start_regn_dt || null;

    const registration_end =
      opp.regnRequirements?.end_regn_dt || null;

    const registration_status =
      opp.regnRequirements?.reg_status || null;

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

    const tagsSet = new Set((opp.tags || []).filter((t) => t.name).map((t) => t.name.trim()));
    const fullTextLower = `${name} ${description}`.toLowerCase();

    // 1. Keyword-based matching from title & description text
    const keywordRules = {
      "AI": ["ai", "artificial intelligence", "ml", "machine learning", "deep learning", "nlp", "llm", "openai", "gpt", "generative", "vision", "chatgpt", "tensorflow", "pytorch"],
      "Web3": ["web3", "blockchain", "solidity", "crypto", "ethereum", "smart contract", "polygon", "bitcoin", "nft", "dapp", "defi"],
      "Design": ["design", "ui", "ux", "figma", "frontend", "wireframe", "prototype", "styling", "css"],
      "Mobile": ["mobile", "android", "ios", "flutter", "react native", "swift", "kotlin", "app"],
      "Cloud": ["cloud", "aws", "gcp", "azure", "devops", "docker", "kubernetes", "serverless"],
      "Security": ["security", "cybersecurity", "hacking", "cryptography", "infosec", "penetration"],
      "Fintech": ["fintech", "finance", "payment", "banking", "transaction", "ledger"],
      "Edtech": ["edtech", "education", "learning", "classroom", "student"],
      "Healthtech": ["health", "healthcare", "medical", "biotech", "fitness", "wellness"],
      "IoT": ["iot", "hardware", "arduino", "raspberry pi", "sensor", "embedded"],
      "AR/VR": ["ar/vr", "ar", "vr", "augmented reality", "virtual reality", "metaverse", "unity", "unreal"],
      "GameDev": ["game", "gaming", "unreal engine", "unity3d", "playstation", "xbox"],
      "Web": ["web", "website", "react", "next.js", "angular", "vue", "html", "javascript", "typescript", "backend", "api"],
      "Coding": ["code", "coding", "programming", "developer", "software", "c++", "java", "python", "rust", "golang"]
    };

    for (const [tag, keywords] of Object.entries(keywordRules)) {
      if (keywords.some(keyword => {
        // Matches whole words or phrases to avoid false matches (e.g. "rain" in "train")
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "i").test(fullTextLower);
      })) {
        tagsSet.add(tag);
      }
    }

    // 2. Guarantee at least 3 tags by backfilling defaults if needed
    const fallbacks = ["Coding", "Hackathon", "Innovation", "Web", "Design"];
    for (const fallback of fallbacks) {
      if (tagsSet.size >= 3) break;
      tagsSet.add(fallback);
    }

    return {
      id: uuid,
      name,
      description,
      start_date,
      end_date,
      registration_start,
      registration_end,
      registration_status,
      location,
      mode,
      prize_pool,
      website_url: `https://unstop.com/${opp.public_url}`,
      type: "external",
      tags: Array.from(tagsSet).slice(0, 5),
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!supabaseUrl) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL environment variable not found.");
  process.exit(1);
}

  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log("Initializing Supabase Admin Client...");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 3. Fetch from Unstop
const all = await fetchUnstop(1000);
const today = new Date().toISOString().split("T")[0];
const now = new Date();

// Only keep hackathons whose registrations are currently open
const hackathons = all.filter((h) => {
  return (
    h.registration_status === "STARTED" &&
    h.registration_end &&
    new Date(h.registration_end) > now
  );
});

const filteredCount = all.length - hackathons.length;

console.log(
  `\n📊 Fetched ${all.length} total  →  ${hackathons.length} open for registration  |  ${filteredCount} filtered out`
);

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
      .lt("registration_end", new Date().toISOString());

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