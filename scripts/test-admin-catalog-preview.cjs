/* eslint-disable @typescript-eslint/no-require-imports -- Isolated admin-route/client regressions. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { NextRequest, NextResponse } = require("next/server");
const { harness } = require("./ppt-vision-harness.cjs");

const url = "https://www.hackermate.in/api/admin/hackathon-catalog-preview";
const result = { success: true, dryRun: true, checked: 3, discovered: 7, remaining: 4,
  message: "Catalog: 3 source checks; preview only. No organizer emails sent." };
function routeFixture({ email = "yashshah7117@gmail.com", denied = false, fails = false, badResult = false } = {}) {
  const calls = [];
  const h = harness({
    "@/lib/admin/requireAdmin": {
      async requireAdmin() {
        calls.push("auth");
        return denied ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
          : { user: { email }, supabaseAdmin: { fixture: true } };
      },
    },
    "@/lib/hackathons/synchronize": {
      async synchronizeCatalog(client, options) {
        calls.push("catalog");
        assert.equal(client.fixture, true);
        assert.equal(options.dryRun, true, "writer mode must be impossible");
        assert.equal(Object.hasOwn(options, "mode"), false);
        if (fails) throw Error("Synthetic private service outage");
        return badResult ? { ...result, dryRun: false } : result;
      },
    },
  });
  h.env.OUTREACH_ADMIN_EMAIL = "approved@example.org";
  return { calls, route: h.load("src/app/api/admin/hackathon-catalog-preview/route.ts") };
}

test("catalog preview GET requires founder/approved admin, calls dry run only, and exposes summary not evidence", async () => {
  for (const email of ["yashshah7117@gmail.com", "approved@example.org"]) {
    const { calls, route } = routeFixture({ email });
    assert.equal(typeof route.POST, "undefined");
    const res = await route.GET(new NextRequest(url, { method: "GET" }));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("cache-control"), /no-store/);
    assert.match(res.headers.get("content-type"), /application\\/json/);
    const body = await res.json();
    assert.deepEqual({ ...body }, result);
    assert.deepEqual(calls, ["auth", "catalog"]);
  }
});

test("unlisted administrator is forbidden before the catalog query", async () => {
  const { calls, route } = routeFixture({ email: "other-admin@example.org" });
  const res = await route.GET(new NextRequest(url));
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /restricted/);
  assert.deepEqual(calls, ["auth"]);
});

test("middleware/identity denial stops work without exposing catalog data", async () => {
  const { calls, route } = routeFixture({ denied: true });
  const res = await route.GET(new NextRequest(url));
  assert.equal(res.status, 401);
  assert.deepEqual(calls, ["auth"]);
});

test("provider errors fail closed with JSON and no details or write-mode fallback", async () => {
  for (const options of [{ fails: true }, { badResult: true }]) {
    const { calls, route } = routeFixture(options);
    const res = await route.GET(new NextRequest(url));
    assert.equal(res.status, 503);
    assert.match(res.headers.get("content-type"), /application\\/json/);
    const body = await res.json();
    assert.match(body.error, /temporarily unavailable/);
    assert(!JSON.stringify(body).includes("Synthetic private service"));
    assert.deepEqual(calls, ["auth", "catalog"]);
  }
});

test("UI requests the separate safe GET endpoint rather than the WAF-blocked scraper", async () => {
  const route = fs.readFileSync(path.join(__dirname, "../src/app/api/admin/hackathon-catalog-preview/route.ts"), "utf8");
  const client = fs.readFileSync(path.join(__dirname, "../src/lib/admin/catalogPreviewClient.ts"), "utf8");
  const UI = fs.readFileSync(path.join(__dirname, "../src/app/admin/_tabs/OutreachTab.tsx"), "utf8");
  assert.match(route, /synchronizeCatalog\\(auth.supabaseAdmin, \\{ dryRun: true \\}\\)/);
  assert.doesNotMatch(route, /reviewLegacyEvidenceBatch|mode:\\s*["']sync["']|\\.rpc\\(/);
  assert.match(client, /\\/api\\/admin\\/hackathon-catalog-preview/);
  assert.doesNotMatch(client, /fetch\\(["']\\/api\\/admin\\/scrape-unstop/);
  assert.match(UI, /await requestCatalogPreview\\(\\)/);
});

test("client parses a successful dry-run summary without sending a write request", async () => {
  const h = harness(), { requestCatalogPreview } = h.load("src/lib/admin/catalogPreviewClient.ts");
  let count = 0;
  const p = await requestCatalogPreview(async (target, init) => {
    count++;
    assert.equal(target, "/api/admin/hackathon-catalog-preview");
    assert.equal(init.method, "GET");
    assert.equal(init.cache, "no-store");
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.body, undefined);
    return new Response(JSON.stringify(result), { status: 200,
      headers: { "Content-Type": "application/json" } });
  });
  assert.equal(count, 1);
  assert.equal(p.checked, 3);
  assert.equal(p.discovered, 7);
  assert.match(p.message, /No organizer emails sent/);
});

test("plain-text 403 Forbidden produces a useful error, not a JSON syntax error", async () => {
  const h = harness(), { requestCatalogPreview } = h.load("src/lib/admin/catalogPreviewClient.ts");
  await assert.rejects(
    () => requestCatalogPreview(async () => new Response("Forbidden", { status: 403,
      headers: { "Content-Type": "text/plain" } })),
    /blocked by site security \\(HTTP 403\\)/
  );
});

test("JSON access denial, HTML 500, and non-JSON 200 all avoid false success", async () => {
  const h = harness(), { requestCatalogPreview } = h.load("src/lib/admin/catalogPreviewClient.ts");
  await assert.rejects(
    () => requestCatalogPreview(async () => new Response(JSON.stringify({ error: "Unauthorized" }),
      { status: 403, headers: { "Content-Type": "application/json" } })),
    /refresh your administrator session/
  );
  await assert.rejects(
    () => requestCatalogPreview(async () => new Response("<html>bad gateway</html>",
      { status: 500, headers: { "Content-Type": "text/html" } })),
    /HTTP 500/
  );
  await assert.rejects(
    () => requestCatalogPreview(async () => new Response("not JSON",
      { status: 200, headers: { "Content-Type": "text/plain" } })),
    /unexpected response/
  );
});

test("JSON success without dryRun=true is rejected", async () => {
  const h = harness(), { requestCatalogPreview } = h.load("src/lib/admin/catalogPreviewClient.ts");
  await assert.rejects(
    () => requestCatalogPreview(async () => new Response(JSON.stringify({ ...result, dryRun: false }),
      { status: 200, headers: { "Content-Type": "application/json" } })),
    /unexpected response/
  );
});
