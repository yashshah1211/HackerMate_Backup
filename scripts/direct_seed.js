/* eslint-disable */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

async function runDirectSeed() {
  // 1. Parse service role key from arguments
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
  if (!urlMatch || !urlMatch[1]) {
    console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL not found in .env.local");
    process.exit(1);
  }
  const supabaseUrl = urlMatch[1].trim();

  console.log(`Supabase URL found: ${supabaseUrl}`);
  console.log("Initializing Supabase Admin Client...");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 3. Fetch from Unstop Opportunities API
  const unstopUrl = "https://unstop.com/api/public/opportunity/search-new?opportunity=hackathons&per_page=120&page=1";
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  console.log("Fetching hackathons from Unstop...");
  try {
    const res = await fetch(unstopUrl, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
    }

    const payload = await res.json();
    const opportunities = payload?.data?.data || [];
    console.log(`Successfully fetched ${opportunities.length} opportunities from Unstop.`);

    if (opportunities.length === 0) {
      console.log("No opportunities found.");
      return;
    }

    // 4. Map to database objects
    const hackathons = opportunities.map(opp => {
      const numericId = opp.id;
      const uuid = `00000000-0000-0000-0000-${numericId.toString().padStart(12, "0")}`;
      const name = opp.title.trim();

      // Preserve HTML formatting from description
      let description = opp.details || "No description provided.";
      description = description.trim();

      const start_date = opp.start_date || null;
      const end_date = opp.end_date || null;

      let location = "Online";
      let mode = "online";
      if (opp.locations && opp.locations.length > 0) {
        location = opp.locations.join(", ");
        mode = "in-person";
      } else if (opp.subtype && opp.subtype.toLowerCase().includes("offline")) {
        location = "Venue in India";
        mode = "in-person";
      }

      let prize_pool = "Certificate & Perks";
      if (opp.prizes && opp.prizes.length > 0) {
        const topPrize = opp.prizes[0];
        if (topPrize.cash) {
          const cashVal = Number(topPrize.cash).toLocaleString("en-IN");
          prize_pool = `₹ ${cashVal}`;
          if (topPrize.pre_placement_interview || topPrize.pre_placement_opportunity) {
            prize_pool += " + Job Offer/PPI";
          }
        } else if (topPrize.others) {
          prize_pool = topPrize.others.slice(0, 50);
        }
      }

      const website_url = `https://unstop.com/${opp.public_url}`;

      const tagsList = [];
      if (opp.tags && opp.tags.length > 0) {
        opp.tags.forEach(t => {
          if (t.name) tagsList.push(t.name.trim());
        });
      }
      
      const titleLower = name.toLowerCase();
      if (titleLower.includes("ai") || titleLower.includes("intelligence") || titleLower.includes("gpt")) {
        tagsList.push("AI");
      }
      if (titleLower.includes("web3") || titleLower.includes("blockchain") || titleLower.includes("crypto")) {
        tagsList.push("Web3");
      }
      if (titleLower.includes("design") || titleLower.includes("ui") || titleLower.includes("ux")) {
        tagsList.push("Design");
      }
      if (titleLower.includes("code") || titleLower.includes("coding") || titleLower.includes("dev")) {
        tagsList.push("Coding");
      }
      
      const uniqueTags = [...new Set(tagsList)].slice(0, 5);

      return {
        id: uuid,
        name,
        description,
        start_date,
        end_date,
        location,
        mode,
        prize_pool,
        website_url,
        type: "external",
        tags: uniqueTags.length > 0 ? uniqueTags : null
      };
    });

    console.log(`Formatted ${hackathons.length} hackathons. Starting Supabase upload...`);

    // 5. Bulk upsert using Supabase JS client
    const { data, error } = await supabase
      .from("hackathons")
      .upsert(hackathons, { onConflict: "id" });

    if (error) {
      throw error;
    }

    console.log("\nSUCCESS: All 120 hackathons successfully imported directly into your database! 🎉");
  } catch (error) {
    console.error("\nAPI Seeding Failed:", error.message || error);
  }
}

runDirectSeed();
