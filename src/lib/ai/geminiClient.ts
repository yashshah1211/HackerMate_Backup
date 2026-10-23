/**
 * Centralized Gemini AI Gateway for HackerMate.
 * 
 * Evaluator text requests use pinned models and a shared two-attempt budget.
 * Provider entitlement, free quota and latency are not inferred from model names.
 * The separate image moderation cascade retains its existing behavior.
 */

import { PRESENTATION_LIMITS, type DocumentFailure } from "../ppt/analysisMetadata";
import { EvaluationFailure, assertExecution, object, withinDeadline, type EvaluationExecution } from "../evaluator/evaluationContract";

export interface GeminiCallOptions {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: "application/json" | "text/plain";
  perModelTimeoutMs?: number;
  totalTimeoutMs?: number;
  timeoutMs?: number; // Backward compatibility alias
  maxAttempts?: number;
  responseJsonSchema?: Record<string, unknown>;
  execution?: EvaluationExecution;
}

export interface GeminiCallResult {
  text: string;
  modelUsed: string;
  modelVersion?: string;
  latencyMs: number;
  totalCascadeTimeMs?: number;
}

export const GEMINI_CASCADE_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
] as const;

export const GEMINI_VISION_CASCADE_MODELS = [
  "gemini-3.6-flash",
  "gemini-flash-lite-latest",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
] as const;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Missing GEMINI_API_KEY in environment configuration.");
  }
  return key;
}

/**
 * Extracts and sanitizes clean JSON from model output, stripping code fences and preambles.
 */
export function extractJsonFromResponse(rawText: string): string {
  if (!rawText) return "{}";
  const unescaped = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  const firstBrace = unescaped.indexOf("{");
  const lastBrace = unescaped.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    return unescaped.slice(firstBrace, lastBrace + 1);
  }
  return unescaped;
}

/** Text evaluation: pinned primary/secondary, at most two network attempts per execution. */
export async function callGeminiText(prompt: string, options: GeminiCallOptions = {}): Promise<GeminiCallResult> {
  return callEvaluatorContent(prompt, options);
}

