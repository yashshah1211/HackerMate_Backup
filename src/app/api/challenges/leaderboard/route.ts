import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase credentials.");
  }
  return createClient(url, serviceKey);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(req.url);
    const challengeSlug = searchParams.get("slug");
    const mode = searchParams.get("mode"); // 'all' | 'solo' | 'team'

    let challengeId: string | null = null;
    if (challengeSlug) {
      const { data: ch } = await supabase
        .from("weekly_challenges")
        .select("id")
        .eq("slug", challengeSlug)
        .maybeSingle();
      if (ch) challengeId = ch.id;
    }

    // Query top submissions
    let query = supabase
      .from("challenge_submissions")
      .select(`
        id,
        challenge_id,
        user_id,
        team_id,
        submission_mode,
        total_score,
        grade,
        score_problem,
        score_solution,
        score_architecture,
        score_feasibility_impact,
        version,
        created_at,
        weekly_challenges(title, challenge_number, slug),
        profiles(id, full_name, avatar_url, username),
        teams(id, name)
      `)
      .eq("status", "completed")
      .gt("total_score", 0)
      .order("total_score", { ascending: false })
      .order("score_architecture", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(20);

    if (challengeId) {
      query = query.eq("challenge_id", challengeId);
    }
    if (mode && mode !== "all") {
      query = query.eq("submission_mode", mode);
    }

    const { data: rawSubmissions, error } = await query;

    if (error) {
      console.error("[Leaderboard API] Query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Deduplicate: Keep highest score per user / team
    const seenMap = new Set<string>();
    const leaderboard: any[] = [];

    (rawSubmissions || []).forEach((sub: any) => {
      const uniqueKey = sub.submission_mode === "team" && sub.team_id
        ? `team_${sub.team_id}`
        : `user_${sub.user_id}`;

      if (!seenMap.has(uniqueKey)) {
        seenMap.add(uniqueKey);
        leaderboard.push({
          id: sub.id,
          rank: leaderboard.length + 1,
          participantName: sub.submission_mode === "team" && sub.teams?.name
            ? sub.teams.name
            : sub.profiles?.full_name || sub.profiles?.username || "Anonymous Builder",
          avatarUrl: sub.profiles?.avatar_url || null,
          submissionMode: sub.submission_mode,
          challengeNumber: sub.weekly_challenges?.challenge_number || 1,
          challengeTitle: sub.weekly_challenges?.title || "Weekly Challenge",
          challengeSlug: sub.weekly_challenges?.slug || "",
          totalScore: sub.total_score || 0,
          grade: sub.grade || "Mastery 🏆",
          scores: {
            problem: sub.score_problem || 0,
            solution: sub.score_solution || 0,
            architecture: sub.score_architecture || 0,
            feasibility: sub.score_feasibility_impact || 0,
          },
          createdAt: sub.created_at,
        });
      }
    });

    return NextResponse.json({
      success: true,
      leaderboard: leaderboard.slice(0, 10),
    });
  } catch (err: any) {
    console.error("[Leaderboard API] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
