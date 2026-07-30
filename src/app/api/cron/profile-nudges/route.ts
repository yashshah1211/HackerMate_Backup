import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  checkAndReserveEmailBudget,
  recordEmailSendSuccess,
  NUDGE_DAILY_CAP,
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

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Authenticate Cron Request
    const authHeader = req.headers.get("Authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("[Profile Nudges Cron] CRON_SECRET is not configured on server.");
      return NextResponse.json({ error: "Cron secret not configured on server" }, { status: 500 });
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.warn("[Profile Nudges Cron] Unauthorized cron attempt blocked.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch incomplete profiles (created > 2 days ago, not banned, nudge count < 3)
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: candidates, error: dbError } = await supabase
      .from("profiles")
      .select("id, full_name, email, created_at, profile_nudge_count, last_nudge_sent_at, bio, college, skills")
      .eq("onboarding_completed", true)
      .is("is_banned", false)
      .lt("created_at", twoDaysAgo)
      .or("profile_nudge_count.is.null,profile_nudge_count.lt.3");

    if (dbError) {
      console.error("[Profile Nudges Cron] Error fetching candidates:", dbError);
      return NextResponse.json({ error: "Failed to fetch candidates", details: dbError.message }, { status: 500 });
    }

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No incomplete profiles due for nudges today.",
        sentCount: 0,
        deferredCount: 0,
      });
    }

    // 3. Check Daily Send-Budget Guard (Category: nudge, Cap: 40/day)
    const budgetCheck = await checkAndReserveEmailBudget(supabase, "nudge", candidates.length);

    if (budgetCheck.allowedCount === 0) {
      console.warn(`[Profile Nudges Cron] Daily nudge email budget depleted (${budgetCheck.todayStats.nudges_sent}/${NUDGE_DAILY_CAP} sent today). Deferring ${candidates.length} profiles to next daily run.`);
      return NextResponse.json({
        success: true,
        message: "Daily nudge email budget depleted; profiles deferred to next run.",
        sentCount: 0,
        deferredCount: candidates.length,
        budgetStats: budgetCheck,
      });
    }

    const activeCandidates = candidates.slice(0, budgetCheck.allowedCount);
    const deferredCount = candidates.length - activeCandidates.length;

    const resendApiKey = process.env.RESEND_API_KEY;
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || (host ? `${proto}://${host}` : "http://localhost:3000");

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const logDetails: any[] = [];

    const now = Date.now();
    const TWENTY_HOURS_MS = 20 * 60 * 60 * 1000;

    for (const u of activeCandidates) {
      const currentNudgeCount = u.profile_nudge_count || 0;
      const daysOld = Math.floor((now - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24));

      // Check throttle: Skip if last nudge sent < 20 hours ago
      if (u.last_nudge_sent_at) {
        const msSinceLast = now - new Date(u.last_nudge_sent_at).getTime();
        if (msSinceLast < TWENTY_HOURS_MS) {
          skippedCount++;
          continue;
        }
      }

      // Determine qualification & copy for Day 2, Day 5, Day 10 stages
      let stage: 1 | 2 | 3 | null = null;
      let subject = "";
      let title = "";
      let messageBody = "";

      if (daysOld >= 2 && currentNudgeCount === 0) {
        stage = 1;
        subject = `🚀 Complete your HackerMate profile to match with top teams!`;
        title = "Build Your Hacker Identity";
        messageBody = `You signed up for HackerMate ${daysOld} days ago, but your profile is still incomplete. Finishing your setup takes less than 2 minutes and unlocks smart team matching, builder discovery, and direct hackathon registrations.`;
      } else if (daysOld >= 5 && currentNudgeCount === 1) {
        stage = 2;
        subject = `⚡ You're missing key details on your HackerMate profile!`;
        title = "Stand Out to Hackathon Organizers & Teammates";

        const missingItems: string[] = [];
        if (!u.college) missingItems.push("College / University");
        if (!u.bio) missingItems.push("Short Bio");
        if (!u.skills || u.skills.length === 0) missingItems.push("Tech Skills & Stack");
        const missingStr = missingItems.length > 0 ? missingItems.join(", ") : "profile details";

        messageBody = `Your profile is currently missing <strong>${missingStr}</strong>. Teammates and organizers search for builders with listed skills. Update these details to start receiving team invitations!`;
      } else if (daysOld >= 10 && currentNudgeCount === 2) {
        stage = 3;
        subject = `⏳ Final Reminder: Unlock full access to HackerMate hackathons!`;
        title = "Final Call: Complete Your Profile";
        messageBody = `This is your final reminder to complete your HackerMate profile. Active hackathons are recruiting builders right now. Complete your profile today so you don't miss out on upcoming competitions, prizes, and team opportunities.`;
      }

      // If user does not qualify for next stage yet, skip
      if (!stage) {
        skippedCount++;
        continue;
      }

      const actionUrl = `${baseUrl}/onboarding`;
      const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { background-color: #0A0D12; color: #EDEFF3; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; }
    .wrapper { width: 100%; padding: 40px 20px; box-sizing: border-box; }
    .container { max-width: 520px; margin: 0 auto; background-color: #10141B; border: 1px solid #1E242E; border-radius: 12px; padding: 32px; box-sizing: border-box; }
    .logo { font-size: 16px; font-weight: 800; color: #B4F461; font-family: monospace; letter-spacing: 0.5px; margin-bottom: 24px; }
    .stage-badge { display: inline-block; font-size: 10px; font-weight: 700; font-family: monospace; color: #3B82F6; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); padding: 3px 8px; border-radius: 4px; uppercase; margin-bottom: 16px; }
    .title { font-size: 20px; font-weight: 700; color: #FFFFFF; margin-top: 0; margin-bottom: 12px; }
    .greeting { font-size: 14px; color: #8B93A3; margin-bottom: 16px; }
    .body { font-size: 14px; color: #EDEFF3; line-height: 1.6; margin-bottom: 28px; }
    .btn { display: inline-block; background-color: #B4F461; color: #0A0D12 !important; font-size: 12px; font-weight: 800; text-decoration: none; padding: 12px 24px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .footer { border-top: 1px solid #171B23; padding-top: 20px; font-size: 11px; color: #565E6D; line-height: 1.5; margin-top: 28px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="logo">HackerMate.</div>
      <span class="stage-badge">REMINDER STEP ${stage} OF 3</span>
      <h1 class="title">${escapeHtml(title)}</h1>
      <p class="greeting">Hi ${escapeHtml(u.full_name || "Builder")},</p>
      <p class="body">${messageBody}</p>
      <div>
        <a href="${actionUrl}" class="btn" target="_blank">Complete Profile Now →</a>
      </div>
      <div class="footer">
        You are receiving this automated email because you created an account on HackerMate.
      </div>
    </div>
  </div>
</body>
</html>
`;

      if (!resendApiKey) {
        console.log(`\n[MOCK PROFILE NUDGE STAGE ${stage}] To: ${u.email} | Days Old: ${daysOld}`);
        sentCount++;
        logDetails.push({ email: u.email, stage, status: "mock_sent" });

        // Update DB in mock mode
        await supabase
          .from("profiles")
          .update({
            profile_nudge_count: currentNudgeCount + 1,
            last_nudge_sent_at: new Date().toISOString(),
            onboarding_nudge_sent_at: new Date().toISOString(),
          })
          .eq("id", u.id);
      } else {
        try {
          let targetEmail = u.email;
          let finalSubject = subject;
          const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>";
          const isSandboxMode = fromEmail.includes("onboarding@resend.dev");

          if (isSandboxMode) {
            const sandboxEmail = process.env.RESEND_SANDBOX_RECIPIENT;
            if (sandboxEmail && targetEmail.toLowerCase() !== sandboxEmail.toLowerCase()) {
              finalSubject = `[Sandbox: ${targetEmail}] ${subject}`;
              targetEmail = sandboxEmail;
            }
          }

          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>",
              to: targetEmail,
              subject: finalSubject,
              html: htmlBody,
            }),
          });

          const resendData = await resendRes.json();

          // Validation fix pattern: Only mark sent upon confirmed Resend response
          if (resendRes.ok && resendData?.id) {
            sentCount++;
            logDetails.push({ email: u.email, stage, status: "sent", resendId: resendData.id });

            await supabase
              .from("profiles")
              .update({
                profile_nudge_count: currentNudgeCount + 1,
                last_nudge_sent_at: new Date().toISOString(),
                onboarding_nudge_sent_at: new Date().toISOString(),
              })
              .eq("id", u.id);
          } else {
            failedCount++;
            logDetails.push({ email: u.email, stage, status: "failed", error: resendData?.message || "Resend Error" });
          }
        } catch (e: any) {
          failedCount++;
          logDetails.push({ email: u.email, stage, status: "error", error: e.message });
        }
      }
    }

    if (sentCount > 0) {
      await recordEmailSendSuccess(supabase, "nudge", sentCount);
    }

    return NextResponse.json({
      success: true,
      processed: candidates.length,
      sentCount,
      deferredCount,
      skippedCount,
      failedCount,
      budgetStats: budgetCheck,
      details: logDetails,
    });
  } catch (err: any) {
    console.error("[Profile Nudges Cron Error]:", err);
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}
