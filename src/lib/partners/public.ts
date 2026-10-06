import "server-only";
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizePartnerConfig, normalizePublicEvent, record,
  type PublicEvent, type PublicPartnerConfig } from "./config";

export type PublicPartnerResult =
  | { kind: "missing" }
  | { kind: "unavailable" }
  | { kind: "legacy"; config: PublicPartnerConfig }
  | { kind: "organizer-v1"; config: PublicPartnerConfig; event: PublicEvent | null };

const PARTNER_COLUMNS = "slug, hackathon_id, partner_name, tagline, logo_url, banner_url, brand_color, accent_color, features";
const EVENT_COLUMNS = "id, name, description, start_date, end_date, location, mode, min_team_size, max_team_size, website_url, type, archived, status, approval_status:ai_feedback->>status";

/** Always public/anonymous; no cookies, service role, auth lookup or registration reads. */
export async function resolvePublicPartner(client: SupabaseClient, slug: string): Promise<PublicPartnerResult> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return { kind: "missing" };
  try {
    const { data, error } = await client.from("partner_configs").select(PARTNER_COLUMNS).eq("slug", slug).maybeSingle();
    if (error) {
      console.error("[partners/public] partner lookup failed:", error);
      return { kind: "unavailable" };
    }
    if (!data) return { kind: "missing" };
    const config = normalizePartnerConfig(data);
    if (config.portalVersion === "legacy") return { kind: "legacy", config };
    const eventId = record(data).hackathon_id;
    if (typeof eventId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(eventId)) {
      return { kind: "organizer-v1", config, event: null };
    }
    const eventResult = await client.from("hackathons").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle();
    if (eventResult.error) {
      console.error("[partners/public] event lookup failed:", eventResult.error);
      return { kind: "unavailable" };
    }
    return { kind: "organizer-v1", config, event: eventResult.data ? normalizePublicEvent(eventResult.data, config) : null };
  } catch (error) {
    console.error("[partners/public] lookup failed:", error);
    return { kind: "unavailable" };
  }
}

// Share the request's public resolution between metadata and the page; no cross-request cache.
export const loadPublicPartner = cache(async (slug: string): Promise<PublicPartnerResult> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("[partners/public] public database configuration unavailable");
    return { kind: "unavailable" };
  }
  return resolvePublicPartner(createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }), slug);
});
