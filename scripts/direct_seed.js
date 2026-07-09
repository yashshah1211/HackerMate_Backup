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

// ─── Fetch from Hack2skill ──────────────────────────────────────────────────
async function fetchHack2skill() {
  console.log(`\n📦 Fetching hackathons from Hack2skill...`);
  let allEvents = [];
  let page = 1;
  
  while (true) {
    const listUrl = `https://hack2skill.com/api/v1/innovator/public/event/public-list?page=${page}`;
    console.log(`  → Page ${page} (Hack2skill)...`);
    
    try {
      const res = await fetch(listUrl, { headers: HEADERS });
      if (!res.ok) {
        console.warn(`  ⚠️ Failed to fetch page ${page}: ${res.status}`);
        break;
      }
      const json = await res.json();
      if (!json.success || !json.data || json.data.length === 0) {
        break;
      }
      
      allEvents.push(...json.data);
      page++;
      if (page > json.pages) break;
    } catch (err) {
      console.error(`  ⚠️ Error fetching Hack2skill page ${page}:`, err.message);
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`  ✓ Fetched ${allEvents.length} list items from Hack2skill.`);

  const now = new Date();
  const upcomingEvents = allEvents.filter((opp) => {
    return opp.registrationEnd && new Date(opp.registrationEnd) > now;
  });
  console.log(`  → ${upcomingEvents.length} events are active/upcoming. Fetching details...`);

  const results = [];
  for (const opp of upcomingEvents) {
    const detailsUrl = `https://hack2skill.com/api/v1/event/${opp.eventUrl}/event-details`;
    console.log(`    Fetch details for: ${opp.eventUrl}...`);
    try {
      const res = await fetch(detailsUrl, { headers: HEADERS });
      if (!res.ok) continue;
      const json = await res.json();
      if (!json.success || !json.data) continue;
      
      const detail = json.data;
      
      let description = "No description provided.";
      if (detail.sections) {
        const aboutSec = detail.sections.find(s => s && s.type === "ABOUT");
        if (aboutSec && aboutSec.category && aboutSec.category[0] && aboutSec.category[0].data && aboutSec.category[0].data[0]) {
          description = aboutSec.category[0].data[0].description || "No description provided.";
        }
      }
      
      description = description
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();

      let prize_pool = "Certificate & Perks";
      if (detail.sections) {
        const prizeSec = detail.sections.find(s => s && (s.type === "PRIZES" || s.type === "REWARDS" || s.title?.toUpperCase().includes("PRIZE")));
        if (prizeSec && prizeSec.category) {
          const prizeData = prizeSec.category.flatMap(c => c.data || []);
          const prizesText = prizeData.map(p => `${p.title || ""}: ${p.description || ""}`).join(" ").replace(/<[^>]*>/g, "");
          const matchCash = prizesText.match(/[₹$]\s*\d+([,.\d]*\d+)?/);
          if (matchCash) {
            prize_pool = matchCash[0];
          } else {
            const valMatch = prizeData.find(p => p.value);
            if (valMatch) {
              prize_pool = `${valMatch.currency || "₹"} ${Number(valMatch.value).toLocaleString("en-IN")}`;
            }
          }
        }
      }

      const mongoId = opp._id;
      const uuid = `00000000-${mongoId.substring(0, 8)}-${mongoId.substring(8, 12)}-${mongoId.substring(12, 16)}-${mongoId.substring(16, 20)}-${mongoId.substring(20, 24)}`;

      const tagsSet = new Set(["Hack2skill"]);
      const titleLower = opp.title.toLowerCase();
      const descLower = description.toLowerCase();
      const textToMatch = `${titleLower} ${descLower}`;

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
          const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "i").test(textToMatch);
        })) {
          tagsSet.add(tag);
        }
      }

      const fallbacks = ["Coding", "Hackathon", "Innovation", "Web", "Design"];
      for (const fallback of fallbacks) {
        if (tagsSet.size >= 3) break;
        tagsSet.add(fallback);
      }

      let mode = "online";
      if (opp.mode?.toLowerCase() === "offline" || opp.mode?.toLowerCase() === "in_person" || opp.mode?.toLowerCase() === "hybrid") {
        mode = "in-person";
      }

      results.push({
        id: uuid,
        name: opp.title.trim(),
        description,
        start_date: opp.registrationStart,
        end_date: opp.registrationEnd,
        registration_start: opp.registrationStart,
        registration_end: opp.registrationEnd,
        registration_status: "STARTED",
        location: opp.mode === "VIRTUAL" ? "Online" : "Venue in India",
        mode,
        prize_pool,
        website_url: `https://hack2skill.com/event/${opp.eventUrl}`,
        type: "external",
        tags: Array.from(tagsSet).slice(0, 5)
      });

    } catch (err) {
      console.error(`    ⚠️ Failed to fetch details for ${opp.eventUrl}:`, err.message);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`  ✓ Successfully processed ${results.length} Hack2skill hackathons.`);
  return results;
}

