import { getDocumentProxy } from "unpdf";
import { PRESENTATION_LIMITS, type AnalysisMetadata } from "./analysisMetadata";
import { downloadPresentation, PresentationLimitError, validatePresentationUrl } from "./presentationDownload";
export { validatePresentationUrl, ALLOWED_PRESENTATION_DOMAINS } from "./presentationDownload";

export interface ExtractedSlide {
  slideNumber: number;
  title: string;
  expectedCategory: string;
  rawText: string;
  charCount: number;
  wordCount: number;
}
export interface PresentationPdf {
  bytes: Buffer;
  pageCount: number;
  source: NonNullable<AnalysisMetadata["source"]>;
}
export interface ExtractionResult {
  success: boolean;
  totalSlidesDetected: number;
  slides: ExtractedSlide[];
  rawDocumentText: string;
  /** Ephemeral server-side bytes; never serialize to the database/client. */
  pdf?: PresentationPdf;
  errorMessage?: string;
}

function failed(errorMessage: string): ExtractionResult {
  return { success: false, totalSlidesDetected: 0, slides: [], rawDocumentText: "", errorMessage };
}

/** Retains physical page numbers, including image-only/blank pages. No rendering pipeline. */
export async function extractTextFromPDF(
  pdfBuffer: Buffer,
  source: PresentationPdf["source"] = "linked_pdf",
  timeoutMs: number = PRESENTATION_LIMITS.parseMs,
): Promise<ExtractionResult> {
  if (pdfBuffer.length > PRESENTATION_LIMITS.pdfBytes) return failed("PDF exceeds the 8 MB limit.");
  if (pdfBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") return failed("Invalid PDF document.");
  let document: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const parse = async (): Promise<ExtractionResult> => {
    document = await getDocumentProxy(new Uint8Array(pdfBuffer), { useSystemFonts: false, enableXfa: false, verbosity: 0, stopAtErrors: true });
    if (expired) { await document.loadingTask.destroy(); return failed("PDF parsing timed out."); }
    try {
      if (document.numPages < 1 || document.numPages > PRESENTATION_LIMITS.pages) return failed("PDF must contain 1–60 pages.");
      const pages: string[] = [];
      let chars = 0;
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        if (expired) return failed("PDF parsing timed out.");
        const page = await document.getPage(pageNumber);
        const reader = page.streamTextContent().getReader();
        let raw = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (expired) return failed("PDF parsing timed out.");
            for (const item of value.items) {
              if (!("str" in item)) continue;
              chars += item.str.length + 1;
              if (chars > PRESENTATION_LIMITS.textChars) return failed("PDF text exceeds the extraction limit.");
              raw += item.str + (item.hasEOL ? "\n" : " ");
            }
          }
        } finally { reader.releaseLock(); }
        const text = sanitizeExtractedText(raw);
        pages.push(text);
        page.cleanup();
      }
      const slides = mapToSlideStructure(pages, pages.join("\n\n"));
      return {
        success: true, totalSlidesDetected: document.numPages, slides,
        rawDocumentText: slides.map(slide => `[Slide ${slide.slideNumber}]\n${slide.rawText}`).join("\n\n"),
        pdf: { bytes: pdfBuffer, pageCount: document.numPages, source },
      };
    } finally { await document.loadingTask.destroy(); }
  };
  try {
    return await Promise.race([parse(), new Promise<ExtractionResult>(resolve => {
      timer = setTimeout(() => { expired = true; void document?.loadingTask.destroy().catch(() => {}); resolve(failed("PDF parsing timed out.")); }, Math.max(1, timeoutMs));
    })]);
  } catch {
    // Do not log parser errors: they may include document data.
    return failed("PDF parsing failed. Check that the document is valid and not password protected.");
  } finally { clearTimeout(timer); }
}

function fromText(raw: string): ExtractionResult | undefined {
  const text = sanitizeExtractedText(raw);
  if (text.length < 50 || isGoogleAuthOrBlockedHtml(text)) return;
  const chunks = segmentSlidesFromText(text);
  if (chunks.length > PRESENTATION_LIMITS.pages || text.length > PRESENTATION_LIMITS.textChars) throw new PresentationLimitError("Presentation exceeds the page or text limit.");
  const slides = mapToSlideStructure(chunks, text);
  return { success: true, totalSlidesDetected: slides.length, slides, rawDocumentText: slides.map(slide => `[Slide ${slide.slideNumber}]\n${slide.rawText}`).join("\n\n") };
}

