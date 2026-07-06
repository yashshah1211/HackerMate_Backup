"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";

type RequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
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
  const [incoming, setIncoming] = useState<EnrichedRequest[]>([]);
  const [outgoing, setOutgoing] = useState<EnrichedRequest[]>([]);
  const [connections, setConnections] = useState<EnrichedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

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

  async function acceptRequest(requestId: string) {
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
    await loadAll();
    setActionLoadingId(null);
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
          <div className="space-y-2">
            {incoming.map((req) => (
              <div key={req.id} className="card card-static p-4 flex items-center justify-between gap-3">
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
                      {req.profile.full_name?.charAt(0)}
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
                    onClick={() => acceptRequest(req.id)}
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
            ))}
          </div>
        )}
      </section>

      {/* Outgoing Requests */}
      {outgoing.length > 0 && (
        <section className="mb-8 animate-fade-in-up stagger-2">
          <p className="section-label mb-3">SENT REQUESTS</p>
          <div className="space-y-2">
            {outgoing.map((req) => (
              <div key={req.id} className="card card-static p-4 flex items-center justify-between gap-3">
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
                      {req.profile.full_name?.charAt(0)}
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
            <p className="text-zinc-500 text-xs">
              No connections yet. Visit a profile and hit Connect.
            </p>
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
                      {conn.profile.full_name?.charAt(0)}
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
  );
}

export default function ConnectionsPage() {
  return (
    <AuthGuard>
      <ConnectionsContent />
    </AuthGuard>
  );
}
