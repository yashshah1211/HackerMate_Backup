/**
 * Presentation Slide Text Extractor for HackerMate SIH Evaluator
 * Fetches plain text content from Google Slides, Google Drive links, and web presentations.
 */

export async function extractPresentationText(pptUrl: string): Promise<string> {
  if (!pptUrl || !pptUrl.trim()) {
    console.log("[SIH Extractor] No presentation link provided.");
    return "(No presentation link provided)";
  }

  const urlStr = pptUrl.trim();
  console.log(`[SIH Extractor] Extracting presentation text from: ${urlStr}`);

  // 1. Google Slides / Google Drive Presentation Handling
  const googleSlidesMatch =
    urlStr.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/) ||
    urlStr.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);

  if (googleSlidesMatch && googleSlidesMatch[1]) {
    const presentationId = googleSlidesMatch[1];
    const exportTxtUrl = `https://docs.google.com/presentation/d/${presentationId}/export/txt`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

      const res = await fetch(exportTxtUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HackerMate-SIH-Extractor/1.0",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        const cleaned = sanitizeExtractedText(text);
        if (cleaned.length > 50) {
          const segmented = segmentPresentationSlides(cleaned);
          console.log(`[SIH Extractor] Successfully extracted & segmented ${segmented.length} chars via Google Slides export/txt`);
          return segmented.slice(0, 5000);
        }
      }
    } catch (err: any) {
      console.warn("[SIH Extractor] Google Slides export/txt fetch failed:", err.message);
    }

    // Secondary attempt: HTML pub view
    const pubUrl = `https://docs.google.com/presentation/d/${presentationId}/pub`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(pubUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HackerMate-SIH-Extractor/1.0",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const html = await res.text();
        const cleaned = stripHtmlToText(html);
        if (cleaned.length > 50) {
          const segmented = segmentPresentationSlides(cleaned);
          console.log(`[SIH Extractor] Successfully extracted & segmented ${segmented.length} chars via Google Slides pub HTML`);
          return segmented.slice(0, 5000);
        }
      }
    } catch (err: any) {
      console.warn("[SIH Extractor] Google Slides pub fetch failed:", err.message);
    }
  }

  // 2. Generic Web Presentation Link / Public PDF / Pitch Page
  if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(urlStr, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HackerMate-SIH-Extractor/1.0",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("text/html") || contentType.includes("text/plain")) {
          const raw = await res.text();
          const cleaned = stripHtmlToText(raw);
          if (cleaned.length > 50) {
            const segmented = segmentPresentationSlides(cleaned);
            console.log(`[SIH Extractor] Successfully extracted & segmented ${segmented.length} chars via web fetch`);
            return segmented.slice(0, 5000);
          }
        }
      }
    } catch (err: any) {
      console.warn("[SIH Extractor] Generic fetch failed:", err.message);
    }
  }

  console.warn(`[SIH Extractor] Text extraction unavailable for link: ${urlStr}. Returning metadata fallback indicator.`);
  return `(Presentation hosted at ${urlStr}. Extracting raw text was unavailable due to host security settings. Evaluate based on problem statement metadata and project details.)`;
}

export function segmentPresentationSlides(rawText: string): string {
  if (!rawText || !rawText.trim()) return rawText;
  if (/\[Slide\s*\d+\]/i.test(rawText)) return rawText;

  let rawSlides: string[] = [];

  // Form-feed split (\f)
  if (rawText.includes("\f")) {
    rawSlides = rawText.split(/\f+/).map((s) => s.trim()).filter(Boolean);
  }

  // Split on SIH template footer numbers: e.g. "\n2\n@SIH" or "\n3\n@SIH" or "\n\d+\n"
  if (rawSlides.length <= 1) {
    const lines = rawText.split("\n");
    const tempSlides: string[] = [];
    let currentChunk: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Check if line is a standalone slide number (e.g. "2", "3", "8") or footer "@SIH"
      const isSlideNum = /^\d{1,2}$/.test(line);
      const isSihFooter = /^@SIH/i.test(line) || /^Your Team Name$/i.test(line);
      const isNextHeading = /^(TITLE PAGE|IDEA TITLE|PROPOSED SOLUTION|TECHNICAL APPROACH|FEASIBILITY AND VIABILITY|IMPACT AND BENEFITS|RESEARCH AND REFERENCES|IMPORTANT INSTRUCTIONS)$/i.test(line);

      if ((isNextHeading || (isSlideNum && currentChunk.length > 3)) && currentChunk.length > 0) {
        const textChunk = currentChunk.join("\n").trim();
        if (textChunk.length > 20) {
          tempSlides.push(textChunk);
        }
        currentChunk = [line];
      } else {
        currentChunk.push(lines[i]);
      }
    }

    if (currentChunk.length > 0) {
      const textChunk = currentChunk.join("\n").trim();
      if (textChunk.length > 10) tempSlides.push(textChunk);
    }

    if (tempSlides.length > 1) {
      rawSlides = tempSlides;
    }
  }

  if (rawSlides.length <= 1) {
    return rawText;
  }

  return rawSlides
    .map((slideContent, idx) => `[Slide ${idx + 1}]\n${slideContent}`)
    .join("\n\n");
}

function sanitizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtmlToText(html: string): string {
  return html
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
