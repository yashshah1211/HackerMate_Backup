import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;

    // Fetch recent 50 webhook events
    const { data: events, error } = await supabaseAdmin
      .from("resend_webhook_events")
      .select("id, resend_email_id, event_type, recipient_email, subject, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !events) {
      console.error("[Email Analytics] Webhook metrics unavailable:", error);
      return NextResponse.json({ success: false, status: "unavailable", error: "Webhook metrics unavailable.", stats: null, recentEvents: null }, { status: 503 });
    }
    // A bounded event sample is evidence of events only: no complete population or deduped message denominator.
    return NextResponse.json({ success: true, status: "partial", note: "Recent webhook sample; rates and complete delivery totals are unavailable.",
      stats: {
        delivered: events.filter(e => e.event_type === "delivered").length,
        opened: events.filter(e => e.event_type === "opened").length,
        clicked: events.filter(e => e.event_type === "clicked").length,
        bounced: events.filter(e => e.event_type === "bounced").length,
        deliveryRate: "Unavailable", openRate: "Unavailable", clickRate: "Unavailable",
      }, recentEvents: events });
  } catch (err: any) {
    console.error("[Email Analytics API Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch email analytics" },
      { status: 500 }
    );
  }
}
