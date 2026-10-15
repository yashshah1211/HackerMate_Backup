import { recordEmailBookkeeping, dispatchEmail, dispatchHttpStatus, dispatchResponse } from "@/lib/emailDispatch";
import { checkEmailBudget, recordEmailSendSuccess } from "@/lib/admin/emailBudgetGuard";
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

    const { data: lead, error: leadError } = await supabaseAdmin.from("organizer_leads")
      .select("id, status, pitch_sent_at").eq("id", leadId).maybeSingle();
    if (leadError) {
      console.error("[Send Pitch] Eligibility unavailable:", leadError);
      return NextResponse.json({ success: false, error: "Lead eligibility unavailable; no email dispatched." }, { status: 503 });
    }
    if (!lead || ["removed", "archived", "email_outcome_unknown"].includes(lead.status)) {
      return NextResponse.json({ success: false, error: "Lead unavailable for dispatch; review its current state." }, { status: 409 });
    }
    const budget = await checkEmailBudget(supabaseAdmin, "outreach", 1);
    if (!budget.allowedCount) return NextResponse.json({ success: false, error: "Outreach budget exhausted; no request sent." }, { status: 429 });
    const fromEmail = process.env.RESEND_FROM_EMAIL || "";
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.hackermate.in";
    const trackingPixel = `<img src="${siteUrl}/api/webhooks/email-open?id=${leadId}" width="1" height="1" style="display:none; width:1px; height:1px; opacity:0;" alt="" />`;
    const finalHtml = fromEmail.toLowerCase().includes("onboarding@resend.dev") ? contentHtml : `${contentHtml}\n${trackingPixel}`;

    const dispatch = await dispatchEmail({ from: fromEmail, to: recipientEmail.trim(), subject, html: finalHtml,
      reply_to: process.env.OUTREACH_REPLY_TO_EMAIL?.split(",").map(e => e.trim()).filter(Boolean) || "contacthackermate@gmail.com" });
    const accounting = dispatch.status === "accepted" ? await recordEmailSendSuccess(supabaseAdmin, "outreach", 1) : { status: "not_required" };
    let bookkeeping = "not_required";
    if (dispatch.intendedRecipientAccepted || dispatch.status === "unknown") {
      let write = supabaseAdmin.from("organizer_leads").update(dispatch.intendedRecipientAccepted ? {
        status: "pitch_sent", last_sent_to: recipientEmail.trim(), pitch_sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      } : { status: "email_outcome_unknown", updated_at: new Date().toISOString() })
        .eq("id", leadId);
      write = lead.status == null ? write.is("status", null) : write.eq("status", lead.status);
      bookkeeping = await recordEmailBookkeeping(() => write.select("id"));
      if (bookkeeping === "failed") console.error("[Send Pitch] Dispatch bookkeeping failed; do not resend.");
    }
    return NextResponse.json({ ...dispatchResponse(dispatch), accounting, bookkeeping,
      resendId: dispatch.providerId, dbUpdateFailed: bookkeeping === "failed", retrySafe: false,
    }, { status: dispatchHttpStatus(dispatch) });
  } catch (err: any) {
    console.error("[Send Pitch] Exception:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
