import type { OrganizerParticipant } from "./organizer";

export type WorkspaceTab = "overview" | "participants" | "teams";
export type WorkspaceMetrics = {
  registration_count: number; team_count: number; participants_in_team: number; participants_without_team: number;
  confirmed_count: number; waitlisted_count: number; looking_for_team_count: number; looking_without_team_count: number;
};
export type WorkspaceTeam = {
  team_id: string; team_name: string; member_count: number; registered_member_count: number;
  is_recruiting: boolean | null; roles_needed: string[]; max_members: number | null;
  event_min_team_size: number | null; event_max_team_size: number | null;
  roster: { user_id: string; full_name: string | null; registered_for_event: boolean }[];
};
export type WorkspacePagination = { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean };
export type OverviewData = { section: "overview"; retrievedAt: string; metrics: WorkspaceMetrics };
export type ParticipantsData = { section: "participants"; retrievedAt: string; rows: OrganizerParticipant[]; pagination: WorkspacePagination };
export type TeamsData = { section: "teams"; retrievedAt: string; rows: WorkspaceTeam[]; pagination: WorkspacePagination };
export type WorkspaceData = OverviewData | ParticipantsData | TeamsData;
export class WorkspaceReadError extends Error {
  constructor(readonly status: number, message = "This section is temporarily unavailable.") { super(message); }
}

const participantKeys = { pSearch: "search", pCollege: "college", pSkill: "skill", pStatus: "status",
  pTeamState: "teamState", pLooking: "lookingForTeam", pSort: "sort" };
const teamKeys = { tSearch: "search", tRecruiting: "recruiting", tSizeState: "sizeState", tSort: "sort" };
const choices: Record<string, string[]> = {
  tab: ["overview", "participants", "teams"], pStatus: ["confirmed", "waitlisted"],
  pTeamState: ["in_team", "without_team"], pLooking: ["true", "false"], pSort: ["newest", "oldest", "name_asc", "name_desc"],
  tRecruiting: ["true", "false"], tSizeState: ["below_min", "above_max", "within_limits"],
  tSort: ["name_asc", "name_desc", "newest", "oldest", "size_asc", "size_desc"],
};

export function workspaceParams(input: URLSearchParams, confirmedLimits: boolean): URLSearchParams {
  const result = new URLSearchParams();
  for (const key of ["tab", ...Object.keys(participantKeys), ...Object.keys(teamKeys), "pPage", "tPage"]) {
    const value = input.get(key)?.trim();
    if (!value || input.getAll(key).length !== 1 || key === "tSizeState" && !confirmedLimits) continue;
    if (key.endsWith("Page")) {
      if (/^[1-9][0-9]*$/.test(value) && Number(value) <= 40_001) result.set(key, value);
    } else if (choices[key]) {
      if (choices[key].includes(value)) result.set(key, value);
    } else result.set(key, value.slice(0, key === "pSkill" ? 100 : 200));
  }
  return result;
}

export function workspaceTab(params: URLSearchParams): WorkspaceTab {
  const tab = params.get("tab");
  return tab === "participants" || tab === "teams" ? tab : "overview";
}

export function workspaceHref(slug: string, params: URLSearchParams, changes: Record<string, string | null>): string {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "") next.delete(key); else next.set(key, value);
  }
  const query = next.toString();
  return `/partners/${encodeURIComponent(slug)}/organizer${query ? `?${query}` : ""}`;
}

export function sectionQuery(tab: WorkspaceTab, params: URLSearchParams): URLSearchParams {
  const result = new URLSearchParams({ section: tab });
  if (tab === "overview") return result;
  result.set("page", params.get(tab === "participants" ? "pPage" : "tPage") || "1");
  result.set("pageSize", "25");
  for (const [key, apiKey] of Object.entries(tab === "participants" ? participantKeys : teamKeys)) {
    const value = params.get(key);
    if (value) result.set(apiKey, value);
  }
  return result;
}

export function participantExportUrl(slug: string, params: URLSearchParams): string {
  const query = new URLSearchParams();
  for (const [key, apiKey] of Object.entries(participantKeys)) {
    const value = params.get(key);
    if (value) query.set(apiKey, value);
  }
  return `/api/partners/${encodeURIComponent(slug)}/organizer/export${query.size ? `?${query}` : ""}`;
}
export function participantFiltersActive(params: URLSearchParams): boolean {
  return Object.keys(participantKeys).some(key => key !== "pSort" && params.has(key));
}
export function clearFilterChanges(tab: "participants" | "teams"): Record<string, null> {
  return Object.fromEntries([...Object.keys(tab === "participants" ? participantKeys : teamKeys), tab === "participants" ? "pPage" : "tPage"].map(key => [key, null]));
}

