import { object, text, integer, eventDate, validatedSourceIdentity, retainBuildInventory, reconciledBuildWindow, windowState, type SourceIdentity } from "./sourceEvidence";
export { object, text, array, integer } from "./sourceEvidence";
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
  evidence: Record<string, unknown>; issues: string[];
  last_values?: Record<string, unknown>; protected_fields?: string[]; attempt_id?: string;
  evidence_only?: boolean;
};
export const REGISTRATION_FIELDS = ["registration_start", "registration_end", "registration_status"];
export const EVENT_FIELDS = ["start_date", "end_date"];
export const SOURCE_MAX_AGE_MS = 26 * 60 * 60 * 1000;
export const UNSTOP_EVENT_DATE_BASIS = "reconciled_hackathon_build_stages_v3";
export const sourceProvider = (v: unknown): Provider | null => v === "unstop" || v === "devfolio" || v === "hack2skill" ? v : null;

/** Structural decoding is private: only validateSourceObservation grants usable authority. */
function decodeMetadata(v: unknown): SourceMetadata | null {
  const m = object(v), f = object(m.facts);
  if (m.version !== 1 || !validatedSourceIdentity(m)
    || !["ok", "failed", "checking", "unresolved"].some(v => v === m.check_status)
    || !["hackathon", "other", "unknown"].some(v => v === m.category) || !text(f.name) || !text(m.checked_at) || !text(m.expires_at)
    || !["open", "closed", "not-yet-open", "unknown"].some(v => v === f.registration_status)) return null;
  if (m.protected_fields !== undefined && (!Array.isArray(m.protected_fields) || !m.protected_fields.every(v => typeof v === "string"))) return null;
  if (m.evidence_only !== undefined && typeof m.evidence_only !== "boolean") return null;
  for (const key of ["start_date", "end_date", "registration_start", "registration_end"]) if (f[key] !== null && f[key] !== undefined && typeof f[key] !== "string") return null;
  if (!text(f.website_url) || typeof f.description !== "string" || !Array.isArray(f.rounds_info)
    || !f.rounds_info.every(r => typeof object(r).name === "string")
    || !["upcoming", "ongoing", "ended", "unknown"].some(v => v === m.event_status)
    || typeof m.source_hash !== "string" || !/^[0-9a-f]{64}$/.test(m.source_hash)) return null;
  for (const key of ["min_team_size", "max_team_size"]) if (f[key] != null && integer(f[key]) === null) return null;
  for (const key of ["description", "website_url", "college", "mode", "location", "prize_pool", "currency", "eligibility", "registration_url"]) {
    if (f[key] != null && typeof f[key] !== "string") return null;
  }
  for (const round of f.rounds_info) for (const key of ["start_date", "end_date"]) if (object(round)[key] != null && typeof object(round)[key] !== "string") return null;
  if (!text(m.parser_version) || !m.evidence || typeof m.evidence !== "object" || Array.isArray(m.evidence)
    || !Array.isArray(m.issues) || !m.issues.every(v => typeof v === "string")) return null;
  return m as unknown as SourceMetadata;
}
export type ValidatedSource = {
  identity: SourceIdentity | null;
  metadata: SourceMetadata | null;
  schedule: { start: string; end: string } | null;
  errors: string[];
};

/** The same boundary is used for fresh parser output, cached metadata and report rows.
 * This validates consistency, not authenticity of a coherent privileged forgery. */
