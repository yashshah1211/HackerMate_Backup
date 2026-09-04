export const dynamic = "force-dynamic";

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

    const body = await req.json();
    const { hackathonId, title, message, linkedStageId } = body;

    if (!hackathonId || !title?.trim() || !message?.trim()) {
      return NextResponse.json(
        { error: "hackathonId, title, and message are required." },
        { status: 400 }
      );
    }

    // Initialize Service Role client for admin queries & notifications insert
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Verify caller authorization (Native Organizer OR Admin OR Partner Hackathon)
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = callerProfile?.role === "admin";

    const { data: hackathon, error: hackathonErr } = await supabaseAdmin
      .from("hackathons")
      .select("id, name, organizer_id")
      .eq("id", hackathonId)
      .single();

    if (hackathonErr || !hackathon) {
      return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
    }

    const { data: partnerConfig } = await supabaseAdmin
      .from("partner_configs")
      .select("id")
      .eq("hackathon_id", hackathonId)
      .maybeSingle();

    const isNativeOrganizer = hackathon.organizer_id === user.id;

    if (!isNativeOrganizer && !isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Only the hackathon organizer or admin can broadcast announcements." },
        { status: 403 }
      );
    }

    // 2. Fetch linked stage details if provided
    let linkedStageTitle: string | null = null;
    if (linkedStageId) {
      const { data: stage } = await supabaseAdmin
        .from("hackathon_stages")
        .select("title")
        .eq("id", linkedStageId)
        .maybeSingle();
      if (stage) {
        linkedStageTitle = stage.title;
      }
    }

    // 3. Create hackathon_announcements record (sent_at null initially)
    const { data: announcement, error: announceErr } = await supabaseAdmin
      .from("hackathon_announcements")
      .insert({
        hackathon_id: hackathonId,
        organizer_id: user.id,
        title: title.trim(),
        message: message.trim(),
        linked_stage_id: linkedStageId || null,
        sent_at: null,
      })
      .select()
      .single();

    if (announceErr || !announcement) {
      return NextResponse.json(
        { error: announceErr?.message || "Failed to create announcement record." },
        { status: 500 }
      );
    }

    // 4. Fetch all registered participants with profiles
    const { data: registrations, error: regErr } = await supabaseAdmin
      .from("hackathon_registrations")
      .select("user_id, profiles:user_id(id, full_name, email)")
      .eq("hackathon_id", hackathonId);

    if (regErr) {
      return NextResponse.json({ error: regErr.message }, { status: 500 });
    }

    const participants = (registrations || [])
      .map((r: any) => r.profiles)
      .filter((p: any) => p && p.email);

    if (participants.length === 0) {
      // Mark as sent immediately if no participants
      await supabaseAdmin
        .from("hackathon_announcements")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", announcement.id);

      return NextResponse.json({
        success: true,
        count: 0,
        announcement,
        message: "Announcement created. No registered participants to notify.",
      });
    }

    // 5. Insert In-App Notifications for all participants
    const notifPayloads = participants.map((p: any) => ({
      user_id: p.id,
      message: `📢 [${hackathon.name}] ${title.trim()}: ${message.trim()}`,
      link: `/hackathons/${hackathonId}`,
      type: "hackathon_announcement",
    }));

    const { error: notifErr } = await supabaseAdmin
      .from("notifications")
      .insert(notifPayloads);

    if (notifErr) {
      console.error("[Broadcast API] Notification Insert Error:", notifErr);
    }

    // 6. Email Dispatch via Resend API (Batched / Rate-Limited)
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>";
    const isSandboxMode = fromEmail.includes("onboarding@resend.dev");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || (host ? `${proto}://${host}` : "http://localhost:3000");

    const emailSubject = `📢 [${hackathon.name}] Announcement: ${title.trim()}`;

    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(emailSubject)}</title>
  <style>
    body { background-color: #0A0D12; color: #EDEFF3; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; }
    .wrapper { width: 100%; padding: 40px 20px; box-sizing: border-box; }
    .container { max-width: 540px; margin: 0 auto; background-color: #10141B; border: 1px solid #1E242E; border-radius: 12px; padding: 32px; box-sizing: border-box; }
    .logo { font-size: 16px; font-weight: 800; color: #B4F461; font-family: monospace; letter-spacing: 0.5px; margin-bottom: 20px; }
    .event-badge { display: inline-block; font-size: 11px; font-weight: 700; font-family: monospace; color: #3B82F6; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); padding: 3px 8px; border-radius: 4px; text-transform: uppercase; margin-bottom: 16px; }
    .stage-pill { display: inline-block; font-size: 11px; font-weight: 700; font-family: monospace; color: #8B5CF6; background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.3); padding: 3px 8px; border-radius: 4px; margin-left: 6px; }
    .title { font-size: 20px; font-weight: 700; color: #FFFFFF; margin-top: 0; margin-bottom: 14px; }
    .message { font-size: 14px; color: #EDEFF3; line-height: 1.6; white-space: pre-line; margin-bottom: 28px; background: #0A0D12; padding: 16px; border-radius: 8px; border: 1px solid #1E242E; }
    .btn { display: inline-block; background-color: #B4F461; color: #0A0D12 !important; font-size: 12px; font-weight: 800; text-decoration: none; padding: 12px 24px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .footer { border-top: 1px solid #171B23; padding-top: 20px; font-size: 11px; color: #565E6D; line-height: 1.5; margin-top: 28px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="logo">HackerMate.</div>
      <div>
        <span class="event-badge">${escapeHtml(hackathon.name)}</span>
        ${linkedStageTitle ? `<span class="stage-pill">📍 ${escapeHtml(linkedStageTitle)}</span>` : ""}
      </div>
      <h1 class="title">${escapeHtml(title.trim())}</h1>
      <div class="message">${escapeHtml(message.trim())}</div>
      <div>
        <a href="${baseUrl}/hackathons/${hackathonId}" class="btn" target="_blank">View Hackathon Hub →</a>
      </div>
      <div class="footer">
        You are receiving this official announcement because you are registered for ${escapeHtml(hackathon.name)} on HackerMate.
      </div>
    </div>
  </div>
</body>
</html>
`;

    if (!resendApiKey) {
      console.log(`\n==================== [BROADCAST EMAIL MOCK LOG] ====================`);
      console.log(`Hackathon: ${hackathon.name}`);
      console.log(`Recipients: ${participants.length} builders`);
      console.log(`Title: ${title}`);
      console.log(`====================================================================\n`);

      // Mark sent_at timestamp
      await supabaseAdmin
        .from("hackathon_announcements")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", announcement.id);

      return NextResponse.json({
        success: true,
        mock: true,
        count: participants.length,
        announcement,
        message: `Broadcast sent to ${participants.length} participants (Mock Console Log).`,
      });
    }

    // Process Resend emails in batches of 5 with 150ms delay
    const BATCH_SIZE = 5;
    let failedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < participants.length; i += BATCH_SIZE) {
      const batch = participants.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (p: any) => {
          let recipientEmail = p.email;
          let finalSubject = emailSubject;

          if (isSandboxMode) {
            const sandboxEmail = process.env.RESEND_SANDBOX_RECIPIENT;
            if (sandboxEmail && recipientEmail.toLowerCase() !== sandboxEmail.toLowerCase()) {
              finalSubject = `[Sandbox: ${recipientEmail}] ${emailSubject}`;
              recipientEmail = sandboxEmail;
            }
          }

          try {
            const resendRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resendApiKey}`,
              },
              body: JSON.stringify({
                from: fromEmail,
                to: recipientEmail,
                subject: finalSubject,
                html: htmlBody,
              }),
            });

            const resendData = await resendRes.json();

            if (!resendRes.ok || !resendData?.id) {
              failedCount++;
              errors.push(`Failed for ${p.email}: ${resendData?.message || "Resend API Error"}`);
            }
          } catch (e: any) {
            failedCount++;
            errors.push(`Failed for ${p.email}: ${e.message}`);
          }
        })
      );

      // Throttle delay between batches
      if (i + BATCH_SIZE < participants.length) {
        await delay(150);
      }
    }

    if (failedCount > 0 && failedCount === participants.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to deliver broadcast emails to recipients.",
          details: errors,
        },
        { status: 500 }
      );
    }

    const successfulCount = participants.length - failedCount;
    if (successfulCount > 0) {
      try {
        await recordEmailSendSuccess(supabaseAdmin, "organizer_broadcasts", successfulCount);
      } catch (dbErr) {
        console.warn("[Organizer Broadcast] Failed to record email stats:", dbErr);
      }
    }

    // Mark sent_at timestamp upon confirmed delivery
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("hackathon_announcements")
      .update({ sent_at: nowIso })
      .eq("id", announcement.id);

    return NextResponse.json({
      success: true,
      count: participants.length - failedCount,
      total: participants.length,
      failedCount,
      errors: errors.length > 0 ? errors : undefined,
      announcement: { ...announcement, sent_at: nowIso },
    });
  } catch (err: any) {
    console.error("[Broadcast API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
