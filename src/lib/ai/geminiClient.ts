/**
 * Centralized Gemini AI Gateway for HackerMate.
 * 
 * Implements a resilient auto-updating alias cascade:
 * 1. gemini-flash-latest (Google's auto-updating flagship Flash alias, currently gemini-3.8-flash)
 * 2. gemini-flash-lite-latest (Google's auto-updating lightweight alias, currently gemini-3.5-flash-lite)
 * 3. gemini-3.6-flash (Stable version explicitly recommended in Google's migration notice)
 * 4. gemini-3.5-flash (Final safety net fallback)
 */

export interface GeminiCallOptions {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: "application/json" | "text/plain";
  timeoutMs?: number;
}

export interface GeminiCallResult {
  text: string;
  modelUsed: string;
  modelVersion?: string;
  latencyMs: number;
}

export const GEMINI_CASCADE_MODELS = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
] as const;

export const GEMINI_VISION_CASCADE_MODELS = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.6-flash",
] as const;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!key) {
    throw new Error("Missing GEMINI_API_KEY in environment configuration.");
  }
  return key;
}

/**
 * Executes a text generation request across the auto-updating alias cascade.
 */
export async function callGeminiText(
  prompt: string,
  options: GeminiCallOptions = {}
): Promise<GeminiCallResult> {
  const apiKey = getApiKey();
  const {
    temperature = 0.15,
    maxOutputTokens = 2500,
    responseMimeType,
    timeoutMs = 8000,
  } = options;

  let lastError: Error | null = null;

  for (const model of GEMINI_CASCADE_MODELS) {
    const startTime = Date.now();
    try {
      console.log(`[Gemini Gateway] Attempting model: ${model}...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens,
            ...(responseMimeType ? { responseMimeType } : {}),
          },
        }),
      });

      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[Gemini Gateway] Model ${model} returned HTTP ${res.status} in ${latencyMs}ms: ${errText.slice(0, 150)}`);
        lastError = new Error(`Gemini ${model} HTTP ${res.status}: ${errText.slice(0, 120)}`);
        continue;
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        console.warn(`[Gemini Gateway] Model ${model} returned empty candidates array in ${latencyMs}ms.`);
        lastError = new Error(`Empty response from ${model}`);
        continue;
      }

      const resolvedVersion = data?.modelVersion || model;
      console.log(`[Gemini Gateway] Success with ${model} (resolved to ${resolvedVersion}) in ${latencyMs}ms.`);

      return {
        text: rawText,
        modelUsed: model,
        modelVersion: resolvedVersion,
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      console.warn(`[Gemini Gateway] Model ${model} failed after ${latencyMs}ms: ${err?.message || err}`);
      lastError = err;
    }
  }

  throw lastError || new Error("All Gemini cascade models failed.");
}

/**
 * Executes a multimodal vision request across the auto-updating alias cascade.
 */
export async function callGeminiVision(
  prompt: string,
  imageBuffer: Buffer,
  mimeType: string,
  options: GeminiCallOptions = {}
): Promise<GeminiCallResult> {
  const apiKey = getApiKey();
  const {
    temperature = 0.1,
    maxOutputTokens = 300,
    responseMimeType = "application/json",
    timeoutMs = 5000,
  } = options;

  const base64Data = imageBuffer.toString("base64");
  let lastError: Error | null = null;

  for (const model of GEMINI_VISION_CASCADE_MODELS) {
    const startTime = Date.now();
    try {
      console.log(`[Gemini Gateway Vision] Attempting model: ${model}...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
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

      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[Gemini Gateway Vision] Model ${model} returned HTTP ${res.status} in ${latencyMs}ms: ${errText.slice(0, 150)}`);
        lastError = new Error(`Gemini Vision ${model} HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        console.warn(`[Gemini Gateway Vision] Model ${model} returned empty content in ${latencyMs}ms.`);
        lastError = new Error(`Empty vision response from ${model}`);
        continue;
      }

      const resolvedVersion = data?.modelVersion || model;
      console.log(`[Gemini Gateway Vision] Success with ${model} (resolved to ${resolvedVersion}) in ${latencyMs}ms.`);

      return {
        text: rawText,
        modelUsed: model,
        modelVersion: resolvedVersion,
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      console.warn(`[Gemini Gateway Vision] Model ${model} failed after ${latencyMs}ms: ${err?.message || err}`);
      lastError = err;
    }
  }

  throw lastError || new Error("All Gemini Vision cascade models failed.");
}
