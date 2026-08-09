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

  // 1. If explicit [Slide N] markers exist, split and re-label
  if (/\[Slide\s*\d+\]/i.test(rawText)) {
    const rawChunks = rawText.split(/\[Slide\s*\d+\]/i).map((s) => s.trim()).filter((s) => s.length > 10);
    return rawChunks.map((slideContent, idx) => `[Slide ${idx + 1}]\n${slideContent}`).join("\n\n");
  }

  // 2. Normalize vertical tabs (\u000b) and form-feeds (\f) to explicit slide break marker \f
  let text = rawText.replace(/[\u000b\f]+/g, "\f").replace(/\r\n/g, "\n");

  // 3. Replace SIH template footer transitions with \f
  text = text.replace(/\n+\s*(?:\d{1,2}\s*\n+)?@SIH[^\n]*\n+(?:Your Team Name[^\n]*\n+)?(?:\d{1,2}\s*\n+)?/gi, "\f");

  // 4. Replace "Slide 1:", "Slide 2:", etc. with \f Slide 1:
  text = text.replace(/(?=\n\s*Slide\s*\d+[:.\s])/gi, "\f");

  // 5. Split on \f
  const chunks = text.split(/\f+/).map((s) => s.trim()).filter(Boolean);

  // 6. Filter out empty or non-content chunks
  const validSlides = chunks.filter((chunk) => {
    const cleaned = chunk
      .replace(/^@SIH[^\n]*/gm, "")
      .replace(/^Your Team Name/gm, "")
      .replace(/^\d{1,2}$/gm, "")
      .trim();
    return cleaned.length > 10;
  });

  if (validSlides.length <= 1) {
    return rawText;
  }

  return validSlides
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
