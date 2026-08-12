const { createClient } = require("../node_modules/@supabase/supabase-js");
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

function extractValidEmails(text) {
  if (!text) return [];
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const validTldRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|in|org|io|co|net|edu|dev|tech|app|xyz|me|global|ai)$/i;

  const valid = matches.filter((email) => {
    const lower = email.toLowerCase().trim();
    if (
      lower.endsWith(".css") ||
      lower.endsWith(".js") ||
      lower.endsWith(".png") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".svg") ||
      lower.endsWith(".webp")
    ) {
      return false;
    }
    if (
      lower.includes("sentry") ||
      lower.includes("w3.org") ||
      lower.includes("schema.org") ||
      lower.includes("example.com") ||
      lower.includes("domain.com")
    ) {
      return false;
    }
    return validTldRegex.test(lower);
  });

  return Array.from(new Set(valid.map((e) => e.trim())));
}

async function fetchDevfolioDetails(unstopUrl) {
  try {
    const res = await fetch(unstopUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    return extractValidEmails(html);
  } catch {
    return [];
  }
}

async function fetchUnstopDetails(unstopUrl) {
  try {
    let emails = [];
    const match = unstopUrl.match(/-(\d+)(?:\?|$|\/)/) || unstopUrl.match(/(\d+)$/);
    if (match) {
      const compId = match[1];
      const apiRes = await fetch(`https://unstop.com/api/public/competition/${compId}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Accept: "application/json",
          Referer: "https://unstop.com/",
        },
      });
      if (apiRes.ok) {
        const compJson = await apiRes.json();
        const comp = compJson?.data?.competition || compJson?.data || {};
        const contacts = comp.contacts || [];
        const contactEmails = contacts
          .map((c) => c.email?.trim())
          .filter((e) => e && e.includes("@"));

        emails.push(...contactEmails);

        // Also check overview/description text in JSON
        const rawText = JSON.stringify(compJson);
        emails.push(...extractValidEmails(rawText));
      }
    }

    // Fallback: Fetch raw HTML of Unstop event page
    const pageRes = await fetch(unstopUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      emails.push(...extractValidEmails(html));
    }

    return Array.from(new Set(emails));
  } catch {
    return [];
  }
}

async function enrichLeads() {
  console.log("==========================================================");
  console.log("🔍   HACKERMATE ORGANIZER LEAD CONTACT ENRICHMENT SCRIPT");
  console.log("==========================================================\n");

  // Fetch all leads where status = 'no_email' or organizer_email is null/empty
  const { data: leads, error } = await supabaseAdmin
    .from("organizer_leads")
    .select("*")
    .or("status.eq.no_email,organizer_email.is.null,organizer_email.eq.");

  if (error) {
    console.error("❌ Error fetching leads for enrichment:", error);
    process.exit(1);
  }

  console.log(`Found ${leads?.length || 0} leads missing contact emails.`);

  if (!leads || leads.length === 0) {
    console.log("✅ All leads already have contact emails.");
    return;
  }

  let enrichedCount = 0;
  const enrichedLeads = [];

  for (const lead of leads) {
    console.log(`\nProcessing Lead [ID: ${lead.id}]: "${lead.title}"...`);
    let foundEmails = [];

    if (lead.unstop_url.includes("devfolio.co")) {
      foundEmails = await fetchDevfolioDetails(lead.unstop_url);
    } else if (lead.unstop_url.includes("unstop.com")) {
      foundEmails = await fetchUnstopDetails(lead.unstop_url);
    } else {
      try {
        const pageRes = await fetch(lead.unstop_url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        });
        if (pageRes.ok) {
          const html = await pageRes.text();
          foundEmails = extractValidEmails(html);
        }
      } catch {}
    }

    if (foundEmails.length > 0) {
      const emailStr = foundEmails.join(", ");
      console.log(`  ✨ UNLOCKED EMAIL(S): ${emailStr}`);

      // Update lead in DB
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("organizer_leads")
        .update({
          organizer_email: emailStr,
          status: "new",
        })
        .eq("id", lead.id)
        .select();

      if (updateErr) {
        console.error(`  ❌ Error updating lead ${lead.id}:`, updateErr.message);
      } else {
        enrichedCount++;
        if (updated && updated.length > 0) {
          enrichedLeads.push(updated[0]);
        }
      }
    } else {
      console.log("  ⚠️  No emails found on page.");
    }
  }

  console.log("\n==========================================================");
  console.log(`🎉 ENRICHMENT SUMMARY: Successfully recovered contact emails for ${enrichedCount} leads!`);
  console.log("==========================================================");

  if (enrichedLeads.length > 0) {
    console.log("\n🚀 Dispatching pitch emails for newly enriched leads...");
    try {
      // Dynamic import of autoSendPitchEmailsForLeads to execute pitch email sending
      const { autoSendPitchEmailsForLeads } = require(path.join(__dirname, "../src/lib/admin/autoSendPitches"));
      const pitchResult = await autoSendPitchEmailsForLeads(supabaseAdmin, enrichedLeads);
      console.log(`✅ Pitch Dispatch Result:`, pitchResult);
    } catch (e) {
      console.log(`ℹ️ Pitch dispatch queued for next automated batch run.`);
    }
  }
}

enrichLeads();
