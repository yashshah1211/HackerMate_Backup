import { dispatchHttpStatus, dispatchResponse } from "@/lib/emailDispatch";
import { checkEmailBudget, recordEmailSendSuccess } from "@/lib/admin/emailBudgetGuard";
import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";
import { organizerTrackingPixel } from "@/lib/emailOpenTracking";
import { isLeadId, restorationErrorCode } from "@/lib/admin/organizerLeadRestore";
import { normalizedPitchRecipient, sendClaimedOrganizerPitch, recordOrganizerPitchAccounting } from "@/lib/admin/organizerPitchClaims";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireOutreachAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json().catch(() => null);
    const recipient = normalizedPitchRecipient(body?.recipientEmail);
    if (!body || typeof body !== "object" || Array.isArray(body) || req.nextUrl.search ||
        Object.keys(body).some(key => !["intentId", "leadId", "recipientEmail", "subject", "contentHtml", "repeatOf"].includes(key)) ||
        !isLeadId(body.intentId) || !isLeadId(body.leadId) || !recipient ||
        typeof body.subject !== "string" || !body.subject.trim() || body.subject.length > 200 || /[\r\n\0]/.test(body.subject) ||
        typeof body.contentHtml !== "string" || !body.contentHtml.trim() || body.contentHtml.length > 100_000 || body.contentHtml.includes("\0") ||
        (body.repeatOf !== undefined && !(isLeadId(body.repeatOf) || (typeof body.repeatOf === "string" && /^legacy:[a-f0-9]{64}$/.test(body.repeatOf))))) {
      return NextResponse.json({ success: false, error: "Provide one valid lead and send-intent UUID, recipient, subject and HTML content.", retrySafe: false }, { status: 400 });
    }
    const leadId = body.leadId.toLowerCase();
    const { data: lead, error } = await auth.supabaseAdmin.from("organizer_leads")
      .select("id,status").eq("id", leadId).maybeSingle();
    if (error) {
      console.error("[Send Pitch] Eligibility unavailable:", restorationErrorCode(error));
      return NextResponse.json({ error: "Lead eligibility unavailable; no email dispatched.", retrySafe: false }, { status: 503 });
    }
    if (!lead || !["new", "no_email", "pitch_sent", "opened", "replied", "negotiating", "partner_live"].includes(lead.status)) {
      return NextResponse.json({ error: "Lead unavailable for dispatch; review its current state.", retrySafe: false }, { status: 409 });
    }
    const budget = await checkEmailBudget(auth.supabaseAdmin, "outreach", 1);
    if (!budget.allowedCount) return NextResponse.json({ error: "Outreach budget exhausted; no request sent.", retrySafe: false }, { status: 429 });
    const from = process.env.RESEND_FROM_EMAIL || "";
    const pixel = organizerTrackingPixel(process.env.NEXT_PUBLIC_SITE_URL || "https://www.hackermate.in", leadId);
    const result = await sendClaimedOrganizerPitch(auth.supabaseAdmin, {
      intentId: body.intentId, leadId, recipient, mode: "manual", repeatOf: body.repeatOf,
      payload: { from, to: recipient, subject: body.subject.trim(),
        html: from.toLowerCase().includes("onboarding@resend.dev") ? body.contentHtml : `${body.contentHtml}\n${pixel}`,
        reply_to: process.env.OUTREACH_REPLY_TO_EMAIL?.split(",").map(e => e.trim()).filter(Boolean) || "contacthackermate@gmail.com" },
    });
    if (result.kind === "blocked") {
      const message = result.outcome === "approval_required" ? "Previous contact recorded. A separate explicit re-pitch approval is required."
        : result.outcome === "unavailable" ? "Send claim unavailable or unconfirmed. No provider request from this call; review durable state before resubmitting."
        : ["claimed", "dispatching"].includes(result.state || "") ? "Another attempt is already in progress. Duplicate send prevented; do not resend."
        : "Duplicate or suppressed send prevented. Review durable state and provider history before another contact.";
      return NextResponse.json({ success: false, error: message, retrySafe: false,
        sendState: result.outcome, attemptState: result.state, repeatOf: result.repeatOf,
      }, { status: result.outcome === "unavailable" ? 503 : 409 });
    }
    const { dispatch } = result;
    let accounting: { status: string } = { status: "not_required" };
    let journal = result.journal;
    if (dispatch.status === "accepted") {
      try { accounting = await recordEmailSendSuccess(auth.supabaseAdmin, "outreach", 1); }
      catch { accounting = { status: "failed" }; }
      if (!await recordOrganizerPitchAccounting(auth.supabaseAdmin, result.intentId, accounting.status === "recorded")) journal = "failed";
    }
    return NextResponse.json({ ...dispatchResponse(dispatch), accounting, bookkeeping: result.bookkeeping,
      intentId: result.intentId, intentJournal: journal, resendId: dispatch.providerId,
      dbUpdateFailed: result.bookkeeping === "failed" || journal === "failed", retrySafe: false,
    }, { status: dispatchHttpStatus(dispatch) });
  } catch (error) {
    console.error("[Send Pitch] Operation unavailable:", restorationErrorCode(error));
    return NextResponse.json({ error: "Send outcome unavailable. Review durable state and provider history; do not resend.", retrySafe: false }, { status: 503 });
  }
}
