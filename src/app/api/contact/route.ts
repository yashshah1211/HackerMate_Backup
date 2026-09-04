import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recordEmailSendSuccess } from "@/lib/admin/emailBudgetGuard";
import { renderHackerMateEmail } from "@/lib/emailTemplate";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

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
  const ip = getIp(req);
  
  // Call atomic Supabase rate limiter RPC
  const { data: rateLimitData, error: rateLimitErr } = await supabaseAdmin.rpc(
    "check_rate_limit",
    {
      p_ip: ip,
      p_limit: 5,
      p_window_interval: "1 hour",
    }
  );

  if (rateLimitErr) {
    console.error("Database Rate Limiter Error:", rateLimitErr);
  } else if (rateLimitData && rateLimitData.length > 0) {
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
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>";
    
    // Recipient email configuration priority
    let recipientEmail = process.env.ADMIN_CONTACT_EMAIL || 
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

    try {
      await recordEmailSendSuccess(supabaseAdmin, "contact_submissions", 1);
    } catch (dbErr) {
      console.warn("[Contact Submit API] Failed to record email stats:", dbErr);
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
