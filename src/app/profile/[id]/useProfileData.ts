"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { trackEvent } from "@/lib/posthog";
import { moderateMessage } from "@/lib/safety";
import { parseGithubUsername, fetchGithubStats } from "@/lib/github";
import { SAFE_PROFILE_COLUMNS } from "@/lib/profileColumns";
import type { UserBadge } from "@/components/CertificateModal";
import type { TrackRecordData } from "@/components/BuilderTrackRecord";

export type GithubStats = {
  followers: number;
  public_repos: number;
  top_languages: Record<string, number>;
  repos: Array<{ name: string; description: string | null; language: string | null; stars: number; url: string }>;
};

export type BuilderProfile = {
  id: string;
  full_name: string;
  email?: string | null;
  username?: string | null;
  college: string | null;
  year_of_study?: string | null;
  bio: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  skills: string[] | null;
  is_available?: boolean | null;
  github_stats?: GithubStats | null;
  github_stats_updated_at?: string | null;
  has_participated_hackathon?: boolean | null;
  hackathon_participations?: number | null;
  has_won_hackathon?: boolean | null;
  hackathon_wins?: number | null;
  current_streak?: number | null;
  longest_streak?: number | null;
  last_active_date?: string | null;
  last_seen_at?: string | null;
  created_at?: string | null;
  show_track_record?: boolean | null;
};

export type ConnectionState = "self" | "not_connected" | "request_sent" | "request_received" | "connected";
export type OwnedTeamSlot = { id: string; name: string; max_members: number | null; memberCount: number };

// Streak + year columns are granted to authenticated/anon (see dashboard); V1
// only fetched them in its fallback query, so the streak/year badges rarely showed.
const PROFILE_COLUMNS = `${SAFE_PROFILE_COLUMNS}, year_of_study, current_streak, longest_streak, last_active_date`;

/**
 * /profile/[id] data + actions, ported from V1:
 * profile (with fallback), track record API (+ email passthrough),
 * get_builder_public_stats, user_badges, block relationship (both ways),
 * owned teams + pending-invite check, connection state, passport counts,
 * GitHub sync, connect pitch (+ transactional email), accept, remove,
 * block/unblock, report, invite, delete account.
 *
 * Fix: V1 only loaded the connection state when the viewer owned a team.
 */
