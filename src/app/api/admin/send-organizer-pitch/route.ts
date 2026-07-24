import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    // 1. Strict Auth Gate - Exclusive access for yashshah7117@gmail.com
    const supabaseUserClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: () => {},
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUserClient.auth.getUser();

    if (authError || !user || user.email !== "yashshah7117@gmail.com") {
      return NextResponse.json(
        { error: "Forbidden: Exclusive access for yashshah7117@gmail.com" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { leadId, recipientEmail, subject, contentHtml } = body;

    if (!leadId || !recipientEmail || !subject || !contentHtml) {
      return NextResponse.json(
        { error: "Missing required parameters: leadId, recipientEmail, subject, and contentHtml are required." },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      return NextResponse.json(
        { error: "Invalid recipient email address format." },
        { status: 400 }
      );
    }

    // 2. Dispatch Email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Yash from HackerMate <onboarding@resend.dev>";
    const isSandboxMode = fromEmail.includes("onboarding@resend.dev");

    let targetEmail = recipientEmail;
    let finalSubject = subject;

    if (isSandboxMode) {
      const sandboxEmail = process.env.RESEND_SANDBOX_RECIPIENT || "yashshah7117@gmail.com";
      if (targetEmail.toLowerCase() !== sandboxEmail.toLowerCase()) {
        console.log(`[Pitch Sandbox Override] Redirecting pitch from ${targetEmail} to sandbox ${sandboxEmail}`);
        finalSubject = `[Target: ${targetEmail}] ${subject}`;
        targetEmail = sandboxEmail;
      }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.hackermate.in";
    const trackingPixel = `<img src="${siteUrl}/api/webhooks/email-open?id=${leadId}" width="1" height="1" style="display:none; width:1px; height:1px; opacity:0;" alt="" />`;
    const finalHtml = `${contentHtml}\n${trackingPixel}`;

    if (resendApiKey) {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: targetEmail,
          reply_to: "yashshah7117@gmail.com",
          subject: finalSubject,
          html: finalHtml,
        }),
      });

      const resendData = await resendRes.json();

      if (!resendRes.ok) {
        console.error("[Send Pitch] Resend API Error:", resendData);
        return NextResponse.json(
          { error: "Failed to dispatch email via Resend", details: resendData },
          { status: 500 }
        );
      }
    } else {
      console.log("\n==================== [MOCK PITCH EMAIL LOG] ====================");
      console.log(`To: ${targetEmail}`);
      console.log(`Subject: ${finalSubject}`);
      console.log(`HTML Payload:\n${contentHtml}`);
      console.log("=================================================================\n");
    }

    // 3. Update status in DB via Supabase Admin Client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: dbErr } = await supabaseAdmin
      .from("organizer_leads")
      .update({
        status: "pitch_sent",
        organizer_email: recipientEmail,
        pitch_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    if (dbErr) {
      console.error("[Send Pitch] DB Update Error:", dbErr);
    }

    return NextResponse.json({
      success: true,
      sentTo: targetEmail,
      status: "pitch_sent",
    });
  } catch (err: any) {
    console.error("[Send Pitch] Exception:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
