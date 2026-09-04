export interface ChallengeScoreDeductions {
  problem: string;
  solution: string;
  architecture: string;
  feasibilityImpact: string;
}

export interface ChallengeSlideFeedback {
  slide1: string;
  slide2: string;
  slide3: string;
  slide4: string;
  slide5: string;
  slide6: string;
}

export interface ChallengeEvaluationResult {
  scoreProblem: number; // 0-25
  scoreSolution: number; // 0-25
  scoreArchitecture: number; // 0-30
  scoreFeasibilityImpact: number; // 0-20
  totalScore: number; // 0-100
  grade: "Mastery 🏆" | "Strong Contender 🚀" | "Developing 💡" | "Needs Revision 🛠️" | string;
  strengths: string[];
  growthAreas: string[];
  formatViolations: string[];
  slideFeedback: ChallengeSlideFeedback;
  scoreDeductions: ChallengeScoreDeductions;
  topActionItem: string;
  usedAiFallback: boolean;
}

export async function runChallengePitchEvaluation(
  challengeTitle: string,
  challengeTrack: string,
  problemStatementText: string,
  slideText: string,
  metadata?: {
    submissionMode?: "solo" | "team";
    participantNames?: string[];
    teamName?: string;
    githubUrl?: string | null;
    demoUrl?: string | null;
    additionalRules?: string | null;
  }
): Promise<ChallengeEvaluationResult> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (geminiKey) {
    try {
      const aiResult = await callChallengeGeminiWithCascade(
        geminiKey,
        challengeTitle,
        challengeTrack,
        problemStatementText,
        slideText,
        metadata
      );
      return {
        ...aiResult,
        usedAiFallback: false,
      };
    } catch (err: any) {
      console.warn("[Challenge Evaluator] Cascade models failed, using heuristic fallback:", err.message);
    }
  }

  // Fallback to Content-Aware Heuristic Engine
  console.log("[Challenge Evaluator] Running Content-Aware Heuristic Fallback Engine.");
  const fallbackResult = generateChallengeHeuristicEvaluation(
    challengeTitle,
    challengeTrack,
    slideText,
    metadata
  );

  return {
    ...fallbackResult,
    usedAiFallback: true,
  };
}

/**
 * Cascading Gemini API caller with production-pinned model hierarchy.
 */
