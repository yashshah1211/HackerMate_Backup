import "server-only";
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CRAFTNCODE_SERIES, normalizeQualifierEvent, qualifierForState,
  type EventSeries, type Qualifier, type QualifierEvent } from "./eventSeries";

export const SERIES_EVENT_COLUMNS = "id,name,website_url,mode,location,status,archived";
export type SeriesResult = { kind: "unavailable" } | { kind: "ready"; events: QualifierEvent[] };
export type QualifierResult = { kind: "missing" } | { kind: "unavailable" }
  | { kind: "ready"; qualifier: Qualifier; event: QualifierEvent };

/** Bounded to reviewed IDs. No partner configuration, identity or participation reads. */
export async function resolvePublicSeries(client: SupabaseClient, series: EventSeries): Promise<SeriesResult> {
  try {
    const ids = series.qualifiers.map(qualifier => qualifier.eventId);
    const { data, error } = await client.from("hackathons").select(SERIES_EVENT_COLUMNS)
      .in("id", ids).eq("status", "approved").eq("archived", false).limit(ids.length);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Invalid public series response");
    const events = series.qualifiers.flatMap(qualifier => {
      const rows = data.filter(row => row.id === qualifier.eventId);
      if (rows.length > 1) throw new Error("Duplicate public qualifier");
      const event = normalizeQualifierEvent(rows[0], qualifier);
      return event ? [event] : [];
    });
    return { kind: "ready", events };
  } catch (error) {
    console.error("[partners/event-series] public listing failed:", error);
    return { kind: "unavailable" };
  }
}

export async function resolvePublicQualifier(client: SupabaseClient, series: EventSeries, state: string): Promise<QualifierResult> {
  const qualifier = qualifierForState(series, state);
  if (!qualifier) return { kind: "missing" };
  try {
    const { data, error } = await client.from("hackathons").select(SERIES_EVENT_COLUMNS)
      .eq("id", qualifier.eventId).eq("status", "approved").eq("archived", false).maybeSingle();
    if (error) throw error;
    const event = normalizeQualifierEvent(data, qualifier);
    return event ? { kind: "ready", qualifier, event } : { kind: "missing" };
  } catch (error) {
    console.error("[partners/event-series] public qualifier failed:", error);
    return { kind: "unavailable" };
  }
}

/** Anonymous server client only. Never forward the visitor's session or use a service key. */
function publicClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("[partners/event-series] public database configuration unavailable");
    return null;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

// Request-local memoization shares metadata/page work; no stale approval cross-request cache.
export const loadCraftSeries = cache(async (): Promise<SeriesResult> => {
  try {
    const client = publicClient();
    return client ? resolvePublicSeries(client, CRAFTNCODE_SERIES) : { kind: "unavailable" };
  } catch (error) {
    console.error("[partners/event-series] client unavailable:", error);
    return { kind: "unavailable" };
  }
});

export const loadCraftQualifier = cache(async (state: string): Promise<QualifierResult> => {
  if (!qualifierForState(CRAFTNCODE_SERIES, state)) return { kind: "missing" };
  try {
    const client = publicClient();
    return client ? resolvePublicQualifier(client, CRAFTNCODE_SERIES, state) : { kind: "unavailable" };
  } catch (error) {
    console.error("[partners/event-series] client unavailable:", error);
    return { kind: "unavailable" };
  }
});
