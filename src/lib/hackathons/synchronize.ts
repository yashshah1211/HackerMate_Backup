import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identifySource, parseDevfolio, parseHack2skill, parseUnstop, type Observation, type SourceIdentity } from "./providers";
import { REGISTRATION_FIELDS, hasEventScheduleEvidence, object, sourceFresh, sourceMetadata, sourceProvider, text, validateSourceObservation } from "./source";
import { discoverSources, SourceTransport } from "./sourceTransport";
import { eventDate, registrationState } from "./lifecycle";
import { windowState, validatedSourceIdentity } from "./sourceEvidence";
import { evidenceSnapshot } from "./sourceEvidenceWriter";
import { summarizeSourceCoverage } from "./sourceCoverage";

export const CATALOG_COLUMNS = "id,name,description,website_url,college,start_date,end_date,registration_start,registration_end,registration_status,min_team_size,max_team_size,mode,location,prize_pool,currency,rounds_info,rounds_count,tags,type,organizer_id,status,archived,source_metadata";
export type CatalogRecord = Record<string, unknown> & { id: string; name: string; website_url: string | null };
export type Reconciliation = {
  id: string | null; name: string; provider: string | null; status: string; classification: string;
  changes: Record<string, { before: unknown; after: unknown }>; evidence?: unknown; validation_errors?: string[];
  requires_adoption: boolean; reason?: string;
};
const fields = ["name", "description", "website_url", "college", "start_date", "end_date", "registration_start", "registration_end", "registration_status", "min_team_size", "max_team_size", "mode", "location", "prize_pool", "currency", "rounds_info", "rounds_count", "tags"];

