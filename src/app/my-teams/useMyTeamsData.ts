"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Team = {
  id: string; name: string; description: string | null; owner_id: string;
  ppt_evaluations: { id: string; total_score: number; grade: string; status: string; version: number }[];
};
export type Application = { id: string; teamId: string; teamName: string | null; createdAt: string };
export type Resource<T> = { data: T[] | null; status: "loading" | "success" | "error"; error: string | null };
export type MyTeamsData = {
  viewerId: string | null; sessionError: string | null;
  memberships: Resource<Team>; applications: Resource<Application>;
};
type Scope = "memberships" | "applications";
type MembershipRow = { user_id: string; teams: (Omit<Team, "ppt_evaluations"> & { team_ppt_evaluations?: Team["ppt_evaluations"] }) | null };
type RequestRow = { id: string; team_id: string; user_id: string; status: string; created_at: string; teams: { id: string; name: string } | null };
const MEMBERSHIP_COLUMNS = "user_id, teams(id, name, description, owner_id, team_ppt_evaluations(id, total_score, grade, status, version))";
const APPLICATION_COLUMNS = "id, team_id, user_id, status, created_at, teams(id, name)";
const SCOPES: Scope[] = ["memberships", "applications"];
const empty = (): MyTeamsData => ({ viewerId: null, sessionError: null,
  memberships: { data: null, status: "loading", error: null }, applications: { data: null, status: "loading", error: null } });

function memberships(rows: MembershipRow[], userId: string): Team[] {
  const unique = new Map<string, Team>();
  for (const row of rows) {
    if (row.user_id !== userId || !row.teams?.id) continue;
    const { team_ppt_evaluations, ...team } = row.teams;
    unique.set(team.id, { ...team, ppt_evaluations: team_ppt_evaluations || [] });
  }
  return [...unique.values()];
}
function applications(rows: RequestRow[], userId: string): Application[] {
  // Newest first from the query. Legacy duplicate pending rows are not history.
  const unique = new Map<string, Application>();
  for (const row of rows) {
    if (row.user_id !== userId || row.status !== "pending" || !row.id || !row.team_id || unique.has(row.team_id)) continue;
    unique.set(row.team_id, { id: row.id, teamId: row.team_id, teamName: row.teams?.name || null, createdAt: row.created_at });
  }
  return [...unique.values()];
}

/** Scoped reads only. Identity epochs and per-resource generations guard every async result. */
export function useMyTeamsData() {
  const [data, setData] = useState<MyTeamsData>(empty);
  const mounted = useRef(false);
  const identity = useRef<string | null>(null);
  const epoch = useRef(0);
  const generations = useRef({ memberships: 0, applications: 0 });
  const controllers = useRef<Partial<Record<Scope, AbortController>>>({});
  const invalidate = useCallback(() => {
    ++epoch.current;
    for (const scope of SCOPES) { ++generations.current[scope]; controllers.current[scope]?.abort(); }
  }, []);

  const load = useCallback(async (scope?: Scope) => {
    if (!mounted.current) return;
    const authEpoch = epoch.current;
    const intents = new Map<Scope, number>();
    const reserve = (keys: Scope[]) => {
      for (const key of keys) {
        controllers.current[key]?.abort();
        intents.set(key, ++generations.current[key]);
        setData(previous => ({ ...previous, [key]: { ...previous[key], status: "loading", error: null } }));
      }
    };
    // Reserve before auth resolution: an older getUser response must not overtake a newer refresh.
    reserve(scope ? [scope] : SCOPES);
    const superseded = () => [...intents].every(([key, generation]) => generations.current[key] !== generation);
    let userId: string;
    try {
      const { data: auth, error } = await supabase.auth.getUser();
      if (!mounted.current || authEpoch !== epoch.current || superseded()) return;
      if (error) throw error;
      if (!auth.user) { invalidate(); identity.current = null; setData(empty()); return; }
      userId = auth.user.id;
      if (identity.current !== userId) {
        invalidate(); identity.current = userId;
        setData({ ...empty(), viewerId: userId });
        scope = undefined; // A new identity must load both resources from scratch.
        reserve(SCOPES);
      } else setData(previous => ({ ...previous, viewerId: userId, sessionError: null }));
    } catch (error) {
      console.error("[my-teams] account verification failed:", error);
      if (mounted.current && authEpoch === epoch.current && !superseded()) {
        invalidate(); identity.current = null;
        setData({ ...empty(), sessionError: "We couldn't verify your account. Try again." });
      }
      return;
    }

    const readEpoch = epoch.current;
    await Promise.all((scope ? [scope] : SCOPES).map(async key => {
      const generation = intents.get(key);
      if (!mounted.current || generations.current[key] !== generation || identity.current !== userId) return;
      const controller = new AbortController(); controllers.current[key] = controller;
      const current = () => mounted.current && !controller.signal.aborted && epoch.current === readEpoch
        && identity.current === userId && generations.current[key] === generation;
      try {
        if (key === "memberships") {
          const result = await supabase.from("team_members").select(MEMBERSHIP_COLUMNS).eq("user_id", userId).abortSignal(controller.signal);
          if (result.error) throw result.error;
          if (!current()) return;
          const teams = memberships((result.data || []) as unknown as MembershipRow[], userId);
          setData(previous => ({ ...previous, memberships: { data: teams, status: "success", error: null } }));
        } else {
          const result = await supabase.from("team_join_requests").select(APPLICATION_COLUMNS, { count: "exact" })
            .eq("user_id", userId).eq("status", "pending").order("created_at", { ascending: false })
            .order("id", { ascending: false }).abortSignal(controller.signal);
          if (result.error) throw result.error;
          if (!current()) return;
          const requests = applications((result.data || []) as unknown as RequestRow[], userId);
          const partial = typeof result.count === "number" && result.count > (result.data?.length || 0);
          if (partial) console.error("[my-teams] incomplete applications response:", { expected: result.count, received: result.data?.length || 0 });
          setData(previous => ({ ...previous, applications: { data: requests, status: partial ? "error" : "success",
            error: partial ? "Only part of your applications loaded. Refresh to try again." : null } }));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(`[my-teams] ${key} read failed:`, error);
        if (current()) setData(previous => ({ ...previous, [key]: { ...previous[key], status: "error",
          error: key === "memberships" ? "We couldn't load your team memberships. Try again." : "We couldn't load your applications. Try again." } }));
      }
    }));
  }, [invalidate]);

  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void load(); }, 0); };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextId = session?.user?.id || null;
      if (event === "SIGNED_OUT" || nextId !== identity.current) {
        invalidate(); identity.current = nextId; setData(empty());
        if (nextId) schedule(); // Defer Supabase reads outside the auth callback.
      }
    });
    const visible = () => { if (document.visibilityState === "visible") schedule(); };
    window.addEventListener("focus", schedule);
    window.addEventListener("hm:teams-changed", schedule);
    document.addEventListener("visibilitychange", visible);
    schedule();
    return () => {
      mounted.current = false; invalidate(); clearTimeout(timer); subscription.unsubscribe();
      window.removeEventListener("focus", schedule);
      window.removeEventListener("hm:teams-changed", schedule);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [invalidate, load]);
  return { data, refresh: () => load(), refreshMemberships: () => load("memberships"), refreshApplications: () => load("applications") };
}
