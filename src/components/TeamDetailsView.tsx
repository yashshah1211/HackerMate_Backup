"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ChatThread from "@/components/chatThread";
import { useNotification } from "@/context/NotificationContext";

type Team = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  max_members: number;
  college: string | null;
  hackathon_name: string | null;
  skills: string[] | null;
  roles_needed: string[] | null;
  is_recruiting?: boolean;
};

type Member = {
  id: string;
  role: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string | null;
  };
};

type Props = {
  team: Team;
  members: Member[];
  isMember: boolean;
  isOwner: boolean;
  teamFull: boolean;
  requestLoading: boolean;
  requestSent: boolean;
  requestToJoin: () => void;
  removeMember: (memberId: string) => void;
  disbandTeam?: () => void;
  toggleRecruiting?: () => void;

  matchScore?: number;

  matchedSkills?: string[];
  missingSkills?: string[];
};

export default function TeamDetailsView({
  team,
  members,
  isMember,
  isOwner,
  teamFull,
  requestLoading,
  requestSent,
  requestToJoin,
  removeMember,
  disbandTeam,
  toggleRecruiting,
  matchScore,
  matchedSkills = [],
  missingSkills = [],
}: Props) {
  const { showToast, confirm } = useNotification();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(true);

  // Invite Builders Modal states
  const [showInviteBuilderModal, setShowInviteBuilderModal] = useState(false);
  const [inviteProfiles, setInviteProfiles] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [sessionInvitedIds, setSessionInvitedIds] = useState<Set<string>>(new Set());
  const [existingPendingInvites, setExistingPendingInvites] = useState<Set<string>>(new Set());

  const canSeeChat = isMember || isOwner;

  useEffect(() => {
    if (!showInviteBuilderModal) return;

    async function loadInviteData() {
      setLoadingProfiles(true);
      try {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, college, avatar_url, skills");
        setInviteProfiles(profilesData || []);

        const { data: pendingData } = await supabase
          .from("team_invites")
          .select("invited_user_id")
          .eq("team_id", team.id)
          .eq("status", "pending");

        const inviteIds = new Set((pendingData || []).map((i) => i.invited_user_id));
        setExistingPendingInvites(inviteIds);
      } catch (err) {
        console.error(err);
      }
      setLoadingProfiles(false);
    }

    loadInviteData();
  }, [showInviteBuilderModal, team.id]);


  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setChatLoading(false);
        return;
      }

      setCurrentUserId(user.id);

      if (canSeeChat) {
        const { data: conv } = await supabase
          .from("conversations")
          .select("id")
          .eq("team_id", team.id)
          .eq("type", "team")
          .maybeSingle();

        setConversationId(conv?.id || null);
      }

      setChatLoading(false);
    }

    init();
  }, [team.id, canSeeChat]);


  const handleLeaveTeam = (memberId: string) => {

    if (isOwner) {
      confirm({
        title: "Disband Team",
        message: "As the team leader, leaving will disband the team completely. Are you sure you want to proceed?",
        confirmText: "Leave & Disband",
        cancelText: "Cancel",
        onConfirm: () => {
          if (disbandTeam) disbandTeam();
        },
      });
    } else {
      confirm({
        title: "Leave Team",
        message: "Are you sure you want to leave this team?",
        confirmText: "Leave",
        cancelText: "Cancel",
        onConfirm: () => {
          removeMember(memberId);
        },
      });
    }
  };

  // Build known profiles map from members so ChatThread doesn't refetch

  const knownProfiles = members.reduce((acc, m) => {
    acc[m.profiles.id] = {
      id: m.profiles.id,
      full_name: m.profiles.full_name,
      avatar_url: m.profiles.avatar_url || null,
    };
    return acc;
  }, {} as Record<string, { id: string; full_name: string; avatar_url: string | null }>);

  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
      {/* Header */}
      <div className="mb-6 animate-fade-in-up">
        <Link
          href="/teams"
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
          Back to teams
        </Link>
      </div>

      {/* Main Grid */}
      <section className="grid lg:grid-cols-[2fr_1fr] gap-6 mb-10">
        {/* Left - Team Info */}
        <div className="card card-static p-6 animate-fade-in-up">
          <p className="section-label mb-3">TEAM PROFILE</p>

          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white mb-3">
            {team.name}
          </h1>

          <p className="text-sm text-zinc-400 leading-relaxed mb-8">
            {team.description || "No description provided."}
          </p>

          {/* Match score */}
          {typeof matchScore === "number" && team.skills && team.skills.length > 0 && (
            <div className="mb-8 p-4 rounded-lg bg-zinc-900/40 border border-zinc-800">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-semibold text-zinc-300">
                  Your Skill Match
                </h3>
                <span
                  className={`text-lg font-bold ${
                    matchScore >= 70
                      ? "text-emerald-400"
                      : matchScore >= 40
                      ? "text-amber-400"
                      : "text-zinc-500"
                  }`}
                >
                  {matchScore}%
                </span>
              </div>

              {matchedSkills.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] text-zinc-500 mb-1">You have</p>
                  <div className="flex flex-wrap gap-1">
                    {matchedSkills.map((s) => (
                      <span key={s} className="badge badge-success text-[10px] py-0.5 px-1.5">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {missingSkills.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-500 mb-1">Still needed</p>
                  <div className="flex flex-wrap gap-1">
                    {missingSkills.map((s) => (
                      <span key={s} className="badge text-[10px] text-zinc-500 py-0.5 px-1.5">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Skills */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-zinc-300 mb-2">
              Skills Needed
            </h3>

            <div className="flex flex-wrap gap-1.5">
              {team.skills?.length ? (
                team.skills.map((skill) => (
                  <span key={skill} className="badge badge-primary text-[10px] py-0.5 px-1.5">
                    {skill}
                  </span>
                ))
              ) : (
                <span className="badge text-[10px] text-zinc-600">No skills listed</span>
              )}
            </div>
          </div>

          {/* Roles */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-300 mb-2">
              Roles Needed
            </h3>

            <div className="flex flex-wrap gap-1.5">
              {team.roles_needed?.length ? (
                team.roles_needed.map((role) => (
                  <span key={role} className="badge text-[10px] py-0.5 px-1.5">
                    {role}
                  </span>
                ))
              ) : (
                <span className="badge text-[10px] text-zinc-600">No roles listed</span>
              )}
            </div>
          </div>
        </div>

        {/* Right - Stats & Actions */}
        <div className="card card-static p-6 animate-fade-in-up stagger-1 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              <span className={`badge text-[10px] ${
                teamFull 
                  ? "badge-error" 
                  : (team.is_recruiting === false) 
                    ? "bg-zinc-800 text-zinc-400 border border-zinc-700" 
                    : "badge-success"
              }`}>
                {teamFull ? "FULL" : (team.is_recruiting === false) ? "CLOSED" : "RECRUITING"}
              </span>


              <div className="text-right">
                <div className="text-xl font-bold text-white">
                  {members.length}/{team.max_members}
                </div>
                <div className="text-zinc-500 text-xs font-mono uppercase">Members</div>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-4 mb-6 border-t border-zinc-900 pt-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.485a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">College</p>
                  <p className="text-xs font-medium text-white truncate">
                    {team.college || "N/A"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.5 18h1.5m4.5-13.764c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.5 18h-1.5" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Hackathon</p>
                  <p className="text-xs font-medium text-white truncate">
                    {team.hackathon_name || "N/A"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Open Spots</p>
                  <p className="text-xs font-medium text-white">
                    {Math.max(team.max_members - members.length, 0)}
                  </p>
                </div>
              </div>
            </div>

            {!isMember && !isOwner && !teamFull && (
              team.is_recruiting === false ? (
                <button
                  disabled
                  className="btn bg-zinc-800 text-zinc-500 border border-zinc-800/80 w-full cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <span>Recruitment Closed</span>
                </button>
              ) : (
                <button
                  onClick={requestToJoin}
                  disabled={requestLoading || requestSent}
                  className="btn btn-primary w-full"
                >
                  {requestSent ? (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <span>Request Sent</span>
                    </>
                  ) : requestLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Sending...</span>
                    </div>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      <span>Request To Join</span>
                    </>
                  )}
                </button>
              )
            )}


            {isOwner && (
              <>
                <Link
                  href={`/teams/${team.id}/requests`}
                  className="btn btn-secondary w-full mb-2"
                >
                  <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.7m0 0a2.25 2.25 0 10-4.5 0m4.5 0v2.7m0 0a2.25 2.25 0 01-2.25 2.25h-1.5a2.25 2.25 0 01-2.25-2.25v-2.7m0 0a2.25 2.25 0 10-4.5 0m4.5 0v2.7m0 0a2.25 2.25 0 01-2.25 2.25H5.25a2.25 2.25 0 01-2.25-2.25v-2.7m0 0a2.25 2.25 0 10-4.5 0m4.5 0v-2.7" />
                  </svg>
                  Manage Requests
                </Link>

                <button
                  type="button"
                  onClick={() => setShowInviteBuilderModal(true)}
                  className="btn btn-secondary w-full mb-2 flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235A10.18 10.18 0 0112.5 15c2.2 0 4.254.688 5.94 1.855" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={toggleRecruiting}
                  className="btn btn-secondary w-full mb-2 flex items-center justify-center gap-1.5"
                >
                  {team.is_recruiting === false ? (
                    <>
                      <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Open Recruitment</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      <span>Close Recruitment</span>
                    </>
                  )}
                </button>

                <button

                  type="button"
                  onClick={() => {
                    const link = `${window.location.origin}/teams/${team.id}`;
                    navigator.clipboard.writeText(link);
                    showToast("Team link copied. Builders can view it and request to join.", "success");
                  }}
                  className="btn btn-secondary w-full flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l.097-.03A1.875 1.875 0 0111 6v1.5H9.75v-1.5a.375.375 0 00-.375-.375H7.5A.375.375 0 007.125 6v12a.375.375 0 00.375.375h1.875a.375.375 0 00.375-.375V16.5H11V18a1.875 1.875 0 01-2.653 1.71l-.097-.03A1.875 1.875 0 016 18V6a1.875 1.875 0 012.25-1.5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 10.5h-8.25m8.25 0l-3.375-3.375m3.375 3.375l-3.375 3.375" />
                  </svg>
                  <span>Share Team Link</span>
                </button>

              </>
            )}
          </div>
        </div>
      </section>

      {/* Team Members Section */}
      <section className="mb-10 animate-fade-in-up stagger-2">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="section-label mb-1">TEAM</p>
            <h2 className="text-lg font-semibold text-white">Team Members</h2>
          </div>

          <span className="text-zinc-500 text-xs font-mono">{members.length} builders</span>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {members.map((member, i) => (
            <div
              key={member.id}
              className={`card card-static p-4 animate-fade-in-up stagger-${
                Math.min(i % 6, 6) + 1
              } flex flex-col justify-between`}
            >
              <div className="flex items-center gap-3">
                {member.profiles?.avatar_url ? (
                  <img
                    src={member.profiles.avatar_url}
                    alt={member.profiles.full_name}
                    className="w-10 h-10 rounded object-cover border border-zinc-800"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-zinc-400 text-xs">
                    {member.profiles?.full_name?.charAt(0)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link
                      href={`/profile/${member.profiles.id}`}
                      className="font-semibold text-sm text-white hover:text-zinc-300 transition-colors truncate"
                    >
                      {member.profiles?.full_name}
                    </Link>

                    <span
                      className={`badge text-[10px] py-0.5 px-1.5 ${
                        member.role === "owner"
                          ? "badge-primary"
                          : "badge-success"
                      }`}
                    >
                      {member.role}
                    </span>
                  </div>

                  <p className="text-zinc-500 text-xs truncate">
                    {member.profiles?.email}
                  </p>
                </div>
              </div>

              {member.profiles.id === currentUserId ? (
                <button
                  onClick={() => handleLeaveTeam(member.id)}
                  className="btn btn-danger btn-sm w-full mt-3"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  {isOwner ? "Leave & Disband Team" : "Leave Team"}
                </button>
              ) : (
                isOwner && member.profiles.id !== team.owner_id && (
                  <button
                    onClick={() => removeMember(member.id)}
                    className="btn btn-danger btn-sm w-full mt-3"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Remove Member
                  </button>
                )
              )}

            </div>
          ))}
        </div>

        {members.length === 0 && (
          <div className="card card-static p-8 text-center">
            <p className="text-zinc-500 text-xs">No team members yet.</p>
          </div>
        )}
      </section>

      {/* Team Chat Section — members & owner only */}
      {canSeeChat && (
        <section className="animate-fade-in-up stagger-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="section-label mb-1">COLLABORATE</p>
              <h2 className="text-lg font-semibold text-white">Team Chat</h2>
            </div>
            <span className="badge badge-success text-[10px] py-0.5 px-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
              Live
            </span>
          </div>

          {chatLoading ? (
            <div className="card card-static p-8 text-center">
              <p className="text-zinc-500 text-xs">Loading chat...</p>
            </div>
          ) : conversationId && currentUserId ? (
            <ChatThread
              conversationId={conversationId}
              currentUserId={currentUserId}
              knownProfiles={knownProfiles}
              height="400px"
            />
          ) : (
            <div className="card card-static p-8 text-center">
              <p className="text-zinc-500 text-xs">
                Chat isn&apos;t available for this team yet.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Invite Builder Modal */}
      {showInviteBuilderModal && (

        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white mb-0.5">Invite Builder</h2>
                <p className="text-[10px] text-zinc-500">Send team invitations to other builders on HackerMate.</p>
              </div>
              <button 
                onClick={() => setShowInviteBuilderModal(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, college, or skills..."
                className="input text-xs w-full"
              />
            </div>

            <div className="flex-1 overflow-y-auto min-h-[250px] pr-1 space-y-2">
              {loadingProfiles ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-2" />
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Loading builders...</p>
                </div>
              ) : (() => {
                const memberUserIds = new Set(members.map((m) => m.profiles.id));
                const filtered = inviteProfiles.filter((p) => {
                  if (p.id === currentUserId || memberUserIds.has(p.id)) return false;
                  
                  if (!searchQuery) return true;
                  const query = searchQuery.toLowerCase();
                  const nameMatch = p.full_name?.toLowerCase().includes(query);
                  const collegeMatch = p.college?.toLowerCase().includes(query);
                  const skillsMatch = p.skills?.some((s: string) => s.toLowerCase().includes(query));
                  return nameMatch || collegeMatch || skillsMatch;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-zinc-500 text-xs">
                      No builders found matching your search.
                    </div>
                  );
                }

                return filtered.map((profile) => {
                  const isAlreadyInvited = existingPendingInvites.has(profile.id) || sessionInvitedIds.has(profile.id);
                  return (
                    <div key={profile.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/30 border border-zinc-900/80 hover:border-zinc-800 transition-colors">
                      <div className="min-w-0 flex-1 mr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-white truncate">{profile.full_name}</span>
                          {profile.college && (
                            <span className="text-[9px] text-zinc-500 truncate">({profile.college})</span>
                          )}
                        </div>
                        {profile.skills && profile.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {profile.skills.slice(0, 3).map((s: string) => (
                              <span key={s} className="text-[8px] px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">{s}</span>
                            ))}
                            {profile.skills.length > 3 && (
                              <span className="text-[8px] text-zinc-600">+{profile.skills.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={async () => {
                          try {
                            const { error } = await supabase.rpc("send_team_invite", {
                              p_team_id: team.id,
                              p_invited_user_id: profile.id
                            });

                            if (error) {
                              showToast(error.message, "error");
                            } else {
                              showToast(`Invite sent to ${profile.full_name}!`, "success");
                              setSessionInvitedIds(prev => {
                                const next = new Set(prev);
                                next.add(profile.id);
                                return next;
                              });
                            }
                          } catch (err) {
                            console.error(err);
                            showToast("Failed to send invite", "error");
                          }
                        }}
                        disabled={isAlreadyInvited}
                        className={`btn btn-sm text-[10px] py-1 px-3 ${
                          isAlreadyInvited 
                            ? "bg-zinc-800 text-zinc-600 cursor-not-allowed border-transparent" 
                            : "btn-primary"
                        }`}
                      >
                        {isAlreadyInvited ? "Invited" : "Invite"}
                      </button>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="flex justify-end pt-4 border-t border-zinc-900 mt-4">
              <button
                onClick={() => setShowInviteBuilderModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

