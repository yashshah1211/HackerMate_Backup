/** Safe to import in client components. PDF bytes never belong in persisted feedback. */
import { TRACK_PROFILES, type JudgingTrackId } from "../evaluator/evaluatorTypes";
import { HISTORICAL_PROVENANCE_LABEL, HISTORICAL_PROVENANCE_DESCRIPTION, type EvaluationRevision } from "../evaluator/evaluationProvenance";

export function getPitchCategories(track: JudgingTrackId) {
  const categories = TRACK_PROFILES[track]?.categories || TRACK_PROFILES.generic.categories;
  return track === "ai_genai" ? { ...categories, tech: { ...categories.tech, label: "Model Pipeline & Architecture" } } : categories;
}

/** Only fixed codes and transport metadata; never provider messages or document text. */
export interface DocumentFailure {
  stage: "request" | "response" | "validation" | "budget";
  code: "http_error" | "timeout" | "network_error" | "budget_exhausted" | "blocked_response" | "incomplete_response" | "empty_response" | "invalid_json" | "invalid_scores" | "invalid_deductions" | "missing_slide_feedback" | "invalid_slide_feedback" | "missing_api_key" | "invalid_input" | "document_error";
  model?: string;
  httpStatus?: number;
  attempts?: Omit<DocumentFailure, "attempts">[];
}
export const PRESENTATION_LIMITS = {
  pdfBytes: 8 * 1024 * 1024,
  textBytes: 512 * 1024,
  pages: 60,
  textChars: 120_000,
  ingestionMs: 15_000,
  parseMs: 5_000,
} as const;

export type AnalysisMode = "visual_text" | "text_only" | "heuristic_fallback" | "unknown";
export interface AnalysisMetadata {
  revision?: EvaluationRevision;
  mode: AnalysisMode;
  pdfReceived: boolean;
  pageCount?: number;
  pdfBytes?: number;
  /** SHA-256 of the downloaded PDF, not of its URL or extracted text. */
  pdfSha256?: string;
  source?: "google_slides_pdf" | "google_drive_pdf" | "linked_pdf" | "extracted_text";
  fallbackReason?: "pdf_unavailable" | "document_ai_failed" | "ai_unavailable" | DocumentFailure;
  modelUsed?: string;
  modelVersion?: string;
  schemaVersion?: "evaluator-v1";
  rubricVersion?: "ppt-v1" | "challenge-v1";
  trackId?: JudgingTrackId;
  requestId?: string;
  categoryCaps?: Record<string, number>;
  categoryLabels?: Record<string, string>;
  attempts?: number;
  providerAttempts?: Array<{ model: string; latencyMs: number; code: string; httpStatus?: number }>;
  evidence?: Record<string, Array<{ text: string; quote?: string; pageNumber?: number; evidence?: string }>>;
}

/** Compare only recorded PDF hashes within the same team's earlier completed evaluations. */
export function findEarlierMatchingPdf<T extends { id: string; team_id: string; version: number; status: string; ai_feedback?: { analysis?: AnalysisMetadata } | null }>(selected: T, history: T[]): T | undefined {
  const hash = selected.ai_feedback?.analysis?.pdfSha256;
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return undefined;
  return history.filter(item => item.id !== selected.id && item.team_id === selected.team_id && item.status === "completed" &&
    item.version < selected.version && item.ai_feedback?.analysis?.pdfSha256 === hash)
    .sort((a, b) => b.version - a.version)[0];
}
export interface SlideFeedback {
  slideNumber: number;
  title: string;
  observation: string;
  recommendation: string;
}

/** Missing historical metadata is unknown. Never infer a visual or text-only review. */
export function getAnalysisDisplay(feedback?: { analysis?: AnalysisMetadata; usedAiFallback?: boolean }, currentResponse = false) {
  if (!currentResponse) return { mode: "unknown", label: HISTORICAL_PROVENANCE_LABEL, description: HISTORICAL_PROVENANCE_DESCRIPTION } as const;
  const mode = feedback?.usedAiFallback ? "heuristic_fallback" : feedback?.analysis?.mode || "unknown";
  if (mode === "visual_text" && feedback?.analysis?.pdfReceived === true) {
    return { mode: "visual_text", label: "VISUAL + TEXT", description: "The AI was supplied the actual PDF, including visual content. Its feedback is not independent verification of the project." } as const;
  }
  if (mode === "heuristic_fallback") {
    return { mode, label: "LEGACY HEURISTIC", description: "Stored deterministic score, not a validated AI evaluation. The specific fallback cause and visual assessment may be unverified." } as const;
  }
  if (mode === "text_only") return { mode, label: "TEXT ONLY", description: "The score uses extracted text. Visual layout, diagrams and screenshots were not validated." } as const;
  return { mode: "unknown", label: "MODE UNRECORDED", description: "This historical record does not establish its analysis mode. Do not infer visual inspection or current validation." } as const;
}
