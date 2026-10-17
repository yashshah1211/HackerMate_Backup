import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoveryEvent } from "./discovery";

// Application read contract only. The database's broader anonymous grants/RLS are unchanged.
export const PUBLIC_EVENT_COLUMNS = "id,name,description,tags,start_date,end_date,registration_end,created_at,location,mode,prize_pool,currency,website_url,type,college,min_team_size,max_team_size,max_participants,rounds_count,rounds_info,status,archived";
export type PublicEvent = Omit<DiscoveryEvent, "organizer_id"> & {
  max_participants?: number | null;
  rounds_count?: number | null;
  rounds_info?: { round_number: number; name: string; type?: string; start_date?: string | null; end_date?: string | null; description?: string | null }[] | null;
  status: string; archived: boolean;
};

export function isPublicEvent(event: { status?: unknown; archived?: unknown }): boolean {
  return event.status === "approved" && event.archived === false;
}

const PUBLIC_EVENT_BATCH_SIZE = 250;
// Includes the final empty request. Exceeding this bound is a failure, never a partial success.
const PUBLIC_EVENT_REQUEST_LIMIT = 200;

/** Complete keyset traversal, not a transactional snapshot of concurrent event edits. */
export async function loadPublicEvents(client: SupabaseClient, signal?: AbortSignal): Promise<PublicEvent[]> {
  const events: PublicEvent[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < PUBLIC_EVENT_REQUEST_LIMIT; page++) {
    signal?.throwIfAborted();
    let query = client.from("hackathons").select(PUBLIC_EVENT_COLUMNS)
      .eq("status", "approved").eq("archived", false)
      .order("id", { ascending: true }).limit(PUBLIC_EVENT_BATCH_SIZE);
    if (cursor !== null) query = query.gt("id", cursor);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    signal?.throwIfAborted();
    if (error) { console.error("Public event listing failed:", error); throw new Error("Events are unavailable. Please retry."); }
    if (!Array.isArray(data) || data.length > PUBLIC_EVENT_BATCH_SIZE) {
      console.error("Public event listing returned an invalid page.");
      throw new Error("The complete event listing could not be loaded. Please retry.");
    }
    if (data.length === 0) return events;
    // Validate every row, including excluded rows, so an invalid cursor cannot skip or repeat pages.
    for (const row of data) {
      if (!row || typeof row.id !== "string" || !row.id || (cursor !== null && row.id <= cursor)) {
        console.error("Public event listing returned a duplicate or non-advancing ID.");
        throw new Error("Event pagination did not advance. Please retry.");
      }
      cursor = row.id;
      if (isPublicEvent(row)) events.push(row as PublicEvent);
    }
  }
  console.error("Public event listing exceeded its request safety limit.");
  throw new Error("Event listing exceeded its request safety limit. Please retry.");
}

export async function loadPublicEvent(client: SupabaseClient, id: string): Promise<PublicEvent | null> {
  const { data, error } = await client.from("hackathons").select(PUBLIC_EVENT_COLUMNS)
    .eq("id", id).eq("status", "approved").eq("archived", false).maybeSingle();
  if (error) { console.error("Public event detail failed:", error); throw new Error("Event details are unavailable. Please retry."); }
  return data && isPublicEvent(data) ? data as PublicEvent : null;
}

export type BrowsingAccess = { kind: "guest" } | { kind: "member"; userId: string; onboarded: boolean }
  | { kind: "suspended" } | { kind: "unavailable" };

/** An empty verified session is a guest; an invalid/unverifiable existing session is not. */
export async function verifyBrowsingAccess(client: SupabaseClient): Promise<BrowsingAccess> {
  try {
    const stored = await client.auth.getSession();
    if (stored.error) throw stored.error;
    const { data: { user }, error } = await client.auth.getUser();
    if (error && !(error.name === "AuthSessionMissingError" && !stored.data.session)) throw error;
    if (!user) {
      if (stored.data.session) throw new Error("Existing session could not be verified");
      return { kind: "guest" };
    }
    const { data: profile, error: profileError } = await client.from("profiles")
      .select("id,is_banned,onboarding_completed").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.id !== user.id || typeof profile.is_banned !== "boolean") throw new Error("Account status unavailable");
    if (profile.is_banned) return { kind: "suspended" };
    return { kind: "member", userId: user.id, onboarded: profile.onboarding_completed === true };
  } catch (error) {
    console.error("Hackathon account verification failed:", error);
    return { kind: "unavailable" };
  }
}

/** Only generated local routes may be transported through login/onboarding. No action is encoded. */
export function safeBrowsingDestination(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/hackathons";
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith("//")) return "/hackathons";
    const url = new URL(value, "https://hackermate.invalid");
    if (url.origin !== "https://hackermate.invalid" || !/^\/hackathons(?:\/[^/]+)?$/.test(url.pathname)) return "/hackathons";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/hackathons"; }
}

export function browsingActionHref(destination: string, onboard = false): string {
  return `${onboard ? "/onboarding" : "/login"}?next=${encodeURIComponent(safeBrowsingDestination(destination))}`;
}