async function callChallengeGeminiWithCascade(
  geminiKey: string,
  challengeTitle: string,
  challengeTrack: string,
  problemStatementText: string,
  slideText: string,
  metadata: any
) {
  const promptText = `You are an elite Senior Hackathon Jury Evaluator and Principal System Architect.
Evaluate this practice pitch presentation submission for the challenge: "${challengeTitle}" (Track: ${challengeTrack}).

CHALLENGE PROBLEM STATEMENT:
${problemStatementText.slice(0, 1500)}
${metadata?.additionalRules ? `\nADDITIONAL CHALLENGE-SPECIFIC RULES & CONSTRAINTS (Set by Admin):\n${metadata.additionalRules}\n` : ""}
SUBMISSION METADATA:
- Mode: ${metadata?.submissionMode === "team" ? "Team Submission" : "Solo Builder"}
- Participant/Team: ${metadata?.teamName || metadata?.participantNames?.join(", ") || "Builder"}
- GitHub Code Repository: ${metadata?.githubUrl || "Not provided"}
- Prototype Live Demo: ${metadata?.demoUrl || "Not provided"}

MANDATORY 6-SLIDE FORMAT BLUEPRINT:
1. Slide 1: Problem Framing, Market Opportunity & Target Personas (20 pts)
2. Slide 2: Proposed Solution, Value Proposition & Innovation/Moat (20 pts)
3. Slide 3: Technical Architecture, Tech Stack & Data Ingestion Pipeline (25 pts)
4. Slide 4: Feasibility, Edge Cases & Technical Risk Mitigation (15 pts)
5. Slide 5: Quantified Impact Baseline Metrics & Beneficiary ROI (10 pts)
6. Slide 6: Execution Roadmap, Sprint Milestones & Team Roles (10 pts)

EXTRACTED PRESENTATION SLIDE TEXT:
---
${slideText.slice(0, 7500)}
---

EVALUATION CRITERIA & SCORING RUBRIC (Max 100 Pts Total):
1. Problem Framing & Opportunity (0 to 25 pts):
   - Deduct 5-8 pts if the problem statement is generic, lacks target personas, or has no quantified pain points.
2. Solution Design & Innovation (0 to 25 pts):
   - Deduct 5-8 pts if the solution is a superficial wrapper around an API without a clear competitive moat.
3. Technical Architecture & Data Flow (0 to 30 pts):
   - Deduct 7-12 pts if the stack is just a list of buzzwords without an end-to-end data pipeline (ingestion -> processing -> storage -> client).
   - Reward inclusion of architecture flowcharts, schema design, and latency/offline considerations.
4. Feasibility, Edge Cases & Roadmap (0 to 20 pts):
   - Deduct 4-7 pts if edge cases, fail-safes, or rate limit handling are ignored in Slide 4.
   - Deduct 3-5 pts if impact metrics lack baseline comparison figures or if Slide 6 roadmap milestones are missing.

CRITICAL INSTRUCTION:
Return ONLY a valid raw JSON object (no markdown, no backticks, no wrapping) matching this exact schema:
{
  "scoreProblem": number (0 to 25 integer),
  "scoreSolution": number (0 to 25 integer),
  "scoreArchitecture": number (0 to 30 integer),
  "scoreFeasibilityImpact": number (0 to 20 integer),
  "totalScore": number (exact sum of the 4 category scores, 0 to 100),
  "grade": "Mastery 🏆" | "Strong Contender 🚀" | "Developing 💡" | "Needs Revision 🛠️",
  "formatViolations": ["string"],
  "strengths": ["string", "string", "string"],
  "growthAreas": ["string", "string", "string"],
  "slideFeedback": {
    "slide1": "Actionable feedback for Slide 1 (Problem & Personas)...",
    "slide2": "Actionable feedback for Slide 2 (Solution & Moat)...",
    "slide3": "Actionable feedback for Slide 3 (Technical Architecture)...",
    "slide4": "Actionable feedback for Slide 4 (Feasibility & Risks)...",
    "slide5": "Actionable feedback for Slide 5 (Impact & Metrics)...",
    "slide6": "Actionable feedback for Slide 6 (Roadmap & Team Roles)..."
  },
  "scoreDeductions": {
    "problem": "Clear reason why points were lost in Problem Framing",
    "solution": "Clear reason why points were lost in Solution Design",
    "architecture": "Clear reason why points were lost in Technical Architecture",
    "feasibilityImpact": "Clear reason why points were lost in Feasibility, Impact & Roadmap"
  },
  "topActionItem": "The #1 highest priority change to make before resubmitting."
}`;

  const modelsToTry = [
    "gemini-3.7-flash",
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
  ];

  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`[Challenge Evaluator] Trying Gemini model: ${modelName}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 18000);

      const aiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.15 },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!aiRes.ok) {
        console.warn(`[Challenge Evaluator] Model ${modelName} returned HTTP ${aiRes.status}`);
        lastError = new Error(`Gemini API HTTP ${aiRes.status} (${modelName})`);
        continue;
      }

      const aiData = await aiRes.json();
      let rawJsonText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJsonText) {
        continue;
      }

      rawJsonText = rawJsonText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(rawJsonText);

      let rawProblem = parsed.scoreProblem ?? 18;
      let rawSolution = parsed.scoreSolution ?? 18;
      let rawArchitecture = parsed.scoreArchitecture ?? 20;
      let rawFeasibilityImpact = parsed.scoreFeasibilityImpact ?? 14;

      // Handle 0-10 normalized scale edge case if returned
      if (rawProblem <= 10 && rawSolution <= 10 && rawArchitecture <= 10 && rawFeasibilityImpact <= 10) {
        rawProblem = Math.round((rawProblem / 10) * 25);
        rawSolution = Math.round((rawSolution / 10) * 25);
        rawArchitecture = Math.round((rawArchitecture / 10) * 30);
        rawFeasibilityImpact = Math.round((rawFeasibilityImpact / 10) * 20);
      }

      const scoreProblem = Math.min(25, Math.max(0, rawProblem));
      const scoreSolution = Math.min(25, Math.max(0, rawSolution));
      const scoreArchitecture = Math.min(30, Math.max(0, rawArchitecture));
      const scoreFeasibilityImpact = Math.min(20, Math.max(0, rawFeasibilityImpact));
      const totalScore = scoreProblem + scoreSolution + scoreArchitecture + scoreFeasibilityImpact;

      return {
        scoreProblem,
        scoreSolution,
        scoreArchitecture,
        scoreFeasibilityImpact,
        totalScore,
        grade: parsed.grade || computeChallengeGrade(totalScore),
        strengths: Array.isArray(parsed.strengths) && parsed.strengths.length > 0 ? parsed.strengths : ["Well-structured 6-slide system presentation"],
        growthAreas: Array.isArray(parsed.growthAreas) && parsed.growthAreas.length > 0 ? parsed.growthAreas : ["Include concrete baseline metrics and milestones"],
        formatViolations: Array.isArray(parsed.formatViolations) ? parsed.formatViolations : [],
        slideFeedback: {
          slide1: parsed.slideFeedback?.slide1 || "Ensure problem scope and user personas are clearly defined.",
          slide2: parsed.slideFeedback?.slide2 || "Highlight your unique technical moat compared to existing market solutions.",
          slide3: parsed.slideFeedback?.slide3 || "Detail the end-to-end data flow and infrastructure pipeline.",
          slide4: parsed.slideFeedback?.slide4 || "Address potential latency, offline fallback, and security edge cases.",
          slide5: parsed.slideFeedback?.slide5 || "Provide quantified baseline metrics and target outcomes.",
          slide6: parsed.slideFeedback?.slide6 || "Outline execution milestones and builder responsibilities.",
        },
        scoreDeductions: {
          problem: parsed.scoreDeductions?.problem || `Deducted ${25 - scoreProblem} pts in Problem Framing.`,
          solution: parsed.scoreDeductions?.solution || `Deducted ${25 - scoreSolution} pts in Solution Innovation.`,
          architecture: parsed.scoreDeductions?.architecture || `Deducted ${30 - scoreArchitecture} pts in Technical Architecture.`,
          feasibilityImpact: parsed.scoreDeductions?.feasibilityImpact || `Deducted ${20 - scoreFeasibilityImpact} pts in Feasibility & Roadmap.`,
        },
        topActionItem: parsed.topActionItem || "Refine the technical data pipeline diagram and add quantified baseline metrics.",
      };
    } catch (err: any) {
      console.warn(`[Challenge Evaluator] Model ${modelName} call exception:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error("All Gemini AI model attempts failed");
}

