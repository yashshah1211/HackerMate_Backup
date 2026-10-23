import type { SupabaseClient } from "@supabase/supabase-js";

export type FormationReport = {
  version: 1; generatedAt: string; start: string; end: string; coverageStart: string;
  coverage: "complete" | "partial" | "unavailable"; cleanupAt: string; endedAt: string | null;
  requests: Record<"submitted" | "applicants" | "mature" | "immature" | "accepted" | "rejected" | "superseded" | "unclassified" | "pending" | "responded7" | "converted" | "unexplained", number> & { decision_p50_hours: number | null; decision_p90_hours: number | null };
  backlog: Record<"pending" | "unknown_age" | "over7" | "over14", number> & { age_p50_days: number | null; age_p90_days: number | null };
  memberships: Record<"episodes" | "people" | "creators" | "joiners" | "unattributed", number>;
  activation: Record<"registrations" | "mature" | "immature" | "activated7" | "creators7" | "joiners7" | "unattributed7", number>;
  removals: number; collaboratingTeams: number; baselineFacts: number; excludedAccounts: number; qualityIssues: number; warnings: string[];
};
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const date = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const groups = {
  requests: ["submitted", "applicants", "mature", "immature", "accepted", "rejected", "superseded", "unclassified", "pending", "responded7", "converted", "unexplained"],
  backlog: ["pending", "unknown_age", "over7", "over14"],
  memberships: ["episodes", "people", "creators", "joiners", "unattributed"],
  activation: ["registrations", "mature", "immature", "activated7", "creators7", "joiners7", "unattributed7"],
} as const;
export function isFormationReport(v: unknown): v is FormationReport {
  if (!record(v) || v.version !== 1 || !["complete", "partial", "unavailable"].includes(String(v.coverage)) ||
    !["generatedAt", "start", "end", "coverageStart", "cleanupAt"].every(k => date(v[k])) || !(v.endedAt === null || date(v.endedAt)) ||
    !Array.isArray(v.warnings) || !v.warnings.every(w => typeof w === "string") ||
    !["removals", "collaboratingTeams", "baselineFacts", "excludedAccounts", "qualityIssues"].every(k => count(v[k]))) return false;
  for (const [key, fields] of Object.entries(groups)) {
    const group = v[key]; if (!record(group) || !fields.every(k => count(group[k]))) return false;
  }
  for (const [key, fields] of [["requests", ["decision_p50_hours", "decision_p90_hours"]], ["backlog", ["age_p50_days", "age_p90_days"]]] as const) {
    const group = v[key] as Record<string, unknown>;
    if (!fields.every(k => group[k] === null || typeof group[k] === "number" && Number.isFinite(group[k]) && group[k] >= 0)) return false;
  }
  const r = v.requests as FormationReport["requests"], a = v.activation as FormationReport["activation"], m = v.memberships as FormationReport["memberships"];
  if (v.coverage === "complete" && ((v.qualityIssues as number) > 0 || r.unclassified > 0 || r.unexplained > 0 || m.unattributed > 0 || v.endedAt !== null ||
    Date.parse(v.start as string) < Date.parse(v.coverageStart as string) || Date.parse(v.cleanupAt as string) < Date.parse(v.generatedAt as string) - 36 * 3600000)) return false;
  return r.submitted === r.mature + r.immature && r.mature === r.accepted + r.rejected + r.superseded + r.unclassified + r.pending &&
    r.responded7 <= r.accepted + r.rejected && r.converted <= r.accepted + r.superseded && r.unexplained <= r.unclassified && r.applicants <= r.submitted &&
    a.registrations === a.mature + a.immature && a.activated7 <= a.mature && a.creators7 + a.joiners7 + a.unattributed7 === a.activated7 &&
    m.episodes === m.creators + m.joiners + m.unattributed && m.people <= m.episodes && Date.parse(v.start as string) < Date.parse(v.end as string);
}

export function parseFormationWindow(params: URLSearchParams, now = new Date()) {
  if ([...params.keys()].some(k => k !== "start" && k !== "end") || params.getAll("start").length > 1 || params.getAll("end").length > 1) throw new Error("Invalid report parameters.");
  const day = 86400000, midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = params.get("start") ?? new Date(midnight - 35 * day).toISOString();
  const end = params.get("end") ?? new Date(midnight - 7 * day).toISOString();
  const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  const from = Date.parse(start), to = Date.parse(end);
  if (!utc.test(start) || !utc.test(end) || !Number.isFinite(from) || !Number.isFinite(to) ||
    new Date(from).toISOString().replace(".000Z", "Z") !== start.replace(".000Z", "Z") ||
    new Date(to).toISOString().replace(".000Z", "Z") !== end.replace(".000Z", "Z") ||
    from >= to || to > now.getTime() || to - from > 60 * day || from < now.getTime() - 87 * day) throw new Error("Use a past UTC window of at most 60 days within the last 87 days.");
  return { start, end };
}

export async function getTeamFormationReport(client: SupabaseClient, window: { start: string; end: string }): Promise<FormationReport> {
  const { data, error } = await client.rpc("get_team_formation_report", { p_start: window.start, p_end: window.end });
  if (error) { console.error("[team-formation] aggregate read failed:", error); throw new Error("Team formation data is unavailable."); }
  if (!isFormationReport(data) || Date.parse(data.start) !== Date.parse(window.start) || Date.parse(data.end) !== Date.parse(window.end)) {
    console.error("[team-formation] aggregate contract could not be verified");
    throw new Error("Team formation data returned an incomplete response.");
  }
  // Return a fixed aggregate DTO; unexpected future database keys must never
  // leak entity IDs or personal fields through an otherwise valid response.
  const pick = (value: object, fields: readonly string[]) => Object.fromEntries(fields.map(key => [key, (value as Record<string, unknown>)[key]]));
  return {
    ...pick(data, ["version", "generatedAt", "start", "end", "coverageStart", "coverage", "cleanupAt", "endedAt", "removals", "collaboratingTeams", "baselineFacts", "excludedAccounts", "qualityIssues", "warnings"]),
    requests: pick(data.requests, [...groups.requests, "decision_p50_hours", "decision_p90_hours"]),
    backlog: pick(data.backlog, [...groups.backlog, "age_p50_days", "age_p90_days"]),
    memberships: pick(data.memberships, groups.memberships), activation: pick(data.activation, groups.activation),
  } as FormationReport;
}
