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

async function cleanupBadLeads() {
  console.log("==========================================================");
  console.log("🧹  HACKERMATE BAD LEADS CLEANUP SCRIPT");
  console.log("==========================================================\n");

  const trackerDomains = ["infegy.com", "w3.org", "schema.org", "sentry", "example.com", "domain.com"];

  for (const domain of trackerDomains) {
    console.log(`Checking for leads containing "${domain}"...`);
    
    // Update matching rows to status = 'no_email', clear organizer_email and last_sent_to
    const { data: updated, error } = await supabaseAdmin
      .from("organizer_leads")
      .update({
        organizer_email: null,
        status: "no_email",
        pitch_sent_at: null,
        last_sent_to: null,
        updated_at: new Date().toISOString(),
      })
      .or(`organizer_email.ilike.%${domain}%,last_sent_to.ilike.%${domain}%`)
      .select("id, title, organizer_email");

    if (error) {
      console.error(`❌ Error updating leads for domain ${domain}:`, error.message);
    } else {
      console.log(`✅ Reset ${updated?.length || 0} bad lead records for domain "${domain}".`);
    }
  }

  console.log("\n==========================================================");
  console.log("🎉  CLEANUP COMPLETE");
  console.log("==========================================================");
}

cleanupBadLeads();