/**
 * Deterministic Content-Aware Heuristic Scoring Engine
 */
export function generateChallengeHeuristicEvaluation(
  challengeTitle: string,
  challengeTrack: string,
  slideText: string = "",
  metadata?: any
): ChallengeEvaluationResult {
  const lowerText = slideText.toLowerCase();
  const words = slideText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // 1. Technology Domains
  const databases = ["postgres", "postgresql", "supabase", "mongodb", "redis", "mysql", "sqlite", "dynamodb", "firebase", "neo4j", "vector"];
  const cloudPlatforms = ["aws", "gcp", "azure", "vercel", "docker", "kubernetes", "k8s", "serverless", "lambda", "cloudflare", "edge"];
  const frameworks = ["react", "next", "vue", "angular", "node", "express", "fastapi", "flask", "django", "spring", "nestjs", "tailwind"];
  const mlAi = ["pytorch", "tensorflow", "scikit-learn", "huggingface", "llm", "gemini", "openai", "rag", "embeddings", "vision", "opencv"];
  const protocols = ["rest", "api", "websocket", "grpc", "mqtt", "graphql", "microservice", "webhook"];

  const foundDb = databases.filter(k => lowerText.includes(k));
  const foundCloud = cloudPlatforms.filter(k => lowerText.includes(k));
  const foundFramework = frameworks.filter(k => lowerText.includes(k));
  const foundMl = mlAi.filter(k => lowerText.includes(k));
  const foundProtocol = protocols.filter(k => lowerText.includes(k));

  const techDomainCount = [
    foundDb.length > 0,
    foundCloud.length > 0,
    foundFramework.length > 0,
    foundMl.length > 0,
    foundProtocol.length > 0,
  ].filter(Boolean).length;

  // 2. Structural & Metric checks
  const hasDataFlowPipeline = /->|-->|=>|pipeline|architecture|data flow|flowchart|ingests|streams|queues/i.test(slideText);
  const hasRiskMitigation = /mitigation|technical risk|fail-safe|fallback|latency|offline|security|rate limit/i.test(slideText);
  const hasBullets = /[•\-\*]\s|\d+\.\s/.test(slideText);
  const hasPercent = /%\s|percent|reduction|increase|\d+%/i.test(slideText);
  const hasCost = /₹|\$|cost|roi|budget|inr|usd/i.test(slideText);
  const hasTimeMetrics = /min|sec|hour|ms\b|latency|speed|fps/i.test(slideText);
  const quantitativeScore = (hasPercent ? 1 : 0) + (hasCost ? 1 : 0) + (hasTimeMetrics ? 1 : 0);
  const hasRoadmap = /roadmap|milestone|sprint|phase|timeline|mvp|deliverables|roles/i.test(slideText);

  // 3. Rubric Scoring
  // Problem & Opportunity (0-25)
  let scoreProblem = 8;
  if (wordCount > 30) scoreProblem += 4;
  if (wordCount > 100) scoreProblem += 4;
  if (/persona|user|stakeholder|hospital|patient|customer|market/i.test(slideText)) scoreProblem += 5;
  if (quantitativeScore >= 1) scoreProblem += 4;
  scoreProblem = Math.min(25, Math.max(5, scoreProblem));

  // Solution & Innovation (0-25)
  let scoreSolution = 8;
  if (wordCount > 40) scoreSolution += 4;
  if (/moat|uniqueness|novelty|competitive advantage|differentiator|approach/i.test(slideText)) scoreSolution += 7;
  if (metadata?.githubUrl || metadata?.demoUrl) scoreSolution += 4;
  scoreSolution = Math.min(25, Math.max(5, scoreSolution));

  // Technical Architecture (0-30)
  let scoreArchitecture = 8;
  if (techDomainCount >= 2) scoreArchitecture += 7;
  if (hasDataFlowPipeline) scoreArchitecture += 8;
  if (foundMl.length > 0 || foundProtocol.length > 0) scoreArchitecture += 4;
  if (hasBullets) scoreArchitecture += 3;
  scoreArchitecture = Math.min(30, Math.max(6, scoreArchitecture));

  // Feasibility & Roadmap (0-20)
  let scoreFeasibilityImpact = 5;
  if (hasRiskMitigation) scoreFeasibilityImpact += 5;
  if (quantitativeScore >= 2) scoreFeasibilityImpact += 4;
  if (hasRoadmap) scoreFeasibilityImpact += 6;
  scoreFeasibilityImpact = Math.min(20, Math.max(4, scoreFeasibilityImpact));

  const totalScore = scoreProblem + scoreSolution + scoreArchitecture + scoreFeasibilityImpact;
  const grade = computeChallengeGrade(totalScore);

  const strengths: string[] = [`Challenge submission registered for ${challengeTitle} (${challengeTrack}).`];
  if (hasDataFlowPipeline || techDomainCount > 0) strengths.push("Technical stack components and data flow defined.");
  if (quantitativeScore > 0) strengths.push("Quantified baseline metrics and performance figures included.");
  if (hasRoadmap) strengths.push("Execution roadmap and milestone rollout documented.");
  if (metadata?.githubUrl) strengths.push("Working GitHub repository linked.");

  const growthAreas: string[] = [];
  if (!hasDataFlowPipeline) growthAreas.push("Include a clear block architecture and data pipeline diagram in Slide 3.");
  if (!hasRiskMitigation) growthAreas.push("Address system fail-safes, rate limits, and latency bottlenecks in Slide 4.");
  if (quantitativeScore === 0) growthAreas.push("Add quantitative baseline metrics (%, time saved, throughput) in Slide 5.");
  if (!hasRoadmap) growthAreas.push("Document a clear phased roadmap with deliverables in Slide 6.");

  const slideFeedback: ChallengeSlideFeedback = {
    slide1: "Slide 1: Ensure the problem urgency, target personas, and market opportunity are articulated with clear data points.",
    slide2: "Slide 2: Emphasize the unique technological moat and value proposition over existing tools.",
    slide3: hasDataFlowPipeline
      ? "Slide 3: Good technical overview. Ensure data ingestion, caching, and database schemas are specified."
      : "Slide 3: Add an end-to-end data pipeline diagram illustrating how inputs transition into outputs.",
    slide4: hasRiskMitigation
      ? "Slide 4: Good risk analysis. Specify fallback strategies for offline or high-load conditions."
      : "Slide 4: Add 2-3 specific technical risks and your exact architectural mitigation strategies.",
    slide5: quantitativeScore > 0
      ? "Slide 5: Impact metrics are documented. Ensure baseline benchmarks are contrasted against legacy systems."
      : "Slide 5: Quantify the expected impact with baseline benchmark comparisons.",
    slide6: hasRoadmap
      ? "Slide 6: Phased delivery milestones defined. Clearly assign ownership for each core technical component."
      : "Slide 6: Add a structured execution roadmap outlining 48-hour or multi-phase milestones and role breakdown.",
  };

  const deductions: ChallengeScoreDeductions = {
    problem: `Deducted ${25 - scoreProblem} pts: Elaborate on target personas and quantified pain point benchmarks.`,
    solution: `Deducted ${25 - scoreSolution} pts: Clarify the technical moat and competitive differentiation.`,
    architecture: `Deducted ${30 - scoreArchitecture} pts: Add end-to-end data pipelines and defined framework integrations.`,
    feasibilityImpact: `Deducted ${20 - scoreFeasibilityImpact} pts: Detail technical risk mitigations, metrics, and roadmap milestones.`,
  };

  return {
    scoreProblem,
    scoreSolution,
    scoreArchitecture,
    scoreFeasibilityImpact,
    totalScore,
    grade,
    strengths,
    growthAreas: growthAreas.length > 0 ? growthAreas : ["Refine slide typography and add architecture flowcharts."],
    formatViolations: [],
    slideFeedback,
    scoreDeductions: deductions,
    topActionItem: growthAreas[0] || "Iterate on the architecture diagram to highlight data transformations.",
    usedAiFallback: true,
  };
}

function computeChallengeGrade(totalScore: number): string {
  if (totalScore >= 85) return "Mastery 🏆";
  if (totalScore >= 72) return "Strong Contender 🚀";
  if (totalScore >= 55) return "Developing 💡";
  return "Needs Revision 🛠️";
}
