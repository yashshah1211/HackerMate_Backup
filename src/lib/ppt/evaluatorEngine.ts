import { JudgingTrackId } from "@/lib/evaluator/evaluatorTypes";
import { callGeminiText, extractJsonFromResponse } from "@/lib/ai/geminiClient";

export interface ScoreDeductions {
  novelty: string;
  tech: string;
  uiUx: string;
  team: string;
}

export interface SlideRecommendations {
  titlePage: string;
  proposedSolution: string;
  technicalApproach: string;
  feasibilityAndRisks: string;
  impactAndBenefits: string;
  researchAndReferences: string;
}

export interface EvaluationEngineResult {
  scoreNovelty: number; // 0-25
  scoreTech: number; // 0-35
  scoreUiUx: number; // 0-25
  scoreTeam: number; // 0-15
  totalScore: number; // 0-100
  grade: "Strong Pitch 🏆" | "Promising ✅" | "Needs Iteration ⚠️" | "Major Concerns 🚨" | string;
  strengths: string[];
  criticalRisks: string[];
  formatViolations: string[];
  slideRecommendations: SlideRecommendations;
  scoreDeductions: ScoreDeductions;
  usedAiFallback: boolean;
  modelUsed?: string;
  modelVersion?: string;
  latencyMs?: number;
  trackId?: JudgingTrackId;
}

export async function runPitchDeckEvaluation(
  psTitle: string,
  psCategory: string,
  slideText: string,
  teamInfo?: {
    name?: string;
    memberCount?: number;
    members?: Array<{ name?: string; skills?: string[] }>;
    githubUrl?: string | null;
    demoUrl?: string | null;
  },
  trackId: JudgingTrackId = "web_dev"
): Promise<EvaluationEngineResult> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  const memberCount = teamInfo?.memberCount || 4;

  if (geminiKey) {
    try {
      const aiResult = await callGeminiWithCascade(
        geminiKey,
        psTitle,
        psCategory,
        slideText,
        teamInfo,
        memberCount,
        trackId
      );
      return {
        ...aiResult,
        usedAiFallback: false,
        trackId,
      };
    } catch (err: any) {
      console.warn(`[Pitch Evaluator] Gemini AI cascade failed (${err.message}). Triggering Content-Aware Deterministic Engine.`);
    }
  }

  // Fallback to Content-Aware Heuristic Engine
  console.log(`[Pitch Evaluator] Evaluating using Content-Aware Heuristic Engine (Track: ${trackId}).`);
  const fallbackResult = generateHeuristicEvaluation(
    psTitle,
    psCategory,
    slideText,
    teamInfo,
    memberCount,
    trackId
  );

  return {
    ...fallbackResult,
    usedAiFallback: true,
    trackId,
  };
}

/**
 * Cascading Gemini API caller with production-pinned model hierarchy.
 */
