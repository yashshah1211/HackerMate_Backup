import type { BrowserContext } from "@playwright/test";

const tables = new Set(["profiles", "teams", "blocked_users", "friend_requests"]);
const recommendations = new Set(["get_recommended_teammates_v3", "get_recommended_teammates"]);
export function allowedRead(rawURL: string, method: string, baseOrigin: string, supabaseOrigin: string) {
  const url = new URL(rawURL);
  if (url.username || url.password) return false;
  if (url.origin === supabaseOrigin) {
    if (url.pathname === "/rest/v1/rpc/search_builder_profiles") return method === "POST";
    if (!["GET", "HEAD"].includes(method)) return false;
    return url.pathname === "/auth/v1/user" || tables.has(url.pathname.replace(/^\/rest\/v1\//, ""));
  }
  if (url.origin !== baseOrigin || !["GET", "HEAD"].includes(method)) return false;
  return ["/developers", "/login", "/favicon.ico"].includes(url.pathname)
    || url.pathname.startsWith("/_next/static/") || /^\/[A-Za-z0-9_-]+\.(svg|png|webp|ico)$/.test(url.pathname);
}

export async function installStagingGuard(context: BrowserContext, app: string, database: string) {
  await context.routeWebSocket("**", socket => socket.close());
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
    if (url.origin === database && request.method() === "POST" && rpc && recommendations.has(rpc)) {
      // Initialization is optional. Never send these conditional-write RPCs.
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    const reject = (authRedirect = false) => route.fulfill({ status: 403,
      contentType: "application/json", headers: authRedirect ? { "x-qa-auth-redirect": "login" } : {},
      body: '{"message":"Staging QA blocked this request or redirect"}' });
    if (!allowedRead(request.url(), request.method(), app, database)) { await reject(); return; }
    // continue() does not revalidate redirects. Fetch exactly one hop; never
    // forward an HTTP redirect to the browser or automatically follow it.
    try {
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 20_000 });
      try {
        if (response.status() >= 300 && response.status() < 400) {
          const location = response.headers().location;
          const target = location ? new URL(location, request.url()) : null;
          const authRedirect = request.method() === "GET" && url.origin === app && url.pathname === "/developers"
            && target?.origin === app && target.pathname === "/login" && target.searchParams.get("next") === "/developers";
          await reject(Boolean(authRedirect));
        } else await route.fulfill({ response });
      } finally { await response.dispose(); }
    } catch {
      // Never propagate a fetch call log containing authentication headers.
      await reject();
    }
  });
}
