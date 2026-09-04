import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    const decodedSlug = decodeURIComponent(slug);
    const cleanSlug = decodedSlug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    let challenge: any = null;

    // 1. Clean slug match
    const { data: byClean } = await supabase
      .from("weekly_challenges")
      .select("id")
      .eq("slug", cleanSlug)
      .maybeSingle();
    challenge = byClean;

    // 2. Decoded slug match
    if (!challenge) {
      const { data: byDecoded } = await supabase
        .from("weekly_challenges")
        .select("id")
        .eq("slug", decodedSlug)
        .maybeSingle();
      challenge = byDecoded;
    }

    // 3. UUID match
    if (!challenge && /^[0-9a-f-]{36}$/i.test(decodedSlug)) {
      const { data: byId } = await supabase
        .from("weekly_challenges")
        .select("id")
        .eq("id", decodedSlug)
        .maybeSingle();
      challenge = byId;
    }

    // 4. Memory fallback
    if (!challenge) {
      const { data: allChallenges } = await supabase
        .from("weekly_challenges")
        .select("id, title, slug")
        .order("created_at", { ascending: false });

      if (allChallenges && allChallenges.length > 0) {
        challenge = allChallenges.find((c) => {
          const cSlug = (c.slug || "").toLowerCase();
          const cTitle = (c.title || "").toLowerCase();
          const searchKey = cleanSlug.replace(/-/g, " ");
          return (
            cSlug === cleanSlug ||
            cSlug === decodedSlug.toLowerCase() ||
            cSlug.includes(cleanSlug) ||
            cleanSlug.includes(cSlug) ||
            cTitle.includes(searchKey) ||
            searchKey.includes(cTitle)
          );
        }) || allChallenges[0];
      }
    }

    if (!challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    // Get user's teams
    const { data: memberTeams } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", userId);

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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ submissions: submissions || [] });
  } catch (err: any) {
    console.error("[Challenge Submissions List] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
