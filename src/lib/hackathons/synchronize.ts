import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identifySource, parseDevfolio, parseHack2skill, parseUnstop, type Observation, type SourceIdentity } from "./providers";
import { hasEventScheduleEvidence, object, sourceMetadata, sourceProvider, text } from "./source";
import { discoverSources, SourceTransport } from "./sourceTransport";
import { eventDate, listedEventState, registrationState } from "./lifecycle";

export const CATALOG_COLUMNS = "id,name,description,website_url,college,start_date,end_date,registration_start,registration_end,registration_status,min_team_size,max_team_size,mode,location,prize_pool,currency,rounds_info,rounds_count,tags,type,organizer_id,status,archived,source_metadata";
export type CatalogRecord = Record<string, unknown> & { id: string; name: string; website_url: string | null };
export type Reconciliation = {
  id: string | null; name: string; provider: string | null; status: string; classification: string;
  changes: Record<string, { before: unknown; after: unknown }>; evidence?: Observation;
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
export function sourcePatch(observation: Observation): Record<string, unknown> {
  if (!sourceMetadata(observation)) return {};
  const f = observation.facts, patch: Record<string, unknown> = {};
  for (const field of fields) {
    if (field === "tags" || field === "rounds_count") continue;
    if ((field === "start_date" || field === "end_date") && !hasEventScheduleEvidence(observation)) continue;
    const value = object(f)[field];
    if (value === null || value === undefined || field === "registration_status" && value === "unknown" || field === "rounds_info" && !f.rounds_info.length) continue;
    patch[field] = value;
  }
  if (f.start_date && hasEventScheduleEvidence(observation)) patch.start_date = calendar(f.start_date);
  if (f.end_date && hasEventScheduleEvidence(observation)) patch.end_date = calendar(f.end_date);
  if (f.registration_end) patch.registration_end = deadline(f.registration_end);
  if (f.registration_start?.length === 10) patch.registration_start = new Date(f.registration_start + "T00:00:00+05:30").toISOString();
  if (f.rounds_info.length) patch.rounds_count = f.rounds_info.length;
  patch.tags = [observation.provider, ...(observation.category === "hackathon" ? ["Hackathon"] : [])];
  return patch;
}
export function reconciliation(record: CatalogRecord | undefined, observation: Observation): Reconciliation {
  const patch = sourcePatch(observation), changes: Reconciliation["changes"] = {};
  for (const [key, value] of Object.entries(patch)) {
    const before = record?.[key] ?? null;
    if (JSON.stringify(before) !== JSON.stringify(value)) changes[key] = { before: key === "description" ? "[existing text; protected pending review]" : before, after: value };
  }
  const state = hasEventScheduleEvidence(observation) ? observation.event_status : "unknown", registration = observation.facts.registration_status;
  const classification = !sourceMetadata(observation) || observation.check_status !== "ok" ? "unresolved" : state === "ended" ? "confirmed_ended_propose_suppression" : observation.category !== "hackathon" ? "unresolved"
    : registration === "open" ? "registration_open" : state === "ongoing" ? registration === "closed" ? "ongoing_registration_closed" : "ongoing" : "unresolved";
  return { id: record?.id || null, name: observation.facts.name, provider: sourceProvider(observation.provider), status: "dry_run", classification, changes,
    requires_adoption: Boolean(record && !sourceMetadata(record.source_metadata)), evidence: observation };
}

export async function observe(identity: SourceIdentity, transport: SourceTransport): Promise<Observation> {
  const r = await transport.detail(identity);
  const observation = identity.provider === "unstop" ? parseUnstop(identity, JSON.parse(r.body), r.checkedAt, r.hash)
    : identity.provider === "devfolio" ? parseDevfolio(identity, r.body, r.checkedAt, r.hash)
    : parseHack2skill(identity, JSON.parse(r.body), r.checkedAt, r.hash);
  if (identity.provider === "hack2skill" && !/^[0-9a-f]{24}$/.test(identity.provider_id)) {
    observation.check_status = "unresolved"; observation.issues.push("provider_id_not_confirmed_by_listing");
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
    const m = sourceMetadata(r.source_metadata), legacy = identifySource(r.website_url);
    const identity = m || (legacy?.provider === "unstop" ? legacy : null);
    return identity ? [[identity.provider + ":" + identity.provider_id, r] as const] : [];
  }));
  const work: { record?: CatalogRecord; identity: SourceIdentity }[] = [];
  // Give confirmed current/near-term hackathons priority, then rotate the remaining backlog by check time.
  // Cached facts only order checks; they never establish fresh admission without a successful recheck.
  const relevant = (row: CatalogRecord) => { const m = sourceMetadata(row.source_metadata);
    if (!m || m.protected_fields?.length || m.category !== "hackathon" || m.check_status !== "ok") return false;
    const facts = m.facts, clock = Date.now(), verifiedSchedule = hasEventScheduleEvidence(m), state = verifiedSchedule ? listedEventState(facts, clock) : "unknown";
    if (verifiedSchedule && (m.event_status === "ended" || state === "ended")) return false;
    return state === "ongoing" || registrationState({ ...facts, type: "native" }, clock) === "open"
      || (eventDate(facts.registration_start) ?? 0) > clock && (eventDate(facts.registration_start) ?? Infinity) < clock + 86400000;
  };
  const ordered = [...records].sort((a, b) => {
    const am = sourceMetadata(a.source_metadata), bm = sourceMetadata(b.source_metadata);
    return Number(!am) - Number(!bm) || Number(relevant(b)) - Number(relevant(a)) || (am ? Date.parse(am.checked_at) : 0) - (bm ? Date.parse(bm.checked_at) : 0);
  });
  for (const record of ordered) {
    if (record.organizer_id || !["external", "official"].includes(String(record.type)) || protectedIds.has(record.id) || protectedUrls.has(record.website_url)) continue;
    const meta = sourceMetadata(record.source_metadata), inferred = identifySource(meta?.canonical_url || record.website_url);
    if (!inferred) { results.push({ id: record.id, name: record.name, provider: null, status: "unresolved", classification: "unresolved", changes: {}, requires_adoption: !meta, reason: "unsupported_source_identity" }); continue; }
    const knownIdentity = meta || (inferred.provider === "unstop" ? inferred : null);
    const identity = (knownIdentity && discoveredIds.get(knownIdentity.provider + ":" + knownIdentity.provider_id)) || byUrl.get(inferred.canonical_url) || (meta ? { ...inferred, provider_id: meta.provider_id } : inferred);
    // Routine cron must not perform the unapproved legacy backfill, including metadata adoption.
    if (!dryRun && !meta) { results.push({ id: record.id, name: record.name, provider: identity.provider, status: "requires_adoption", classification: "unresolved", changes: {}, requires_adoption: true }); continue; }
    work.push({ record, identity });
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
    const { record, identity } = item, attempt = randomUUID(); let expected: unknown = null, leased = false;
    if (!dryRun && record) {
      const lease = await client.rpc("begin_hackathon_source_check", { p_id: record.id, p_attempt: attempt }).abortSignal(signal);
      if (lease.error) { console.error("Source check lease failed:", lease.error); throw new Error("Source writer unavailable; synchronization stopped without fallback."); }
      const value = object(lease.data); if (value.status !== "leased") continue;
      expected = value.snapshot; leased = true;
    }
    checked++;
    try {
      const observation = await observe(identity, transport), preview = reconciliation(record, observation);
      if (dryRun) { results.push(preview); continue; }
      const result = await client.rpc("apply_hackathon_source_check", {
        p_id: record?.id || null, p_identity: { provider: observation.provider, provider_id: observation.provider_id, canonical_url: observation.canonical_url },
        p_observation: observation, p_patch: sourcePatch(observation), p_expected: expected, p_attempt: attempt,
      }).abortSignal(signal);
      if (result.error) { console.error("Source synchronization transaction failed:", result.error); throw new Error("source_transaction_failed"); }
      preview.status = String(object(result.data).status || "unresolved"); results.push(preview);
    } catch (e) {
      console.error("Source check failed:", identity.provider, identity.provider_id, e);
      if (leased) {
        const failed = await client.rpc("apply_hackathon_source_check", { p_id: record!.id, p_identity: identity, p_observation: null,
          p_patch: {}, p_expected: null, p_attempt: attempt, p_failure: "source_check_unsuccessful" }).abortSignal(signal);
        if (failed.error) { console.error("Source failure receipt unavailable; lease remains fail-closed:", failed.error); }
      }
      results.push({ id: record?.id || null, name: record?.name || identity.canonical_url, provider: identity.provider, status: "unresolved", classification: "unresolved", changes: {}, requires_adoption: Boolean(record && !sourceMetadata(record.source_metadata)), reason: "source_check_unsuccessful" });
    }
  }
  return { success: true, dryRun, checked, discovered: discovery.identities.length, discoveryFailures: discovery.failures,
    remaining: Math.max(0, work.length - checked), results, message: `Catalog: ${checked} source checks; ${dryRun ? "preview only" : "source-owned writes only"}. No organizer emails sent.` };
}