export function useProfileData(id: string) {
  const router = useRouter();
  const { showToast, confirm } = useNotification();

  const [profile, setProfile] = useState<BuilderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [trackRecord, setTrackRecord] = useState<TrackRecordData | null>(null);
  const [trackRecordLoading, setTrackRecordLoading] = useState(true);
  const [stats, setStats] = useState({ connections: 0, teams: 0, practice: 0 });

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);
  const [ownedTeams, setOwnedTeams] = useState<OwnedTeamSlot[]>([]);
  const [alreadyInvited, setAlreadyInvited] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("not_connected");
  const [connectionRequestId, setConnectionRequestId] = useState<string | null>(null);

  const [busy, setBusy] = useState<null | "connect" | "block" | "report" | "invite" | "sync" | "delete">(null);

  const loadConnectionState = useCallback(async (myId: string, otherId: string) => {
    const { data: existing, error } = await supabase
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status")
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`)
      .maybeSingle();
    if (error) console.error("[profile] connection state failed:", error);
    if (!existing) {
      setConnectionState("not_connected");
      setConnectionRequestId(null);
      return;
    }
    setConnectionRequestId(existing.id);
    if (existing.status === "accepted") setConnectionState("connected");
    else if (existing.status === "pending") setConnectionState(existing.sender_id === myId ? "request_sent" : "request_received");
    else setConnectionState("not_connected"); // rejected → allow re-sending
  }, []);

  const loadProfile = useCallback(async () => {
    const primary = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", id).single();
    let data = primary.data as BuilderProfile | null;
    if (primary.error) {
      console.warn("[profile] primary profile query failed, retrying with base columns:", primary.error);
      const fb = await supabase.from("profiles").select(SAFE_PROFILE_COLUMNS).eq("id", id).single();
      if (fb.error) {
        console.error("[profile] profile read failed:", fb.error);
        // PGRST116 = no rows → genuinely not found; anything else is a real error.
        if (fb.error.code !== "PGRST116") setLoadError(fb.error.message);
      }
      data = fb.data as BuilderProfile | null;
    }

    if (!data) {
      setLoading(false);
      return;
    }
    setProfile(data);

    setTrackRecordLoading(true);
    fetch(`/api/builder-track-record/${data.id}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok || body?.success === false) {
          console.error("[profile] track record request failed:", res.status, body?.error ?? null);
          return null;
        }
        return body;
      })
      .then((resData) => {
        if (resData?.success && resData.data) {
          setTrackRecord(resData.data);
          if (resData.data.profile?.email) {
            setProfile((prev) => (prev ? { ...prev, email: resData.data.profile.email } : prev));
          }
        }
      })
      .catch((err) => console.warn("[profile] track record unavailable:", err))
      .finally(() => setTrackRecordLoading(false));

    const [statsRes, badgesRes, userRes, counts] = await Promise.all([
      supabase.rpc("get_builder_public_stats", { p_user_id: data.id }),
      // Kept as V1 wrote it: user_badges has no column-level grants and the
      // certificate modal consumes the full row.
      supabase.from("user_badges").select("*").eq("user_id", data.id).order("issued_at", { ascending: false }),
      supabase.auth.getUser(),
      Promise.all([
        supabase.from("team_members").select("id", { count: "exact", head: true }).eq("user_id", data.id),
        supabase.from("challenge_submissions").select("id", { count: "exact", head: true }).eq("user_id", data.id),
      ]),
    ]);

    if (statsRes.error) console.error("[profile] get_builder_public_stats failed:", statsRes.error);
    if (badgesRes.error) console.error("[profile] user_badges failed:", badgesRes.error);
    const s = (statsRes.data || {}) as { connections_count?: number; teams_count?: number };
    counts.forEach((c, i) => {
      if (c.error) console.error(`[profile] count ${i} failed:`, c.error);
    });
    setStats({
      connections: s.connections_count || 0,
      teams: s.teams_count || counts[0].count || 0,
      practice: counts[1].count || 0,
    });
    setBadges((badgesRes.data as unknown as UserBadge[]) || []);

    const user = userRes.data.user;
    if (user) {
      setViewerId(user.id);
      const own = user.id === data.id;
      setIsOwnProfile(own);
      if (own) setConnectionState("self");

      const [myBlock, theirBlock, teamsRes] = await Promise.all([
        own ? Promise.resolve({ data: null, error: null }) : supabase.from("blocked_users").select("id").eq("blocker_id", user.id).eq("blocked_id", data.id).maybeSingle(),
        own ? Promise.resolve({ data: null, error: null }) : supabase.from("blocked_users").select("id").eq("blocker_id", data.id).eq("blocked_id", user.id).maybeSingle(),
        supabase.from("teams").select("id, name, max_members, team_members(count)").eq("owner_id", user.id),
      ]);
      if (myBlock.error) console.error("[profile] block check (mine) failed:", myBlock.error);
      if (theirBlock.error) console.error("[profile] block check (theirs) failed:", theirBlock.error);
      if (teamsRes.error) console.error("[profile] owned teams failed:", teamsRes.error);
      setIsBlockedByMe(Boolean(myBlock.data));
      setHasBlockedMe(Boolean(theirBlock.data));

      const teams = ((teamsRes.data || []) as unknown as { id: string; name: string; max_members: number; team_members: { count: number }[] | { count: number } }[]).map((t) => {
        const c = Array.isArray(t.team_members) ? t.team_members[0] : t.team_members;
        return { id: t.id, name: t.name, max_members: t.max_members, memberCount: (c ? c.count : 0) || 0 };
      });
      setOwnedTeams(teams);

      if (teams.length > 0 && !own) {
        const { data: existingInvite, error: invErr } = await supabase
          .from("team_invites")
          .select("id")
          .eq("invited_user_id", data.id)
          .in(
            "team_id",
            teams.map((t) => t.id),
          )
          .eq("status", "pending")
          .limit(1);
        if (invErr) console.error("[profile] pending invite check failed:", invErr);
        setAlreadyInvited(Boolean(existingInvite && existingInvite.length > 0));
      }

      if (!own) await loadConnectionState(user.id, data.id);
    }

    setLoading(false);
  }, [id, loadConnectionState]);

  useEffect(() => {
    if (id) Promise.resolve().then(loadProfile);
  }, [id, loadProfile]);

  // ── Actions ──────────────────────────────────────────────────────────

  const sendConnectionRequest = useCallback(
    async (pitchMessage?: string): Promise<boolean> => {
      if (!viewerId || !profile) return false;
      let note = pitchMessage;
      if (note && note.trim()) {
        const moderation = moderateMessage(note.trim());
        if (!moderation.isValid) {
          showToast(moderation.error || "Message blocked due to inappropriate content.", "error");
          return false;
        }
        note = moderation.sanitized;
      }
      setBusy("connect");
      const { data, error } = await supabase.rpc("send_connection_request", { p_receiver_id: profile.id, p_message: note || null });
      if (error) {
        console.error("[profile] send_connection_request failed:", error);
        showToast(error.message, "error");
        setBusy(null);
        return false;
      }
      setConnectionRequestId(data as string);
      setConnectionState("request_sent");
      showToast("Connection request sent", "success");
      trackEvent("connection_request_sent", { receiver_id: profile.id, has_pitch_message: !!note });

      // Non-blocking transactional email to the recipient (same payload as V1).
      (async () => {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          await fetch("/api/send-email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(sessionData?.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}),
            },
            body: JSON.stringify({ senderId: viewerId, recipientId: profile.id, type: "connection_request" }),
          });
        } catch (emailErr) {
          console.warn("[profile] connection email dispatch error:", emailErr);
        }
      })();
      setBusy(null);
      return true;
    },
    [profile, showToast, viewerId],
  );

  const acceptConnection = useCallback(async (): Promise<boolean> => {
    if (!connectionRequestId || !profile || !viewerId) return false;
    setBusy("connect");
    const { error } = await supabase.rpc("accept_connection_request", { p_request_id: connectionRequestId });
    setBusy(null);
    if (error) {
      console.error("[profile] accept_connection_request failed:", error);
      showToast(error.message, "error");
      return false;
    }
    setConnectionState("connected");
    showToast("Connection request accepted!", "success");
    return true;
  }, [connectionRequestId, profile, showToast, viewerId]);

  const removeConnection = useCallback(
    async (successMessage = "Connection removed") => {
      if (!connectionRequestId) return;
      setBusy("connect");
      const { error } = await supabase.from("friend_requests").delete().eq("id", connectionRequestId);
      setBusy(null);
      if (error) {
        console.error("[profile] remove connection failed:", error);
        showToast(error.message, "error");
        return;
      }
      setConnectionRequestId(null);
      setConnectionState("not_connected");
      showToast(successMessage, "info");
    },
    [connectionRequestId, showToast],
  );

  const performBlock = useCallback(async () => {
    if (!viewerId || !profile) return;
    setBusy("block");
    try {
      const { error } = await supabase.from("blocked_users").insert({ blocker_id: viewerId, blocked_id: profile.id });
      if (error) {
        showToast(error.message, "error");
      } else {
        setIsBlockedByMe(true);
        showToast("User blocked successfully", "success");
        if (connectionState !== "not_connected" && connectionState !== "self") await removeConnection();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(null);
    }
  }, [connectionState, profile, removeConnection, showToast, viewerId]);

  const toggleBlock = useCallback(async () => {
    if (!viewerId || !profile) return;
    if (isBlockedByMe) {
      setBusy("block");
      const { error } = await supabase.from("blocked_users").delete().eq("blocker_id", viewerId).eq("blocked_id", profile.id);
      setBusy(null);
      if (error) showToast(error.message, "error");
      else {
        setIsBlockedByMe(false);
        showToast("User unblocked successfully", "success");
      }
      return;
    }
    confirm({
      title: `Block ${profile.full_name?.split(" ")[0] || "this builder"}?`,
      message: "They won't be able to message you or see your profile. You can unblock them later from this page.",
      confirmText: "Block",
      cancelText: "Cancel",
      onConfirm: () => {
        performBlock();
      },
    });
  }, [confirm, isBlockedByMe, performBlock, profile, showToast, viewerId]);

  const submitReport = useCallback(
    async (reason: string, details: string): Promise<boolean> => {
      if (!profile) return false;
      setBusy("report");
      try {
        const { error } = await supabase.from("user_reports").insert({ reporter_id: viewerId, reported_id: profile.id, reason, details: details.trim() });
        if (error) {
          showToast(error.message, "error");
          return false;
        }
        showToast("Report submitted successfully. Our safety team will review it.", "success");
        return true;
      } catch (err) {
        console.error(err);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [profile, showToast, viewerId],
  );

  const sendInvite = useCallback(
    async (teamId: string): Promise<boolean> => {
      if (!teamId || !profile) return false;
      setBusy("invite");
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return false;
        const { data: existingMember, error: mErr } = await supabase.from("team_members").select("id").eq("team_id", teamId).eq("user_id", profile.id).maybeSingle();
        if (mErr) console.error("[profile] membership check failed:", mErr);
        if (existingMember) {
          showToast("This user is already a member of that team.", "warning");
          return false;
        }
        const { error } = await supabase.rpc("send_team_invite", { p_team_id: teamId, p_invited_user_id: profile.id });
        if (error) {
          showToast(error.message, "error");
          return false;
        }
        showToast("Invite sent successfully!", "success");
        setAlreadyInvited(true);
        return true;
      } catch (err) {
        console.error(err);
        showToast("Failed to send invite", "error");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [profile, showToast],
  );

  const syncGithub = useCallback(async () => {
    if (!profile?.github_url) return;
    const username = parseGithubUsername(profile.github_url);
    if (!username) {
      showToast("Could not parse a valid GitHub username from the URL.", "error");
      return;
    }
    setBusy("sync");
    try {
      showToast("Fetching GitHub data...", "info");
      const githubStats = await fetchGithubStats(username);
      const { error } = await supabase
        .from("profiles")
        .update({ github_stats: githubStats, github_stats_updated_at: new Date().toISOString() })
        .eq("id", profile.id);
      if (error) throw error;
      showToast("GitHub stats synced successfully!", "success");
      await loadProfile();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      showToast(message || "Failed to sync GitHub statistics.", "error");
    } finally {
      setBusy(null);
    }
  }, [loadProfile, profile, showToast]);

  const deleteAccount = useCallback(async () => {
    setBusy("delete");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setBusy(null);
        return;
      }
      const { error } = await supabase.rpc("delete_user_completely", { p_target_user_id: user.id });
      if (error) {
        showToast(error.message, "error");
        setBusy(null);
      } else {
        showToast("Account permanently deleted.", "success");
        await supabase.auth.signOut();
        router.push("/");
      }
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : "Failed to delete account.", "error");
      setBusy(null);
    }
  }, [router, showToast]);

  const inviteFromPrompt = useCallback(
    async (teamId: string): Promise<boolean> => {
      if (!profile) return false;
      const { error } = await supabase.rpc("send_team_invite", { p_team_id: teamId, p_invited_user_id: profile.id });
      if (error) {
        showToast(error.message, "error");
        return false;
      }
      showToast(`Invite sent to ${profile.full_name}!`, "success");
      return true;
    },
    [profile, showToast],
  );

  return {
    profile,
    loading,
    loadError,
    badges,
    trackRecord,
    trackRecordLoading,
    stats,
    viewerId,
    isOwnProfile,
    isBlockedByMe,
    hasBlockedMe,
    ownedTeams,
    alreadyInvited,
    connectionState,
    busy,
    reload: loadProfile,
    sendConnectionRequest,
    acceptConnection,
    removeConnection,
    toggleBlock,
    submitReport,
    sendInvite,
    syncGithub,
    deleteAccount,
    inviteFromPrompt,
  };
}
