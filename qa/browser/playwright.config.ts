import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { liveSettings } from "./support/live-settings";

const live = liveSettings();
// Suppress automatic DOM failure snapshots, including on interrupted cleanup.
// Live reports remain private because assertion text can identify QA fixtures.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
const state = process.env.QA_STORAGE_STATE;
const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {};

export default defineConfig({
  testDir: "./tests", fullyParallel: false, workers: 1, retries: 0,
  timeout: 30_000, expect: { timeout: 10_000 },
  outputDir: resolve("test-results/browser-qa"),
  reporter: [["list"], ["html", { outputFolder: resolve("playwright-report"), open: "never" }]],
  use: { launchOptions, reducedMotion: "reduce", serviceWorkers: "block", video: "off" },
  webServer: {
    cwd: resolve("."),
    command: "node qa/browser/fixture-server.mjs", url: "http://127.0.0.1:4173/__qa/health",
    reuseExistingServer: false, timeout: 60_000,
  },
  projects: [
    { name: "safety", testMatch: "safety.spec.ts" },
    ...["desktop", "mobile"].map(kind => ({
      name: `fixture-${kind}`, testMatch: "fixture.spec.ts",
      use: { ...(kind === "mobile" ? devices["Pixel 7"] : { viewport: { width: 1440, height: 1000 } }),
        baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" as const, screenshot: "only-on-failure" as const },
    })),
    ...["desktop", "mobile"].map(kind => ({
      name: `live-${kind}`, testMatch: "live.spec.ts",
      use: { ...(kind === "mobile" ? devices["Pixel 7"] : { viewport: { width: 1440, height: 1000 } }),
        baseURL: live.baseURL, storageState: !live.blocked && state && existsSync(state) ? state : undefined,
        // Live traces can include Authorization headers and cookies. Never capture them.
        trace: "off" as const, screenshot: "off" as const },
    })),
  ],
});