export function validateSourceObservation(value: unknown, expected?: unknown): ValidatedSource {
  const m = decodeMetadata(value), errors: string[] = [];
  const candidate = validatedSourceIdentity(value, expected);
  const identity = candidate && validatedSourceIdentity(value, object(object(value).facts).website_url) ? candidate : null;
  if (!m) return { identity, metadata: null, schedule: null, errors: ["invalid_observation_shape_or_identity"] };
  const f = m.facts;
  if (!identity) errors.push("source_identity_conflict");
  const checked = eventDate(m.checked_at), expires = eventDate(m.expires_at);
  if (checked === null || expires === null || m.checked_at.length === 10 || m.expires_at.length === 10
    || expires <= checked || expires - checked > SOURCE_MAX_AGE_MS) errors.push("invalid_observation_clock");
  for (const key of ["start_date", "end_date", "registration_start", "registration_end"] as const) {
    if (f[key] != null && eventDate(f[key]) === null) errors.push("invalid_" + key);
  }
  for (const round of f.rounds_info) {
    for (const key of ["start_date", "end_date"] as const) if (round[key] != null && eventDate(round[key]) === null) errors.push("invalid_stage_date");
    if (round.start_date && round.end_date && eventDate(round.start_date)! >= eventDate(round.end_date, true)!) errors.push("contradictory_stage_window");
  }
  const start = eventDate(f.start_date), end = eventDate(f.end_date, true);
  if (start !== null && end !== null && start >= end) errors.push("contradictory_event_window");
  const rs = eventDate(f.registration_start), re = eventDate(f.registration_end, true);
  if (rs !== null && re !== null && rs >= re) errors.push("contradictory_registration_window");
  if (f.registration_status === "open" && (rs === null || re === null || checked === null || checked < rs || checked >= re)) errors.push("unsupported_open_registration");
  if (f.registration_status === "not-yet-open" && (rs === null || re === null || checked === null || checked >= rs)) errors.push("unsupported_future_registration");
  if (m.check_status === "ok" && m.issues.length) errors.push("successful_observation_has_unresolved_issues");
  let schedule: ValidatedSource["schedule"] = null;
  if (m.provider === "unstop") {
    if (m.evidence.event_date_basis === UNSTOP_EVENT_DATE_BASIS) {
      const inventory = retainBuildInventory(m.evidence.build_inventory), stageIssues: string[] = [];
      const window = inventory && reconciledBuildWindow(inventory, stageIssues, checked ?? undefined);
      if (!window || stageIssues.length || start !== window.from || end !== window.until) errors.push("unsupported_build_schedule");
      else schedule = { start: f.start_date!, end: f.end_date! };
    }
    // Revoked/absent markers never become schedule evidence through valid-looking facts.
  } else {
    if ((f.start_date != null) !== (f.end_date != null)) errors.push("incomplete_event_window");
    if (start !== null && end !== null && start < end) schedule = { start: f.start_date!, end: f.end_date! };
    else if (m.event_status !== "unknown") errors.push("lifecycle_without_schedule");
  }
  if (schedule && checked !== null) {
    const state = windowState(schedule.start, schedule.end, checked);
    if (m.event_status !== "unknown" && m.event_status !== state) errors.push("contradictory_lifecycle_claim");
    const published = m.evidence.published_event_status;
    if (published !== undefined && typeof published !== "string") errors.push("invalid_published_lifecycle");
    if ((["ENDED", "COMPLETED", "FINISHED"].includes(String(published)) && state !== "ended")
      || published === "UPCOMING" && state !== "upcoming" || published === "ONGOING" && state !== "ongoing") errors.push("contradictory_published_lifecycle");
  }
  return { identity, metadata: errors.length ? null : m, schedule: errors.length ? null : schedule, errors };
}

export function sourceMetadata(value: unknown, expected?: unknown): SourceMetadata | null {
  return validateSourceObservation(value, expected).metadata;
}
export function hasEventScheduleEvidence(value: unknown): boolean {
  const validated = validateSourceObservation(value);
  return !!validated.metadata && usableCheck(validated.metadata) && validated.schedule !== null
    && !EVENT_FIELDS.some(field => validated.metadata?.protected_fields?.includes(field));
}
export function registrationDestination(event: { website_url?: string | null; source_metadata?: unknown }): string | null {
  const value = sourceMetadata(event.source_metadata, event.website_url)?.facts.registration_url || event.website_url;
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function usableCheck(m: SourceMetadata): boolean {
  return m.check_status === "ok" || m.check_status === "unresolved" && !!m.protected_fields?.length
    && m.issues.length > 0 && m.issues.every(issue => ["protected_fields", "editorial_override"].includes(issue));
}
export function sourceFresh(m: SourceMetadata | null, now: number, fields: readonly string[] = []): m is SourceMetadata {
  m = sourceMetadata(m);
  if (!m || !usableCheck(m) || fields.some(field => m.protected_fields?.includes(field))) return false;
  const checked = Date.parse(m.checked_at), expires = Date.parse(m.expires_at);
  return Number.isFinite(checked) && Number.isFinite(expires) && checked <= now + 60000 && checked <= expires
    && now < expires && now - checked < SOURCE_MAX_AGE_MS && expires - checked <= SOURCE_MAX_AGE_MS;
}
/** One effective snapshot for directory and detail. Failed checks keep last-known facts without claiming freshness. */
export function synchronizedEvent<T extends { type?: string | null; source_metadata?: unknown; website_url?: string | null }>(event: T): T {
  const validated = validateSourceObservation(event.source_metadata, event.website_url), m = validated.metadata;
  if (event.type === "native") return event;
  if (!m) return event.source_metadata == null ? event : { ...event, start_date: null, end_date: null };
  const facts: Record<string, unknown> = {};
  for (const key of ["name", "description", "website_url", "college", "start_date", "end_date", "registration_start", "registration_end",
    "registration_status", "min_team_size", "max_team_size", "mode", "location", "prize_pool", "currency", "rounds_info"]) {
    if (m.protected_fields?.includes(key) || m.evidence_only && !REGISTRATION_FIELDS.includes(key)) continue;
    facts[key] = object(m.facts)[key];
  }
  if (!m.evidence_only && (!usableCheck(m) || !validated.schedule)) {
    if (!m.protected_fields?.includes("start_date")) facts.start_date = null;
    if (!m.protected_fields?.includes("end_date")) facts.end_date = null;
  }
  // Never overlay identity, approval, ownership, archival or community fields from JSON.
  return { ...event, ...facts };
}
