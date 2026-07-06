"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";

import { parseGithubUsername, fetchGithubStats } from "@/lib/github";

type Profile = {
  id: string;
  full_name: string;
  email: string;
  college: string;
  bio: string;
  github_url: string;
  linkedin_url: string;
  avatar_url: string;
  skills: string[];
  github_stats?: {
    followers: number;
    public_repos: number;
    top_languages: Record<string, number>;
    repos: Array<{
      name: string;
      description: string | null;
      language: string | null;
      stars: number;
      url: string;
    }>;
  } | null;
  github_stats_updated_at?: string | null;
};

type ConnectionState =
  | "self"
  | "not_connected"
  | "request_sent"
  | "request_received"
  | "connected";

export default function ProfilePage() {
  const { showToast, confirm } = useNotification();
  const params = useParams();
  const id = params.id as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [ownedTeams, setOwnedTeams] = useState<{ id: string; name: string; max_members: number | null; memberCount: number }[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [alreadyInvited, setAlreadyInvited] = useState(false);

  const [syncing, setSyncing] = useState(false);

  // ── Block & Report states ──
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("Spam");
  const [reportDetails, setReportDetails] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

  // ── Connections state ──
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("not_connected");
  const [connectionRequestId, setConnectionRequestId] = useState<string | null>(
    null
  );
  const [connectionLoading, setConnectionLoading] = useState(false);

  // ── Stats state ──
  const [connectionsCount, setConnectionsCount] = useState(0);
  const [teamsCount, setTeamsCount] = useState(0);

  async function loadConnectionState(myId: string, otherId: string) {
    const { data: existing } = await supabase
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status")
      .or(
        `and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`
      )
      .maybeSingle();

    if (!existing) {
      setConnectionState("not_connected");
      return;
    }

    setConnectionRequestId(existing.id);

    if (existing.status === "accepted") {
      setConnectionState("connected");
    } else if (existing.status === "pending") {
      if (existing.sender_id === myId) {
        setConnectionState("request_sent");
      } else {
        setConnectionState("request_received");
      }
    } else {
      // rejected — treat as not connected, allow re-sending
      setConnectionState("not_connected");
    }
  }

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error(error);
    } else {
      setProfile(data);

      // Load statistics (connections count and teams count for this user id)
      const { count: connCount } = await supabase
        .from("friend_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "accepted")
        .or(`sender_id.eq.${data.id},receiver_id.eq.${data.id}`);
      setConnectionsCount(connCount || 0);

      const { count: tCount } = await supabase
        .from("team_members")
        .select("*", { count: "exact", head: true })
        .eq("user_id", data.id);
      setTeamsCount(tCount || 0);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setCurrentUserId(user.id);
        setIsOwnProfile(user.id === data.id);

        // Check if blocker / blocked relationship exists
        if (user.id !== data.id) {
          const { data: myBlock } = await supabase
            .from("blocked_users")
            .select("id")
            .eq("blocker_id", user.id)
            .eq("blocked_id", data.id)
            .maybeSingle();
          setIsBlockedByMe(!!myBlock);

          const { data: theirBlock } = await supabase
            .from("blocked_users")
            .select("id")
            .eq("blocker_id", data.id)
            .eq("blocked_id", user.id)
            .maybeSingle();
          setHasBlockedMe(!!theirBlock);
        }

        const { data: teamsData } = await supabase
          .from("teams")
          .select("id, name, max_members, team_members(count)")
          .eq("owner_id", user.id);

        const teamsWithCounts = (teamsData as unknown as {
          id: string;
          name: string;
          max_members: number;
          team_members: { count: number }[] | { count: number };
        }[] || []).map((t) => {
          const countObj = Array.isArray(t.team_members) ? t.team_members[0] : t.team_members;
          const memberCount = countObj ? countObj.count : 0;
          return {
            id: t.id,
            name: t.name,
            max_members: t.max_members,
            memberCount: memberCount || 0,
          };
        });

        setOwnedTeams(teamsWithCounts);
        if (teamsData && teamsData.length > 0) {
          const teamIds = teamsData.map((team) => team.id);

          const { data: existingInvite } = await supabase
            .from("team_invites")
            .select("id")
            .eq("invited_user_id", data.id)
            .in("team_id", teamIds)
            .eq("status", "pending")
            .limit(1);

          setAlreadyInvited(
            !!existingInvite && existingInvite.length > 0
          );
        }

        // ── Load connection state ──
        if (user.id !== data.id) {
          await loadConnectionState(user.id, data.id);
        }
      }
    }

    setLoading(false);
  }

  async function syncGithubData() {
    if (!profile?.github_url) return;
    const username = parseGithubUsername(profile.github_url);
    if (!username) {
      showToast("Could not parse a valid GitHub username from the URL.", "error");
      return;
    }

    setSyncing(true);
    try {
      showToast("Fetching GitHub data...", "info");
      const stats = await fetchGithubStats(username);
      
      const { error } = await supabase
        .from("profiles")
        .update({
          github_stats: stats,
          github_stats_updated_at: new Date().toISOString()
        })
        .eq("id", profile.id);

      if (error) {
        throw error;
      }

      showToast("GitHub stats synced successfully!", "success");
      await loadProfile();
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("column") && err.message?.includes("does not exist")) {
        showToast(
          "Database migration pending. Please run supabase db push to create github_stats column.",
          "error"
        );
      } else {
        showToast(err.message || "Failed to sync GitHub statistics.", "error");
      }
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (id) {
      Promise.resolve().then(() => {
        loadProfile();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function formatUrl(url: string) {
    if (!url) return "";

    return url.startsWith("http://") || url.startsWith("https://")
      ? url
      : `https://${url}`;
  }

  async function sendConnectionRequest() {
    if (!currentUserId || !profile) return;
    setConnectionLoading(true);

    const { data, error } = await supabase.rpc("send_connection_request", {
      p_receiver_id: profile.id,
    });

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      setConnectionLoading(false);
      return;
    }

    setConnectionRequestId(data);
    setConnectionState("request_sent");
    showToast("Connection request sent", "success");
    setConnectionLoading(false);

    // Trigger email alert
    fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderId: currentUserId,
        recipientId: profile.id,
        type: "connection_request",
      }),
    }).catch((err) => console.error("Failed to send fallback notification email:", err));
  }

  async function acceptConnectionRequest() {
    if (!connectionRequestId || !profile || !currentUserId) return;
    setConnectionLoading(true);

    const { error } = await supabase.rpc("accept_connection_request", {
      p_request_id: connectionRequestId,
    });

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      setConnectionLoading(false);
      return;
    }

    setConnectionState("connected");
    showToast("Connection request accepted!", "success");
    setConnectionLoading(false);
  }

  async function cancelOrRemoveConnection() {
    if (!connectionRequestId) return;
    setConnectionLoading(true);

    const { error } = await supabase
      .from("friend_requests")
      .delete()
      .eq("id", connectionRequestId);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      setConnectionLoading(false);
      return;
    }

    setConnectionRequestId(null);
    setConnectionState("not_connected");
    showToast("Connection removed", "info");
    setConnectionLoading(false);
  }

  async function performBlock() {
    setBlockLoading(true);
    try {
      const { error } = await supabase
        .from("blocked_users")
        .insert({
          blocker_id: currentUserId,
          blocked_id: profile!.id,
        });
      if (error) {
        showToast(error.message, "error");
      } else {
        setIsBlockedByMe(true);
        showToast("User blocked successfully", "success");
        // Auto remove pending requests/connections
        if (connectionState !== "not_connected") {
          await cancelOrRemoveConnection();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBlockLoading(false);
    }
  }

  async function toggleBlock() {
    if (!currentUserId || !profile) return;
    try {
      if (isBlockedByMe) {
        setBlockLoading(true);
        const { error } = await supabase
          .from("blocked_users")
          .delete()
          .eq("blocker_id", currentUserId)
          .eq("blocked_id", profile.id);
        setBlockLoading(false);
        if (error) {
          showToast(error.message, "error");
        } else {
          setIsBlockedByMe(false);
          showToast("User unblocked successfully", "success");
        }
      } else {
        confirm({
          title: "Block User",
          message: "Are you sure you want to block this user? They will not be able to message you or see your profiles.",
          confirmText: "Block",
          cancelText: "Cancel",
          onConfirm: () => {
            performBlock();
          }
        });
      }
    } catch (err) {
      console.error(err);
      setBlockLoading(false);
    }
  }

  async function submitReport(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setReportLoading(true);
    try {
      const { error } = await supabase
        .from("user_reports")
        .insert({
          reporter_id: currentUserId,
          reported_id: profile.id,
          reason: reportReason,
          details: reportDetails.trim(),
        });

      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Report submitted successfully. Our safety team will review it.", "success");
        setShowReportModal(false);
        setReportDetails("");
        setReportReason("Spam");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReportLoading(false);
    }
  }

  async function sendInvite() {
    if (!selectedTeam || !profile) return;

    try {
      setInviteLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: existingMember } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", selectedTeam)
        .eq("user_id", profile.id)
        .maybeSingle();

      if (existingMember) {
        showToast("This user is already a member of that team.", "warning");
        return;
      }

      const { error } = await supabase.rpc("send_team_invite", {
        p_team_id: selectedTeam,
        p_invited_user_id: profile.id,
      });

      if (error) {
        showToast(error.message, "error");
        return;
      }

      showToast("Invite sent successfully!", "success");
      setAlreadyInvited(true);
      setShowInviteModal(false);
      setSelectedTeam("");

      // Trigger email alert
      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: user.id,
          recipientId: profile.id,
          type: "team_invite",
          teamId: selectedTeam,
        }),
      }).catch((err) => console.error("Failed to send fallback notification email:", err));
    } catch (err) {
      console.error(err);
      showToast("Failed to send invite", "error");
    } finally {
      setInviteLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 pt-36 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-8 h-8 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-4" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading profile...</p>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="max-w-4xl mx-auto px-6 pt-36 pb-12">
        <div className="card card-static p-12 text-center animate-fade-in-up">
          <div className="w-12 h-12 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
            </svg>
          </div>
          <h1 className="text-sm font-semibold text-white mb-1.5">Profile not found</h1>
          <p className="text-xs text-zinc-500">This user doesn&apos;t exist or has been removed.</p>
        </div>
      </main>
    );
  }

  // Blocker view check - Hide details if blocker or blocker relation exists
  if (hasBlockedMe) {
    return (
      <main className="max-w-4xl mx-auto px-6 pt-36 pb-12">
        <div className="card card-static p-12 text-center border-rose-500/20 bg-rose-500/[0.02] animate-fade-in-up">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4 text-rose-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-sm font-semibold text-white mb-1.5">Access Denied</h1>
          <p className="text-xs text-zinc-500 max-w-xs mx-auto">This profile is not available. Return to discover other developers.</p>
          <Link href="/developers" className="btn btn-secondary btn-sm mt-5 inline-flex">
            Back to Builders
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-6 pt-32 pb-16">
      {/* Back Button */}
      <div className="mb-6 animate-fade-in-up">
        <Link
          href="/developers"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors mb-2 font-mono uppercase tracking-wider"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Builders
        </Link>
      </div>

      {/* Profile Premium Container */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950 p-6 md:p-8 animate-fade-in-up shadow-2xl">
        {/* Decorative Grid & Glows */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/[0.04] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/[0.04] rounded-full blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
          
          {/* ── LEFT COLUMN: Summary, Actions & Links ── */}
          <div className="lg:border-r lg:border-zinc-900 lg:pr-8 flex flex-col justify-between">
            <div>
              {/* Avatar Frame with custom outline and offset */}
              <div className="relative w-28 h-28 mx-auto lg:mx-0 mb-6 group">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 opacity-20 blur-md group-hover:opacity-40 transition-opacity duration-300" />
                <div className="relative w-full h-full rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center overflow-hidden p-1 shadow-lg">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name}
                      className="w-full h-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-xl bg-gradient-to-br from-indigo-900/30 to-purple-900/30 flex items-center justify-center font-bold text-white text-3xl font-sans">
                      {profile.full_name?.charAt(0)}
                    </div>
                  )}
                </div>
                {!isBlockedByMe && (
                  <div className="absolute -bottom-1.5 -right-1.5 bg-emerald-500 w-5 h-5 rounded-full border-4 border-zinc-950 shadow-md flex items-center justify-center" title="Available for teams">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                  </div>
                )}
              </div>

              {/* Title & Info */}
              <div className="text-center lg:text-left mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-white mb-1.5">
                  {profile.full_name}
                </h1>
                <p className="text-xs text-zinc-400 font-medium">
                  {profile.college || "Independent Builder"}
                </p>

                {/* Status Badges */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 mt-3.5">
                  <span className={`text-[10px] px-2.5 py-1 font-mono uppercase tracking-wider rounded border ${
                    isBlockedByMe
                      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  }`}>
                    {isBlockedByMe ? "Blocked" : "Available for Teams"}
                  </span>
                </div>
              </div>

              {/* Action Buttons Menu */}
              {!isBlockedByMe && (
                <div className="space-y-2 mt-6">
                  {isOwnProfile ? (
                    <Link
                      href="/profile/edit"
                      className="btn btn-secondary w-full py-2.5 flex items-center justify-center gap-2 text-xs font-mono uppercase tracking-wider border border-zinc-800 hover:border-zinc-700 bg-zinc-900/20"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                      Edit Profile
                    </Link>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <ConnectionButton
                          state={connectionState}
                          loading={connectionLoading}
                          onConnect={sendConnectionRequest}
                          onAccept={acceptConnectionRequest}
                          onCancelOrRemove={cancelOrRemoveConnection}
                        />

                        {connectionState === "connected" && (
                          <Link
                            href={`/messages?user=${profile.id}`}
                            className="btn btn-secondary py-2 flex items-center justify-center gap-2 text-xs"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                            </svg>
                            Message
                          </Link>
                        )}
                      </div>

                      {ownedTeams.length > 0 && (
                        <button
                          onClick={() => {
                            if (!alreadyInvited) {
                              setShowInviteModal(true);
                            }
                          }}
                          disabled={alreadyInvited}
                          className={`btn w-full py-2.5 text-xs ${
                            alreadyInvited
                              ? "btn-secondary opacity-70 cursor-not-allowed"
                              : "btn-primary"
                          }`}
                        >
                          {alreadyInvited ? "Invite Sent ✓" : "Invite to Team"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Links and Contact Section */}
            {!isBlockedByMe && (
              <div className="space-y-2 mt-8 pt-6 border-t border-zinc-900">
                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">Links & Contact</p>
                
                {/* Email Link */}
                <a
                  href={`mailto:${profile.email}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/20 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/40 transition-all text-zinc-400 hover:text-white text-xs truncate"
                >
                  <svg className="w-4 h-4 text-zinc-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  <span className="truncate">{profile.email}</span>
                </a>

                {/* GitHub Link */}
                {profile.github_url ? (
                  <a
                    href={formatUrl(profile.github_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/20 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/40 transition-all text-zinc-400 hover:text-white text-xs truncate"
                  >
                    <svg className="w-4 h-4 text-zinc-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    <span className="truncate">GitHub Profile</span>
                  </a>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-950/20 border border-zinc-900/50 text-zinc-600 text-xs">
                    <svg className="w-4 h-4 text-zinc-700 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    <span>GitHub not added</span>
                  </div>
                )}

                {/* LinkedIn Link */}
                {profile.linkedin_url ? (
                  <a
                    href={formatUrl(profile.linkedin_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/20 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/40 transition-all text-zinc-400 hover:text-white text-xs truncate"
                  >
                    <svg className="w-4 h-4 text-zinc-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                    <span className="truncate">LinkedIn Profile</span>
                  </a>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-950/20 border border-zinc-900/50 text-zinc-600 text-xs">
                    <svg className="w-4 h-4 text-zinc-700 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                    <span>LinkedIn not added</span>
                  </div>
                )}
              </div>
            )}

            {/* Block & Report actions footer */}
            {!isOwnProfile && (
              <div className="flex items-center gap-2 mt-6 pt-4 border-t border-zinc-900/50">
                <button
                  onClick={toggleBlock}
                  disabled={blockLoading}
                  className={`btn btn-xs flex-1 py-2 font-mono uppercase tracking-wider text-[9px] ${
                    isBlockedByMe
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                      : "bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                  }`}
                >
                  {isBlockedByMe ? "Unblock Builder" : "Block Builder"}
                </button>

                {!isBlockedByMe && (
                  <button
                    onClick={() => setShowReportModal(true)}
                    className="btn btn-secondary btn-xs py-2 px-3 flex items-center justify-center gap-1.5 font-mono uppercase tracking-wider text-[9px] border border-zinc-800"
                    title="Report profile for rules violations"
                  >
                    <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                    </svg>
                    Report
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN: Stats, Bio & Skills ── */}
          <div className="lg:col-span-2 lg:pl-4 flex flex-col gap-6">
            {isBlockedByMe ? (
              <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-zinc-800 rounded-xl bg-zinc-950/40 p-6 text-center">
                <svg className="w-10 h-10 text-zinc-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <h3 className="text-sm font-semibold text-zinc-400 mb-1">Builder is Blocked</h3>
                <p className="text-xs text-zinc-500 max-w-xs">You have blocked this builder. Unblock them using the button in the left sidebar to view their profile details.</p>
              </div>
            ) : (
              <>
                {/* Premium Activity Statistics Panel */}
                <div className="grid grid-cols-3 gap-3 animate-fade-in-up stagger-1">
                  <div className="p-4 rounded-xl bg-zinc-900/20 border border-zinc-800/80 flex flex-col justify-between hover:border-zinc-700 transition-colors">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Connections</span>
                    <span className="text-2xl font-bold text-white mt-1.5 font-mono">{connectionsCount}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-zinc-900/20 border border-zinc-800/80 flex flex-col justify-between hover:border-zinc-700 transition-colors">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Teams Joined</span>
                    <span className="text-2xl font-bold text-white mt-1.5 font-mono">{teamsCount}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-zinc-900/20 border border-zinc-800/80 flex flex-col justify-between hover:border-zinc-700 transition-colors">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Skills Mastered</span>
                    <span className="text-2xl font-bold text-white mt-1.5 font-mono">{profile.skills?.length || 0}</span>
                  </div>
                </div>

                {/* Bio Block with quote styling */}
                <div className="relative p-6 rounded-xl bg-zinc-900/20 border border-zinc-800/80 overflow-hidden animate-fade-in-up stagger-2 group">
                  <div className="absolute right-4 bottom-2 text-zinc-800/25 pointer-events-none transform group-hover:scale-110 transition-transform duration-500 select-none">
                    <svg className="w-20 h-20" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                    </svg>
                  </div>
                  
                  <div className="relative z-10">
                    <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">About Builder</p>
                    <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-line font-sans">
                      {profile.bio || "This user hasn't written a biography yet."}
                    </p>
                  </div>
                </div>

                {/* GitHub Repositories & Language Insights */}
                {profile.github_url && (
                  <div className="p-6 rounded-xl bg-zinc-900/20 border border-zinc-800/80 animate-fade-in-up stagger-3">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <div>
                        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-0.5">GitHub Repository Insights</p>
                        {profile.github_stats_updated_at && (
                          <span className="text-[9px] text-zinc-600 font-mono">
                            Synced {new Date(profile.github_stats_updated_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      
                      {isOwnProfile && (
                        <button
                          onClick={syncGithubData}
                          disabled={syncing}
                          className="btn btn-secondary btn-xs py-1.5 px-3 flex items-center gap-1.5 font-mono uppercase tracking-wider text-[9px] border border-zinc-800 bg-zinc-900/20 animate-fade-in"
                        >
                          {syncing ? (
                            <>
                              <div className="w-2.5 h-2.5 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                              Syncing...
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                              </svg>
                              Sync Stats
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {profile.github_stats ? (
                      <div className="space-y-6">
                        {/* Stats count badges */}
                        <div className="flex items-center gap-6 border-b border-zinc-900/50 pb-4">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-zinc-500 text-[10px] font-mono">Followers:</span>
                            <span className="text-white text-sm font-bold font-mono">{profile.github_stats.followers}</span>
                          </div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-zinc-500 text-[10px] font-mono">Public Repos:</span>
                            <span className="text-white text-sm font-bold font-mono">{profile.github_stats.public_repos}</span>
                          </div>
                        </div>

                        {/* Languages Breakdown */}
                        {Object.keys(profile.github_stats.top_languages || {}).length > 0 && (
                          <div>
                            <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-2.5">Top Languages</p>
                            {/* Distribution Bar */}
                            <div className="w-full h-2 rounded-full overflow-hidden flex bg-zinc-900">
                              {renderLanguageBar(profile.github_stats.top_languages)}
                            </div>
                            {/* Legends list */}
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                              {renderLanguageLegends(profile.github_stats.top_languages)}
                            </div>
                          </div>
                        )}

                        {/* Top Repos list */}
                        {profile.github_stats.repos && profile.github_stats.repos.length > 0 && (
                          <div>
                            <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-3">Featured Repositories</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {profile.github_stats.repos.map((repo) => (
                                <a
                                  key={repo.name}
                                  href={repo.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-3.5 rounded-lg bg-zinc-950/40 border border-zinc-900/60 hover:border-zinc-800 hover:bg-zinc-900/30 transition-all flex flex-col justify-between group"
                                >
                                  <div>
                                    <h4 className="text-xs font-semibold text-white group-hover:text-indigo-400 transition-colors truncate">
                                      {repo.name}
                                    </h4>
                                    {repo.description && (
                                      <p className="text-[10px] text-zinc-500 line-clamp-2 mt-1 leading-normal">
                                        {repo.description}
                                      </p>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center justify-between mt-3.5 pt-2 border-t border-zinc-900/40">
                                    {repo.language ? (
                                      <div className="flex items-center gap-1.5">
                                        <span
                                          className="w-2 h-2 rounded-full"
                                          style={{ backgroundColor: getLanguageColor(repo.language) }}
                                        />
                                        <span className="text-[10px] text-zinc-400 font-medium">{repo.language}</span>
                                      </div>
                                    ) : (
                                      <span className="text-[10px] text-zinc-600">Unknown</span>
                                    )}

                                    <div className="flex items-center gap-1 text-zinc-500 group-hover:text-zinc-400 transition-colors">
                                      <svg className="w-3 h-3 text-amber-500/70" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                      </svg>
                                      <span className="text-[10px] font-mono font-medium">{repo.stars}</span>
                                    </div>
                                  </div>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 border border-dashed border-zinc-800 rounded-lg bg-zinc-950/20">
                        <svg className="w-8 h-8 text-zinc-700 mx-auto mb-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253" />
                        </svg>
                        {isOwnProfile ? (
                          <>
                            <p className="text-zinc-500 text-xs mb-3">Enrich your builder card with public repository and language insights.</p>
                            <button
                              onClick={syncGithubData}
                              disabled={syncing}
                              className="btn btn-primary btn-xs py-1.5 px-4 font-mono uppercase tracking-wider text-[9px]"
                            >
                              {syncing ? "Syncing..." : "Sync GitHub Data"}
                            </button>
                          </>
                        ) : (
                          <p className="text-zinc-600 text-xs">No repository insights synced for this builder yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Skills Grid Section */}
                <div className="p-6 rounded-xl bg-zinc-900/20 border border-zinc-800/80 animate-fade-in-up stagger-4">
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Skills & Technologies</p>

                  <div className="flex flex-wrap gap-2">
                    {profile.skills?.length ? (
                      profile.skills.map((skill) => (
                        <div
                          key={skill}
                          className="px-3 py-1.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 hover:border-zinc-700/80 hover:bg-zinc-900/30 transition-all duration-250 flex items-center gap-2 group cursor-default"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 group-hover:bg-purple-500 transition-colors" />
                          <span className="text-xs text-zinc-300 group-hover:text-white transition-colors font-medium">
                            {skill}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center w-full py-4 border border-dashed border-zinc-850 rounded-lg text-zinc-600 text-xs">
                        No skills listed on this profile.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-sm">
            <h2 className="text-sm font-semibold text-white mb-1.5">Invite To Team</h2>
            <p className="text-xs text-zinc-400 mb-4">Select a team to invite {profile.full_name} to.</p>

            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="input text-xs w-full mb-4"
            >
              <option value="">Choose a team</option>
              {ownedTeams
                .filter((team) => !team.max_members || team.memberCount < team.max_members)
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
            </select>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
              <button onClick={() => setShowInviteModal(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={sendInvite} disabled={!selectedTeam || inviteLoading} className="btn btn-primary btn-sm">
                {inviteLoading ? "Sending..." : "Send Invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report User Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-md">
            <h2 className="text-sm font-semibold text-white mb-1.5">Report User Profile</h2>
            <p className="text-xs text-zinc-400 mb-4">Please specify why you are reporting {profile.full_name}. This remains anonymous.</p>

            <form onSubmit={submitReport} className="space-y-4">
              <div>
                <label className="section-label mb-1.5 block">Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="input text-xs w-full"
                >
                  <option value="Spam">Spam or Scams</option>
                  <option value="Harassment">Harassment or Abuse</option>
                  <option value="Inappropriate Content">Inappropriate profile content</option>
                  <option value="Off-topic">Off-topic link sharing</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="section-label mb-1.5 block">Details (Optional)</label>
                <textarea
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Tell us what went wrong..."
                  rows={4}
                  className="input text-xs w-full resize-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
                <button type="button" onClick={() => setShowReportModal(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={reportLoading} className="btn btn-primary btn-sm">
                  {reportLoading ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

/* ── Connection button — handles all states ── */
function ConnectionButton({
  state,
  loading,
  onConnect,
  onAccept,
  onCancelOrRemove,
}: {
  state: ConnectionState;
  loading: boolean;
  onConnect: () => void;
  onAccept: () => void;
  onCancelOrRemove: () => void;
}) {
  if (state === "connected") {
    return (
      <button
        onClick={onCancelOrRemove}
        disabled={loading}
        className="btn btn-secondary btn-sm group w-full py-2.5 flex items-center justify-center gap-1.5"
        title="Remove connection"
      >
        <svg className="w-3.5 h-3.5 text-emerald-400 group-hover:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        <span className="group-hover:hidden text-xs">Connected</span>
        <span className="hidden group-hover:inline text-xs">Disconnect</span>
      </button>
    );
  }

  if (state === "request_sent") {
    return (
      <button
        onClick={onCancelOrRemove}
        disabled={loading}
        className="btn btn-secondary btn-sm opacity-80 text-xs w-full py-2.5 flex items-center justify-center gap-1"
      >
        {loading ? "..." : "Sent ✓"}
      </button>
    );
  }

  if (state === "request_received") {
    return (
      <button
        onClick={onAccept}
        disabled={loading}
        className="btn btn-primary btn-sm text-xs w-full py-2.5 flex items-center justify-center gap-1"
      >
        {loading ? "..." : "Accept"}
      </button>
    );
  }

  return (
    <button
      onClick={onConnect}
      disabled={loading}
      className="btn btn-primary btn-sm text-xs w-full py-2.5 flex items-center justify-center gap-1.5"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
      </svg>
      {loading ? "..." : "Connect"}
    </button>
  );
}

function getLanguageColor(lang: string): string {
  const colors: Record<string, string> = {
    TypeScript: "#3178c6",
    JavaScript: "#f1e05a",
    Python: "#3572A5",
    HTML: "#e34c26",
    CSS: "#563d7c",
    Rust: "#dea584",
    Go: "#00ADD8",
    C: "#555555",
    "C++": "#f34b7d",
    "C#": "#178600",
    Ruby: "#701516",
    Java: "#b07219",
    Swift: "#F05138",
    Kotlin: "#A97BFF",
    PHP: "#4F5D95",
    Shell: "#89e051",
    Vue: "#41b883",
    Svelte: "#ff3e00",
  };
  return colors[lang] || "#8b949e";
}

function renderLanguageBar(topLanguages: Record<string, number>) {
  const total = Object.values(topLanguages).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  return Object.entries(topLanguages).map(([lang, count]) => {
    const pct = ((count / total) * 100).toFixed(1);
    return (
      <span
        key={lang}
        style={{
          width: `${pct}%`,
          backgroundColor: getLanguageColor(lang),
        }}
        title={`${lang}: ${pct}%`}
      />
    );
  });
}

function renderLanguageLegends(topLanguages: Record<string, number>) {
  const total = Object.values(topLanguages).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  return Object.entries(topLanguages).map(([lang, count]) => {
    const pct = ((count / total) * 100).toFixed(0);
    return (
      <div key={lang} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: getLanguageColor(lang) }}
        />
        <span className="font-semibold text-zinc-300">{lang}</span>
        <span className="text-zinc-500 font-mono">{pct}%</span>
      </div>
    );
  });
}