async function callEvaluatorContent(prompt: string, options: GeminiCallOptions, pdfBuffer?: Buffer): Promise<GeminiCallResult> {
  if (!process.env.GEMINI_API_KEY) throw new EvaluationFailure("provider_unavailable");
  const started = Date.now();
  const execution: EvaluationExecution = options.execution || { deadlineAt: started + 30_000, attempts: 0 };
  execution.trace ??= [];
  execution.providerDeadlineAt ??= Math.min(execution.deadlineAt, started + 30_000);
  const deadlineAt = Math.min(execution.deadlineAt, execution.providerDeadlineAt, started + (options.totalTimeoutMs ?? 30_000));
  const models = pdfBuffer ? ["gemini-3.5-flash-lite"] as const : GEMINI_CASCADE_MODELS;
  const maximum = Math.min(models.length, 2 - execution.attempts, options.maxAttempts ?? (pdfBuffer ? 1 : 2));
  let last: EvaluationFailure = new EvaluationFailure("provider_unavailable");
  for (let index = 0; index < maximum; index++) {
    const budget: EvaluationExecution = { ...execution, deadlineAt };
    assertExecution(budget, 500);
    if (execution.attempts > 0) await withinDeadline(new Promise(resolve => setTimeout(resolve, 250 + Math.floor(Math.random() * 251))), budget, 500);
    if (execution.beforeProviderAttempt) await withinDeadline(execution.beforeProviderAttempt(deadlineAt), budget, deadlineAt - Date.now());
    assertExecution(budget, 500);
    const model = models[index];
    const attemptStarted = Date.now();
    const attemptDeadline = Math.min(deadlineAt, attemptStarted + (options.perModelTimeoutMs ?? options.timeoutMs ?? (pdfBuffer ? 20_000 : 15_000)));
    const timeout = AbortSignal.timeout(Math.max(1, attemptDeadline - attemptStarted));
    const signal = execution.signal ? AbortSignal.any([execution.signal, timeout]) : timeout;
    const attemptBudget = { ...budget, deadlineAt: attemptDeadline, signal };
    execution.attempts++;
    try {
      const response = await withinDeadline(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": getApiKey() }, signal,
        body: JSON.stringify({ contents: [{ parts: [...(pdfBuffer ? [{ inlineData: { mimeType: "application/pdf", data: pdfBuffer.toString("base64") } }] : []), { text: prompt }] }], generationConfig: {
          temperature: options.temperature ?? 0.15, maxOutputTokens: options.maxOutputTokens ?? (pdfBuffer ? 6500 : 4000),
          responseMimeType: options.responseMimeType ?? "application/json",
          ...(options.responseJsonSchema ? { responseJsonSchema: options.responseJsonSchema } : {}),
        } }),
      }), attemptBudget, attemptDeadline - Date.now());
      if (!response.ok) {
        // No raw error bodies in logs/persistence. Unknown/daily/spend 429s stop.
        void response.body?.cancel().catch(() => {});
        execution.trace.push({ model, httpStatus: response.status, code: "http_error", latencyMs: Date.now() - attemptStarted });
        console.error("[Gemini evaluator]", { requestId: execution.requestId, model, status: response.status, attempt: execution.attempts, latencyMs: Date.now() - attemptStarted });
        if (response.status === 429 || [400, 401, 402, 403, 404].includes(response.status)) throw new EvaluationFailure("provider_rejected");
        if (response.status < 500 || response.status > 599) throw new EvaluationFailure("provider_rejected");
        last = new EvaluationFailure("provider_unavailable");
        continue;
      }
      const data = await readEvaluatorProviderJson(response, attemptBudget);
      const candidates = data.candidates;
      if (data.promptFeedback && object(data.promptFeedback).blockReason) throw new EvaluationFailure("blocked_content");
      if (!Array.isArray(candidates) || candidates.length !== 1) throw new EvaluationFailure("invalid_ai_output");
      const candidate = object(candidates[0]);
      if (["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"].includes(String(candidate.finishReason))) throw new EvaluationFailure("blocked_content");
      if (candidate.finishReason !== "STOP") throw new EvaluationFailure("invalid_ai_output");
      const content = object(candidate.content);
      if (!Array.isArray(content.parts)) throw new EvaluationFailure("invalid_ai_output");
      const parts = content.parts.map(object).filter(part => part.thought !== true);
      if (!parts.length || parts.some(part => typeof part.text !== "string")) throw new EvaluationFailure("invalid_ai_output");
      const text = parts.map(part => part.text).join("");
      if (!text.trim()) throw new EvaluationFailure("invalid_ai_output");
      assertExecution(budget);
      const modelVersion = typeof data.modelVersion === "string" && /^gemini-3\.(?:6-flash|5-flash-lite)(?:-\d{3})?$/.test(data.modelVersion) ? data.modelVersion : undefined;
      execution.trace.push({ model, code: "success", latencyMs: Date.now() - attemptStarted });
      return { text, modelUsed: model, modelVersion, latencyMs: Date.now() - attemptStarted, totalCascadeTimeMs: Date.now() - started };
    } catch (error) {
      if (execution.signal?.aborted || Date.now() >= deadlineAt) throw new EvaluationFailure("deadline_exceeded");
      if (error instanceof EvaluationFailure && error.code !== "deadline_exceeded") throw error;
      // Only transport/timeouts or explicitly handled 5xx may use the second attempt.
      last = new EvaluationFailure("provider_unavailable");
      execution.trace.push({ model, code: timeout.aborted ? "attempt_timeout" : "network_error", latencyMs: Date.now() - attemptStarted });
      console.error("[Gemini evaluator]", { requestId: execution.requestId, model, code: timeout.aborted ? "attempt_timeout" : "network_error", attempt: execution.attempts, latencyMs: Date.now() - attemptStarted });
    }
  }
  throw last;
}

