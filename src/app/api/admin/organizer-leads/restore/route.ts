import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireOutreachAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;

    // Restore all removed leads by updating status back to 'new' where pitch_sent_at is null, or 'pitch_sent' if pitch_sent_at exists
    const { data: removedLeads, error: fetchErr } = await supabaseAdmin
      .from("organizer_leads")
      .select("id, pitch_sent_at")
      .eq("status", "removed");

    if (fetchErr) {
      console.error("[Restore Leads] Fetch Error:", fetchErr);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!removedLeads || removedLeads.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: "No removed leads found to restore." });
    }

    let restoredCount = 0;
    for (const lead of removedLeads) {
      const nextStatus = lead.pitch_sent_at ? "pitch_sent" : "new";
      const { error: updateErr } = await supabaseAdmin
        .from("organizer_leads")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", lead.id);

      if (!updateErr) restoredCount++;
    }

    return NextResponse.json({
      success: true,
      count: restoredCount,
      message: `Restored ${restoredCount} lead(s) successfully!`,
    });
  } catch (err: any) {
    console.error("[Restore Leads] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
