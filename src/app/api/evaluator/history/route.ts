import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { EvaluationFailure, evaluationFailure, evaluationRead, evaluationSignal, isUuid, readEvaluationJson, verifiedEvaluationActor, type EvaluationExecution } from "@/lib/evaluator/evaluationContract";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase admin credentials.");
  }
  return createClient(url, serviceRoleKey);
}

async function getAuthenticatedUserId(req: NextRequest, supabaseAdmin: ReturnType<typeof getSupabaseAdmin>): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && userData?.user?.id) {
      return userData.user.id;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const userId = await getAuthenticatedUserId(req, supabaseAdmin);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: evaluations, error } = await supabaseAdmin
      .from("user_pitch_evaluations")
      .select("id, user_id, ps_title, track_id, total_score, grade, used_ai_engine, sub_scores, evaluation_result, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[Evaluator History GET Error]:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      history: evaluations || [],
    });
  } catch (err: unknown) {
    console.error("[Evaluator History GET Exception]:", err);
    const message = err && typeof err === "object" && "message" in err && typeof err.message === "string" ? err.message : "";
    return NextResponse.json(
      { error: message || "Internal server error fetching evaluation history." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const userId = await getAuthenticatedUserId(req, supabaseAdmin);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const evalId = searchParams.get("id");

    if (!evalId) {
      return NextResponse.json({ error: "Missing evaluation ID" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("user_pitch_evaluations")
      .delete()
      .eq("id", evalId)
      .eq("user_id", userId);

    if (error) {
      console.error("[Evaluator History DELETE Error]:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[Evaluator History DELETE Exception]:", err);
    const message = err && typeof err === "object" && "message" in err && typeof err.message === "string" ? err.message : "";
    return NextResponse.json(
      { error: message || "Internal server error deleting evaluation history." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const requestId = randomUUID();
  const execution: EvaluationExecution = { deadlineAt: Date.now() + 5_000, signal: req.signal, attempts: 0, requestId };
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const userId = await verifiedEvaluationActor(supabaseAdmin, req, execution);
    const { evaluationId, teamId } = await readEvaluationJson(req, execution);
    if (!isUuid(evaluationId) || !isUuid(teamId)) throw new EvaluationFailure("invalid_input");

    const [memberData, teamData] = await Promise.all([
      evaluationRead(supabaseAdmin.from("team_members").select("id").eq("team_id", teamId).eq("user_id", userId)
        .abortSignal(evaluationSignal(execution)).maybeSingle(), execution, "read_attachment_membership"),
      evaluationRead(supabaseAdmin.from("teams").select("id, name, owner_id").eq("id", teamId)
        .abortSignal(evaluationSignal(execution)).maybeSingle(), execution, "read_attachment_team"),
    ]);
    if (!teamData) throw new EvaluationFailure("not_found");
    if (teamData.id !== teamId || (teamData.owner_id !== userId && !memberData)) throw new EvaluationFailure("forbidden");

    const evalRecord = await evaluationRead(supabaseAdmin.from("user_pitch_evaluations").select("id, user_id, ps_title")
      .eq("id", evaluationId).abortSignal(evaluationSignal(execution)).maybeSingle(), execution, "read_attachment_evaluation");
    if (!evalRecord) throw new EvaluationFailure("not_found");
    if (evalRecord.id !== evaluationId || evalRecord.user_id !== userId) throw new EvaluationFailure("forbidden");

    // This API is the only user-facing attachment writer; never forward body fields.
    const updated = await evaluationRead(supabaseAdmin.from("user_pitch_evaluations").update({ team_id: teamId })
      .eq("id", evaluationId).eq("user_id", userId).select("id, ps_title")
      .abortSignal(evaluationSignal(execution)).maybeSingle(), execution, "attach_evaluation");
    if (!updated || updated.id !== evaluationId) throw new EvaluationFailure("persistence_uncertain");
    return NextResponse.json({ success: true, evaluationId: updated.id, teamId, teamName: teamData.name });
  } catch (error) {
    const failure = evaluationFailure(error, requestId);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
