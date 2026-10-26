import type { SupabaseClient } from "@supabase/supabase-js";

export const RATE_LIMIT_RETENTION = {
  batchSize: 100,
  maxBatches: 5,
  budgetMs: 5_000,
  safetyMs: 60_000,
} as const;

type CleanupCode = "complete" | "backlog_remaining" | "selection_failed" | "deletion_failed" | "verification_failed" | "invalid_response" | "deadline_exceeded";

export interface RateLimitCleanupResult {
  status: "complete" | "partial" | "unverified";
  code: CleanupCode;
  deleted: number;
  batches: number;
  remaining: boolean | null;
}

const SAFE_DATABASE_CODES = new Set(["42501", "57014", "53300", "53400", "53200", "08000", "08003", "08006", "PGRST000", "PGRST001", "PGRST002", "PGRST003"]);

/** Service-role maintenance only. Caller must verify machine authorization first.
 * Expiry is checked again in DELETE: a row renewed after SELECT must survive.
 * A completed run establishes only that no row before its fixed cutoff was seen
 * at its final probe, not a permanent or strict wall-clock retention guarantee.
 */
export async function pruneExpiredRateLimits(admin: SupabaseClient): Promise<RateLimitCleanupResult> {
  const started = Date.now();
  const cutoffMs = started - RATE_LIMIT_RETENTION.safetyMs;
  const cutoff = new Date(cutoffMs).toISOString();
  const signal = AbortSignal.timeout(RATE_LIMIT_RETENTION.budgetMs);
  let stop!: (reason: Error) => void;
  const deadline = new Promise<never>((_, reject) => { stop = reject; });
  const timer = setTimeout(() => {
    stop(new Error("cleanup_deadline"));
  }, RATE_LIMIT_RETENTION.budgetMs);
  let deleted = 0;
  let batches = 0;
  let operation: CleanupCode = "selection_failed";
  async function wait<T>(query: PromiseLike<T>): Promise<T> {
    if (signal.aborted || Date.now() - started >= RATE_LIMIT_RETENTION.budgetMs) throw new Error("cleanup_deadline");
    return Promise.race([query, deadline]);
  }
  const incomplete = (code: CleanupCode, error?: unknown): RateLimitCleanupResult => {
    const suppliedCode = error && typeof error === "object" && "code" in error ? error.code : null;
    const databaseCode = typeof suppliedCode === "string" && SAFE_DATABASE_CODES.has(suppliedCode) ? suppliedCode : "unclassified";
    const result: RateLimitCleanupResult = { status: "unverified", code, deleted, batches, remaining: null };
    console.error("[Rate limit retention]", { ...result, databaseCode });
    return result;
  };
  try {
    for (let batch = 0; batch < RATE_LIMIT_RETENTION.maxBatches; batch++) {
      operation = "selection_failed";
      const selected = await wait(admin.from("rate_limits").select("ip, reset_time")
        .lt("reset_time", cutoff).order("reset_time").order("ip")
        .limit(RATE_LIMIT_RETENTION.batchSize).abortSignal(signal));
      if (selected.error) return incomplete(operation, selected.error);
      if (!Array.isArray(selected.data) || selected.data.length > RATE_LIMIT_RETENTION.batchSize) return incomplete("invalid_response");
      const keys: string[] = [];
      for (const row of selected.data) {
        if (!row || typeof row.ip !== "string" || !/^[A-Za-z0-9:._@/+\-]{1,512}$/.test(row.ip) ||
          typeof row.reset_time !== "string" || !Number.isFinite(Date.parse(row.reset_time)) || Date.parse(row.reset_time) >= cutoffMs) {
          return incomplete("invalid_response");
        }
        keys.push(row.ip);
      }
      if (new Set(keys).size !== keys.length) return incomplete("invalid_response");
      if (!keys.length) break;
      operation = "deletion_failed";
      const removed = await wait(admin.from("rate_limits").delete({ count: "exact" })
        .in("ip", keys).lt("reset_time", cutoff).abortSignal(signal));
      if (removed.error) return incomplete(operation, removed.error);
      if (!Number.isInteger(removed.count) || removed.count === null || removed.count < 0 || removed.count > keys.length) return incomplete("invalid_response");
      deleted += removed.count;
      batches++;
    }
    operation = "verification_failed";
    const probe = await wait(admin.from("rate_limits").select("reset_time")
      .lt("reset_time", cutoff).limit(1).abortSignal(signal));
    if (probe.error) return incomplete(operation, probe.error);
    if (!Array.isArray(probe.data) || probe.data.length > 1 || probe.data.some(row =>
      typeof row?.reset_time !== "string" || !Number.isFinite(Date.parse(row.reset_time)) || Date.parse(row.reset_time) >= cutoffMs)) {
      return incomplete("invalid_response");
    }
    const remaining = probe.data.length > 0;
    const result: RateLimitCleanupResult = { status: remaining ? "partial" : "complete", code: remaining ? "backlog_remaining" : "complete", deleted, batches, remaining };
    if (remaining) console.error("[Rate limit retention]", result);
    else console.info("[Rate limit retention]", result);
    return result;
  } catch (error) {
    return incomplete(signal.aborted || Date.now() - started >= RATE_LIMIT_RETENTION.budgetMs ? "deadline_exceeded" : operation, error);
  } finally {
    clearTimeout(timer);
  }
}
