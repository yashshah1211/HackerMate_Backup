import { test, expect, type Page, type Request } from "@playwright/test";
import { builderRows, search, searchBox, expectNames, openFilters, closeFilters } from "../support/directory";
import { completedQuery, completedResponse, isBuilderQuery, searchRows, assertServerNames, assertPublicProjection, type Query } from "../support/queries";

const names = ["QA Python Builder", "QA Script Builder", "QA Name Builder"];
const loading = (page: Page) => page.getByText("Loading the network…", { exact: true });
const error = (page: Page) => page.getByText("Couldn't load builders", { exact: true });
async function checkSearch(page: Page, term: string, matches: string[]) {
  const response = await completedQuery(page, { term }, () => search(page, term));
  const rows = await searchRows(response);
  assertServerNames(rows, matches, names.filter(name => !matches.includes(name)));
  await expectNames(page, matches, true);
  await expect(loading(page)).toHaveCount(0);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function hold(page: Page, query: Query) {
  const started = deferred<Request>();
  const release = deferred<"success" | "error" | "reverse">();
  let used = false;
  await page.route("**/__qa/query", async route => {
    if (used || !isBuilderQuery(route.request(), query)) { await route.fallback(); return; }
    used = true; started.resolve(route.request());
    const outcome = await release.promise;
    if (outcome === "error") await route.fulfill({ json: { data: null, error: { message: "Synthetic stale failure" } } });
    else if (outcome === "reverse") {
      const response = await route.fetch();
      const payload = await response.json(); payload.data.reverse();
      await route.fulfill({ json: payload }); await response.dispose();
    } else await route.continue();
  });
  return { request: started.promise, release: (outcome: "success" | "error" | "reverse" = "success") => release.resolve(outcome) };
}

test.beforeEach(async ({ page }) => {
  const response = await completedQuery(page, { term: "" }, () => page.goto("/developers"));
  assertServerNames(await searchRows(response), names);
  await expectNames(page, names, true);
});

for (const term of ["python", "Python", "PYTHON", "script", "C++", "C#", "Node.js", "React Native"]) {
  test(`fixture browser: ${term} completes the matching server search`, async ({ page }) => {
    await checkSearch(page, term, [term.toLowerCase() === "python" || term === "React Native" ? names[0] : names[1]]);
  });
}
test("fixture browser: paused debounce cannot pass a server-search assertion", async ({ page }) => {
  await page.clock.install(); await page.clock.pauseAt(new Date());
  // Client filtering can already show the expected row. The new helper must fail
  // if its exact RPC never starts. This is a failure deadline, not a timing sleep.
  const absent = completedQuery(page, { term: "python" }, () => search(page, "python"), 200);
  const failed = expect(absent).rejects.toThrow(/Timeout/);
  await expectNames(page, [names[0]], true);
  await failed;
  const response = await completedQuery(page, { term: "python" }, () => page.clock.runFor(300));
  assertServerNames(await searchRows(response), [names[0]], [names[1]]);
});
test("fixture browser: name, college, unmatched and clear", async ({ page }) => {
  await checkSearch(page, names[2], [names[2]]);
  await checkSearch(page, "QA Alpha College", [names[0], names[2]]);
  await checkSearch(page, "no-such-fixture", []);
  await expect(page.getByText("No builders match your search", { exact: true })).toBeVisible();
  await completedQuery(page, { term: "" }, () => page.getByRole("button", { name: "Reset search", exact: true }).click());
  await expectNames(page, names, true);
});
test("fixture browser: filters combine with search and reset on both viewports", async ({ page }) => {
  await checkSearch(page, "script", [names[1]]);
  await openFilters(page);
  await page.getByRole("switch", { name: "Only builders available for a team" }).filter({ visible: true }).click();
  await closeFilters(page);
  await expect(page.getByText("No builders match your criteria", { exact: true })).toBeVisible();
  await completedQuery(page, { term: "" }, () => page.getByRole("button", { name: "Reset search", exact: true }).click());
  await expectNames(page, names, true);
});
for (const outcome of ["success", "error"] as const) {
  test(`fixture browser: stale ${outcome} cannot overwrite latest success`, async ({ page }) => {
    const old = await hold(page, { term: "Python" });
    await search(page, "Python"); const request = await old.request;
    await checkSearch(page, "script", [names[1]]);
    old.release(outcome); await completedResponse(page, request);
    await expectNames(page, [names[1]], true);
    await expect(error(page)).toHaveCount(0); await expect(loading(page)).toHaveCount(0);
  });
}
test("fixture browser: stale completion cannot clear a newer loading state", async ({ page }) => {
  const old = await hold(page, { term: "Python" });
  await search(page, "Python"); const a = await old.request;
  const latest = await hold(page, { term: "script" });
  await search(page, "script"); const b = await latest.request;
  await expect(loading(page)).toBeVisible();
  old.release("error"); await completedResponse(page, a);
  await expect(loading(page)).toBeVisible(); await expect(error(page)).toHaveCount(0);
  latest.release(); assertServerNames(await searchRows(await completedResponse(page, b)), [names[1]], [names[0]]);
  await expectNames(page, [names[1]], true); await expect(loading(page)).toHaveCount(0);
});
test("fixture browser: latest error survives older success, Retry wins", async ({ page }) => {
  const old = await hold(page, { term: "Python" });
  await search(page, "Python"); const a = await old.request;
  await page.route("**/__qa/query", async route => {
    if (isBuilderQuery(route.request(), { term: "script" })) await route.fulfill({ json: { data: null, error: { message: "Synthetic current failure" } } });
    else await route.fallback();
  });
  await completedQuery(page, { term: "script" }, () => search(page, "script"));
  await expect(error(page)).toBeVisible(); await expect(loading(page)).toHaveCount(0);
  old.release(); await completedResponse(page, a);
  await expect(error(page)).toBeVisible(); await expect(page.getByText("No builders yet", { exact: true })).toHaveCount(0);
  await page.unroute("**/__qa/query");
  const result = await completedQuery(page, { term: "script" }, () => page.getByRole("button", { name: "Retry", exact: true }).click());
  assertServerNames(await searchRows(result), [names[1]], [names[0]]);
  await expectNames(page, [names[1]], true); await expect(error(page)).toHaveCount(0);
});
test("fixture browser: sort changes during a pending search use the latest request", async ({ page }) => {
  const old = await hold(page, { term: "QA" });
  await search(page, "QA"); const a = await old.request;
  const active = await hold(page, { term: "QA", sort: "active" });
  await openFilters(page);
  await page.getByRole("tab", { name: "Active", exact: true }).click(); const b = await active.request;
  const response = await completedQuery(page, { term: "QA", sort: "new" }, () => page.getByRole("tab", { name: "New", exact: true }).click());
  assertServerNames(await searchRows(response), names);
  active.release("error"); await completedResponse(page, b);
  // Distinct old ordering makes stale success observable, beyond checking errors.
  old.release("reverse"); await completedResponse(page, a);
  await expect(page.getByRole("tab", { name: "New", exact: true })).toHaveAttribute("aria-selected", "true");
  await closeFilters(page);
  await expectNames(page, names, true);
  await expect(builderRows(page).first().getByRole("link", { name: names[0], exact: true })).toBeVisible();
  await expect(error(page)).toHaveCount(0);
});
test("fixture browser: clear invalidates a pending search", async ({ page }) => {
  const old = await hold(page, { term: "python" });
  await search(page, "python"); const a = await old.request;
  const response = await completedQuery(page, { term: "" }, () => searchBox(page).fill(""));
  assertServerNames(await searchRows(response), names);
  old.release(); await completedResponse(page, a);
  await expectNames(page, names, true); await expect(error(page)).toHaveCount(0);
});
test("fixture browser: Retry supersedes an identical pending query", async ({ page }) => {
  await page.route("**/__qa/query", async route => {
    if (isBuilderQuery(route.request(), { term: "python" })) await route.fulfill({ json: { data: null, error: { message: "Synthetic current failure" } } });
    else await route.fallback();
  });
  await completedQuery(page, { term: "python" }, () => search(page, "python")); await expect(error(page)).toBeVisible();
  await page.unroute("**/__qa/query");
  const old = await hold(page, { term: "python" });
  await page.getByRole("button", { name: "Retry", exact: true }).click(); const a = await old.request;
  // Retry remains actionable with the current error while the first retry waits.
  const result = await completedQuery(page, { term: "python" }, () => page.getByRole("button", { name: "Retry", exact: true }).click());
  assertServerNames(await searchRows(result), [names[0]], [names[1]]);
  old.release("error"); await completedResponse(page, a);
  await expectNames(page, [names[0]], true); await expect(error(page)).toHaveCount(0);
});
test("fixture browser: debounce sends only the final query", async ({ page }) => {
  await page.clock.install(); await page.clock.pauseAt(new Date());
  const terms: string[] = [];
  await page.route("**/__qa/query", async route => {
    const body = route.request().postDataJSON();
    if (body.rpc === "search_builder_profiles") terms.push(body.args.p_query);
    await route.continue();
  });
  await search(page, "python"); await search(page, "script");
  await page.clock.runFor(299); expect(terms).toEqual([]);
  const response = await completedQuery(page, { term: "script" }, () => page.clock.runFor(1));
  assertServerNames(await searchRows(response), [names[1]], [names[0]]);
  expect(terms).toEqual(["script"]); await expectNames(page, [names[1]], true);
});
test("fixture browser: initially empty data waits for completion before onboarding empty state", async ({ page }) => {
  // Override only the list read on the new navigation, preserving initialization.
  const started = deferred<Request>(); const release = deferred<void>();
  await page.route("**/__qa/query", async route => {
    if (isBuilderQuery(route.request(), { term: "" })) { started.resolve(route.request()); await release.promise; await route.fulfill({ json: { data: [], error: null } }); }
    else await route.continue();
  });
  await page.reload(); const request = await started.promise;
  await expect(loading(page)).toBeVisible(); await expect(page.getByText("No builders yet", { exact: true })).toHaveCount(0);
  release.resolve(); expect(await searchRows(await completedResponse(page, request))).toEqual([]);
  await expect(page.getByText("No builders yet", { exact: true })).toBeVisible();
  await expect(error(page)).toHaveCount(0); await expect(loading(page)).toHaveCount(0);
});
test("fixture browser: blocked/self exclusions and safe RPC projection", async ({ page }) => {
  const response = await completedQuery(page, { term: "python" }, () => search(page, "python"));
  const rows = await searchRows(response); assertServerNames(rows, [names[0]], [names[1], "QA Hidden Builder"]); assertPublicProjection(rows);
  await expectNames(page, [names[0]], true);
  for (const name of ["QA Blocked Builder", "QA Reverse Blocked Builder", "QA Hidden Builder", "QA Viewer"]) await expect(builderRows(page).getByRole("link", { name, exact: true })).toHaveCount(0);
});
test("fixture browser: responsive directory has no horizontal overflow", async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(builderRows(page).getByRole("link", { name: names[0], exact: true })).toBeVisible();
});
