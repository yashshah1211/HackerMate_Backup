import { createClient } from "@supabase/supabase-js";

// Service role client for server-side SSR data fetching (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type RealProfile = {
  id: string;
  full_name: string | null;
  college: string | null;
  bio: string | null;
  skills: string[] | null;
  avatar_url: string | null;
  github_url?: string | null;
};

export type RealHackathon = {
  id: string;
  name: string;
  mode: string | null;
  location: string | null;
  prize_pool: string | null;
  currency?: string | null;
  tags: string[] | null;
  type: string | null;
  website_url: string | null;
  start_date: string | null;
};

export type RealTeam = {
  id: string;
  name: string;
  description: string | null;
  max_members: number | null;
  hackathon_name?: string | null;
};

export type LandingData = {
  userCount: number;
  hackathonCount: number;
  teamCount: number;
  builders: RealProfile[];
  hackathons: RealHackathon[];
  teams: RealTeam[];
};

export async function getLandingData(): Promise<LandingData> {
  try {
    const [{ count: userCount }, { count: hackathonCount }, { count: teamCount }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("hackathons").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("teams").select("id", { count: "exact", head: true }),
      ]);

    const { data: builders } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, college, bio, skills, avatar_url, github_url")
      .not("full_name", "is", null)
      .eq("onboarding_completed", true)
      .order("created_at", { ascending: false })
      .limit(8);

    const { data: hackathons } = await supabaseAdmin
      .from("hackathons")
      .select("id, name, mode, location, prize_pool, tags, type, website_url, start_date")
      .order("start_date", { ascending: false })
      .limit(6);

    const { data: rawTeams } = await supabaseAdmin
      .from("teams")
      .select("id, name, description, max_members, team_hackathons(hackathons(name))")
      .order("created_at", { ascending: false })
      .limit(6);

    const teams: RealTeam[] = (rawTeams || []).map((t: any) => {
      let hackathonName: string | null = null;
      if (Array.isArray(t.team_hackathons) && t.team_hackathons.length > 0) {
        const h = t.team_hackathons[0]?.hackathons;
        hackathonName = Array.isArray(h) ? h[0]?.name : h?.name;
      }
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        max_members: t.max_members,
        hackathon_name: hackathonName,
      };
    });

    return {
      userCount: userCount ?? 0,
      hackathonCount: hackathonCount ?? 0,
      teamCount: teamCount ?? 0,
      builders: (builders as RealProfile[]) ?? [],
      hackathons: (hackathons as RealHackathon[]) ?? [],
      teams: teams ?? [],
    };
  } catch (err) {
    console.error("Error fetching landing data on server:", err);
    return {
      userCount: 0,
      hackathonCount: 0,
      teamCount: 0,
      builders: [],
      hackathons: [],
      teams: [],
    };
  }
}