export async function extractPresentationFromUrl(pptUrl: string): Promise<ExtractionResult> {
  const check = validatePresentationUrl(pptUrl);
  if (!check.valid || !check.url) return failed(check.error || "Invalid presentation URL.");
  const url = check.url;
  const deadline = Date.now() + PRESENTATION_LIMITS.ingestionMs;
  const slidesId = /^(?:docs|slides)\.google\.com$/.test(url.hostname) ? url.pathname.match(/^\/presentation\/d\/(?!e(?:\/|$))([a-zA-Z0-9_-]+)/)?.[1] : undefined;
  const driveId = url.hostname === "drive.google.com" ? url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] || url.searchParams.get("id") : undefined;
  if (driveId && !/^[a-zA-Z0-9_-]+$/.test(driveId)) return failed("Invalid Google Drive file ID.");
  const id = slidesId || driveId;
  const pdfCandidates: Array<{ url: string; source: PresentationPdf["source"] }> = slidesId ? [
    { url: `https://docs.google.com/presentation/d/${slidesId}/export/pdf`, source: "google_slides_pdf" },
  ] : driveId ? [
    { url: `https://drive.google.com/uc?export=download&id=${driveId}`, source: "google_drive_pdf" },
    { url: `https://docs.google.com/presentation/d/${driveId}/export/pdf`, source: "google_slides_pdf" },
  ] : [{ url: url.href, source: "linked_pdf" }];
  let textFallback: ExtractionResult | undefined;
  try {
    for (const candidate of pdfCandidates) {
      if (Date.now() >= deadline) break;
      try {
        const result = await downloadPresentation(candidate.url, PRESENTATION_LIMITS.pdfBytes, deadline);
        if (result.bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
          // Parse failure/oversize/page limits must not bypass validation via a text fallback.
          return await extractTextFromPDF(result.bytes, candidate.source, Math.min(PRESENTATION_LIMITS.parseMs, deadline - Date.now()));
        }
        if (result.contentType.includes("application/pdf")) return failed("The link did not return a valid PDF.");
        if (!id && /text\/(html|plain)/.test(result.contentType)) {
          if (result.bytes.length > PRESENTATION_LIMITS.textBytes) throw new PresentationLimitError("Presentation text exceeds the download limit.");
          const raw = result.bytes.toString("utf8");
          textFallback = fromText(result.contentType.includes("text/html") ? stripHtmlToText(raw) : raw);
        }
      } catch (error) {
        if (error instanceof PresentationLimitError) throw error;
      }
    }
    if (textFallback) return textFallback;
    // Existing Google text/pub fallbacks, now bounded and with validated redirects.
    if (id) {
      for (const format of ["export/txt", "pub"]) {
        if (Date.now() >= deadline) break;
        try {
          const result = await downloadPresentation(`https://docs.google.com/presentation/d/${id}/${format}`, PRESENTATION_LIMITS.textBytes, deadline);
          if (!/text\/(plain|html)/.test(result.contentType)) continue;
          const raw = result.bytes.toString("utf8");
          const extracted = fromText(result.contentType.includes("text/html") ? stripHtmlToText(raw) : raw);
          if (extracted) return extracted;
        } catch (error) { if (error instanceof PresentationLimitError) throw error; }
      }
    }
  } catch (error) {
    if (error instanceof PresentationLimitError) return failed(error.message);
  }
  return failed("Could not access a PDF or usable presentation text. Enable 'Anyone with the link can view', or share a PDF stored in Google Drive.");
}

/**
 * Segments multi-slide presentation text into discrete slide blocks.
 */
export function segmentSlidesFromText(rawText: string): string[] {
  if (!rawText || !rawText.trim()) return [];

  // 1. If explicit [Slide N] markers exist
  if (/\[Slide\s*\d+\]/i.test(rawText)) {
    return rawText
      .split(/\[Slide\s*\d+\]/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
  }

  // 2. Normalize vertical tabs, form-feeds, horizontal rules, and page breaks
  let text = rawText
    .replace(/[\u000b\f]+/g, "\f")
    .replace(/\r\n/g, "\n")
    .replace(/\n\s*[-=_]{3,}\s*\n/g, "\f");

  // 4. Split on "Slide 1:", "Slide 1 of 6", or explicit \f
  text = text.replace(/(?=\n\s*Slide\s*\d+(?::|\.|\s+of|\s*\/|\s+[A-Z]))/gi, "\f");

  const chunks = text.split(/\f+/).map((s) => s.trim()).filter((s) => s.length > 10);

  if (chunks.length > 1) {
    return chunks;
  }

  // 5. Partition by section headers if available
  const sectionSplit = rawText.split(/(?=\n\s*(?:Title Page|Problem Statement|Proposed Solution|Technical Approach|Feasibility|Impact|Research|References|Team Squad)\b)/i);
  if (sectionSplit.length > 2) {
    return sectionSplit.map((s) => s.trim()).filter((s) => s.length > 10);
  }

  // Fallback: Return single text block
  return [rawText];
}

function mapToSlideStructure(slideChunks: string[], fullText: string): ExtractedSlide[] {
  return slideChunks.map((chunk, idx) => {
    let rawText = chunk || "";
    if (!rawText && slideChunks.length === 1 && idx === 0) {
      rawText = fullText;
    }
    const clean = sanitizeExtractedText(rawText);
    const words = clean ? clean.split(/\s+/).filter(Boolean) : [];

    return {
      slideNumber: idx + 1,
      title: clean.split("\n")[0]?.slice(0, 100) || `Slide ${idx + 1}`,
      expectedCategory: "Presentation content",
      rawText: clean,
      charCount: clean.length,
      wordCount: words.length,
    };
  });
}

function sanitizeExtractedText(raw: string): string {
  return (raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtmlToText(html: string): string {
  return (html || "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function isGoogleAuthOrBlockedHtml(text: string): boolean {
  if (!text || text.length < 10) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("sign in - google accounts") ||
    lower.includes("sign in to continue to google") ||
    lower.includes("use your google account") ||
    lower.includes("accounts.google.com") ||
    (lower.includes("google drive") && lower.includes("sign in") && !lower.includes("slide")) ||
    (lower.includes("access denied") && !lower.includes("architecture"))
  );
}
