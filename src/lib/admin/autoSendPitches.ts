import { recordEmailBookkeeping, dispatchEmail } from "@/lib/emailDispatch";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  checkEmailBudget,
  recordEmailSendSuccess,
  OUTREACH_DAILY_CAP,
} from "@/lib/admin/emailBudgetGuard";

function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PitchLead = { id: string; title?: string; organizer_email?: string; last_sent_to?: string; pitch_sent_at?: string | null; status?: string | null };

async function readPitchRows(client: SupabaseClient, history: boolean): Promise<PitchLead[]> {
  const rows: PitchLead[] = [];
  // Paginate deduplication evidence; a single default-limited result is insufficient.
  for (let offset = 0; ; offset += 100) {
    let query = client.from("organizer_leads")
      .select("id, title, organizer_email, last_sent_to, pitch_sent_at, status").order("id");
    query = history ? query.or("pitch_sent_at.not.is.null,status.eq.email_outcome_unknown")
      : query.is("pitch_sent_at", null).not("organizer_email", "is", null);
    const { data, error } = await query.range(offset, offset + 99);
    if (error || !Array.isArray(data)) {
      console.error("[Auto Pitch] Eligibility/deduplication query unavailable:", error);
      throw new Error("Outreach eligibility could not be verified.");
    }
    rows.push(...data);
    if (data.length < 100) return rows;
  }
}

