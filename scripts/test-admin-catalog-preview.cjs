/* eslint-disable @typescript-eslint/no-require-imports -- Isolated admin catalog boundary regressions. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { NextRequest, NextResponse } = require("next/server");
const { harness } = require("./ppt-vision-harness.cjs");

const url = "https://www.hackermate.in/api/admin/hackathon-catalog-preview";
const result = {
  success: true, dryRun: true, snapshotOnly: true,
  total: 170, withSourceMetadata: 142, archived: 10,
  message: "Catalog snapshot: 170 saved listings, 142 with source metadata, 10 archived. No live source checks, changes or emails.",
};

function fixture({ email = "yashshah7117@gmail.com", denied = false, failure = false, invalidCount = false } = {}) {
  const events = [];
  const db = {
    from(table) {
      events.push(["read", table]);
      assert.equal(table, "hackathons");
      let kind = "all";
      return {
        select(columns, options) {
          events.push(["select", columns, options]);
          assert.equal(columns, "id");
          assert.deepEqual({ ...options }, { count: "exact", head: true });
          return this;
        },
        not(column, op, value) {
          assert.deepEqual([column, op, value], ["source_metadata", "is", null]);
          kind = "metadata";
          return this;
        },
        eq(column, value) {
          assert.deepEqual([column, value], ["archived", true]);
          kind = "archived";
          return this;
        },
        abortSignal(signal) {
          assert(signal && typeof signal.addEventListener === "function");
          return this;
        },
        then(resolve, reject) {
          events.push(["count", kind]);
          const count = kind === "metadata" ? result.withSourceMetadata : kind === "archived" ? result.archived : result.total;
          return Promise.resolve({ count: invalidCount ? null : count, error: failure ? { message: "offline fixture error" } : null })
            .then(resolve, reject);
        },
      };
    },
    rpc() { throw Error("Preview must never call an RPC writer"); },
  };
  const h = harness({
    "@/lib/admin/requireAdmin": {
      async requireAdmin() {
        events.push(["auth"]);
        return denied
          ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
          : { user: { email }, supabaseAdmin: db };
      },
    },
    "@/lib/hackathons/synchronize": {
      synchronizeCatalog() { throw Error("External source discovery is forbidden from dashboard preview"); },
    },
  });
  h.env.OUTREACH_ADMIN_EMAIL = "approved@example.org";
  return { events, route: h.load("src/app/api/admin/hackathon-catalog-preview/route.ts") };
}

test("authorized GET fetches only three read-only catalog counts and no provider network requests", async () => {
  for (const email of ["yashshah7117@gmail.com", "approved@example.org"]) {
    const { events, route } = fixture({ email });
    assert.equal(typeof route.POST, "undefined");
    const response = await route.GET(new NextRequest(url));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.deepEqual({ ...(await response.json()) }, result);
    assert.equal(events.filter(([name]) => name === "read").length, 3);
    assert.equal(events.filter(([name]) => name === "count").length, 3);
    assert.equal(events[0][0], "auth");
    assert(events.every(([name]) => ["auth", "read", "select", "count"].includes(name)));
  }
});

test("unlisted admins are denied before querying the catalog", async () => {
  const { events, route } = fixture({ email: "unlisted@example.org" });
  const res = await route.GET(new NextRequest(url));
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /restricted/);
  assert.deepEqual(events, [["auth"]]);
});

test("failed authentication prevents any privileged read", async () => {
  const { events, route } = fixture({ denied: true });
  const res = await route.GET(new NextRequest(url));
  assert.equal(res.status, 401);
  assert.deepEqual(events, [["auth"]]);
});

test("failed catalog counts or null counts report 503 without pretending the preview succeeded", async () => {
  for (const options of [{ failure: true }, { invalidCount: true }]) {
    const { route, events } = fixture(options);
    const res = await route.GET(new NextRequest(url));
    assert.equal(res.status, 503);
    assert.match(res.headers.get("content-type"), /application\/json/);
    assert.match((await res.json()).error, /temporarily unavailable/);
    assert.equal(events.filter(([name]) => name === "count").length, 3);
  }
});

test("dashboard preview is separate from the blocked route and cannot synchronize/write", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/app/api/admin/hackathon-catalog-preview/route.ts"), "utf8");
  const client = fs.readFileSync(path.join(__dirname, "../src/lib/admin/catalogPreviewClient.ts"), "utf8");
  const UI = fs.readFileSync(path.join(__dirname, "../src/app/admin/_tabs/OutreachTab.tsx"), "utf8");
  assert.match(source, /AbortSignal\.timeout\(9000\)/);
  assert.match(source, /head: true/);
  assert.doesNotMatch(source, /synchronizeCatalog|discoverSources|new SourceTransport|\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
  assert.match(client, /\/api\/admin\/hackathon-catalog-preview/);
  assert.match(client, /AbortSignal\.timeout\(12000\)/);
  assert.doesNotMatch(client, /fetch\(["']\/api\/admin\/scrape-unstop/);
  assert.match(UI, /await requestCatalogPreview\(\)/);
  assert.match(UI, /setCatalogSnapshot\(preview\)/);
  assert.match(UI, /Loading snapshot\.\.\./);
});

test("client returns validated saved catalog snapshot with bounded GET request", async () => {
  const h = harness(), { requestCatalogPreview } = h.load("src/lib/admin/catalogPreviewClient.ts");
  let count = 0;
  const x = await requestCatalogPreview(async (target, init) => {
    count++;
    assert.equal(target, "/api/admin/hackathon-catalog-preview");
    assert.equal(init.method, "GET");
    assert.equal(init.cache, "no-store");
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.body, undefined);
    assert(init.signal && typeof init.signal.addEventListener === "function");
    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(count, 1);
  assert.equal(x.snapshotOnly, true);
  assert.equal(x.total, 170);
  assert.equal(x.withSourceMetadata, 142);
  assert.equal(x.archived, 10);
});

test("a plain-text WAF 403 never becomes a JSON syntax exception", async () => {
  const h = harness(), { requestCatalogPreview } = h.load("src/lib/admin/catalogPreviewClient.ts");
  await assert.rejects(() => requestCatalogPreview(async () =>
    new Response("Forbidden", { status: 403, headers: { "content-type": "text/plain" } })),
    /blocked by site security \(HTTP 403\)/);
});

test("client rejects JSON 403, HTML 500 and non-JSON 200 without false success", async () => {
  const h = harness(), { requestCatalogPreview } = h.load("src/lib/admin/catalogPreviewClient.ts");
  await assert.rejects(() => requestCatalogPreview(async () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403, headers: { "content-type": "application/json" } })),
    /refresh your administrator session/);
  await assert.rejects(() => requestCatalogPreview(async () =>
    new Response("<html>failed</html>", { status: 500, headers: { "content-type": "text/html" } })),
    /HTTP 500/);
  await assert.rejects(() => requestCatalogPreview(async () =>
    new Response("not JSON", { status: 200, headers: { "content-type": "text/plain" } })),
    /unexpected response/);
});

test("client rejects previous slow-sync contract, conflicting totals, and missing snapshot flag", async () => {
  const h = harness(), { requestCatalogPreview } = h.load("src/lib/admin/catalogPreviewClient.ts");
  const bad = [
    { success: true, dryRun: true, checked: 3, discovered: 5 },
    { ...result, snapshotOnly: false },
    { ...result, withSourceMetadata: 500 },
    { ...result, archived: 300 },
    { ...result, total: null },
    { ...result, dryRun: false },
  ];
  for (const data of bad) {
    await assert.rejects(() => requestCatalogPreview(async () =>
      new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } })),
      /unexpected response/);
  }
});