async function callGeminiWithCascade(
  geminiKey: string,
  psTitle: string,
  psCategory: string,
  slideText: string,
  teamInfo: any,
  memberCount: number,
  trackId: JudgingTrackId = "web_dev"
) {
  let promptText = "";
  if (trackId === "ai_genai") {
    promptText = `You are a distinguished Senior AI Systems Architect and National Hackathon Grand Jury Evaluator specializing in AI, GenAI & Agentic Systems. Grade this pitch presentation with deep technical scrutiny.

AI & AGENTIC SYSTEMS EVALUATION FOCUS:
- Agentic Orchestration: Multi-agent coordination, deterministic tool calling, evaluation loops, state machines.
- RAG & Knowledge Retrieval: Hybrid search (dense + sparse), rerankers, semantic chunking, hallucination guardrails, citation hashing.
- Latency & Token Economics: Streaming UX, caching (semantic / prefix cache), model selection trade-offs (e.g. SLM vs LLM vs MoE).
- Production Guardrails: Security (prompt injection defenses, rate-limiting, PII masking), eval benchmarks (precision, recall, ground truth).
- Squad Evaluation: Evaluate technical skills and complementary roles (e.g., AI Engineer, Backend/MLOps, Frontend/Product). Squads of 2–5 members with complementary skills receive full credit. Do NOT enforce 6-member minimums or gender requirements.

SUBMISSION METADATA:
- Project Title: ${psTitle}
- Category: ${psCategory}
- GitHub Code Link: ${teamInfo?.githubUrl || "Not provided"}
- Prototype Video Link: ${teamInfo?.demoUrl || "Not provided"}

TEAM COMPOSITION:
- Team Name: ${teamInfo?.name || "HackerMate Team"}
- Total Members: ${memberCount}
- Members: ${(teamInfo?.members || []).map((m: any) => `${m.name || "Member"} (${(m.skills || []).join(", ") || "General"})`).join("; ") || "Team details provided"}

EXTRACTED PRESENTATION SLIDE CONTENT (Complete Deck):
---
${slideText.slice(0, 35000)}
---

AI TRACK SCORING RUBRIC (Max 100 Points Total):
1. AI Novelty & Problem Alignment (0 to 25 pts): Unique agentic workflow or model fine-tuning vs trivial API wrappers. Clear technical moat.
2. AI Architecture & Technical Execution (0 to 35 pts): Vector database, chunking, reranking, model fail-safes, latency optimization, and evaluation metrics.
3. UI/UX & Pacing (0 to 25 pts): AI interaction design (streaming responses, citation previews, human-in-the-loop overrides), clean diagrams/flowcharts.
4. Team Squad & Complementary Skills (0 to 15 pts): Complementary skill distribution (AI/ML, Data Engineering, Full-Stack). Teams with 2–5+ members receive high credit.

CRITICAL INSTRUCTION:
Return ONLY a raw JSON object (no markdown, no backticks, no wrapping) matching this exact schema:
{
  "scoreNovelty": number (0 to 25 integer),
  "scoreTech": number (0 to 35 integer),
  "scoreUiUx": number (0 to 25 integer),
  "scoreTeam": number (0 to 15 integer),
  "totalScore": number (exact sum of scoreNovelty + scoreTech + scoreUiUx + scoreTeam, 0 to 100),
  "grade": "Strong Pitch 🏆" | "Promising ✅" | "Needs Iteration ⚠️" | "Major Concerns 🚨",
  "formatViolations": ["Format Note: ..."],
  "scoreDeductions": {
    "novelty": "Specific explanation of novelty score deductions",
    "tech": "Specific explanation of AI architecture deductions",
    "uiUx": "Specific explanation of UI/UX deductions",
    "team": "Specific explanation of team composition deductions"
  },
  "strengths": ["string", "string"],
  "criticalRisks": ["string", "string"],
  "slideRecommendations": {
    "titlePage": "Title slide guidance...",
    "proposedSolution": "AI solution & novelty guidance...",
    "technicalApproach": "AI architecture & pipeline guidance...",
    "feasibilityAndRisks": "Technical feasibility & hallucination risk guidance...",
    "impactAndBenefits": "Quantified impact & benchmark guidance...",
    "researchAndReferences": "Model citations & dataset guidance..."
  }
}`;
  } else {
    // web_dev / general track
    promptText = `You are a Principal Full-Stack Engineer and National Hackathon Grand Jury Evaluator. Grade this pitch presentation with rigorous full-stack software architecture scrutiny.

FULL-STACK HACKATHON EVALUATION FOCUS:
- System Architecture: API contracts (REST, GraphQL, WebSocket), client/server rendering (SSR/CSR), microservices vs modular monolith.
- Database & Data Integrity: Relational schema design, normalization, indexing strategies, ACID compliance, row-level security (RLS).
- Performance & Scalability: Ephemeral caching (Redis/CDN), connection pooling, rate-limiting, sub-100ms response targets.
- Security & Reliability: Authentication (JWT, OAuth), CSRF/CORS protection, input validation, CI/CD, fail-safe backups.
- Squad Evaluation: Evaluate role coverage (Frontend, Backend, DevOps, UI/UX). Squads of 2–5 members with complementary skills receive full credit. Do NOT enforce 6-member minimums or gender requirements.

SUBMISSION METADATA:
- Project Title: ${psTitle}
- Category: ${psCategory}
- GitHub Code Link: ${teamInfo?.githubUrl || "Not provided"}
- Prototype Video Link: ${teamInfo?.demoUrl || "Not provided"}

TEAM COMPOSITION:
- Team Name: ${teamInfo?.name || "HackerMate Team"}
- Total Members: ${memberCount}
- Members: ${(teamInfo?.members || []).map((m: any) => `${m.name || "Member"} (${(m.skills || []).join(", ") || "General"})`).join("; ") || "Team details provided"}

EXTRACTED PRESENTATION SLIDE CONTENT (Complete Deck):
---
${slideText.slice(0, 35000)}
---

FULL-STACK SCORING RUBRIC (Max 100 Points Total):
1. Problem Novelty & Differentiation (0 to 25 pts): Practical market utility, competitive differentiation against existing SaaS/web platforms.
2. Full-Stack & System Architecture (0 to 35 pts): API contracts, database schema, indexing, caching layers, security posture, deployment topology.
3. UI/UX, Performance & Pacing (0 to 25 pts): Responsive layout, data flow visualization, clear user journey and error state handling.
4. Team Squad & Technical Execution (0 to 15 pts): Cross-functional balance (Frontend, Backend, DevOps/Cloud). Teams with 2–5+ members receive high credit.

CRITICAL INSTRUCTION:
Return ONLY a raw JSON object (no markdown, no backticks, no wrapping) matching this exact schema:
{
  "scoreNovelty": number (0 to 25 integer),
  "scoreTech": number (0 to 35 integer),
  "scoreUiUx": number (0 to 25 integer),
  "scoreTeam": number (0 to 15 integer),
  "totalScore": number (exact sum of scoreNovelty + scoreTech + scoreUiUx + scoreTeam, 0 to 100),
  "grade": "Strong Pitch 🏆" | "Promising ✅" | "Needs Iteration ⚠️" | "Major Concerns 🚨",
  "formatViolations": ["Format Note: ..."],
  "scoreDeductions": {
    "novelty": "Specific explanation of novelty score deductions",
    "tech": "Specific explanation of technical architecture deductions",
    "uiUx": "Specific explanation of UI/UX deductions",
    "team": "Specific explanation of team composition deductions"
  },
  "strengths": ["string", "string"],
  "criticalRisks": ["string", "string"],
  "slideRecommendations": {
    "titlePage": "Title slide guidance...",
    "proposedSolution": "Product solution guidance...",
    "technicalApproach": "Full-stack architecture guidance...",
    "feasibilityAndRisks": "Technical risks & scalability guidance...",
    "impactAndBenefits": "Quantified metrics guidance...",
    "researchAndReferences": "References & technical docs guidance..."
  }
}`;
  }

  const { text: rawJsonText, modelUsed, modelVersion, latencyMs } = await callGeminiText(promptText, {
    responseMimeType: "application/json",
    temperature: 0.1,
    perModelTimeoutMs: 10000,
    totalTimeoutMs: 24000,
  });

  console.log(`[Pitch Evaluator] Gemini AI evaluation completed via ${modelUsed} (${modelVersion}) in ${latencyMs}ms.`);

  const targetJsonStr = extractJsonFromResponse(rawJsonText);
  const parsed = JSON.parse(targetJsonStr);

  let rawNovelty = parsed.scoreNovelty ?? 15;
  let rawTech = parsed.scoreTech ?? 20;
  let rawUiUx = parsed.scoreUiUx ?? 15;
  let rawTeam = parsed.scoreTeam ?? 12;

  // Check if model returned 0-10 subscores instead of category max
  if (rawTech <= 10 && rawNovelty <= 10 && rawUiUx <= 10 && rawTeam <= 10) {
    rawNovelty = Math.round((rawNovelty / 10) * 25);
    rawTech = Math.round((rawTech / 10) * 35);
    rawUiUx = Math.round((rawUiUx / 10) * 25);
    rawTeam = Math.round((rawTeam / 10) * 15);
  }

  const scoreNovelty = Math.min(25, Math.max(0, rawNovelty));
  const scoreTech = Math.min(35, Math.max(0, rawTech));
  const scoreUiUx = Math.min(25, Math.max(0, rawUiUx));
  const scoreTeam = Math.min(15, Math.max(0, rawTeam));
  const totalScore = scoreNovelty + scoreTech + scoreUiUx + scoreTeam;

  const grade = parsed.grade || computeGrade(totalScore, memberCount, parsed.formatViolations, trackId);

  return {
    scoreNovelty,
    scoreTech,
    scoreUiUx,
    scoreTeam,
    totalScore,
    grade,
    strengths: Array.isArray(parsed.strengths) && parsed.strengths.length > 0 ? parsed.strengths : ["Well-structured presentation"],
    criticalRisks: Array.isArray(parsed.criticalRisks) ? parsed.criticalRisks : (Array.isArray(parsed.spocRedFlags) ? parsed.spocRedFlags : []),
    formatViolations: Array.isArray(parsed.formatViolations) ? parsed.formatViolations : [],
    slideRecommendations: {
      titlePage: parsed.slideRecommendations?.titlePage || "Ensure project ID, category, and team details are clearly stated.",
      proposedSolution: parsed.slideRecommendations?.proposedSolution || "Articulate clear competitive advantage over existing solutions.",
      technicalApproach: parsed.slideRecommendations?.technicalApproach || "Include end-to-end data flow and block architecture diagram.",
      feasibilityAndRisks: parsed.slideRecommendations?.feasibilityAndRisks || "List specific technical bottlenecks and exact mitigation strategies.",
      impactAndBenefits: parsed.slideRecommendations?.impactAndBenefits || "Include quantitative baseline metrics and cost efficiency data.",
      researchAndReferences: parsed.slideRecommendations?.researchAndReferences || "Cite official technical documentation, research papers, and open datasets.",
    },
    scoreDeductions: {
      novelty: parsed.scoreDeductions?.novelty || `Lost ${25 - scoreNovelty} points in Problem Alignment & Novelty.`,
      tech: parsed.scoreDeductions?.tech || `Lost ${35 - scoreTech} points in Technical Architecture.`,
      uiUx: parsed.scoreDeductions?.uiUx || `Lost ${25 - scoreUiUx} points in UI/UX & Polish.`,
      team: parsed.scoreDeductions?.team || `Lost ${15 - scoreTeam} points in Team Squad Balance & Rules.`,
    },
    modelUsed,
    modelVersion,
    latencyMs,
  };
}

