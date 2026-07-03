"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";

type Request = {
  id: string;
  user_id: string;
  status: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
  };
};

export default function TeamRequestsPage() {
  const params = useParams();
  const { showToast } = useNotification();
  const teamId = params.id as string;

  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  const [memberCount, setMemberCount] = useState(0);
  const [maxMembers, setMaxMembers] = useState(0);
  const [teamFull, setTeamFull] = useState(false);
  const [teamName, setTeamName] = useState("");

  async function checkOwnership() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: team, error } = await supabase
      .from("teams")
      .select("owner_id, max_members, name")
      .eq("id", teamId)
      .single();

    if (error || !team) {
      console.error(error);
      setLoading(false);
      return;
    }

    setTeamName(team.name);

    if (team.owner_id !== user.id) {
      setLoading(false);
      return;
    }

    setMaxMembers(team.max_members || 0);

    const { count } = await supabase
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId);

    const currentCount = count || 0;

    setMemberCount(currentCount);

    if (team.max_members && currentCount >= team.max_members) {
      setTeamFull(true);
    } else {
      setTeamFull(false);
    }

    setIsOwner(true);
    loadRequests();
  }

  async function loadRequests() {
    const { data, error } = await supabase
      .from("team_join_requests")
      .select(
        `
        id,
        user_id,
        status,
        profiles (
          id,
          full_name,
          email
        )
      `
      )
      .eq("team_id", teamId)
      .eq("status", "pending");

    if (error) {
      console.error(error);
    } else {
      setRequests(data as unknown as Request[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (teamId) {
      Promise.resolve().then(() => {
        checkOwnership();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function acceptRequest(request: Request) {
    const { error } = await supabase.rpc("accept_team_join_request", {
      p_request_id: request.id,
    });

    if (error) {
      showToast(error.message, "error");
      return;
    }

    showToast("Join request accepted!", "success");
    await checkOwnership();
  }

  async function rejectRequest(requestId: string) {
    const { error } = await supabase
      .from("team_join_requests")
      .delete()
      .eq("id", requestId);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      return;
    }

    showToast("Join request rejected.", "info");
    loadRequests();
  }

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 pt-36 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--primary-500)] to-[var(--accent-500)] animate-pulse mb-4" />
          <p className="text-zinc-500">Loading requests...</p>
        </div>
      </main>
    );
  }

  if (!isOwner) {
    return (
      <main className="max-w-4xl mx-auto px-6 pt-36 pb-12">
        <div className="card card-static p-12 text-center animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-rose-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-zinc-500 mb-6">
            Only the team owner can view requests.
          </p>
          <Link href={`/teams/${teamId}`} className="btn btn-secondary">
            Back to Team
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-6 pt-24 pb-12">
      {/* Header */}
      <div className="mb-8 animate-fade-in-up">
        <Link
          href={`/teams/${teamId}`}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors mb-2 font-mono uppercase tracking-wider"
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
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          Back to team
        </Link>

        <p className="section-label">TEAM MANAGEMENT</p>

        <h1 className="text-2xl font-semibold tracking-tight text-white mb-1">
          Join Requests
        </h1>

        <p className="text-xs text-zinc-400">
          Review pending requests for {teamName}
        </p>
      </div>

      {/* Team Stats */}
      <div className="grid md:grid-cols-2 gap-4 mb-8 animate-fade-in-up stagger-1">
        <div className="card card-static p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-zinc-500 text-xs font-mono uppercase">Team Members</p>
              <h2 className="text-lg font-semibold text-white">
                {memberCount} / {maxMembers || "∞"}
              </h2>
            </div>
            <div
              className={`flex items-center justify-center w-8 h-8 rounded ${
                teamFull
                  ? "bg-zinc-900 border border-zinc-800 text-rose-400"
                  : "bg-zinc-900 border border-zinc-800 text-white"
              }`}
            >
              <svg
                className="w-4 h-4"
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
          </div>
        </div>

        <div className="card card-static p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-zinc-500 text-xs font-mono uppercase">Pending Requests</p>
              <h2 className="text-lg font-semibold text-white">
                {requests.length}
              </h2>
            </div>
            <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-amber-500">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.7m0 0a2.25 2.25 0 10-4.5 0m4.5 0v2.7m0 0a2.25 2.25 0 01-2.25 2.25h-1.5a2.25 2.25 0 01-2.25-2.25v-2.7m0 0a2.25 2.25 0 10-4.5 0m4.5 0v-2.7"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Team Full Warning */}
      {teamFull && (
        <div className="card card-static p-3 mb-5 border-rose-500/20 bg-rose-500/5 animate-fade-in-up stagger-2">
          <div className="flex items-center gap-2.5">
            <svg
              className="w-4 h-4 text-rose-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <p className="text-rose-400 text-xs font-medium">
              Team is full - no more members can be accepted.
            </p>
          </div>
        </div>
      )}

      {/* Requests List */}
      {requests.length === 0 ? (
        <div className="card card-static p-12 text-center animate-fade-in-up stagger-2">
          <div className="w-12 h-12 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-5 h-5 text-zinc-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20 13.28V8.8c0-1.14-.947-2.059-2.09-2.059H6.09C4.947 6.741 4 7.66 4 8.8v4.48m16 0v5.52c0 1.14-.947 2.059-2.09 2.059H6.09c-1.143 0-2.09-.92-2.09-2.059v-5.52m16 0H4"
              />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-white mb-1.5">
            No pending requests
          </h3>
          <p className="text-xs text-zinc-500">
            When builders request to join your team, they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request, i) => (
            <div
              key={request.id}
              className={`card card-static p-4 animate-fade-in-up stagger-${Math.min(i % 6, 6) + 1}`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* User Info */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-400">
                    {request.profiles?.full_name?.charAt(0)}
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm text-white">
                      {request.profiles?.full_name}
                    </h3>
                    <p className="text-xs text-zinc-500">
                      {request.profiles?.email}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {!teamFull && (
                    <button
                      onClick={() => acceptRequest(request)}
                      className="btn btn-primary btn-sm"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                      Accept
                    </button>
                  )}

                  <button
                    onClick={() => rejectRequest(request.id)}
                    className="btn btn-danger btn-sm"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    Reject
                  </button>

                  <Link
                    href={`/profile/${request.user_id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    View Profile
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
