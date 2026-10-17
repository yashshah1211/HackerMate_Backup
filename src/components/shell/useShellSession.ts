"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { SHELL_PROFILE_COLUMNS } from "@/lib/profileColumns";
import { CATEGORY_TONE, getTeamCategoryInfo } from "@/lib/teamCategory";

export type ShellProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
};

export type ShellTeam = {
  id: string;
  name: string;
  tone: "hack" | "proj";
  isOwner: boolean;
  eventName: string;
};

export type ShellSession = {
  mounted: boolean;
  /** True while the first auth check is running. */
  authLoading: boolean;
  /** Auth cookie/localStorage present (lets us avoid a guest flash). */
  hasSession: boolean;
  viewerId: string | null;
  profile: ShellProfile | null;
  teams: ShellTeam[];
  unreadNotifications: number;
  setUnreadNotifications: (n: number) => void;
  unreadMessages: number;
  currentStreak: number;
  reloadTeams: () => void;
  signOut: () => Promise<void>;
};

const USER_CACHE_KEY = "hackermate_user_cache";

/** Mirrors the V1 Navbar's synchronous session sniffing (no network). */
function sniffStoredSession(): { hasSession: boolean; cached: { id: string; full_name: string | null; role: string | null } | null } {
  let hasSession = false;
  let cached: { id: string; full_name: string | null; role: string | null } | null = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token") && !key.includes("code-verifier")) {
        const val = localStorage.getItem(key);
        if (val && val !== "null") {
          hasSession = true;
          break;
        }
      }
    }
    if (
      document.cookie
        .split(";")
        .some((c) => c.trim().startsWith("sb-") && c.includes("auth-token") && !c.includes("code-verifier"))
    ) {
      hasSession = true;
    }
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) {
        cached = { id: parsed.id, full_name: parsed.full_name || null, role: parsed.role || null };
        hasSession = true;
      }
    }
  } catch {
    // Storage can be unavailable (private mode); treat as signed out.
  }
  return { hasSession, cached };
}

type TeamRow = {
  id: string;
  name: string;
  hackathon_id: string | null;
  owner_id: string;
  team_hackathons?: { hackathon_id: string; hackathons: { id?: string; name?: string; type?: string | null; tags?: string[] | null } | null }[];
};

/**
 * Global session state for the app shell. Ported from the V1 Navbar:
 * profile + cache, unread notification count (excluding DM notifications),
 * unread DM senders, 30s last_seen_at heartbeat, realtime toasts, streak
 * events and sign-out. New in V2: the viewer's teams for the team switcher.
 */
