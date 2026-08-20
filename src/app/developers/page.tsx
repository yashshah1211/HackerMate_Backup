"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";
import MatchReasoningBadge from "@/components/MatchReasoningBadge";
import { getInitials } from "@/lib/utils";

type Profile = {
  id: string;
  full_name: string;
  email?: string | null;

  college: string;
  year_of_study?: string | null;
  bio: string;
  avatar_url: string;
  skills: string[];
  is_available?: boolean;
  has_participated_hackathon?: boolean;
  hackathon_participations?: number;
  has_won_hackathon?: boolean;
  hackathon_wins?: number;
};

type Team = {
  id: string;
  name: string;
  owner_id: string;
};

function DevelopersContent() {
  const { showToast } = useNotification();
  const [developers, setDevelopers] = useState<Profile[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const [userOwnedTeams, setUserOwnedTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [collegeFilter, setCollegeFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");

  // Invite states
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedDevId, setSelectedDevId] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  // Extract unique colleges with accurate counts from fetched developers for the filter dropdown
  const collegeCountsMap = new Map<string, { displayName: string; count: number }>();
  developers.forEach((dev) => {
    const trimmed = dev.college?.trim();
    if (trimmed) {
      const key = trimmed.toLowerCase();
      const existing = collegeCountsMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        collegeCountsMap.set(key, { displayName: trimmed, count: 1 });
      }
    }
  });

  const uniqueColleges = Array.from(collegeCountsMap.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );

  async function loadData(searchQuery?: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const blockedUserIds: string[] = [];
      let activeProfile: Profile | null = null;

      if (user) {
        // Fetch current user profile
        let { data: profile, error: pErr } = await supabase
          .from("profiles")
          .select("id, full_name, college, year_of_study, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, sih_broadcast_sent_at, username, show_track_record")
          .eq("id", user.id)
          .single();

        if (pErr) {
          const { data: fbProfile } = await supabase
            .from("profiles")
            .select("id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, sih_broadcast_sent_at, username, show_track_record")
            .eq("id", user.id)
            .single();
          profile = fbProfile as any;
        }

        activeProfile = profile as Profile | null;
        setCurrentUserProfile(profile);

        // Fetch owned teams
        const { data: teams } = await supabase
          .from("teams")
          .select("id, name, owner_id")
          .eq("owner_id", user.id);

        setUserOwnedTeams(teams || []);

        // Fetch user blocklists
        const { data: myBlocks } = await supabase
          .from("blocked_users")
          .select("blocked_id")
          .eq("blocker_id", user.id);

        const { data: theirBlocks } = await supabase
          .from("blocked_users")
          .select("blocker_id")
          .eq("blocked_id", user.id);

        if (myBlocks) {
          blockedUserIds.push(...myBlocks.map((b) => b.blocked_id));
        }
        if (theirBlocks) {
          blockedUserIds.push(...theirBlocks.map((b) => b.blocker_id));
        }
      }

      // Fetch all developers with database-level search or up to 1000 builders
      let queryBuilder = supabase
        .from("profiles")
        .select("id, full_name, college, year_of_study, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, sih_broadcast_sent_at, username, show_track_record")
        .order("created_at", { ascending: false });

      const term = (searchQuery !== undefined ? searchQuery : search).trim();
      if (term) {
        queryBuilder = queryBuilder.or(`full_name.ilike.%${term}%,college.ilike.%${term}%,skills.cs.{${term}}`);
      }

      queryBuilder = queryBuilder.limit(1000);

      let { data, error } = await queryBuilder;

      if (error) {
        console.warn("Primary developers query error, running fallback:", error);
        let fbBuilder = supabase
          .from("profiles")
          .select("id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, sih_broadcast_sent_at, username, show_track_record")
          .order("created_at", { ascending: false });

        if (term) {
          fbBuilder = fbBuilder.or(`full_name.ilike.%${term}%,college.ilike.%${term}%,skills.cs.{${term}}`);
        }
        fbBuilder = fbBuilder.limit(1000);
        const { data: fbData } = await fbBuilder;
        data = fbData as any;
      }

      if (data) {
        const filteredDevs = (data || []).filter(
          (d) => d.id !== user?.id && !blockedUserIds.includes(d.id)
        );
        const sortedDevs = filteredDevs.sort((a, b) => {
          return calculateCompatibility(b, activeProfile) - calculateCompatibility(a, activeProfile);
        });
        setDevelopers(sortedDevs);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  useEffect(() => {
    const handler = setTimeout(() => {
      loadData();
    }, 300);

    return () => {
      clearTimeout(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Calculate compatibility score between current user and other builder
  function calculateCompatibility(other: Profile, currentOverride?: Profile | null) {
    const baseProfile = currentOverride !== undefined ? currentOverride : currentUserProfile;
    if (!baseProfile) return 0;
    
    const mySkills = (baseProfile.skills as string[]) || [];
    const otherSkills = (other.skills as string[]) || [];

    // Jaccard similarity for skills (100% of score)
    let skillScore = 0;
    if (mySkills.length > 0 || otherSkills.length > 0) {
      const mySkillsLower = mySkills.map(s => s.toLowerCase().trim());
      const otherSkillsLower = otherSkills.map(s => s.toLowerCase().trim());
      const shared = otherSkillsLower.filter(s => mySkillsLower.includes(s));
      const union = new Set([...mySkillsLower, ...otherSkillsLower]);
      
      if (union.size > 0) {
        skillScore = (shared.length / union.size) * 100;
      }
    }

    const total = Math.round(skillScore);
    return Math.max(5, Math.min(total, 99)); // Min 5% connection, max 99%
  }

  // Handle direct invite
  async function handleSendInvite() {
    if (!selectedTeam || !selectedDevId || !currentUserProfile) return;
    setInviteLoading(true);

    try {
      // 1. Check if already a member
      const { data: existingMember } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", selectedTeam)
        .eq("user_id", selectedDevId)
        .maybeSingle();

      if (existingMember) {
        showToast("This builder is already a member of that team.", "warning");
        setInviteLoading(false);
        return;
      }

      // 2. Check if already invited
      const { data: existingInvite } = await supabase
        .from("team_invites")
        .select("id")
        .eq("team_id", selectedTeam)
        .eq("invited_user_id", selectedDevId)
        .eq("status", "pending")
        .maybeSingle();

      if (existingInvite) {
        showToast("An invite has already been sent to this builder.", "warning");
        setInviteLoading(false);
        return;
      }

      // 3. Send invite and notification atomically
      const { error } = await supabase.rpc("send_team_invite", {
        p_team_id: selectedTeam,
        p_invited_user_id: selectedDevId,
      });

      if (error) {
        showToast(error.message, "error");
        setInviteLoading(false);
        return;
      }

      showToast("Invite sent successfully!", "success");
      setShowInviteModal(false);
      setSelectedTeam("");
    } catch (err) {

      console.error(err);
      showToast("Failed to send invite.", "error");
    }
    setInviteLoading(false);
  }

  // Filter developers: exclude current logged-in user + apply search + college filter + year filter + sort by compatibility
  const filteredDevelopers = developers
    .filter((dev) => dev.id !== currentUserProfile?.id)
    .filter((dev) => {
      // College Filter
      if (collegeFilter) {
        if (!dev.college || dev.college.toLowerCase().trim() !== collegeFilter.toLowerCase().trim()) {
          return false;
        }
      }
      // Year Filter
      if (yearFilter) {
        const devYear = (dev.year_of_study || "2nd Year").toLowerCase().trim();
        if (devYear !== yearFilter.toLowerCase().trim()) {
          return false;
        }
      }
      // Text Search
      if (!search.trim()) return true;
      const query = search.toLowerCase();
      return (
        dev.full_name?.toLowerCase().includes(query) ||
        dev.college?.toLowerCase().includes(query) ||
        dev.year_of_study?.toLowerCase().includes(query) ||
        dev.skills?.some((skill) => skill.toLowerCase().includes(query))
      );
    })
    .sort((a, b) => calculateCompatibility(b) - calculateCompatibility(a));

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading builders...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
      {/* Hero */}
      <section className="mb-10 animate-fade-in-up">
        <p className="section-label">BUILDER NETWORK</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
          Discover developers
        </h1>
        <p className="text-sm text-zinc-400 max-w-xl leading-relaxed">
          Find teammates, collaborators, and future co-founders for your next hackathon project.
        </p>
      </section>


      {/* Search & College Filter bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-2xl mb-8 animate-fade-in-up stagger-1">
        {/* Text search */}
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search by name or skill..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input !pl-10 text-xs w-full"
          />
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 105.65 5.65a7.5 7.5 0 0011 11z" />
          </svg>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* College Filter Select */}
        <div className="relative sm:w-56">
          <select
            value={collegeFilter}
            onChange={(e) => setCollegeFilter(e.target.value)}
            className="input text-xs w-full appearance-none pr-8 cursor-pointer bg-zinc-950/80 border-zinc-800 text-zinc-200 focus:border-zinc-700"
          >
            <option value="">🏫 All Colleges ({developers.length})</option>
            {uniqueColleges.map(({ displayName, count }) => (
              <option key={displayName} value={displayName}>
                {displayName.length > 32 ? displayName.substring(0, 30) + "..." : displayName} ({count})
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500 text-[10px]">
            ▼
          </div>
        </div>

        {/* Year of Study Filter Select */}
        <div className="relative sm:w-44">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="input text-xs w-full appearance-none pr-8 cursor-pointer bg-zinc-950/80 border-zinc-800 text-zinc-200 focus:border-zinc-700"
          >
            <option value="">🎓 All Years</option>
            <option value="1st Year">1st Year</option>
            <option value="2nd Year">2nd Year</option>
            <option value="3rd Year">3rd Year</option>
            <option value="4th Year">4th Year</option>
            <option value="Postgrad / Alumni">Postgrad / Alumni</option>
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500 text-[10px]">
            ▼
          </div>
        </div>

        {(collegeFilter || yearFilter) && (
          <button
            type="button"
            onClick={() => {
              setCollegeFilter("");
              setYearFilter("");
            }}
            className="btn btn-secondary text-[11px] py-2 px-3 shrink-0 flex items-center gap-1.5 text-zinc-400 hover:text-white cursor-pointer"
          >
            <span>Clear Filters</span>
          </button>
        )}
      </div>

      {/* Developers Grid */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredDevelopers.length > 0 ? (
          filteredDevelopers.map((dev) => {
            const matchScore = calculateCompatibility(dev);
            return (
              <div 
                key={dev.id} 
                className="card group p-5 flex flex-col justify-between min-h-[240px] hover:border-indigo-500/40 dark:hover:border-indigo-500/30 hover:-translate-y-1 hover:shadow-xl transition-all duration-300 rounded-2xl relative overflow-hidden bg-zinc-950/40 dark:bg-zinc-950/40 border border-zinc-200/80 dark:border-zinc-800"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-indigo-500/10 transition-colors" />
                <div>
                  <div className="flex items-start justify-between mb-3.5 gap-3">
                    <Link href={`/profile/${dev.id}`} className="flex items-center gap-3 min-w-0 hover:opacity-90">
                      {dev.avatar_url ? (
                        <img
                          src={dev.avatar_url}
                          alt={dev.full_name}
                          className="w-11 h-11 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700/60 shadow-sm"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center font-bold text-indigo-400 text-sm shadow-sm">
                          {getInitials(dev.full_name, 1)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h2 className="font-bold text-sm text-zinc-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {dev.full_name}
                        </h2>
                        <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 text-[11px] truncate mt-0.5">
                          <span className="truncate">{dev.college || "Independent Builder"}</span>
                          {dev.year_of_study && (
                            <>
                              <span className="text-zinc-600 dark:text-zinc-600">•</span>
                              <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 font-mono text-[9px] font-semibold shrink-0">
                                🎓 {dev.year_of_study}
                              </span>
                            </>
                          )}
                        </div>
                        {/* Hackathon Badges */}
                        <div className="mt-1 flex items-center gap-1.5">
                          {dev.hackathon_wins && dev.hackathon_wins > 0 ? (
                            <span className="text-[9px] font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              🏆 {dev.hackathon_wins} Win{dev.hackathon_wins === 1 ? '' : 's'}
                            </span>
                          ) : dev.has_participated_hackathon ? (
                            <span className="text-[9px] font-mono font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border border-cyan-500/25 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              ⚡ Contender
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/25 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              🚀 Rookie
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>

                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`text-[9px] font-bold font-mono py-0.5 px-2 rounded-full border ${
                        dev.is_available !== false
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500 border-zinc-300 dark:border-zinc-700"
                      }`}>
                        {dev.is_available !== false ? "● Available" : "○ Busy"}
                      </span>
                      {matchScore > 0 && (
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold font-mono bg-indigo-500/10 border border-indigo-500/20 rounded-md px-1.5 py-0.5">
                          {matchScore}% Match
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-zinc-600 dark:text-zinc-400 text-xs mb-3.5 line-clamp-2 min-h-[32px] leading-relaxed">
                    {dev.bio || "No bio added yet."}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {dev.skills?.length ? (
                      <>
                        {dev.skills.slice(0, 3).map((skill) => (
                          <span key={skill} className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/60">
                            {skill}
                          </span>
                        ))}
                        {dev.skills.length > 3 && (
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
                            +{dev.skills.length - 3}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-600 italic">No skills listed</span>
                    )}
                  </div>

                  <MatchReasoningBadge
                    userA={currentUserProfile}
                    userB={dev}
                    isSelfViewer={true}
                    matchScore={matchScore}
                  />
                </div>

                <div className="flex items-center justify-between pt-3.5 mt-2 border-t border-zinc-200 dark:border-zinc-800/80">
                  <Link href={`/profile/${dev.id}`} className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors flex items-center gap-1 group/btn">
                    <span>View Profile</span>
                    <span className="group-hover/btn:translate-x-0.5 transition-transform font-mono">→</span>
                  </Link>

                  {userOwnedTeams.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedDevId(dev.id);
                        setShowInviteModal(true);
                      }}
                      className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-lg text-xs transition-all active:scale-95 cursor-pointer shadow-sm"
                    >
                      Invite to Team
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 mb-5">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584.036-.219.05-.44.05-.666l.001-.03m11.911 0a9.1 9.1 0 00-11.911 0M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-white mb-1.5">No builders yet</h3>
            <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
              You&apos;re the first one here. Share HackerMate with fellow builders to grow the network!
            </p>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-sm">
            <h2 className="text-sm font-semibold text-white mb-1.5">Invite to Team</h2>
            <p className="text-xs text-zinc-400 mb-4">
              Select which team you would like to invite this developer to join.
            </p>

            <label className="section-label block mb-1.5">Your Teams</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="input text-xs w-full mb-4"
            >
              <option value="">Select a team</option>
              {userOwnedTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setSelectedTeam("");
                  setSelectedDevId(null);
                }}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvite}
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

export default function DevelopersPage() {
  return (
    <AuthGuard>
      <DevelopersContent />
    </AuthGuard>
  );
}
