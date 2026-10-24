import { TRACK_PROFILES, type JudgingTrackId, type TrackProfile } from "./evaluatorTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

const FAILURES = {
  invalid_input: [400, false, "Check the submission fields and limits, then submit again."],
  unsupported_mode: [400, false, "Heuristic scoring is retired for new evaluations. Please use AI evaluation."],
  rubric_unsupported: [400, false, "Custom judging requires four named criteria, each worth 25 points, in the supported JSON format."],
  unauthorized: [401, false, "Your session could not be verified. Sign in again before submitting."],
  forbidden: [403, false, "You do not have permission to evaluate this submission."],
  not_found: [404, false, "The requested evaluation target was not found."],
  duplicate_request: [409, false, "This submission token was already used. Check your history before starting another evaluation."],
  cooldown: [409, true, "Evaluation admission is cooling down. Wait briefly before an explicit new submission."],
  persistence_uncertain: [409, false, "The save outcome is uncertain. Check evaluation history before submitting again."],
  processing_interrupted: [409, false, "Earlier processing was interrupted or could not be reconciled. Review history before an explicit new submission."],
  unusable_text: [422, false, "No usable presentation text was available. Supply a text-readable document."],
  blocked_content: [422, false, "The provider could not evaluate this content. No score was generated."],
  admission_limit: [429, false, "Your evaluation allowance has been reserved. Try again after the limit resets."],
  budget_exhausted: [429, false, "The shared Idea provider-attempt allowance is exhausted. No score was generated."],
  invalid_ai_output: [502, false, "The AI response did not meet the evaluation contract. No score was generated."],
  auth_unavailable: [503, true, "Identity verification is unavailable. No evaluation was started."],
  limiter_unavailable: [503, true, "Evaluation admission is unavailable. No score was generated."],
  database_unavailable: [503, true, "Evaluation records could not be verified. Check history before submitting again."],
  provider_unavailable: [503, true, "AI evaluation is temporarily unavailable. No score was generated."],
  provider_rejected: [503, false, "The provider rejected this evaluation request. No score was generated."],
  deadline_exceeded: [504, true, "The evaluation time budget ended. Check history before retrying an uncertain submission."],
} as const;

export type EvaluationCode = keyof typeof FAILURES;
export class EvaluationFailure extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(public readonly code: EvaluationCode, public readonly retryAfterSeconds?: number) {
    super(FAILURES[code][2]);
    this.name = "EvaluationFailure";
    this.status = FAILURES[code][0];
    this.retryable = FAILURES[code][1];
  }
}

export function evaluationFailure(error: unknown, requestId: string) {
  const failure = error instanceof EvaluationFailure ? error : new EvaluationFailure("provider_unavailable");
  console.error("[Evaluation]", { requestId, code: failure.code, status: failure.status });
  return { status: failure.status, body: { success: false, result: null, error: failure.message, code: failure.code,
    retryable: failure.retryable, requestId,
    ...(failure.retryAfterSeconds ? { retryAfterSeconds: failure.retryAfterSeconds } : {}) } };
}

export interface EvaluationExecution {
  deadlineAt: number;
  requestId?: string;
  signal?: AbortSignal;
  attempts: number;
  providerDeadlineAt?: number;
  trace?: Array<{ model: string; latencyMs: number; code: string; httpStatus?: number }>;
  beforeProviderAttempt?: (deadlineAt?: number) => Promise<void>;
}

export function assertExecution(execution: EvaluationExecution, reserveMs = 0) {
  if (execution.signal?.aborted || Date.now() + reserveMs >= execution.deadlineAt) throw new EvaluationFailure("deadline_exceeded");
}

export async function withinDeadline<T>(operation: PromiseLike<T>, execution: EvaluationExecution, maximumMs: number): Promise<T> {
  assertExecution(execution);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const stop = new Promise<never>((_, reject) => {
    onAbort = () => reject(new EvaluationFailure("deadline_exceeded"));
    timer = setTimeout(onAbort, Math.max(1, Math.min(maximumMs, execution.deadlineAt - Date.now())));
    execution.signal?.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([operation, stop]); }
  finally { if (timer) clearTimeout(timer); if (onAbort) execution.signal?.removeEventListener("abort", onAbort); }
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EvaluationFailure("invalid_ai_output");
  return value as Record<string, unknown>;
}

export function boundedString(value: unknown, max = 800): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new EvaluationFailure("invalid_ai_output");
  return value.trim();
}

