/** Public source evidence. Only the service writer can set this column; never trust ai_feedback. */
export type Provider = "unstop" | "devfolio" | "hack2skill";
export type SourceFacts = {
  name: string; description: string; website_url: string; college: string | null;
  start_date: string | null; end_date: string | null;
  registration_start: string | null; registration_end: string | null;
  registration_status: "open" | "closed" | "not-yet-open" | "unknown";
  min_team_size: number | null; max_team_size: number | null;
  mode: string | null; location: string | null; prize_pool: string | null; currency: string | null;
  eligibility: string | null;
  registration_url?: string | null;
  rounds_info: { round_number: number; name: string; start_date: string | null; end_date: string | null }[];
};
export type SourceMetadata = {
  version: 1; provider: Provider; provider_id: string; canonical_url: string;
  checked_at: string; expires_at: string; check_status: "ok" | "failed" | "checking" | "unresolved";
  category: "hackathon" | "other" | "unknown";
  event_status: "upcoming" | "ongoing" | "ended" | "unknown";
  source_hash: string; parser_version: string; facts: SourceFacts;
  evidence: Record<string, string>; issues: string[];
  last_values?: Record<string, unknown>; protected_fields?: string[]; attempt_id?: string;
};
export const SOURCE_MAX_AGE_MS = 26 * 60 * 60 * 1000;
export const UNSTOP_EVENT_DATE_BASIS = "published_hackathon_build_stage";
export const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export const text = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
export const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export const integer = (v: unknown): number | null => typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= 10000 ? v : null;

/** Unstop competition windows and generic rounds are not an actual hackathon schedule.
 * Older observations remain useful for registration, never for inferred event timing. */
export function hasEventScheduleEvidence(m: SourceMetadata): boolean {
  return m.provider !== "unstop" || object(m.evidence).event_date_basis === UNSTOP_EVENT_DATE_BASIS;
}

export function sourceMetadata(v: unknown): SourceMetadata | null {
  const m = object(v), f = object(m.facts);
  if (m.version !== 1 || !["unstop", "devfolio", "hack2skill"].includes(String(m.provider))
    || !text(m.provider_id) || !text(m.canonical_url) || !["ok", "failed", "checking", "unresolved"].includes(String(m.check_status))
    || !["hackathon", "other", "unknown"].includes(String(m.category)) || !text(f.name) || !text(m.checked_at) || !text(m.expires_at)
    || !["open", "closed", "not-yet-open", "unknown"].includes(String(f.registration_status))) return null;
  if (m.protected_fields !== undefined && (!Array.isArray(m.protected_fields) || !m.protected_fields.every(v => typeof v === "string"))) return null;
  for (const key of ["start_date", "end_date", "registration_start", "registration_end"]) if (f[key] !== null && f[key] !== undefined && typeof f[key] !== "string") return null;
  if (!text(f.website_url) || typeof f.description !== "string" || !Array.isArray(f.rounds_info)
    || !f.rounds_info.every(r => typeof object(r).name === "string")
    || !["upcoming", "ongoing", "ended", "unknown"].includes(String(m.event_status))
    || !/^[0-9a-f]{64}$/.test(String(m.source_hash))) return null;
  for (const key of ["min_team_size", "max_team_size"]) if (f[key] != null && integer(f[key]) === null) return null;
  for (const key of ["description", "website_url", "college", "mode", "location", "prize_pool", "currency", "eligibility", "registration_url"]) {
    if (f[key] != null && typeof f[key] !== "string") return null;
  }
  for (const round of f.rounds_info) for (const key of ["start_date", "end_date"]) if (object(round)[key] != null && typeof object(round)[key] !== "string") return null;
  return m as unknown as SourceMetadata;
}
export function registrationDestination(event: { website_url?: string | null; source_metadata?: unknown }): string | null {
  const value = sourceMetadata(event.source_metadata)?.facts.registration_url || event.website_url;
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function sourceFresh(m: SourceMetadata | null, now: number): m is SourceMetadata {
  if (!m || m.check_status !== "ok" || (m.protected_fields?.length ?? 0) > 0) return false;
  const checked = Date.parse(m.checked_at), expires = Date.parse(m.expires_at);
  return Number.isFinite(checked) && Number.isFinite(expires) && checked <= now + 60000 && checked <= expires
    && now < expires && now - checked < SOURCE_MAX_AGE_MS && expires - checked <= SOURCE_MAX_AGE_MS;
}
/** One effective snapshot for directory and detail. Failed checks keep last-known facts without claiming freshness. */
export function synchronizedEvent<T extends { type?: string | null; source_metadata?: unknown }>(event: T): T {
  const m = sourceMetadata(event.source_metadata);
  if (!m || event.type === "native" || m.protected_fields?.length) return event;
  const facts: Record<string, unknown> = {};
  for (const key of ["name", "description", "website_url", "college", "start_date", "end_date", "registration_start", "registration_end",
    "registration_status", "min_team_size", "max_team_size", "mode", "location", "prize_pool", "currency", "rounds_info"]) {
    facts[key] = object(m.facts)[key];
  }
  if (!hasEventScheduleEvidence(m)) { facts.start_date = null; facts.end_date = null; }
  // Never overlay identity, approval, ownership, archival or community fields from JSON.
  return { ...event, ...facts };
}
