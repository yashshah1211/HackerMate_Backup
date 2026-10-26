import { NextRequest, NextResponse } from "next/server";
import { fetchPublicHtml, isBlockedDestinationError } from "@/lib/net/publicHttpFetch";

export const runtime = "nodejs";

/** Resolves page-supplied links against the final page URL; only http(s) results are returned. */
function resolveUrl(relative: string | null | undefined, base: URL): string | null {
  if (!relative) return null;
  try {
    const resolved = new URL(relative, base);
    return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.toString() : null;
  } catch {
    return null;
  }
}

// The metadata regexes below backtrack super-linearly on crafted input, and synchronous CPU work
// cannot be interrupted by the fetch deadline. They only ever match within one tag (`>` may appear
// only inside the quoted value), so run them per tag on bounded, non-overlapping slices.
const MAX_TAG_CHARS = 2048;

/** Index of the first `>` outside a quoted attribute value, or -1 within MAX_TAG_CHARS. */
function findTagEnd(html: string, start: number): number {
  let quote = "";
  const limit = Math.min(html.length, start + MAX_TAG_CHARS);
  for (let i = start; i < limit; i++) {
    const char = html[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return i;
    }
  }
  return -1;
}

function collectTags(html: string, name: string): string[] {
  const tags: string[] = [];
  const opener = new RegExp(`<${name}`, "gi");
  let match: RegExpExecArray | null;
  while ((match = opener.exec(html))) {
    const end = findTagEnd(html, match.index);
    if (end !== -1) tags.push(html.slice(match.index, end + 1));
    // Slices never overlap, so total regex work stays bounded by the 120 KB body.
    opener.lastIndex = end === -1 ? match.index + MAX_TAG_CHARS : end + 1;
  }
  return tags;
}

/** Linear equivalent of /<title[^>]*>([^<]+)<\/title>/i. */
function findTitle(html: string): string | null {
  const opener = /<title/gi;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(html))) {
    const end = html.indexOf(">", match.index);
    if (end === -1) return null;
    const close = html.indexOf("<", end + 1);
    if (close === -1) return null;
    if (close > end + 1 && html.slice(close, close + 8).toLowerCase() === "</title>") {
      return html.slice(end + 1, close).trim();
    }
    opener.lastIndex = end + 1;
  }
  return null;
}

function defaultFavicon(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
}

function fallbackMetadata(targetUrl: string, hostname: string) {
  return {
    url: targetUrl,
    domain: hostname,
    title: hostname,
    description: null,
    image: null,
    siteName: hostname,
    favicon: defaultFavicon(hostname),
  };
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

  let fetched: Awaited<ReturnType<typeof fetchPublicHtml>>;
  try {
    // Validates every hop, pins DNS to the validated public address, one 4s deadline for everything.
    fetched = await fetchPublicHtml(parsed);
  } catch (err: unknown) {
    if (isBlockedDestinationError(err)) {
      return NextResponse.json({ error: "Destination not allowed" }, { status: 403 });
    }
    console.error("Link preview error:", err);
    return NextResponse.json(fallbackMetadata(targetUrl, parsed.hostname), { status: 200 });
  }

  if (fetched.html === null) {
    return NextResponse.json(fallbackMetadata(targetUrl, parsed.hostname));
  }

  const html = fetched.html;
  const baseUrl = fetched.finalUrl;
  const metaTags = collectTags(html, "meta");
  const linkTags = collectTags(html, "link");

  const firstMatch = (tags: string[], regex: RegExp): string | null => {
    for (const tag of tags) {
      const match = tag.match(regex);
      if (match && match[1]) return match[1].trim();
    }
    return null;
  };

  const getMeta = (prop: string): string | null => {
    // Matches <meta property="og:..." content="..."> or <meta name="..." content="...">
    const regex1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i");
    // Matches inverted <meta content="..." property="og:...">
    const regex2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i");
    return firstMatch(metaTags, regex1) || firstMatch(metaTags, regex2);
  };

  const getTitle = (): string | null => {
    const ogTitle = getMeta("og:title") || getMeta("twitter:title");
    if (ogTitle) return ogTitle;
    return findTitle(html);
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
    return resolveUrl(rawImg, baseUrl);
  };

  const getSiteName = (): string => {
    return getMeta("og:site_name") || parsed.hostname.replace(/^www\./, "");
  };

  const getFavicon = (): string => {
    const icon = firstMatch(linkTags, /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);
    if (icon) {
      const resolved = resolveUrl(icon, baseUrl);
      if (resolved) return resolved;
    }
    return defaultFavicon(parsed.hostname);
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
}