export function useShellSession(expectedUserId?: string): ShellSession {
  const { showToast } = useNotification();
  const [mounted, setMounted] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ShellProfile | null>(null);
  const [teams, setTeams] = useState<ShellTeam[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [conversationIds, setConversationIds] = useState<string[]>([]);
  const viewerRef = useRef<string | null>(null);
  // Each bootstrap owns its continuations and callbacks, including after unmount.
  const scopeRef = useRef<{ active: boolean; userId: string | null; dispose?: () => void } | null>(null);

  // Instant, network-free restore to avoid a guest flash on reload.
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setMounted(true);
      const { hasSession: stored, cached } = sniffStoredSession();
      if (stored) setHasSession(true);
      if (cached && (!expectedUserId || cached.id === expectedUserId)) {
        setViewerId(cached.id);
        setProfile((p) => p ?? { id: cached.id, full_name: cached.full_name, avatar_url: null, role: cached.role });
      }
    });
    return () => { active = false; };
  }, [expectedUserId]);

  const loadUnreadCount = useCallback(async (userId: string) => {
    const scope = scopeRef.current;
    if (!scope?.active || scope.userId !== userId) return;
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .not("message", "ilike", "%sent you a message%")
      .not("message", "ilike", "%new message%");
    if (error) {
      console.error("[shell] unread notification count failed:", error);
      return;
    }
    if (scope.active) setUnreadNotifications(count || 0);
  }, []);

  const loadUnreadMessages = useCallback(async (userId: string) => {
    const scope = scopeRef.current;
    if (!scope?.active || scope.userId !== userId) return;
    const { data: participantRows, error: pErr } = await supabase
      .from("conversation_participants")
      .select("conversation_id, conversations!inner(type)")
      .eq("user_id", userId)
      .eq("conversations.type", "dm");
    if (pErr) {
      console.error("[shell] DM participant lookup failed:", pErr);
      return;
    }
    if (!scope.active) return;
    const ids = participantRows?.map((row) => row.conversation_id as string) || [];
    setConversationIds((prev) => (prev.length === ids.length && prev.every((v, i) => v === ids[i]) ? prev : ids));
    if (!ids.length) {
      setUnreadMessages(0);
      return;
    }
    const { data: unreadMsgs, error: mErr } = await supabase
      .from("messages")
      .select("sender_id")
      .in("conversation_id", ids)
      .neq("sender_id", userId)
      .eq("is_read", false);
    if (mErr) {
      console.error("[shell] unread DM count failed:", mErr);
      return;
    }
    if (scope.active) setUnreadMessages(new Set(unreadMsgs?.map((m) => m.sender_id) || []).size);
  }, []);

  const loadTeams = useCallback(async (userId: string) => {
    const scope = scopeRef.current;
    if (!scope?.active || scope.userId !== userId) return;
    const [{ data: memberRows, error: mErr }, { data: owned, error: oErr }] = await Promise.all([
      supabase.from("team_members").select("team_id").eq("user_id", userId),
      supabase.from("teams").select("id").eq("owner_id", userId),
    ]);
    if (mErr) console.error("[shell] team membership lookup failed:", mErr);
    if (oErr) console.error("[shell] owned team lookup failed:", oErr);
    if (!scope.active) return;
    const ids = Array.from(
      new Set([...(owned || []).map((t) => t.id as string), ...(memberRows || []).map((m) => m.team_id as string)]),
    );
    if (!ids.length) {
      setTeams([]);
      return;
    }
    const { data, error } = await supabase
      .from("teams")
      .select("id, name, hackathon_id, owner_id, team_hackathons(hackathon_id, hackathons(id, name, type, tags))")
      .in("id", ids);
    if (error) {
      console.error("[shell] team details failed:", error);
      return;
    }
    if (!scope.active) return;
    const rows = (data || []) as unknown as TeamRow[];
    setTeams(
      rows
        .map((t) => {
          const info = getTeamCategoryInfo(t);
          return {
            id: t.id,
            name: t.name,
            tone: CATEGORY_TONE[info.category],
            isOwner: t.owner_id === userId,
            eventName: info.eventName,
          };
        })
        .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name)),
    );
  }, []);

  // Session bootstrap, heartbeat and realtime (same cadence as V1).
  useEffect(() => {
    const scope = { active: true, userId: null as string | null, dispose: undefined as (() => void) | undefined };
    scopeRef.current = scope;
    let unsubNotif: (() => void) | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let onVisibilityChange: (() => void) | null = null;

    Promise.resolve().then(async () => {
      try {
        const {
          data: { user }, error,
        } = await supabase.auth.getUser();
        if (!scope.active) return;
        if (error) throw error;
        if (expectedUserId && user?.id !== expectedUserId) throw new Error("Shell identity changed during verification");
        if (!user) {
          viewerRef.current = null;
          setViewerId(null);
          setProfile(null);
          setHasSession(false);
          setTeams([]);
          try {
            localStorage.removeItem(USER_CACHE_KEY);
          } catch {}
          return;
        }

        scope.userId = user.id;
        viewerRef.current = user.id;
        setViewerId(user.id);
        setHasSession(true);

        const { data, error: profileError } = await supabase.from("profiles").select(SHELL_PROFILE_COLUMNS).eq("id", user.id).single();
        if (profileError) console.error("[shell] viewer profile failed:", profileError);
        if (!scope.active) return;
        if (data) {
          setProfile({ id: data.id, full_name: data.full_name, avatar_url: data.avatar_url, role: data.role });
          try {
            localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ id: user.id, full_name: data.full_name || null, role: data.role || null }));
          } catch {}
          if (data.current_streak) {
            const todayStr = new Date().toISOString().split("T")[0];
            const y = new Date();
            y.setDate(y.getDate() - 1);
            const yesterdayStr = y.toISOString().split("T")[0];
            const isActive = data.last_active_date === todayStr || data.last_active_date === yesterdayStr;
            setCurrentStreak(isActive ? data.current_streak : 0);
          } else {
            setCurrentStreak(0);
          }
        }

        // Mark the viewer active immediately, then every 3 mins while visible.
        await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
        if (!scope.active) return;
        await Promise.all([loadUnreadCount(user.id), loadUnreadMessages(user.id), loadTeams(user.id)]);
        if (!scope.active) return;

        onVisibilityChange = () => {
          if (document.visibilityState === "visible" && scope.active) {
            supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
          }
        };
        document.addEventListener("visibilitychange", onVisibilityChange);

        heartbeat = setInterval(async () => {
          if (scope.active && document.visibilityState === "visible") {
            await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
          }
        }, 180000);

        const notifChannel = supabase
          .channel(`notifications-navbar:${user.id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
            (payload) => {
              if (!scope.active) return;
              loadUnreadCount(user.id);
              if (payload.eventType === "INSERT") {
                const n = payload.new as { message: string };
                showToast(n.message, "info");
              }
            },
          );
        unsubNotif = subscribeWithRetry(notifChannel);
      } catch (err) {
        console.error("[shell] session bootstrap failed:", err);
      } finally {
        if (scope.active) setAuthLoading(false);
      }
    });

    const dispose = () => {
      if (!scope.active) return;
      scope.active = false;
      viewerRef.current = null;
      if (unsubNotif) unsubNotif();
      if (heartbeat) clearInterval(heartbeat);
      if (onVisibilityChange) document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    scope.dispose = dispose;
    return dispose;
  }, [expectedUserId, loadTeams, loadUnreadCount, loadUnreadMessages, showToast]);

  // Per-DM message channels keep the unread badge live (same as V1).
  useEffect(() => {
    const uid = viewerRef.current;
    const scope = scopeRef.current;
    if (!uid || !scope?.active || scope.userId !== uid || !conversationIds.length) return;
    const unsubs = conversationIds.map((id) => {
      const channel = supabase
        .channel(`messages-navbar:${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` }, () => {
          if (scope.active) loadUnreadMessages(uid);
        });
      return subscribeWithRetry(channel);
    });
    return () => unsubs.forEach((u) => u());
  }, [conversationIds, loadUnreadMessages]);

  // Streak updates broadcast by DailyStreakTracker.
  useEffect(() => {
    const onStreak = (e: Event) => {
      const detail = (e as CustomEvent<{ current_streak: number }>).detail;
      if (detail?.current_streak) setCurrentStreak(detail.current_streak);
    };
    window.addEventListener("streak-updated", onStreak);
    return () => window.removeEventListener("streak-updated", onStreak);
  }, []);

  // Pages dispatch `hm:teams-changed` after create/join/leave so the switcher stays current.
  useEffect(() => {
    const onTeams = () => {
      if (viewerRef.current) loadTeams(viewerRef.current);
    };
    window.addEventListener("hm:teams-changed", onTeams);
    return () => window.removeEventListener("hm:teams-changed", onTeams);
  }, [loadTeams]);

  const reloadTeams = useCallback(() => {
    if (viewerRef.current) loadTeams(viewerRef.current);
  }, [loadTeams]);

  const signOut = useCallback(async () => {
    scopeRef.current?.dispose?.();
    try {
      localStorage.removeItem("theme");
      localStorage.removeItem(USER_CACHE_KEY);
    } catch {}
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
    viewerRef.current = null;
    setViewerId(null);
    setHasSession(false);
    await supabase.auth.signOut();
    // Hard navigation on purpose: drops every in-memory client cache (same as V1).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }, []);

  return {
    mounted,
    authLoading,
    hasSession,
    viewerId,
    profile,
    teams,
    unreadNotifications,
    setUnreadNotifications,
    unreadMessages,
    currentStreak,
    reloadTeams,
    signOut,
  };
}
