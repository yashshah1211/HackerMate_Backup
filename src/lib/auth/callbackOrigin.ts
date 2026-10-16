const PUBLIC_ORIGINS = ["https://hackermate.in", "https://www.hackermate.in"];

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function parseOrigin(value: string, localDevelopment: boolean): string | null {
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (isLoopback(url.hostname)) {
      return localDevelopment && (url.protocol === "http:" || url.protocol === "https:") ? url.origin : null;
    }
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Request origins must match explicit deployment configuration. Never derive an
 * allowlist entry from Host/Forwarded headers, a query parameter, or a wildcard.
 * Exact preview/branch origins retain their own PKCE cookies and redirects.
 */
export function trustedCallbackOrigin(requestUrl: string): string | null {
  const localDevelopment = process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1";
  const allowed = new Set(PUBLIC_ORIGINS);
  const configuredSite = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredSite) {
    const origin = parseOrigin(configuredSite, localDevelopment);
    if (origin) allowed.add(origin);
  }
  for (const hostname of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    // Vercel supplies bare hostnames. Invalid configuration never adds an origin.
    if (!hostname || hostname.length > 253
      || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(hostname)) continue;
    const origin = parseOrigin(`https://${hostname}`, false);
    if (origin) allowed.add(origin);
  }
  try {
    const url = new URL(requestUrl);
    if (url.username || url.password) return null;
    if (localDevelopment && isLoopback(url.hostname)) return parseOrigin(url.origin, true);
    return allowed.has(url.origin) ? url.origin : null;
  } catch {
    return null;
  }
}
