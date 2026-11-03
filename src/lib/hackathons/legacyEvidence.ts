import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identifySource } from "./providers";
import { validateSourceObservation } from "./source";
import { discoverSources, SourceTransport } from "./sourceTransport";
import { observe, readCatalog, reconciliation, type CatalogRecord } from "./synchronize";

export function stableSourceKey(record: CatalogRecord): string | null {
  const v = validateSourceObservation(record.source_metadata, record.website_url), identity = v.identity || identifySource(record.website_url);
  if (!identity || record.source_metadata != null && !v.identity) return null;
  return identity.provider === "unstop" || v.identity ? `${identity.provider}:${identity.provider_id}` : identity.canonical_url;
}
/** Stable UUID cursor covers legacy rows even when none have metadata. Duplicate identities never become adoption candidates. */
export function legacyEvidenceBatch(records: CatalogRecord[], afterId = "", limit = 20) {
  if (afterId && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(afterId)) throw new Error("Invalid legacy cursor");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("Legacy batch limit must be 1–50");
  const counts = new Map<string, number>();
  for (const r of records) { const key = stableSourceKey(r); if (key) counts.set(key, (counts.get(key) || 0) + 1); }
  const remaining = records.filter(r => r.id > afterId && r.source_metadata == null).sort((a, b) => a.id.localeCompare(b.id));
  const selected = remaining.slice(0, limit);
  return { nextCursor: selected.at(-1)?.id || afterId, hasMore: remaining.length > selected.length,
    records: selected.map(record => ({ record, reason: !["external", "official"].includes(String(record.type)) ? "protected_record"
      : !stableSourceKey(record) ? "unsupported_source_identity" : counts.get(stableSourceKey(record)!) !== 1 ? "duplicate_source_identity" : null })) };
}
/** Review only: never leases, applies, adopts or calls a database writer. */
export async function reviewLegacyEvidenceBatch(client: SupabaseClient, options: { afterId?: string; limit?: number; transport?: SourceTransport } = {}) {
  const records = await readCatalog(client), batch = legacyEvidenceBatch(records, options.afterId, options.limit);
  const transport = options.transport || new SourceTransport(), discovery = await discoverSources(transport);
  const results = [];
  for (const { record, reason } of batch.records) {
    if (reason) { results.push({ id: record.id, classification: "unresolved", changes: {}, reason }); continue; }
    if (transport.remaining() < 15000) { results.push({ id: record.id, classification: "unresolved", changes: {}, reason: "source_budget_exhausted" }); continue; }
    const inferred = identifySource(record.website_url)!;
    const identity = discovery.identities.find(i => i.provider === inferred.provider && (i.provider === "unstop" ? i.provider_id === inferred.provider_id : i.canonical_url === inferred.canonical_url)) || inferred;
    try {
      const observation = await observe(identity, transport), preview = reconciliation(record, observation);
      results.push({ ...preview, changes: {}, factualChangesWithheld: true, proposedEvidence: observation, requires_adoption: true });
    } catch (error) { results.push({ id: record.id, classification: "unresolved", changes: {}, reason: error instanceof Error ? error.message : "source_unavailable" }); }
  }
  return { mode: "read_only_evidence_review", nextCursor: batch.nextCursor, hasMore: batch.hasMore, results, approvedWrites: 0 };
}
