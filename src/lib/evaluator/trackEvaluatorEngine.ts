import {
  EvaluationInput,
  ProjectEvaluationResult,
  TRACK_PROFILES,
  JudgingTrackId,
  RecommendedRoleGap,
} from "./evaluatorTypes";

/**
 * Main evaluation orchestrator: attempts Gemini AI with fallback to the Content-Aware Heuristic Engine.
 */
export async function runTrackAwareEvaluation(
  input: EvaluationInput,
  allowGeminiAi = true
): Promise<ProjectEvaluationResult> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  const trackId = input.trackId || "web_dev";
  const profile = TRACK_PROFILES[trackId] || TRACK_PROFILES.web_dev;

  let fallbackReason: ProjectEvaluationResult["fallbackReason"] = null;
  let fallbackDetails: string | null = null;

  if (!allowGeminiAi) {
    fallbackReason = "budget_exhausted";
  } else if (!geminiKey) {
    fallbackReason = "missing_api_key";
    console.warn("[Track Evaluator] Missing GEMINI_API_KEY or NEXT_PUBLIC_GEMINI_API_KEY in environment. Falling back to Heuristic Engine.");
  } else {
    try {
      const aiResult = await callGeminiForTrack(geminiKey, input, profile);
      return {
        ...aiResult,
        usedAiEngine: true,
        evaluationTimestamp: new Date().toISOString(),
        fallbackReason: null,
        fallbackDetails: null,
      };
    } catch (err: any) {
      fallbackReason = "gemini_api_error";
      fallbackDetails = err?.message || String(err);
      console.warn(`[Track Evaluator] Gemini AI call failed (${fallbackDetails}). Using Heuristic Fallback Engine.`);
    }
  }

  // Fallback to Content-Aware Deterministic Engine
  const fallbackResult = generateTrackHeuristicEvaluation(input);
  return {
    ...fallbackResult,
    usedAiEngine: false,
    evaluationTimestamp: new Date().toISOString(),
    fallbackReason,
    fallbackDetails,
  };
}

/**
 * Builds the track-specific Gemini prompt and parses the AI response.
 */
async function callGeminiForTrack(
  geminiKey: string,
  input: EvaluationInput,
  profile: any
): Promise<Omit<ProjectEvaluationResult, "usedAiEngine" | "evaluationTimestamp">> {
  const models = [
    "gemini-3-flash-preview",
    "gemini-3.5-flash",
    "gemini-flash-latest",
  ];
  const promptText = buildGeminiPromptForTrack(input, profile);

  let lastError: Error | null = null;

  for (const modelName of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;
      const aiRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.15,
            maxOutputTokens: 2000,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!aiRes.ok) {
        throw new Error(`Model ${modelName} returned HTTP ${aiRes.status}`);
      }

      const aiData = await aiRes.json();
      const rawJson = aiData.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawJson) {
        throw new Error(`Empty response from ${modelName}`);
      }

      // Robust JSON extraction matching first { to last }
      const cleanJson = rawJson.replace(/```json/gi, "").replace(/```/gi, "").trim();
      const firstBrace = cleanJson.indexOf("{");
      const lastBrace = cleanJson.lastIndexOf("}");
      const targetJsonStr = firstBrace !== -1 && lastBrace !== -1 ? cleanJson.slice(firstBrace, lastBrace + 1) : cleanJson;
      const parsed = JSON.parse(targetJsonStr);

      const sNovelty = clamp(parsed.scoreNovelty ?? 15, 0, profile.categories.novelty.maxPts);
      const sTech = clamp(parsed.scoreTech ?? 20, 0, profile.categories.tech.maxPts);
      const sUiUx = clamp(parsed.scoreUiUxOrFeasibility ?? 15, 0, profile.categories.uiUxOrFeasibility.maxPts);
      const sImpact = clamp(parsed.scoreImpactOrTeam ?? 10, 0, profile.categories.impactOrTeam.maxPts);
      const total = sNovelty + sTech + sUiUx + sImpact;

      let grade: ProjectEvaluationResult["grade"] = "Needs Iteration ⚠️";
      if (total >= 85) grade = "Top Tier / Nomination Ready 🏆";
      else if (total >= 70) grade = "Strong Contender ✅";
      else if (total < 40) grade = "High Risk / Incomplete 🚨";

      return {
        trackId: input.trackId,
        totalScore: total,
        grade,
        subScores: {
          novelty: sNovelty,
          tech: sTech,
          uiUxOrFeasibility: sUiUx,
          impactOrTeam: sImpact,
        },
        categoryLabels: {
          novelty: profile.categories.novelty.label,
          tech: profile.categories.tech.label,
          uiUxOrFeasibility: profile.categories.uiUxOrFeasibility.label,
          impactOrTeam: profile.categories.impactOrTeam.label,
        },
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 4) : ["Clear initial concept."],
        redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.slice(0, 4) : ["Further technical depth needed."],
        architectureSuggestions: Array.isArray(parsed.architectureSuggestions)
          ? parsed.architectureSuggestions.slice(0, 4)
          : ["Add comprehensive data flow architecture."],
        recommendedRoles: formatRecommendedRoles(parsed.recommendedRoles, input.trackId),
      };
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error("All Gemini cascade models failed.");
}

