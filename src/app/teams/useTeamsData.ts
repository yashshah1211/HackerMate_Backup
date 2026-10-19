"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { teamSkillCoverage } from "@/lib/matchPresentation";

type DiscoveryEvent = { id: string; name: string; end_date?: string | null; status?: string | null; archived?: boolean | null };

export type ListTeam = {
  id: string;
  name: string;
  description: string | null;
  skills: string[] | null;
  college: string | null;
  hackathon_id?: string | null;
  hackathon_name: string | null;
  max_members: number | null;
  is_recruiting?: boolean | null;
  created_at?: string | null;
  owner_id?: string | null;
  ownerRecentlyActive?: boolean;
  hackathons?: DiscoveryEvent | null;
  team_members?: { id: string }[];
  team_hackathons?: { hackathons: DiscoveryEvent | null }[];
  team_ppt_evaluations?: { total_score: number; grade: string; status: string }[];
};

/**
 * Existing session/RLS controls every read. Owner activity is optional and is
 * deliberately separate from team reads so denied profile access cannot hide teams.
 */
export function useTeamsData() {
  const [teams, setTeams] = useState<ListTeam[]>([]);
  const [viewerSkills, setViewerSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activityUnavailable, setActivityUnavailable] = useState(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const request = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const current = () => generation.current === request && !abort.signal.aborted;
    setLoading(true);
    setActivityUnavailable(false);
    setViewerSkills([]);
    try {
      // Auth/skill failures must not prevent the independently authorized team read.
      const auth = await supabase.auth.getUser().catch(() => null);
      if (!current()) return;
      const user = auth?.error ? null : auth?.data.user;
      if (user) {
        try {
          const { data: profile } = await supabase.from("profiles").select("skills").eq("id", user.id).abortSignal(abort.signal).single();
          if (current()) setViewerSkills(profile?.skills || []);
        } catch { /* Skill relevance is optional too. */ }
      }
      const { data, error: tErr } = await supabase
        .from("teams")
        .select("*, team_members(id), hackathons!teams_hackathon_id_fkey(id, name, end_date, status, archived), team_hackathons(hackathons(id, name, end_date, status, archived)), team_ppt_evaluations(total_score, grade, status)")
        .order("created_at", { ascending: false }).abortSignal(abort.signal);
      if (!current()) return;
      if (tErr) throw new Error(tErr.message);
      const records = (data as ListTeam[]) || [];
      setError(null);
      setTeams(records);
      setLoading(false);
      if (!user) {
        setActivityUnavailable(Boolean(auth?.error || !auth));
        return;
      }
      const activity = await loadOwnerActivity(supabase, records, abort.signal);
      if (!current()) return;
      setTeams(records.map(t => ({ ...t, ownerRecentlyActive: activity.recentOwners.has(t.owner_id || "") })));
      setActivityUnavailable(activity.unavailable);
    } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : "Teams could not be loaded. Please retry.");
    } finally {
      if (current()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.resolve().then(() => { if (mounted) void load(); });
    return () => { mounted = false; controller.current?.abort(); generation.current += 1; };
  }, [load]);

  return { teams, viewerSkills, loading, error, activityUnavailable, reload: load };
}

/** Reject permissive Date.parse coercions and impossible calendar days. */
function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(day) && new Date(day).toISOString().slice(0, 10) === value;
}

function recordedTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parts = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i.exec(value);
  if (!parts || !validDay(parts[1])) return null;
  const seen = Date.parse(value);
  return Number.isFinite(seen) ? seen : null;
}

/** Strict, timezone-qualified activity timestamps only; unknown never means inactive. */
export function ownerRecentlyActive(value: unknown, now: number): boolean {
  const seen = recordedTime(value);
  return seen !== null && Number.isFinite(now) && seen <= now && seen >= now - 30 * 24 * 60 * 60 * 1000;
}

/** Call only for an authenticated viewer; never use an admin/public bypass. */
export async function loadOwnerActivity(client: Pick<typeof supabase, "from">, teams: ListTeam[], signal: AbortSignal, now = Date.now()) {
  const ids = [...new Set(teams.map(t => t.owner_id).filter((id): id is string => typeof id === "string" && Boolean(id)))];
  const recentOwners = new Set<string>();
  let unavailable = false;
  for (let offset = 0; offset < ids.length && !signal.aborted; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    try {
      const { data, error } = await client.from("profiles").select("id, last_seen_at").in("id", batch).abortSignal(signal);
      if (error || !Array.isArray(data)) { unavailable = true; continue; }
      for (const row of data) {
        if (row && batch.includes(row.id) && ownerRecentlyActive(row.last_seen_at, now)) recentOwners.add(row.id);
      }
    } catch { unavailable = true; }
  }
  return { recentOwners, unavailable };
}

/** Share of distinct listed team skills that the viewer lists, not a fit probability. */
export function teamMatchScore(teamSkills: string[] | null | undefined, viewerSkills: string[]): number {
  const { matched, total } = teamSkillCoverage(teamSkills, viewerSkills);
  return total ? Math.round((matched / total) * 100) : 0;
}

/** Joinability, skill relevance, recent owner activity among open peers, then date/ID. */
export function compareDiscoveryTeams(
  a: { t: Pick<ListTeam, "id" | "created_at" | "ownerRecentlyActive">; status: { open: boolean }; match: number },
  b: { t: Pick<ListTeam, "id" | "created_at" | "ownerRecentlyActive">; status: { open: boolean }; match: number },
): number {
  if (a.status.open !== b.status.open) return a.status.open ? -1 : 1;
  if (a.match !== b.match) return b.match - a.match;
  if (a.status.open && Boolean(a.t.ownerRecentlyActive) !== Boolean(b.t.ownerRecentlyActive)) return a.t.ownerRecentlyActive ? -1 : 1;
  const created = (value: string | null | undefined) => {
    const time = value ? Date.parse(value) : NaN;
    return Number.isFinite(time) ? time : -Infinity;
  };
  const aTime = created(a.t.created_at), bTime = created(b.t.created_at);
  if (aTime !== bTime) return bTime - aTime;
  return a.t.id < b.t.id ? -1 : a.t.id > b.t.id ? 1 : 0;
}

/** Include the primary FK and junction links, including the actual archival flag. */
export function teamStatus(t: ListTeam, today: string): { members: number; max: number; full: boolean; closed: boolean; open: boolean } {
  const members = t.team_members?.length || 0;
  const max = t.max_members || 5;
  const full = max > 0 && members >= max;
  const events = [t.hackathons, ...(t.team_hackathons || []).map(th => th.hackathons)];
  const concluded = events.some(event => {
    if (event?.archived === true || event?.status === "archived") return true;
    // Preserve discovery's calendar-day rule for date-only and timestamptz values.
    // An event ending today remains joinable through today (UTC, as on /teams).
    const end = event?.end_date;
    if (typeof end !== "string") return false;
    if (validDay(end)) return end < today;
    const parsed = recordedTime(end);
    return parsed !== null && new Date(parsed).toISOString().slice(0, 10) < today;
  });
  const closed = t.is_recruiting === false || concluded;
  return { members, max, full, closed, open: !full && !closed };
}
