import { test, expect, type Page } from "@playwright/test";
import { liveSettings } from "../support/live-settings";
import { installStagingGuard } from "../support/read-only";
import { assertSessionLifetime } from "../support/session";
import { completedQuery, searchRows, assertServerNames, assertPublicProjection } from "../support/queries";
import { search, expectNames, builderRows } from "../support/directory";

const settings = liveSettings();
const signedOutTitle = "live authentication: signed-out response redirects to login without following it";
test.beforeEach(async ({ context, page }, testInfo) => {
  // Refuse capture overrides before loading private state into any page.
  expect(testInfo.project.use.trace, "Live tracing must be disabled").toBe("off");
  expect(testInfo.project.use.screenshot, "Live screenshots must be disabled").toBe("off");
  expect(testInfo.project.use.video, "Live video must be disabled").toBe("off");
  const guest = testInfo.title === signedOutTitle;
  const blocked = guest
    ? !process.env.QA_LIVE_BASE_URL || !settings.supabaseOrigin || process.env.QA_TARGETS_VERIFIED !== "1" ? "BLOCKED: verified non-production targets are missing" : undefined
    : settings.blocked;
  if (blocked) testInfo.annotations.push({ type: "BLOCKED", description: blocked });
  test.skip(Boolean(blocked), blocked);
  if (guest) return;
  assertSessionLifetime(process.env.QA_STORAGE_STATE!, settings.baseURL);
  await installStagingGuard(context, settings.baseURL, settings.supabaseOrigin!);
  const response = await completedQuery(page, { term: "" }, () => page.goto("/developers"));
  await searchRows(response);
  await expect(page.getByRole("heading", { name: "Builders", exact: true })).toBeVisible();
});
test.afterEach(async ({ context }) => {
  for (const page of context.pages()) if (!page.isClosed()) await page.goto("about:blank").catch(() => {});
});

async function liveSearch(page: Page, term: string, matches: string[], nonmatches: string[]) {
  const response = await completedQuery(page, { term }, () => search(page, term));
  const rows = await searchRows(response);
  assertServerNames(rows, matches, nonmatches);
  assertPublicProjection(rows);
  await expectNames(page, matches);
  for (const name of nonmatches) await expect(builderRows(page).getByRole("link", { name, exact: true })).toHaveCount(0);
  return rows;
}
for (const term of ["python", "Python", "PYTHON", "script", "C++", "C#", "Node.js"]) {
  test(`live authenticated staging read: ${term}`, async ({ page }) => {
    const fixtures = settings.fixtures!;
    const key = term.toLowerCase() === "python" ? "python" : term;
    await liveSearch(page, term, key === "python" ? fixtures.pythonNames : key === "script" ? fixtures.scriptNames : fixtures.special[key], fixtures.nonmatches[key]);
  });
}
test("live authenticated staging read: name, college and unmatched result", async ({ page }) => {
  const fixtures = settings.fixtures!;
  await liveSearch(page, fixtures.nameQuery, fixtures.nameNames, fixtures.nonmatches[fixtures.nameQuery]);
  await liveSearch(page, fixtures.collegeQuery, fixtures.collegeNames, fixtures.nonmatches[fixtures.collegeQuery]);
  const rows = await liveSearch(page, fixtures.unmatchedQuery, [], [...fixtures.nameNames, ...fixtures.collegeNames]);
  expect(rows.length === 0, "Unmatched RPC must return no rows").toBe(true);
  await expect(page.getByText("No builders match your search", { exact: true })).toBeVisible();
});
test("live authenticated staging read: RPC does not expose private fields", async ({ page }) => {
  await liveSearch(page, "python", settings.fixtures!.pythonNames, settings.fixtures!.nonmatches.python);
});
test("live authenticated staging read: known blocked/hidden fixtures remain excluded", async ({ page }, testInfo) => {
  const excluded = settings.fixtures!.excludedNames;
  if (!excluded?.length) testInfo.annotations.push({ type: "BLOCKED", description: "No scoped blocked/hidden fixtures configured" });
  test.skip(!excluded?.length, "BLOCKED: no scoped blocked/hidden fixtures configured");
  await liveSearch(page, "python", settings.fixtures!.pythonNames, settings.fixtures!.nonmatches.python);
  for (const name of excluded!) await expect(builderRows(page).getByRole("link", { name, exact: true })).toHaveCount(0);
});
test(signedOutTitle, async ({ browser }, testInfo) => {
  // Preserve the project's desktop/mobile device options; remove its session.
  const device = testInfo.project.use;
  const context = await browser.newContext({ viewport: device.viewport, userAgent: device.userAgent,
    isMobile: device.isMobile, hasTouch: device.hasTouch, deviceScaleFactor: device.deviceScaleFactor,
    reducedMotion: "reduce", storageState: { cookies: [], origins: [] }, serviceWorkers: "block" });
  try {
    await installStagingGuard(context, settings.baseURL, settings.supabaseOrigin!);
    const page = await context.newPage();
    const response = await page.goto(`${settings.baseURL}/developers`);
    expect(response?.headers()["x-qa-auth-redirect"], "Real signed-out route must request the expected login redirect").toBe("login");
    expect(response?.status()).toBe(403); // Guard rejects ALL HTTP redirect hops.
    await expect(page.getByRole("heading", { name: "Builders", exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});
