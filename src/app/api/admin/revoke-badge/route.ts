import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;

    const { searchParams } = new URL(req.url);
    const badgeId = searchParams.get("id");

    if (!badgeId) {
      return NextResponse.json({ error: "Badge ID is required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("user_badges")
      .delete()
      .eq("id", badgeId);

    if (error) {
      console.error("[Revoke Badge] Supabase delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: badgeId });
  } catch (err: any) {
    console.error("[Revoke Badge] Unexpected error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