function invalid(): never { throw new WorkspaceReadError(500, "Unable to verify this section’s data."); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid(); return value;
}
function text(value: unknown): string { if (typeof value !== "string") invalid(); return value; }
function nullableText(value: unknown): string | null { return value === null ? null : text(value); }
function bool(value: unknown): boolean { if (typeof value !== "boolean") invalid(); return value; }
function uuid(value: unknown): string {
  const id = text(value); if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) invalid(); return id;
}
function timestamp(value: unknown): string { const date = text(value); if (!Number.isFinite(Date.parse(date))) invalid(); return date; }
function strings(value: unknown): string[] { if (!Array.isArray(value)) invalid(); return value.map(text); }
function participant(value: unknown): OrganizerParticipant {
  const row = object(value);
  if (row.status !== "confirmed" && row.status !== "waitlisted" || !Array.isArray(row.event_teams)) invalid();
  return { user_id: uuid(row.user_id), full_name: nullableText(row.full_name), college: nullableText(row.college),
    skills: strings(row.skills), status: row.status, looking_for_team: bool(row.looking_for_team), created_at: timestamp(row.created_at),
    event_teams: row.event_teams.map(value => { const team = object(value); return { team_id: uuid(team.team_id), team_name: text(team.team_name) }; }) };
}
function team(value: unknown): WorkspaceTeam {
  const row = object(value); if (!Array.isArray(row.roster)) invalid();
  const members = count(row.member_count), registered = count(row.registered_member_count);
  if (registered > members) invalid();
  return { team_id: uuid(row.team_id), team_name: text(row.team_name), member_count: members, registered_member_count: registered,
    is_recruiting: row.is_recruiting === null ? null : bool(row.is_recruiting), roles_needed: strings(row.roles_needed),
    max_members: row.max_members === null ? null : count(row.max_members),
    event_min_team_size: row.event_min_team_size === null ? null : count(row.event_min_team_size),
    event_max_team_size: row.event_max_team_size === null ? null : count(row.event_max_team_size),
    roster: row.roster.map(value => { const member = object(value); return { user_id: uuid(member.user_id),
      full_name: nullableText(member.full_name), registered_for_event: bool(member.registered_for_event) }; }) };
}

export function decodeWorkspaceResponse(value: unknown, eventId: string, query: URLSearchParams): WorkspaceData {
  const response = object(value);
  if (response.eventId !== eventId || response.section !== query.get("section")) invalid();
  const retrievedAt = timestamp(response.retrievedAt);
  if (response.section === "overview") {
    const values = object(response.metrics);
    const metrics = { registration_count: count(values.registration_count), team_count: count(values.team_count),
      participants_in_team: count(values.participants_in_team), participants_without_team: count(values.participants_without_team),
      confirmed_count: count(values.confirmed_count), waitlisted_count: count(values.waitlisted_count),
      looking_for_team_count: count(values.looking_for_team_count), looking_without_team_count: count(values.looking_without_team_count) };
    return { section: "overview", retrievedAt, metrics };
  }
  const meta = object(response.pagination);
  const pagination = { page: count(meta.page), pageSize: count(meta.pageSize), total: count(meta.total),
    totalPages: count(meta.totalPages), hasNext: bool(meta.hasNext) };
  if (pagination.page !== Number(query.get("page") || 1) || pagination.pageSize !== Number(query.get("pageSize") || 50)
    || pagination.totalPages !== Math.ceil(pagination.total / pagination.pageSize) || !Array.isArray(response.rows)
    || response.rows.length !== Math.min(pagination.pageSize, Math.max(0, pagination.total - (pagination.page - 1) * pagination.pageSize))
    || pagination.hasNext !== (pagination.page * pagination.pageSize < pagination.total)) invalid();
  if (response.section === "participants") return { section: "participants", retrievedAt, rows: response.rows.map(participant), pagination };
  if (response.section === "teams") return { section: "teams", retrievedAt, rows: response.rows.map(team), pagination };
  return invalid();
}

export async function fetchWorkspaceSection(slug: string, eventId: string, query: URLSearchParams, signal: AbortSignal,
  fetcher: typeof fetch = fetch): Promise<WorkspaceData> {
  const response = await fetcher(`/api/partners/${encodeURIComponent(slug)}/organizer?${query}`, {
    credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
  });
  if (!response.ok) throw new WorkspaceReadError(response.status);
  return decodeWorkspaceResponse(await response.json(), eventId, query);
}

export async function fetchParticipantExport(slug: string, params: URLSearchParams, fetcher: typeof fetch = fetch): Promise<Blob> {
  const response = await fetcher(participantExportUrl(slug, params), {
    credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok) throw new WorkspaceReadError(response.status, response.status === 413
    ? "This export exceeds the download limit. Narrow the participant filters and try again."
    : response.status === 409 ? "Participant data changed during export. Please retry." : "Participant export is unavailable. Please retry.");
  if (!response.headers.get("Content-Type")?.startsWith("text/csv")) invalid();
  return response.blob();
}

export function teamAttention(team: WorkspaceTeam, confirmedLimits: boolean): string[] {
  const reasons: string[] = [];
  if (confirmedLimits && team.event_min_team_size && team.event_max_team_size && team.event_min_team_size <= team.event_max_team_size) {
    if (team.member_count < team.event_min_team_size) reasons.push("Below the event minimum team size");
    if (team.member_count > team.event_max_team_size) reasons.push("Above the event maximum team size");
  }
  const missing = team.member_count - team.registered_member_count;
  if (missing > 0) reasons.push(`${missing} ${missing === 1 ? "member has" : "members have"} not joined this event on HackerMate`);
  return reasons;
}
