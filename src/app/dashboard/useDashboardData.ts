"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeCollege } from "@/lib/colleges";
import { useRouter } from "next/navigation";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { trackEvent } from "@/lib/posthog";
import { calculateProfileCompleteness } from "@/lib/profileCompleteness";
import { SAFE_PROFILE_COLUMNS } from "@/lib/profileColumns";
import { getTeamCategoryInfo, type TeamCategory } from "@/lib/teamCategory";
import type { TeamWithSlots, ConnectedUser } from "@/components/PostAcceptanceTeamPrompt";

export type ConnState = "not_connected" | "request_sent" | "request_received" | "connected";

export type DashProfile = {
  id: string;
  full_name: string | null;
  college: string | null;
  bio: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  skills: string[] | null;
  onboarding_completed?: boolean | null;
  current_streak?: number | null;
  longest_streak?: number | null;
  year_of_study?: string | null;
};

export type DashBuilder = {
  id: string;
  full_name: string | null;
  college: string | null;
  year_of_study?: string | null;
  avatar_url: string | null;
  bio?: string | null;
  skills: string[] | null;
  github_url?: string | null;
  linkedin_url?: string | null;
  is_available?: boolean | null;
  compatibility?: number | null;
  shared_skills?: string[] | null;
  same_college?: boolean | null;
  reasons?: string[] | null;
  confidence?: number | null;
  matchEngine?: "v3" | "v2";
};

export type DashTeam = {
  id: string;
  name: string;
  category: TeamCategory;
  tag: "PROJECT" | "HACKATHON";
  eventName: string;
  memberCount: number;
  maxMembers: number | null;
  members: { id: string; name: string | null; src: string | null }[];
  isOwner: boolean;
  firstHackathonId: string | null;
};

export type QueueItem =
  | { kind: "invite"; id: string; teamId: string; teamName: string; teamDescription: string | null; inviterName: string | null }
  | { kind: "connection"; id: string; user: ConnectedUser; message: string | null; createdAt: string }
  | { kind: "join"; teamId: string; teamName: string; count: number; category: TeamCategory };

export type Activity = { id: string; message: string; link: string | null; createdAt: string };

export type PartnerEvent = { slug: string; name: string; logoUrl: string | null; eventName: string | null; endDate: string | null };

export type DashboardData = {
  loading: boolean;
  redirecting: boolean;
  profile: DashProfile | null;
  completeness: { percent: number; missing: { key: string; label: string }[] };
  nextStep: string;
  bestFit: DashBuilder[];
  campus: DashBuilder[];
  matchError: string | null;
  connectionStates: Record<string, ConnState>;
  teams: DashTeam[];
  queue: QueueItem[];
  stats: { builders: number; teams: number; hackathons: number | null; closingSoon: number | null; campusCount?: number };
  activity: Activity[];
  partners: PartnerEvent[];
  year: { visible: boolean; value: string; saving: boolean };
  busyId: string | null;
};

type TeamMemberRow = { role: string; user_id: string; profiles: { id: string; full_name: string; avatar_url: string } | null };
type TeamDetailsRow = {
  id: string;
  name: string;
  hackathon_id: string | null;
  max_members: number | null;
  owner_id: string;
  team_members: TeamMemberRow[];
  team_hackathons: { hackathon_id: string; hackathons: { id: string; name: string; type?: string | null; tags?: string[] | null } | null }[];
};

/** Same prioritised copy as V1, rewritten tighter. */
function nextStepFor(p: DashProfile | null): string {
  if (!p) return "Add your skills so matching has something to work with.";
  if (!p.skills || p.skills.length === 0) return "Add your skills — matching is skill-based, so without them you don't show up.";
  if (!p.github_url) return "Link your GitHub. Teams check code before they invite.";
  if (!p.college) return "Set your college to see builders from your campus.";
  if (!p.bio) return "Write a line about what you build and the role you want.";
  if (!p.full_name) return "Add your full name so teams know who they're talking to.";
  return "Your profile is complete.";
}

