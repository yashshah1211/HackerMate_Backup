import { NextResponse } from "next/server";
import type { PartnerAccessResult } from "./types";

export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };
export const EXPORT_LIMIT = 10_000;
export const EXPORT_BYTES = 8 * 1024 * 1024;
export const EXPORT_PAGE_SIZE = 100;

export class OrganizerApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}
export function privateAccessResponse(response: NextResponse) {
  response.headers.set("Cache-Control", PRIVATE_HEADERS["Cache-Control"]);
  return response;
}
export function organizerFailure(error: unknown) {
  if (error instanceof OrganizerApiError) {
    if (error.status >= 500) console.error("[partner organizer] Read failed", { status: error.status });
    return privateJson({ error: error.message }, error.status);
  }
  console.error("[partner organizer] Unexpected read failure");
  return privateJson({ error: "Unable to load organizer data." }, 500);
}
function invalidQuery(): never { throw new OrganizerApiError(400, "Invalid organizer query."); }
function invalidProjection(): never { throw new OrganizerApiError(500, "Unable to verify organizer data."); }

const PARTICIPANT_FILTERS = ["search", "college", "skill", "status", "teamState", "lookingForTeam", "sort"];
const TEAM_FILTERS = ["search", "recruiting", "minMembers", "maxMembers", "sizeState", "sort"];
function allowedParams(params: URLSearchParams, keys: string[]) {
  const seen = new Set<string>();
  for (const [key] of params) {
    if (!keys.includes(key) || seen.has(key)) invalidQuery();
    seen.add(key);
  }
}
function textFilter(params: URLSearchParams, key: string, max: number) {
  const value = params.get(key);
  if (value !== null && value.length > max) invalidQuery();
  return value?.trim() || null;
}
function choice(params: URLSearchParams, key: string, values: readonly string[], fallback: string | null) {
  const value = params.get(key);
  if (value === null) return fallback;
  if (!values.includes(value)) invalidQuery();
  return value;
}
function booleanFilter(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (value === null) return null;
  if (value !== "true" && value !== "false") invalidQuery();
  return value === "true";
}
function integer(params: URLSearchParams, key: string, fallback: number | null, min: number, max: number) {
  const raw = params.get(key);
  if (raw === null) return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) invalidQuery();
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) invalidQuery();
  return value;
}
export interface ParticipantFilters {
  p_search: string | null; p_college: string | null; p_skill: string | null;
  p_status: string | null; p_team_state: string; p_looking_for_team: boolean | null; p_sort: string;
}
interface TeamFilters {
  p_search: string | null; p_recruiting: boolean | null; p_min_members: number | null;
  p_max_members: number | null; p_size_state: string; p_sort: string;
}
function participantFilters(params: URLSearchParams): ParticipantFilters {
  return {
    p_search: textFilter(params, "search", 200), p_college: textFilter(params, "college", 200),
    p_skill: textFilter(params, "skill", 100),
    p_status: choice(params, "status", ["confirmed", "waitlisted"], null),
    p_team_state: choice(params, "teamState", ["any", "in_team", "without_team"], "any")!,
    p_looking_for_team: booleanFilter(params, "lookingForTeam"),
    p_sort: choice(params, "sort", ["newest", "oldest", "name_asc", "name_desc"], "newest")!,
  };
}
export function parseExportQuery(params: URLSearchParams) {
  allowedParams(params, PARTICIPANT_FILTERS);
  return participantFilters(params);
}
export type OrganizerQuery = { section: "overview" }
  | { section: "participants"; page: number; pageSize: number; offset: number; filters: ParticipantFilters }
  | { section: "teams"; page: number; pageSize: number; offset: number; filters: TeamFilters };