/**
 * Builds the specialized prompt depending on whether the track is Web Dev, AI/GenAI, or SIH.
 */
function buildGeminiPromptForTrack(input: EvaluationInput, profile: any): string {
  const combinedText = `
PROJECT TITLE: ${input.psTitle}
PROBLEM STATEMENT & AUDIENCE: ${input.solutionDescription}
TECH STACK: ${input.techStack || "Not provided"}
ARCHITECTURE & WORKFLOW DETAILS: ${input.architectureDetails || "Not provided"}
SLIDES / EXTRA NOTES:
${(input.slidesText || "").slice(0, 4000)}
  `.trim();

  let trackSpecificGuidance = "";

  if (input.trackId === "web_dev") {
    trackSpecificGuidance = `
You are a Senior Full-Stack Engineering Judge and Technical Lead at a premier national hackathon.
Evaluate this Web Development / Full-Stack project strictly on:
1. Novelty & Differentiation (0-25 pts): Is this an original product with real user utility or an uninspired clone?
2. Full-Stack & DB Architecture (0-35 pts): Scrutinize frontend framework (React/Next.js/Vue), backend APIs (REST/GraphQL/tRPC), database schema (Postgres/Supabase/Prisma/MongoDB), and indexing. Deduct heavily if no database schema or backend logic is described.
3. UI/UX, State & Performance (0-25 pts): Responsive layout, state management, client vs server components, caching (Redis/CDN), and error handling.
4. Execution Moat & Scalability (0-15 pts): Authentication security, rate limiting, and production data integrity.
    `;
  } else if (input.trackId === "ai_genai") {
    trackSpecificGuidance = `
You are a Senior AI Researcher and GenAI Grand Jury Judge at a top-tier tech hackathon.
Evaluate this AI / GenAI / Agentic system strictly on:
1. AI Novelty & True Moat (0-25 pts): Is this an actual intelligent system or just a superficial wrapper around ChatGPT/Gemini? Deduct 8-12 points if it is a generic wrapper without custom retrieval or pipeline moat.
2. Model Pipeline & Vector Architecture (0-35 pts): RAG architecture (chunking, embeddings, vector database like pgvector/Pinecone/Chroma), fine-tuning, agent orchestration loops (LangChain/LlamaIndex/CrewAI), and data ingestion.
3. Hallucination Control & Latency (0-25 pts): Guardrails, prompt safety, inference latency optimization, context window management, and fallback strategies.
4. Unit Economics & Accuracy (0-15 pts): Realistic API cost budgeting, ground truth evaluation metrics, and error mitigation.
    `;
  } else {
    // SIH Mode
    trackSpecificGuidance = `
You are a Senior Smart India Hackathon (SIH) National Grand Jury Chair.
Evaluate this pitch strictly on the official SIH criteria:
1. Problem Novelty & Alignment (0-25 pts): Clear alignment with government/social problem statement and innovative approach.
2. Technical Architecture & Feasibility (0-35 pts): Feasible 36-hour execution architecture, hardware/software component pipeline, and telemetry flow.
3. UI/UX, Impact & Research (0-25 pts): Quantified social/economic baseline metrics and IEEE/dataset research citations.
4. Team Squad Balance & Rules (0-15 pts): Realistic team balance, slide brevity, and execution feasibility.
    `;
  }

  return `
${trackSpecificGuidance}

CRITICAL SCORING RULE:
Do NOT penalize or deduct points for the absence of GitHub repository links or live demo URLs. Judge the proposal strictly and exclusively on the conceptual novelty, technical architecture, schema & pipeline depth, error-handling feasibility, and domain stack relevance described in the submission text.

SCORING INSTRUCTION:
Grade realistically. Sparse or 1-line submissions MUST receive scores below 30. Superficial submissions without architecture MUST score between 35 and 55. High scores (75+) require concrete architecture, data flow, and tech stack justifications.

SUBMISSION DETAILS:
${combinedText}

Return ONLY a valid JSON object matching this schema:
{
  "scoreNovelty": number (0 to ${profile.categories.novelty.maxPts}),
  "scoreTech": number (0 to ${profile.categories.tech.maxPts}),
  "scoreUiUxOrFeasibility": number (0 to ${profile.categories.uiUxOrFeasibility.maxPts}),
  "scoreImpactOrTeam": number (0 to ${profile.categories.impactOrTeam.maxPts}),
  "strengths": ["string", "string"],
  "redFlags": ["string", "string"],
  "architectureSuggestions": ["string", "string"],
  "recommendedRoles": [
    { "role": "string", "reason": "string", "suggestedSkills": ["string", "string"] }
  ]
}
  `.trim();
}

