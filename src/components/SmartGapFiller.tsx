"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Users,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Shield,
  Layers,
  ExternalLink,
  Award,
  Code2,
} from "lucide-react";
import Link from "next/link";

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
      const { data: existingInvites } = await supabase
        .from("team_invites")
        .select("invited_user_id, status")
        .eq("team_id", teamId)
        .in("status", ["pending", "accepted"]);

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

  // If squad is full (6/6 members), show full squad assembled state
  if (memberCount >= 6) {
    return (
      <div className="rounded-2xl p-6 sm:p-8 border border-emerald-500/30 bg-gradient-to-br from-emerald-50/60 via-white to-zinc-50 dark:from-emerald-950/20 dark:via-zinc-950/80 dark:to-black shadow-xs space-y-6 text-left">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs px-2.5 py-0.5 font-bold font-mono">
                SQUAD COMPLETE • 6/6 MEMBERS
              </span>
            </div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
              🎉 Full Roster Assembled for {teamName}
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-xl leading-relaxed">
              Your squad has reached the maximum 6-member limit required for Smart India Hackathon (SIH) and major hackathons. All team slots are officially filled.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <Award className="w-8 h-8 text-emerald-500" />
            <div>
              <span className="text-xs font-mono font-bold text-zinc-900 dark:text-white block">
                SIH Roster Ready
              </span>
              <span className="text-[11px] text-zinc-500">6 Members on Board</span>
            </div>
          </div>
        </div>

        {/* Squad Status Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <div>
              <span className="text-xs font-bold text-zinc-900 dark:text-white block">Full 6 Members</span>
              <span className="text-[10px] text-zinc-500">Maximum squad limit reached</span>
            </div>
          </div>

          <div className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center gap-3">
            {hasFemaleBuilder ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            )}
            <div>
              <span className="text-xs font-bold text-zinc-900 dark:text-white block">
                {hasFemaleBuilder ? "Female Builder Rule Met" : "Gender Balance Alert"}
              </span>
              <span className="text-[10px] text-zinc-500">
                {hasFemaleBuilder ? "Mandatory SIH criteria satisfied" : "SIH mandates >= 1 female teammate"}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <div>
              <span className="text-xs font-bold text-zinc-900 dark:text-white block">Tech Roles Covered</span>
              <span className="text-[10px] text-zinc-500">{allTeamSkills.size} unique competencies</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 shadow-xs space-y-5 text-left">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="badge bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20 text-xs px-2.5 py-0.5 font-bold font-mono">
              AI SQUAD MATCHER
            </span>
            <span className="text-xs text-zinc-500">
              {6 - memberCount} slot{6 - memberCount > 1 ? "s" : ""} open
            </span>
          </div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-white mt-1">
            Recommended Builders Matching Your Required Skills
          </h3>
          <p className="text-xs text-zinc-500">
            HackerMate matches active builders who have completed their profiles and possess the specific skills required by {teamName}.
          </p>
        </div>
      </div>

      {/* Required Skills & Deficits Bar */}
      <div className="space-y-2">
        {targetSkills.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 font-mono">
              Team Required Skills:
            </span>
            {targetSkills.map((ts, idx) => (
              <span
                key={idx}
                className="text-xs px-2.5 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/80 text-violet-700 dark:text-violet-300 font-mono font-medium"
              >
                {ts}
              </span>
            ))}
          </div>
        )}

        {!hasFemaleBuilder && (
          <div className="flex items-center gap-2">
            <span className="badge bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30 text-xs px-2.5 py-1 flex items-center gap-1.5 font-medium">
              <Shield className="w-3.5 h-3.5" />
              Missing Mandatory Female Teammate for SIH Compliance
            </span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Candidate Recommendation Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          {[1, 2].map((i) => (
            <div key={i} className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 animate-pulse h-28" />
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
          <Code2 className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">No Matching Candidates Found</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            Try adding more required skills in Team Settings or explore all active developers on the Builders page.
          </p>
          <Link href="/developers" className="btn btn-secondary btn-sm text-xs mt-4 inline-flex items-center gap-1.5">
            <span>Browse All Builders →</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {candidates.map((c) => {
            const isInvited = invitedIds.has(c.id);
            const isInviting = invitingId === c.id;

            return (
              <div
                key={c.id}
                className="p-4 bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 rounded-xl hover:border-violet-300 dark:hover:border-violet-500/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-950/80 border border-violet-300 dark:border-violet-700/50 flex items-center justify-center font-bold text-violet-700 dark:text-violet-300 text-sm overflow-hidden flex-shrink-0">
                        {c.avatar_url ? (
                          <img src={c.avatar_url} alt={c.full_name} className="w-full h-full object-cover" />
                        ) : (
                          c.full_name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div>
                        <Link
                          href={`/profile/${c.id}`}
                          className="text-sm font-bold text-zinc-900 dark:text-white hover:text-violet-600 dark:hover:text-violet-400 transition-colors flex items-center gap-1"
                        >
                          <span>{c.full_name}</span>
                          <ExternalLink className="w-3 h-3 text-zinc-400" />
                        </Link>
                        <p className="text-xs text-zinc-500 truncate max-w-[200px]">{c.college}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end flex-shrink-0">
                      <span className="badge bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs px-2 py-0.5 font-bold font-mono">
                        {c.matchScore}% Match
                      </span>
                    </div>
                  </div>

                  {/* Match Reason Tags */}
                  <div className="flex flex-wrap gap-1.5 my-2.5">
                    {c.matchReasons.map((r, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded font-medium bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300"
                      >
                        {r}
                      </span>
                    ))}
                  </div>

                  {/* Skills tags with highlighted matching skills */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {c.skills.slice(0, 5).map((skill, sIdx) => {
                      const isMatching = c.matchedSkills.includes(skill);
                      return (
                        <span
                          key={sIdx}
                          className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${
                            isMatching
                              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-bold"
                              : "bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400"
                          }`}
                        >
                          {isMatching ? `✓ ${skill}` : skill}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Invite Action */}
                <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between">
                  <Link
                    href={`/profile/${c.id}`}
                    className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  >
                    View Full Profile
                  </Link>

                  {isOwnerOrMember && (
                    <button
                      type="button"
                      disabled={isInvited || isInviting}
                      onClick={() => handleSendInvite(c.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isInvited
                          ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed"
                          : "btn btn-primary shadow-xs"
                      }`}
                    >
                      {isInvited ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Invite Pending</span>
                        </>
                      ) : isInviting ? (
                        <span>Sending Invite...</span>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Invite to Team</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
