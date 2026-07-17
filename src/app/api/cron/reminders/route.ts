import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    // Service-role client: server-only key that bypasses RLS.
    // NEVER set SUPABASE_SERVICE_ROLE_KEY as a NEXT_PUBLIC_ variable.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    // 1. Authenticate Cron request
    const authHeader = req.headers.get("Authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET is not configured on the server.");
      return NextResponse.json({ error: "Cron secret not configured on server" }, { status: 500 });
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.warn("Unauthorized cron reminders attempt blocked.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch pending reminders from RPC (Security Definer handles RLS bypass)
    const { data: reminders, error: rpcError } = await supabase.rpc("get_pending_deadline_reminders");

    if (rpcError) {
      console.error("Error fetching pending deadline reminders:", rpcError);
      return NextResponse.json({ error: "Failed to fetch pending reminders", details: rpcError.message }, { status: 500 });
    }

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({ success: true, message: "No pending reminders to send.", count: 0 });
    }

    console.log(`Processing ${reminders.length} deadline reminders...`);

    const resendApiKey = process.env.RESEND_API_KEY;
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const requestBaseUrl = host ? `${proto}://${host}` : null;
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || requestBaseUrl || "http://localhost:3000";
    const successfullySentIds: string[] = [];
    const failedIds: string[] = [];

    // 3. Loop and send each email
    for (const reminder of reminders) {
      const subject = `⏰ [HackerMate] Registration closes in 24 hours for ${reminder.hackathon_name}`;
      const title = "Registration Closing Soon!";
      const textBody = `The registration deadline for "${reminder.hackathon_name}" is approaching. You saved this hackathon to your wishlist but have not registered yet. Complete your registration now before it closes!`;
      const actionLabel = "Register Now";
      const actionUrl = `${baseUrl}/hackathons/${reminder.hackathon_id}`;

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      background-color: #0A0D12;
      color: #EDEFF3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #0A0D12;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 520px;
      margin: 0 auto;
      background-color: #10141B;
      border: 1px solid #1E242E;
      border-radius: 12px;
      padding: 32px;
      box-sizing: border-box;
    }
    .logo {
      font-size: 16px;
      font-weight: 800;
      color: #B4F461;
      font-family: monospace;
      letter-spacing: 0.5px;
      margin-bottom: 24px;
    }
    .title {
      font-size: 20px;
      font-weight: 700;
      color: #FFFFFF;
      margin-top: 0;
      margin-bottom: 12px;
    }
    .greeting {
      font-size: 14px;
      color: #8B93A3;
      margin-bottom: 16px;
    }
    .body {
      font-size: 14px;
      color: #EDEFF3;
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .cta-container {
      margin-bottom: 32px;
    }
    .btn {
      display: inline-block;
      background-color: #FFFFFF;
      color: #0A0D12 !important;
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 1px;
      box-shadow: 0 4px 12px rgba(255,255,255,0.1);
    }
    .btn:hover {
      background-color: #EDEFF3;
    }
    .footer {
      border-top: 1px solid #171B23;
      padding-top: 20px;
      font-size: 11px;
      color: #565E6D;
      line-height: 1.5;
    }
    .footer a {
      color: #B4F461;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="logo">HackerMate.</div>
      <h1 class="title">${title}</h1>
      <p class="greeting">Hi ${reminder.user_name || "Builder"},</p>
      <p class="body">${textBody}</p>
      <div class="cta-container">
        <a href="${actionUrl}" class="btn" target="_blank">${actionLabel}</a>
      </div>
      <div class="footer">
        You are receiving this email because you bookmarked this hackathon on <a href="${baseUrl}">HackerMate</a>.
        To disable notifications, edit your profile alerts.
      </div>
    </div>
  </div>
</body>
</html>
`;

      if (!resendApiKey) {
        // Mock logging in development if key is missing
        console.log("\n==================== [MOCK DEADLINE EMAIL LOG] ====================");
        console.log(`To: ${reminder.user_email}`);
        console.log(`Subject: ${subject}`);
        console.log("==================================================================\n");
        successfullySentIds.push(reminder.saved_id);
      } else {
        try {
          let targetEmail = reminder.user_email;
          let finalSubject = subject;
          const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>";
          const isSandboxMode = fromEmail.includes("onboarding@resend.dev");
          
          if (isSandboxMode) {
            const sandboxEmail = process.env.RESEND_SANDBOX_RECIPIENT;
            if (!sandboxEmail) {
              console.error("[Resend Sandbox] RESEND_SANDBOX_RECIPIENT is not set. Skipping reminder email.");
              failedIds.push(reminder.saved_id);
              continue;
            }
            if (targetEmail.toLowerCase() !== sandboxEmail.toLowerCase()) {
              console.log(`[Resend Sandbox Override] Redirecting email from ${targetEmail} to sandbox recipient ${sandboxEmail}`);
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
              html: html,
            }),
          });

          if (resendRes.ok) {
            successfullySentIds.push(reminder.saved_id);
          } else {
            const errData = await resendRes.json();
            console.error(`Resend failed to send email to ${reminder.user_email}:`, errData);
            failedIds.push(reminder.saved_id);
          }
        } catch (mailErr) {
          console.error(`Catch error sending email to ${reminder.user_email}:`, mailErr);
          failedIds.push(reminder.saved_id);
        }
      }
    }

    // 4. Mark successfully sent reminders in DB (bypasses RLS via SECURITY DEFINER RPC)
    if (successfullySentIds.length > 0) {
      const { error: updateErr } = await supabase.rpc("mark_deadline_reminder_sent", {
        p_saved_ids: successfullySentIds,
      });

      if (updateErr) {
        console.error("Error marking reminders as sent in Supabase:", updateErr);
      }
    }

    return NextResponse.json({
      success: true,
      sentCount: successfullySentIds.length,
      failedCount: failedIds.length,
      sentIds: successfullySentIds,
      failedIds: failedIds,
    });

  } catch (err: any) {
    console.error("Cron reminders catch-all error:", err);
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}
