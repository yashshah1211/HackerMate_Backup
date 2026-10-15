import { dispatchEmail, dispatchHttpStatus, dispatchResponse } from "@/lib/emailDispatch";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recordEmailSendSuccess } from "@/lib/admin/emailBudgetGuard";
import { renderHackerMateEmail } from "@/lib/emailTemplate";

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
      recipientEmail,
      recipientName,
      message,
      link,
    } = body;

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!recipientEmail || !emailRegex.test(recipientEmail.trim()) || !message) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid payload parameters: valid recipientEmail and message are required." },
        { status: 400 }
      );
    }

    // High-Intent Filter: Conserve Resend email quota by only sending emails for high-intent actions
    const lowerMsg = message.toLowerCase();
    const lowerLink = (link || "").toLowerCase();

    const isHighIntent =
      lowerLink.includes("/invites") ||
      lowerLink.includes("/teams") ||
      lowerLink.includes("/connections") ||
      lowerLink.includes("/messages") ||
      lowerLink.includes("/certificates") ||
      lowerMsg.includes("invite") ||
      lowerMsg.includes("request") ||
      lowerMsg.includes("applied") ||
      lowerMsg.includes("accept") ||
      lowerMsg.includes("joined") ||
      lowerMsg.includes("team") ||
      lowerMsg.includes("connect") ||
      lowerMsg.includes("message") ||
      lowerMsg.includes("chat") ||
      lowerMsg.includes("badge") ||
      lowerMsg.includes("certificate") ||
      lowerMsg.includes("winner");

    if (!isHighIntent) {
      console.log(`[Notification Webhook] Skipped low-intent notification email for "${recipientEmail}": "${message}"`);
      return NextResponse.json(
        { success: true, skipped: true, reason: "Low-intent notification skipped to conserve Resend daily email quota" },
        { status: 200 }
      );
    }

    function escapeHtml(text: string): string {
      if (!text) return "";
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    // 3. Determine Email Subject and Action Details
    // Truncate message for subject line if too long
    const truncatedMsg = message.length > 50 ? `${message.substring(0, 47)}...` : message;
    const rawSubject = `[HackerMate] ${truncatedMsg}`;
    const subject = escapeHtml(rawSubject);
    const title = "New Notification";
    
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const requestBaseUrl = host ? `${proto}://${host}` : null;
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || requestBaseUrl || "http://localhost:3000";
    const path = link ? (link.startsWith("/") ? link : `/${link}`) : "/notifications";
    const actionUrl = `${baseUrl}${path}`;
    const actionLabel = "View Notification";

    const safeMessage = message.length > 250 ? `${message.substring(0, 247)}...` : message;

    // 4. Construct Premium Responsive HTML Email (Linear/Vercel inspired dark theme)
    const html = renderHackerMateEmail({
      title,
      recipientName: recipientName || "Builder",
      introText: safeMessage,
      actionLabel,
      actionUrl,
      badgeText: "Notification",
      footerNote: `You are receiving this offline notification because of activity on your HackerMate account. To adjust your alert settings, edit your builder profile.`,
    });

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");
    const dispatch = await dispatchEmail({ from: process.env.RESEND_FROM_EMAIL || "", to: recipientEmail, subject: subject, html });
    const accounting = dispatch.status === "accepted" ? await recordEmailSendSuccess(supabaseAdmin, "notifications", 1) : { status: "not_required" };
    return NextResponse.json({ ...dispatchResponse(dispatch), accounting }, { status: dispatchHttpStatus(dispatch) });

  } catch (err: any) {
    console.error("Offline Notification Webhook Catch-All Error:", err);
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}
