import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { recordEmailSendSuccess } from "@/lib/admin/emailBudgetGuard";
import { renderHackerMateEmail } from "@/lib/emailTemplate";

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

    // Rate Limiter Enforcement (15 emails per hour per authenticated user)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: rateLimitData } = await supabaseAdmin.rpc("check_rate_limit", {
      p_ip: user.id,
      p_limit: 15,
      p_window_interval: "1 hour",
    });

    if (rateLimitData && rateLimitData.length > 0) {
      const { allowed, reset_time } = rateLimitData[0];
      if (!allowed) {
        const resetMs = new Date(reset_time).getTime();
        const retryAfterSeconds = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
        return NextResponse.json(
          { error: `Rate limit exceeded. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.` },
          { status: 429, headers: { "Retry-After": retryAfterSeconds.toString() } }
        );
      }
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
    let introText = "";
    let calloutQuote: string | null = null;
    let calloutLabel: string | null = null;
    let actionLabel = "";
    let actionUrl = "";
    let badgeText = "Notification";

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const requestBaseUrl = host ? `${proto}://${host}` : null;
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || requestBaseUrl || "http://localhost:3000";

    const senderName = sender.full_name || "Builder";
    const recipientName = recipient.full_name || "Builder";
    const displayTeamName = teamName || "HackerMate Team";

    if (type === "connection_request") {
      // Verify relationship: pending request exists
      const { data: connReq, error: connErr } = await supabase
        .from("friend_requests")
        .select("id, message")
        .eq("sender_id", senderId)
        .eq("receiver_id", recipientId)
        .eq("status", "pending")
        .maybeSingle();

      if (connErr || !connReq) {
        return NextResponse.json({ error: "Forbidden: No pending connection request exists between these users." }, { status: 403 });
      }

      subject = `[HackerMate] New Connection Request from ${senderName}`;
      title = "New Connection Request";
      badgeText = "Connection";
      introText = `${senderName} wants to connect with you on HackerMate to explore potential hackathon collaborations.`;

      const pitchMsg = (connReq as any)?.message;
      if (pitchMsg && typeof pitchMsg === "string" && pitchMsg.trim().length > 0) {
        calloutQuote = pitchMsg.trim();
        calloutLabel = `Pitch Note from ${senderName}`;
      }

      actionLabel = "View Connection Requests";
      actionUrl = `${baseUrl}/connections`;
    } else if (type === "team_invite") {
      // Verify relationship: pending invite exists
      const { data: inviteReq, error: inviteErr } = await supabase
        .from("team_invites")
        .select("id")
        .eq("team_id", teamId)
        .eq("invited_user_id", recipientId)
        .eq("invited_by", senderId)
        .eq("status", "pending")
        .maybeSingle();

      if (inviteErr || !inviteReq) {
        return NextResponse.json({ error: "Forbidden: No pending team invitation exists between these users." }, { status: 403 });
      }

      subject = `[HackerMate] You are invited to join team "${displayTeamName}"`;
      title = "Team Invitation";
      badgeText = "Team Invite";
      introText = `${senderName} has invited you to join their squad "${displayTeamName}" for an upcoming hackathon! Check out their team roster and claim your role.`;
      actionLabel = "View Team Invites";
      actionUrl = `${baseUrl}/invites`;
    } else if (type === "join_request") {
      // Verify relationship: recipient is the owner of the team
      const { data: teamCheck, error: teamCheckErr } = await supabase
        .from("teams")
        .select("owner_id")
        .eq("id", teamId)
        .single();

      if (teamCheckErr || !teamCheck || teamCheck.owner_id !== recipientId) {
        return NextResponse.json({ error: "Forbidden: Recipient is not the owner of this team." }, { status: 403 });
      }

      // Verify relationship: pending join request exists
      const { data: joinReq, error: joinErr } = await supabase
        .from("team_join_requests")
        .select("id")
        .eq("team_id", teamId)
        .eq("user_id", senderId)
        .maybeSingle();

      if (joinErr || !joinReq) {
        return NextResponse.json({ error: "Forbidden: No pending join request exists for this team." }, { status: 403 });
      }

      subject = `[HackerMate] ${senderName} requested to join "${displayTeamName}"`;
      title = "Join Request Received";
      badgeText = "Join Request";
      introText = `${senderName} has requested to join your squad "${displayTeamName}". Check out their developer profile, review their skills, and accept them into your team!`;
      actionLabel = "Manage Team Requests";
      actionUrl = teamId ? `${baseUrl}/teams/${teamId}/requests` : `${baseUrl}/dashboard`;
    } else if (type === "moderation_warning") {
      subject = `[HackerMate] Account Behavior Warning Alert`;
      title = "Moderation Warning";
      badgeText = "Security Alert";
      introText = warningMessage || "We have received reports from other community members regarding inappropriate behavior or content on your HackerMate profile. Please review our community guidelines to avoid account suspension.";
      actionLabel = "Review Profile";
      actionUrl = `${baseUrl}/profile/edit`;
    } else if (type === "onboarding_nudge") {
      subject = `🚀 Complete your HackerMate profile to match with teams!`;
      title = "Complete Your Profile";
      badgeText = "Profile Setup";
      introText = `We noticed you signed in to HackerMate but haven't finished setting up your profile yet. Complete your profile today to find compatible hackathon teams, connect with other builders, and showcase your skills!`;
      actionLabel = "Complete Onboarding";
      actionUrl = `${baseUrl}/onboarding`;
    } else {
      return NextResponse.json({ error: "Unsupported notification type" }, { status: 400 });
    }

    // 5. Construct Premium Responsive HTML Email (Linear/Vercel inspired dark theme)
    const html = renderHackerMateEmail({
      title,
      recipientName,
      introText,
      calloutQuote,
      calloutLabel,
      actionLabel,
      actionUrl,
      badgeText,
      footerNote: `You are receiving this email because you registered on HackerMate. To adjust your alert settings, please edit your builder profile.`,
    });

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
        from: fromEmail,
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

    try {
      await recordEmailSendSuccess(supabaseAdmin, "notifications", 1);
    } catch (dbErr) {
      console.warn("[Send Email API] Failed to record email stats:", dbErr);
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