/**
 * Deterministic Content-Aware Heuristic Engine.
 * Analyzes word count, architectural completeness, technical keywords, and pipeline clarity.
 * Guarantees: Strong (>75) > Weak (35-55) > Sparse (<30).
 */
export function generateTrackHeuristicEvaluation(input: EvaluationInput): Omit<ProjectEvaluationResult, "usedAiEngine" | "evaluationTimestamp"> {
  const trackId = input.trackId || "web_dev";
  const profile = TRACK_PROFILES[trackId] || TRACK_PROFILES.web_dev;

  const rawText = [
    input.psTitle,
    input.solutionDescription,
    input.techStack || "",
    input.architectureDetails || "",
    input.slidesText || "",
  ].join(" ").toLowerCase();

  const words = rawText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // 1. Technical Keyword Dictionaries
  const webKeywords = ["react", "next", "vue", "angular", "tailwind", "typescript", "postgres", "supabase", "prisma", "mongodb", "redis", "api", "rest", "graphql", "ssr", "jwt", "auth", "docker", "deploy", "vercel", "schema"];
  const aiKeywords = ["rag", "embedding", "vector", "pinecone", "chroma", "pgvector", "langchain", "llamaindex", "agent", "prompt", "fine-tuning", "transformer", "pytorch", "huggingface", "hallucination", "inference", "guardrail", "llm"];
  const generalTechKeywords = ["database", "backend", "frontend", "server", "architecture", "pipeline", "client", "service", "cache", "queue", "security", "latency", "prototype", "github", "testing"];

  const trackKeywords = trackId === "ai_genai" ? aiKeywords : webKeywords;
  const matchedTrackKeywords = trackKeywords.filter((kw) => rawText.includes(kw)).length;
  const matchedGeneralKeywords = generalTechKeywords.filter((kw) => rawText.includes(kw)).length;

  let scoreNovelty = 0;
  let scoreTech = 0;
  let scoreUiUxOrFeasibility = 0;
  let scoreImpactOrTeam = 0;

  const strengths: string[] = [];
  const redFlags: string[] = [];
  const architectureSuggestions: string[] = [];

  // ── A. SPARSE SUBMISSION TIER (wordCount < 25 or virtually no tech keywords) ──
  if (wordCount < 25 || (matchedTrackKeywords === 0 && matchedGeneralKeywords === 0)) {
    scoreNovelty = Math.min(8, Math.max(3, Math.round(wordCount * 0.3)));
    scoreTech = Math.min(10, Math.max(4, Math.round(wordCount * 0.4)));
    scoreUiUxOrFeasibility = Math.min(7, Math.max(3, Math.round(wordCount * 0.3)));
    scoreImpactOrTeam = Math.min(4, Math.max(2, Math.round(wordCount * 0.15)));

    redFlags.push("Submission text is too sparse to evaluate technical feasibility.");
    redFlags.push("Missing core database, architecture, and framework details.");
    redFlags.push("No data flow or component integration described.");
    architectureSuggestions.push("Document your end-to-end data pipeline from client request to database storage.");
    architectureSuggestions.push("Specify exact frameworks, state management tools, and deployment target.");
  }
  // ── B. WEAK / SUPERFICIAL TIER (wordCount 25-75 or moderate keywords without deep architecture) ──
  else if (wordCount < 80 || (matchedTrackKeywords < 3 && !input.architectureDetails)) {
    scoreNovelty = clamp(11 + Math.round(matchedTrackKeywords * 1.5), 10, 16);
    scoreTech = clamp(14 + Math.round(matchedGeneralKeywords * 1.8), 14, 22);
    scoreUiUxOrFeasibility = clamp(11, 9, 15);
    scoreImpactOrTeam = clamp(7, 5, 10);

    strengths.push("Identified a clear general problem statement.");
    if (matchedTrackKeywords > 0) {
      strengths.push(`Selected relevant tools: ${trackKeywords.filter((k) => rawText.includes(k)).slice(0, 3).join(", ")}.`);
    }

    redFlags.push("High-level tech stack mentioned, but internal data pipeline flow is missing.");
    redFlags.push("Potential generic wrapper risk: needs a clearer proprietary technical moat.");

    architectureSuggestions.push("Detail your database schema relationships, caching strategy, and indexing.");
    architectureSuggestions.push("Add concrete error-handling, latency mitigation, and offline state strategies.");
  }
  // ── C. STRONG / COMPREHENSIVE TIER (wordCount >= 80, high keyword density & detailed architecture) ──
  else {
    const depthBonus = Math.min(5, Math.floor(wordCount / 60));
    const kwBonus = Math.min(6, matchedTrackKeywords * 1.2);

    scoreNovelty = clamp(19 + Math.round(kwBonus * 0.8), 19, 24);
    scoreTech = clamp(28 + depthBonus, 28, 34);
    scoreUiUxOrFeasibility = clamp(20, 18, 24);
    scoreImpactOrTeam = clamp(12, 11, 14);

    strengths.push("Well-articulated technical architecture with clear component separation.");
    strengths.push(`Strong domain stack choices (${trackKeywords.filter((k) => rawText.includes(k)).slice(0, 4).join(", ")}).`);

    if (matchedGeneralKeywords < 4) redFlags.push("Add more detail on caching and latency optimization.");

    architectureSuggestions.push("Consider adding automated end-to-end integration tests and load testing benchmarks.");
    architectureSuggestions.push("Document rate limiting, API token caching, and edge-function acceleration.");
  }

  const totalScore = scoreNovelty + scoreTech + scoreUiUxOrFeasibility + scoreImpactOrTeam;

  let grade: ProjectEvaluationResult["grade"] = "Needs Iteration ⚠️";
  if (totalScore >= 80) grade = "Top Tier / Nomination Ready 🏆";
  else if (totalScore >= 65) grade = "Strong Contender ✅";
  else if (totalScore < 35) grade = "High Risk / Incomplete 🚨";

  return {
    trackId,
    totalScore,
    grade,
    subScores: {
      novelty: scoreNovelty,
      tech: scoreTech,
      uiUxOrFeasibility: scoreUiUxOrFeasibility,
      impactOrTeam: scoreImpactOrTeam,
    },
    categoryLabels: {
      novelty: profile.categories.novelty.label,
      tech: profile.categories.tech.label,
      uiUxOrFeasibility: profile.categories.uiUxOrFeasibility.label,
      impactOrTeam: profile.categories.impactOrTeam.label,
    },
    strengths: strengths.length > 0 ? strengths : ["Initial idea concept submitted."],
    redFlags: redFlags.length > 0 ? redFlags : ["Review production edge cases."],
    architectureSuggestions: architectureSuggestions.length > 0 ? architectureSuggestions : ["Expand system architecture details."],
    recommendedRoles: formatRecommendedRoles([], trackId),
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

function formatRecommendedRoles(rawRoles: any, trackId: JudgingTrackId): RecommendedRoleGap[] {
  if (Array.isArray(rawRoles) && rawRoles.length > 0) {
    return rawRoles.map((r) => ({
      role: r.role || "Full-Stack Developer",
      reason: r.reason || "To build and scale the core system architecture.",
      suggestedSkills: Array.isArray(r.suggestedSkills) ? r.suggestedSkills : ["TypeScript", "Next.js"],
    }));
  }

  if (trackId === "ai_genai") {
    return [
      {
        role: "AI / Vector Data Engineer",
        reason: "To build the embedding pipeline, chunking logic, and RAG retrieval accuracy.",
        suggestedSkills: ["Python", "FastAPI", "Pinecone / pgvector", "LangChain"],
      },
      {
        role: "Frontend AI Integrator",
        reason: "To create streaming chat UI, markdown rendering, and interactive feedback loops.",
        suggestedSkills: ["Next.js", "Tailwind CSS", "Vercel AI SDK", "TypeScript"],
      },
    ];
  }

  if (trackId === "sih") {
    return [
      {
        role: "Full-Stack Lead Builder",
        reason: "To develop the end-to-end 36-hour working prototype for jury demonstrations.",
        suggestedSkills: ["Next.js", "Supabase", "REST APIs", "Tailwind CSS"],
      },
      {
        role: "UI/UX & Research Lead",
        reason: "To polish the presentation deck, design system flowcharts, and quantify social impact.",
        suggestedSkills: ["Figma", "UI Design", "Research & Data Analysis"],
      },
    ];
  }

  return [
    {
      role: "Backend & Database Architect",
      reason: "To implement scalable API endpoints, database schema relations, and indexing.",
      suggestedSkills: ["PostgreSQL", "Prisma / Supabase", "Node.js", "Redis"],
    },
    {
      role: "Frontend UI/UX Specialist",
      reason: "To craft responsive, accessible user interfaces with dynamic client state management.",
      suggestedSkills: ["React", "Next.js", "Tailwind CSS", "TypeScript"],
    },
  ];
}
