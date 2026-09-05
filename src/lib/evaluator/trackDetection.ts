import { JudgingTrackId } from "./evaluatorTypes";

export interface TrackDetectionResult {
  detectedTrack: JudgingTrackId;
  isConfident: boolean;
  sourceHint?: string;
  matchedToken?: string;
}

// Word-boundary regular expressions preventing accidental mid-word matching
// (e.g. "Chennai", "Kailash", "Jai", "Email", "Retail", "Html", "Xml" will NOT match)
const SIH_REGEX = /\b(sih|smart\s*india(\s*hackathon)?)\b/i;
const AI_GENAI_REGEX = /\b(ai|genai|ml|agentic|agents?|llm|llms|rag|gpt|nlp|deep\s*learning|machine\s*learning|data\s*science|neural)\b/i;
const WEB_DEV_REGEX = /\b(web|web3|fullstack|full-stack|frontend|backend|react|nextjs|devops|cloud|api|saas|mobile|android|ios|flutter)\b/i;

/**
 * Detects the judging track from raw text, hackathon names, tags, or descriptions
 * using strict word boundaries to avoid false positives on coincidental substrings.
 */
export function detectJudgingTrack(
  input: string | { name?: string | null; tag?: string | null; description?: string | null; track?: string | null }
): TrackDetectionResult {
  if (!input) {
    return {
      detectedTrack: "web_dev",
      isConfident: false,
      sourceHint: "No input provided",
    };
  }

  // If structured object has an explicit valid track already set
  if (typeof input === "object" && input.track) {
    const rawTrack = input.track.trim().toLowerCase();
    if (rawTrack === "sih") {
      return { detectedTrack: "sih", isConfident: true, sourceHint: "Explicit SIH track configured" };
    }
    if (rawTrack === "ai_genai" || rawTrack === "ai" || rawTrack === "genai") {
      return { detectedTrack: "ai_genai", isConfident: true, sourceHint: "Explicit AI/GenAI track configured" };
    }
    if (rawTrack === "web_dev" || rawTrack === "web") {
      return { detectedTrack: "web_dev", isConfident: true, sourceHint: "Explicit Web Dev track configured" };
    }
  }

  // Compile full text string to search
  const text = typeof input === "string"
    ? input
    : `${input.name || ""} ${input.tag || ""} ${input.description || ""}`.trim();

  if (!text) {
    return {
      detectedTrack: "web_dev",
      isConfident: false,
      sourceHint: "Empty text",
    };
  }

  // 1. Check SIH (highest specificity)
  const sihMatch = text.match(SIH_REGEX);
  if (sihMatch) {
    return {
      detectedTrack: "sih",
      isConfident: true,
      sourceHint: `Matched SIH token: "${sihMatch[0]}"`,
      matchedToken: sihMatch[0],
    };
  }

  // 2. Check AI / GenAI (word-boundary safe)
  const aiMatch = text.match(AI_GENAI_REGEX);
  if (aiMatch) {
    return {
      detectedTrack: "ai_genai",
      isConfident: true,
      sourceHint: `Matched AI/GenAI token: "${aiMatch[0]}"`,
      matchedToken: aiMatch[0],
    };
  }

  // 3. Check Web Dev
  const webMatch = text.match(WEB_DEV_REGEX);
  if (webMatch) {
    return {
      detectedTrack: "web_dev",
      isConfident: true,
      sourceHint: `Matched Web Dev token: "${webMatch[0]}"`,
      matchedToken: webMatch[0],
    };
  }

  // 4. No confident match — fallback to web_dev with isConfident: false (triggers loud UI notice)
  return {
    detectedTrack: "web_dev",
    isConfident: false,
    sourceHint: "No track keywords detected",
  };
}