export async function autoSendPitchEmailsForLeads(supabaseAdmin: SupabaseClient, leadsToPitch?: PitchLead[], excludeLeadIds: string[] = []) {
  let leads: PitchLead[];
  let pitchedRows: PitchLead[];
  if (leadsToPitch && !leadsToPitch.length) return { attempted: 0, sent: 0, failed: 0, deferred: 0, details: [] };
  try {
    pitchedRows = await readPitchRows(supabaseAdmin, true);
    leads = await readPitchRows(supabaseAdmin, false);
    if (leadsToPitch) {
      const selected = new Set(leadsToPitch.map(lead => lead.id));
      leads = leads.filter(lead => selected.has(lead.id));
    }
  } catch (error) {
    console.error("[Auto Pitch] Cannot verify outreach eligibility:", error);
    return { attempted: 0, sent: 0, failed: 0, deferred: leadsToPitch?.length || 0, blocked: true, details: [] };
  }

  const excluded = new Set(excludeLeadIds);
  leads = leads.filter(lead => !excluded.has(lead.id));

  const pitchedEmailsSet = new Set<string>();
  (pitchedRows || []).forEach((row) => {
    if (row.organizer_email) row.organizer_email.split(",").forEach(email => pitchedEmailsSet.add(email.trim().toLowerCase()));
    if (row.last_sent_to) row.last_sent_to.split(",").forEach(email => pitchedEmailsSet.add(email.trim().toLowerCase()));
  });

  // 2. Strict Filter: Exclude any lead whose organizer_email was ALREADY pitched in DB, or appears multiple times in this batch
  const uniqueLeads: PitchLead[] = [];
  const seenEmailsInRun = new Set<string>();

  for (const lead of (leads || [])) {
    if (lead.pitch_sent_at || (lead.status && lead.status !== "new")) continue;

    const email = lead.organizer_email?.trim().toLowerCase();
    const lastSent = lead.last_sent_to?.trim().toLowerCase();

    if (email && pitchedEmailsSet.has(email)) continue;
    if (lastSent && pitchedEmailsSet.has(lastSent)) continue;
    if (email && seenEmailsInRun.has(email)) continue;

    if (email) {
      seenEmailsInRun.add(email);
    }
    uniqueLeads.push(lead);
  }

  leads = uniqueLeads;

  if (!leads || leads.length === 0) {
    return { attempted: 0, sent: 0, deferred: 0, failed: 0, details: [] };
  }

  // 3. Check Daily Send-Budget Guard (Category: outreach, Cap: 60/day)
  let budgetCheck;
  try { budgetCheck = await checkEmailBudget(supabaseAdmin, "outreach", leads.length); }
  catch (error) {
    console.error("[Auto Pitch] Budget unavailable:", error);
    return { attempted: 0, sent: 0, failed: 0, deferred: leads.length, blocked: true, details: [] };
  }

  if (budgetCheck.allowedCount === 0) {
    console.warn(`[Auto Send Pitches] Daily outreach email budget depleted (${budgetCheck.todayStats.outreach_sent}/${OUTREACH_DAILY_CAP} sent today). Deferring ${leads.length} leads to next daily run.`);
    return {
      attempted: 0,
      sent: 0,
      deferred: leads.length,
      failed: 0,
      details: [{ message: "Daily outreach budget depleted; leads deferred." }],
      budgetStats: budgetCheck,
    };
  }

  const activeLeads = leads.slice(0, budgetCheck.allowedCount);
  const deferredCount = leads.length - activeLeads.length;

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Yash from HackerMate <yash@hackermate.in>";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.hackermate.in";

  let sentCount = 0;
  let failedCount = 0;
  let attempted = 0;
  let unknown = 0;
  let sandboxAccepted = 0;
  let bookkeepingFailed = 0;
  const details: ({ id: string; dispatch?: Awaited<ReturnType<typeof dispatchEmail>>; bookkeeping?: string; error?: string })[] = [];

  const BATCH_SIZE = 5;
  for (let i = 0; i < activeLeads.length; i += BATCH_SIZE) {
    const batch = activeLeads.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (lead: PitchLead) => {
        // Guard 1: Double-send protection — skip if already pitched
        if (lead.pitch_sent_at) {
          return;
        }

        const rawEmail = lead.organizer_email?.trim();
        const lowerEmail = rawEmail?.toLowerCase();
        if (!rawEmail || !emailRegex.test(rawEmail) || (lowerEmail && pitchedEmailsSet.has(lowerEmail))) {
          failedCount++;
          details.push({ id: lead.id, error: "Invalid email regex format or already pitched" });
          return;
        }

        const hackathonTitle = lead.title || "your upcoming hackathon";
        const subject = `Sponsorship & Hackathon Team Ecosystem Partnership — ${hackathonTitle}`;

        const bodyText = `Dear Hackathon Organizing Team,

I hope this email finds you well!

We came across your event (${hackathonTitle}) and wanted to reach out regarding a strategic partnership with HackerMate (https://hackermate.in).

HackerMate is India's premier Team Operating System for hackathon builders. We help builders discover hackathons, form compatible cross-functional teams using skill-matching algorithms, and collaborate in real-time workspaces.

Through our partnership program, we offer:
1. Dedicated Co-Branded Partner Page with custom branding & logo.
2. Direct Team Matchmaking & Participant Discovery for your registered hackers.
3. Verified Digital Winner & Finalist Badges issued directly on builder profiles.

We would love to feature ${hackathonTitle} as a partner hackathon!

Please let us know if you'd be available for a brief 10-minute call or chat this week.

Best regards,
Yash Shah
Founder, HackerMate`;

        const formattedHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111; max-width: 600px; padding: 20px;">
            ${escapeHtml(bodyText).replace(/\n/g, "<br />")}
          </div>
        `;

        const trackingPixel = `<img src="${siteUrl}/api/webhooks/email-open?id=${lead.id}" width="1" height="1" style="display:none; width:1px; height:1px; opacity:0;" alt="" />`;
        const finalHtml = fromEmail.toLowerCase().includes("onboarding@resend.dev") ? formattedHtml : `${formattedHtml}\n${trackingPixel}`;

        const dispatch = await dispatchEmail({ from: fromEmail, to: rawEmail, subject, html: finalHtml,
          reply_to: process.env.OUTREACH_REPLY_TO_EMAIL?.split(",").map(e => e.trim()).filter(Boolean) || "contacthackermate@gmail.com" });
        attempted += Number(dispatch.attempted);
        if (dispatch.status === "accepted") {
          sentCount++;
          sandboxAccepted += Number(dispatch.sandbox);
        } else if (dispatch.status === "unknown") unknown++;
        else failedCount++;

        let bookkeeping = "not_required";
        // Unknown outcomes are held for review using the existing free-text CRM status.
        // This is not a durable send ledger: a failed hold write still requires operator intervention.
        if (dispatch.intendedRecipientAccepted || dispatch.status === "unknown") {
          const nowIso = new Date().toISOString();
          let write = supabaseAdmin.from("organizer_leads")
            .update(dispatch.intendedRecipientAccepted ? {
              status: "pitch_sent", last_sent_to: rawEmail, pitch_sent_at: nowIso, updated_at: nowIso,
            } : { status: "email_outcome_unknown", updated_at: nowIso })
            .eq("id", lead.id).is("pitch_sent_at", null);
          write = lead.status == null ? write.is("status", null) : write.eq("status", lead.status);
          bookkeeping = await recordEmailBookkeeping(() => write.select("id"));
          if (bookkeeping === "failed") {
            bookkeepingFailed++;
            console.error("[Auto Pitch] Dispatch outcome could not be recorded; do not resend.");
          }
          if (lowerEmail) pitchedEmailsSet.add(lowerEmail);
        }
        details.push({ id: lead.id, dispatch, bookkeeping });
      })
    );

    if (i + BATCH_SIZE < activeLeads.length) {
      await delay(200);
    }
  }

  // Acceptance consumes quota even if subsequent CRM persistence fails or targets a sandbox.
  const accounting = sentCount > 0 ? await recordEmailSendSuccess(supabaseAdmin, "outreach", sentCount) : { status: "not_required" };
  return { attempted, sent: sentCount, accepted: sentCount, intendedAccepted: sentCount - sandboxAccepted,
    sandboxAccepted, unknown, bookkeepingFailed, deferred: deferredCount, failed: failedCount, details,
    accounting, budgetStats: budgetCheck, retrySafe: false };

}

export async function autoRemoveUnopenedPitchedLeads(supabaseAdmin: SupabaseClient) {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  const { data: removedLeads, error } = await supabaseAdmin
    .from("organizer_leads")
    .update({
      status: "removed",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "pitch_sent")
    .is("opened_at", null)
    .lte("pitch_sent_at", fiveDaysAgo)
    .select("id, title");

  if (error) {
    console.error("[Auto Remove 5-Day Unpitched Leads] Error:", error);
    return { removedCount: 0, error: error.message };
  }

  const removedCount = removedLeads?.length || 0;
  if (removedCount > 0) {
    console.log(`[Auto Remove 5-Day Unpitched Leads] Automatically removed ${removedCount} organizers pitched >= 5 days ago with no response.`);
  }

  return { removedCount, removedLeads };
}
