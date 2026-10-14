import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allowedRead, installStagingGuard } from "../support/read-only";
import { liveSettings } from "../support/live-settings";
import { assertSessionLifetime } from "../support/session";

const app = "https://example.test", database = "https://database.example.test";
test("policy allows verified search only; recommendations, heartbeat and arbitrary reads are denied", () => {
  expect(allowedRead(`${database}/rest/v1/rpc/search_builder_profiles`, "POST", app, database)).toBe(true);
  for (const [method, path] of [["POST", "/rest/v1/rpc/get_recommended_teammates_v3"], ["POST", "/rest/v1/rpc/get_recommended_teammates"], ["PATCH", "/rest/v1/profiles"], ["POST", "/rest/v1/rpc/send_team_invite"], ["POST", "/rest/v1/rpc/accept_team_invite"], ["POST", "/rest/v1/friend_requests"], ["POST", "/auth/v1/token"], ["GET", "/rest/v1/unreviewed_view"]]) {
    expect(allowedRead(`${database}${path}`, method, app, database)).toBe(false);
  }
  expect(allowedRead(`${database}/rest/v1/profiles`, "GET", app, database)).toBe(true);
  expect(allowedRead(`${app}/developers?_rsc=example`, "GET", app, database)).toBe(true);
  expect(allowedRead(`${app}/_next/image?url=/api/cron/job`, "GET", app, database)).toBe(false);
  expect(allowedRead(`${app}/api/cron/anything`, "GET", app, database)).toBe(false);
  expect(allowedRead("https://unapproved.example/event", "POST", app, database)).toBe(false);
});
test("production is disabled even with previous opt-in, aliases or staging labels", () => {
  for (const origin of ["https://hackermate.in/", "https://www.hackermate.in/", "https://hackermate.in./", "https://app.hackermate.in/", "https://hackermate.vercel.app/"]) {
    expect(() => liveSettings({ QA_LIVE_BASE_URL: origin, QA_ENVIRONMENT: "staging" })).toThrow(/production execution is disabled/);
  }
  expect(() => liveSettings({ QA_LIVE_BASE_URL: "https://example.test/", QA_ENVIRONMENT: "production", QA_ALLOW_PRODUCTION: "1" })).toThrow(/production execution is disabled/);
  expect(() => liveSettings({ QA_LIVE_BASE_URL: "http://example.test/", QA_ENVIRONMENT: "staging" })).toThrow(/HTTPS/);
  expect(liveSettings({ QA_LIVE_BASE_URL: app, QA_ENVIRONMENT: "staging", QA_SUPABASE_URL: database }).blocked).toContain("QA_TARGETS_VERIFIED");
});
test("private state and fixture manifests must use ignored paths or stay outside the checkout", () => {
  expect(() => liveSettings({ QA_LIVE_BASE_URL: "http://127.0.0.1:3000/", QA_STORAGE_STATE: "credentials.json" })).toThrow(/ignored .auth/);
  expect(() => liveSettings({ QA_LIVE_BASE_URL: "http://127.0.0.1:3000/", QA_FIXTURE_MANIFEST: "fixtures.json" })).toThrow(/ignored .auth/);
});
test("session expiry checks support normal localStorage and chunked cookies; reject expired or malformed state", () => {
  const folder = mkdtempSync(join(tmpdir(), "qa-session-unit-")); const path = join(folder, "state.json");
  const now = 100_000;
  // Ephemeral fake claims are NEVER used for login or any network request.
  const session = (expires: number) => ({ expires_at: expires,
    access_token: [Buffer.from("unit").toString("base64url"), Buffer.from(JSON.stringify({ exp: expires })).toString("base64url"), "unit"].join(".") });
  const saveLocal = (expires: number) => writeFileSync(path, JSON.stringify({ cookies: [], origins: [{ origin: app, localStorage: [{ name: "sb-unit-auth-token", value: JSON.stringify(session(expires)) }] }] }));
  try {
    saveLocal(now + 3600); expect(() => assertSessionLifetime(path, app, now)).not.toThrow();
    for (const expires of [now - 1, now + 60]) { saveLocal(expires); expect(() => assertSessionLifetime(path, app, now)).toThrow(/30 minutes/); }
    const encoded = "base64-" + Buffer.from(JSON.stringify(session(now + 3600))).toString("base64url");
    writeFileSync(path, JSON.stringify({ cookies: [
      { name: "sb-unit-auth-token.1", domain: "example.test", value: encoded.slice(30) },
      { name: "sb-unit-auth-token.0", domain: "example.test", value: encoded.slice(0, 30) },
    ], origins: [] }));
    expect(() => assertSessionLifetime(path, app, now)).not.toThrow();
    expect(() => assertSessionLifetime(path, "https://other.test", now)).toThrow(/30 minutes/);
    writeFileSync(path, "malformed"); expect(() => assertSessionLifetime(path, app, now)).toThrow(/30 minutes/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test.describe("Chromium request guard against a loopback synthetic server", () => {
  let appOrigin: string, dbOrigin: string, outsideOrigin: string;
  const servers: Server[] = []; const received: string[] = [];
  let redirect: { status: number; target: string } | undefined;
  async function listen(kind: string) {
    const server = createServer((request, response) => {
      received.push(`${kind} ${request.method} ${new URL(request.url!, 'http://local').pathname}`);
      response.setHeader("Access-Control-Allow-Origin", "*");
      if (redirect && (kind === "db" || new URL(request.url!, 'http://local').searchParams.has("redirect"))) {
        response.writeHead(redirect.status, { Location: redirect.target }); response.end();
      } else if (kind === "app") { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><p>Synthetic QA server</p>"); }
      else { response.setHeader("Content-Type", "application/json"); response.end("[]"); }
    });
    servers.push(server); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }
  test.beforeAll(async () => { appOrigin = await listen("app"); dbOrigin = await listen("db"); outsideOrigin = await listen("outside"); });
  test.afterAll(async () => { await Promise.all(servers.map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))); });
  test.beforeEach(async ({ context, page }) => {
    redirect = undefined; received.length = 0;
    await installStagingGuard(context, appOrigin, dbOrigin); await page.goto(`${appOrigin}/developers`);
    received.length = 0;
  });
  test("search is forwarded once; recommendations and disallowed methods never reach the server", async ({ page }) => {
    const send = (path: string, method: string) => page.evaluate(async ({ url, method }) => (await fetch(url, { method })).status, { url: dbOrigin + path, method });
    expect(await send("/rest/v1/rpc/search_builder_profiles", "POST")).toBe(200);
    expect(received).toEqual(["db POST /rest/v1/rpc/search_builder_profiles"]); received.length = 0;
    for (const rpc of ["get_recommended_teammates_v3", "get_recommended_teammates"]) expect(await send(`/rest/v1/rpc/${rpc}`, "POST")).toBe(200);
    for (const [path, method] of [["/rest/v1/profiles", "PATCH"], ["/rest/v1/rpc/send_team_invite", "POST"], ["/auth/v1/token", "POST"]]) expect(await send(path, method)).toBe(403);
    expect(received).toEqual([]);
  });
  for (const status of [307, 308]) for (const target of ["mutation", "outside", "wrong-method"]) {
    test(`${status} cannot forward POST to ${target}`, async ({ page }) => {
      redirect = { status, target: target === "mutation" ? `${dbOrigin}/rest/v1/profiles` : target === "outside" ? `${outsideOrigin}/mutation` : `${appOrigin}/developers` };
      const result = await page.evaluate(async url => (await fetch(url, { method: "POST" })).status, `${dbOrigin}/rest/v1/rpc/search_builder_profiles`);
      expect(result).toBe(403);
      expect(received).toEqual(["db POST /rest/v1/rpc/search_builder_profiles"]);
    });
  }
  test("GET redirects and popup navigation cannot reach an unapproved destination", async ({ context, page }) => {
    redirect = { status: 302, target: `${outsideOrigin}/mutation` };
    const popup = await context.newPage();
    expect((await popup.goto(`${appOrigin}/developers?redirect=1`))?.status()).toBe(403);
    expect(received).toEqual(["app GET /developers"]);
    await popup.close();
    expect((await page.goto(`${appOrigin}/developers?redirect=1`))?.status()).toBe(403);
    expect(received).toEqual(["app GET /developers", "app GET /developers"]);
  });
  test("signed-out login redirect is inspected but never followed", async ({ page }) => {
    redirect = { status: 307, target: `${appOrigin}/login?next=%2Fdevelopers` };
    const response = await page.goto(`${appOrigin}/developers?redirect=1`);
    expect(response?.status()).toBe(403); expect(response?.headers()["x-qa-auth-redirect"]).toBe("login");
    expect(received).toEqual(["app GET /developers"]);
  });
});
