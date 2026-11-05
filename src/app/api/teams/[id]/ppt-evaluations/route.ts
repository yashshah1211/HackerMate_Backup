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

async function authorizeEvaluations(req: NextRequest, teamId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const header = req.headers.get("Authorization");
  if (!header || !/^Bearer [^\s]+$/.test(header)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: identity, error: identityError } = await supabaseAdmin.auth.getUser(header.slice(7));
  if (identityError) {
    console.error("[PPT Evaluations] Identity verification failed:", identityError);
    return NextResponse.json({ error: "Unable to verify access" }, { status: [400, 401, 403].includes(identityError.status ?? 0) ? 401 : 503 });
  }
  const userId = identity?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [team, member, profile] = await Promise.all([
    supabaseAdmin.from("teams").select("id, owner_id").eq("id", teamId).maybeSingle(),
    supabaseAdmin.from("team_members").select("id").eq("team_id", teamId).eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("profiles").select("id, role, is_banned").eq("id", userId).maybeSingle(),
  ]);
  for (const [name, result] of [["team", team], ["membership", member], ["profile", profile]] as const) {
    if (result.error) {
      console.error(`[PPT Evaluations] ${name} verification failed:`, result.error);
      return NextResponse.json({ error: "Unable to verify access" }, { status: 503 });
    }
  }
  if (!profile.data || profile.data.id !== userId || profile.data.is_banned !== false) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!team.data) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  if (team.data.owner_id !== userId && !member.data && profile.data.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { supabaseAdmin };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const access = await authorizeEvaluations(req, teamId);
    if (access instanceof NextResponse) return access;
    const { supabaseAdmin } = access;

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
    if (error && (error.code === "42703" || error.code === "PGRST204") && error.message?.includes("track_id")) {
      console.warn("[PPT Evaluations List] track_id column missing or schema stale; retrying without it:", error.message);
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
    const access = await authorizeEvaluations(req, teamId);
    if (access instanceof NextResponse) return access;
    const { supabaseAdmin } = access;

    const { searchParams } = new URL(req.url);
    let evalId = searchParams.get("evalId");

    if (!evalId) {
      const body = await req.json().catch(() => ({}));
      evalId = body.evalId;
    }

    if (!evalId) {
      return NextResponse.json({ error: "Missing evaluation ID to delete." }, { status: 400 });
    }

    const { data: deleted, error: deleteErr } = await supabaseAdmin
      .from("team_ppt_evaluations")
      .delete()
      .eq("id", evalId)
      .eq("team_id", teamId)
      .select("id")
      .maybeSingle();

    if (deleteErr) {
      console.error("[PPT Evaluation Delete] Error:", deleteErr);
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    if (!deleted) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });
    return NextResponse.json({ success: true, deletedId: deleted.id });
  } catch (err: any) {
    console.error("[PPT Evaluation Delete] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
