import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { closedGenerationResponse } from "@/lib/evaluator/generationAdmission";
import { isIP } from "node:net";
import { reserveEvaluation } from "@/lib/evaluator/evaluatorBudgetGuard";
import { runTrackAwareEvaluation } from "@/lib/evaluator/trackEvaluatorEngine";
import { EvaluationFailure, evaluationFailure, readEvaluationJson, rubricFor, withinDeadline, assertExecution, logDatabaseFailure, verifiedEvaluationActor, type EvaluationExecution } from "@/lib/evaluator/evaluationContract";
import { TRACK_PROFILES, type EvaluationInput, type JudgingTrackId } from "@/lib/evaluator/evaluatorTypes";

export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientIp(req: NextRequest): string {
  const candidate = (req.headers.get("x-forwarded-for")?.split(",").at(-1) || req.headers.get("x-real-ip") || "").trim();
  // Trust only the platform-appended hop, never an arbitrary caller's first hop.
  // Missing/unusable proxy evidence shares a conservative anonymous bucket.
  return isIP(candidate) ? candidate : "unknown";
}

function inputFrom(body: Record<string, unknown>): EvaluationInput {
  const field = (name: string, max: number, required = false): string | undefined => {
    const value = body[name];
    if (value === undefined && !required) return undefined;
    if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new EvaluationFailure("invalid_input");
    return value.trim() || undefined;
  };
  const track = body.trackId ?? "generic";
  if (typeof track !== "string" || !Object.hasOwn(TRACK_PROFILES, track)) throw new EvaluationFailure("invalid_input");
  if (body.forceFallback === true) throw new EvaluationFailure("unsupported_mode");
  if (body.forceFallback !== undefined && body.forceFallback !== false) throw new EvaluationFailure("invalid_input");
  const input: EvaluationInput = { psTitle: field("psTitle", 200, true)!, solutionDescription: field("solutionDescription", 12_000, true)!,
    techStack: field("techStack", 2_000), architectureDetails: field("architectureDetails", 12_000), slidesText: field("slidesText", 30_000),
    customRubric: field("customRubric", 6_000), trackId: track as JudgingTrackId, isTextOnly: true,
    repoUrl: field("repoUrl", 2_048), demoUrl: field("demoUrl", 2_048), hackathonId: field("hackathonId", 64) };
  if (input.hackathonId && !UUID.test(input.hackathonId)) throw new EvaluationFailure("invalid_input");
  for (const link of [input.repoUrl, input.demoUrl]) if (link) {
    let url: URL; try { url = new URL(link); } catch { throw new EvaluationFailure("invalid_input"); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new EvaluationFailure("invalid_input");
  }
  rubricFor(input.trackId, input.customRubric);
  return input;
}

export async function POST(req: NextRequest) {
  const started = Date.now(), requestId = randomUUID();
  const closed = closedGenerationResponse(requestId);
  if (closed) return closed;
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(55_000)]);
  const execution: EvaluationExecution = { deadlineAt: started + 50_000, signal, attempts: 0, requestId };
  const preflight = { ...execution, deadlineAt: started + 5_000 };
  try {
    if (req.nextUrl.searchParams.get("engine") === "heuristic") throw new EvaluationFailure("unsupported_mode");
    const body = await readEvaluationJson(req, preflight);
    const input = inputFrom(body);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new EvaluationFailure("limiter_unavailable");
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (target, init) => fetch(target, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(5_000), ...(init?.signal ? [init.signal] : [])]) }) } });
    let verifiedId: string | null = null;
    const header = req.headers.get("authorization");
    if (header !== null) {
      verifiedId = await verifiedEvaluationActor(admin, req, preflight);
    }
    // body.userId never authorizes a quota exemption or privileged history write.
    await reserveEvaluation(admin, preflight, { pipeline: "idea", actor: verifiedId ? `user:${verifiedId}` : `anonymous:${clientIp(req)}`,
      anonymous: !verifiedId, idempotencyKey: req.headers.get("idempotency-key") || "" });
    execution.beforeProviderAttempt = preflight.beforeProviderAttempt;
    // Provider reservations use the remaining request budget, not the expired preflight budget.
    if (execution.beforeProviderAttempt) {
      preflight.deadlineAt = execution.deadlineAt;
    }
    assertExecution(execution, 1_000);
    const result = await runTrackAwareEvaluation(input, true, execution);
    let savedEvaluationId: string | null = null;
    let persistence: "saved" | "unavailable" | "not_requested" = verifiedId ? "unavailable" : "not_requested";
    if (verifiedId) {
      const saveBudget = { ...execution, deadlineAt: started + 55_000 };
      try {
        const saved = await withinDeadline(admin.from("user_pitch_evaluations").insert({ user_id: verifiedId, ps_title: input.psTitle,
          track_id: input.trackId, total_score: result.totalScore, grade: result.grade, used_ai_engine: true, sub_scores: result.subScores, evaluation_result: result })
          .select("id").abortSignal(signal).single(), saveBudget, 5_000);
        if (saved.error) logDatabaseFailure("save_idea_history", saved.error);
        else if (typeof saved.data?.id === "string" && UUID.test(saved.data.id)) { savedEvaluationId = saved.data.id; persistence = "saved"; }
        else logDatabaseFailure("invalid_idea_save_contract", null);
      } catch (error) { logDatabaseFailure("save_idea_history", error); }
    }
    return NextResponse.json({ success: true, result, mode: "text_only", savedEvaluationId, persistence, requestId,
      ...(persistence === "unavailable" ? { warning: "Evaluation succeeded, but its history save could not be confirmed. Check history before submitting again." } : {}) });
  } catch (error) {
    console.error("[Idea evaluation outcome]", { requestId, pipeline: "idea", attempts: execution.attempts, providerAttempts: execution.trace, latencyMs: Date.now() - started });
    const failure = evaluationFailure(error, requestId);
    return NextResponse.json(failure.body, { status: failure.status,
      ...(failure.body.retryAfterSeconds ? { headers: { "Retry-After": String(failure.body.retryAfterSeconds) } } : {}) });
  }
}
