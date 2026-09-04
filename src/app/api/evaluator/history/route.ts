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
