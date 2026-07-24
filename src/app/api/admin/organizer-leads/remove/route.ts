import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireOutreachAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;
    const body = await req.json();
    const { leadId } = body;

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId parameter" }, { status: 400 });
    }

    const { error: dbErr } = await supabaseAdmin
      .from("organizer_leads")
      .update({ status: "removed", updated_at: new Date().toISOString() })
      .eq("id", leadId);

    if (dbErr) {
      console.error("[Remove Lead] DB Error:", dbErr);
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, leadId, status: "removed" });
  } catch (err: any) {
    console.error("[Remove Lead] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
