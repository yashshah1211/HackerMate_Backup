import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rhryjrbebfrrfhtyyzbs.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-key";
  return createClient(url, key);
}

/** A public, upcoming hackathon listed on HackerMate. */
export type UpcomingHackathon = {
  id: string;
  name: string;
  mode: string | null;
  start_date: string | null;
  end_date: string | null;
};

/**
 * Landing page data. Only aggregate counts and public event listings: the
 * V2 landing uses example data in its product previews, so no individual
 * builder's profile is sent to anonymous visitors.
 */
export type LandingData = {
  userCount: number;
  hackathonCount: number;
  teamCount: number;
  upcoming: UpcomingHackathon[];
};

/**
 * Events visitors can actually see on /hackathons: approved listings and
 * cross-listed external events. Native events waiting for admin review
 * (status "pending") or rejected ones must not be counted or advertised.
 */
const PUBLICLY_LISTED = "status.eq.approved,type.eq.external";

export async function getLandingData(): Promise<LandingData> {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const [users, hackathons, teams, upcoming] = await Promise.all([
      // Only builders who finished onboarding (a real profile), not every sign-in.
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("onboarding_completed", true),
      supabaseAdmin.from("hackathons").select("id", { count: "exact", head: true }).or(PUBLICLY_LISTED),
      supabaseAdmin.from("teams").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("hackathons")
        .select("id, name, mode, start_date, end_date")
        .or(PUBLICLY_LISTED)
        .gte("start_date", new Date().toISOString())
        .order("start_date", { ascending: true })
        .limit(8),
    ]);

    if (users.error) console.error("[landing] profile count failed:", users.error);
    if (hackathons.error) console.error("[landing] hackathon count failed:", hackathons.error);
    if (teams.error) console.error("[landing] team count failed:", teams.error);
    if (upcoming.error) console.error("[landing] upcoming hackathons failed:", upcoming.error);

    return {
      userCount: users.count ?? 0,
      hackathonCount: hackathons.count ?? 0,
      teamCount: teams.count ?? 0,
      upcoming: (upcoming.data as UpcomingHackathon[] | null) ?? [],
    };
  } catch (err) {
    console.error("Error fetching landing data on server:", err);
    return { userCount: 0, hackathonCount: 0, teamCount: 0, upcoming: [] };
  }
}
