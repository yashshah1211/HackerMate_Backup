"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Users, UserPlus, CheckCircle2, TriangleAlert, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Avatar,
  Button,
  ButtonLink,
  Chip,
  EmptyState,
  ErrorNotice,
  List,
  Panel,
  SeatMeter,
  Skeleton,
  Tape,
} from "@/components/system";

interface MemberProfile {
  id: string;
  full_name: string;
  gender?: string | null;
  skills?: string[] | null;
  college?: string | null;
  avatar_url?: string | null;
}

interface CandidateBuilder {
  id: string;
  full_name: string;
  bio?: string | null;
  college?: string | null;
  gender?: string | null;
  skills: string[];
  avatar_url?: string | null;
  matchScore: number;
  matchReasons: string[];
  matchedSkills: string[];
}

interface SmartGapFillerProps {
  teamId: string;
  teamName: string;
  requiredSkills?: string[] | null;
  rolesNeeded?: string[] | null;
  members: Array<{
    id: string;
    user_id: string;
    role: string;
    profiles?: MemberProfile;
  }>;
  isOwnerOrMember: boolean;
  onInviteSent?: () => void;
}

export default function SmartGapFiller({
  teamId,
  teamName,
  requiredSkills = [],
  rolesNeeded = [],
  members,
  isOwnerOrMember,
  onInviteSent,
}: SmartGapFillerProps) {
  const [candidates, setCandidates] = useState<CandidateBuilder[]>([]);
  const [loading, setLoading] = useState(true);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Deficit Analysis
  const memberCount = members.length;
  const hasFemaleBuilder = members.some((m) => {
    const g = m.profiles?.gender?.toLowerCase() || "";
    return g === "female" || g === "f";
  });

  // Aggregate all skills already present on the team
  const allTeamSkills = new Set<string>();
  members.forEach((m) => {
    (m.profiles?.skills || []).forEach((s) => allTeamSkills.add(s.toLowerCase().trim()));
  });

  // Team Desired Target Skills & Roles
  const targetSkills = Array.from(
    new Set([
      ...(requiredSkills || []),
      ...(rolesNeeded || []),
    ])
  ).filter(Boolean);

  const teamCollege = members[0]?.profiles?.college || "";

  useEffect(() => {
    loadRecommendedCandidates();
  }, [teamId, members.length, JSON.stringify(requiredSkills), JSON.stringify(rolesNeeded)]);

  async function loadRecommendedCandidates() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const existingUserIds = new Set(
        members.map((m) => m.user_id || m.profiles?.id).filter(Boolean)
      );

      // 1. Fetch pending team invites to avoid showing builders already invited
      const { data: existingInvites, error: invitesErr } = await supabase
        .from("team_invites")
        .select("invited_user_id, status")
        .eq("team_id", teamId)
        .in("status", ["pending", "accepted"]);

      // Keep the real reason visible; the list below still renders without it.
      if (invitesErr) console.error("[SmartGapFiller] Error fetching existing invites:", invitesErr);

      const pendingInviteUserIds = new Set(
        (existingInvites || []).map((inv: any) => inv.invited_user_id)
      );
      setInvitedIds(pendingInviteUserIds);

      // 2. Fetch completed profiles with verified skills
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, bio, college, gender, skills, avatar_url, onboarding_completed, is_available")
        .eq("onboarding_completed", true)
        .limit(100);

      if (error) {
        console.error("[SmartGapFiller] Error fetching builders:", error);
        setErrorMsg("Could not load candidate builders. Please refresh.");
        setLoading(false);
        return;
      }

      // 3. Normalized target skills
      const normalizedTargets = targetSkills.map((t) => t.toLowerCase().trim());

      const scored: CandidateBuilder[] = [];

      (profiles || []).forEach((p: any) => {
        // Exclude current team members
        if (existingUserIds.has(p.id)) return;

        // Strictly exclude incomplete profiles or users without skills
        const candidateSkills: string[] = Array.isArray(p.skills) ? p.skills : [];
        if (!p.full_name || candidateSkills.length === 0) return;

        const isFemale =
          p.gender?.toLowerCase() === "female" || p.gender?.toLowerCase() === "f";
        const candidateSkillsLower = candidateSkills.map((s) => s.toLowerCase().trim());

        // Find which required skills this candidate matches
        const matchedSkills: string[] = [];
        candidateSkills.forEach((skill) => {
          const sLower = skill.toLowerCase().trim();
          if (
            normalizedTargets.some(
              (target) => sLower.includes(target) || target.includes(sLower)
            )
          ) {
            matchedSkills.push(skill);
          }
        });

        const reasons: string[] = [];
        let score = 30; // base score for completed profile

        // Reward matching required team skills
        if (matchedSkills.length > 0) {
          score += Math.min(45, matchedSkills.length * 20);
          reasons.push(`Matches Required Skill: ${matchedSkills.slice(0, 2).join(", ")}`);
        }

        // Gender balance rule match
        if (!hasFemaleBuilder && isFemale) {
          score += 25;
          reasons.push("Satisfies SIH Female Teammate Rule");
        }

        // College synergy
        if (teamCollege && p.college && p.college.toLowerCase().includes(teamCollege.toLowerCase())) {
          score += 10;
          reasons.push("Same College Synergy");
        }

        // If team has specified required skills, ONLY show candidates who match required skills or satisfy gender deficit
        if (normalizedTargets.length > 0 && matchedSkills.length === 0) {
          if (!hasFemaleBuilder && isFemale) {
            reasons.push("Verified Builder Available for SIH");
          } else {
            // Does not match required team skills; skip candidate
            return;
          }
        }

        const finalScore = Math.min(99, Math.max(50, score));

        scored.push({
          id: p.id,
          full_name: p.full_name,
          bio: p.bio || "Software Builder",
          college: p.college || "Engineering College",
          gender: p.gender,
          skills: candidateSkills,
          avatar_url: p.avatar_url,
          matchScore: finalScore,
          matchReasons: reasons.length > 0 ? reasons : ["Verified Tech Stack"],
          matchedSkills,
        });
      });

      // Sort by match score descending (highest skill match first)
      scored.sort((a, b) => b.matchScore - a.matchScore);
      setCandidates(scored.slice(0, 6));
    } catch (err: any) {
      console.error("[SmartGapFiller] Exception:", err);
      setErrorMsg("Failed to analyze candidate recommendations.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendInvite(candidateId: string) {
    if (!isOwnerOrMember) return;
    setInvitingId(candidateId);
    setErrorMsg(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMsg("Please log in to send team invitations.");
        setInvitingId(null);
        return;
      }

      const { error: inviteErr } = await supabase.from("team_invites").insert({
        team_id: teamId,
        invited_by: user.id,
        invited_user_id: candidateId,
        status: "pending",
      });

      if (inviteErr) {
        console.error("[SmartGapFiller] Invite insert failed:", inviteErr);
        setErrorMsg(inviteErr.message || "Failed to dispatch team invitation.");
      } else {
        setInvitedIds((prev) => new Set([...Array.from(prev), candidateId]));
        if (onInviteSent) onInviteSent();
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network exception occurred while inviting.");
    } finally {
      setInvitingId(null);
    }
  }

  // SIH rules as a compact checklist (presentation only; values come from the deficit analysis above).
  const checks: { ok: boolean; label: string; detail: ReactNode }[] = [
    {
      ok: memberCount >= 6,
      label: "6 members",
      detail: <SeatMeter filled={Math.min(memberCount, 6)} total={6} />,
    },
    {
      ok: hasFemaleBuilder,
      label: "At least one woman on the team",
      detail: <span className="text-[12px] text-ink-3">{hasFemaleBuilder ? "Met" : "Required for SIH"}</span>,
    },
  ];

  const checklist = (
    <Panel as="section" className="min-w-0">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-[13.5px] font-semibold text-ink">SIH checks</h3>
      </div>
      <List className="px-4">
        {checks.map((c) => (
          <li key={c.label} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink-2">
              {c.ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-ok" aria-label="Met" />
              ) : (
                <TriangleAlert className="size-4 shrink-0 text-warn" aria-label="Not met" />
              )}
              <span className="min-w-0">{c.label}</span>
            </span>
            {c.detail}
          </li>
        ))}
        {memberCount >= 6 ? (
          <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink-2">
              <CheckCircle2 className="size-4 shrink-0 text-ok" aria-label="Met" />
              <span className="min-w-0">Skills on the team</span>
            </span>
            <span className="font-mono text-[12px] text-ink-3 tabular">{allTeamSkills.size} distinct</span>
          </li>
        ) : (
          targetSkills.length > 0 && (
            <li className="py-2.5">
              <p className="text-[12.5px] text-ink-3">Skills the team asked for</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {targetSkills.map((ts, idx) => (
                  <Chip key={idx}>{ts}</Chip>
                ))}
              </div>
            </li>
          )
        )}
      </List>
    </Panel>
  );

  // If squad is full (6/6 members), show full squad assembled state
  if (memberCount >= 6) {
    return (
      <div className="space-y-5 text-left">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-[13px] text-ink-3">
            {teamName} has all 6 seats filled, the most SIH and most hackathons allow.
          </p>
          <Tape tone="ok" icon={<CheckCircle2 />}>
            Squad complete
          </Tape>
        </div>
        {checklist}
      </div>
    );
  }

  const openSeats = 6 - memberCount;

  return (
    <div className="space-y-5 text-left">
      {/* Description + action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-[13px] text-ink-3">
          <span className="font-mono text-ink-2 tabular">{openSeats}</span> seat{openSeats > 1 ? "s" : ""} open · builders with the skills {teamName} asked for
        </p>
        <ButtonLink href="/developers" variant="secondary" size="sm" iconRight={<ArrowRight />} className="h-9 md:h-7">
          Browse all builders
        </ButtonLink>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* Checklist first on mobile (context), right rail on desktop. */}
        <div className="min-w-0 lg:order-2">{checklist}</div>

        <div className="min-w-0 space-y-3 lg:order-1">
          {errorMsg && <ErrorNotice title="Something went wrong" detail={errorMsg} />}

          {/* Candidate recommendations */}
          {loading ? (
            <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2" aria-busy="true" aria-label="Loading suggestions">
              {[1, 2].map((i) => (
                <li key={i} className="rounded-lg border border-line bg-raised p-3">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="size-9 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-2.5 w-2/3" />
                    </div>
                  </div>
                  <Skeleton className="mt-3 h-2.5 w-3/4" />
                </li>
              ))}
            </ul>
          ) : candidates.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="No matching builders right now"
              body="Add more skills in team settings, or look through everyone on the Builders page."
              action={
                <ButtonLink href="/developers" variant="secondary" size="sm" className="h-9 md:h-7">
                  Browse all builders
                </ButtonLink>
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {candidates.map((c) => {
                const isInvited = invitedIds.has(c.id);
                const isInviting = invitingId === c.id;

                return (
                  <li key={c.id} className="min-w-0 rounded-lg border border-line bg-raised p-3">
                    <div className="flex items-start gap-2.5">
                      <Avatar name={c.full_name} src={c.avatar_url} size="md" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/profile/${c.id}`}
                          className="block truncate text-[13.5px] font-semibold text-ink hover:underline hover:decoration-line-strong hover:underline-offset-4"
                        >
                          {c.full_name}
                        </Link>
                        <p className="truncate text-[12px] text-ink-3">
                          {c.college} · <span className="font-mono tabular">{c.matchScore}%</span> match
                        </p>
                      </div>

                      {isOwnerOrMember &&
                        (isInvited ? (
                          <Button variant="ghost" size="sm" icon={<CheckCircle2 className="text-ok" />} disabled className="h-9 shrink-0 md:h-7">
                            Invited
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<UserPlus />}
                            loading={isInviting}
                            onClick={() => handleSendInvite(c.id)}
                            className="h-9 shrink-0 md:h-7"
                          >
                            {isInviting ? "Sending" : "Invite"}
                          </Button>
                        ))}
                    </div>

                    {/* Why this builder */}
                    <p className="mt-2 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-2">
                      <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      <span className="min-w-0">{c.matchReasons.join(" · ")}</span>
                    </p>

                    {/* Skills, with the ones the team asked for highlighted */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.skills.slice(0, 5).map((skill, sIdx) => (
                        <Chip key={sIdx} active={c.matchedSkills.includes(skill)}>
                          {skill}
                        </Chip>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
