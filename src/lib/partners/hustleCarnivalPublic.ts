import "server-only";
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HUSTLE_CARNIVAL, hustleCommunityState, type HustleCommunityState } from "./hustleCarnival";

export const HUSTLE_EVENT_COLUMNS = "id,status,archived,type,start_date,end_date,mode,location,min_team_size,max_team_size,website_url";

/** Exact public event only. No partner config, identity, registration or private profile reads. */
export async function resolveHustleCommunity(client: SupabaseClient): Promise<HustleCommunityState> {
  try {
    const { data, error } = await client.from("hackathons").select(HUSTLE_EVENT_COLUMNS)
      .eq("id", HUSTLE_CARNIVAL.eventId).eq("status", "approved").eq("archived", false).maybeSingle();
    return error ? "unavailable" : hustleCommunityState(data);
  } catch {
    return "unavailable";
  }
}

export const loadHustleCommunity = cache(async (): Promise<HustleCommunityState> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return "unavailable";
  try {
    return await resolveHustleCommunity(createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(4000) }) },
    }));
  } catch {
    return "unavailable";
  }
});
