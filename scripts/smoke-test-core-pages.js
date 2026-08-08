/**
 * HackerMate Core Pages & Team Member Join Smoke Test Script
 * 
 * Verifies:
 * 1. Static codebase audit: Ensures 0 client-side query files contain forbidden profiles(*) or profiles(...email...).
 * 2. Runtime queries: Validates /dashboard, /profile/[id], /developers, /connections, /teams & /teams/[id] (member roster join), /hackathons/sih.
 * 
 * USAGE:
 *   node scripts/smoke-test-core-pages.js
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Load environment variables
const envPath = path.join(__dirname, "..", ".env.local");
let url, anonKey;

if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, "utf8");
  url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
  anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
}

url = url || process.env.NEXT_PUBLIC_SUPABASE_URL;
anonKey = anonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("❌ Error: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.");
  process.exit(1);
}

const client = createClient(url, anonKey);

const SAFE_PROFILE_COLUMNS = "id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, sih_broadcast_sent_at, username, show_track_record";

const TEST_USER_IDS = [
  "99e1c41d-1794-4f4d-87f6-4018a3a754d2", // Yash Shah
  "4a8b139f-a35d-4c5b-a052-f3ff5b20aa76", // Khushnuma
  "bb17dac9-df03-453c-8fae-2f0bf1ae3e2b"  // Vedant
];

// Helper to recursively scan directory for files
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

async function runSmokeTests() {
  console.log("==========================================================");
  console.log("🛡️   HACKERMATE CORE PAGES & QUERY AUDIT SMOKE TEST");
  console.log("==========================================================\n");

  const results = [];

  // ── STEP 1: STATIC CODEBASE QUERY AUDIT ──
  console.log("--- 1. STATIC CODEBASE QUERY AUDIT ---");
  const srcDir = path.join(__dirname, "..", "src");
  const allSrcFiles = getAllFiles(srcDir);
  const forbiddenFiles = [];

  for (const filePath of allSrcFiles) {
    // Exclude admin API endpoints that explicitly use service role key with authorization checks
    if (filePath.includes(path.join("api", "admin")) || filePath.includes(path.join("api", "sih", "spoc")) || filePath.includes(path.join("api", "send-email"))) {
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const relativePath = path.relative(path.join(__dirname, ".."), filePath);

    // Check for forbidden query patterns: profiles(*) or profiles(...email...) in client queries
    if (content.includes("profiles(*)") || /profiles\([^)]*email[^)]*\)/.test(content) || /\.from\(["']profiles["']\)\.select\(["']\*["']\)/.test(content)) {
      forbiddenFiles.push(relativePath);
    }
  }

  if (forbiddenFiles.length > 0) {
    results.push({
      page: "Static Code Audit",
      status: "FAIL ❌",
      details: `Forbidden profiles(*) or profiles(...email...) found in ${forbiddenFiles.length} files: ${forbiddenFiles.join(", ")}`
    });
  } else {
    results.push({
      page: "Static Code Audit",
      status: "PASS ✅",
      details: "All client files use explicit safe column projections (0 wildcard/email leaks)"
    });
  }

  // ── STEP 2: RUNTIME CORE PAGE QUERIES ──

  // /dashboard
  try {
    const { data: profile, error: pErr } = await client
      .from("profiles")
      .select(SAFE_PROFILE_COLUMNS)
      .eq("id", TEST_USER_IDS[0])
      .single();

    const { count: buildersCount, error: cErr } = await client
      .from("profiles")
      .select("id", { count: "exact", head: true });

    if (pErr || cErr || !profile || !profile.full_name || (buildersCount ?? 0) === 0) {
      results.push({ page: "/dashboard", status: "FAIL ❌", details: pErr?.message || cErr?.message || "Empty profile or 0 network count" });
    } else {
      results.push({ page: "/dashboard", status: "PASS ✅", details: `User: "${profile.full_name}", Network Count: ${buildersCount}` });
    }
  } catch (err) {
    results.push({ page: "/dashboard", status: "FAIL ❌", details: err.message });
  }

  // /profile/[id]
  try {
    let successCount = 0;
    const loadedNames = [];
    for (const id of TEST_USER_IDS) {
      const { data: pData, error: pErr } = await client
        .from("profiles")
        .select(SAFE_PROFILE_COLUMNS)
        .eq("id", id)
        .single();

      if (!pErr && pData?.full_name) {
        successCount++;
        loadedNames.push(pData.full_name);
      }
    }

    if (successCount === TEST_USER_IDS.length) {
      results.push({ page: "/profile/[id]", status: "PASS ✅", details: `Successfully loaded 3/3 real profiles: ${loadedNames.join(", ")}` });
    } else {
      results.push({ page: "/profile/[id]", status: "FAIL ❌", details: `Loaded ${successCount}/${TEST_USER_IDS.length} profiles` });
    }
  } catch (err) {
    results.push({ page: "/profile/[id]", status: "FAIL ❌", details: err.message });
  }

  // /developers
  try {
    const { data: devs, error: devErr } = await client
      .from("profiles")
      .select(SAFE_PROFILE_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(50);

    if (devErr || !devs || devs.length === 0) {
      results.push({ page: "/developers", status: "FAIL ❌", details: devErr?.message || "Loaded 0 developers" });
    } else {
      results.push({ page: "/developers", status: "PASS ✅", details: `Loaded ${devs.length} builders cleanly` });
    }
  } catch (err) {
    results.push({ page: "/developers", status: "FAIL ❌", details: err.message });
  }

  // /connections
  try {
    const { data: connProfiles, error: connErr } = await client
      .from("profiles")
      .select("id, full_name, avatar_url, college")
      .limit(10);

    if (connErr || !connProfiles || connProfiles.length === 0) {
      results.push({ page: "/connections", status: "FAIL ❌", details: connErr?.message || "Loaded 0 profiles" });
    } else {
      results.push({ page: "/connections", status: "PASS ✅", details: `Loaded ${connProfiles.length} partner profiles` });
    }
  } catch (err) {
    results.push({ page: "/connections", status: "FAIL ❌", details: err.message });
  }

  // /teams/[id] (Team Member Roster Join Pattern)
  try {
    const teamId = "4fe7e7b8-6010-436d-9954-383d9aa3c340"; // The Builders
    const { data: memberData, error: memberErr } = await client
      .from("team_members")
      .select(`id, role, project_role, profiles(id, full_name, avatar_url, skills, gender)`)
      .eq("team_id", teamId);

    if (memberErr || !memberData || memberData.length === 0) {
      results.push({ page: "/teams/[id] Roster", status: "FAIL ❌", details: memberErr?.message || "Loaded 0 team members" });
    } else {
      const memberNames = memberData.map(m => m.profiles?.full_name).filter(Boolean);
      results.push({ page: "/teams/[id] Roster", status: "PASS ✅", details: `Loaded ${memberData.length} team members: ${memberNames.join(", ")}` });
    }
  } catch (err) {
    results.push({ page: "/teams/[id] Roster", status: "FAIL ❌", details: err.message });
  }

  // /hackathons/sih
  try {
    const { data: sihRegs, error: sihErr } = await client
      .from("hackathon_registrations")
      .select("user_id, looking_for_team, profiles(id, full_name, avatar_url, college, skills, gender, role)")
      .limit(5);

    if (sihErr || !sihRegs || sihRegs.length === 0) {
      results.push({ page: "/hackathons/sih", status: "FAIL ❌", details: sihErr?.message || "Loaded 0 registrations" });
    } else {
      results.push({ page: "/hackathons/sih", status: "PASS ✅", details: `Loaded ${sihRegs.length} SIH registrations with joined profiles` });
    }
  } catch (err) {
    results.push({ page: "/hackathons/sih", status: "FAIL ❌", details: err.message });
  }

  // ── PRINT SUMMARY ──
  console.log("--- CORE PAGES SMOKE TEST SUMMARY ---");
  let hasFailed = false;
  results.forEach((res) => {
    console.log(`${res.page.padEnd(20)} | ${res.status.padEnd(10)} | ${res.details}`);
    if (res.status.includes("FAIL")) hasFailed = true;
  });

  console.log("\n==========================================================");
  if (hasFailed) {
    console.error("❌ SMOKE TEST FAILED: One or more audit or page query checks failed.");
    process.exit(1);
  } else {
    console.log("✅ SMOKE TEST PASSED: All static audit and page query checks passed cleanly!");
    process.exit(0);
  }
}

runSmokeTests();