// ─── Fetch from Devfolio ────────────────────────────────────────────────────
async function fetchDevfolio() {
  console.log(`\n📦 Fetching hackathons from Devfolio...`);
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html"
  };

  let list = [];
  try {
    const res = await fetch("https://devfolio.co/hackathons", { headers });
    if (!res.ok) {
      console.error(`  ⚠️ Failed to fetch Devfolio main page: ${res.status}`);
      return [];
    }
    const html = await res.text();
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!nextDataMatch) {
      console.warn("  ⚠️ No __NEXT_DATA__ found on Devfolio page.");
      return [];
    }

    const nextData = JSON.parse(nextDataMatch[1]);
    const queries = nextData?.props?.pageProps?.dehydratedState?.queries || [];
    const hackathonQuery = queries.find(q => q.queryKey === "fetchAllHackathonTypes");
    if (!hackathonQuery || !hackathonQuery.state || !hackathonQuery.state.data) {
      console.warn("  ⚠️ No hackathon query found in Devfolio dehydratedState.");
      return [];
    }

    const data = hackathonQuery.state.data;
    const open = data.open_hackathons || [];
    const upcoming = data.upcoming_hackathons || [];
    list = [...open, ...upcoming];
  } catch (err) {
    console.error("  ⚠️ Error fetching/parsing Devfolio list:", err.message);
    return [];
  }

  console.log(`  ✓ Found ${list.length} upcoming/open hackathons in Devfolio cache. Fetching details...`);

  const results = [];
  for (const opp of list) {
    if (!opp.slug) continue;
    const detailsUrl = `https://api.devfolio.co/api/hackathons/${opp.slug}`;
    console.log(`    Fetch details for: ${opp.slug}...`);
    try {
      const res = await fetch(detailsUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json"
        }
      });
      if (!res.ok) continue;
      const detail = await res.json();
      if (!detail || !detail.uuid) continue;

      let description = detail.desc || detail.tagline || "No description provided.";
      description = description
        .replace(/<[^>]*>/g, "")
        .replace(/[*#_~`\[\]()]+/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();

      let prize_pool = "Certificate & Perks";
      const prizeRegexes = [
        /[₹$]\s*\d+([,.\d]*\d+)?\s*(?:lakh|k|million|thousand)?/i,
        /(?:prize|pool|reward|worth)\s+(?:of\s+)?(?:₹|$)?\s*\d+([,.\d]*\d+)?/i
      ];

      for (const rx of prizeRegexes) {
        const match = description.match(rx);
        if (match) {
          prize_pool = match[0].trim();
          break;
        }
      }

      const u = detail.uuid;
      const formattedUuid = `${u.substring(0, 8)}-${u.substring(8, 12)}-${u.substring(12, 16)}-${u.substring(16, 20)}-${u.substring(20)}`;

      const tagsSet = new Set(["Devfolio"]);
      const titleLower = detail.name.toLowerCase();
      const descLower = description.toLowerCase();
      const textToMatch = `${titleLower} ${descLower}`;

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
          const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "i").test(textToMatch);
        })) {
          tagsSet.add(tag);
        }
      }

      if (detail.themes) {
        detail.themes.forEach(t => {
          if (t.theme && t.theme.name) {
            const cleanTheme = t.theme.name.trim();
            if (cleanTheme && cleanTheme !== "No Restrictions" && cleanTheme.length < 20) {
              tagsSet.add(cleanTheme);
            }
          }
        });
      }

      const fallbacks = ["Coding", "Hackathon", "Innovation", "Web", "Design"];
      for (const fallback of fallbacks) {
        if (tagsSet.size >= 3) break;
        tagsSet.add(fallback);
      }

      const regStart = detail.hackathon_setting?.reg_starts_at || detail.starts_at;
      const regEnd = detail.hackathon_setting?.reg_ends_at || detail.ends_at;

      results.push({
        id: formattedUuid,
        name: detail.name.trim(),
        description,
        start_date: detail.starts_at,
        end_date: detail.ends_at,
        registration_start: regStart,
        registration_end: regEnd,
        registration_status: "STARTED",
        location: detail.is_online ? "Online" : detail.location || "Venue in India",
        mode: detail.is_online ? "online" : "in-person",
        prize_pool,
        website_url: `https://${opp.slug}.devfolio.co`,
        type: "external",
        tags: Array.from(tagsSet).slice(0, 5)
      });

    } catch (err) {
      console.error(`    ⚠️ Failed to fetch details for Devfolio ${opp.slug}:`, err.message);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`  ✓ Successfully processed ${results.length} Devfolio hackathons.`);
  return results;
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

  let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!supabaseUrl) {
  const envPath = path.join(__dirname, "..", ".env.local");

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);

    if (urlMatch?.[1]) {
      supabaseUrl = urlMatch[1].trim();
    }
  }
}

if (!supabaseUrl) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL not found.");
  process.exit(1);
}

  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log("Initializing Supabase Admin Client...");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 3. Fetch from Unstop
    const unstopAll = await fetchUnstop(2000);
    const unstopStats = {};
    unstopAll.forEach((h) => {
      const status = h.registration_status || "NULL";
      unstopStats[status] = (unstopStats[status] || 0) + 1;
    });

    console.log("Unstop registration status breakdown:");
    console.log(unstopStats);

    const now = new Date();

    // Only keep Unstop hackathons whose registrations are currently open
    const unstopHackathons = unstopAll.filter((h) => {
      return (
        h.registration_status === "STARTED" &&
        h.registration_end &&
        new Date(h.registration_end) > now
      );
    });

    console.log(
      `📊 Unstop: Fetched ${unstopAll.length} total  →  ${unstopHackathons.length} open for registration`
    );

    // Fetch from Hack2skill
    const hack2skillHackathons = await fetchHack2skill();

    // Fetch from Devfolio
    const devfolioHackathons = await fetchDevfolio();

    // Combine all platforms
    const hackathons = [...unstopHackathons, ...hack2skillHackathons, ...devfolioHackathons];

    if (hackathons.length === 0) {
      console.error("\nNo upcoming hackathons found from any source. Aborting.");
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