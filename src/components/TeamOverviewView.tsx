"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ShareModal from "@/components/ShareModal";
import { useNotification } from "@/context/NotificationContext";
import { COLLEGES } from "@/lib/colleges";
import SIHExportModal from "@/components/SIHExportModal";
import { SIHTeamExport, SIHTeamMemberExport } from "@/lib/sihExport";
import { SIH_HACKATHON_ID } from "@/lib/constants";

const SKILLS = [
  "React", "Next.js", "TypeScript", "JavaScript", "Node.js", "Express",
  "Python", "Java", "C++", "Flutter", "React Native", "AI/ML",
  "TensorFlow", "PyTorch", "Docker", "Kubernetes", "AWS", "Terraform",
  "Supabase", "PostgreSQL", "MongoDB", "UI/UX", "Figma", "DevOps",
  "Public Speaking", "Presenting", "Pitching", "Technical Writing",
  "Graphic Design", "Video Editing",
];

const ROLES = [
  "Frontend Developer", "Backend Developer", "Full Stack Developer",
  "UI/UX Designer", "AI/ML Engineer", "Data Scientist", "Mobile Developer",
  "DevOps Engineer", "Cloud Engineer", "Product Manager", "Blockchain Developer",
];

type Team = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  max_members: number;
  college: string | null;
  hackathon_id?: string | null;
  hackathon_name: string | null;
  skills: string[] | null;
  roles_needed: string[] | null;
  is_recruiting?: boolean;
  github_repo_url?: string | null;
};

type Member = {
  id: string;
  role: string;
  project_role?: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string | null;
    skills?: string[] | null;
    gender?: string | null;
  };
};

type InviteProfile = {
  id: string;
  full_name: string | null;
  college: string | null;
  avatar_url?: string | null;
  skills: string[] | null;
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
  leaveTeam?: (memberId: string) => void;
  toggleRecruiting?: () => void;
  isPublicVisitor?: boolean;
  matchScore?: number;
  matchedSkills?: string[];
  missingSkills?: string[];
  refreshTeam?: () => void;
  pendingInvite?: { id: string; status: string } | null;
  listedHackathons?: { id: string; name: string; description?: string | null; start_date?: string; end_date?: string }[];
  unlinkHackathon?: (hackathonId: string) => void;
};

