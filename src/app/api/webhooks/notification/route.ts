import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate the Webhook request
    const authHeader = req.headers.get("Authorization");
    const webhookSecret = process.env.NOTIFICATION_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("NOTIFICATION_WEBHOOK_SECRET is not configured on the server.");
      return NextResponse.json({ error: "Webhook secret not configured on server" }, { status: 500 });
    }

    if (!authHeader || authHeader !== `Bearer ${webhookSecret}`) {
      console.warn("Unauthorized webhook attempt block.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse the notification payload
    const body = await req.json();
    const {
      notificationId,
      recipientId,
      recipientEmail,
      recipientName,
      message,
      link,
    } = body;

    if (!recipientEmail || !message) {
      return NextResponse.json(
        { error: "Missing required payload parameters: recipientEmail and message are required." },
        { status: 400 }
      );
    }

    // 3. Determine Email Subject and Action Details
    // Truncate message for subject line if too long
    const truncatedMsg = message.length > 50 ? `${message.substring(0, 47)}...` : message;
    const subject = `[HackerMate] ${truncatedMsg}`;
    const title = "New Notification";
    
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const path = link ? (link.startsWith("/") ? link : `/${link}`) : "/notifications";
    const actionUrl = `${baseUrl}${path}`;
    const actionLabel = "View Notification";

    // 4. Construct Premium Responsive HTML Email (Linear/Vercel inspired dark theme)
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
      <p class="greeting">Hi ${recipientName || "Builder"},</p>
      <p class="body">${message}</p>
      <div class="cta-container">
        <a href="${actionUrl}" class="btn" target="_blank">${actionLabel}</a>
      </div>
      <div class="footer">
        You are receiving this email because you registered on <a href="${baseUrl}">HackerMate</a>.
        To adjust your alert settings, please edit your builder profile.
      </div>
    </div>
  </div>
</body>
</html>
`;

    // 5. Dispatch Email or Mock to server console
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      console.log("\n==================== [OFFLINE WEBHOOK EMAIL LOG] ====================");
      console.log(`To: ${recipientEmail}`);
      console.log(`Subject: ${subject}`);
      console.log(`HTML Payload:\n${html}`);
      console.log("======================================================================\n");

      return NextResponse.json({
        success: true,
        mock: true,
        message: "Email logged to server terminal console. Configure RESEND_API_KEY environment variable to dispatch live emails.",
      });
    }

    // Resend Sandbox limitation override: if using the default onboarding@resend.dev sender, redirect target to sandbox email
    let targetEmail = recipientEmail;
    let finalSubject = subject;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>";
    const isSandboxMode = fromEmail.includes("onboarding@resend.dev");
    
    if (isSandboxMode) {
      const sandboxEmail = process.env.RESEND_SANDBOX_RECIPIENT || "yashs" + "hah7117@gmail.com"; // yashshah7117@gmail.com
      if (targetEmail.toLowerCase() !== sandboxEmail.toLowerCase()) {
        console.log(`[Resend Sandbox Override] Redirecting email from ${targetEmail} to sandbox recipient ${sandboxEmail}`);
        finalSubject = `[Sandbox: ${targetEmail}] ${subject}`;
        targetEmail = sandboxEmail;
      }
    }

    // Call Resend REST API
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

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend API Error (Webhook):", resendData);
      return NextResponse.json(
        { error: "Email dispatch failed", details: resendData },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Offline notification email sent successfully via Resend.",
      data: resendData,
    });

  } catch (err: any) {
    console.error("Offline Notification Webhook Catch-All Error:", err);
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}
