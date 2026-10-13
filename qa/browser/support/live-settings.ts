import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type LiveManifest = {
  pythonNames: string[]; scriptNames: string[]; special: Record<string, string[]>;
  nameQuery: string; nameNames: string[]; collegeQuery: string; collegeNames: string[];
  unmatchedQuery: string; excludedNames?: string[];
};
export function liveSettings(env: Readonly<Record<string, string | undefined>> = process.env) {
  const value = env.QA_LIVE_BASE_URL;
  if (!value) return { baseURL: "http://127.0.0.1:3000", blocked: "BLOCKED: QA_LIVE_BASE_URL is missing" };
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("QA base must be an origin without credentials, path or query");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const production = env.QA_ENVIRONMENT === "production" || ["hackermate.in", "www.hackermate.in"].includes(url.hostname);
  if (!local && url.protocol !== "https:") throw new Error("Remote QA requires HTTPS");
  if (production && (env.QA_ENVIRONMENT !== "production" || env.QA_ALLOW_PRODUCTION !== "1")) throw new Error("Production QA requires QA_ENVIRONMENT=production and QA_ALLOW_PRODUCTION=1");
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
    if (database.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)) throw new Error("Remote Supabase QA requires HTTPS");
  }
  const missing = !state || !existsSync(state) ? "legitimate QA_STORAGE_STATE"
    : !manifest || !existsSync(manifest) ? "QA_FIXTURE_MANIFEST" : !supabase ? "QA_SUPABASE_URL" : null;
  let fixtures: LiveManifest | undefined;
  if (!missing && manifest) {
    fixtures = JSON.parse(readFileSync(manifest, "utf8"));
    for (const key of ["pythonNames", "scriptNames", "nameNames", "collegeNames"] as const) {
      if (!Array.isArray(fixtures?.[key]) || !fixtures[key].length || !fixtures[key].every(name => typeof name === "string" && name.length > 0)) throw new Error("QA manifest requires non-empty synthetic test-fixture names");
    }
    if (!fixtures || !fixtures.nameQuery || !fixtures.collegeQuery || !fixtures.unmatchedQuery
      || !["C++", "C#", "Node.js"].every(term => Array.isArray(fixtures?.special?.[term]) && fixtures.special[term].length)) throw new Error("QA fixture manifest is incomplete");
  }
  return { baseURL: url.origin, supabaseOrigin: supabase ? new URL(supabase).origin : undefined,
    blocked: missing ? `BLOCKED: ${missing} is missing` : undefined, fixtures, production };
}
