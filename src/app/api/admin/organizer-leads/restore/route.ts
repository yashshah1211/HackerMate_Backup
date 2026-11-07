import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";
import { isLeadId, RESTORED_REVIEW_STATUS, restorationErrorCode } from "@/lib/admin/organizerLeadRestore";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireOutreachAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const body: unknown = await req.json().catch(() => null);
    if (req.nextUrl.search || !body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !("leadId" in body) || !isLeadId(body.leadId)) {
      return NextResponse.json({ error: "Select exactly one lead UUID." }, { status: 400 });
    }
    const leadId = body.leadId.toLowerCase();
    const { data, error } = await auth.supabaseAdmin.rpc("restore_organizer_lead", { p_lead_id: leadId });
    if (error) {
      console.error("[Restore Lead] Database operation failed:", restorationErrorCode(error));
      return NextResponse.json({ error: "Restoration could not be confirmed. Refresh before retrying." }, { status: 500 });
    }
    // Reject unexpected receipts, including a successful result for another ID.
    if (data?.lead_id === leadId && data.outcome === "missing") {
      return NextResponse.json({ error: "Lead no longer exists. Refresh the list." }, { status: 404 });
    }
    if (data?.lead_id === leadId && data.outcome === "conflict") {
      return NextResponse.json({ error: "Lead is no longer removed. Refresh the list." }, { status: 409 });
    }
    if (data?.outcome !== "restored" || data.lead_id !== leadId || data.status !== RESTORED_REVIEW_STATUS) {
      console.error("[Restore Lead] Unexpected database receipt.");
      return NextResponse.json({ error: "Restoration could not be confirmed. Refresh before retrying." }, { status: 500 });
    }
    return NextResponse.json({ success: true, leadId, status: RESTORED_REVIEW_STATUS });
  } catch (error) {
    console.error("[Restore Lead] Request failed; outcome unconfirmed:", restorationErrorCode(error));
    return NextResponse.json({ error: "Restoration could not be confirmed. Refresh before retrying." }, { status: 500 });
  }
}