/**
 * Deterministic Content-Aware Heuristic Scoring Engine
 */
export function generateHeuristicEvaluation(
  psTitle: string,
  psCategory: string,
  slideText: string = "",
  teamInfo?: any,
  memberCount: number = 4,
  trackId: JudgingTrackId = "web_dev"
) {
  const lowerText = slideText.toLowerCase();
  const words = slideText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // 1. Technology Domain Registry
  const databases = ["postgres", "postgresql", "supabase", "mongodb", "redis", "mysql", "sqlite", "dynamodb", "firebase", "firestore", "neo4j", "cockroachdb"];
  const cloudPlatforms = ["aws", "gcp", "azure", "vercel", "render", "docker", "kubernetes", "k8s", "serverless", "lambda", "cloudflare", "edge"];
  const frameworks = ["react", "next", "vue", "angular", "svelte", "node", "express", "fastapi", "flask", "django", "spring", "nestjs", "flutter"];
  const mlAi = ["yolo", "opencv", "pytorch", "tensorflow", "keras", "scikit-learn", "huggingface", "llm", "gemini", "openai", "rag", "bert", "neural", "computer vision", "agent"];
  const protocols = ["rest", "api", "mqtt", "grpc", "websocket", "rtsp", "graphql", "microservice"];
  const hardware = ["jetson", "raspberry pi", "esp32", "arduino", "nvidia", "sensor", "iot"];

  const foundDb = databases.filter(k => lowerText.includes(k));
  const foundCloud = cloudPlatforms.filter(k => lowerText.includes(k));
  const foundFramework = frameworks.filter(k => lowerText.includes(k));
  const foundMl = mlAi.filter(k => lowerText.includes(k));
  const foundProtocol = protocols.filter(k => lowerText.includes(k));
  const foundHw = hardware.filter(k => lowerText.includes(k));

  const techDomainCount = [
    foundDb.length > 0,
    foundCloud.length > 0,
    foundFramework.length > 0,
    foundMl.length > 0,
    foundProtocol.length > 0,
    foundHw.length > 0,
  ].filter(Boolean).length;

  // 2. Specificity & Technical Pipeline Analysis
  const hasDataFlowPipeline = /->|-->|=>|pipeline|architecture|data flow|flowchart|ingests|streams|serializes|publishes/i.test(slideText);
  const hasRiskMitigation = /mitigation|technical risk|fail-safe|offline|fallback|occlusion|latency mitigation|redundancy/i.test(slideText);
  const hasBullets = /[•\-\*]\s|\d+\.\s/.test(slideText);

  // Quantitative Baseline Metrics Analysis
  const hasPercent = /%\s|percent|reduction|increase|\d+%/i.test(slideText);
  const hasCost = /₹|\$|cost|rupees|budget|rs\.|inr/i.test(slideText);
  const hasTimeMetrics = /min|sec|hour|delay|latency|ms\b|speed|fps/i.test(slideText);
  const hasNumbers = (slideText.match(/\d+/g) || []).length > 3;
  const quantitativeScore = (hasPercent ? 1 : 0) + (hasCost ? 1 : 0) + (hasTimeMetrics ? 1 : 0) + (hasNumbers ? 1 : 0);
  const hasBeneficiaries = /beneficiar|user|market|saas|municipal|revenue|business|citizen/i.test(slideText);

  // 3. Format Infractions Detection
  const formatViolations: string[] = [];
  const bracketSlideMatches = slideText.match(/\[Slide\s*\d+\]/gi);
  let detectedMaxSlide = bracketSlideMatches ? bracketSlideMatches.length : 0;

  if (detectedMaxSlide === 0) {
    const literalSlideMatches = slideText.match(/slide\s*(\d+)/gi);
    if (literalSlideMatches) {
      literalSlideMatches.forEach((m) => {
        const num = parseInt(m.replace(/slide\s*/i, ""), 10);
        if (!isNaN(num) && num > detectedMaxSlide) detectedMaxSlide = num;
      });
    }
  }

  if (detectedMaxSlide > 15) {
    formatViolations.push(`Pacing Note: Deck length (${detectedMaxSlide} slides) exceeds recommended 10–12 slide hackathon limit.`);
  }

  const hasSlide1Title = /title page|problem statement|team name|category/i.test(slideText);
  const hasSlide2Solution = /proposed solution|idea title|innovation|novelty/i.test(slideText);
  const hasSlide3Tech = /technical approach|tech stack|methodology|architecture/i.test(slideText);
  const hasSlide4Feasibility = /feasibility|viability|risk|mitigation|challenges/i.test(slideText);
  const hasSlide5Impact = /impact|benefits|beneficiar/i.test(slideText);
  const hasSlide6Research = /research|reference|citation|dataset/i.test(slideText);

  let missingSectionCount = 0;
  if (!hasSlide1Title) { formatViolations.push("Format Note: Missing Slide 1 Title Page metadata."); missingSectionCount++; }
  if (!hasSlide2Solution) { formatViolations.push("Format Note: Missing Slide 2 (Proposed Solution & Innovation)."); missingSectionCount++; }
  if (!hasSlide3Tech) { formatViolations.push("Format Note: Missing Slide 3 (Technical Approach & Architecture)."); missingSectionCount++; }
  if (!hasSlide4Feasibility) { formatViolations.push("Format Note: Missing Slide 4 (Feasibility & Risk Mitigation)."); missingSectionCount++; }
  if (!hasSlide5Impact) { formatViolations.push("Format Note: Missing Slide 5 (Impact & Beneficiaries)."); missingSectionCount++; }
  if (!hasSlide6Research) { formatViolations.push("Format Note: Missing Slide 6 (Research and References)."); missingSectionCount++; }

  // 4. Rubric Scoring (4 Criteria = 100 Pts Max)
  // Novelty & Problem Alignment (0-25)
  let scoreNovelty = 5;
  if (wordCount > 30) scoreNovelty += 3;
  if (wordCount > 100) scoreNovelty += 3;
  if (quantitativeScore >= 1) scoreNovelty += 4;
  if (hasBeneficiaries) scoreNovelty += 3;
  if (hasRiskMitigation) scoreNovelty += 2;
  scoreNovelty = Math.min(25, Math.max(3, scoreNovelty));

  // Technical Architecture & Feasibility (0-35)
  let scoreTech = 6;
  if (wordCount > 40) scoreTech += 4;
  if (hasDataFlowPipeline) scoreTech += 7;
  if (techDomainCount >= 2) scoreTech += 7;
  if (foundMl.length > 0 || foundHw.length > 0 || foundProtocol.length > 0) scoreTech += 4;
  if (teamInfo?.githubUrl || teamInfo?.demoUrl) scoreTech += 3;
  scoreTech = Math.min(35, Math.max(5, scoreTech));

  // UI/UX & Polish (0-25)
  let scoreUiUx = 4;
  if (wordCount > 40) scoreUiUx += 3;
  if (hasBullets) scoreUiUx += 6;
  if (lowerText.includes("dashboard") || lowerText.includes("mockup") || lowerText.includes("flowchart") || lowerText.includes("wireframe") || lowerText.includes("interface")) scoreUiUx += 5;
  if (teamInfo?.demoUrl) scoreUiUx += 3;
  scoreUiUx = Math.min(25, Math.max(3, scoreUiUx));

  // Team Squad & Compliance (0-15) - Track Aware
  let scoreTeam = 6; // Base score

  // Check role / skill breadth across team members
  const memberSkills = (teamInfo?.members || []).flatMap((m: any) => m.skills || []);
  const lowerSkills = memberSkills.map((s: string) => s.toLowerCase());
  if (lowerSkills.length >= 3) scoreTeam += 3;
  if (lowerSkills.some((s: string) => s.includes("react") || s.includes("frontend") || s.includes("ui"))) scoreTeam += 2;
  if (lowerSkills.some((s: string) => s.includes("node") || s.includes("python") || s.includes("backend") || s.includes("db"))) scoreTeam += 2;
  if (lowerSkills.some((s: string) => s.includes("ai") || s.includes("ml") || s.includes("cloud"))) scoreTeam += 2;

  scoreTeam = Math.min(15, Math.max(6, scoreTeam));

  let totalScore = scoreNovelty + scoreTech + scoreUiUx + scoreTeam;



  const grade = computeGrade(totalScore, memberCount, formatViolations, trackId);

  const criticalRisks: string[] = [];


  if (wordCount < 40) {
    criticalRisks.push("Sparse slide text. Technical architecture requires deeper elaboration.");
  }

  let teamDeductionText = "";
  teamDeductionText = scoreTeam >= 13
    ? `Awarded ${scoreTeam}/15 pts for solid cross-functional skill coverage.`
    : `Lost ${15 - scoreTeam} points: recommend expanding cross-functional skills (Frontend, Backend, DevOps, AI).`;

  const deductions: ScoreDeductions = {
    novelty: `Lost ${25 - scoreNovelty} points due to missing quantitative baseline metrics or competitive differentiation.`,
    tech: !hasDataFlowPipeline && techDomainCount === 0
      ? `Lost ${35 - scoreTech} points due to lack of defined technical architecture data flow and framework specifications.`
      : `Lost ${35 - scoreTech} points because deployment infrastructure, data pipeline flowcharts, or fail-safe specifications can be expanded.`,
    uiUx: `Lost ${25 - scoreUiUx} points because slide visual mockups and user flow diagrams need improvement.`,
    team: teamDeductionText,
  };

  const strengths: string[] = [`Project pitch registered for ${psTitle} (${psCategory}).`];
  if (hasDataFlowPipeline || techDomainCount > 0) strengths.push("Technical stack components (databases/architecture/pipeline) defined in pitch text.");
  if (hasPercent || hasCost) strengths.push("Quantitative baseline metrics or cost efficiency figures included.");
  if (scoreTeam >= 10) strengths.push(`Team possesses complementary technical skills.`);

  const slideRecommendations: SlideRecommendations = {
    titlePage: hasSlide1Title
      ? "Slide 1 (Title Page): Ensure project title, team name, and core problem theme are clearly formatted."
      : "Slide 1 (Title Page): Dedicated slide required for team name, project title, theme, and affiliations.",
    proposedSolution: hasSlide2Solution
      ? "Slide 2 (Proposed Solution): Contrast existing solution drawbacks vs your proposed innovation using visual infographics."
      : "Slide 2 (Proposed Solution): Dedicated slide required for idea title, proposed solution, and core novelty.",
    technicalApproach: hasSlide3Tech
      ? "Slide 3 (Technical Approach): Good technical stack. Include a high-level block architecture diagram and data pipeline flowchart."
      : "Slide 3 (Technical Approach): Dedicated slide required for technical methodology, framework choices, and data flow.",
    feasibilityAndRisks: hasSlide4Feasibility
      ? "Slide 4 (Feasibility & Risks): List 2-3 specific technical risks (e.g. latency, offline edge fallback) and exact mitigation strategies."
      : "Slide 4 (Feasibility & Risks): Dedicated slide required for feasibility analysis and technical risk mitigation.",
    impactAndBenefits: hasSlide5Impact
      ? "Slide 5 (Impact & Benefits): Quantify target beneficiaries and cost efficiency figures vs legacy manual processes."
      : "Slide 5 (Impact & Benefits): Dedicated slide required for target beneficiaries and quantified impact metrics.",
    researchAndReferences: hasSlide6Research
      ? "Slide 6 (Research & References): Cite official research papers, open datasets, and external technical documentation links."
      : "Slide 6 (Research & References): Dedicated slide recommended for references, documentation, and open datasets.",
  };

  return {
    scoreNovelty,
    scoreTech,
    scoreUiUx,
    scoreTeam,
    totalScore,
    grade,
    strengths,
    criticalRisks,
    formatViolations,
    slideRecommendations,
    scoreDeductions: deductions,
    trackId,
  };
}

export function computeGrade(
  totalScore: number,
  memberCount: number,
  formatViolations: string[] = [],
  trackId: JudgingTrackId = "web_dev"
): string {
  if (totalScore >= 88) {
    return "Strong Pitch 🏆";
  }
  if (totalScore >= 72) {
    return "Promising ✅";
  }
  if (totalScore < 50) {
    return "Major Concerns 🚨";
  }
  return "Needs Iteration ⚠️";
}