export function score(value: unknown, cap: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > cap) throw new EvaluationFailure("invalid_ai_output");
  return value;
}

export function stringList(value: unknown, maxItems = 6): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new EvaluationFailure("invalid_ai_output");
  return value.map(v => boundedString(v, 160));
}

export interface GroundedFeedback { text: string; quote: string }
export function groundedList(value: unknown, source: string, allowEmpty = true): GroundedFeedback[] {
  if (!Array.isArray(value) || value.length > 6 || (!allowEmpty && !value.length)) throw new EvaluationFailure("invalid_ai_output");
  return value.map(item => {
    const record = object(item);
    const text = boundedString(record.text);
    const quote = boundedString(record.quote, 400);
    if (!source.includes(quote)) throw new EvaluationFailure("invalid_ai_output");
    return { text, quote };
  });
}

export interface AnchoredFeedback { text: string; quote?: string; pageNumber?: number; evidence?: string }
export function anchoredList(value: unknown, source: string, pageCount?: number, allowEmpty = true): AnchoredFeedback[] {
  if (!Array.isArray(value) || value.length > 6 || (!allowEmpty && !value.length)) throw new EvaluationFailure("invalid_ai_output");
  return value.map(item => {
    const entry = object(item);
    const text = boundedString(entry.text);
    if (pageCount !== undefined) {
      const pageNumber = score(entry.pageNumber, pageCount);
      if (pageNumber < 1) throw new EvaluationFailure("invalid_ai_output");
      return { text, pageNumber, evidence: boundedString(entry.evidence, 400) };
    }
    const quote = boundedString(entry.quote, 400);
    if (!source.includes(quote)) throw new EvaluationFailure("invalid_ai_output");
    return { text, quote };
  });
}

export function feedbackItemSchema(pageCount?: number) {
  return { type: "object", additionalProperties: false, properties: { text: { type: "string", maxLength: 800 },
    ...(pageCount === undefined ? { quote: { type: "string", maxLength: 400 } } : {
      pageNumber: { type: "integer", minimum: 1, maximum: pageCount }, evidence: { type: "string", maxLength: 400 },
    }),
  }, required: pageCount === undefined ? ["text", "quote"] : ["text", "pageNumber", "evidence"] };
}

export function rubricFor(track: JudgingTrackId, customRubric?: string): TrackProfile {
  const profile = TRACK_PROFILES[track];
  if (!profile) throw new EvaluationFailure("invalid_input");
  if (track !== "specific") return profile;
  try {
    const parsed = object(JSON.parse(customRubric || ""));
    if (Object.keys(parsed).length !== 1 || !Object.hasOwn(parsed, "criteria")) throw Error();
    if (!Array.isArray(parsed.criteria) || parsed.criteria.length !== 4) throw Error();
    const criteria = parsed.criteria.map(value => {
      const criterion = object(value);
      if (Object.keys(criterion).some(key => key !== "label" && key !== "maxPoints")) throw Error();
      if (criterion.maxPoints !== 25) throw Error();
      return boundedString(criterion.label, 100);
    });
    if (new Set(criteria).size !== 4) throw Error();
    return { ...profile, categories: {
      novelty: { label: criteria[0], maxPts: 25 }, tech: { label: criteria[1], maxPts: 25 },
      uiUxOrFeasibility: { label: criteria[2], maxPts: 25 }, impactOrTeam: { label: criteria[3], maxPts: 25 },
    } };
  } catch { throw new EvaluationFailure("rubric_unsupported"); }
}

export function logDatabaseFailure(operation: string, error: unknown) {
  const raw = error && typeof error === "object" && "code" in error ? error.code : null;
  const safeCodes = ["42501", "57014", "23505", "42703", "08006", "PGRST116", "PGRST204", "PGRST000", "PGRST001", "PGRST002"];
  console.error("[Evaluation database]", { operation, code: typeof raw === "string" && safeCodes.includes(raw) ? raw : "unclassified" });
}

