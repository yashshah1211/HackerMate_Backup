import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { assertSessionLifetime } from "./session";

export type LiveManifest = {
  pythonNames: string[]; scriptNames: string[]; special: Record<string, string[]>;
  nameQuery: string; nameNames: string[]; collegeQuery: string; collegeNames: string[];
  unmatchedQuery: string; excludedNames?: string[];
  nonmatches: Record<string, string[]>;
};
export function liveSettings(env: Readonly<Record<string, string | undefined>> = process.env) {
  const value = env.QA_LIVE_BASE_URL;
  if (!value) return { baseURL: "http://127.0.0.1:3000", blocked: "BLOCKED: QA_LIVE_BASE_URL is missing" };
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("QA base must be an origin without credentials, path or query");
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("QA targets must use HTTP or HTTPS");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const hostname = url.hostname.replace(/\.$/, "");
  const production = env.QA_ENVIRONMENT === "production" || env.QA_ALLOW_PRODUCTION === "1"
    || hostname === "hackermate.in" || hostname.endsWith(".hackermate.in") || hostname === "hackermate.vercel.app";
  if (!local && url.protocol !== "https:") throw new Error("Remote QA requires HTTPS");
  if (production) throw new Error("Automated production execution is disabled: browser interception cannot control server-side effects");
  if (!local && !production && env.QA_ENVIRONMENT !== "staging") throw new Error("Declare QA_ENVIRONMENT=staging for an explicitly configured staging origin");
  const state = env.QA_STORAGE_STATE;
  const manifest = env.QA_FIXTURE_MANIFEST;
  const supabase = env.QA_SUPABASE_URL;
  for (const [path, stateFile] of [[state, true], [manifest, false]] as const) {
    if (!path) continue;
    const location = relative(resolve("."), resolve(path)).split(sep).join("/");
    const inCheckout = !isAbsolute(location) && !location.startsWith("..");
    if (inCheckout && !location.startsWith(".auth/") && !(stateFile && location.endsWith(".storage-state.json"))) {
      throw new Error("Keep private QA files in ignored .auth/ or outside the checkout");
    }
  }
  if (supabase) {
    const database = new URL(supabase);
    if (database.username || database.password || database.search || database.hash || database.pathname !== "/") throw new Error("QA_SUPABASE_URL must be an origin without credentials, path or query");
    if (!["http:", "https:"].includes(database.protocol)) throw new Error("QA targets must use HTTP or HTTPS");
    if (database.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)) throw new Error("Remote Supabase QA requires HTTPS");
  }
  const missing = env.QA_TARGETS_VERIFIED !== "1" ? "QA_TARGETS_VERIFIED=1 attesting the frontend and Supabase pair are approved non-production targets"
    : !supabase ? "QA_SUPABASE_URL" : !state || !existsSync(state) ? "legitimate QA_STORAGE_STATE"
    : !manifest || !existsSync(manifest) ? "QA_FIXTURE_MANIFEST" : null;
  let fixtures: LiveManifest | undefined;
  if (!missing && manifest) {
    try { fixtures = JSON.parse(readFileSync(manifest, "utf8")); }
    catch { throw new Error("QA fixture manifest must be readable valid JSON"); }
    for (const key of ["pythonNames", "scriptNames", "nameNames", "collegeNames"] as const) {
      if (!Array.isArray(fixtures?.[key]) || !fixtures[key].length || !fixtures[key].every(name => typeof name === "string" && name.length > 0)) throw new Error("QA manifest requires non-empty synthetic test-fixture names");
    }
    if (!fixtures || !fixtures.nameQuery || !fixtures.collegeQuery || !fixtures.unmatchedQuery
      || !["C++", "C#", "Node.js"].every(term => Array.isArray(fixtures?.special?.[term]) && fixtures.special[term].length
        && fixtures.special[term].every(name => typeof name === "string" && name.length > 0))) throw new Error("QA fixture manifest is incomplete");
    if (fixtures.excludedNames && (!Array.isArray(fixtures.excludedNames) || !fixtures.excludedNames.every(name => typeof name === "string" && name.length > 0))) throw new Error("Invalid excluded fixture names");
    for (const term of ["python", "script", "C++", "C#", "Node.js", fixtures.nameQuery, fixtures.collegeQuery]) {
      if (!Array.isArray(fixtures.nonmatches?.[term]) || !fixtures.nonmatches[term].length || !fixtures.nonmatches[term].every(name => typeof name === "string" && name.length > 0)) throw new Error("QA manifest requires scoped nonmatches for every search");
    }
    assertSessionLifetime(state!, url.origin);
  }
  return { baseURL: url.origin, supabaseOrigin: supabase ? new URL(supabase).origin : undefined,
    blocked: missing ? `BLOCKED: ${missing} is missing` : undefined, fixtures, production };
}
