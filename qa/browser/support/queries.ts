import { expect, type Page, type Request, type Response } from "@playwright/test";

export type Query = { term: string; sort?: "fit" | "active" | "new" };
export function isBuilderQuery(request: Request, { term, sort = "fit" }: Query) {
  const url = new URL(request.url());
  if (url.pathname === "/__qa/query") {
    const body = request.postDataJSON();
    return term.trim()
      ? body.rpc === "search_builder_profiles" && body.args.p_query === term.trim() && body.args.p_sort === sort
      : body.table === "profiles" && !body.filters?.id && body.limit === 1000 && body.order === (sort === "active" ? "last_seen_at" : "created_at");
  }
  if (term.trim()) {
    if (url.pathname !== "/rest/v1/rpc/search_builder_profiles" || request.method() !== "POST") return false;
    const args = request.postDataJSON();
    return args.p_query === term.trim() && args.p_sort === sort;
  }
  return url.pathname === "/rest/v1/profiles" && request.method() === "GET"
    && url.searchParams.get("limit") === "1000"
    && Boolean(url.searchParams.get("order")?.startsWith(sort === "active" ? "last_seen_at." : "created_at."));
}

export async function completedResponse(page: Page, request: Request) {
  const response = await request.response();
  if (!response || await response.finished()) throw new Error("Builder query did not finish");
  // Fixture-only thenable marks completion after the awaiting hook resumes.
  // Ignored stale responses cause no React commit, but still reach this marker.
  if (new URL(request.url()).pathname === "/__qa/query") {
    await page.waitForFunction(id => window.__qaSettled?.includes(id), request.postDataJSON().requestId);
  }
  return response;
}

export async function completedQuery(page: Page, query: Query, action: () => Promise<unknown>, timeout = 10_000) {
  // Capture a NEW request, not a late response from an earlier identical query.
  const pending = page.waitForRequest(request => isBuilderQuery(request, query), { timeout });
  void pending.catch(() => {});
  await action();
  return completedResponse(page, await pending);
}

export async function searchRows(response: Response) {
  expect(response.ok(), "Builder HTTP query must succeed").toBe(true);
  const payload = await response.json();
  const fixture = new URL(response.url()).pathname === "/__qa/query";
  if (fixture) expect(payload.error === null, "Builder query must succeed").toBe(true);
  const rows: unknown = fixture ? payload.data : payload;
  expect(Array.isArray(rows), "Builder query must return rows").toBe(true);
  return rows as Record<string, unknown>[];
}

export function assertServerNames(rows: Record<string, unknown>[], matches: string[], nonmatches: string[] = []) {
  // Boolean assertions avoid dumping live profile records into failure reports.
  expect(matches.every(name => rows.some(row => row.full_name === name)), "Server response must contain the configured matches").toBe(true);
  expect(nonmatches.every(name => rows.every(row => row.full_name !== name)), "Server response must exclude the configured nonmatches").toBe(true);
}

export function assertPublicProjection(rows: Record<string, unknown>[]) {
  const allowed = new Set("id,full_name,college,year_of_study,bio,avatar_url,skills,is_available,has_participated_hackathon,hackathon_participations,has_won_hackathon,hackathon_wins,last_seen_at,created_at".split(","));
  expect(rows.every(row => Object.keys(row).every(key => allowed.has(key))), "Search RPC must expose only public columns").toBe(true);
}

declare global { interface Window { __qaSettled?: number[] } }
