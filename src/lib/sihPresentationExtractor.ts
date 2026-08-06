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
          console.log(`[SIH Extractor] Successfully extracted ${cleaned.length} chars via Google Slides export/txt`);
          return cleaned.slice(0, 4000);
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
          console.log(`[SIH Extractor] Successfully extracted ${cleaned.length} chars via Google Slides pub HTML`);
          return cleaned.slice(0, 4000);
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
            console.log(`[SIH Extractor] Successfully extracted ${cleaned.length} chars via web fetch`);
            return cleaned.slice(0, 4000);
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