export function parseOrganizerQuery(params: URLSearchParams): OrganizerQuery {
  const section = choice(params, "section", ["overview", "participants", "teams"], "overview");
  if (section === "overview") { allowedParams(params, ["section"]); return { section }; }
  allowedParams(params, ["section", "page", "pageSize", ...(section === "participants" ? PARTICIPANT_FILTERS : TEAM_FILTERS)]);
  const page = integer(params, "page", 1, 1, 1_000_001)!;
  const pageSize = integer(params, "pageSize", 50, 1, 100)!;
  const offset = (page - 1) * pageSize;
  if (offset > 1_000_000) invalidQuery();
  if (section === "participants") return { section, page, pageSize, offset, filters: participantFilters(params) };
  const min = integer(params, "minMembers", null, 0, 2_147_483_647);
  const max = integer(params, "maxMembers", null, 0, 2_147_483_647);
  if (min !== null && max !== null && min > max) invalidQuery();
  return { section: "teams", page, pageSize, offset, filters: {
    p_search: textFilter(params, "search", 200), p_recruiting: booleanFilter(params, "recruiting"),
    p_min_members: min, p_max_members: max,
    p_size_state: choice(params, "sizeState", ["any", "below_min", "above_max", "within_limits", "unknown_limits"], "any")!,
    p_sort: choice(params, "sort", ["newest", "oldest", "name_asc", "name_desc", "size_asc", "size_desc"], "name_asc")!,
  } };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidProjection();
  return value as Record<string, unknown>;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalidProjection();
  return value;
}
function string(value: unknown): string {
  if (typeof value !== "string") invalidProjection();
  return value;
}
function nullableString(value: unknown): string | null { return value === null ? null : string(value); }
function bool(value: unknown): boolean { if (typeof value !== "boolean") invalidProjection(); return value; }
function nullableBool(value: unknown): boolean | null { return value === null ? null : bool(value); }
function uuid(value: unknown): string {
  const result = string(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) invalidProjection();
  return result.toLowerCase();
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) invalidProjection();
  return value.map(string);
}
export interface OrganizerParticipant {
  user_id: string; full_name: string | null; college: string | null; skills: string[];
  status: "confirmed" | "waitlisted"; looking_for_team: boolean; created_at: string;
  event_teams: { team_id: string; team_name: string }[];
}
function participant(value: unknown): OrganizerParticipant {
  const row = object(value);
  if (row.status !== "confirmed" && row.status !== "waitlisted") invalidProjection();
  const createdAt = string(row.created_at);
  if (!Number.isFinite(Date.parse(createdAt)) || !Array.isArray(row.event_teams)) invalidProjection();
  return {
    user_id: uuid(row.user_id), full_name: nullableString(row.full_name), college: nullableString(row.college),
    skills: strings(row.skills), status: row.status, looking_for_team: bool(row.looking_for_team), created_at: createdAt,
    event_teams: row.event_teams.map(value => { const team = object(value); return { team_id: uuid(team.team_id), team_name: string(team.team_name) }; }),
  };
}
function team(value: unknown) {
  const row = object(value);
  if (!Array.isArray(row.roster) || !Array.isArray(row.roles_needed)) invalidProjection();
  const members = count(row.member_count), registered = count(row.registered_member_count);
  if (registered > members) invalidProjection();
  return {
    team_id: uuid(row.team_id), team_name: string(row.team_name), member_count: members, registered_member_count: registered,
    is_recruiting: nullableBool(row.is_recruiting), roles_needed: row.roles_needed.filter(value => value !== null).map(string),
    max_members: row.max_members === null ? null : count(row.max_members),
    event_min_team_size: row.event_min_team_size === null ? null : count(row.event_min_team_size),
    event_max_team_size: row.event_max_team_size === null ? null : count(row.event_max_team_size),
    roster: row.roster.map(value => { const member = object(value); return {
      user_id: uuid(member.user_id), full_name: nullableString(member.full_name), registered_for_event: bool(member.registered_for_event),
    }; }),
  };
}
function page<T>(value: unknown, offset: number, limit: number, project: (value: unknown) => T) {
  const envelope = object(value), total = count(envelope.total);
  if (envelope.offset !== offset || envelope.limit !== limit || !Array.isArray(envelope.items)
    || envelope.items.length !== Math.min(limit, Math.max(0, total - offset))) invalidProjection();
  return { total, rows: envelope.items.map(project) };
}
async function rpc(access: PartnerAccessResult, name: string, args: Record<string, unknown>, signal: AbortSignal) {
  try {
    const { data, error } = await access.supabaseUserClient.rpc(name, { ...args, p_hackathon_id: access.hackathonId }).abortSignal(signal);
    if (error) {
      console.error("[partner organizer] RPC failed", { rpc: name, code: error.code });
      if (signal.aborted) throw new OrganizerApiError(504, "Organizer request timed out.");
      throw new OrganizerApiError(error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500,
        error.code === "42501" ? "Forbidden: Unable to verify event access." : "Unable to load organizer data.");
    }
    return data;
  } catch (error) {
    if (signal.aborted) throw new OrganizerApiError(504, "Organizer request timed out.");
    throw error;
  }
}
export async function readParticipants(access: PartnerAccessResult, filters: ParticipantFilters, offset: number, limit: number, signal: AbortSignal) {
  return page(await rpc(access, "list_partner_organizer_participants", { ...filters, p_offset: offset, p_limit: limit }, signal), offset, limit, participant);
}
export async function readOrganizerSection(access: PartnerAccessResult, query: OrganizerQuery) {
  const signal = AbortSignal.timeout(10_000);
  if (query.section === "overview") {
    const data = await rpc(access, "get_partner_organizer_overview", {}, signal);
    if (!Array.isArray(data) || data.length !== 1) invalidProjection();
    const row = object(data[0]);
    const keys = ["registration_count", "confirmed_count", "waitlisted_count", "team_count", "participants_in_team",
      "participants_without_team", "looking_for_team_count", "looking_without_team_count"];
    const metrics = Object.fromEntries(keys.map(key => [key, count(row[key])]));
    return { section: query.section, metrics };
  }
  const result = query.section === "participants"
    ? await readParticipants(access, query.filters, query.offset, query.pageSize, signal)
    : page(await rpc(access, "list_partner_organizer_teams", { ...query.filters, p_offset: query.offset, p_limit: query.pageSize }, signal), query.offset, query.pageSize, team);
  return { section: query.section, rows: result.rows, pagination: {
    page: query.page, pageSize: query.pageSize, total: result.total,
    totalPages: Math.ceil(result.total / query.pageSize), hasNext: query.offset + result.rows.length < result.total,
  } };
}
