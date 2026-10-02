"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  DoorOpen,
  Ellipsis,
  FileDown,
  Inbox,
  Lock,
  LogOut,
  PenLine,
  Plus,
  Share2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import ShareModal from "@/components/ShareModal";
import { useNotification } from "@/context/NotificationContext";
import { COLLEGES } from "@/lib/colleges";


import { CATEGORY_TONE, getTeamCategoryInfo } from "@/lib/teamCategory";
import {
  Avatar,
  Button,
  ButtonLink,
  Chip,
  Dialog,
  FieldLabel,
  FilterChip,
  Input,
  Menu,
  Page,
  SearchField,
  SeatMeter,
  Section,
  Select,
  SkeletonRows,
  Tape,
  TeamMark,
  Textarea,
  type MenuItem,
} from "@/components/system";
import { cn } from "@/lib/utils";

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

const PROJECT_ROLES = ["Developer", "Frontend Developer", "Backend Developer", "Full Stack Developer", "UI/UX Designer", "AI/ML Engineer", "AI Lead", "Project Manager"];

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
  listedHackathons?: { id: string; name: string; description?: string | null; start_date?: string; end_date?: string; status?: string }[];
  unlinkHackathon?: (hackathonId: string) => void;
};

/**
 * Team page — a roster sheet. Members fill seats; open seats are drawn as
 * empty slots with the role the team is looking for. Visitors only ever see
 * visitor-safe controls (request to join / sign in); share, export and
 * management live behind (isMember || isOwner) per AGENTS.md §1.
 *
 * Props contract, RPCs and table writes are unchanged from V1.
 */
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

  const [todayStr] = useState(() => new Date().toISOString().split("T")[0]);



  const signInHref = `/login?next=${encodeURIComponent(`/teams/${team.id}`)}`;
  const isEventConcluded = listedHackathons.some((h) => h.status === "archived" || (h.end_date && h.end_date < todayStr));
  const isClosed = team.is_recruiting === false || isEventConcluded;
  const canAccessWorkspace = isMember || isOwner;
  const workspaceHref = `/teams/${team.id}/workspace${team.hackathon_id ? `?hackathon_id=${team.hackathon_id}` : ""}`;
  const category = getTeamCategoryInfo({ hackathon_id: team.hackathon_id, team_hackathons: listedHackathons.map((h) => ({ hackathon_id: h.id, hackathons: { id: h.id, name: h.name } })) });
  const tone = CATEGORY_TONE[category.category];
  const openSeats = Math.max((team.max_members || 0) - members.length, 0);

  // ── Pending invite (accept / reject) ───────────────────────────────
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteActionLoading, setInviteActionLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => setInviteStatus(pendingInvite ? pendingInvite.status : null));
  }, [pendingInvite]);

  const handleAcceptInvite = async () => {
    if (!pendingInvite) return;
    setInviteActionLoading(true);
    const { error } = await supabase.rpc("accept_team_invite", { p_invite_id: pendingInvite.id });
    if (error) showToast(error.message, "error");
    else {
      showToast("You have successfully joined the team!", "success");
      setInviteStatus("accepted");
      window.dispatchEvent(new Event("hm:teams-changed"));
      if (refreshTeam) refreshTeam();
    }
    setInviteActionLoading(false);
  };

  const handleRejectInvite = async () => {
    if (!pendingInvite) return;
    setInviteActionLoading(true);
    const { error } = await supabase.rpc("reject_team_invite", { p_invite_id: pendingInvite.id });
    if (error) showToast(error.message, "error");
    else {
      showToast("Invitation declined.", "info");
      setInviteStatus("rejected");
      if (refreshTeam) refreshTeam();
    }
    setInviteActionLoading(false);
  };

  // ── Project role editing (owner) ───────────────────────────────────
  const [editingRoleFor, setEditingRoleFor] = useState<string | null>(null);
  const [projectRoleInput, setProjectRoleInput] = useState("");
  const [isCustomProjectRole, setIsCustomProjectRole] = useState(false);

  const handleSaveProjectRole = async (memberId: string) => {
    const roleToSave = projectRoleInput.trim() || "Developer";
    try {
      const { error } = await supabase.from("team_members").update({ project_role: roleToSave }).eq("id", memberId);
      if (error) showToast(error.message, "error");
      else {
        showToast("Project role updated successfully", "success");
        setEditingRoleFor(null);
        if (refreshTeam) refreshTeam();
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to update project role", "error");
    }
  };

  // ── Edit team details (owner) ──────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(team.name);
  const [editDesc, setEditDesc] = useState(team.description || "");
  const [editCollege, setEditCollege] = useState("");
  const [editCustomCollege, setEditCustomCollege] = useState("");
  const [editCollegeSearch, setEditCollegeSearch] = useState("");
  const [editMaxMembers, setEditMaxMembers] = useState(team.max_members || 4);
  const [editSkills, setEditSkills] = useState<string[]>(team.skills || []);
  const [editRoles, setEditRoles] = useState<string[]>(team.roles_needed || []);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      setEditName(team.name);
      setEditDesc(team.description || "");
      const isCustom = team.college && !COLLEGES.includes(team.college);
      setEditCollege(isCustom ? "Other" : team.college || "");
      setEditCustomCollege(isCustom ? team.college! : "");
      setEditMaxMembers(team.max_members || 4);
      setEditSkills(team.skills || []);
      setEditRoles(team.roles_needed || []);
    });
  }, [team]);

  const handleSaveTeamDetails = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editName.trim()) return showToast("Team name is required", "warning");
    if (!editDesc.trim()) return showToast("Team description is required", "warning");
    if (editCollege === "Other" && !editCustomCollege.trim()) return showToast("Please enter your college name", "warning");
    if (editSkills.length === 0) return showToast("Please select at least one skill", "warning");
    if (editRoles.length === 0) return showToast("Please select at least one role", "warning");

    setSavingEdit(true);
    const finalCollege = editCollege === "Other" ? editCustomCollege.trim() : editCollege || null;
    const { error } = await supabase
      .from("teams")
      .update({ name: editName.trim(), description: editDesc.trim(), college: finalCollege, max_members: editMaxMembers, skills: editSkills, roles_needed: editRoles })
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
    window.dispatchEvent(new Event("hm:teams-changed"));
    if (refreshTeam) refreshTeam();
  };

  // ── Invite builders (owner) ────────────────────────────────────────
  const [showInviteBuilderModal, setShowInviteBuilderModal] = useState(false);
  const [inviteProfiles, setInviteProfiles] = useState<InviteProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [sessionInvitedIds, setSessionInvitedIds] = useState<Set<string>>(new Set());
  const [existingPendingInvites, setExistingPendingInvites] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!showInviteBuilderModal) return;
    let active = true;
    (async () => {
      setLoadingProfiles(true);
      try {
        const { data: profilesData, error: pErr } = await supabase.from("profiles").select("id, full_name, college, avatar_url, skills");
        if (pErr) console.error("[team] invite candidates failed:", pErr);
        const { data: pendingData, error: iErr } = await supabase.from("team_invites").select("invited_user_id").eq("team_id", team.id).eq("status", "pending");
        if (iErr) console.error("[team] pending invites failed:", iErr);
        if (!active) return;
        setInviteProfiles(profilesData || []);
        setExistingPendingInvites(new Set((pendingData || []).map((i) => i.invited_user_id)));
      } catch (err) {
        console.error(err);
      }
      if (active) setLoadingProfiles(false);
    })();
    return () => {
      active = false;
    };
  }, [showInviteBuilderModal, team.id]);

  const inviteCandidates = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.profiles.id));
    const q = searchQuery.toLowerCase();
    return inviteProfiles.filter((p) => {
      if (p.id === currentUserId || memberIds.has(p.id)) return false;
      if (!q) return true;
      return p.full_name?.toLowerCase().includes(q) || p.college?.toLowerCase().includes(q) || p.skills?.some((s) => s.toLowerCase().includes(q));
    });
  }, [inviteProfiles, members, currentUserId, searchQuery]);

  const sendInviteTo = async (profile: InviteProfile) => {
    try {
      const { error } = await supabase.rpc("send_team_invite", { p_team_id: team.id, p_invited_user_id: profile.id });
      if (error) showToast(error.message, "error");
      else {
        showToast(`Invite sent to ${profile.full_name}!`, "success");
        setSessionInvitedIds((prev) => new Set(prev).add(profile.id));
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to send invite", "error");
    }
  };

  // ── Leave / disband ────────────────────────────────────────────────
  const handleLeaveTeam = (memberId: string) => {
    if (isOwner) {
      confirm({
        title: "Disband this team?",
        message: "You lead this team, so leaving disbands it for everyone. Members lose the workspace, chat, tasks and files. This can't be undone.",
        confirmText: "Disband team",
        cancelText: "Cancel",
        onConfirm: () => {
          if (disbandTeam) disbandTeam();
        },
      });
    } else {
      confirm({
        title: "Leave this team?",
        message: "You'll lose access to the workspace and team chat.",
        confirmText: "Leave",
        cancelText: "Cancel",
        onConfirm: () => {
          if (leaveTeam) leaveTeam(memberId);
          else removeMember(memberId);
        },
      });
    }
  };

  const selfMember = members.find((m) => m.profiles?.id === currentUserId);
  const hasPendingInvite = Boolean(pendingInvite && inviteStatus === "pending");

  // ── Primary action (header + mobile bar) ───────────────────────────
  const primary: ReactNode = canAccessWorkspace ? (
    <ButtonLink href={workspaceHref} variant="primary" iconRight={<ArrowUpRight />}>
      Open workspace
    </ButtonLink>
  ) : hasPendingInvite && !teamFull ? (
    <>
      <Button variant="primary" loading={inviteActionLoading} onClick={handleAcceptInvite} icon={<Check />}>
        Accept invite
      </Button>
      <Button variant="ghost" disabled={inviteActionLoading} onClick={handleRejectInvite}>
        Decline
      </Button>
    </>
  ) : teamFull ? (
    <Button variant="secondary" disabled>
      Team is full
    </Button>
  ) : isClosed ? (
    <Button variant="secondary" disabled icon={<Lock />}>
      {isEventConcluded ? "Archived" : "Recruitment closed"}
    </Button>
  ) : isPublicVisitor ? (
    <ButtonLink href={signInHref} variant="primary" icon={<UserPlus />}>
      Sign in to join
    </ButtonLink>
  ) : requestSent ? (
    <Button variant="secondary" disabled icon={<Check />}>
      Request sent
    </Button>
  ) : (
    <Button variant="primary" loading={requestLoading} onClick={requestToJoin} icon={<UserPlus />}>
      Request to join
    </Button>
  );

  const overflow: MenuItem[] = [];
  if (canAccessWorkspace) {
    overflow.push({ label: "Share team", icon: <Share2 />, onSelect: () => setShowShareModal(true) });

    if (selfMember) {
      overflow.push(
        { type: "separator" },
        isOwner ? { type: "label", label: "Owner" } : { type: "label", label: "Membership" },
        { label: isOwner ? "Disband team…" : "Leave team…", icon: <LogOut />, tone: "danger", onSelect: () => handleLeaveTeam(selfMember.id) },
      );
    }
  }

  // Open seats labelled with the roles the team still needs (in order).
  const seatRoles = team.roles_needed || [];

  return (
    <Page className="pb-32 md:pb-16">
      <nav aria-label="Breadcrumb" className="hidden pt-6 text-[12.5px] text-ink-3 md:block">
        <Link href="/teams" className="hover:text-ink">
          Teams
        </Link>
        <span className="mx-1.5 text-ink-4">/</span>
        <span className="text-ink-2">{team.name}</span>
      </nav>

      {hasPendingInvite && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg bg-accent-soft px-4 py-3 ring-1 ring-inset ring-accent/30 sm:flex-row sm:items-center sm:justify-between animate-hm-enter">
          <p className="flex items-center gap-2.5 text-[13.5px] text-ink">
            <Inbox className="size-4 text-accent-ink" aria-hidden />
            You&apos;re invited to join this team.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" loading={inviteActionLoading} onClick={handleAcceptInvite}>
              Accept
            </Button>
            <Button size="sm" variant="ghost" disabled={inviteActionLoading} onClick={handleRejectInvite}>
              Decline
            </Button>
          </div>
        </div>
      )}

      {/* ── Identity ─────────────────────────────────────────────── */}
      <header className="pt-5 md:pt-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex items-start gap-4 md:items-end md:gap-6">
            <TeamMark name={team.name} tone={tone} size="xl" className="md:size-20 md:rounded-[14px] md:text-[28px]" />
            <div className="min-w-0">
              <h1 data-v2-heading className="font-display text-[30px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink [font-variation-settings:'wdth'_88] md:text-[42px]">
                {team.name}
              </h1>
              <p className="mt-2 text-[13.5px] text-ink-3">
                {[listedHackathons.length ? listedHackathons.map((h) => h.name).join(", ") : team.hackathon_name || "Independent project", team.college || "Multi-college"].join(" · ")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {teamFull ? <Tape tone="bad">Full</Tape> : isClosed ? <Tape>{isEventConcluded ? "Archived" : "Closed"}</Tape> : <Tape tone="accent" dot>Recruiting</Tape>}
                <Tape tone={tone}>{category.tag}</Tape>
                {!teamFull && !isClosed && openSeats > 0 && <Tape tone="ok">{openSeats} seat{openSeats === 1 ? "" : "s"} open</Tape>}
                {isOwner && <Tape tone="solid">You lead</Tape>}
                {isMember && !isOwner && <Tape>Member</Tape>}
              </div>
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            {primary}
            {overflow.length > 0 && <OverflowMenu items={overflow} />}
          </div>
        </div>
      </header>

      <div className="mt-9 grid grid-cols-1 gap-10 border-t border-line pt-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
        <div className="min-w-0 space-y-10">
          <Section title="What we're building">
            <p className="max-w-[68ch] whitespace-pre-line break-words text-[15px] leading-[1.65] text-ink-2 [overflow-wrap:anywhere]">{team.description || "No description yet."}</p>
          </Section>

          {/* Roster: filled seats then open seats */}
          <Section title="Roster" count={`${members.length}/${team.max_members || "—"}`} action={<SeatMeter filled={members.length} total={team.max_members} showLabel={false} />}>
            <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
              {members.map((member) => {
                const isSelf = member.profiles?.id === currentUserId;
                const editing = editingRoleFor === member.id;
                return (
                  <li key={member.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={member.profiles?.full_name} src={member.profiles?.avatar_url} size="md" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/profile/${member.profiles.id}`} className="truncate text-[14px] font-semibold text-ink hover:underline decoration-line-strong underline-offset-4">
                            {member.profiles?.full_name}
                          </Link>
                          {member.role === "owner" ? <Tape tone="solid">Owner</Tape> : <Tape>Member</Tape>}
                          {isSelf && <span className="caps-label text-ink-3">you</span>}
                        </div>
                        {editing ? (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Select
                              aria-label="Project role"
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
                              className="h-7 w-44 text-[12.5px]"
                            >
                              {PROJECT_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                              <option value="Custom...">Custom…</option>
                            </Select>
                            {isCustomProjectRole && (
                              <Input aria-label="Custom role" placeholder="Role" value={projectRoleInput} onChange={(e) => setProjectRoleInput(e.target.value)} className="h-7 w-32 text-[12.5px]" />
                            )}
                            <Button size="sm" variant="inverse" onClick={() => handleSaveProjectRole(member.id)}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingRoleFor(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                            {member.project_role || "Developer"}
                            {isOwner && (
                              <button
                                type="button"
                                aria-label={`Edit ${member.profiles?.full_name}'s project role`}
                                onClick={() => {
                                  setEditingRoleFor(member.id);
                                  setProjectRoleInput(member.project_role || "Developer");
                                  setIsCustomProjectRole(!PROJECT_ROLES.includes(member.project_role || "Developer"));
                                }}
                                className="inline-flex size-5 items-center justify-center rounded text-ink-4 hover:bg-hover hover:text-ink"
                              >
                                <PenLine className="size-3" />
                              </button>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    {/* Leaving / disbanding lives in the team's "…" menu (with
                        confirmation), not beside your own name in the roster. */}
                    {!isSelf && isOwner && member.profiles.id !== team.owner_id && (
                      <div className="flex shrink-0 gap-1.5 pl-12 sm:pl-0">
                        <Button size="sm" variant="ghost" icon={<UserMinus />} onClick={() => removeMember(member.id)}>
                          Remove
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
              {Array.from({ length: Math.min(openSeats, 6) }).map((_, i) => (
                <li key={`open-${i}`} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="inline-flex size-9 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-4" aria-hidden>
                    <Plus className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-ink-2">Open seat</p>
                    <p className="text-[12.5px] text-ink-3">{seatRoles[i] ? `Looking for a ${seatRoles[i]}` : "Any role that fits the idea"}</p>
                  </div>
                  {isOwner && i === 0 && (
                    <Button size="sm" variant="secondary" icon={<UserPlus />} onClick={() => setShowInviteBuilderModal(true)}>
                      Invite
                    </Button>
                  )}
                </li>
              ))}
              {members.length === 0 && openSeats === 0 && <li className="px-4 py-6 text-center text-[13px] text-ink-3">No team members yet.</li>}
            </ul>
          </Section>

          <Section title="Skills the team needs" count={team.skills?.length || 0}>
            {team.skills?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {team.skills.map((s) => (
                  <Chip key={s} active={matchedSkills.includes(s)}>
                    {s}
                  </Chip>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-ink-3">No skills listed.</p>
            )}
            {!canAccessWorkspace && !isPublicVisitor && typeof matchScore === "number" && (team.skills?.length ?? 0) > 0 && (
              <div className="mt-4 rounded-lg border border-line p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-semibold text-ink">Skills you already have</span>
                  <span className={cn("font-display text-[22px] font-semibold leading-none tabular", matchScore >= 70 ? "text-ok" : matchScore >= 40 ? "text-warn" : "text-ink-3")}>
                    {matchedSkills.length}
                    <span className="text-[14px] text-ink-4">/{team.skills?.length ?? 0}</span>
                  </span>
                </div>
                {matchedSkills.length > 0 && <p className="mt-2 text-[12.5px] text-ink-3">You bring <span className="text-ink-2">{matchedSkills.join(", ")}</span>.</p>}
                {missingSkills.length > 0 && <p className="mt-1 text-[12.5px] text-ink-3">Still needed: <span className="text-ink-2">{missingSkills.join(", ")}</span>.</p>}
              </div>
            )}
          </Section>

          {(team.roles_needed?.length ?? 0) > 0 && (
            <Section title="Roles they're filling">
              <div className="flex flex-wrap gap-1.5">
                {(team.roles_needed || []).map((r) => (
                  <Tape key={r}>{r}</Tape>
                ))}
              </div>
            </Section>
          )}
        </div>

        <aside className="min-w-0 space-y-9">
          <Section title="At a glance">
            <dl className="divide-y divide-line rounded-lg border border-line">
              <Fact label="Seats" value={<SeatMeter filled={members.length} total={team.max_members} />} />
              <Fact label="College" value={team.college || "Multi-college"} />
              <Fact label="Status" value={teamFull ? "Full" : isClosed ? (isEventConcluded ? "Archived" : "Recruitment closed") : "Recruiting"} />
            </dl>
          </Section>

          <Section title="Hackathons" count={listedHackathons.length}>
            {listedHackathons.length ? (
              <ul className="space-y-1.5">
                {listedHackathons.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2.5">
                    <Link href={`/hackathons/${h.id}`} className="min-w-0 truncate text-[13px] font-medium text-ink hover:underline decoration-line-strong underline-offset-4">
                      {h.name}
                    </Link>
                    {isOwner && unlinkHackathon && (
                      <button type="button" onClick={() => unlinkHackathon(h.id)} className="shrink-0 text-[12px] text-ink-4 hover:text-bad">
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-3">Not listed in any hackathon.</p>
            )}
          </Section>

          {isOwner && (
            <Section title="Manage">
              <div className="grid gap-1.5">
                <Button variant="secondary" icon={<UserPlus />} onClick={() => setShowInviteBuilderModal(true)}>
                  Invite builders
                </Button>
                <ButtonLink href={`/teams/${team.id}/requests`} variant="secondary" icon={<Users />}>
                  Join requests
                </ButtonLink>
                <Button variant="secondary" icon={<PenLine />} onClick={() => setShowEditModal(true)}>
                  Edit team details
                </Button>
                <Button variant="ghost" icon={team.is_recruiting === false ? <DoorOpen /> : <Lock />} onClick={toggleRecruiting}>
                  {team.is_recruiting === false ? "Open recruitment" : "Close recruitment"}
                </Button>
              </div>
            </Section>
          )}

          {canAccessWorkspace && (
            <Section title="Share">
              <div className="grid gap-1.5">
                <Button variant="secondary" icon={<Share2 />} onClick={() => setShowShareModal(true)}>
                  Share team
                </Button>

              </div>
            </Section>
          )}
        </aside>
      </div>

      {/* Mobile sticky action bar */}
      <div className="fixed inset-x-0 bottom-[calc(var(--hm-tabbar-h)+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 border-t border-line bg-canvas/95 px-4 py-2.5 backdrop-blur md:hidden [&>*:first-child]:flex-1">
        {primary}
        {overflow.length > 0 && <OverflowMenu items={overflow} up />}
      </div>

      {/* ── Invite builders ─────────────────────────────────────── */}
      <Dialog
        open={showInviteBuilderModal}
        onClose={() => setShowInviteBuilderModal(false)}
        title={`Invite builders to ${team.name}`}
        description="They get a notification and can accept from their home screen."
        footer={
          <Button variant="ghost" onClick={() => setShowInviteBuilderModal(false)}>
            Done
          </Button>
        }
      >
        <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Name, college or skill" label="Search builders to invite" />
        <div className="mt-3 min-h-[260px]">
          {loadingProfiles ? (
            <SkeletonRows rows={4} />
          ) : inviteCandidates.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-ink-3">No builders match that search.</p>
          ) : (
            <ul className="divide-y divide-line">
              {inviteCandidates.slice(0, 60).map((p) => {
                const invited = existingPendingInvites.has(p.id) || sessionInvitedIds.has(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <Avatar name={p.full_name} src={p.avatar_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{p.full_name}</p>
                      <p className="truncate text-[12.5px] text-ink-3">{[p.college, (p.skills || []).slice(0, 3).join(", ")].filter(Boolean).join(" · ")}</p>
                    </div>
                    <Button size="sm" variant={invited ? "ghost" : "secondary"} disabled={invited} icon={invited ? <Check /> : undefined} onClick={() => sendInviteTo(p)}>
                      {invited ? "Invited" : "Invite"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Dialog>

      {/* ── Edit team details ───────────────────────────────────── */}
      <Dialog
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        size="lg"
        title="Edit team details"
        description="Name, mission, capacity and who you're looking for."
        footer={
          <>
            <Button variant="ghost" disabled={savingEdit} onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={savingEdit} onClick={() => handleSaveTeamDetails()}>
              Save changes
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveTeamDetails} className="space-y-5">
          <div>
            <FieldLabel htmlFor="edit-name">Team name</FieldLabel>
            <Input id="edit-name" data-autofocus required value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="e.g. Hack Warriors" />
          </div>
          <div>
            <FieldLabel htmlFor="edit-desc">Description</FieldLabel>
            <Textarea id="edit-desc" required rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="What are you building, and for which event?" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="edit-college" hint="optional">
                College
              </FieldLabel>
              <Input
                id="edit-college"
                list="hm-colleges"
                value={editCollegeSearch || editCollege}
                onChange={(e) => {
                  const v = e.target.value;
                  if (COLLEGES.includes(v) || v === "") {
                    setEditCollege(v);
                    setEditCollegeSearch("");
                  } else {
                    setEditCollegeSearch(v);
                  }
                }}
                placeholder="Search colleges"
              />
              <datalist id="hm-colleges">
                {COLLEGES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {editCollege === "Other" && (
                <Input className="mt-2" aria-label="College name" placeholder="Enter your college name" value={editCustomCollege} onChange={(e) => setEditCustomCollege(e.target.value)} />
              )}
            </div>
            <div>
              <FieldLabel htmlFor="edit-size" hint={`${editMaxMembers} people`}>
                Team size
              </FieldLabel>
              <input id="edit-size" type="range" min={2} max={10} value={editMaxMembers} onChange={(e) => setEditMaxMembers(Number(e.target.value))} className="mt-2 w-full accent-[var(--hm-accent)]" />
            </div>
          </div>
          <div>
            <FieldLabel hint={`${editSkills.length} selected`}>Skills needed</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {SKILLS.map((s) => (
                <FilterChip key={s} active={editSkills.includes(s)} onClick={() => setEditSkills((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))}>
                  {s}
                </FilterChip>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel hint={`${editRoles.length} selected`}>Roles needed</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((r) => (
                <FilterChip key={r} active={editRoles.includes(r)} onClick={() => setEditRoles((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]))}>
                  {r}
                </FilterChip>
              ))}
            </div>
          </div>
        </form>
      </Dialog>

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title={`Share Team — ${team.name}`}
        subtitle="Recruit teammates via WhatsApp, LinkedIn, X, or Telegram"
        shareUrl={typeof window !== "undefined" ? window.location.href : `https://hackermate.in/teams/${team.id}`}
        shareText={`🚀 We're recruiting developers for team '${team.name}' ${team.hackathon_name ? `building for ${team.hackathon_name}` : ""} on HackerMate! Check our team profile & apply here:`}
        type="team"
        metadata={{ teamName: team.name, hackathonName: team.hackathon_name || undefined }}
      />


    </Page>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <dt className="caps-label text-ink-3">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[13px] text-ink-2">{value}</dd>
    </div>
  );
}

function OverflowMenu({ items, up = false }: { items: MenuItem[]; up?: boolean }) {
  return (
    <Menu
      align="end"
      side={up ? "top" : "bottom"}
      items={items}
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-label="More team actions"
          aria-expanded={open}
          className={cn("inline-flex size-[34px] shrink-0 items-center justify-center rounded-md text-ink-2 ring-1 ring-inset ring-line-strong hover:bg-hover hover:text-ink", open && "bg-hover")}
        >
          <Ellipsis className="size-4" />
        </button>
      )}
    />
  );
}

