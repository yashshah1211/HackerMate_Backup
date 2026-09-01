export type JudgingTrackId = "web_dev" | "ai_genai" | "sih";

export interface TrackScoreCategories {
  novelty: { label: string; maxPts: number };
  tech: { label: string; maxPts: number };
  uiUxOrFeasibility: { label: string; maxPts: number };
  impactOrTeam: { label: string; maxPts: number };
}

export interface TrackProfile {
  id: JudgingTrackId;
  name: string;
  badge: string;
  icon: string;
  tagline: string;
  description: string;
  categories: TrackScoreCategories;
  primaryChecks: string[];
  commonRedFlags: string[];
  recommendedRoles: string[];
}

export interface EvaluationInput {
  psTitle: string;
  solutionDescription: string;
  techStack?: string;
  architectureDetails?: string;
  repoUrl?: string;
  demoUrl?: string;
  slidesText?: string;
  trackId: JudgingTrackId;
  hackathonId?: string;
  teamInfo?: {
    name?: string;
    memberCount?: number;
    hasFemaleMember?: boolean;
    members?: Array<{ name?: string; skills?: string[] }>;
  };
}

export interface TrackSubScores {
  novelty: number;
  tech: number;
  uiUxOrFeasibility: number;
  impactOrTeam: number;
}

export interface RecommendedRoleGap {
  role: string;
  reason: string;
  suggestedSkills: string[];
}

export interface ProjectEvaluationResult {
  trackId: JudgingTrackId;
  totalScore: number; // 0-100
  grade: "Top Tier / Nomination Ready 🏆" | "Strong Contender ✅" | "Needs Iteration ⚠️" | "High Risk / Incomplete 🚨";
  subScores: TrackSubScores;
  categoryLabels: {
    novelty: string;
    tech: string;
    uiUxOrFeasibility: string;
    impactOrTeam: string;
  };
  strengths: string[];
  redFlags: string[];
  architectureSuggestions: string[];
  recommendedRoles: RecommendedRoleGap[];
  usedAiEngine: boolean; // true if Gemini AI was used, false if Heuristic Fallback
  evaluationTimestamp: string;
}

export const TRACK_PROFILES: Record<JudgingTrackId, TrackProfile> = {
  web_dev: {
    id: "web_dev",
    name: "Web Development & Full-Stack",
    badge: "Full-Stack Track",
    icon: "🌐",
    tagline: "UI/UX, API Architecture, Performance & Scalability",
    description: "Evaluates responsive design, database schema, state management, caching, security, and API latency.",
    categories: {
      novelty: { label: "Problem Fit & Differentiation", maxPts: 25 },
      tech: { label: "Full-Stack & Database Architecture", maxPts: 35 },
      uiUxOrFeasibility: { label: "UI/UX, State & Performance", maxPts: 25 },
      impactOrTeam: { label: "Execution Moat & Scalability", maxPts: 15 },
    },
    primaryChecks: [
      "Client vs Server-side rendering (SSR/CSR) choices",
      "Database schema design, relations, and indexing",
      "API design (REST/GraphQL), auth security, and rate-limiting",
      "State management, caching layers (Redis/CDN), and responsive UX",
    ],
    commonRedFlags: [
      "Missing database relationship details or indexing strategies",
      "No input validation, rate limiting, or auth protection on sensitive routes",
      "Static/text-heavy UI without interactive client feedback or error states",
      "Unaddressed N+1 query bottlenecks and unoptimized asset delivery",
    ],
    recommendedRoles: ["Frontend Engineer (React/Next.js)", "Backend & DB Architect", "UI/UX Designer"],
  },
  ai_genai: {
    id: "ai_genai",
    name: "AI, GenAI & Agentic Systems",
    badge: "AI / ML Track",
    icon: "🤖",
    tagline: "RAG Pipelines, Vector Search, Hallucination Mitigations & Real Moat",
    description: "Evaluates pipeline engineering, fine-tuning vs RAG, vector database indexing, latency, and defensibility.",
    categories: {
      novelty: { label: "AI Novelty & True Moat", maxPts: 25 },
      tech: { label: "Model Pipeline & Vector Architecture", maxPts: 35 },
      uiUxOrFeasibility: { label: "Hallucination Control & Latency", maxPts: 25 },
      impactOrTeam: { label: "Unit Economics & Accuracy", maxPts: 15 },
    },
    primaryChecks: [
      "RAG architecture: chunking strategy, embeddings, and vector DB indexing",
      "Hallucination mitigation, guardrails, and validation loops",
      "Inference latency optimization, caching, and fallback models",
      "Defensibility: custom datasets, fine-tuning, or proprietary agent loops beyond basic API wrapping",
    ],
    commonRedFlags: [
      "Generic OpenAI/Gemini wrapper without custom retrieval or pipeline moat",
      "No handling for prompt injection, context window overflow, or rate limits",
      "Missing evaluation metrics (BLEU, ROUGE, precision/recall, ground truth tests)",
      "Unrealistic inference latency and unmodeled token costs",
    ],
    recommendedRoles: ["AI/ML Engineer (PyTorch/LangChain)", "Vector DB & Data Engineer", "Full-Stack AI Integrator"],
  },
  sih: {
    id: "sih",
    name: "Smart India Hackathon (SIH)",
    badge: "SIH Format",
    icon: "🏆",
    tagline: "Official 6-Slide Compliance, Government & Social Impact",
    description: "Evaluates against the official Smart India Hackathon jury rubric, 6-slide template structure, and quantified impact.",
    categories: {
      novelty: { label: "Problem Novelty & Alignment", maxPts: 25 },
      tech: { label: "Technical Architecture & Feasibility", maxPts: 35 },
      uiUxOrFeasibility: { label: "UI/UX, Impact & Research Polish", maxPts: 25 },
      impactOrTeam: { label: "Team Squad Balance & Rule Compliance", maxPts: 15 },
    },
    primaryChecks: [
      "Official 6-slide template structure compliance",
      "Quantified social/economic baseline metrics (₹, %, hours saved)",
      "Technical architecture flowchart and working prototype repository",
      "Research citations, IEEE references, and open government datasets on Slide 6",
    ],
    commonRedFlags: [
      "Exceeding mandatory 6-slide limit",
      "Missing baseline metrics and quantified unit economics",
      "Generic API wrappers without technical depth",
      "Missing research references or dataset documentation",
    ],
    recommendedRoles: ["Lead Full-Stack Builder", "System Architect", "UI/UX & Research Lead"],
  },
};
