import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function isPrivateOrLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower === "169.254.169.254" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }

  // Check private IPv4 ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  const ipParts = lower.split(".").map(Number);
  if (ipParts.length === 4 && ipParts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    if (ipParts[0] === 10) return true;
    if (ipParts[0] === 127) return true;
    if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) return true;
    if (ipParts[0] === 192 && ipParts[1] === 168) return true;
    if (ipParts[0] === 169 && ipParts[1] === 254) return true;
  }

  return false;
}

function resolveUrl(relative: string | null | undefined, base: string): string | null {
  if (!relative) return null;
  try {
    return new URL(relative, base).toString();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  if (isPrivateOrLocalHost(parsed.hostname)) {
    return NextResponse.json({ error: "Private or internal hosts not allowed" }, { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (compatible; HackerMateBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json({
        url: targetUrl,
        domain: parsed.hostname,
        title: parsed.hostname,
        description: null,
        image: null,
        siteName: parsed.hostname,
        favicon: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`,
      });
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return NextResponse.json({
        url: targetUrl,
        domain: parsed.hostname,
        title: parsed.hostname,
        description: null,
        image: null,
        siteName: parsed.hostname,
        favicon: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`,
      });
    }

    // Read first 120KB for fast metadata extraction
    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      let bytesRead = 0;
      const maxBytes = 120 * 1024;
      while (bytesRead < maxBytes) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        bytesRead += value.length;
        html += new TextDecoder("utf-8", { fatal: false }).decode(value, { stream: true });
        if (html.includes("</head>")) break;
      }
      try {
        await reader.cancel();
      } catch {}
    } else {
      html = await res.text();
    }

    const getMeta = (prop: string): string | null => {
      // Matches <meta property="og:..." content="..."> or <meta name="..." content="...">
      const regex1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i");
      const match1 = html.match(regex1);
      if (match1 && match1[1]) return match1[1].trim();

      // Matches inverted <meta content="..." property="og:...">
      const regex2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i");
      const match2 = html.match(regex2);
      if (match2 && match2[1]) return match2[1].trim();

      return null;
    };

    const getTitle = (): string | null => {
      const ogTitle = getMeta("og:title") || getMeta("twitter:title");
      if (ogTitle) return ogTitle;
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return titleMatch && titleMatch[1] ? titleMatch[1].trim() : null;
    };

    const getDescription = (): string | null => {
      return (
        getMeta("og:description") ||
        getMeta("twitter:description") ||
        getMeta("description") ||
        null
      );
    };

    const getImage = (): string | null => {
      const rawImg = getMeta("og:image") || getMeta("twitter:image");
      return resolveUrl(rawImg, targetUrl);
    };

    const getSiteName = (): string => {
      return getMeta("og:site_name") || parsed.hostname.replace(/^www\./, "");
    };

    const getFavicon = (): string => {
      const iconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);
      if (iconMatch && iconMatch[1]) {
        const resolved = resolveUrl(iconMatch[1].trim(), targetUrl);
        if (resolved) return resolved;
      }
      return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
    };

    const metadata = {
      url: targetUrl,
      domain: parsed.hostname.replace(/^www\./, ""),
      title: getTitle() || parsed.hostname,
      description: getDescription(),
      image: getImage(),
      siteName: getSiteName(),
      favicon: getFavicon(),
    };

    return NextResponse.json(metadata, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    });
  } catch (err: unknown) {
    console.error("Link preview error:", err);
    return NextResponse.json(
      {
        url: targetUrl,
        domain: parsed.hostname,
        title: parsed.hostname,
        description: null,
        image: null,
        siteName: parsed.hostname,
        favicon: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`,
      },
      { status: 200 }
    );
  }
}
