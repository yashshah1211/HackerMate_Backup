import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseUser.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify Admin Role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const hackathonId = searchParams.get("hackathonId");

    if (!hackathonId) {
      return NextResponse.json({ error: "hackathonId query param is required." }, { status: 400 });
    }

    // 1. Fetch Hackathon & Partner details
    const { data: hackathon } = await supabaseAdmin
      .from("hackathons")
      .select("id, name, type, mode, prize_pool")
      .eq("id", hackathonId)
      .single();

    const { data: partnerConfig } = await supabaseAdmin
      .from("partner_configs")
      .select("*")
      .eq("hackathon_id", hackathonId)
      .maybeSingle();

    // 2. Fetch Registrations joined with Profiles
    const { data: registrations } = await supabaseAdmin
      .from("hackathon_registrations")
      .select(`
        id,
        user_id,
        team_id,
        looking_for_team,
        status,
        created_at,
        profiles (
          id,
          full_name,
          email,
          college,
          avatar_url,
          skills
        ),
        teams (
          id,
          name
        )
      `)
      .eq("hackathon_id", hackathonId)
      .order("created_at", { ascending: false });

    // 3. Fetch Teams linked via team_hackathons
    const { data: teamHackathons } = await supabaseAdmin
      .from("team_hackathons")
      .select(`
        team_id,
        created_at,
        teams (
          id,
          name,
          description,
          owner_id,
          max_members,
          college,
          skills,
          roles_needed,
          team_members (
            id,
            user_id,
            profiles (
              id,
              full_name,
              email,
              college,
              skills
            )
          )
        )
      `)
      .eq("hackathon_id", hackathonId);

    // 4. Fetch Broadcast Announcements
    const { data: announcements } = await supabaseAdmin
      .from("hackathon_announcements")
      .select("*")
      .eq("hackathon_id", hackathonId)
      .order("created_at", { ascending: false });

    // Aggregations: Skill distribution
    const skillCounts: Record<string, number> = {};
    const collegeCounts: Record<string, number> = {};
    let lookingForTeamCount = 0;

    (registrations || []).forEach((reg: any) => {
      if (reg.looking_for_team) lookingForTeamCount++;
      const p = reg.profiles;
      if (p) {
        if (p.college?.trim()) {
          const col = p.college.trim();
          collegeCounts[col] = (collegeCounts[col] || 0) + 1;
        }
        if (Array.isArray(p.skills)) {
          p.skills.forEach((s: string) => {
            const skill = s.trim();
            if (skill) skillCounts[skill] = (skillCounts[skill] || 0) + 1;
          });
        }
      }
    });

    const topSkills = Object.entries(skillCounts)
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topColleges = Object.entries(collegeCounts)
      .map(([college, count]) => ({ college, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const teamsList = (teamHackathons || [])
      .map((th: any) => th.teams)
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      hackathon,
      partnerConfig,
      stats: {
        totalRegistrations: registrations?.length || 0,
        lookingForTeamCount,
        totalTeams: teamsList.length,
      },
      topSkills,
      topColleges,
      registrations: registrations || [],
      teams: teamsList,
      announcements: announcements || [],
    });
  } catch (err: any) {
    console.error("[Partner Composition API Error]:", err);
    return NextResponse.json({ error: err.message || "Failed to load composition data." }, { status: 500 });
  }
}
