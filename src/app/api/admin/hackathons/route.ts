import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;

    // Fetch only native & partner hackathons explicitly hosted on HackerMate
    const { data: hackathons, error } = await supabaseAdmin
      .from("hackathons")
      .select("*, profiles:organizer_id(id, full_name, email)")
      .or("type.eq.native,type.eq.partner,organizer_id.not.is.null")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Admin Hackathons GET Error]:", error);
      return NextResponse.json({ error: "Failed to fetch hackathons." }, { status: 500 });
    }

    // Map status fallback to ai_feedback or status column
    const normalized = (hackathons || []).map((h: any) => {
      const fb = h.ai_feedback || {};
      const status = h.status || fb.status || (h.type === "native" ? "pending" : "approved");
      return {
        ...h,
        status,
        organizerName: h.profiles?.full_name || "Unknown Host",
        organizerEmail: h.profiles?.email || "N/A",
      };
    });

    return NextResponse.json({
      success: true,
      hackathons: normalized,
    });
  } catch (err: any) {
    console.error("[Admin Hackathons GET Exception]:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user, supabaseAdmin } = authResult;

    const body = await req.json();
    const { hackathonId, action } = body; // action: 'approve' | 'reject' | 'delete'

    if (!hackathonId || !action) {
      return NextResponse.json({ error: "Missing hackathonId or action" }, { status: 400 });
    }

    // 1. DELETE ACTION
    if (action === "delete") {
      // First delete any team_hackathons references
      await supabaseAdmin.from("team_hackathons").delete().eq("hackathon_id", hackathonId);
      // Delete hackathon_registrations references
      await supabaseAdmin.from("hackathon_registrations").delete().eq("hackathon_id", hackathonId);

      const { error: delErr } = await supabaseAdmin.from("hackathons").delete().eq("id", hackathonId);

      if (delErr) {
        console.error("[Admin Delete Hackathon Error]:", delErr);
        return NextResponse.json({ error: "Failed to delete hackathon from database." }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "Hackathon permanently deleted from database.",
      });
    }

    // 2. APPROVE OR REJECT ACTION
    const newStatus = action === "approve" ? "approved" : "rejected";

    // Fetch existing hackathon
    const { data: hData, error: hErr } = await supabaseAdmin
      .from("hackathons")
      .select("id, ai_feedback")
      .eq("id", hackathonId)
      .single();

    if (hErr || !hData) {
      return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
    }

    const existingFeedback = hData.ai_feedback || {};
    const updatedFeedback = {
      ...existingFeedback,
      status: newStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    };

    // Update both ai_feedback JSONB and status column if available
    let updatedHackathon: any = null;
    const { data: fbResult, error: fbErr } = await supabaseAdmin
      .from("hackathons")
      .update({
        ai_feedback: updatedFeedback,
        updated_at: new Date().toISOString(),
      })
      .eq("id", hackathonId)
      .select()
      .single();

    if (fbErr) {
      console.error("[Admin Update Hackathon Status Error]:", fbErr);
      return NextResponse.json({ error: "Failed to update hackathon status." }, { status: 500 });
    }

    updatedHackathon = fbResult;

    // Try updating status column directly if present
    try {
      const { data: colResult } = await supabaseAdmin
        .from("hackathons")
        .update({ status: newStatus })
        .eq("id", hackathonId)
        .select()
        .single();

      if (colResult) updatedHackathon = colResult;
    } catch {
      // Ignore if status column is absent
    }

    return NextResponse.json({
      success: true,
      hackathon: updatedHackathon,
      message: `Hackathon successfully ${newStatus}!`,
    });
  } catch (err: any) {
    console.error("[Admin Hackathons POST Exception]:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
