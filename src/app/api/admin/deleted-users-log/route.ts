import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireOutreachAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;

    const { data: logs, error } = await supabaseAdmin
      .from("deleted_user_logs")
      .select("*")
      .order("deleted_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[Deleted Users Log Route Error]:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch deleted user logs" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      logs: logs || [],
    });
  } catch (err: any) {
    console.error("[Deleted Users Log Route Exception]:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
