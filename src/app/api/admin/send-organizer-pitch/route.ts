import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";

export async function POST(req: NextRequest) {
  try {
    // 1. Auth Gate via Shared Helper
    const authResult = await requireOutreachAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;

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

    // 3. Update status in DB via Supabase Admin Client (Sets last_sent_to without overwriting original organizer_email)
    const { error: dbErr } = await supabaseAdmin
      .from("organizer_leads")
      .update({
        status: "pitch_sent",
        last_sent_to: recipientEmail,
        pitch_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    if (dbErr) {
      console.error("[Send Pitch] DB Update Error:", dbErr);
      return NextResponse.json({
        success: true,
        sentTo: targetEmail,
        status: "pitch_sent",
        dbUpdateFailed: true,
        dbError: dbErr.message,
      });
    }

    return NextResponse.json({
      success: true,
      sentTo: targetEmail,
      status: "pitch_sent",
      dbUpdateFailed: false,
    });
  } catch (err: any) {
    console.error("[Send Pitch] Exception:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
