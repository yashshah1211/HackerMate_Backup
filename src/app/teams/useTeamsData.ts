"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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

/** V1 match score: share of the team's wanted skills the viewer has. */
export function teamMatchScore(teamSkills: string[] | null | undefined, viewerSkills: string[]): number {
  if (!teamSkills?.length) return 0;
  const matched = teamSkills.filter((s) => viewerSkills.includes(s));
  return Math.round((matched.length / teamSkills.length) * 100);
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