/** Bound multipart input before the platform buffers and parses it. */
export async function readEvaluationForm(request: Request, execution: EvaluationExecution, maxBytes = 8 * 1024 * 1024 + 16_384): Promise<FormData> {
  const reader = request.body?.getReader();
  if (!reader || !request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new EvaluationFailure("invalid_input");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await withinDeadline(reader.read(), execution, 5_000);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) throw new EvaluationFailure("invalid_input");
      parts.push(next.value);
    }
    return await withinDeadline(new Response(Buffer.concat(parts), { headers: { "content-type": request.headers.get("content-type")! } }).formData(), execution, 5_000);
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof EvaluationFailure) throw error;
    throw new EvaluationFailure("invalid_input");
  } finally { reader.releaseLock(); }
}

export function inputString(value: unknown, max: number, fallback?: string): string {
  if (value == null && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new EvaluationFailure("invalid_input");
  return value.trim();
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function evaluationSignal(execution: EvaluationExecution): AbortSignal {
  const timeout = AbortSignal.timeout(Math.max(1, Math.min(5_000, execution.deadlineAt - Date.now())));
  return execution.signal ? AbortSignal.any([execution.signal, timeout]) : timeout;
}

export async function verifiedEvaluationActor(admin: SupabaseClient, request: Request, execution: EvaluationExecution): Promise<string> {
  const header = request.headers.get("authorization");
  if (!header || !/^Bearer [^\s]+$/.test(header)) throw new EvaluationFailure("unauthorized");
  let auth;
  try { auth = await withinDeadline(admin.auth.getUser(header.slice(7)), execution, 5_000); }
  catch (error) {
    logDatabaseFailure("verify_evaluation_identity", error);
    assertExecution(execution);
    if (error instanceof EvaluationFailure) throw error;
    throw new EvaluationFailure("auth_unavailable");
  }
  assertExecution(execution);
  if (auth.error) {
    logDatabaseFailure("verify_evaluation_identity", auth.error);
    throw new EvaluationFailure([400, 401, 403].includes(auth.error.status ?? 0) ? "unauthorized" : "auth_unavailable");
  }
  if (!isUuid(auth.data?.user?.id)) throw new EvaluationFailure("unauthorized");
  // Auth identity alone does not enforce the application's suspension flag.
  // Query the protected current profile before admission or privileged writes.
  const profileSignal = evaluationSignal(execution);
  let profile;
  try {
    profile = await evaluationRead(admin.from("profiles").select("id, is_banned")
      .eq("id", auth.data.user.id).abortSignal(profileSignal).maybeSingle(), execution, "verify_evaluation_profile");
  } catch (error) {
    if (profileSignal.aborted) throw new EvaluationFailure("deadline_exceeded");
    assertExecution(execution);
    if (error instanceof EvaluationFailure) throw error;
    logDatabaseFailure("verify_evaluation_profile", error);
    throw new EvaluationFailure("database_unavailable");
  }
  assertExecution(execution);
  if (!profile || Array.isArray(profile) || profile.id !== auth.data.user.id || profile.is_banned !== false) {
    throw new EvaluationFailure("forbidden");
  }
  return auth.data.user.id;
}

export async function evaluationRead<T>(operation: PromiseLike<{ data: T; error: unknown }>, execution: EvaluationExecution, name: string): Promise<T> {
  try {
    const result = await withinDeadline(operation, execution, 5_000);
    if (result.error) { logDatabaseFailure(name, result.error); throw new EvaluationFailure("database_unavailable"); }
    return result.data;
  } catch (error) {
    if (error instanceof EvaluationFailure) throw error;
    logDatabaseFailure(name, error); throw new EvaluationFailure("database_unavailable");
  }
}

/** Stream input before JSON parsing; Content-Length alone cannot enforce a bound. */
export async function readEvaluationJson(request: Request, execution: EvaluationExecution): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new EvaluationFailure("invalid_input");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await withinDeadline(reader.read(), execution, 5_000);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 65_536) throw new EvaluationFailure("invalid_input");
      parts.push(next.value);
    }
    const parsed: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error();
    return parsed as Record<string, unknown>;
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof EvaluationFailure) throw error;
    throw new EvaluationFailure("invalid_input");
  } finally { reader.releaseLock(); }
}
