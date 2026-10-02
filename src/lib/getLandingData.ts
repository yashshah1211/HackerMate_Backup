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
 * Landing page data: real platform totals and real public event listings
 * only. The product previews on the landing use labelled example data, so
 * no individual builder's profile is sent to anonymous visitors.
 */
export type LandingData = {
  /** Registered builders: every profile the Builders directory lists (all sign-ups, minus banned accounts). */
  builderCount: number;
  /** Publicly listed hackathons, past and upcoming (the /hackathons visibility rule). */
  hackathonCount: number;
  /** Teams created on HackerMate (every team the /teams directory lists). */
  teamCount: number;
  upcoming: UpcomingHackathon[];
};

/**
 * Mirrors the visibility rule of /hackathons (src/app/hackathons/page.tsx): a
 * listing is public when it is cross-listed (type external), has no type, or its
 * effective status is "approved" (status, else ai_feedback.status, else
 * "approved" for anything that isn't a native event). Native events still
 * waiting for admin review are never counted or advertised.
 */
const PUBLICLY_LISTED = [
  "type.eq.external",
  "type.is.null",
  "status.eq.approved",
  "and(status.is.null,ai_feedback->>status.eq.approved)",
  "and(status.is.null,ai_feedback->>status.is.null,type.neq.native)",
].join(",");

/**
 * The upcoming strip prints each event's start date. Unstop imports store the
 * registration-open date in start_date when Unstop gives no event start
 * (src/app/api/admin/scrape-unstop/route.ts), so their dates can't be shown as
 * "starts on". They stay listed and counted; they are only left out of the strip.
 */
const HAS_EVENT_START_DATE = "website_url.is.null,website_url.not.ilike.*unstop.com*";

export async function getLandingData(): Promise<LandingData> {
  const supabaseAdmin = getSupabaseAdmin();
  // Event dates are calendar dates in India, where HackerMate's events run.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  try {
    const [builders, hackathons, teams, upcoming] = await Promise.all([
      // Every account gets a profile row at sign-up; the product counts all of them as builders
      // (dashboard "Builders", the Builders directory, analytics and the daily report). Banned
      // accounts are hidden from other users by RLS, so they are excluded here as well.
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("is_banned", false),
      supabaseAdmin.from("hackathons").select("id", { count: "exact", head: true }).eq("archived", false).or(PUBLICLY_LISTED),
      // The /teams directory lists every team, including ones still recruiting their first teammate.
      supabaseAdmin.from("teams").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("hackathons")
        .select("id, name, mode, start_date, end_date")
        .or(PUBLICLY_LISTED)
        .or(HAS_EVENT_START_DATE)
        .eq("archived", false)
        .gte("start_date", today)
        .order("start_date", { ascending: true })
        .order("name", { ascending: true })
        .limit(8),
    ]);

    if (builders.error) console.error("[landing] builder count failed:", builders.error);
    if (hackathons.error) console.error("[landing] hackathon count failed:", hackathons.error);
    if (teams.error) console.error("[landing] team count failed:", teams.error);
    if (upcoming.error) console.error("[landing] upcoming hackathons failed:", upcoming.error);

    // A failed count comes back as 0, and the hero hides zero values instead of printing them.
    return {
      builderCount: builders.count ?? 0,
      hackathonCount: hackathons.count ?? 0,
      teamCount: teams.count ?? 0,
      upcoming: (upcoming.data as UpcomingHackathon[] | null) ?? [],
    };
  } catch (err) {
    console.error("Error fetching landing data on server:", err);
    return { builderCount: 0, hackathonCount: 0, teamCount: 0, upcoming: [] };
  }
}
