// AI Content Moderation for HackerMate Media using Google Gemini Vision (Fail-Closed Safety Policy)
import { callGeminiVision } from "@/lib/ai/geminiClient";

export async function moderateImageWithGemini(
  imageBuffer: Buffer,
  mimeType: string
): Promise<{ isSafe: boolean; reason?: string }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[Gemini Moderation] Missing GEMINI_API_KEY. Rejecting upload under fail-closed security policy.");
    return {
      isSafe: false,
      reason: "Media safety verification service is temporarily unavailable.",
    };
  }

  try {
    const prompt = `You are a strict safety and compliance moderation engine for HackerMate, a student developer and hackathon community platform.
Analyze the attached image strictly for safety violations.

Flags to check:
1. Adult / NSFW / Sexually Explicit / Nudity / Provocative imagery.
2. Violence, weapons, gore, blood, or graphic injuries.
3. Hate symbols, offensive/derogatory gestures, harassment, or vulgarity.
4. Illegal drugs, phishing screenshots, or malicious scams.

If the image contains ANY of the above violations, it MUST be marked as NOT safe.
If it is a normal profile photo, screenshot of code, UI design, project diagram, or everyday image, mark it as safe.

Respond STRICTLY with a single JSON object in this exact format (no markdown formatting, no backticks):
{"isSafe": true}
OR
{"isSafe": false, "reason": "Short user-friendly explanation of violation"}`;

    const { text } = await callGeminiVision(prompt, imageBuffer, mimeType, {
      temperature: 0.1,
      maxOutputTokens: 200,
      responseMimeType: "application/json",
      timeoutMs: 4500,
    });

    const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanText);

    if (parsed && typeof parsed.isSafe === "boolean") {
      return {
        isSafe: parsed.isSafe,
        reason: parsed.reason || (parsed.isSafe ? undefined : "Content violates community safety guidelines."),
      };
    }

    // Unparseable response under fail-closed policy
    console.warn("[Gemini Moderation] Unexpected AI moderation output structure:", text);
    return {
      isSafe: false,
      reason: "Media safety verification returned an unrecognized response. Please try again.",
    };
  } catch (error: any) {
    // Fail-closed: Never allow uninspected media through on timeout or API error
    console.error("[Gemini Moderation] Execution failure under fail-closed policy:", error?.message || error);
    return {
      isSafe: false,
      reason: "Media safety verification temporarily unavailable. Please retry in a moment.",
    };
  }
}

