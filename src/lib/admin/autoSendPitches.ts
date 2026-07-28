import { SupabaseClient } from "@supabase/supabase-js";
import {
  checkAndReserveEmailBudget,
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

export async function autoSendPitchEmailsForLeads(
  supabaseAdmin: SupabaseClient,
  leadsToPitch?: any[]
) {
  let leads = leadsToPitch;

  // If no specific leads list passed, fetch all pending leads where pitch_sent_at is null
  if (!leads || leads.length === 0) {
    const { data: pendingLeads } = await supabaseAdmin
      .from("organizer_leads")
      .select("*")
      .is("pitch_sent_at", null)
      .not("organizer_email", "is", null);
    leads = pendingLeads || [];
  }

  if (!leads || leads.length === 0) {
    return { attempted: 0, sent: 0, deferred: 0, failed: 0, details: [] };
  }

  // 1. Check Daily Send-Budget Guard (Category: outreach, Cap: 60/day)
  const budgetCheck = await checkAndReserveEmailBudget(supabaseAdmin, "outreach", leads.length);

  if (budgetCheck.allowedCount === 0) {
    console.warn(`[Auto Send Pitches] Daily outreach email budget depleted (${budgetCheck.todayStats.outreach_sent}/${OUTREACH_DAILY_CAP} sent today). Deferring ${leads.length} leads to next daily run.`);
    return {
      attempted: leads.length,
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
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Yash from HackerMate <onboarding@resend.dev>";
  const isSandboxMode = fromEmail.includes("onboarding@resend.dev");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.hackermate.in";

  let sentCount = 0;
  let failedCount = 0;
  const details: any[] = [];

  const BATCH_SIZE = 5;
  for (let i = 0; i < activeLeads.length; i += BATCH_SIZE) {
    const batch = activeLeads.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (lead: any) => {
        // Guard 1: Double-send protection — skip if already pitched
        if (lead.pitch_sent_at) {
          return;
        }

        const rawEmail = lead.organizer_email?.trim();
        if (!rawEmail || !emailRegex.test(rawEmail)) {
          failedCount++;
          details.push({ id: lead.id, email: rawEmail, error: "Invalid email regex format" });
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
        const finalHtml = `${formattedHtml}\n${trackingPixel}`;

        let targetEmail = rawEmail;
        let finalSubject = subject;

        if (isSandboxMode) {
          const sandboxEmail = process.env.RESEND_SANDBOX_RECIPIENT || "yashshah7117@gmail.com";
          if (targetEmail.toLowerCase() !== sandboxEmail.toLowerCase()) {
            finalSubject = `[Target: ${targetEmail}] ${subject}`;
            targetEmail = sandboxEmail;
          }
        }

        let resendMessageId: string | null = null;

        if (resendApiKey) {
          try {
            const resendRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resendApiKey}`,
              },
              body: JSON.stringify({
                from: fromEmail,
                to: targetEmail,
                reply_to: "yashshah7117@gmail.com",
                subject: finalSubject,
                html: finalHtml,
              }),
            });

            const resendData = await resendRes.json();

            if (resendRes.ok && resendData?.id) {
              resendMessageId = resendData.id;
            } else {
              failedCount++;
              details.push({ id: lead.id, email: rawEmail, error: resendData?.message || "Resend API Error" });
              return;
            }
          } catch (e: any) {
            failedCount++;
            details.push({ id: lead.id, email: rawEmail, error: e.message });
            return;
          }
        } else {
          console.log(`\n[MOCK AUTOMATED PITCH EMAIL] To: ${targetEmail} | Lead: ${hackathonTitle}`);
          resendMessageId = "mock_pitch_id";
        }

        // Update DB status ONLY AFTER confirmed successful email dispatch
        const nowIso = new Date().toISOString();
        const { error: dbErr } = await supabaseAdmin
          .from("organizer_leads")
          .update({
            status: "pitch_sent",
            last_sent_to: rawEmail,
            pitch_sent_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", lead.id);

        if (dbErr) {
          failedCount++;
          details.push({ id: lead.id, email: rawEmail, error: "DB Update Failed: " + dbErr.message });
        } else {
          sentCount++;
          details.push({ id: lead.id, email: rawEmail, status: "sent", resendId: resendMessageId });
        }
      })
    );

    if (i + BATCH_SIZE < activeLeads.length) {
      await delay(200);
    }
  }

  // Record successful outreach sends in persistent daily stats
  if (sentCount > 0) {
    await recordEmailSendSuccess(supabaseAdmin, "outreach", sentCount);
  }

  return {
    attempted: leads.length,
    sent: sentCount,
    deferred: deferredCount,
    failed: failedCount,
    details,
    budgetStats: budgetCheck,
  };
}
