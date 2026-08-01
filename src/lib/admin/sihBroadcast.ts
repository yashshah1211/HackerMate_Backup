import { createClient } from "@supabase/supabase-js";
import { getOrCreateTodayStats } from "./emailBudgetGuard";

const RESEND_GLOBAL_DAILY_LIMIT = 100;

export type SIHBroadcastResult = {
  success: boolean;
  message: string;
  batchSize: number;
  sentCount: number;
  failedCount: number;
  remainingUnsentCount: number;
  todayTotalSent: number;
  details: Array<{
    id: string;
    email: string;
    status: "sent" | "failed";
    resendId?: string;
    error?: string;
  }>;
};

export async function sendSIHBroadcastBatch(requestedBatchSize: number = 50): Promise<SIHBroadcastResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rhryjrbebfrrfhtyyzbs.supabase.co";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJocnlqcmJlYmZycmZodHl5emJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjYyNTIyNiwiZXhwIjoyMDk4MjAxMjI2fQ.Z841ve1Qe1GK3zusNc381maKmhvNSehLbr89_g-elbw";

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Check today's email send stats and global budget
  const todayStats = await getOrCreateTodayStats(supabaseAdmin);
  const globalRemaining = Math.max(0, RESEND_GLOBAL_DAILY_LIMIT - (todayStats.total_sent || 0));

  if (globalRemaining <= 0) {
    return {
      success: false,
      message: `Daily Resend limit reached (${todayStats.total_sent}/${RESEND_GLOBAL_DAILY_LIMIT}). Cannot send broadcast today.`,
      batchSize: 0,
      sentCount: 0,
      failedCount: 0,
      remainingUnsentCount: 0,
      todayTotalSent: todayStats.total_sent,
      details: [],
    };
  }

  const effectiveBatchSize = Math.min(requestedBatchSize, globalRemaining);

  // 2. Count total unsent profiles
  const { count: totalUnsent } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .not("email", "is", null)
    .neq("email", "")
    .is("sih_broadcast_sent_at", null);

  const unsentCount = totalUnsent || 0;

  if (unsentCount === 0) {
    return {
      success: true,
      message: "All eligible users have already received the SIH promotional broadcast!",
      batchSize: 0,
      sentCount: 0,
      failedCount: 0,
      remainingUnsentCount: 0,
      todayTotalSent: todayStats.total_sent,
      details: [],
    };
  }

  // 3. Fetch the batch of oldest signups who haven't received the broadcast yet
  const { data: targetProfiles, error: fetchErr } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, created_at")
    .not("email", "is", null)
    .neq("email", "")
    .is("sih_broadcast_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(effectiveBatchSize);

  if (fetchErr || !targetProfiles) {
    return {
      success: false,
      message: `Error fetching target profiles: ${fetchErr?.message || "Unknown error"}`,
      batchSize: 0,
      sentCount: 0,
      failedCount: 0,
      remainingUnsentCount: unsentCount,
      todayTotalSent: todayStats.total_sent,
      details: [],
    };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>";
  const isSandboxMode = fromEmail.includes("onboarding@resend.dev");

  let sentCount = 0;
  let failedCount = 0;
  const details: SIHBroadcastResult["details"] = [];

  for (const profile of targetProfiles) {
    const rawEmail = profile.email.trim();
    if (!rawEmail) continue;

    const firstName = profile.full_name ? profile.full_name.trim().split(/\s+/)[0] : "there";
    const subject = "Find your SIH 2026 teammates on HackerMate 🚀";

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #18181b; line-height: 1.6;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hey ${firstName},</p>
        
        <p style="font-size: 15px; margin-bottom: 20px; color: #3f3f46;">
          Smart India Hackathon 2026 is coming up — and if you're still short a teammate or two for your 6-member internal-round team, we just built something for exactly that.
        </p>

        <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #e4e4e7;">
          <p style="font-size: 15px; font-weight: 700; margin-top: 0; margin-bottom: 12px; color: #18181b;">
            HackerMate's SIH Team Builder lets you:
          </p>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #27272a;">
            <li style="margin-bottom: 8px;">Find builders and teams from your own college only</li>
            <li style="margin-bottom: 8px;">See real skill tags, not guesswork</li>
            <li style="margin-bottom: 0;">Track your team composition live — know exactly what gap you're missing (SIH requires at least 1 female teammate too)</li>
          </ul>
        </div>

        <p style="margin-bottom: 24px;">
          <a href="https://hackermate.in/hackathons/sih" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 12px 24px; rounded-radius: 8px; border-radius: 8px;">
            Explore SIH Team Builder →
          </a>
        </p>

        <p style="font-size: 14px; color: #52525b; margin-bottom: 24px;">
          Direct link: <a href="https://hackermate.in/hackathons/sih" style="color: #ea580c;">https://hackermate.in/hackathons/sih</a>
        </p>

        <p style="font-size: 14px; color: #52525b; margin-bottom: 24px;">
          Know a batchmate still hunting for a team? Forward this along.
        </p>

        <p style="font-size: 15px; font-weight: 600; color: #18181b; margin-top: 32px; border-top: 1px solid #e4e4e7; pt: 16px; padding-top: 16px;">
          — Team HackerMate
        </p>
      </div>
    `;

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
            html: htmlBody,
          }),
        });

        const resendData = await resendRes.json();

        if (resendRes.ok && resendData?.id) {
          resendMessageId = resendData.id;
        } else {
          failedCount++;
          details.push({
            id: profile.id,
            email: rawEmail,
            status: "failed",
            error: resendData?.message || "Resend API Error",
          });
          continue;
        }
      } catch (err: any) {
        failedCount++;
        details.push({
          id: profile.id,
          email: rawEmail,
          status: "failed",
          error: err.message,
        });
        continue;
      }
    } else {
      console.log(`[MOCK SIH BROADCAST EMAIL] To: ${targetEmail} (${rawEmail})`);
      resendMessageId = "mock_sih_id";
    }

    // Mark sih_broadcast_sent_at in DB ONLY AFTER confirmed successful send
    const nowIso = new Date().toISOString();
    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({ sih_broadcast_sent_at: nowIso })
      .eq("id", profile.id);

    if (updateErr) {
      console.error(`[SIH Broadcast] Failed to update sih_broadcast_sent_at for profile ${profile.id}:`, updateErr);
    }

    // Increment today's send stats
    const todayStr = new Date().toISOString().split("T")[0];
    const { data: currentStats } = await supabaseAdmin
      .from("daily_email_stats")
      .select("total_sent")
      .eq("date", todayStr)
      .maybeSingle();

    if (currentStats) {
      await supabaseAdmin
        .from("daily_email_stats")
        .update({
          total_sent: (currentStats.total_sent || 0) + 1,
          updated_at: nowIso,
        })
        .eq("date", todayStr);
    }

    sentCount++;
    details.push({
      id: profile.id,
      email: rawEmail,
      status: "sent",
      resendId: resendMessageId || undefined,
    });

    // 200ms rate limit delay between dispatches
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const remainingAfterBatch = Math.max(0, unsentCount - sentCount);
  const updatedTodayStats = await getOrCreateTodayStats(supabaseAdmin);

  return {
    success: true,
    message: `Batch complete: Sent ${sentCount} emails (${failedCount} failed). ${remainingAfterBatch} remaining unsent profiles.`,
    batchSize: targetProfiles.length,
    sentCount,
    failedCount,
    remainingUnsentCount: remainingAfterBatch,
    todayTotalSent: updatedTodayStats.total_sent,
    details,
  };
}
