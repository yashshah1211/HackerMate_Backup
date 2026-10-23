import { extractTextFromPDF, extractPresentationFromUrl, type ExtractionResult } from "@/lib/ppt/presentationExtractor";
import { PRESENTATION_LIMITS } from "@/lib/ppt/analysisMetadata";
export type ChallengeExtractionResult = Omit<ExtractionResult, "pdf">;

/** Challenge evaluates usable text only; never synthesize missing pages or persist PDF bytes. */
function textOnly(result: ExtractionResult): ChallengeExtractionResult {
  const text = { success: result.success, totalSlidesDetected: result.totalSlidesDetected, slides: result.slides, rawDocumentText: result.rawDocumentText, errorMessage: result.errorMessage };
  if (!result.success || !result.rawDocumentText.replace(/\[Slide\s*\d+\]/gi, "").trim()) {
    return { success: false, totalSlidesDetected: 0, slides: [], rawDocumentText: "", errorMessage: result.errorMessage || "No usable text. Supply a text-readable PDF (maximum 8 MB) or presentation link." };
  }
  return text;
}
export async function extractChallengeTextFromPDF(pdf: Buffer, timeBudgetMs: number = PRESENTATION_LIMITS.parseMs, signal?: AbortSignal): Promise<ChallengeExtractionResult> {
  return textOnly(await extractTextFromPDF(pdf, "linked_pdf", Math.min(timeBudgetMs, PRESENTATION_LIMITS.parseMs), signal));
}
export async function extractChallengePresentationFromUrl(url: string, timeBudgetMs: number = PRESENTATION_LIMITS.ingestionMs, signal?: AbortSignal): Promise<ChallengeExtractionResult> {
  return textOnly(await extractPresentationFromUrl(url, timeBudgetMs, signal));
}
