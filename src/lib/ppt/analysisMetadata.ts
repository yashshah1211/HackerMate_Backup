/** Safe to import in client components. PDF bytes never belong in persisted feedback. */
export const PRESENTATION_LIMITS = {
  pdfBytes: 8 * 1024 * 1024,
  textBytes: 512 * 1024,
  pages: 60,
  textChars: 120_000,
  ingestionMs: 15_000,
  parseMs: 5_000,
} as const;

export type AnalysisMode = "visual_text" | "text_only" | "heuristic_fallback";
export interface AnalysisMetadata {
  mode: AnalysisMode;
  pdfReceived: boolean;
  pageCount?: number;
  pdfBytes?: number;
  source?: "google_slides_pdf" | "google_drive_pdf" | "linked_pdf" | "extracted_text";
  fallbackReason?: "pdf_unavailable" | "document_ai_failed" | "ai_unavailable";
  modelUsed?: string;
  modelVersion?: string;
}
export interface SlideFeedback {
  slideNumber: number;
  title: string;
  observation: string;
  recommendation: string;
}

/** Phase 1 history was text-only; absence of metadata must never imply vision. */
export function getAnalysisDisplay(feedback?: { analysis?: AnalysisMetadata; usedAiFallback?: boolean }) {
  const mode = feedback?.usedAiFallback ? "heuristic_fallback" : feedback?.analysis?.mode || "text_only";
  if (mode === "visual_text" && feedback?.analysis?.pdfReceived === true) {
    return { mode: "visual_text", label: "VISUAL + TEXT", description: "Gemini reviewed the actual PDF, including its layouts, diagrams and images." } as const;
  }
  if (mode === "heuristic_fallback") {
    return { mode, label: "HEURISTIC FALLBACK", description: "AI evaluation was unavailable. Scores use extracted text and deterministic rules; visuals were not inspected." } as const;
  }
  return { mode: "text_only", label: "TEXT ONLY", description: "Evaluation used extracted text. Visual layout, diagrams and screenshots were not inspected." } as const;
}
