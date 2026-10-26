import "server-only";
import { EvaluationFailure } from "./evaluationContract";

/** Read at invocation time. Only this exact server setting authorizes generation. */
export function assertGenerationEnabled(): void {
  if (process.env.EVALUATOR_GENERATION_ENABLED !== "true") throw new EvaluationFailure("generation_closed");
}

/** Called before reading a request or constructing any evaluator dependencies. */
export function closedGenerationResponse(requestId: string): Response | null {
  if (process.env.EVALUATOR_GENERATION_ENABLED === "true") return null;
  const failure = new EvaluationFailure("generation_closed");
  return Response.json({ success: false, result: null, code: failure.code, retryable: false, error: failure.message, requestId },
    { status: 503, headers: { "Cache-Control": "no-store" } });
}

/** Diagnostic version identifiers only; persisted copies never prove provenance. */
export function evaluationRevision(pipeline: "idea" | "ppt" | "challenge") {
  return { prompt: `${pipeline}-prompt-r2-2026-10-25`, rubric: `${pipeline}-v1`, source: "mission05-r2", sourceBase: "df9ac950f67444832e3a221ebb66b1b11576b884" };
}
