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

    if (error) {
      // Table might not exist yet or be empty, return zeroed fallback
      return NextResponse.json({
        success: true,
        stats: {
          delivered: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
          deliveryRate: "100.0%",
          openRate: "0.0%",
          clickRate: "0.0%",
        },
        recentEvents: [],
      });
    }

    const eventsList = events || [];
    const deliveredCount = eventsList.filter((e) => e.event_type === "delivered").length;
    const openedCount = eventsList.filter((e) => e.event_type === "opened").length;
    const clickedCount = eventsList.filter((e) => e.event_type === "clicked").length;
    const bouncedCount = eventsList.filter((e) => e.event_type === "bounced").length;

    const totalTracked = eventsList.length || 1;
    const deliveryRate = ((deliveredCount / Math.max(1, totalTracked)) * 100).toFixed(1) + "%";
    const openRate = ((openedCount / Math.max(1, deliveredCount || 1)) * 100).toFixed(1) + "%";
    const clickRate = ((clickedCount / Math.max(1, openedCount || 1)) * 100).toFixed(1) + "%";

    return NextResponse.json({
      success: true,
      stats: {
        delivered: deliveredCount,
        opened: openedCount,
        clicked: clickedCount,
        bounced: bouncedCount,
        deliveryRate,
        openRate,
        clickRate,
      },
      recentEvents: eventsList,
    });
  } catch (err: any) {
    console.error("[Email Analytics API Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch email analytics" },
      { status: 500 }
    );
  }
}
