import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { challengeIdentity } from "@/lib/challenges/challengeEvaluationContract";

function getSupabaseClient(token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey);
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (token) {
    return createClient(url, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
  }
  return createClient(url, anonKey);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const authHeader = req.headers.get("Authorization");
    let token: string | undefined;
    let userId: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
    }

    const supabase = getSupabaseClient(token);

    if (token) {
      const { data: userData } = await supabase.auth.getUser(token);
      userId = userData?.user?.id || null;
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let identity: ReturnType<typeof challengeIdentity>;
    try { identity = challengeIdentity(slug); }
    catch { return NextResponse.json({ error: "Invalid challenge reference" }, { status: 400 }); }
    const readChallenge = async (column: "slug" | "id", value: string) => {
      const { data, error } = await supabase.from("weekly_challenges").select("id").eq(column, value).maybeSingle();
      if (error) throw error;
      return data;
    };
    let challenge = await readChallenge("slug", identity.slug);
    if (!challenge && identity.normalized && identity.normalized !== identity.slug) challenge = await readChallenge("slug", identity.normalized);
    if (!challenge && identity.id) challenge = await readChallenge("id", identity.id);
    if (!challenge) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

    // Get user's teams
    const { data: memberTeams, error: memberError } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", userId);

    if (memberError) throw memberError;
    const teamIds = (memberTeams || []).map((m) => m.team_id).filter(Boolean);

    // Fetch user submissions and team submissions
    let query = supabase
      .from("challenge_submissions")
      .select("id, challenge_id, user_id, team_id, submission_mode, submission_type, file_name, version, status, score_problem, score_solution, score_architecture, score_feasibility_impact, total_score, grade, strengths, growth_areas, slide_feedback, format_violations, score_deductions, ai_raw_feedback, used_ai_fallback, created_at, updated_at")
      .eq("challenge_id", challenge.id);

    if (teamIds.length > 0) {
      query = query.or(`user_id.eq.${userId},team_id.in.(${teamIds.join(",")})`);
    } else {
      query = query.eq("user_id", userId);
    }

    const { data: submissions, error } = await query.order("version", { ascending: false });

    if (error) {
      console.error("[Challenge Submissions List] DB error:", error);
      return NextResponse.json({ error: "Challenge data is temporarily unavailable. Please retry." }, { status: 503 });
    }

    return NextResponse.json({ submissions: submissions || [] });
  } catch (err: unknown) {
    console.error("[Challenge Submissions List] Exception:", err);
    return NextResponse.json({ error: "Challenge data is temporarily unavailable. Please retry." }, { status: 503 });
  }
}
