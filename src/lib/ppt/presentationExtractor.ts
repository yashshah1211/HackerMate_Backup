import { extractText } from "unpdf";

export interface ExtractedSlide {
  slideNumber: number;
  title: string;
  expectedCategory: string;
  rawText: string;
  charCount: number;
  wordCount: number;
}

export interface ExtractionResult {
  success: boolean;
  totalSlidesDetected: number;
  slides: ExtractedSlide[];
  rawDocumentText: string;
  errorMessage?: string;
}

export const SIH_SLIDE_CATEGORIES = [
  { slideNumber: 1, title: "Slide 1: Cover & Problem Statement Title", category: "Problem Statement & Overview" },
  { slideNumber: 2, title: "Slide 2: Proposed Solution & Innovation", category: "Proposed Solution & Novelty" },
  { slideNumber: 3, title: "Slide 3: Technical Approach & Architecture", category: "Technical Architecture & Stack" },
  { slideNumber: 4, title: "Slide 4: Feasibility, Viability & Risk Mitigation", category: "Feasibility & Technical Risks" },
  { slideNumber: 5, title: "Slide 5: Impact, Beneficiaries & Commercials", category: "Impact & Beneficiaries" },
  { slideNumber: 6, title: "Slide 6: Research, References & Team Squad", category: "Research & Team Squad" },
];

/**
 * Extracts plain text from an uploaded PDF binary buffer using unpdf (Next.js / serverless compatible).
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<ExtractionResult> {
  try {
    const uint8Data = new Uint8Array(pdfBuffer);
    const textResult = await extractText(uint8Data, { mergePages: false });

    const pages = (textResult?.text || []).map((p) => sanitizeExtractedText(p || ""));
    const fullText = pages.join("\n\n").trim();

    let slideChunks: string[] = [];

    if (pages.length >= 2) {
      slideChunks = pages.filter((s) => s.length > 5);
    }

    if (slideChunks.length === 0 && fullText.length > 20) {
      slideChunks = segmentSlidesFromText(fullText);
    }

    const structuredSlides = mapToSihSlideStructure(slideChunks, fullText);

    return {
      success: true,
      totalSlidesDetected: structuredSlides.filter((s) => s.wordCount > 5).length,
      slides: structuredSlides,
      rawDocumentText: fullText,
    };
  } catch (err: any) {
    console.error("[PDF Extractor] Error parsing PDF document:", err);
    return {
      success: false,
      totalSlidesDetected: 0,
      slides: [],
      rawDocumentText: "",
      errorMessage: `PDF Text Extraction failed: ${err.message || "Unknown error"}`,
    };
  }
}

export const ALLOWED_PRESENTATION_DOMAINS = [
  "docs.google.com",
  "drive.google.com",
  "slides.google.com",
  "canva.com",
  "www.canva.com",
];

function isPrivateIpOrHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();
  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }

  // IPv4 range checks
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map(Number);
    if (octets.some((o) => o > 255)) return true; // invalid IP
    const [o1, o2] = octets;
    if (o1 === 127) return true; // 127.0.0.0/8 (Loopback)
    if (o1 === 10) return true; // 10.0.0.0/8 (Private)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12 (Private)
    if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16 (Private)
    if (o1 === 169 && o2 === 254) return true; // 169.254.0.0/16 (Link-local / Cloud metadata)
    if (o1 === 0) return true;
  }

  return false;
}

export function validatePresentationUrl(urlStr: string): { valid: boolean; error?: string; url?: URL } {
  if (!urlStr || !urlStr.trim()) {
    return { valid: false, error: "Presentation URL is required." };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr.trim());
  } catch {
    return { valid: false, error: "Invalid presentation URL format. Please provide a valid HTTPS link." };
  }

  // Enforce HTTPS only
  if (parsed.protocol !== "https:") {
    return { valid: false, error: "Invalid protocol. Only HTTPS presentation links are allowed." };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Explicitly block private/internal IP ranges and local hostnames
  if (isPrivateIpOrHost(hostname)) {
    return {
      valid: false,
      error: "Security violation: Access to local or private network addresses is forbidden.",
    };
  }

  // Strict domain allowlist check
  const isAllowedDomain = ALLOWED_PRESENTATION_DOMAINS.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
  );

  if (!isAllowedDomain) {
    return {
      valid: false,
      error: `Unsupported presentation link domain '${hostname}'. Only Google Slides (docs.google.com, slides.google.com, drive.google.com) and Canva (canva.com) links are permitted.`,
    };
  }

  return { valid: true, url: parsed };
}

/**
 * Extracts plain text from Google Slides or Google Drive presentation link.
 */