export default function TeamOverviewView({
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
  leaveTeam,
  toggleRecruiting,
  matchScore,
  matchedSkills = [],
  missingSkills = [],
  refreshTeam,
  pendingInvite,
  listedHackathons = [],
  unlinkHackathon,
  isPublicVisitor = false,
}: Props) {
  const { showToast, confirm } = useNotification();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSIHExportModal, setShowSIHExportModal] = useState(false);

  const isSIHTeam = Boolean(
    team.hackathon_id === SIH_HACKATHON_ID ||
    team.hackathon_name?.toLowerCase().includes("sih") ||
    team.hackathon_name?.toLowerCase().includes("smart india hackathon") ||
    listedHackathons?.some(
      (h) =>
        h.id === SIH_HACKATHON_ID ||
        h.name.toLowerCase().includes("sih") ||
        h.name.toLowerCase().includes("smart india hackathon")
    )
  );

  const redirectToSignIn = () => {
    const next = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : `/teams/${team.id}`;
    window.location.href = `/?next=${encodeURIComponent(next)}`;
  };

  // Invitation banner states
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteActionLoading, setInviteActionLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  useEffect(() => {
    if (pendingInvite) {
      setInviteStatus(pendingInvite.status);
    } else {
      setInviteStatus(null);
    }
  }, [pendingInvite]);

  const handleAcceptInvite = async () => {
    if (!pendingInvite) return;
    setInviteActionLoading(true);
    const { error } = await supabase.rpc("accept_team_invite", {
      p_invite_id: pendingInvite.id,
    });
    if (error) {
      showToast(error.message, "error");
    } else {
      showToast("You have successfully joined the team!", "success");
      setInviteStatus("accepted");
      if (refreshTeam) refreshTeam();
    }
    setInviteActionLoading(false);
  };

  const handleRejectInvite = async () => {
    if (!pendingInvite) return;
    setInviteActionLoading(true);
    const { error } = await supabase.rpc("reject_team_invite", {
      p_invite_id: pendingInvite.id,
    });
    if (error) {
      showToast(error.message, "error");
    } else {
      showToast("Invitation declined.", "info");
      setInviteStatus("rejected");
      if (refreshTeam) refreshTeam();
    }
    setInviteActionLoading(false);
  };

  // Project Role editing states
  const [isEditingProjectRoleForMemberId, setIsEditingProjectRoleForMemberId] = useState<string | null>(null);
  const [projectRoleInput, setProjectRoleInput] = useState("");
  const [isCustomProjectRole, setIsCustomProjectRole] = useState(false);

  // Edit Team Details states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(team.name);
  const [editDesc, setEditDesc] = useState(team.description || "");
  const [editCollege, setEditCollege] = useState("");
  const [editCustomCollege, setEditCustomCollege] = useState("");
  const [editCollegeSearch, setEditCollegeSearch] = useState("");
  const [showEditCollegeDropdown, setShowEditCollegeDropdown] = useState(false);
  const [editMaxMembers, setEditMaxMembers] = useState(team.max_members || 4);
  const [editSkills, setEditSkills] = useState<string[]>(team.skills || []);
  const [editRoles, setEditRoles] = useState<string[]>(team.roles_needed || []);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      setEditName(team.name);
      setEditDesc(team.description || "");
      const isCustom = team.college && !COLLEGES.includes(team.college);
      setEditCollege(isCustom ? "Other" : (team.college || ""));
      setEditCustomCollege(isCustom ? team.college! : "");
      setEditMaxMembers(team.max_members || 4);
      setEditSkills(team.skills || []);
      setEditRoles(team.roles_needed || []);
    });
  }, [team]);

  const handleSaveProjectRole = async (memberId: string) => {
    const roleToSave = projectRoleInput.trim() || "Developer";
    try {
      const { error } = await supabase
        .from("team_members")
        .update({ project_role: roleToSave })
        .eq("id", memberId);

      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Project role updated successfully", "success");
        setIsEditingProjectRoleForMemberId(null);
        if (refreshTeam) refreshTeam();
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to update project role", "error");
    }
  };

  const toggleEditSkill = (skill: string) => {
    setEditSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const toggleEditRole = (role: string) => {
    setEditRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSaveTeamDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) { showToast("Team name is required", "warning"); return; }
    if (!editDesc.trim()) { showToast("Team description is required", "warning"); return; }
    if (editCollege === "Other" && !editCustomCollege.trim()) { showToast("Please enter your college name", "warning"); return; }
    if (editSkills.length === 0) { showToast("Please select at least one skill", "warning"); return; }
    if (editRoles.length === 0) { showToast("Please select at least one role", "warning"); return; }

    setSavingEdit(true);
    const finalCollege = editCollege === "Other" ? editCustomCollege.trim() : editCollege || null;

    const { error } = await supabase
      .from("teams")
      .update({
        name: editName.trim(),
        description: editDesc.trim(),
        college: finalCollege,
        max_members: editMaxMembers,
        skills: editSkills,
        roles_needed: editRoles,
      })
      .eq("id", team.id);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      setSavingEdit(false);
      return;
    }

    showToast("Team details updated successfully!", "success");
    setSavingEdit(false);
    setShowEditModal(false);
    if (refreshTeam) refreshTeam();
  };

  // Invite Builders Modal states
  const [showInviteBuilderModal, setShowInviteBuilderModal] = useState(false);
  const [inviteProfiles, setInviteProfiles] = useState<InviteProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [sessionInvitedIds, setSessionInvitedIds] = useState<Set<string>>(new Set());
  const [existingPendingInvites, setExistingPendingInvites] = useState<Set<string>>(new Set());

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
          if (leaveTeam) {
            leaveTeam(memberId);
          } else {
            removeMember(memberId);
          }
        },
      });
    }
  };

  const canAccessWorkspace = isMember || isOwner;

  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
      {pendingInvite && inviteStatus === "pending" && (
        <div className="card p-4 mb-6 animate-fade-in-up border-amber-500/30 dark:border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/[0.03] rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">✉</span>
            <div className="text-left">
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">You have a pending invite to join this team</p>
              <p className="text-[10px] text-zinc-600 dark:text-zinc-400">Review the team details below and make your decision.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleAcceptInvite}
              disabled={inviteActionLoading}
              className="btn btn-lime flex-1 sm:flex-initial px-4 py-2 text-xs font-bold bg-[#B4F461] hover:bg-[#a3e64f] text-[#09090b] dark:text-[#09090b] rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {inviteActionLoading ? "Joining..." : "Accept"}
            </button>
            <button
              onClick={handleRejectInvite}
              disabled={inviteActionLoading}
              className="btn btn-secondary flex-1 sm:flex-initial px-4 py-2 text-xs font-bold text-rose-500 border border-rose-500/30 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {inviteActionLoading ? "Declining..." : "Decline"}
            </button>
          </div>
        </div>
      )}

      {/* Public Visitor Banner */}
      {isPublicVisitor && (
        <div className="card p-4 mb-6 animate-fade-in-up border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300 shrink-0">
              <svg className="w-4 h-4 text-[#B4F461]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">Viewing team profile for &quot;{team.name}&quot;</p>
              <p className="text-[10px] text-zinc-600 dark:text-zinc-400">Sign in to apply to join this team or chat with teammates.</p>
            </div>
          </div>
          <button
            onClick={redirectToSignIn}
            className="btn btn-lime w-full sm:w-auto px-4 py-2 text-xs font-bold bg-[#B4F461] hover:bg-[#a3e64f] text-[#09090b] dark:text-[#09090b] rounded-lg transition-all shadow-md shadow-[#B4F461]/20 cursor-pointer shrink-0"
          >
            <span>Sign In to Join</span>
          </button>
        </div>
      )}

      {/* Back to teams link */}
      {!isPublicVisitor && (
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
      )}

      {/* Prominent Workspace CTA Banner for Members / Owner */}
      {canAccessWorkspace && (
        <div className="card p-5 mb-6 border-[#B4F461]/40 dark:border-[#B4F461]/25 bg-[#B4F461]/10 dark:bg-[#B4F461]/[0.04] rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in-up">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-[#B4F461]/20 border border-[#B4F461]/40 flex items-center justify-center text-zinc-900 dark:text-white shrink-0">
              <svg className="w-5 h-5 text-[#B4F461]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25a2.25 2.25 0 002.25-2.25v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25v2.25A2.25 2.25 0 006 20.25zM15 6.75h2.25a2.25 2.25 0 002.25-2.25V3.75a2.25 2.25 0 00-2.25-2.25H15a2.25 2.25 0 00-2.25 2.25v.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight">Active Member Access Authorized</h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Access live chat, Kanban task board, document pad, resources, and deployments cockpit.</p>
            </div>
          </div>

          <Link
            href={`/teams/${team.id}/workspace${team.hackathon_id ? `?hackathon_id=${team.hackathon_id}` : ""}`}
            className="btn btn-lime w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#B4F461] hover:bg-[#a3e64f] text-[#09090b] dark:text-[#09090b] font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-[#B4F461]/20 border border-[#B4F461]/40 shrink-0 cursor-pointer"
          >

            <span>Open Workspace</span>
          </Link>
        </div>
      )}

      {/* Main Grid */}
      <section className="grid lg:grid-cols-[2fr_1fr] gap-6 mb-10">
        {/* Left - Team Info */}
        <div className="card card-static p-6 animate-fade-in-up">
          <p className="section-label mb-3">TEAM PROFILE</p>

          <div className="flex items-start justify-between gap-4 mb-3">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">
              {team.name}
            </h1>
            {(isMember || isOwner) && (
              <div className="flex items-center gap-2">
                {isSIHTeam && (
                  <button
                    onClick={() => setShowSIHExportModal(true)}
                    className="btn px-3.5 py-1.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-700 dark:text-orange-400 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-orange-500/30 shrink-0"
                    title="Export official SPOC PDF for Smart India Hackathon internal nomination round"
                  >
                    <span>🇮🇳 SIH SPOC Export</span>
                  </button>
                )}
                <button
                  onClick={() => setShowShareModal(true)}
                  className="btn btn-lime px-3.5 py-1.5 rounded-xl bg-[#B4F461] hover:bg-[#a3e64f] text-black dark:text-black font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-[#B4F461]/20 border border-[#B4F461]/40 shrink-0"
                >
                  <span className="text-black dark:text-black">🔗 Share Team</span>
                </button>
              </div>
            )}
          </div>

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
                  className={`text-lg font-bold ${matchScore >= 70
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
        <div className="space-y-6">
          <div className="card card-static p-6 animate-fade-in-up stagger-1 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6">
                <span className={`badge text-[10px] ${teamFull
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
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Hackathon</p>
                    <p className="text-xs font-medium text-white truncate">
                      {listedHackathons.length > 0
                        ? (listedHackathons.length === 1 ? listedHackathons[0].name : `${listedHackathons.length} Hackathons`)
                        : (team.hackathon_name || "N/A")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12zM3 20.25v-1.5a6 6 0 016-6h1.5" />
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
            </div>

            {!isMember && !isOwner && !teamFull && (
              inviteStatus === "pending" ? (
                <div className="flex flex-col gap-2 w-full">
                  <button
                    onClick={handleAcceptInvite}
                    disabled={inviteActionLoading}
                    className="btn btn-primary w-full flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {inviteActionLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        <span>Joining...</span>
                      </div>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span>Accept Invite</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleRejectInvite}
                    disabled={inviteActionLoading}
                    className="btn btn-secondary w-full text-rose-400 border border-zinc-800 cursor-pointer"
                  >
                    {inviteActionLoading ? "Declining..." : "Decline Invite"}
                  </button>
                </div>
              ) : team.is_recruiting === false ? (
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
                  onClick={isPublicVisitor ? redirectToSignIn : requestToJoin}
                  disabled={requestLoading || requestSent}
                  className="btn btn-primary w-full cursor-pointer"
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

            {canAccessWorkspace && (
              <Link
                href={`/teams/${team.id}/workspace${team.hackathon_id ? `?hackathon_id=${team.hackathon_id}` : ""}`}
                className="btn btn-lime w-full mb-2.5 flex items-center justify-center gap-2 font-bold bg-[#B4F461] hover:bg-[#a3e64f] text-[#09090b] dark:text-[#09090b] border border-[#B4F461]/40 cursor-pointer py-2 text-xs rounded-xl shadow-md shadow-[#B4F461]/15"
              >

                <span>Open Workspace</span>
              </Link>
            )}

            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="btn btn-secondary w-full mb-2 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4.5 h-4.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                  <span>Edit Team Details</span>
                </button>

                <Link
                  href={`/teams/${team.id}/requests`}
                  className="btn btn-secondary w-full mb-2"
                >
                  <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Manage Requests
                </Link>

                <button
                  type="button"
                  onClick={() => setShowInviteBuilderModal(true)}
                  className="btn btn-secondary w-full mb-2 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235A10.18 10.18 0 0112.5 15c2.2 0 4.254.688 5.94 1.855" />
                  </svg>
                  <span>Invite builders to team</span>
                </button>

                <button
                  type="button"
                  onClick={toggleRecruiting}
                  className="btn btn-secondary w-full mb-2 flex items-center justify-center gap-1.5 cursor-pointer"
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
              </>
            )}
          </div>

          {/* Hackathons Section */}
          <div className="card card-static p-6 animate-fade-in-up stagger-2">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-zinc-900">
              <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-violet-400">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-zinc-500 font-mono uppercase">Hackathon Listings</p>
                <p className="text-xs font-semibold text-white">
                  Listed in {listedHackathons.length} hackathon{listedHackathons.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {listedHackathons.length > 0 ? (
              <div className="space-y-3">
                {listedHackathons.map((hackathon) => (
                  <div key={hackathon.id} className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/60 hover:border-zinc-700/80 transition-all flex flex-col gap-2">
                    <Link
                      href={`/hackathons/${hackathon.id}`}
                      className="text-xs font-medium text-white hover:text-violet-400 transition-colors line-clamp-2"
                    >
                      {hackathon.name}
                    </Link>
                    {isOwner && unlinkHackathon && (
                      <button
                        onClick={() => unlinkHackathon(hackathon.id)}
                        className="btn btn-danger btn-sm py-1 px-2 text-[10px] w-full flex items-center justify-center gap-1 mt-1 cursor-pointer"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                        </svg>
                        Remove Listing
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 text-center py-2">
                This team is not currently listed in any hackathons.
              </p>
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
              className={`card card-static p-4 animate-fade-in-up stagger-${Math.min(i % 6, 6) + 1
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
                      className={`badge text-[10px] py-0.5 px-1.5 ${member.role === "owner"
                          ? "badge-primary"
                          : "badge-success"
                        }`}
                    >
                      {member.role}
                    </span>
                  </div>

                  <p className="text-zinc-500 text-xs truncate font-mono">
                    {member.profiles?.email}
                  </p>

                  {/* Project Role Badge */}
                  <div className="mt-2 flex items-center gap-1.5 min-h-[24px]">
                    {isEditingProjectRoleForMemberId === member.id ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <select
                          value={isCustomProjectRole ? "Custom..." : projectRoleInput}
                          onChange={(e) => {
                            if (e.target.value === "Custom...") {
                              setIsCustomProjectRole(true);
                              setProjectRoleInput("");
                            } else {
                              setIsCustomProjectRole(false);
                              setProjectRoleInput(e.target.value);
                            }
                          }}
                          className="bg-zinc-950 border border-zinc-800 text-[10px] text-white rounded px-1.5 py-0.5 focus:outline-none focus:border-zinc-700"
                        >
                          <option value="Developer">Developer</option>
                          <option value="Frontend Developer">Frontend Developer</option>
                          <option value="Backend Developer">Backend Developer</option>
                          <option value="Full Stack Developer">Full Stack Developer</option>
                          <option value="UI/UX Designer">UI/UX Designer</option>
                          <option value="AI/ML Engineer">AI/ML Engineer</option>
                          <option value="AI Lead">AI Lead</option>
                          <option value="Project Manager">Project Manager</option>
                          <option value="Custom...">Custom...</option>
                        </select>

                        {isCustomProjectRole && (
                          <input
                            type="text"
                            placeholder="Role..."
                            value={projectRoleInput}
                            onChange={(e) => setProjectRoleInput(e.target.value)}
                            className="bg-zinc-950 border border-zinc-800 text-[10px] text-white rounded px-1.5 py-0.5 w-20 focus:outline-none focus:border-zinc-700"
                          />
                        )}

                        <button
                          onClick={() => handleSaveProjectRole(member.id)}
                          className="text-[9px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded px-1.5 py-0.5 font-semibold cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setIsEditingProjectRoleForMemberId(null)}
                          className="text-[9px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 rounded px-1.5 py-0.5 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group/role">
                        <span className="text-[10px] font-semibold font-mono uppercase bg-zinc-900 border border-zinc-800/80 text-zinc-400 rounded px-2 py-0.5">
                          {member.project_role || "Developer"}
                        </span>

                        {isOwner && (
                          <button
                            onClick={() => {
                              setIsEditingProjectRoleForMemberId(member.id);
                              setProjectRoleInput(member.project_role || "Developer");
                              setIsCustomProjectRole(
                                !["Developer", "Frontend Developer", "Backend Developer", "Full Stack Developer", "UI/UX Designer", "AI/ML Engineer", "AI Lead", "Project Manager"].includes(member.project_role || "Developer")
                              );
                            }}
                            className="p-1 text-zinc-600 hover:text-white transition-colors opacity-0 group-hover/role:opacity-100 focus:opacity-100 cursor-pointer"
                            title="Edit project role"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {member.profiles.id === currentUserId ? (
                <button
                  onClick={() => handleLeaveTeam(member.id)}
                  className="btn btn-danger btn-sm w-full mt-3 cursor-pointer"
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
                    className="btn btn-danger btn-sm w-full mt-3 cursor-pointer"
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
                className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
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
                        className={`btn btn-sm text-[10px] py-1 px-3 cursor-pointer ${isAlreadyInvited
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
                className="btn btn-secondary btn-sm cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Team Details Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-lg flex flex-col max-h-[85vh] bg-[var(--surface-1)] border border-[var(--card-border)] animate-scale-in">
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-white/[0.06]">
              <div>
                <h2 className="text-sm font-semibold text-white mb-0.5">Edit Team Details</h2>
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Update name, mission, context, target skills, needed roles, and capacity.</p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveTeamDetails} className="flex-1 overflow-y-auto pr-1 space-y-5">
              {/* Basics */}
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-300">Team name <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="input text-xs"
                    placeholder="e.g. Hack Warriors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-300">Description <span className="text-rose-400">*</span></label>
                  <textarea
                    required
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={3}
                    className="input text-xs"
                    placeholder="What's your team's mission?"
                  />
                </div>
              </div>

              <div className="border-t border-white/[0.06]" />

              {/* Context */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-300">College (Optional)</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search or select your college..."
                      value={showEditCollegeDropdown ? editCollegeSearch : (editCollege || "")}
                      onFocus={() => {
                        setEditCollegeSearch("");
                        setShowEditCollegeDropdown(true);
                      }}
                      onChange={(e) => {
                        setEditCollegeSearch(e.target.value);
                        setShowEditCollegeDropdown(true);
                      }}
                      className="input text-xs px-4 w-full"
                    />

                    {showEditCollegeDropdown && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowEditCollegeDropdown(false)}
                        />
                        <div className="absolute left-0 right-0 top-full mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-1.5 shadow-xl z-20 text-left">
                          {COLLEGES.filter((col) =>
                            col.toLowerCase().includes(editCollegeSearch.toLowerCase())
                          ).map((collegeName) => (
                            <button
                              type="button"
                              key={collegeName}
                              onClick={() => {
                                setEditCollege(collegeName);
                                setEditCollegeSearch("");
                                setShowEditCollegeDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 rounded-md text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors cursor-pointer"
                            >
                              {collegeName}
                            </button>
                          ))}
                          {COLLEGES.filter((col) =>
                            col.toLowerCase().includes(editCollegeSearch.toLowerCase())
                          ).length === 0 && (
                              <div className="text-center py-4 text-xs text-zinc-600">
                                No colleges match your search.
                              </div>
                            )}
                        </div>
                      </>
                    )}
                  </div>
                  {editCollege === "Other" && (
                    <input
                      type="text"
                      placeholder="Enter your college name"
                      value={editCustomCollege}
                      onChange={(e) => setEditCustomCollege(e.target.value)}
                      className="input text-xs mt-2"
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-300">Team size (Max Members)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="2"
                      max="10"
                      value={editMaxMembers}
                      onChange={(e) => setEditMaxMembers(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-primary-500"
                    />
                    <div className="flex items-center justify-center w-9 h-9 rounded bg-white/[0.04] border border-white/[0.06] text-xs font-medium text-white shrink-0">
                      {editMaxMembers}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.06]" />

              {/* Skills */}
              <div>
                <span className="text-[10px] uppercase tracking-widest font-medium text-zinc-500 block mb-2">Skills needed <span className="text-rose-400">*</span></span>
                <div className="flex flex-wrap gap-1.5">
                  {SKILLS.map((skill) => {
                    const active = editSkills.includes(skill);
                    return (
                      <button
                        type="button"
                        key={skill}
                        onClick={() => toggleEditSkill(skill)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all border cursor-pointer ${active
                            ? "bg-[var(--primary-500)] text-white border-[var(--primary-500)]"
                            : "bg-white/[0.03] text-zinc-400 border-white/[0.06] hover:border-white/[0.15] hover:text-zinc-300"
                          }`}
                      >
                        {skill}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-white/[0.06]" />

              {/* Roles */}
              <div>
                <span className="text-[10px] uppercase tracking-widest font-medium text-zinc-500 block mb-2">Roles needed <span className="text-rose-400">*</span></span>
                <div className="flex flex-wrap gap-1.5">
                  {ROLES.map((role) => {
                    const active = editRoles.includes(role);
                    return (
                      <button
                        type="button"
                        key={role}
                        onClick={() => toggleEditRole(role)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all border cursor-pointer ${active
                            ? "bg-[var(--primary-500)] text-white border-[var(--primary-500)]"
                            : "bg-white/[0.03] text-zinc-400 border-white/[0.06] hover:border-white/[0.15] hover:text-zinc-300"
                          }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-900 mt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-secondary btn-sm cursor-pointer"
                  disabled={savingEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm flex items-center gap-1.5 cursor-pointer"
                  disabled={savingEdit}
                >
                  {savingEdit ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1-Tap Share Team Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title={`Share Team — ${team.name}`}
        subtitle="Recruit teammates via WhatsApp, LinkedIn, X, or Telegram"
        shareUrl={typeof window !== "undefined" ? window.location.href : `https://hackermate.in/teams/${team.id}`}
        shareText={`🚀 We're recruiting developers for team '${team.name}' ${team.hackathon_name ? `building for ${team.hackathon_name}` : ""} on HackerMate! Check our team profile & apply here:`}
        type="team"
        metadata={{
          teamName: team.name,
          hackathonName: team.hackathon_name || undefined,
        }}
      />

      {/* Official SIH SPOC Export Modal */}
      <SIHExportModal
        isOpen={showSIHExportModal}
        onClose={() => setShowSIHExportModal(false)}
        team={{
          id: team.id,
          name: team.name,
          description: team.description || "",
          owner_id: team.owner_id,
          max_members: team.max_members,
          college: team.college,
          hackathon_name: team.hackathon_name || "Smart India Hackathon 2026",
          skills: team.skills,
          roles_needed: team.roles_needed,
          github_repo_url: team.github_repo_url,
        }}
        members={members.map((m) => ({
          id: m.id,
          role: m.role,
          project_role: m.project_role,
          profiles: {
            id: m.profiles?.id || m.id,
            full_name: m.profiles?.full_name || "Member",
            email: m.profiles?.email || "N/A",
            avatar_url: m.profiles?.avatar_url,
            skills: m.profiles?.skills,
            gender: m.profiles?.gender || "Unspecified",
            college: team.college,
          },
        }))}
      />
    </main>
  );
}
