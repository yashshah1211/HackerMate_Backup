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
    const { leadId, status, notes, organizerEmail } = body;

    if (!leadId) {
      return NextResponse.json({ error: "Missing required leadId" }, { status: 400 });
    }

    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (status && typeof status === "string") {
      updates.status = status;
    }

    if (notes !== undefined && typeof notes === "string") {
      updates.notes = notes;
    }

    if (organizerEmail !== undefined && typeof organizerEmail === "string") {
      const trimmedEmail = organizerEmail.trim();
      updates.organizer_email = trimmedEmail || null;
      // If updating email on a lead with no_email status, move status to new if no pitch sent yet
      if (trimmedEmail && status === undefined) {
        const { data: currentLead } = await supabaseAdmin
          .from("organizer_leads")
          .select("status, pitch_sent_at")
          .eq("id", leadId)
          .single();

        if (currentLead && currentLead.status === "no_email" && !currentLead.pitch_sent_at) {
          updates.status = "new";
        }
      }
    }

    const { data: updatedLead, error: updateErr } = await supabaseAdmin
      .from("organizer_leads")
      .update(updates)
      .eq("id", leadId)
      .select()
      .single();

    if (updateErr) {
      console.error("[Update Lead Status API] DB Error:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Lead updated successfully",
      lead: updatedLead,
    });
  } catch (err: any) {
    console.error("[Update Lead Status API] Unexpected Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
