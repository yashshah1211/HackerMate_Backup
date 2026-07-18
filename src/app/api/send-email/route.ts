import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  try {
    // ── Auth gate ──────────────────────────────────────────────────────────
    // Build a server-side Supabase client that reads the caller's JWT from
    // the request cookies, exactly like middleware does.
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          // This is a read-only context; we don't need to set cookies.
          setAll: () => {},
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // ── End auth gate ──────────────────────────────────────────────────────

    const body = await req.json();
    const { senderId, recipientId, type, teamId, warningMessage } = body;

    if (!senderId || !recipientId || !type) {
      return NextResponse.json(
        { error: "Missing required parameters: senderId, recipientId, and type are required." },
        { status: 400 }
      );
    }

    // Verify the caller is acting as themselves — prevent sender impersonation.
    if (senderId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins may send moderation_warning or onboarding_nudge emails.
    if (type === "moderation_warning" || type === "onboarding_nudge") {
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (!callerProfile || callerProfile.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // 1. Fetch Sender Details
    const { data: sender, error: senderErr } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", senderId)
      .single();

    if (senderErr || !sender) {
      // Generic error — do not reveal whether the profile exists (prevents enumeration).
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // 2. Fetch Recipient Details
    const { data: recipient, error: recipientErr } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", recipientId)
      .single();

    if (recipientErr || !recipient) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // 3. Fetch Team details if applicable
    let teamName = "";
    if (teamId) {
      const { data: team, error: teamErr } = await supabase
        .from("teams")
        .select("name")
        .eq("id", teamId)
        .single();
      
      if (!teamErr && team) {
        teamName = team.name;
      }
    }

    // 4. Determine Email Content and Theme based on Type
    let subject = "";
    let title = "";
    let textBody = "";
    let actionLabel = "";
    let actionUrl = "";

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const requestBaseUrl = host ? `${proto}://${host}` : null;
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || requestBaseUrl || "http://localhost:3000";

    if (type === "connection_request") {
      subject = `[HackerMate] New Connection Request from ${sender.full_name}`;
      title = "Connection Request";
      textBody = `${sender.full_name} wants to connect with you on HackerMate to explore potential hackathon collaborations.`;
      actionLabel = "View Connection Requests";
      actionUrl = `${baseUrl}/connections`;
    } else if (type === "team_invite") {
      subject = `[HackerMate] You are invited to join team "${teamName || "HackerMate Team"}"`;
      title = "Team Invitation";
      textBody = `${sender.full_name} has invited you to join their team "${teamName || "HackerMate Team"}" for an upcoming hackathon.`;
      actionLabel = "View Team Invites";
      actionUrl = `${baseUrl}/invites`;
    } else if (type === "join_request") {
      subject = `[HackerMate] ${sender.full_name} requested to join "${teamName || "your team"}"`;
      title = "Join Request Received";
      textBody = `${sender.full_name} has requested to join your team "${teamName || "HackerMate Team"}". Check out their developer profile to review their skills!`;
      actionLabel = "Manage Team Requests";
      actionUrl = teamId ? `${baseUrl}/teams/${teamId}/requests` : `${baseUrl}/dashboard`;
    } else if (type === "moderation_warning") {
      subject = `[HackerMate] Account Behavior Warning Alert`;
      title = "Moderation Warning";
      textBody = warningMessage || "We have received reports from other community members regarding inappropriate behavior or content on your HackerMate profile. Please review our community guidelines to avoid account suspension.";
      actionLabel = "Review Profile";
      actionUrl = `${baseUrl}/profile/edit`;
    } else if (type === "onboarding_nudge") {
      subject = `🚀 Complete your HackerMate profile to match with teams!`;
      title = "Complete Your Profile";
      textBody = `We noticed you signed in to HackerMate but haven't finished setting up your profile yet. Complete your profile today to find compatible hackathon teams, connect with other builders, and showcase your skills!`;
      actionLabel = "Complete Onboarding";
      actionUrl = `${baseUrl}/onboarding`;
    } else {
      return NextResponse.json({ error: "Unsupported notification type" }, { status: 400 });
    }

    // 5. Construct Premium Responsive HTML Email (Linear/Vercel inspired dark theme)
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
      <p class="greeting">Hi ${recipient.full_name || "Builder"},</p>
      <p class="body">${textBody}</p>
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

    // 6. Send Email or Fallback to console logging
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      console.log("\n==================== [MOCK EMAIL LOG] ====================");
      console.log(`To: ${recipient.email}`);
      console.log(`Subject: ${subject}`);
      console.log(`HTML Payload:\n${html}`);
      console.log("========================================================\n");

      return NextResponse.json({
        success: true,
        mock: true,
        message: "Email logged to server terminal console. Configure RESEND_API_KEY environment variable to dispatch live emails.",
      });
    }

    // Resend Sandbox limitation override: if using the default onboarding@resend.dev sender, redirect target to sandbox email
    let targetEmail = recipient.email;
    let finalSubject = subject;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>";
    const isSandboxMode = fromEmail.includes("onboarding@resend.dev");
    
    if (isSandboxMode) {
      const sandboxEmail = process.env.RESEND_SANDBOX_RECIPIENT;
      if (!sandboxEmail) {
        console.error("[Resend Sandbox] RESEND_SANDBOX_RECIPIENT is not set. Cannot send email in sandbox mode.");
        return NextResponse.json({ error: "Email service is not configured for sandbox mode." }, { status: 500 });
      }
      if (targetEmail.toLowerCase() !== sandboxEmail.toLowerCase()) {
        console.log(`[Resend Sandbox Override] Redirecting email from ${targetEmail} to sandbox recipient ${sandboxEmail}`);
        finalSubject = `[Sandbox: ${targetEmail}] ${subject}`;
        targetEmail = sandboxEmail;
      }
    }

    // Call Resend REST API endpoint
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
      console.error("Resend API Error:", resendData);
      return NextResponse.json(
        { error: "Email dispatch failed", details: resendData },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Email sent successfully via Resend.",
      data: resendData,
    });

  } catch (err: any) {
    console.error("Email API Catch-All Error:", err);
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}
