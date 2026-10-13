import { test, expect } from "@playwright/test";
import { liveSettings } from "../support/live-settings";
import { allowedRead } from "../support/read-only";
import { search, expectNames, builderRows } from "../support/directory";

const settings = liveSettings();
test.beforeEach(async ({ context, page }, testInfo) => {
  if (testInfo.title === "live authentication: signed-out session cannot access the directory") {
    const blocked = !process.env.QA_LIVE_BASE_URL || !settings.supabaseOrigin;
    if (blocked) testInfo.annotations.push({ type: "BLOCKED", description: "Live app and Supabase origin are not configured" });
    test.skip(blocked, "BLOCKED: live app and Supabase origin are not configured");
    return;
  }
  if (settings.blocked) testInfo.annotations.push({ type: "BLOCKED", description: settings.blocked });
  test.skip(Boolean(settings.blocked), settings.blocked);
  await context.route("**/*", async route => {
    const request = route.request();
    if (allowedRead(request.url(), request.method(), settings.baseURL, settings.supabaseOrigin!)) await route.continue();
    else await route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"Read-only browser QA blocked this request"}' });
  });
  await context.routeWebSocket("**", socket => socket.close());
  await page.goto("/developers");
  await expect(page.getByRole("heading", { name: "Builders", exact: true })).toBeVisible();
});
test.afterEach(async ({ context }) => {
  // Clear profile DOM before Playwright's automatic failure-context snapshot.
  // Trace/screenshots remain disabled, and no credentials are logged.
  for (const page of context.pages()) if (!page.isClosed()) await page.goto("about:blank").catch(() => {});
});

for (const term of ["python", "Python", "PYTHON", "script", "C++", "C#", "Node.js"]) {
  test(`live authenticated read: ${term}`, async ({ page }) => {
    const fixtures = settings.fixtures!;
    await search(page, term);
    await expectNames(page, term.toLowerCase() === "python" ? fixtures.pythonNames : term === "script" ? fixtures.scriptNames : fixtures.special[term]);
  });
}
test("live authenticated read: name, college and unmatched result", async ({ page }) => {
  const fixtures = settings.fixtures!;
  await search(page, fixtures.nameQuery); await expectNames(page, fixtures.nameNames);
  await search(page, fixtures.collegeQuery); await expectNames(page, fixtures.collegeNames);
  await search(page, fixtures.unmatchedQuery);
  await expect(page.getByText("No builders match your search", { exact: true })).toBeVisible();
});
test("live authenticated read: RPC does not expose private fields", async ({ page }) => {
  const response = page.waitForResponse(response => new URL(response.url()).pathname === "/rest/v1/rpc/search_builder_profiles");
  await search(page, "python");
  const result = await response;
  expect(result.ok(), "Search RPC must succeed").toBe(true);
  const data: unknown = await result.json();
  expect(Array.isArray(data), "Search RPC must return a row array").toBe(true);
  expect((data as unknown[]).length, "A known QA match is required to check the live projection").toBeGreaterThan(0);
  const allowed = new Set("id,full_name,college,year_of_study,bio,avatar_url,skills,is_available,has_participated_hackathon,hackathon_participations,has_won_hackathon,hackathon_wins,last_seen_at,created_at".split(","));
  // Assert names only, never print response values or headers into artifacts.
  for (const row of data as Record<string, unknown>[]) expect(Object.keys(row).filter(key => !allowed.has(key))).toEqual([]);
});
test("live authenticated read: known blocked/hidden fixtures remain excluded", async ({ page }, testInfo) => {
  const excluded = settings.fixtures!.excludedNames;
  if (!excluded?.length) testInfo.annotations.push({ type: "BLOCKED", description: "No scoped blocked/hidden fixtures configured" });
  test.skip(!excluded?.length, "BLOCKED: no scoped blocked/hidden fixtures configured");
  await search(page, "python"); await expectNames(page, settings.fixtures!.pythonNames);
  for (const name of excluded!) await expect(builderRows(page).getByRole("link", { name, exact: true })).toHaveCount(0);
});
test("live authentication: signed-out session cannot access the directory", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.route("**/*", async route => {
    if (allowedRead(route.request().url(), route.request().method(), settings.baseURL, settings.supabaseOrigin!)) await route.continue(); else await route.abort();
  });
  try { await page.goto(`${settings.baseURL}/developers`); await expect(page).toHaveURL(/\/login\?next=/); }
  finally { await context.close(); }
});
