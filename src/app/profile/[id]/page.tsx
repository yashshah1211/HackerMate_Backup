"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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
};

type ConnectionState =
  | "self"
  | "not_connected"
  | "request_sent"
  | "request_received"
  | "connected";

export default function ProfilePage() {
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

  // ── Connections state ──
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("not_connected");
  const [connectionRequestId, setConnectionRequestId] = useState<string | null>(
    null
  );
  const [connectionLoading, setConnectionLoading] = useState(false);

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
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setCurrentUserId(user.id);
        setIsOwnProfile(user.id === data.id);

        const { data: teams } = await supabase
          .from("teams")
          .select("id,name,max_members")
          .eq("owner_id", user.id);

        const teamsWithCounts = await Promise.all(
          (teams || []).map(async (team) => {
            const { count } = await supabase
              .from("team_members")
              .select("*", {
                count: "exact",
                head: true,
              })
              .eq("team_id", team.id);

            return {
              ...team,
              memberCount: count || 0,
            };
          })
        );

        setOwnedTeams(teamsWithCounts);
        if (teams && teams.length > 0) {
          const teamIds = teams.map((team) => team.id);

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
      alert(error.message);
      setConnectionLoading(false);
      return;
    }

    setConnectionRequestId(data);
    setConnectionState("request_sent");
    setConnectionLoading(false);
  }

  async function acceptConnectionRequest() {
    if (!connectionRequestId || !profile || !currentUserId) return;
    setConnectionLoading(true);

    const { error } = await supabase.rpc("accept_connection_request", {
      p_request_id: connectionRequestId,
    });

    if (error) {
      console.error(error);
      alert(error.message);
      setConnectionLoading(false);
      return;
    }

    setConnectionState("connected");
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
      alert(error.message);
      setConnectionLoading(false);
      return;
    }

    setConnectionRequestId(null);
    setConnectionState("not_connected");
    setConnectionLoading(false);
  }

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 pt-24 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading profile...</p>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="max-w-4xl mx-auto px-6 pt-24 pb-12">
        <div className="card card-static p-12 text-center animate-fade-in-up">
          <div className="w-12 h-12 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-5 h-5 text-rose-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"
              />
            </svg>
          </div>
          <h1 className="text-sm font-semibold text-white mb-1.5">
            Profile not found
          </h1>
          <p className="text-xs text-zinc-500">
            This user doesn&apos;t exist or has been removed.
          </p>
        </div>
      </main>
    );
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
        alert("This user is already a member of that team.");
        return;
      }

      const { error } = await supabase.rpc("send_team_invite", {
        p_team_id: selectedTeam,
        p_invited_user_id: profile.id,
      });

      if (error) {
        alert(error.message);
        return;
      }

      alert("Invite sent!");

      setAlreadyInvited(true);

      setShowInviteModal(false);
      setSelectedTeam("");
    } catch (err) {
      console.error(err);
      alert("Failed to send invite");
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-6 pt-24 pb-12">
      {/* Profile Card */}
      <div className="card card-static p-6 animate-fade-in-up">
        {/* Header - Avatar & Name */}
        <div className="flex flex-col md:flex-row items-start gap-6 mb-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                className="w-14 h-14 rounded object-cover border border-zinc-800"
              />
            ) : (
              <div className="w-14 h-14 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-zinc-400 text-lg">
                {profile.full_name?.charAt(0)}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h1 className="text-base font-semibold text-white mb-0.5">
                  {profile.full_name}
                </h1>
                <p className="text-zinc-500 text-xs truncate">
                  {profile.college || "Independent Builder"}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {!isOwnProfile && (
                  <>
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
                        className="btn btn-secondary btn-sm"
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
                        Message
                      </Link>
                    )}
                  </>
                )}

                {!isOwnProfile && ownedTeams.length > 0 && (
                  <button
                    onClick={() => {
                      if (!alreadyInvited) {
                        setShowInviteModal(true);
                      }
                    }}
                    disabled={alreadyInvited}
                    className={`btn btn-sm ${
                      alreadyInvited
                        ? "btn-secondary opacity-70 cursor-not-allowed"
                        : "btn-primary"
                    }`}
                  >
                    {alreadyInvited ? "Invite Sent ✓" : "Invite To Team"}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="badge badge-success text-[10px] py-0.5 px-1.5">
                Available For Teams
              </span>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid md:grid-cols-2 gap-6 pt-5 border-t border-zinc-900">
          {/* Bio */}
          <div>
            <p className="section-label mb-2">BIO</p>
            <p className="text-zinc-400 text-xs leading-relaxed">
              {profile.bio || "No bio added yet."}
            </p>
          </div>

          <div>
            <p className="section-label mb-2">SKILLS</p>

            <div className="flex flex-wrap gap-1.5">
              {profile.skills?.length ? (
                profile.skills.map((skill) => (
                  <span key={skill} className="badge text-[10px] py-0.5 px-1.5">
                    {skill}
                  </span>
                ))
              ) : (
                <span className="text-zinc-600 text-xs">No skills added yet.</span>
              )}
            </div>
          </div>

          {/* Contact & Links */}
          <div className="col-span-full border-t border-zinc-900/50 pt-5">
            <p className="section-label mb-2">CONTACT & LINKS</p>
            <div className="grid md:grid-cols-3 gap-3">
              {/* Email */}
              <div className="flex items-center gap-2.5 text-zinc-400 text-xs">
                <svg
                  className="w-4 h-4 text-zinc-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                  />
                </svg>
                <span className="truncate">{profile.email}</span>
              </div>

              {/* GitHub */}
              {profile.github_url ? (
                <a
                  href={formatUrl(profile.github_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 text-zinc-400 hover:text-white transition-colors group text-xs"
                >
                  <svg className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  <span className="truncate group-hover:underline">
                    {profile.github_url}
                  </span>
                </a>
              ) : (
                <div className="flex items-center gap-2.5 text-zinc-600 text-xs">
                  <svg className="w-4 h-4 text-zinc-700" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  <span>GitHub not added</span>
                </div>
              )}

              {/* LinkedIn */}
              {profile.linkedin_url ? (
                <a
                  href={formatUrl(profile.linkedin_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 text-zinc-400 hover:text-white transition-colors group text-xs"
                >
                  <svg className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                  <span className="truncate group-hover:underline">
                    {profile.linkedin_url}
                  </span>
                </a>
              ) : (
                <div className="flex items-center gap-2.5 text-zinc-600 text-xs">
                  <svg className="w-4 h-4 text-zinc-700" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                  <span>LinkedIn not added</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showInviteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-sm">
            <h2 className="text-sm font-semibold text-white mb-1.5">
              Invite To Team
            </h2>

            <p className="text-xs text-zinc-400 mb-4">
              Select a team to invite {profile.full_name} to.
            </p>

            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="input text-xs w-full mb-4"
            >
              <option value="">Choose a team</option>

              {ownedTeams
                .filter(
                  (team) =>
                    !team.max_members || team.memberCount < team.max_members
                )
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
            </select>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
              <button
                onClick={() => setShowInviteModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>

              <button
                onClick={sendInvite}
                disabled={!selectedTeam || inviteLoading}
                className="btn btn-primary btn-sm"
              >
                {inviteLoading ? "Sending..." : "Send Invite"}
              </button>
            </div>
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
        className="btn btn-secondary btn-sm group"
        title="Remove connection"
      >
        <svg className="w-3.5 h-3.5 text-emerald-400 group-hover:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        <span className="group-hover:hidden text-xs">Connected</span>
        <span className="hidden group-hover:inline text-xs">Remove Connection</span>
      </button>
    );
  }

  if (state === "request_sent") {
    return (
      <button
        onClick={onCancelOrRemove}
        disabled={loading}
        className="btn btn-secondary btn-sm opacity-80 text-xs"
      >
        {loading ? "..." : "Request Sent"}
      </button>
    );
  }

  if (state === "request_received") {
    return (
      <button
        onClick={onAccept}
        disabled={loading}
        className="btn btn-primary btn-sm text-xs"
      >
        {loading ? "Accepting..." : "Accept Connection"}
      </button>
    );
  }

  return (
    <button onClick={onConnect} disabled={loading} className="btn btn-primary btn-sm text-xs">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
      </svg>
      {loading ? "..." : "Connect"}
    </button>
  );
}
