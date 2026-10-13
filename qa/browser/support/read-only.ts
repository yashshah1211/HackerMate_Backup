const readRPCs = new Set(["search_builder_profiles", "get_recommended_teammates_v3", "get_recommended_teammates"]);
export function allowedRead(rawURL: string, method: string, baseOrigin: string, supabaseOrigin: string) {
  const url = new URL(rawURL);
  if (url.origin === supabaseOrigin) {
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
    if (rpc) return ["GET", "HEAD", "POST"].includes(method) && readRPCs.has(rpc);
    if (!["GET", "HEAD"].includes(method)) return false;
    return url.pathname === "/auth/v1/user" || /^\/rest\/v1\/[A-Za-z_]+$/.test(url.pathname);
  }
  if (url.origin !== baseOrigin || !["GET", "HEAD"].includes(method)) return false;
  return ["/developers", "/login", "/favicon.ico"].includes(url.pathname)
    || url.pathname.startsWith("/_next/") || /^\/[A-Za-z0-9_-]+\.(svg|png|webp|ico)$/.test(url.pathname);
}