/** Coarse legacy DATE columns remain compatible; exact provider instants stay in protected evidence. */
function calendar(value: string): string {
  return value.length === 10 ? value : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function deadline(value: string): string {
  return value.length === 10 ? new Date(Date.parse(value + "T00:00:00+05:30") + 86400000).toISOString() : value;
}
export function sourcePatch(value: unknown, expected?: unknown): Record<string, unknown> {
  const validated = validateSourceObservation(value, expected), observation = validated.metadata;
  if (!observation || observation.evidence_only || observation.check_status !== "ok" || observation.issues.length) return {};
  const f = observation.facts, patch: Record<string, unknown> = {};
  for (const field of fields) {
    if (field === "tags" || field === "rounds_count") continue;
    if ((field === "start_date" || field === "end_date") && !validated.schedule) continue;
    const value = object(f)[field];
    if (value === null || value === undefined || field === "registration_status" && value === "unknown" || field === "rounds_info" && !f.rounds_info.length) continue;
    patch[field] = value;
  }
  if (f.start_date && validated.schedule) patch.start_date = calendar(f.start_date);
  if (f.end_date && validated.schedule) patch.end_date = calendar(f.end_date);
  if (f.registration_end) patch.registration_end = deadline(f.registration_end);
  if (f.registration_start?.length === 10) patch.registration_start = new Date(f.registration_start + "T00:00:00+05:30").toISOString();
  if (f.rounds_info.length) patch.rounds_count = f.rounds_info.length;
  patch.tags = [observation.provider, ...(observation.category === "hackathon" ? ["Hackathon"] : [])];
  return patch;
}
export function reconciliation(record: CatalogRecord | undefined, value: unknown): Reconciliation {
  const validated = validateSourceObservation(value, record?.website_url), observation = validated.metadata;
  if (!observation) return { id: record?.id || null, name: record?.name || text(object(object(value).facts).name) || "Unverified source",
    provider: sourceProvider(object(value).provider), status: "unresolved", classification: "unresolved", changes: {},
    requires_adoption: Boolean(record && !sourceMetadata(record.source_metadata, record.website_url)), evidence: value, validation_errors: validated.errors };
  const patch = sourcePatch(observation, record?.website_url), changes: Reconciliation["changes"] = {};
  for (const [key, value] of Object.entries(patch)) {
    const before = record?.[key] ?? null;
    if (JSON.stringify(before) !== JSON.stringify(value)) changes[key] = { before: key === "description" ? "[existing text; protected pending review]" : before, after: value };
  }
  const state = validated.schedule ? windowState(observation.facts.start_date, observation.facts.end_date, Date.parse(observation.checked_at)) : "unknown", registration = observation.facts.registration_status;
  const classification = observation.check_status !== "ok" ? "unresolved" : state === "ended" ? "confirmed_ended_propose_suppression" : observation.category !== "hackathon" ? "unresolved"
    : registration === "open" ? "registration_open" : state === "ongoing" ? registration === "closed" ? "ongoing_registration_closed" : "ongoing" : "unresolved";
  return { id: record?.id || null, name: observation.facts.name, provider: sourceProvider(observation.provider), status: "dry_run", classification, changes,
    requires_adoption: Boolean(record && !sourceMetadata(record.source_metadata, record.website_url)), evidence: value, validation_errors: validated.errors };
}

export async function observe(identity: SourceIdentity, transport: SourceTransport): Promise<Observation> {
  if (!validatedSourceIdentity(identity)) throw new Error("Invalid source identity");
  const r = await transport.detail(identity);
  const observation = identity.provider === "unstop" ? parseUnstop(identity, JSON.parse(r.body), r.checkedAt, r.hash)
    : identity.provider === "devfolio" ? parseDevfolio(identity, r.body, r.checkedAt, r.hash)
    : parseHack2skill(identity, JSON.parse(r.body), r.checkedAt, r.hash);
  if (identity.provider === "hack2skill" && !/^[0-9a-f]{24}$/.test(identity.provider_id)) {
    observation.check_status = "unresolved"; observation.issues.push("provider_id_not_confirmed_by_listing");
  }
  const expected = identity.provider === "devfolio" && identity.provider_id === identity.slug ? identity.canonical_url : identity;
  const validated = validateSourceObservation(observation, expected);
  if (!validated.metadata) {
    observation.check_status = "unresolved";
    observation.issues = [...new Set([...observation.issues, ...validated.errors])];
  }
  return observation;
}

export async function readCatalog(client: SupabaseClient, signal?: AbortSignal): Promise<CatalogRecord[]> {
  const rows: CatalogRecord[] = []; let cursor: string | null = null;
  for (let page = 0; page < 200; page++) {
    let q = client.from("hackathons").select(CATALOG_COLUMNS).order("id", { ascending: true }).limit(250);
    if (cursor) q = q.gt("id", cursor);
    if (signal) q = q.abortSignal(signal);
    const { data, error } = await q;
    if (error) { console.error("Catalog snapshot failed:", error); throw new Error("Catalog source schema or database unavailable; no synchronization writes performed."); }
    if (!Array.isArray(data)) throw new Error("Invalid complete catalog snapshot");
    if (!data.length) return rows;
    for (const row of data) {
      if (typeof row.id !== "string" || cursor && row.id <= cursor) throw new Error("Non-advancing catalog snapshot");
      rows.push(row as unknown as CatalogRecord); cursor = row.id;
    }
  }
  throw new Error("Catalog snapshot request limit exceeded");
}

export async function synchronizeCatalog(client: SupabaseClient, options: { dryRun?: boolean; transport?: SourceTransport; maxChecks?: number } = {}) {
  const dryRun = options.dryRun ?? true, transport = options.transport || new SourceTransport();
  const signal = AbortSignal.timeout(Math.max(1, transport.remaining()));
  const records = await readCatalog(client, signal);
  const { data: partners, error } = await client.from("partner_configs").select("hackathon_id,features").abortSignal(signal);
  if (error || !Array.isArray(partners)) { console.error("Catalog partner protection read failed:", error); throw new Error("Partner protection unavailable; sync stopped."); }
  const protectedIds = new Set(partners.map(p => p.hackathon_id)), protectedUrls = new Set(partners.map(p => text(object(p.features).website_url)).filter(Boolean));
  const discovery = await discoverSources(transport), results: Reconciliation[] = [];
  const byUrl = new Map(discovery.identities.map(i => [i.canonical_url, i]));
  const discoveredIds = new Map(discovery.identities.map(i => [i.provider + ":" + i.provider_id, i]));
  const knownIds = new Map(records.flatMap(r => {
    const m = validateSourceObservation(r.source_metadata, r.website_url).identity, legacy = identifySource(r.website_url);
    const identity = m || (legacy?.provider === "unstop" ? legacy : null);
    return identity ? [[identity.provider + ":" + identity.provider_id, r] as const] : [];
  }));
  const work: { record?: CatalogRecord; identity: SourceIdentity; evidenceOnly?: boolean }[] = [];
  // Give confirmed current/near-term hackathons priority, then rotate the remaining backlog by check time.
  // Cached facts only order checks; they never establish fresh admission without a successful recheck.
  const relevant = (row: CatalogRecord) => { const m = sourceMetadata(row.source_metadata, row.website_url);
    if (!m || m.category !== "hackathon") return false;
    const facts = m.facts, clock = Date.now(), verifiedSchedule = hasEventScheduleEvidence(m), state = verifiedSchedule ? windowState(facts.start_date, facts.end_date, clock) : "unknown";
    if (verifiedSchedule && state === "ended") return false;
    // Evaluate authority at the original check for queue priority only, so expired valid
    // observations can recover. Public admission still uses the actual current clock.
    const registrationSupported = sourceFresh(m, Date.parse(m.checked_at), REGISTRATION_FIELDS);
    return state === "ongoing" || registrationSupported && (registrationState({ ...facts, type: "native" }, clock) === "open"
      || (eventDate(facts.registration_start) ?? 0) > clock && (eventDate(facts.registration_start) ?? Infinity) < clock + 86400000);
  };
  const ordered = [...records].sort((a, b) => {
    const av = validateSourceObservation(a.source_metadata, a.website_url), bv = validateSourceObservation(b.source_metadata, b.website_url);
    // A sound identity may be rechecked even when cached facts are unusable. Check time
    // only orders this backlog; it cannot grant eligibility or patch authority.
    return Number(!av.identity) - Number(!bv.identity) || Number(relevant(b)) - Number(relevant(a))
      || (eventDate(object(a.source_metadata).checked_at) ?? 0) - (eventDate(object(b.source_metadata).checked_at) ?? 0);
  });
  for (const record of ordered) {
    const evidenceOnly = sourceMetadata(record.source_metadata, record.website_url)?.evidence_only === true;
    if (!["external", "official"].includes(String(record.type)) || !evidenceOnly && (record.organizer_id || protectedIds.has(record.id) || protectedUrls.has(record.website_url))) continue;
    const validated = validateSourceObservation(record.source_metadata, record.website_url), meta = validated.metadata;
    if (record.source_metadata != null && !validated.identity) {
      results.push({ id: record.id, name: record.name, provider: null, status: "unresolved", classification: "unresolved", changes: {}, requires_adoption: false,
        reason: "invalid_cached_observation", validation_errors: validateSourceObservation(record.source_metadata, record.website_url).errors }); continue;
    }
    const inferred = identifySource(meta?.canonical_url || record.website_url);
    if (!inferred) { results.push({ id: record.id, name: record.name, provider: null, status: "unresolved", classification: "unresolved", changes: {}, requires_adoption: !meta, reason: "unsupported_source_identity" }); continue; }
    const knownIdentity = validated.identity || (inferred.provider === "unstop" ? inferred : null);
    const identity = (knownIdentity && discoveredIds.get(knownIdentity.provider + ":" + knownIdentity.provider_id)) || byUrl.get(inferred.canonical_url) || (validated.identity || inferred);
    // Routine cron must not perform the unapproved legacy backfill, including metadata adoption.
    if (!dryRun && record.source_metadata == null) { results.push({ id: record.id, name: record.name, provider: identity.provider, status: "requires_adoption", classification: "unresolved", changes: {}, requires_adoption: true }); continue; }
    work.push({ record, identity, evidenceOnly });
  }
  const seen = new Set(work.map(w => w.identity.canonical_url));
  for (const identity of discovery.identities) {
    if (seen.has(identity.canonical_url) || protectedUrls.has(identity.canonical_url) || records.some(r => r.website_url?.replace(/\/+$/, "") === identity.canonical_url)) continue;
    const existing = knownIds.get(identity.provider + ":" + identity.provider_id);
    if (!existing) work.push({ identity });
  }
  // Bound both kinds of work without allowing a large existing catalog or one provider's
  // listing order to starve new discovery. Four refresh slots, then one round-robin new source.
  const refreshes = work.filter(w => w.record), queues = ["unstop", "devfolio", "hack2skill"].map(p => work.filter(w => !w.record && w.identity.provider === p));
  const discoveries: typeof work = [];
  while (queues.some(q => q.length)) for (const q of queues) { const next = q.shift(); if (next) discoveries.push(next); }
  const scheduled: typeof work = [];
  while (refreshes.length || discoveries.length) {
    for (let i = 0; i < 4 && refreshes.length; i++) scheduled.push(refreshes.shift()!);
    if (discoveries.length) scheduled.push(discoveries.shift()!);
  }
  const cap = Math.min(150, options.maxChecks ?? 150); let checked = 0;
  for (const item of scheduled) {
    if (checked >= cap || transport.remaining() < 15000) break;
    const { record, identity, evidenceOnly } = item, attempt = randomUUID(); let expected: unknown = null, leased = false;
    if (!dryRun && record) {
      const lease = await client.rpc(evidenceOnly ? "store_hackathon_source_evidence" : "begin_hackathon_source_check", evidenceOnly
        ? { p_id: record.id, p_identity: identity, p_observation: null, p_expected: evidenceSnapshot(record), p_attempt: attempt, p_action: "lease", p_allow_initial: false }
        : { p_id: record.id, p_attempt: attempt }).abortSignal(signal);
      if (lease.error) { console.error("Source check lease failed:", lease.error); throw new Error("Source writer unavailable; synchronization stopped without fallback."); }
      const value = object(lease.data); if (value.status !== "leased") continue;
      expected = value.snapshot; leased = true;
    }
    checked++;
    let evidence: Observation | undefined;
    try {
      const observation = evidence = await observe(identity, transport), preview = reconciliation(record, observation);
      if (evidenceOnly) preview.changes = {};
      if (!record && (!sourceFresh(observation, Date.now()) || observation.category !== "hackathon"
        || preview.classification === "confirmed_ended_propose_suppression"
        || !["registration_open", "ongoing_registration_closed", "ongoing"].includes(preview.classification))) {
        results.push({ ...preview, status: "held", reason: "new_source_requires_open_registration_or_verified_ongoing", changes: {} }); continue;
      }
      if (dryRun) { results.push(preview); continue; }
      if (!sourceMetadata(observation, record?.website_url)) throw new Error("invalid_source_observation");
      const result = await client.rpc(evidenceOnly ? "store_hackathon_source_evidence" : "apply_hackathon_source_check", evidenceOnly ? {
        p_id: record!.id, p_identity: identity, p_observation: observation, p_expected: expected, p_attempt: attempt, p_action: "apply", p_allow_initial: false,
      } : {
        p_id: record?.id || null, p_identity: { provider: observation.provider, provider_id: observation.provider_id, canonical_url: observation.canonical_url },
        p_observation: observation, p_patch: sourcePatch(observation), p_expected: expected, p_attempt: attempt,
      }).abortSignal(signal);
      if (result.error) { console.error("Source synchronization transaction failed:", result.error); throw new Error("source_transaction_failed"); }
      preview.status = String(object(result.data).status || "unresolved"); results.push(preview);
    } catch (e) {
      console.error("Source check failed:", identity.provider, identity.provider_id, e);
      if (leased) {
        const failed = await client.rpc(evidenceOnly ? "store_hackathon_source_evidence" : "apply_hackathon_source_check", evidenceOnly ? {
          p_id: record!.id, p_identity: identity, p_observation: null, p_expected: expected, p_attempt: attempt, p_action: "failure", p_allow_initial: false,
        } : { p_id: record!.id, p_identity: identity, p_observation: null,
          p_patch: {}, p_expected: null, p_attempt: attempt, p_failure: "source_check_unsuccessful" }).abortSignal(signal);
        if (failed.error) { console.error("Source failure receipt unavailable; lease remains fail-closed:", failed.error); }
      }
      results.push({ id: record?.id || null, name: record?.name || identity.canonical_url, provider: identity.provider, status: "unresolved", classification: "unresolved", changes: {}, requires_adoption: Boolean(record && !sourceMetadata(record.source_metadata, record.website_url)), reason: "source_check_unsuccessful", evidence, validation_errors: evidence ? validateSourceObservation(evidence, record?.website_url).errors : [] });
    }
  }
  return { success: true, dryRun, checked, discovered: discovery.identities.length, discoveryFailures: discovery.failures, discoveryFailureDetails: discovery.failureDetails,
    observedCoverage: summarizeSourceCoverage(results.filter(r => r.evidence).map(r => ({ source_metadata: r.evidence })), Date.now()),
    remaining: Math.max(0, work.length - checked), results, message: `Catalog: ${checked} source checks; ${dryRun ? "preview only" : "source-owned writes only"}. No organizer emails sent.` };
}
