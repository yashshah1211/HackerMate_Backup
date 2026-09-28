import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase admin credentials.");
  }
  return createClient(url, serviceRoleKey);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const supabaseAdmin = getSupabaseAdmin();

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      userId = userData?.user?.id || null;
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check membership / ownership / admin
    const [{ data: teamData }, { data: memberData }, { data: profileData }] = await Promise.all([
      supabaseAdmin.from("teams").select("id, owner_id").eq("id", teamId).maybeSingle(),
      supabaseAdmin.from("team_members").select("id").eq("team_id", teamId).eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("profiles").select("id, role").eq("id", userId).maybeSingle(),
    ]);

    const isOwner = teamData?.owner_id === userId;
    const isMember = !!memberData;
    const isAdmin = profileData?.role === "admin";

    if (!isOwner && !isMember && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const BASE_COLUMNS =
      "id, team_id, ps_title, ps_category, submission_type, external_link_url, file_name, version, status, score_novelty, score_tech, score_ui_ux, score_team, score_impact, score_plan, score_clarity, total_score, grade, slide_breakdown, ai_feedback, error_message, created_at, updated_at";

    let { data: evaluations, error } = await supabaseAdmin
      .from("team_ppt_evaluations")
      .select(`${BASE_COLUMNS}, track_id`)
      .eq("team_id", teamId)
      .order("version", { ascending: false });

    // Migration 20260905210000 (track_id) is not applied on every environment.
    // Postgres reports the missing column as 42703; retry without it so the
    // list still loads. The client already falls back to ai_feedback.track_id.
    if (error && error.code === "42703") {
      console.warn("[PPT Evaluations List] track_id column missing; retrying without it:", error.message);
      const retry = await supabaseAdmin
        .from("team_ppt_evaluations")
        .select(BASE_COLUMNS)
        .eq("team_id", teamId)
        .order("version", { ascending: false });
      evaluations = retry.data as typeof evaluations;
      error = retry.error;
    }

    if (error) {
      console.error("[PPT Evaluations List] DB query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ evaluations: evaluations || [] });
  } catch (err: any) {
    console.error("[PPT Evaluations List] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const supabaseAdmin = getSupabaseAdmin();

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      userId = userData?.user?.id || null;
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check membership / ownership / admin
    const [{ data: teamData }, { data: memberData }, { data: profileData }] = await Promise.all([
      supabaseAdmin.from("teams").select("id, owner_id").eq("id", teamId).maybeSingle(),
      supabaseAdmin.from("team_members").select("id").eq("team_id", teamId).eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("profiles").select("id, role").eq("id", userId).maybeSingle(),
    ]);

    const isOwner = teamData?.owner_id === userId;
    const isMember = !!memberData;
    const isAdmin = profileData?.role === "admin";

    if (!isOwner && !isMember && !isAdmin) {
      return NextResponse.json({ error: "Forbidden: Only teammates or owners can delete evaluations." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    let evalId = searchParams.get("evalId");

    if (!evalId) {
      const body = await req.json().catch(() => ({}));
      evalId = body.evalId;
    }

    if (!evalId) {
      return NextResponse.json({ error: "Missing evaluation ID to delete." }, { status: 400 });
    }

    const { error: deleteErr } = await supabaseAdmin
      .from("team_ppt_evaluations")
      .delete()
      .eq("id", evalId)
      .eq("team_id", teamId);

    if (deleteErr) {
      console.error("[PPT Evaluation Delete] Error:", deleteErr);
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: evalId });
  } catch (err: any) {
    console.error("[PPT Evaluation Delete] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
