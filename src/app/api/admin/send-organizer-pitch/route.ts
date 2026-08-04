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

    // Validate email format with standard email regex
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!recipientEmail || !emailRegex.test(recipientEmail.trim())) {
      return NextResponse.json(
        { success: false, error: "Invalid recipient email address format." },
        { status: 400 }
      );
    }

    // 2. Dispatch Email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Yash from HackerMate <yash@hackermate.in>";
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

    let resendMessageId: string | null = null;

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
          reply_to: process.env.OUTREACH_REPLY_TO_EMAIL || "yashshah7117@gmail.com",
          subject: finalSubject,
          html: finalHtml,
        }),
      });

      const resendData = await resendRes.json();

      if (!resendRes.ok || !resendData?.id) {
        console.error("[Send Pitch] Resend API Error:", resendData);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to dispatch email via Resend API",
            details: resendData?.message || resendData || "Unknown Resend error",
          },
          { status: 500 }
        );
      }

      resendMessageId = resendData.id;
    } else {
      console.log("\n==================== [MOCK PITCH EMAIL LOG] ====================");
      console.log(`To: ${targetEmail}`);
      console.log(`Subject: ${finalSubject}`);
      console.log(`HTML Payload:\n${contentHtml}`);
      console.log("=================================================================\n");
      resendMessageId = "mock_send_id";
    }

    // 3. Update status in DB ONLY AFTER confirmed successful Resend API response
    const { error: dbErr } = await supabaseAdmin
      .from("organizer_leads")
      .update({
        status: "pitch_sent",
        last_sent_to: recipientEmail.trim(),
        pitch_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    if (dbErr) {
      console.error("[Send Pitch] DB Update Error:", dbErr);
      return NextResponse.json(
        {
          success: false,
          error: "Email dispatched via Resend, but database update failed.",
          resendId: resendMessageId,
          dbError: dbErr.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sentTo: targetEmail,
      status: "pitch_sent",
      resendId: resendMessageId,
    });
  } catch (err: any) {
    console.error("[Send Pitch] Exception:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
