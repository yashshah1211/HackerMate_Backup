import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { object, sourceFresh, validateSourceObservation, type SourceMetadata } from "./source";
import type { CatalogRecord } from "./synchronize";

export type EvidenceApproval = {
  record_id: string; provider_id: string; source_hash: string; checked_at: string;
  approved_by: string; approved_at: string;
};
export function evidenceSnapshot(record: CatalogRecord): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== "source_metadata"));
}
export function verifiedEvidence(value: unknown, record: CatalogRecord, now: number): SourceMetadata {
  const v = validateSourceObservation(value, record.website_url), m = v.metadata;
  if (!m || !v.identity || !sourceFresh(m, now) || m.check_status !== "ok" || m.category !== "hackathon"
    || now - Date.parse(m.checked_at) > 300000 || !["external", "official"].includes(String(record.type))) {
    throw new Error("Evidence is invalid, stale or not an external hackathon");
  }
  return m;
}
/** Approval binds one observation and UUID. This is deliberately not callable through the sync HTTP endpoint. */
export async function persistApprovedSourceEvidence(client: SupabaseClient, record: CatalogRecord, value: unknown, approval: EvidenceApproval, now = Date.now()) {
  const m = verifiedEvidence(value, record, now);
  const approvedAt = Date.parse(approval.approved_at);
  if (record.source_metadata != null || approval.record_id !== record.id || approval.provider_id !== m.provider_id
    || approval.source_hash !== m.source_hash || approval.checked_at !== m.checked_at || !approval.approved_by?.trim()
    || !Number.isFinite(approvedAt) || approvedAt < Date.parse(m.checked_at) || approvedAt > now + 60000 || now - approvedAt > 300000) {
    throw new Error("Explicit current per-record evidence approval required");
  }
  const result = await client.rpc("store_hackathon_source_evidence", {
    p_id: record.id, p_identity: { provider: m.provider, provider_id: m.provider_id, canonical_url: m.canonical_url },
    p_observation: m, p_expected: evidenceSnapshot(record), p_attempt: randomUUID(), p_action: "apply", p_allow_initial: true,
  });
  if (result.error) { console.error("Approved source evidence transaction failed:", result.error); throw new Error("Source evidence writer unavailable; no fallback"); }
  return object(result.data);
}
