"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { teamSkillCoverage } from "@/lib/matchPresentation";

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
  team_members?: { id: string }[];
  team_hackathons?: { hackathons: { id: string; name: string; end_date?: string | null; status?: string | null } | null }[];
  team_ppt_evaluations?: { total_score: number; grade: string; status: string }[];
};

/**
 * /teams data — identical reads to V1: viewer skills for the match score and
 * every team with member ids, linked hackathons and PPT evaluations.
 */
export function useTeamsData() {
  const [teams, setTeams] = useState<ListTeam[]>([]);
  const [viewerSkills, setViewerSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile, error: pErr } = await supabase.from("profiles").select("skills").eq("id", user.id).single();
      if (pErr) console.error("[teams] viewer skills failed:", pErr);
      setViewerSkills(profile?.skills || []);
    }
    const { data, error: tErr } = await supabase
      .from("teams")
      .select("*, team_members(id), team_hackathons(hackathons(id, name, end_date, status)), team_ppt_evaluations(total_score, grade, status)")
      .order("created_at", { ascending: false });
    if (tErr) {
      console.error("[teams] team list failed:", tErr);
      setError(tErr.message);
    } else {
      setError(null);
      setTeams((data as ListTeam[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  return { teams, viewerSkills, loading, error, reload: load };
}

/** Share of distinct listed team skills that the viewer lists, not a fit probability. */
export function teamMatchScore(teamSkills: string[] | null | undefined, viewerSkills: string[]): number {
  const { matched, total } = teamSkillCoverage(teamSkills, viewerSkills);
  return total ? Math.round((matched / total) * 100) : 0;
}

/** Keep open teams first, then skill overlap, newest creation, and a stable ID. */
export function compareDiscoveryTeams(
  a: { t: Pick<ListTeam, "id" | "created_at">; status: { open: boolean }; match: number },
  b: { t: Pick<ListTeam, "id" | "created_at">; status: { open: boolean }; match: number },
): number {
  if (a.status.open !== b.status.open) return a.status.open ? -1 : 1;
  if (a.match !== b.match) return b.match - a.match;
  const created = (value: string | null | undefined) => {
    const time = value ? Date.parse(value) : NaN;
    return Number.isFinite(time) ? time : -Infinity;
  };
  const aTime = created(a.t.created_at), bTime = created(b.t.created_at);
  if (aTime !== bTime) return bTime - aTime;
  return a.t.id < b.t.id ? -1 : a.t.id > b.t.id ? 1 : 0;
}

/** Recruiting state exactly as V1 derived it for the card footer. */
export function teamStatus(t: ListTeam, today: string): { members: number; max: number; full: boolean; closed: boolean; open: boolean } {
  const members = t.team_members?.length || 0;
  const max = t.max_members || 5;
  const full = max > 0 && members >= max;
  const concluded = Boolean(t.team_hackathons?.some((th) => th.hackathons?.status === "archived" || (th.hackathons?.end_date && th.hackathons.end_date < today)));
  const closed = t.is_recruiting === false || concluded;
  return { members, max, full, closed, open: !full && !closed };
}