async function readEvaluatorProviderJson(response: Response, budget: EvaluationExecution): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new EvaluationFailure("invalid_ai_output");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const next = await withinDeadline(reader.read(), budget, budget.deadlineAt - Date.now());
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 524_288) throw new EvaluationFailure("invalid_ai_output");
      chunks.push(next.value);
    }
    try { return object(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
    catch { throw new EvaluationFailure("invalid_ai_output"); }
  } catch (error) { void reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}

/**
 * Executes a multimodal vision request across the auto-updating alias cascade with global time cap.
 */
export async function callGeminiVision(
  prompt: string,
  imageBuffer: Buffer,
  mimeType: string,
  options: GeminiCallOptions = {}
): Promise<GeminiCallResult> {
  const apiKey = getApiKey();
  const cascadeStartTime = Date.now();

  const {
    temperature = 0.1,
    maxOutputTokens = 500,
    responseMimeType = "application/json",
    perModelTimeoutMs = options.timeoutMs ?? 7000,
    totalTimeoutMs = 18000,
  } = options;

  const base64Data = imageBuffer.toString("base64");
  let lastError: Error | null = null;

  for (const model of GEMINI_VISION_CASCADE_MODELS) {
    const elapsedSoFar = Date.now() - cascadeStartTime;
    const remainingTotalMs = totalTimeoutMs - elapsedSoFar;

    if (remainingTotalMs < 2000) {
      console.warn(`[Gemini Gateway Vision] Total cascade timeout cap reached (${elapsedSoFar}ms elapsed / ${totalTimeoutMs}ms cap). Halting cascade.`);
      break;
    }

    const currentModelTimeout = Math.min(perModelTimeoutMs, remainingTotalMs);
    const modelStartTime = Date.now();

    try {
      console.log(`[Gemini Gateway Vision] Attempting model: ${model} (timeout: ${currentModelTimeout}ms)...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(currentModelTimeout),
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: mimeType || "image/webp",
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature,
            maxOutputTokens,
            ...(responseMimeType ? { responseMimeType } : {}),
          },
        }),
      });

      const modelLatencyMs = Date.now() - modelStartTime;

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[Gemini Gateway Vision] Model ${model} returned HTTP ${res.status} in ${modelLatencyMs}ms: ${errText.slice(0, 150)}`);
        lastError = new Error(`Gemini Vision ${model} HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        console.warn(`[Gemini Gateway Vision] Model ${model} returned empty content in ${modelLatencyMs}ms.`);
        lastError = new Error(`Empty vision response from ${model}`);
        continue;
      }

      const totalCascadeTimeMs = Date.now() - cascadeStartTime;
      const resolvedVersion = data?.modelVersion || model;
      console.log(`[Gemini Gateway Vision] Success with ${model} (resolved to ${resolvedVersion}) in ${modelLatencyMs}ms (total cascade: ${totalCascadeTimeMs}ms).`);

      return {
        text: rawText,
        modelUsed: model,
        modelVersion: resolvedVersion,
        latencyMs: modelLatencyMs,
        totalCascadeTimeMs,
      };
    } catch (err: unknown) {
      const modelLatencyMs = Date.now() - modelStartTime;
      const failure = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Gemini Gateway Vision] Model ${model} failed after ${modelLatencyMs}ms: ${failure.message}`);
      lastError = failure;
    }
  }

  throw lastError || new Error(`All Gemini Vision cascade models failed or total cascade budget (${totalTimeoutMs}ms) exhausted.`);
}


export class DocumentAnalysisError extends Error {
  constructor(public readonly failure: DocumentFailure) {
    super(`Document analysis: ${failure.code}`);
    this.name = "DocumentAnalysisError";
  }
}

/** One pinned native-PDF attempt; the caller may spend only the remaining shared attempt on eligible text degradation. */
export async function callGeminiDocument(prompt: string, pdfBuffer: Buffer, options: GeminiCallOptions = {}): Promise<GeminiCallResult> {
  if (!pdfBuffer.length || pdfBuffer.length > PRESENTATION_LIMITS.pdfBytes || pdfBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new EvaluationFailure("invalid_input");
  }
  return callEvaluatorContent(prompt, { ...options, maxAttempts: Math.min(1, options.maxAttempts ?? 1) }, pdfBuffer);
}
