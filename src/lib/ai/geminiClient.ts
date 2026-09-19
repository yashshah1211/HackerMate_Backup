/**
 * Centralized Gemini AI Gateway for HackerMate.
 * 
 * Implements a high-accuracy, resilient model cascade:
 * 1. gemini-3.6-flash (Primary Production Workhorse: 1,500 RPD free tier quota, ~2s latency, LTS stability)
 * 2. gemini-flash-lite-latest (Secondary High-Concurrency: 1,500 RPD free tier quota, ~1-2s latency)
 * 3. gemini-3.7-flash (Opportunistic Flagship: 20 RPD free tier preview cap; unlimited on paid)
 * 4. gemini-3.8-flash (Opportunistic Flagship: 20 RPD free tier preview cap; unlimited on paid)
 * 5. gemini-flash-latest (Google's dynamic auto-updating flagship alias)
 * 6. gemini-3.5-flash (Final emergency safety net)
 * 
 * Enforces both a per-model timeout AND a global cascade timeout cap so multiple
 * fallbacks never exceed Vercel function limits (e.g. 60s maxDuration).
 */

export interface GeminiCallOptions {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: "application/json" | "text/plain";
  perModelTimeoutMs?: number;
  totalTimeoutMs?: number;
  timeoutMs?: number; // Backward compatibility alias
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
  "gemini-flash-lite-latest",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash",
] as const;

export const GEMINI_VISION_CASCADE_MODELS = [
  "gemini-3.6-flash",
  "gemini-flash-lite-latest",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
] as const;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
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

/**
 * Executes a text generation request across the auto-updating alias cascade with global time cap.
 */
export async function callGeminiText(
  prompt: string,
  options: GeminiCallOptions = {}
): Promise<GeminiCallResult> {
  const apiKey = getApiKey();
  const cascadeStartTime = Date.now();

  const {
    temperature = 0.15,
    maxOutputTokens = 4000,
    responseMimeType,
    perModelTimeoutMs = options.timeoutMs ?? 10000, // 10s default per model
    totalTimeoutMs = 25000, // 25s absolute cap across entire cascade (fits within Vercel 60s maxDuration)
  } = options;

  let lastError: Error | null = null;

  for (const model of GEMINI_CASCADE_MODELS) {
    const elapsedSoFar = Date.now() - cascadeStartTime;
    const remainingTotalMs = totalTimeoutMs - elapsedSoFar;

    // If remaining total cascade budget is too low (< 2.5s), abort cascade early to avoid Vercel timeouts
    if (remainingTotalMs < 2500) {
      console.warn(
        `[Gemini Gateway] Total cascade timeout cap reached (${elapsedSoFar}ms elapsed / ${totalTimeoutMs}ms cap). Halting cascade.`
      );
      break;
    }

    const currentModelTimeout = Math.min(perModelTimeoutMs, remainingTotalMs);
    const modelStartTime = Date.now();

    try {
      console.log(`[Gemini Gateway] Attempting model: ${model} (timeout: ${currentModelTimeout}ms, remaining budget: ${remainingTotalMs}ms)...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(currentModelTimeout),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
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
        console.warn(`[Gemini Gateway] Model ${model} returned HTTP ${res.status} in ${modelLatencyMs}ms: ${errText.slice(0, 150)}`);
        lastError = new Error(`Gemini ${model} HTTP ${res.status}: ${errText.slice(0, 120)}`);
        continue;
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        console.warn(`[Gemini Gateway] Model ${model} returned empty candidates array in ${modelLatencyMs}ms.`);
        lastError = new Error(`Empty response from ${model}`);
        continue;
      }

      const totalCascadeTimeMs = Date.now() - cascadeStartTime;
      const resolvedVersion = data?.modelVersion || model;
      console.log(`[Gemini Gateway] Success with ${model} (resolved to ${resolvedVersion}) in ${modelLatencyMs}ms (total cascade: ${totalCascadeTimeMs}ms).`);

      return {
        text: rawText,
        modelUsed: model,
        modelVersion: resolvedVersion,
        latencyMs: modelLatencyMs,
        totalCascadeTimeMs,
      };
    } catch (err: any) {
      const modelLatencyMs = Date.now() - modelStartTime;
      console.warn(`[Gemini Gateway] Model ${model} failed after ${modelLatencyMs}ms: ${err?.message || err}`);
      lastError = err;
    }
  }

  throw lastError || new Error(`All Gemini cascade models failed or total cascade budget (${totalTimeoutMs}ms) exhausted.`);
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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    } catch (err: any) {
      const modelLatencyMs = Date.now() - modelStartTime;
      console.warn(`[Gemini Gateway Vision] Model ${model} failed after ${modelLatencyMs}ms: ${err?.message || err}`);
      lastError = err;
    }
  }

  throw lastError || new Error(`All Gemini Vision cascade models failed or total cascade budget (${totalTimeoutMs}ms) exhausted.`);
}

