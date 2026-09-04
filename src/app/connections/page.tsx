"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";
import PostAcceptanceTeamPrompt, { type TeamWithSlots, type ConnectedUser } from "@/components/PostAcceptanceTeamPrompt";
import { trackEvent } from "@/lib/posthog";
import { getInitials } from "@/lib/utils";

type RequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  message?: string | null;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  college: string | null;
};

type EnrichedRequest = RequestRow & { profile: Profile };

function ConnectionsContent() {
  const { showToast } = useNotification();
  const router = useRouter();
  const [incoming, setIncoming] = useState<EnrichedRequest[]>([]);
  const [outgoing, setOutgoing] = useState<EnrichedRequest[]>([]);
  const [connections, setConnections] = useState<EnrichedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // ── Post-acceptance team prompt ──
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptUser, setPromptUser] = useState<ConnectedUser | null>(null);
  const [promptTeams, setPromptTeams] = useState<TeamWithSlots[]>([]);

  async function fetchTeamsWithSlots(userId: string): Promise<TeamWithSlots[]> {
    // Fetch teams owned by the accepting user with open slots
    const { data: teamsData } = await supabase
      .from("teams")
      .select("id, name, max_members, team_members(count)")
      .eq("owner_id", userId);

    if (!teamsData) return [];

    return (teamsData as unknown as {
      id: string;
      name: string;
      max_members: number;
      team_members: { count: number }[] | { count: number };
    }[]).flatMap((t) => {
      const countObj = Array.isArray(t.team_members) ? t.team_members[0] : t.team_members;
      const memberCount = countObj ? countObj.count : 0;
      const openSlots = (t.max_members ?? 4) - memberCount;
      return openSlots > 0 ? [{ id: t.id, name: t.name, openSlots }] : [];
    });
  }

  useEffect(() => {
    let active = true;
    let unsubSender: (() => void) | null = null;
    let unsubReceiver: (() => void) | null = null;

    loadAll();

    async function initRealtime() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;

      // Clean up previous channel from global client if exists
      const existingSender = supabase.channel(`friend_requests-sender:${user.id}`);
      await supabase.removeChannel(existingSender);
      const existingReceiver = supabase.channel(`friend_requests-receiver:${user.id}`);
      await supabase.removeChannel(existingReceiver);

      if (!active) return;

      const senderChannel = supabase.channel(`friend_requests-sender:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "friend_requests",
            filter: `sender_id=eq.${user.id}`,
          },
          () => {
            loadAll();
          }
        );

      const receiverChannel = supabase.channel(`friend_requests-receiver:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "friend_requests",
            filter: `receiver_id=eq.${user.id}`,
          },
          () => {
            loadAll();
          }
        );

      unsubSender = subscribeWithRetry(senderChannel);
      unsubReceiver = subscribeWithRetry(receiverChannel);
    }

    initRealtime();

    return () => {
      active = false;
      if (unsubSender) unsubSender();
      if (unsubReceiver) unsubReceiver();
    };
  }, []);

  async function loadAll() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: requests, error } = await supabase
      .from("friend_requests")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const rows = requests || [];

    // Collect all the "other person" ids we need profiles for
    const otherIds = Array.from(
      new Set(
        rows.map((r) => (r.sender_id === user.id ? r.receiver_id : r.sender_id))
      )
    );

    let profilesById: Record<string, Profile> = {};
    if (otherIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, college")
        .in("id", otherIds);

      profilesById = (profiles || []).reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {} as Record<string, Profile>);
    }

    const enriched: EnrichedRequest[] = rows
      .map((r) => {
        const otherId = r.sender_id === user.id ? r.receiver_id : r.sender_id;
        const profile = profilesById[otherId];
        if (!profile) return null;
        return { ...r, profile };
      })
      .filter(Boolean) as EnrichedRequest[];

    setIncoming(
      enriched.filter((r) => r.status === "pending" && r.receiver_id === user.id)
    );
    setOutgoing(
      enriched.filter((r) => r.status === "pending" && r.sender_id === user.id)
    );
    setConnections(enriched.filter((r) => r.status === "accepted"));

    setLoading(false);
  }

  async function acceptRequest(requestId: string, otherProfile: Profile) {
    setActionLoadingId(requestId);
    const { error } = await supabase.rpc("accept_connection_request", {
      p_request_id: requestId,
    });

    if (error) {
      showToast(error.message, "error");
      setActionLoadingId(null);
      return;
    }

    showToast("Connection accepted!", "success");
    trackEvent("connection_request_accepted", {
      other_user_id: otherProfile.id,
    });
    await loadAll();
    setActionLoadingId(null);

    // Fire team formation prompt
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const slots = await fetchTeamsWithSlots(user.id);
      setPromptTeams(slots);
      setPromptUser(otherProfile);
      setPromptOpen(true);
    }
  }

  async function rejectOrCancel(requestId: string) {
    setActionLoadingId(requestId);
    const { error } = await supabase
      .from("friend_requests")
      .delete()
      .eq("id", requestId);

    if (error) {
      showToast(error.message, "error");
      setActionLoadingId(null);
      return;
    }

    showToast("Request updated.", "info");
    trackEvent("connection_request_declined", {
      request_id: requestId,
    });
    await loadAll();
    setActionLoadingId(null);
  }

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 pt-24 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading connections...</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="max-w-4xl mx-auto px-6 pt-24 pb-16">
      {/* Header */}
      <div className="mb-8 animate-fade-in-up">
        <p className="section-label">NETWORK</p>
        <h1 className="text-2xl font-semibold tracking-tight text-white mb-1">
          Connections
        </h1>
        <p className="text-xs text-zinc-400">
          Manage incoming requests and see who you&apos;re connected with.
        </p>
      </div>

      {/* Incoming Requests */}
      <section className="mb-8 animate-fade-in-up stagger-1">
        <div className="flex items-center justify-between mb-3">
          <p className="section-label mb-0">INCOMING REQUESTS</p>
          {incoming.length > 0 && (
            <span className="badge text-[10px] py-0.5 px-1.5">{incoming.length}</span>
          )}
        </div>

        {incoming.length === 0 ? (
          <div className="card card-static p-8 text-center">
            <p className="text-zinc-500 text-xs">No pending requests right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {incoming.map((req) => (
              <div key={req.id} className="card card-static p-4">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/profile/${req.profile.id}`}
                    className="flex items-center gap-3 min-w-0 flex-1"
                  >
                    {req.profile.avatar_url ? (
                      <img
                        src={req.profile.avatar_url}
                        alt={req.profile.full_name}
                        className="w-9 h-9 rounded object-cover border border-zinc-800"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
                        {getInitials(req.profile.full_name, 1)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-white truncate">
                        {req.profile.full_name}
                      </p>
                      <p className="text-[10px] text-zinc-500 truncate">
                        {req.profile.college || "Independent Builder"}
                      </p>
                    </div>
                  </Link>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => acceptRequest(req.id, req.profile)}
                      disabled={actionLoadingId === req.id}
                      className="btn btn-primary btn-sm"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => rejectOrCancel(req.id)}
                      disabled={actionLoadingId === req.id}
                      className="btn btn-secondary btn-sm"
                    >
                      Decline
                    </button>
                  </div>
                </div>

                {req.message && (
                  <div className="mt-3 p-2.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/40 text-[11px] text-zinc-800 dark:text-zinc-200 font-medium leading-relaxed flex items-start gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold shrink-0">💬</span>
                    <span>&quot;{req.message}&quot;</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Outgoing Requests */}
      {outgoing.length > 0 && (
        <section className="mb-8 animate-fade-in-up stagger-2">
          <p className="section-label mb-3">SENT REQUESTS</p>
          <div className="space-y-3">
            {outgoing.map((req) => (
              <div key={req.id} className="card card-static p-4">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/profile/${req.profile.id}`}
                    className="flex items-center gap-3 min-w-0 flex-1"
                  >
                    {req.profile.avatar_url ? (
                      <img
                        src={req.profile.avatar_url}
                        alt={req.profile.full_name}
                        className="w-9 h-9 rounded object-cover border border-zinc-800"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
                        {getInitials(req.profile.full_name, 1)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-white truncate">
                        {req.profile.full_name}
                      </p>
                      <p className="text-[10px] text-zinc-500 truncate">
                        {req.profile.college || "Independent Builder"}
                      </p>
                    </div>
                  </Link>

                  <button
                    onClick={() => rejectOrCancel(req.id)}
                    disabled={actionLoadingId === req.id}
                    className="btn btn-secondary btn-sm flex-shrink-0"
                  >
                    Cancel
                  </button>
                </div>

                {req.message && (
                  <div className="mt-3 p-2.5 rounded-lg bg-zinc-100/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 text-[11px] text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed flex items-start gap-2">
                    <span className="text-zinc-500 font-bold shrink-0">💬 Your Pitch:</span>
                    <span>&quot;{req.message}&quot;</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Connections List */}
      <section className="animate-fade-in-up stagger-3">
        <div className="flex items-center justify-between mb-3">
          <p className="section-label mb-0">YOUR CONNECTIONS</p>
          {connections.length > 0 && (
            <span className="badge text-[10px] py-0.5 px-1.5">{connections.length}</span>
          )}
        </div>

        {connections.length === 0 ? (
          <div className="card card-static p-12 text-center">
            <div className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-3 text-zinc-500">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">No connections yet</h3>
            <p className="text-zinc-500 text-xs mb-4 max-w-xs mx-auto">
              Connect with fellow builders to form hackathon squads and collaborate.
            </p>
            <Link
              href="/developers"
              className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
            >
              <span>Explore Builders</span>
              <span className="font-mono">→</span>
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {connections.map((conn) => (
              <div key={conn.id} className="card p-4 flex items-center gap-3">
                <Link
                  href={`/profile/${conn.profile.id}`}
                  className="flex items-center gap-3 min-w-0 flex-1"
                >
                  {conn.profile.avatar_url ? (
                    <img
                      src={conn.profile.avatar_url}
                      alt={conn.profile.full_name}
                      className="w-9 h-9 rounded object-cover border border-zinc-800"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
                      {getInitials(conn.profile.full_name, 1)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-xs text-white truncate">
                      {conn.profile.full_name}
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate">
                      {conn.profile.college || "Independent Builder"}
                    </p>
                  </div>
                </Link>

                <Link
                  href={`/messages?user=${conn.profile.id}`}
                  className="btn btn-secondary btn-sm p-1.5 flex-shrink-0"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                    />
                  </svg>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>

    {/* Post-acceptance team formation prompt */}
    {promptUser && (
      <PostAcceptanceTeamPrompt
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        connectedUser={promptUser}
        teamsWithSlots={promptTeams}
        onCreateTeam={() =>
          router.push(`/teams/create?invite=${promptUser.id}`)
        }
        onInviteToTeam={async (teamId) => {
          const { error } = await supabase.rpc("send_team_invite", {
            p_team_id: teamId,
            p_invited_user_id: promptUser.id,
          });
          if (error) {
            showToast(error.message, "error");
          } else {
            showToast(`Invite sent to ${promptUser.full_name}!`, "success");
          }

        }}
      />
    )}
    </>
  );
}

export default function ConnectionsPage() {
  return (
    <AuthGuard>
      <ConnectionsContent />
    </AuthGuard>
  );
}
