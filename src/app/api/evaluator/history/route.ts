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
  } catch (err: any) {
    console.error("[Evaluator History GET Exception]:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error fetching evaluation history." },
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
  } catch (err: any) {
    console.error("[Evaluator History DELETE Exception]:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error deleting evaluation history." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const userId = await getAuthenticatedUserId(req, supabaseAdmin);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { evaluationId, teamId } = body;

    if (!evaluationId || !teamId) {
      return NextResponse.json(
        { error: "Missing required fields: evaluationId and teamId are required." },
        { status: 400 }
      );
    }

    // 1. Verify user is owner or member of the target team
    const [{ data: memberData }, { data: teamData }] = await Promise.all([
      supabaseAdmin
        .from("team_members")
        .select("id")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("teams")
        .select("id, name, owner_id")
        .eq("id", teamId)
        .maybeSingle(),
    ]);

    if (!teamData) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    const isOwner = teamData.owner_id === userId;
    const isMember = Boolean(memberData);

    if (!isOwner && !isMember) {
      return NextResponse.json(
        { error: "Forbidden: You are not an active member or owner of this team." },
        { status: 403 }
      );
    }

    // 2. Verify evaluation exists and is owned by the authenticated user
    const { data: evalRecord, error: evalFetchErr } = await supabaseAdmin
      .from("user_pitch_evaluations")
      .select("id, user_id, ps_title")
      .eq("id", evaluationId)
      .maybeSingle();

    if (evalFetchErr) {
      console.error("[Evaluator History PATCH Fetch Error]:", evalFetchErr);
      return NextResponse.json({ error: evalFetchErr.message }, { status: 500 });
    }

    if (!evalRecord) {
      return NextResponse.json({ error: "Evaluation not found." }, { status: 404 });
    }

    if (evalRecord.user_id !== userId) {
      return NextResponse.json(
        { error: "Forbidden: You do not own this evaluation." },
        { status: 403 }
      );
    }

    // 3. Strictly update ONLY team_id on user's own evaluation record
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("user_pitch_evaluations")
      .update({ team_id: teamId })
      .eq("id", evaluationId)
      .eq("user_id", userId)
      .select("id, ps_title")
      .maybeSingle();

    if (updateErr) {
      console.error("[Evaluator History PATCH Error]:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to attach evaluation to team." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      evaluationId: updated.id,
      teamId,
      teamName: teamData.name,
    });
  } catch (err: any) {
    console.error("[Evaluator History PATCH Exception]:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error attaching evaluation to team." },
      { status: 500 }
    );
  }
}