export async function extractPresentationFromUrl(pptUrl: string): Promise<ExtractionResult> {
  if (!pptUrl || !pptUrl.trim()) {
    return {
      success: false,
      totalSlidesDetected: 0,
      slides: [],
      rawDocumentText: "",
      errorMessage: "No presentation link provided.",
    };
  }

  const urlValidation = validatePresentationUrl(pptUrl);
  if (!urlValidation.valid) {
    return {
      success: false,
      totalSlidesDetected: 0,
      slides: [],
      rawDocumentText: "",
      errorMessage: urlValidation.error,
    };
  }

  const urlStr = pptUrl.trim();
  console.log(`[Presentation Extractor] Fetching text from URL: ${urlStr}`);

  // 1. Google Slides / Google Drive Presentation link handling
  const googleSlidesMatch =
    urlStr.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/) ||
    urlStr.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);

  if (googleSlidesMatch && googleSlidesMatch[1]) {
    const presentationId = googleSlidesMatch[1];
    const exportTxtUrl = `https://docs.google.com/presentation/d/${presentationId}/export/txt`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(exportTxtUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HackerMate-SIH-Extractor/1.0",
        },
        signal: controller.signal,
        redirect: "manual",
      });

      clearTimeout(timeoutId);

      if (res.status >= 300 && res.status < 400) {
        console.warn("[Presentation Extractor] Blocked redirect from export/txt endpoint");
      } else if (res.ok) {
        const text = await res.text();
        const cleaned = sanitizeExtractedText(text);
        if (cleaned.length > 50) {
          const slideChunks = segmentSlidesFromText(cleaned);
          const structuredSlides = mapToSihSlideStructure(slideChunks, cleaned);
          return {
            success: true,
            totalSlidesDetected: structuredSlides.filter((s) => s.wordCount > 5).length,
            slides: structuredSlides,
            rawDocumentText: cleaned,
          };
        }
      }
    } catch (err: any) {
      console.warn("[Presentation Extractor] Google Slides export/txt fetch failed:", err.message);
    }

    // Secondary attempt: HTML pub view
    const pubUrl = `https://docs.google.com/presentation/d/${presentationId}/pub`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(pubUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HackerMate-SIH-Extractor/1.0",
        },
        signal: controller.signal,
        redirect: "manual",
      });

      clearTimeout(timeoutId);

      if (res.status >= 300 && res.status < 400) {
        console.warn("[Presentation Extractor] Blocked redirect from pub endpoint");
      } else if (res.ok) {
        const html = await res.text();
        const cleaned = stripHtmlToText(html);
        if (cleaned.length > 50) {
          const slideChunks = segmentSlidesFromText(cleaned);
          const structuredSlides = mapToSihSlideStructure(slideChunks, cleaned);
          return {
            success: true,
            totalSlidesDetected: structuredSlides.filter((s) => s.wordCount > 5).length,
            slides: structuredSlides,
            rawDocumentText: cleaned,
          };
        }
      }
    } catch (err: any) {
      console.warn("[Presentation Extractor] Google Slides pub fetch failed:", err.message);
    }
  }

  // 2. Generic Allowlisted Presentation Link (e.g. Canva or Public PDF)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(urlStr, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HackerMate-SIH-Extractor/1.0",
      },
      signal: controller.signal,
      redirect: "manual",
    });

    clearTimeout(timeoutId);

    if (res.status >= 300 && res.status < 400) {
      return {
        success: false,
        totalSlidesDetected: 0,
        slides: [],
        rawDocumentText: "",
        errorMessage: "Redirect responses from presentation links are not supported for security reasons.",
      };
    }

    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/pdf")) {
        const arrBuf = await res.arrayBuffer();
        return extractTextFromPDF(Buffer.from(arrBuf));
      } else if (contentType.includes("text/html") || contentType.includes("text/plain")) {
        const raw = await res.text();
        const cleaned = stripHtmlToText(raw);
        if (cleaned.length > 50) {
          const slideChunks = segmentSlidesFromText(cleaned);
          const structuredSlides = mapToSihSlideStructure(slideChunks, cleaned);
          return {
            success: true,
            totalSlidesDetected: structuredSlides.filter((s) => s.wordCount > 5).length,
            slides: structuredSlides,
            rawDocumentText: cleaned,
          };
        }
      }
    }
  } catch (err: any) {
    console.warn("[Presentation Extractor] Presentation link fetch failed:", err.message);
  }

  return {
    success: false,
    totalSlidesDetected: 0,
    slides: [],
    rawDocumentText: "",
    errorMessage: `Could not access presentation at ${urlStr}. Please verify link sharing permissions (Anyone with link can view).`,
  };
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

  // 2. Normalize vertical tabs and form-feeds to form feed delimiter \f
  let text = rawText.replace(/[\u000b\f]+/g, "\f").replace(/\r\n/g, "\n");

  // 3. Replace SIH template footer transitions with \f
  text = text.replace(/\n+\s*(?:\d{1,2}\s*\n+)?@SIH[^\n]*\n+(?:Your Team Name[^\n]*\n+)?(?:\d{1,2}\s*\n+)?/gi, "\f");

  // 4. Split on "Slide 1:", "Slide 2:", etc. or explicit \f
  text = text.replace(/(?=\n\s*Slide\s*\d+[:.\s])/gi, "\f");

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

function mapToSihSlideStructure(slideChunks: string[], fullText: string): ExtractedSlide[] {
  return SIH_SLIDE_CATEGORIES.map((cat, idx) => {
    let rawText = slideChunks[idx] || "";
    if (!rawText && slideChunks.length === 1 && idx === 0) {
      rawText = fullText;
    }
    const clean = sanitizeExtractedText(rawText);
    const words = clean ? clean.split(/\s+/).filter(Boolean) : [];

    return {
      slideNumber: cat.slideNumber,
      title: cat.title,
      expectedCategory: cat.category,
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