/**
 * Dashboard data + actions. Preserves every V1 read (profile, matchmaking
 * RPC, teams, counts, notifications) and adds the actionable queue
 * (team invites, connection requests, join requests on owned teams) using
 * the exact queries/RPCs of /invites, /connections and /teams/[id]/requests.
 */
export function useDashboardData() {
  const router = useRouter();
  const { showToast } = useNotification();
  const [state, setState] = useState<DashboardData>({
    loading: true,
    redirecting: false,
    profile: null,
    completeness: { percent: 0, missing: [] },
    nextStep: "",
    bestFit: [],
    campus: [],
    matchError: null,
    connectionStates: {},
    teams: [],
    queue: [],
    stats: { builders: 0, teams: 0, hackathons: 0, closingSoon: 0 },
    activity: [],
    partners: [],
    year: { visible: false, value: "2nd Year", saving: false },
    busyId: null,
  });
  const [prompt, setPrompt] = useState<{ open: boolean; user: ConnectedUser | null; teams: TeamWithSlots[] }>({
    open: false,
    user: null,
    teams: [],
  });
  const userIdRef = useRef<string | null>(null);
  const patch = useCallback((p: Partial<DashboardData>) => setState((s) => ({ ...s, ...p })), []);

  /** friend_requests → per-user relationship state + incoming requests for the queue. */
  const loadConnections = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status, message, created_at")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[dashboard] friend_requests failed:", error);
      return { states: {} as Record<string, ConnState>, incoming: [] as QueueItem[] };
    }
    const states: Record<string, ConnState> = {};
    const incomingRows: { id: string; sender_id: string; message: string | null; created_at: string }[] = [];
    (data || []).forEach((r) => {
      const other = r.sender_id === userId ? r.receiver_id : r.sender_id;
      if (r.status === "accepted") states[other] = "connected";
      else if (r.status === "pending") {
        states[other] = r.sender_id === userId ? "request_sent" : "request_received";
        if (r.receiver_id === userId) incomingRows.push(r);
      }
    });

    let incoming: QueueItem[] = [];
    if (incomingRows.length) {
      const { data: senders, error: sErr } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, college")
        .in(
          "id",
          incomingRows.map((r) => r.sender_id),
        );
      if (sErr) console.error("[dashboard] request sender profiles failed:", sErr);
      const byId = new Map((senders || []).map((p) => [p.id, p]));
      incoming = incomingRows.flatMap((r) => {
        const p = byId.get(r.sender_id);
        if (!p) return [];
        return [
          {
            kind: "connection" as const,
            id: r.id,
            user: { id: p.id, full_name: p.full_name, avatar_url: p.avatar_url, college: p.college },
            message: r.message ?? null,
            createdAt: r.created_at,
          },
        ];
      });
    }
    return { states, incoming };
  }, []);

  const loadInvites = useCallback(async (userId: string): Promise<QueueItem[]> => {
    const { data, error } = await supabase
      .from("team_invites")
      .select(`id, status, team_id, teams ( id, name, description, max_members ), profiles!team_invites_invited_by_fkey ( full_name )`)
      .eq("invited_user_id", userId)
      .eq("status", "pending");
    if (error) {
      console.error("[dashboard] team_invites failed:", error);
      return [];
    }
    type InviteRow = {
      id: string;
      team_id: string;
      teams: { id: string; name: string; description: string | null } | null;
      profiles: { full_name: string | null } | null;
    };
    return ((data || []) as unknown as InviteRow[]).map((i) => ({
      kind: "invite" as const,
      id: i.id,
      teamId: i.team_id,
      teamName: i.teams?.name || "A team",
      teamDescription: i.teams?.description ?? null,
      inviterName: i.profiles?.full_name ?? null,
    }));
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        patch({ loading: false });
        return;
      }
      userIdRef.current = user.id;

      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select(`${SAFE_PROFILE_COLUMNS}, current_streak, longest_streak, last_active_date, year_of_study`)
        .eq("id", user.id)
        .single();
      if (profileErr) console.error("[dashboard] profile read failed:", profileErr);

      const profile = (profileData as DashProfile | null) ?? null;
      if (profile && !profile.onboarding_completed) {
        patch({ redirecting: true });
        router.push("/onboarding");
        return;
      }

      // Kick off independent reads in parallel.
      const fetchMatch = async () => {
        if (!profile) return { data: [], error: null, matchEngine: "v3" as const };
        const res = await supabase.rpc("get_recommended_teammates_v3", { p_user_id: user.id, p_limit: 50 });
        if (res.error && (res.error.code === "PGRST202" || res.error.code === "42883" || res.error.message?.includes("Could not find the function") || res.error.message?.includes("function get_recommended_teammates_v3 does not exist"))) {
          console.info("[matchmaking] V3 unavailable; using V2 compatibility fallback");
          const v2Res = await supabase.rpc("get_recommended_teammates", { p_user_id: user.id, p_limit: 50 });
          return { data: v2Res.data, error: v2Res.error, matchEngine: "v2" as const };
        }
        return { data: res.data, error: res.error, matchEngine: "v3" as const };
      };
      const matchP = fetchMatch();

      const fetchCampusBuilders = async (normalizedCollege: string | null) => {
        if (!normalizedCollege) return { data: [], count: 0, error: null };
        return supabase
          .from("profiles")
          .select("id, full_name, avatar_url, college, bio, skills, github_url, linkedin_url, year_of_study, is_available", { count: "exact" })
          .eq("college", normalizedCollege)
          .neq("id", user.id)
          .eq("is_banned", false)
          .eq("onboarding_completed", true)
          .order("last_active_date", { ascending: false })
          .limit(6);
      };
      const campusP = fetchCampusBuilders(normalizeCollege(profile?.college));
      
      const memberP = supabase.from("team_members").select("team_id, teams(id, name, hackathon_id, max_members, owner_id)").eq("user_id", user.id);
      const ownedP = supabase.from("teams").select("id, name, hackathon_id, max_members, owner_id").eq("owner_id", user.id);
      const today = new Date().toISOString().split("T")[0];
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);
      const in7Str = in7.toISOString().split("T")[0];
      const countsP = Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("hackathons").select("id", { count: "exact", head: true }).eq("archived", false).gte("end_date", today),
        supabase.from("teams").select("id", { count: "exact", head: true }),
        supabase.from("hackathons").select("id", { count: "exact", head: true }).eq("archived", false).gte("end_date", today).lte("end_date", in7Str),
      ]);
      const notifP = supabase
        .from("notifications")
        .select("id, message, created_at, link")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(4);
      const partnersP = supabase
        .from("partner_configs")
        .select("slug, partner_name, logo_url, hackathons(id, name, end_date)");

      const [conn, invites, match, campusRes, members, owned, counts, notifs, partnersRes] = await Promise.all([
        loadConnections(user.id),
        loadInvites(user.id),
        matchP,
        campusP,
        memberP,
        ownedP,
        countsP,
        notifP,
        partnersP,
      ]);

      // Matchmaking
      if (match.error) console.error("[dashboard] get_recommended_teammates failed:", match.error);
      const recommended = ((match.data as DashBuilder[] | null) ?? []).map(r => ({ ...r, matchEngine: match.matchEngine })) as DashBuilder[];

      // Campus Builders
      if (campusRes.error) console.error("[dashboard] campus builders fetch failed:", campusRes.error);
      const campusCount = campusRes.count || 0;
      let finalCampus: DashBuilder[] = [];

      // Take campus builders from matches first (they are already sorted by fit score)
      const campusFromMatches = recommended.filter((d) => d.same_college);
      const seenCampus = new Set(campusFromMatches.map((c) => c.id));
      finalCampus.push(...campusFromMatches);

      // Pad with the dedicated campus query results
      const fetchedCampus = (campusRes.data || []) as DashBuilder[];
      for (const builder of fetchedCampus) {
        if (!seenCampus.has(builder.id)) {
          finalCampus.push({ ...builder, same_college: true });
          seenCampus.add(builder.id);
        }
      }
      
      // We limit to 6 for the dashboard display
      const campus = finalCampus.slice(0, 6);

      // Teams (member or owner)
      if (members.error) console.error("[dashboard] team_members read failed:", members.error);
      if (owned.error) console.error("[dashboard] owned teams read failed:", owned.error);
      const teamIds = new Set<string>();
      (owned.data || []).forEach((t) => teamIds.add(t.id));
      (members.data || []).forEach((m) => {
        const raw = m.teams as unknown;
        const t = Array.isArray(raw) ? raw[0] : raw;
        if (t && typeof t === "object" && "id" in t) teamIds.add((t as { id: string }).id);
      });
      let teams: DashTeam[] = [];
      if (teamIds.size) {
        const { data: batch, error: batchErr } = await supabase
          .from("teams")
          .select(
            "id, name, hackathon_id, max_members, owner_id, team_members(role, user_id, profiles(id, full_name, avatar_url)), team_hackathons(hackathon_id, hackathons(id, name, type, tags))",
          )
          .in("id", Array.from(teamIds));
        if (batchErr) console.error("[dashboard] team details failed:", batchErr);
        teams = ((batch || []) as unknown as TeamDetailsRow[]).map((d) => {
          const info = getTeamCategoryInfo(d);
          const members = d.team_members || [];
          return {
            id: d.id,
            name: d.name,
            category: info.category,
            tag: info.tag,
            eventName: info.eventName,
            memberCount: members.length,
            maxMembers: typeof d.max_members === "number" ? d.max_members : null,
            members: members.map((m) => ({ id: m.user_id, name: m.profiles?.full_name ?? null, src: m.profiles?.avatar_url ?? null })),
            isOwner: d.owner_id === user.id,
            firstHackathonId: d.team_hackathons?.[0]?.hackathon_id || d.hackathon_id,
          };
        });
        teams.sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name));
      }

      // Join requests waiting on teams the viewer owns (same table/filters as /teams/[id]/requests).
      const ownedTeams = teams.filter((t) => t.isOwner);
      let joinItems: QueueItem[] = [];
      if (ownedTeams.length) {
        const { data: jr, error: jrErr } = await supabase
          .from("team_join_requests")
          .select("id, team_id")
          .in(
            "team_id",
            ownedTeams.map((t) => t.id),
          )
          .eq("status", "pending");
        if (jrErr) console.error("[dashboard] team_join_requests failed:", jrErr);
        const counts = new Map<string, number>();
        (jr || []).forEach((r) => counts.set(r.team_id, (counts.get(r.team_id) || 0) + 1));
        joinItems = ownedTeams.flatMap((t) =>
          counts.get(t.id) ? [{ kind: "join" as const, teamId: t.id, teamName: t.name, count: counts.get(t.id) as number, category: t.category }] : [],
        );
      }

      const [buildersCount, liveCount, teamsCount, closingCount] = counts;
      counts.forEach((c, i) => {
        if (c.error) console.error(`[dashboard] count query ${i} failed:`, c.error);
      });

      if (notifs.error) console.error("[dashboard] notifications failed:", notifs.error);
      if (partnersRes.error) console.error("[dashboard] partner_configs failed:", partnersRes.error);
      type PartnerRow = { slug: string; partner_name: string | null; logo_url: string | null; hackathons: { id: string; name: string; end_date: string | null } | { id: string; name: string; end_date: string | null }[] | null };
      const partners: PartnerEvent[] = ((partnersRes.data || []) as unknown as PartnerRow[])
        .map((c) => {
          const h = Array.isArray(c.hackathons) ? c.hackathons[0] : c.hackathons;
          return { slug: c.slug, name: c.partner_name || c.slug, logoUrl: c.logo_url, eventName: h?.name ?? null, endDate: h?.end_date ?? null };
        })
        .filter((p) => !p.endDate || p.endDate >= today)
        .slice(0, 3);

      const comp = calculateProfileCompleteness(profile);
      let yearVisible = false;
      let yearValue = "2nd Year";
      if (profile) {
        const confirmed = typeof window !== "undefined" && localStorage.getItem(`year_confirmed_${user.id}`) === "true";
        if (!confirmed) {
          yearVisible = true;
          yearValue = profile.year_of_study || "2nd Year";
        }
      }

      setState((s) => ({
        ...s,
        loading: false,
        profile,
        completeness: { percent: comp.score, missing: comp.missingFields },
        nextStep: nextStepFor(profile),
        bestFit: recommended.slice(0, 6),
        campus,
        matchError: match.error ? (match.error as { message?: string }).message || "Matchmaking unavailable" : null,
        connectionStates: conn.states,
        teams,
        queue: [...invites, ...joinItems, ...conn.incoming],
        stats: {
          builders: buildersCount.count ?? 0,
          hackathons: liveCount.error ? null : (liveCount.count ?? 0),
          teams: teamsCount.count ?? 0,
          closingSoon: closingCount.error ? null : (closingCount.count ?? 0),
          campusCount,
        },
        activity: (notifs.data || []).map((n) => ({ id: n.id, message: n.message, link: n.link, createdAt: n.created_at })),
        partners,
        year: { ...s.year, visible: yearVisible, value: yearValue },
      }));
    } catch (err) {
      console.error("[dashboard] load failed:", err);
      patch({ loading: false });
    }
  }, [loadConnections, loadInvites, patch, router]);

  useEffect(() => {
    Promise.resolve().then(loadAll);
    // V1 behaviour: any friend_requests change refreshes relationship state.
    const channel = supabase.channel("dashboard-connections").on(
      "postgres_changes",
      { event: "*", schema: "public", table: "friend_requests" },
      async () => {
        const uid = userIdRef.current;
        if (!uid) return;
        const conn = await loadConnections(uid);
        setState((s) => ({
          ...s,
          connectionStates: conn.states,
          queue: [...s.queue.filter((q) => q.kind !== "connection"), ...conn.incoming],
        }));
      },
    );
    const unsubscribe = subscribeWithRetry(channel);
    return () => unsubscribe();
  }, [loadAll, loadConnections]);

  // ── Actions ─────────────────────────────────────────────────────────

  const setYearValue = useCallback((value: string) => setState((s) => ({ ...s, year: { ...s.year, value } })), []);

  const confirmYear = useCallback(async () => {
    const p = state.profile;
    if (!p) return;
    setState((s) => ({ ...s, year: { ...s.year, saving: true } }));
    try {
      const { error } = await supabase.from("profiles").update({ year_of_study: state.year.value }).eq("id", p.id);
      if (error) console.warn("Could not save year_of_study to DB:", error);
      localStorage.setItem(`year_confirmed_${p.id}`, "true");
      setState((s) => ({
        ...s,
        profile: s.profile ? { ...s.profile, year_of_study: s.year.value } : s.profile,
        year: { ...s.year, visible: false, saving: false },
      }));
    } catch (err) {
      console.error(err);
      localStorage.setItem(`year_confirmed_${p.id}`, "true");
      setState((s) => ({ ...s, year: { ...s.year, visible: false, saving: false } }));
    }
  }, [state.profile, state.year.value]);

  const removeQueueItem = useCallback(
    (match: (q: QueueItem) => boolean) => setState((s) => ({ ...s, queue: s.queue.filter((q) => !match(q)) })),
    [],
  );

  const acceptInvite = useCallback(
    async (inviteId: string) => {
      patch({ busyId: inviteId });
      const { error } = await supabase.rpc("accept_team_invite", { p_invite_id: inviteId });
      patch({ busyId: null });
      if (error) {
        showToast(error.message, "error");
        return;
      }
      showToast("Invite accepted!", "success");
      removeQueueItem((q) => q.kind === "invite" && q.id === inviteId);
      window.dispatchEvent(new Event("hm:teams-changed"));
      loadAll();
    },
    [loadAll, patch, removeQueueItem, showToast],
  );

  const declineInvite = useCallback(
    async (inviteId: string) => {
      patch({ busyId: inviteId });
      const { error } = await supabase.rpc("reject_team_invite", { p_invite_id: inviteId });
      patch({ busyId: null });
      if (error) {
        showToast(error.message, "error");
        return;
      }
      showToast("Invite rejected.", "info");
      removeQueueItem((q) => q.kind === "invite" && q.id === inviteId);
    },
    [patch, removeQueueItem, showToast],
  );

  const fetchTeamsWithSlots = useCallback(async (userId: string): Promise<TeamWithSlots[]> => {
    const { data, error } = await supabase.from("teams").select("id, name, max_members, team_members(count)").eq("owner_id", userId);
    if (error) {
      console.error("[dashboard] teams with slots failed:", error);
      return [];
    }
    return ((data || []) as unknown as { id: string; name: string; max_members: number; team_members: { count: number }[] | { count: number } }[]).flatMap(
      (t) => {
        const c = Array.isArray(t.team_members) ? t.team_members[0] : t.team_members;
        const open = (t.max_members ?? 4) - (c ? c.count : 0);
        return open > 0 ? [{ id: t.id, name: t.name, openSlots: open }] : [];
      },
    );
  }, []);

  const acceptConnection = useCallback(
    async (requestId: string, other: ConnectedUser) => {
      patch({ busyId: requestId });
      const { error } = await supabase.rpc("accept_connection_request", { p_request_id: requestId });
      patch({ busyId: null });
      if (error) {
        showToast(error.message, "error");
        return;
      }
      showToast("Connection accepted!", "success");
      trackEvent("connection_request_accepted", { other_user_id: other.id });
      removeQueueItem((q) => q.kind === "connection" && q.id === requestId);
      setState((s) => ({ ...s, connectionStates: { ...s.connectionStates, [other.id]: "connected" } }));
      const uid = userIdRef.current;
      if (uid) {
        const slots = await fetchTeamsWithSlots(uid);
        setPrompt({ open: true, user: other, teams: slots });
      }
    },
    [fetchTeamsWithSlots, patch, removeQueueItem, showToast],
  );

  const declineConnection = useCallback(
    async (requestId: string, otherId: string) => {
      patch({ busyId: requestId });
      const { error } = await supabase.from("friend_requests").delete().eq("id", requestId);
      patch({ busyId: null });
      if (error) {
        showToast(error.message, "error");
        return;
      }
      showToast("Request updated.", "info");
      trackEvent("connection_request_declined", { request_id: requestId });
      removeQueueItem((q) => q.kind === "connection" && q.id === requestId);
      setState((s) => {
        const next = { ...s.connectionStates };
        delete next[otherId];
        return { ...s, connectionStates: next };
      });
    },
    [patch, removeQueueItem, showToast],
  );

  const inviteFromPrompt = useCallback(
    async (teamId: string) => {
      const u = prompt.user;
      if (!u) return;
      const { error } = await supabase.rpc("send_team_invite", { p_team_id: teamId, p_invited_user_id: u.id });
      if (error) showToast(error.message, "error");
      else showToast(`Invite sent to ${u.full_name}!`, "success");
    },
    [prompt.user, showToast],
  );

  return {
    data: state,
    reload: loadAll,
    setYearValue,
    confirmYear,
    acceptInvite,
    declineInvite,
    acceptConnection,
    declineConnection,
    prompt,
    closePrompt: () => setPrompt((p) => ({ ...p, open: false })),
    inviteFromPrompt,
  };
}
