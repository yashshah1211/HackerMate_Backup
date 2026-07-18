import { NextRequest, NextResponse } from "next/server";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Simple periodic cleanup to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 30 * 60 * 1000).unref?.(); // Run every 30 minutes, unref to not block process exit in tests

function getIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const limit = 5;
  const windowMs = 60 * 60 * 1000; // 1 hour

  const record = rateLimitMap.get(ip);

  if (!record) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: limit - 1, reset: now + windowMs };
  }

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
    return { allowed: true, remaining: limit - 1, reset: now + windowMs };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0, reset: record.resetTime };
  }

  record.count += 1;
  return { allowed: true, remaining: limit - record.count, reset: record.resetTime };
}

export async function POST(req: NextRequest) {
  const ip = getIp(req);
  const rateLimitResult = checkRateLimit(ip);

  if (!rateLimitResult.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: `Too many requests. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.` },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfterSeconds.toString(),
        },
      }
    );
  }

  try {
    const body = await req.json();
    const { name, email, subject, message, bot_check } = body;

    // 1. Honeypot check for bots
    if (bot_check) {
      console.warn("[Honeypot Triggered] Blocked bot submission with payload:", body);
      // Silently succeed to mislead the bot
      return NextResponse.json({
        success: true,
        message: "Your message has been received.",
      });
    }

    // 2. Input Validation
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "All fields (Name, Email, Subject, Message) are required." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const trimmedMsg = message.trim();
    if (trimmedMsg.length < 10) {
      return NextResponse.json(
        { error: "Message must be at least 10 characters long." },
        { status: 400 }
      );
    }

    if (trimmedMsg.length > 5000) {
      return NextResponse.json(
        { error: "Message cannot exceed 5000 characters." },
        { status: 400 }
      );
    }

    // 3. Determine Recipient and Sender Details
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>";
    
    // Recipient email configuration priority
    let recipientEmail = process.env.ADMIN_CONTACT_EMAIL || 
                         process.env.RESEND_SANDBOX_RECIPIENT || 
                         process.env.RESEND_FROM_EMAIL || 
                         "admin@hackermate.dev";

    // Escape values for safe HTML rendering
    function escapeHtml(text: string): string {
      if (!text) return "";
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    const escapedName = escapeHtml(name);
    const escapedEmail = escapeHtml(email);
    const escapedSubject = escapeHtml(subject);
    const escapedMessage = escapeHtml(trimmedMsg).replace(/\n/g, "<br />");

    const emailSubject = `[HackerMate Inquiry] ${subject}`;

    // 4. Construct Premium responsive HTML Email Template
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
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
      max-width: 600px;
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
      margin-bottom: 16px;
      border-bottom: 1px solid #1E242E;
      padding-bottom: 12px;
    }
    .info-grid {
      margin-bottom: 24px;
      background-color: #0A0D12;
      border: 1px solid #1E242E;
      border-radius: 8px;
      padding: 16px;
    }
    .info-row {
      margin-bottom: 8px;
      font-size: 13px;
    }
    .info-row:last-child {
      margin-bottom: 0;
    }
    .label {
      font-weight: 600;
      color: #8B93A3;
      display: inline-block;
      width: 80px;
    }
    .val {
      color: #EDEFF3;
    }
    .val a {
      color: #B4F461;
      text-decoration: none;
    }
    .message-box {
      font-size: 14px;
      color: #EDEFF3;
      line-height: 1.6;
      background-color: #0A0D12;
      border: 1px solid #1E242E;
      border-radius: 8px;
      padding: 20px;
      white-space: pre-wrap;
    }
    .footer {
      border-top: 1px solid #1E242E;
      padding-top: 20px;
      margin-top: 28px;
      font-size: 11px;
      color: #565E6D;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="logo">HackerMate.</div>
      <h1 class="title">New Inquiry Received</h1>
      
      <div class="info-grid">
        <div class="info-row"><span class="label">From:</span><span class="val">${escapedName}</span></div>
        <div class="info-row"><span class="label">Email:</span><span class="val"><a href="mailto:${escapedEmail}">${escapedEmail}</a></span></div>
        <div class="info-row"><span class="label">Subject:</span><span class="val">${escapedSubject}</span></div>
      </div>

      <div class="message-box">${escapedMessage}</div>
      
      <div class="footer">
        This is an automated notification from the HackerMate Contact form.
      </div>
    </div>
  </div>
</body>
</html>
`;

    // 5. Send Email or mock it
    if (!resendApiKey) {
      console.log("\n==================== [MOCK CONTACT EMAIL LOG] ====================");
      console.log(`To Admin Recipient: ${recipientEmail}`);
      console.log(`From Sender: ${fromEmail}`);
      console.log(`Subject: ${emailSubject}`);
      console.log(`Inquirer: ${name} <${email}>`);
      console.log(`Body Message:\n${trimmedMsg}`);
      console.log("==================================================================\n");

      return NextResponse.json({
        success: true,
        mock: true,
        message: "Inquiry logged to terminal console (no RESEND_API_KEY).",
      });
    }

    // Handle Sandbox override if using onboarding@resend.dev
    let finalRecipientEmail = recipientEmail;
    let finalSubject = emailSubject;
    const isSandboxMode = fromEmail.includes("onboarding@resend.dev");

    if (isSandboxMode) {
      const sandboxEmail = process.env.RESEND_SANDBOX_RECIPIENT;
      if (!sandboxEmail) {
        console.error("[Resend Sandbox] RESEND_SANDBOX_RECIPIENT is not configured in .env.local.");
        return NextResponse.json(
          { error: "Email service is not configured for sandbox mode. Please set RESEND_SANDBOX_RECIPIENT in .env.local to your registered Resend email address." },
          { status: 500 }
        );
      }
      if (finalRecipientEmail.toLowerCase() !== sandboxEmail.toLowerCase()) {
        console.log(`[Resend Sandbox Override] Redirecting contact notification from ${finalRecipientEmail} to sandbox recipient ${sandboxEmail}`);
        finalSubject = `[Sandbox Admin: ${recipientEmail}] ${emailSubject}`;
        finalRecipientEmail = sandboxEmail;
      }
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: finalRecipientEmail,
        subject: finalSubject,
        html: html,
        reply_to: email, // Direct replies go to the user
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend API Error during contact submit:", data);
      return NextResponse.json(
        { error: "Failed to dispatch email inquiry." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Inquiry sent successfully.",
      id: data.id,
    });

  } catch (err: any) {
    console.error("Contact API Catch-All Error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: err.message },
      { status: 500 }
    );
  }
}
