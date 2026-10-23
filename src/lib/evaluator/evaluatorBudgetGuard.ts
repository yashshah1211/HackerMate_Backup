import type { SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { EvaluationFailure, assertExecution, withinDeadline, logDatabaseFailure, type EvaluationExecution } from "./evaluationContract";

export const GEMINI_GLOBAL_DAILY_LIMIT = 100;
export const ANONYMOUS_IP_DAILY_LIMIT = 2;
export const LOGGED_IN_USER_DAILY_LIMIT = 10;

function digest(value: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new EvaluationFailure("limiter_unavailable");
  return createHmac("sha256", secret).update(`evaluator-v1:${value}`).digest("hex");
}
function utcWindow() {
  const now = Date.now(), date = new Date(now);
  return { day: date.toISOString().slice(0, 10), seconds: Math.max(1, Math.ceil((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) - now) / 1000)) };
}
function querySignal(execution: EvaluationExecution): AbortSignal {
  const timeout = AbortSignal.timeout(Math.max(1, Math.min(5_000, execution.deadlineAt - Date.now())));
  return execution.signal ? AbortSignal.any([execution.signal, timeout]) : timeout;
}

/** Existing deployed atomic RPC; no process-local or racy counter fallback.
 * Keys are pseudonymous, privacy-relevant and covered by retention PR #60.
 * Partial reservations are conservatively consumed; no refund or replay claim.
 */
async function reserve(admin: SupabaseClient, execution: EvaluationExecution, key: string, limit: number, seconds: number, denial: "admission_limit" | "budget_exhausted" | "duplicate_request" | "cooldown") {
  assertExecution(execution, 100);
  const signal = querySignal(execution);
  let result;
  try {
    result = await withinDeadline(admin.rpc("check_rate_limit", { p_ip: key, p_limit: limit, p_window_interval: `${seconds} seconds` }).abortSignal(signal), execution, 5_000);
  } catch (error) {
    logDatabaseFailure("reserve_evaluation", error);
    if (execution.signal?.aborted || Date.now() >= execution.deadlineAt) throw new EvaluationFailure("deadline_exceeded");
    throw new EvaluationFailure("limiter_unavailable");
  }
  if (result.error) { logDatabaseFailure("reserve_evaluation", result.error); throw new EvaluationFailure("limiter_unavailable"); }
  const row = Array.isArray(result.data) && result.data.length === 1 ? result.data[0] : null;
  if (!row || typeof row.allowed !== "boolean" || !Number.isInteger(row.remaining) || row.remaining < 0 || row.remaining >= limit ||
    typeof row.reset_time !== "string" || !Number.isFinite(Date.parse(row.reset_time)) || Date.parse(row.reset_time) <= Date.now() || (!row.allowed && row.remaining !== 0)) {
    logDatabaseFailure("invalid_reservation_contract", null); throw new EvaluationFailure("limiter_unavailable");
  }
  if (!row.allowed) throw new EvaluationFailure(denial, Math.max(1, Math.ceil((Date.parse(row.reset_time) - Date.now()) / 1000)));
}

export interface EvaluationAdmission {
  pipeline: "idea" | "ppt" | "challenge";
  actor: string;
  anonymous?: boolean;
  idempotencyKey: string;
  target?: string;
}

export async function reserveEvaluation(admin: SupabaseClient, execution: EvaluationExecution, input: EvaluationAdmission): Promise<void> {
  assertExecution(execution, 100);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey)) throw new EvaluationFailure("invalid_input");
  const actor = digest(input.actor);
  const prefix = `eval:v1:${input.pipeline}`;
  const target = input.target ? digest(input.target) : actor;
  const tokenKey = `${prefix}:${actor}:idem:${digest(input.idempotencyKey)}`;
  // Exact-key read avoids charging a second actor allowance for a known retry.
  // The atomic reservation below still arbitrates races after a missing read.
  try {
    const token = await withinDeadline(admin.from("rate_limits").select("reset_time").eq("ip", tokenKey)
      .abortSignal(querySignal(execution)).maybeSingle(), execution, 5_000);
    if (token.error) { logDatabaseFailure("read_evaluation_token", token.error); throw new EvaluationFailure("limiter_unavailable"); }
    if (token.data) {
      if (typeof token.data.reset_time !== "string" || !Number.isFinite(Date.parse(token.data.reset_time))) throw new EvaluationFailure("limiter_unavailable");
      if (Date.parse(token.data.reset_time) > Date.now()) throw new EvaluationFailure("duplicate_request");
    }
  } catch (error) {
    if (error instanceof EvaluationFailure) throw error;
    logDatabaseFailure("read_evaluation_token", error); throw new EvaluationFailure("limiter_unavailable");
  }
  // Gate distinct tokens on fixed-cardinality actor/target slots and allowance.
  // Rejected token spraying must not create a new persisted key per request.
  await reserve(admin, execution, `${prefix}:${actor}:active`, 1, 75, "cooldown");
  if (input.pipeline !== "idea") await reserve(admin, execution, `${prefix}:${target}:target-active`, 1, 75, "cooldown");
  if (input.pipeline === "idea") {
    const window = utcWindow();
    await reserve(admin, execution, `${prefix}:${actor}:daily:${window.day}`, input.anonymous ? ANONYMOUS_IP_DAILY_LIMIT : LOGGED_IN_USER_DAILY_LIMIT, window.seconds, "admission_limit");
    let tokenReserved = false;
    execution.beforeProviderAttempt = async (providerDeadlineAt = execution.deadlineAt) => {
      const attemptBudget = { ...execution, deadlineAt: Math.min(execution.deadlineAt, providerDeadlineAt) };
      const attemptWindow = utcWindow();
      await reserve(admin, attemptBudget, `eval:v1:idea:global:${attemptWindow.day}`, GEMINI_GLOBAL_DAILY_LIMIT, attemptWindow.seconds, "budget_exhausted");
      if (!tokenReserved) {
        await reserve(admin, attemptBudget, tokenKey, 1, 86_400, "duplicate_request");
        tokenReserved = true;
      }
    };
  } else {
    await reserve(admin, execution, `${prefix}:${input.pipeline === "ppt" ? target : digest(`${input.actor}:${input.target}`)}:attempts`, input.pipeline === "ppt" ? 15 : 5, 86_400, "admission_limit");
    await reserve(admin, execution, tokenKey, 1, 86_400, "duplicate_request");
  }
}
