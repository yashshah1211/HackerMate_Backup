import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { recordEmailSendSuccess } from "@/lib/admin/emailBudgetGuard";

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

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseUser.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerProfile?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Only admins can send onboarding nudges." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { targetUserId, batchAll, customNote } = body;

    if (!targetUserId && !batchAll) {
      return NextResponse.json(
        { error: "Specify either targetUserId or batchAll: true." },
        { status: 400 }
      );
    }

    // Query profiles with incomplete onboarding
    let query = supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, onboarding_completed, college, skills, created_at, last_onboarding_nudge_sent_at")
      .eq("is_banned", false);

    if (targetUserId) {
      query = query.eq("id", targetUserId);
    } else if (batchAll) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

      query = query
        .or("onboarding_completed.is.null,onboarding_completed.eq.false")
        .lte("created_at", twentyFourHoursAgo)
        .or(`last_onboarding_nudge_sent_at.is.null,last_onboarding_nudge_sent_at.lte.${threeDaysAgo}`);
    }

    const { data: targets, error: targetErr } = await query;

    if (targetErr || !targets || targets.length === 0) {
      return NextResponse.json(
        {
          success: true,
          count: 0,
          message: batchAll
            ? "No eligible incomplete users found (Users must be registered at least 24h ago and not nudged in the last 3 days)."
            : "Specified user profile not found or unavailable.",
        },
        { status: 200 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate <yash@hackermate.in>";
    const isSandboxMode = fromEmail.includes("onboarding@resend.dev");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || (host ? `${proto}://${host}` : "http://localhost:3000");

    const emailSubject = `⚡ Complete your HackerMate profile to unlock team invites & partner hackathons`;

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    const BATCH_SIZE = 5;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (p: any) => {
          if (!p.email) return;

          const recipientName = p.full_name?.trim() ? p.full_name.trim().split(" ")[0] : "Builder";
          const actionUrl = `${baseUrl}/onboarding`;

          const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(emailSubject)}</title>
  <style>
    body { background-color: #0A0D12; color: #EDEFF3; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    .wrapper { width: 100%; padding: 40px 20px; box-sizing: border-box; background-color: #0A0D12; }
    .container { max-width: 520px; margin: 0 auto; background-color: #10141B; border: 1px solid #1E242E; border-radius: 14px; padding: 36px 32px; box-sizing: border-box; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .logo { font-size: 18px; font-weight: 800; color: #B4F461; font-family: monospace; letter-spacing: 0.5px; margin-bottom: 24px; }
    .badge { display: inline-block; font-size: 10px; font-weight: 800; font-family: monospace; color: #F43F5E; background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.3); padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; }
    .title { font-size: 22px; font-weight: 800; color: #FFFFFF; margin-top: 0; margin-bottom: 14px; line-height: 1.3; }
    .greeting { font-size: 15px; color: #C2C7D0; margin-bottom: 16px; font-weight: 600; }
    .body-text { font-size: 14px; color: #EDEFF3; line-height: 1.6; margin-bottom: 24px; }
    .perks-card { background: #0A0D12; border: 1px solid #1E242E; border-radius: 10px; padding: 20px; margin-bottom: 28px; }
    .perk-item { display: flex; align-items: flex-start; gap: 12px; font-size: 13px; color: #D1D5DB; line-height: 1.5; margin-bottom: 12px; }
    .perk-item:last-child { margin-bottom: 0; }
    .perk-icon { font-size: 16px; line-height: 1; }
    .cta-container { margin-bottom: 28px; text-align: center; }
    .btn { display: inline-block; background-color: #B4F461; color: #0A0D12 !important; font-size: 13px; font-weight: 800; text-decoration: none; padding: 14px 28px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 16px rgba(180,244,97,0.25); }
    .btn:hover { background-color: #a3e64f; }
    .custom-note { background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.25); border-radius: 8px; padding: 14px; font-size: 13px; color: #93C5FD; margin-bottom: 24px; font-style: italic; }
    .footer { border-top: 1px solid #171B23; padding-top: 20px; font-size: 11px; color: #6B7280; line-height: 1.5; text-align: center; }
    .footer a { color: #B4F461; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="logo">HackerMate.</div>
      <div><span class="badge">Action Required • 60 Seconds</span></div>
      <h1 class="title">Complete your profile & start getting discovered! 🚀</h1>
      <p class="greeting">Hi ${escapeHtml(recipientName)},</p>
      <p class="body-text">
        Teammates and event organizers are actively searching for developers with your tech stack on HackerMate right now. Your builder profile is almost complete — finishing it takes less than 60 seconds!
      </p>

      ${customNote ? `<div class="custom-note">💬 Note from HackerMate Admin: "${escapeHtml(customNote)}"</div>` : ""}

      <div class="perks-card">
        <div className="perk-item">
          <span class="perk-icon">🎯</span>
          <div><strong>Verified Builder Badge:</strong> Unlock verified developer status on your profile & official partner portals.</div>
        </div>
        <div className="perk-item">
          <span class="perk-icon">⚡</span>
          <div><strong>Direct Team Invites:</strong> Receive recruitment requests from top teams building for major hackathons.</div>
        </div>
        <div className="perk-item">
          <span class="perk-icon">🌐</span>
          <div><strong>Partner Matching Hubs:</strong> Appear in exclusive matching feeds for active partner events like StartupX and Orvix.</div>
        </div>
      </div>

      <div class="cta-container">
        <a href="${escapeHtml(actionUrl)}" class="btn" target="_blank">Complete My Profile Now (60s) →</a>
      </div>

      <div class="footer">
        You are receiving this email because you registered on <a href="${escapeHtml(baseUrl)}">HackerMate</a>.
        Need help? Reply directly to this email to contact the HackerMate team.
      </div>
    </div>
  </div>
</body>
</html>
`;

          if (!resendApiKey) {
            console.log("\n==================== [ONBOARDING NUDGE MOCK LOG] ====================");
            console.log(`To: ${p.email}`);
            console.log(`Subject: ${emailSubject}`);
            console.log("=====================================================================\n");
            successCount++;
            await supabaseAdmin
              .from("profiles")
              .update({ last_onboarding_nudge_sent_at: new Date().toISOString() })
              .eq("id", p.id);
            return;
          }

          try {
            let targetEmail = p.email;
            let finalSubject = emailSubject;

            if (isSandboxMode) {
              const sandboxEmail = process.env.RESEND_SANDBOX_RECIPIENT;
              if (sandboxEmail && targetEmail.toLowerCase() !== sandboxEmail.toLowerCase()) {
                finalSubject = `[Sandbox: ${targetEmail}] ${emailSubject}`;
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
                from: fromEmail,
                to: targetEmail,
                subject: finalSubject,
                html: htmlBody,
              }),
            });

            const resendData = await resendRes.json();

            if (resendRes.ok && resendData?.id) {
              successCount++;
              await supabaseAdmin
                .from("profiles")
                .update({ last_onboarding_nudge_sent_at: new Date().toISOString() })
                .eq("id", p.id);
            } else {
              failedCount++;
              errors.push(`Failed for ${p.email}: ${resendData?.message || "Resend API error"}`);
            }
          } catch (err: any) {
            failedCount++;
            errors.push(`Failed for ${p.email}: ${err.message}`);
          }
        })
      );

      if (i + BATCH_SIZE < targets.length) {
        await delay(150);
      }
    }

    if (successCount > 0) {
      await recordEmailSendSuccess(supabaseAdmin, "nudge", successCount);
    }

    return NextResponse.json({
      success: true,
      count: successCount,
      total: targets.length,
      failedCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `Onboarding nudge email sent to ${successCount} user(s).`,
    });
  } catch (err: any) {
    console.error("[Onboarding Nudge Error]:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
