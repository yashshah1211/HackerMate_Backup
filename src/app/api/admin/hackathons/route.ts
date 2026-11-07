import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";

// Database messages/details can contain records or custom trigger text. Retain
// the actual SQLSTATE for diagnostics without serializing those sensitive fields.
function databaseErrorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  return typeof code === "string" && /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(code) ? code : "unavailable";
}

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

    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid hackathon action request." }, { status: 400 });
    }
    const { hackathonId: rawId, action } = body as Record<string, unknown>;
    if (typeof rawId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)
      || typeof action !== "string" || !["approve", "reject", "delete"].includes(action)) {
      return NextResponse.json({ error: "A valid hackathon UUID and approve, reject, or delete action are required." }, { status: 400 });
    }
    const hackathonId = rawId.toLowerCase();

    // 1. DELETE ACTION
    if (action === "delete") {
      // One database statement: existing FK cascades/SET NULL actions participate
      // in the same transaction. Protected dependencies abort the whole delete.
      const { data: deleted, error: delErr } = await supabaseAdmin.rpc("admin_delete_hackathon", { p_hackathon_id: hackathonId });

      if (delErr) {
        const code = databaseErrorCode(delErr);
        console.error("[Admin Delete Hackathon Error]:", { code });
        return NextResponse.json({ error: code === "23503"
          ? "Hackathon has protected related data and could not be deleted."
          : "Failed to confirm hackathon deletion. Refresh before retrying." }, { status: code === "23503" ? 409 : 500 });
      }
      if (deleted === false) return NextResponse.json({ error: "Hackathon not found or no longer available." }, { status: 404 });
      if (deleted !== true) {
        console.error("[Admin Delete Hackathon Error]: Invalid database receipt.");
        return NextResponse.json({ error: "Failed to confirm hackathon deletion. Refresh before retrying." }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "Hackathon and its event-specific records permanently deleted. Teams and user accounts were preserved.",
      });
    }

    // 2. APPROVE OR REJECT ACTION
    const newStatus = action === "approve" ? "approved" : "rejected";

    // Fetch existing hackathon
    const { data: hData, error: hErr } = await supabaseAdmin
      .from("hackathons")
      .select("id, ai_feedback")
      .eq("id", hackathonId)
      .maybeSingle();

    if (hErr) {
      console.error("[Admin Hackathon Lookup Error]:", { code: databaseErrorCode(hErr) });
      return NextResponse.json({ error: "Failed to verify hackathon." }, { status: 500 });
    }
    if (!hData) {
      return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
    }

    const existingFeedback = hData.ai_feedback || {};
    const updatedFeedback = {
      ...existingFeedback,
      status: newStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    };

    // Persist the public status and review metadata atomically. The hackathons
    // schema has no updated_at column; reviewed_at belongs in ai_feedback.
    const { data: updatedHackathon, error: updateError } = await supabaseAdmin
      .from("hackathons")
      .update({
        ai_feedback: updatedFeedback,
        status: newStatus,
      })
      .eq("id", hackathonId)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error("[Admin Update Hackathon Status Error]:", { code: databaseErrorCode(updateError) });
      return NextResponse.json({ error: "Failed to update hackathon status." }, { status: 500 });
    }
    if (!updatedHackathon) return NextResponse.json({ error: "Hackathon not found or no longer available." }, { status: 404 });
    if (updatedHackathon.id !== hackathonId || updatedHackathon.status !== newStatus) {
      console.error("[Admin Update Hackathon Status Error]: Invalid database receipt.");
      return NextResponse.json({ error: "Failed to confirm hackathon status." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      hackathon: updatedHackathon,
      message: `Hackathon successfully ${newStatus}!`,
    });
  } catch (err: unknown) {
    console.error("[Admin Hackathons POST Exception]:", { code: databaseErrorCode(err) });
    return NextResponse.json({ error: "Unable to confirm hackathon action. Refresh before retrying." }, { status: 500 });
  }
}
