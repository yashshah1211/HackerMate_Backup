import { recordEmailBookkeeping, dispatchEmail } from "@/lib/emailDispatch";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recordEmailSendSuccess } from "@/lib/admin/emailBudgetGuard";
import { requireVerifiedProfile } from "@/lib/admin/requireAdmin";

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
    const authorization = await requireVerifiedProfile(req);
    if (authorization instanceof NextResponse) return authorization;
    const { user, supabaseUserClient, isAdmin } = authorization;

    const body = await req.json();
    const { hackathonId, title, message, linkedStageId } = body;

    if (!hackathonId || !title?.trim() || !message?.trim()) {
      return NextResponse.json(
        { error: "hackathonId, title, and message are required." },
        { status: 400 }
      );
    }

    // Verify the event with the caller JWT before creating the existing service
    // client. Partner read assignments do not grant broadcast permissions.
    const { data: hackathon, error: hackathonErr } = await supabaseUserClient
      .from("hackathons")
      .select("id, name, type, organizer_id")
      .eq("id", hackathonId)
      .single();

    if (hackathonErr) console.error("[Broadcast] Event lookup failed:", hackathonErr);
    if (hackathonErr || !hackathon) {
      return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
    }

    const { data: eventAccess, error: accessError } = await supabaseUserClient.rpc(
      "can_access_partner_event", { p_hackathon_id: hackathonId }
    );
    const isNativeOrganizer = hackathon.type === "native" && hackathon.organizer_id === user.id;
    if (accessError) console.error("[Broadcast] Permission lookup failed:", accessError);
    if (accessError || eventAccess !== true || (!isNativeOrganizer && !isAdmin)) {
      return NextResponse.json(
        { error: "Forbidden: Only the hackathon organizer or admin can broadcast announcements." },
        { status: 403 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: partnerConfig, error: configError } = await supabaseAdmin
      .from("partner_configs").select("id").eq("hackathon_id", hackathonId).maybeSingle();

    if (configError) {
      console.error("[Broadcast] Partner configuration unavailable:", configError);
      return NextResponse.json({ error: "Event configuration unavailable; no broadcast created." }, { status: 503 });
    }

    // 2. Fetch linked stage details if provided
    let linkedStageTitle: string | null = null;
    if (linkedStageId) {
      const { data: stage, error: stageError } = await supabaseAdmin
        .from("hackathon_stages")
        .select("title")
        .eq("id", linkedStageId)
        .eq("hackathon_id", hackathonId)
        .maybeSingle();
      if (stageError) console.error("[Broadcast] Stage lookup failed:", stageError);
      if (stageError || !stage) return NextResponse.json({ error: "Stage not found for this event." }, { status: 400 });
      linkedStageTitle = stage.title;
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

    if (announceErr) console.error("[Broadcast] Announcement insert failed:", announceErr);
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

    if (regErr || !Array.isArray(registrations)) {
      console.error("[Broadcast] Recipient eligibility unavailable:", regErr);
      return NextResponse.json({ success: true, announcement, emailSuccess: false, count: 0,
        email: { status: "not_dispatched", reason: "Recipient eligibility unavailable; no emails sent." },
        message: "Announcement created. Email recipients could not be verified; do not recreate the announcement." });
    }

    const participants = (registrations || [])
      .map((r: any) => r.profiles)
      .filter((p: any) => p && p.email);

    if (participants.length === 0) {

      return NextResponse.json({
        success: true,
        count: 0, emailSuccess: false, email: { status: "not_dispatched", reason: "No recipients." },
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
    const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>";
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

    const outcomes: Awaited<ReturnType<typeof dispatchEmail>>[] = [];
    const BATCH_SIZE = 5;
    for (let i = 0; i < participants.length; i += BATCH_SIZE) {
      const batch = await Promise.all(participants.slice(i, i + BATCH_SIZE).map((p: { email: string }) =>
        dispatchEmail({ from: fromEmail, to: p.email, subject: emailSubject, html: htmlBody })));
      outcomes.push(...batch);
      if (i + BATCH_SIZE < participants.length) await delay(150);
    }
    const accepted = outcomes.filter(o => o.status === "accepted").length;
    const count = outcomes.filter(o => o.intendedRecipientAccepted).length;
    const unknownCount = outcomes.filter(o => o.status === "unknown").length;
    const accounting = accepted ? await recordEmailSendSuccess(supabaseAdmin, "organizer_broadcasts", accepted) : { status: "not_required" };
    let bookkeeping = "not_required";
    let sentAt: string | null = null;
    // Existing sent_at now means all intended recipients were accepted, never verified delivery.
    if (count === participants.length) {
      const now = new Date().toISOString();
      bookkeeping = await recordEmailBookkeeping(() => supabaseAdmin.from("hackathon_announcements").update({ sent_at: now })
        .eq("id", announcement.id).is("sent_at", null).select("id"));
      if (bookkeeping === "recorded") sentAt = now;
      else console.error("[Broadcast] Email acceptance bookkeeping failed.");
    }
    return NextResponse.json({ success: true, emailSuccess: count === participants.length, count, accepted,
      total: participants.length, unknownCount, failedCount: outcomes.filter(o => ["failed", "not_dispatched"].includes(o.status)).length,
      sandboxAccepted: accepted - count, outcomes, accounting, bookkeeping, retrySafe: false,
      inAppNotifications: notifErr ? "failed" : "created", announcement: { ...announcement, sent_at: sentAt },
      message: `Announcement created. Provider accepted ${count}/${participants.length} intended emails; ${unknownCount} unknown. Delivery is not confirmed.${bookkeeping === "failed" || accounting.status === "failed" ? " Bookkeeping needs review." : ""} Do not recreate this announcement to retry email.`,
    });
  } catch (err: any) {
    console.error("[Broadcast API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
