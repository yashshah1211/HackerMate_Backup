import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS, only used server-side
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hackathonId = searchParams.get("hackathon_id");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(50, parseInt(searchParams.get("limit") || "6", 10)));
    const searchQuery = searchParams.get("search")?.trim().toLowerCase() || "";

    // If hackathon_id is provided, return paginated showcase projects for that specific hackathon
    if (hackathonId) {
      // 1. Fetch Hackathon details
      const { data: hackathon, error: hackathonErr } = await supabaseAdmin
        .from("hackathons")
        .select("id, name, description, start_date, end_date, location, mode, prize_pool, tags, type, website_url")
        .eq("id", hackathonId)
        .single();

      if (hackathonErr || !hackathon) {
        return NextResponse.json({ error: "Hackathon not found" }, { status: 404 });
      }

      // 2. Fetch team IDs registered for this hackathon
      const { data: teamRelations } = await supabaseAdmin
        .from("team_hackathons")
        .select("team_id")
        .eq("hackathon_id", hackathonId);

      const { data: directTeams } = await supabaseAdmin
        .from("teams")
        .select("id")
        .eq("hackathon_id", hackathonId);

      const teamIds = Array.from(
        new Set([
          ...(teamRelations || []).map((t) => t.team_id),
          ...(directTeams || []).map((t) => t.id),
        ])
      );

      if (teamIds.length === 0) {
        return NextResponse.json({
          hackathon,
          projects: [],
          pagination: { total: 0, page, limit, totalPages: 0 },
        });
      }

      // 3. Query completed submissions for these teams
      let query = supabaseAdmin
        .from("team_submissions")
        .select(
          `
          team_id,
          project_title,
          demo_url,
          github_url,
          pitch_video_url,
          slides_url,
          checklist,
          completion_status,
          screenshot_url,
          updated_at,
          teams:team_id (
            id,
            name,
            description,
            college,
            skills,
            max_members,
            team_members (
              id,
              user_id,
              profiles:user_id (
                id,
                full_name,
                avatar_url,
                college
              )
            )
          )
        `,
          { count: "exact" }
        )
        .in("team_id", teamIds)
        .in("completion_status", ["submitted", "completed"]);

      if (searchQuery) {
        query = query.or(`project_title.ilike.%${searchQuery}%,demo_url.ilike.%${searchQuery}%,github_url.ilike.%${searchQuery}%`);
      }

      const offset = (page - 1) * limit;
      const { data: submissions, count, error: subErr } = await query
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (subErr) {
        console.error("[Public Showcase API] Query Error:", subErr);
        return NextResponse.json({ error: subErr.message }, { status: 500 });
      }

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      return NextResponse.json({
        hackathon,
        projects: submissions || [],
        pagination: {
          total,
          page,
          limit,
          totalPages,
        },
      });
    }

    // Default: Landing page summary statistics & featured showcase items
    const [{ count: userCount }, { count: hackathonCount }, { count: teamCount }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("hackathons").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("teams").select("id", { count: "exact", head: true }),
      ]);

    const { data: builders } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, college, bio, skills, avatar_url")
      .not("full_name", "is", null)
      .eq("onboarding_completed", true)
      .order("created_at", { ascending: false })
      .limit(6);

    const { data: hackathons } = await supabaseAdmin
      .from("hackathons")
      .select("id, name, mode, location, prize_pool, tags, type, website_url, start_date")
      .order("start_date", { ascending: false })
      .limit(4);

    const { data: teams } = await supabaseAdmin
      .from("teams")
      .select("id, name, description, max_members, team_hackathons(hackathons(name))")
      .order("created_at", { ascending: false })
      .limit(4);

    return NextResponse.json({
      userCount: userCount ?? 0,
      hackathonCount: hackathonCount ?? 0,
      teamCount: teamCount ?? 0,
      builders: builders ?? [],
      hackathons: hackathons ?? [],
      teams: teams ?? [],
    });
  } catch (err) {
    console.error("Public showcase API error:", err);
    return NextResponse.json({ error: "Failed to load showcase data" }, { status: 500 });
  }
}
