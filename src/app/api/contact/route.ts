import { dispatchEmail, dispatchHttpStatus, dispatchResponse } from "@/lib/emailDispatch";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recordEmailSendSuccess } from "@/lib/admin/emailBudgetGuard";
import { renderHackerMateEmail } from "@/lib/emailTemplate";

// Service-role client only. There is deliberately no anon-key fallback: the
// rate limiter (check_rate_limit) is executable by service_role only, so a
// missing key must fail closed instead of silently skipping rate limiting.
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map((ip) => ip.trim()).filter(Boolean);
    if (ips.length > 0) {
      // Use the last hop appended by trusted reverse proxy (e.g. Vercel/Cloudflare)
      return ips[ips.length - 1];
    }
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    console.error("[Contact API] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; failing closed.");
    return NextResponse.json(
      { error: "The contact form is temporarily unavailable. Please try again later." },
      { status: 503 }
    );
  }
  const ip = getIp(req);

  // Per-IP rate limit via the check_rate_limit RPC (service_role only).
  const { data: rateLimitData, error: rateLimitErr } = await supabaseAdmin.rpc(
    "check_rate_limit",
    {
      p_ip: ip,
      p_limit: 5,
      p_window_interval: "1 hour",
    }
  );

  // Fail closed: if the rate limit can't be evaluated, don't send.
  if (rateLimitErr || !rateLimitData || rateLimitData.length === 0) {
    console.error(
      "[Contact API] Rate limiter unavailable; failing closed:",
      rateLimitErr ?? "no rate-limit decision returned"
    );
    return NextResponse.json(
      { error: "The contact form is temporarily unavailable. Please try again later." },
      { status: 503 }
    );
  }

  const { allowed, reset_time } = rateLimitData[0];

  if (!allowed) {
    const resetMs = new Date(reset_time).getTime();
    const retryAfterSeconds = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
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
      console.warn("[Honeypot Triggered] Blocked bot submission; no email dispatched.");
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

    const trimmedName = String(name).trim();
    if (trimmedName.length > 100) {
      return NextResponse.json(
        { error: "Name cannot exceed 100 characters." },
        { status: 400 }
      );
    }

    const trimmedSubject = String(subject).trim();
    if (trimmedSubject.length > 200) {
      return NextResponse.json(
        { error: "Subject cannot exceed 200 characters." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email).trim())) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const trimmedMsg = String(message).trim();
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
    const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>";

    // Recipient email configuration priority
    const recipientEmail = process.env.ADMIN_CONTACT_EMAIL ||
                         process.env.RESEND_SANDBOX_RECIPIENT ||
                         process.env.RESEND_FROM_EMAIL ||
                         "admin@hackermate.dev";

    // Escape values for safe HTML rendering
    const emailSubject = `[HackerMate Inquiry] ${subject}`;

    // 4. Construct Premium responsive HTML Email Template
    const html = renderHackerMateEmail({
      title: "New Contact Inquiry",
      recipientName: "HackerMate Team",
      introText: "You have received a new inquiry submitted through the HackerMate contact form:",
      details: [
        { label: "From", value: name },
        { label: "Email", value: email },
        { label: "Subject", value: subject },
      ],
      calloutQuote: trimmedMsg,
      calloutLabel: "Inquiry Message",
      actionLabel: `Reply to ${name}`,
      actionUrl: `mailto:${email}?subject=Re: ${encodeURIComponent(subject)}`,
      badgeText: "Inquiry",
      footerNote: "This is an automated notification from the HackerMate Contact form.",
    });

    const dispatch = await dispatchEmail({ from: fromEmail, to: recipientEmail, subject: emailSubject, html, reply_to: email });
    const accounting = dispatch.status === "accepted" ? await recordEmailSendSuccess(supabaseAdmin, "contact_submissions", 1) : { status: "not_required" };
    return NextResponse.json({ ...dispatchResponse(dispatch), accounting }, { status: dispatchHttpStatus(dispatch) });

  } catch (err: any) {
    console.error("Contact API Catch-All Error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: err.message },
      { status: 500 }
    );
  }
}
