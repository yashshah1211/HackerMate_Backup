import "server-only";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { indiaReportDate } from "@/lib/admin/dailyReportClaim";

type State = "claimed" | "dispatching" | "accepted" | "rejected" | "unknown";
type Evidence = {
  reportingDate: string; attemptId: string; payloadHash: string; status: State;
  createdAt: string; updatedAt: string; providerId?: string; providerStatus?: number;
};
export type AnalyticsDigestClaim = { key: string; value: string; evidence: Evidence };

// Do not log raw PostgREST errors: they may include settings/report details.
export function logAnalyticsClaimError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  console.error("[Analytics digest] Claim operation unavailable:",
    typeof code === "string" && /^(?:[A-Z0-9]{5}|PGRST[0-9]{3})$/.test(code) ? code : "unavailable");
}

export function analyticsDigestClaimClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !key?.trim()) return null;
  try { return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); }
  catch (error) { logAnalyticsClaimError(error); return null; }
}

function matchingReceipt(data: unknown, key: string, value: string): boolean {
  if (!Array.isArray(data) || data.length !== 1) return false;
  const row: unknown = data[0];
  return Boolean(row && typeof row === "object" && "key" in row && "value" in row && row.key === key && row.value === value);
}

/** Plain INSERT, never upsert/read-then-write. The existing PK is the arbiter. */
export async function claimAnalyticsDigest(db: SupabaseClient, at: Date, payloadHash: string): Promise<
  { status: "acquired"; claim: AnalyticsDigestClaim } | { status: "duplicate" | "unavailable" }
> {
  try {
    if (!/^[a-f0-9]{64}$/.test(payloadHash)) return { status: "unavailable" };
    const reportingDate = indiaReportDate(at), now = new Date().toISOString();
    const evidence: Evidence = { reportingDate, attemptId: randomUUID(), payloadHash, status: "claimed", createdAt: now, updatedAt: now };
    const key = "cron:analytics-summary:v1:" + reportingDate, value = JSON.stringify(evidence);
    const { data, error } = await db.from("app_settings").insert({ key, value }).select("key,value")
      .abortSignal(AbortSignal.timeout(10_000));
    if (error?.code === "23505") return { status: "duplicate" };
    if (error) { logAnalyticsClaimError(error); return { status: "unavailable" }; }
    if (!matchingReceipt(data, key, value)) { logAnalyticsClaimError(null); return { status: "unavailable" }; }
    return { status: "acquired", claim: { key, value, evidence } };
  } catch (error) { logAnalyticsClaimError(error); return { status: "unavailable" }; }
}

/** Ownership/state CAS: no release, overwrite, retry or duplicate-caller update. */
export async function transitionAnalyticsDigest(db: SupabaseClient, claim: AnalyticsDigestClaim, status: Exclude<State, "claimed">,
  outcome: { providerId?: string; providerStatus?: number } = {}): Promise<AnalyticsDigestClaim | null> {
  if (status === "dispatching" ? claim.evidence.status !== "claimed" : claim.evidence.status !== "dispatching") return null;
  const evidence = { ...claim.evidence, ...outcome, status, updatedAt: new Date().toISOString() };
  const value = JSON.stringify(evidence);
  try {
    const { data, error } = await db.from("app_settings").update({ value })
      .eq("key", claim.key).eq("value", claim.value).select("key,value").abortSignal(AbortSignal.timeout(10_000));
    if (error) { logAnalyticsClaimError(error); return null; }
    if (!matchingReceipt(data, claim.key, value)) { logAnalyticsClaimError(null); return null; }
    return { key: claim.key, value, evidence };
  } catch (error) { logAnalyticsClaimError(error); return null; }
}
