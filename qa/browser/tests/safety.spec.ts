import { test, expect } from "@playwright/test";
import { allowedRead } from "../support/read-only";
import { liveSettings } from "../support/live-settings";
const app = "https://example.test", database = "https://database.example.test";
test("read-only policy permits only known search/matching RPCs and blocks business and heartbeat writes", () => {
  for (const rpc of ["search_builder_profiles", "get_recommended_teammates_v3", "get_recommended_teammates"]) {
    expect(allowedRead(`${database}/rest/v1/rpc/${rpc}`, "POST", app, database)).toBe(true);
  }
  for (const [method, path] of [["PATCH", "/rest/v1/profiles"], ["POST", "/rest/v1/rpc/send_team_invite"], ["POST", "/rest/v1/rpc/accept_team_invite"], ["POST", "/rest/v1/friend_requests"], ["POST", "/auth/v1/token"]]) {
    expect(allowedRead(`${database}${path}`, method, app, database)).toBe(false);
  }
  expect(allowedRead(`${database}/rest/v1/profiles`, "GET", app, database)).toBe(true);
  expect(allowedRead(`${app}/developers?_rsc=example`, "GET", app, database)).toBe(true);
  expect(allowedRead(`${app}/api/cron/anything`, "GET", app, database)).toBe(false);
  expect(allowedRead("https://unapproved.example/event", "POST", app, database)).toBe(false);
});
test("production cannot run without explicit opt-in or be labelled staging", () => {
  expect(() => liveSettings({ QA_LIVE_BASE_URL: "https://hackermate.in/", QA_ENVIRONMENT: "staging" })).toThrow(/Production QA requires/);
  expect(() => liveSettings({ QA_LIVE_BASE_URL: "https://hackermate.in/", QA_ENVIRONMENT: "production" })).toThrow(/Production QA requires/);
  expect(liveSettings({ QA_LIVE_BASE_URL: "https://hackermate.in/", QA_ENVIRONMENT: "production", QA_ALLOW_PRODUCTION: "1" }).blocked).toContain("QA_STORAGE_STATE");
  expect(() => liveSettings({ QA_LIVE_BASE_URL: "http://example.test/", QA_ENVIRONMENT: "staging" })).toThrow(/HTTPS/);
});
test("private state and fixture manifests must use ignored paths or stay outside the checkout", () => {
  expect(() => liveSettings({ QA_LIVE_BASE_URL: "http://127.0.0.1:3000/", QA_STORAGE_STATE: "credentials.json" })).toThrow(/ignored .auth/);
  expect(() => liveSettings({ QA_LIVE_BASE_URL: "http://127.0.0.1:3000/", QA_FIXTURE_MANIFEST: "fixtures.json" })).toThrow(/ignored .auth/);
});
