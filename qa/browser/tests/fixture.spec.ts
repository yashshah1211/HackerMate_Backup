import { test, expect } from "@playwright/test";
import { builderRows, search, expectNames, openFilters, closeFilters } from "../support/directory";

test.beforeEach(async ({ page }) => {
  await page.goto("/developers");
  await expectNames(page, ["QA Python Builder", "QA Script Builder", "QA Name Builder"], true);
});

for (const term of ["python", "Python", "PYTHON", "script", "C++", "C#", "Node.js", "React Native"]) {
  test(`fixture browser: ${term} search`, async ({ page }) => {
    await search(page, term);
    await expectNames(page, [term.toLowerCase().includes("python") || term === "React Native" ? "QA Python Builder" : "QA Script Builder"], true);
  });
}
test("fixture browser: name, college, unmatched and clear", async ({ page }) => {
  await search(page, "QA Name Builder"); await expectNames(page, ["QA Name Builder"], true);
  await search(page, "QA Alpha College"); await expectNames(page, ["QA Python Builder", "QA Name Builder"], true);
  await search(page, "no-such-fixture");
  await expect(page.getByText("No builders match your search", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset search", exact: true }).click();
  await expectNames(page, ["QA Python Builder", "QA Script Builder", "QA Name Builder"], true);
});
test("fixture browser: filters combine with search and reset on both viewports", async ({ page }) => {
  await search(page, "script"); await expectNames(page, ["QA Script Builder"], true);
  await openFilters(page);
  await page.getByRole("switch", { name: "Only builders available for a team" }).filter({ visible: true }).click();
  await closeFilters(page);
  await expect(page.getByText("No builders match your criteria", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset search", exact: true }).click();
  await expectNames(page, ["QA Python Builder", "QA Script Builder", "QA Name Builder"], true);
});
test("fixture browser: stale success cannot overwrite the latest browser result", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const start = new Promise<void>(resolve => { started = resolve; });
  await page.route("**/__qa/query", async route => {
    const data = route.request().postDataJSON();
    if (data.rpc === "search_builder_profiles" && data.args.p_query === "Python") { started(); await held; }
    await route.continue();
  });
  await search(page, "Python"); await start;
  await search(page, "script"); await expectNames(page, ["QA Script Builder"], true);
  const oldResponse = page.waitForResponse(response => response.url().endsWith("/__qa/query") && response.request().postDataJSON()?.args?.p_query === "Python");
  release(); await oldResponse;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expectNames(page, ["QA Script Builder"], true);
});
test("fixture browser: debounce uses the final term, and latest errors preserve Retry", async ({ page }) => {
  await page.clock.install();
  const terms: string[] = [];
  await page.route("**/__qa/query", async route => {
    const data = route.request().postDataJSON();
    if (data.rpc === "search_builder_profiles") terms.push(data.args.p_query);
    await route.continue();
  });
  await search(page, "python"); await search(page, "script");
  await page.clock.runFor(299); expect(terms).toEqual([]);
  await page.clock.runFor(1); await expectNames(page, ["QA Script Builder"], true);
  expect(terms).toEqual(["script"]);
  await page.unroute("**/__qa/query");
  await page.route("**/__qa/query", async route => {
    if (route.request().postDataJSON().rpc === "search_builder_profiles") await route.fulfill({ json: { data: null, error: { message: "Fixture network failure" } } });
    else await route.continue();
  });
  await search(page, "python"); await page.clock.runFor(300);
  await expect(page.getByText("Couldn't load builders", { exact: true })).toBeVisible();
  await expect(page.getByText("No builders yet", { exact: true })).toHaveCount(0);
  await page.unroute("**/__qa/query"); await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expectNames(page, ["QA Python Builder"], true);
});
test("fixture browser: blocked/self exclusions and safe RPC projection", async ({ page }) => {
  const response = page.waitForResponse(response => response.url().endsWith("/__qa/query") && response.request().postDataJSON()?.rpc === "search_builder_profiles");
  await search(page, "python");
  const payload = await (await response).json();
  const allowed = new Set("id,full_name,college,year_of_study,bio,avatar_url,skills,is_available,has_participated_hackathon,hackathon_participations,has_won_hackathon,hackathon_wins,last_seen_at,created_at".split(","));
  for (const row of payload.data) expect(Object.keys(row).filter(key => !allowed.has(key))).toEqual([]);
  await expectNames(page, ["QA Python Builder"], true);
  for (const name of ["QA Blocked Builder", "QA Reverse Blocked Builder", "QA Hidden Builder", "QA Viewer"]) await expect(builderRows(page).getByRole("link", { name, exact: true })).toHaveCount(0);
});
test("fixture browser: responsive directory has no horizontal overflow", async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(builderRows(page).getByRole("link", { name: "QA Python Builder", exact: true })).toBeVisible();
});
