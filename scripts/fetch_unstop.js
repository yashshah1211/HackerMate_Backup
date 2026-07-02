/* eslint-disable */
const fs = require("fs");
const path = require("path");

async function fetchUnstopHackathons() {
  const url = "https://unstop.com/api/public/opportunity/search-new?opportunity=hackathons&per_page=120&page=1";
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  console.log("Fetching hackathons from Unstop...");
  try {
    const res = await fetch(url, { headers });
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

    const sqlStatements = [];
    sqlStatements.push("-- Seed hackathons crawled from Unstop");
    for (const opp of opportunities) {
      // 1. Generate a deterministic valid UUID from Unstop Numeric ID
      const numericId = opp.id;
      const uuid = `00000000-0000-0000-0000-${numericId.toString().padStart(12, "0")}`;

      // 2. Clean Name
      const name = opp.title.replace(/'/g, "''").trim();

      // 3. Strip HTML from details to make clean text description
      let description = opp.details || "No description provided.";
      description = description
        .replace(/<[^>]*>/g, "") // Strip HTML tags
        .replace(/&nbsp;/g, " ") // Clean spaces
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/'/g, "''") // Escape SQL single quotes
        .replace(/\n+/g, " ") // Make single line for SQL compatibility
        .trim();

      // No truncation to ensure complete descriptions are seeded in Supabase

      // 4. Dates
      const start_date = opp.start_date || null;
      const end_date = opp.end_date || null;

      // 5. Locations & Mode
      let location = "Online";
      let mode = "online";
      if (opp.locations && opp.locations.length > 0) {
        location = opp.locations.join(", ").replace(/'/g, "''");
        mode = "in-person";
      } else if (opp.subtype && opp.subtype.toLowerCase().includes("offline")) {
        location = "Venue in India";
        mode = "in-person";
      }

      // 6. Prize Pool Formatting
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
          prize_pool = topPrize.others.replace(/'/g, "''").slice(0, 50);
        }
      }

      // 7. Website Registration URL
      const website_url = `https://unstop.com/${opp.public_url}`;

      // 8. Tags mapping
      const tagsList = [];
      if (opp.tags && opp.tags.length > 0) {
        opp.tags.forEach(t => {
          if (t.name) tagsList.push(t.name.replace(/'/g, ""));
        });
      }
      // Add custom smart tags based on title/description
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
      const tagsSql = uniqueTags.length > 0 
        ? `ARRAY[${uniqueTags.map(t => `'${t}'`).join(", ")}]`
        : "NULL";

      sqlStatements.push(`INSERT INTO hackathons (id, name, description, start_date, end_date, location, mode, prize_pool, website_url, type, tags) VALUES ('${uuid}', '${name}', '${description}', '${start_date}', '${end_date}', '${location}', '${mode}', '${prize_pool}', '${website_url}', 'external', ${tagsSql}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, location = EXCLUDED.location, mode = EXCLUDED.mode, prize_pool = EXCLUDED.prize_pool, website_url = EXCLUDED.website_url, tags = EXCLUDED.tags;`);
    }

    const sqlContent = sqlStatements.join("\n");
    const scratchDir = path.join(__dirname, "..");
    
    const outputPath = path.join(scratchDir, "seed_unstop_hackathons.sql");
    fs.writeFileSync(outputPath, sqlContent, "utf-8");
    console.log(`\nSUCCESS: SQL seed file written to: ${outputPath}`);
  } catch (error) {
    console.error("Error fetching or formatting hackathons:", error);
  }
}

fetchUnstopHackathons();
