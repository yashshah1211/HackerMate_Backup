import { loadPublicEvents } from "./hackathons/publicBrowsing";
import { createClient } from "@supabase/supabase-js";
import { activeOpportunity, eventDate, type RegistrationDates } from "./hackathons/lifecycle";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rhryjrbebfrrfhtyyzbs.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-key";
  return createClient(url, key);
}

/** A public, upcoming hackathon listed on HackerMate. */
export type UpcomingHackathon = RegistrationDates & {
  id: string;
  name: string;
  mode: string | null;
  start_date: string | null;
  end_date: string | null;
};

/**
 * Landing page data: real platform totals and real public event listings
 * only. The product previews on the landing use labelled example data, so
 * no individual builder's profile is sent to anonymous visitors.
 */
export type LandingData = {
  /** Registered builders: every profile the Builders directory lists (all sign-ups, minus banned accounts). */
  builderCount: number;
  /** Teams created on HackerMate (every team the /teams directory lists). */
  teamCount: number;
  /** Approved, non-archived public hackathon listings, including events with unverified availability. */
  hackathonCount: number;
  upcoming: UpcomingHackathon[];
};

export async function getLandingData(): Promise<LandingData> {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const [builders, teams, upcoming] = await Promise.all([
      // Every account gets a profile row at sign-up; the product counts all of them as builders
      // (dashboard "Builders", the Builders directory, analytics and the daily report). Banned
      // accounts are hidden from other users by RLS, so they are excluded here as well.
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("is_banned", false),
      // The /teams directory lists every team, including ones still recruiting their first teammate.
      supabaseAdmin.from("teams").select("id", { count: "exact", head: true }),
      loadPublicEvents(supabaseAdmin).catch(error => { console.error("[landing] public source listing unavailable:", error); return []; }),
    ]);

    if (builders.error) console.error("[landing] builder count failed:", builders.error);
    if (teams.error) console.error("[landing] team count failed:", teams.error);

    // A failed count comes back as 0, and the hero hides zero values instead of printing them.
    return {
      builderCount: builders.count ?? 0,
      teamCount: teams.count ?? 0,
      // Reuse the complete approved public catalog before filtering to active opportunities.
      // A failed catalog load returns [] and the hero omits zero rather than inventing a total.
      hackathonCount: upcoming.length,
      upcoming: upcoming.filter(event => activeOpportunity(event, Date.now())).sort((a,b) => (eventDate(a.start_date) ?? Infinity) - (eventDate(b.start_date) ?? Infinity) || a.name.localeCompare(b.name)).slice(0, 8).map(event => ({
        id: event.id, name: event.name, mode: event.mode, type: event.type,
        start_date: event.start_date, end_date: event.end_date,
        registration_start: event.registration_start, registration_end: event.registration_end,
        registration_status: event.registration_status, source_metadata: event.source_metadata,
      })),
    };
  } catch (err) {
    console.error("Error fetching landing data on server:", err);
    return { builderCount: 0, teamCount: 0, hackathonCount: 0, upcoming: [] };
  }
}
