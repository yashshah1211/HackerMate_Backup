import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { getOrCreateTodayStats } from "@/lib/admin/emailBudgetGuard";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;
    const body = await req.json();
    const { total_sent } = body;

    const countNum = Number(total_sent);
    if (isNaN(countNum) || countNum < 0 || countNum > 1000) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid email count (0-1000)." },
        { status: 400 }
      );
    }

    const todayStr = new Date().toISOString().split("T")[0];
    await getOrCreateTodayStats(supabaseAdmin);

    const { error } = await supabaseAdmin
      .from("daily_email_stats")
      .update({
        total_sent: countNum,
        updated_at: new Date().toISOString(),
      })
      .eq("date", todayStr);

    if (error) {
      console.error("[Sync Email Stats API] Error updating daily_email_stats:", error);
      return NextResponse.json(
        { success: false, error: "Failed to update database email stats." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully calibrated today's email count to ${countNum}`,
      total_sent: countNum,
    });
  } catch (err: any) {
    console.error("[Sync Email Stats API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to calibrate email stats." },
      { status: 500 }
    );
  }
}
