"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { promptDiscoverySignIn, PUBLIC_BUILDER_COLUMNS } from "@/lib/discovery-auth";
import { useNotification } from "@/context/NotificationContext";
import MatchReasoningBadge from "@/components/MatchReasoningBadge";
import { getInitials } from "@/lib/utils";
import { Activity, ArrowRight, ChevronDown, GraduationCap, Search, Target, Trophy, Users, Zap } from "lucide-react";

type Profile = {
  id: string;
  full_name: string;

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [collegeFilter, setCollegeFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [serverRecommendations, setServerRecommendations] = useState<
    Record<string, { compatibility: number; reasons: string[]; confidence?: number }>
  >({});

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

      setCurrentUserId(user?.id ?? null);
      const blockedUserIds: string[] = [];
      let activeProfile: Profile | null = null;

      if (user) {
        // Fetch current user profile
        let { data: profile, error: pErr } = await supabase
          .from("profiles")
          .select(PUBLIC_BUILDER_COLUMNS)
          .eq("id", user.id)
          .single();

        if (pErr) {
          console.error("Current builder profile query failed:", pErr);
          const { data: fbProfile, error: fallbackProfileError } = await supabase
            .from("profiles")
            .select(PUBLIC_BUILDER_COLUMNS)
            .eq("id", user.id)
            .single();
          if (fallbackProfileError) console.error("Builder profile fallback failed:", fallbackProfileError);
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

        // Fetch authoritative server matchmaking recommendations
        try {
          const { data: recData, error: recErr } = await supabase.rpc(
            "get_recommended_teammates",
            { p_user_id: user.id, p_limit: 50 }
          );
          if (recErr) {
            console.error("Matchmaking RPC error on developers page:", recErr);
          } else if (recData) {
            const recMap: Record<string, { compatibility: number; reasons: string[]; confidence?: number }> = {};
            (recData as any[]).forEach((r) => {
              recMap[r.id] = {
                compatibility: r.compatibility,
                reasons: r.reasons,
                confidence: r.confidence,
              };
            });
            setServerRecommendations(recMap);
          }
        } catch (rpcErr) {
          console.error("Failed to query get_recommended_teammates:", rpcErr);
        }
      }

      // Fetch all developers with database-level search or up to 1000 builders
      let queryBuilder = supabase
        .from("profiles")
        .select(PUBLIC_BUILDER_COLUMNS)
        .eq("onboarding_completed", true)
        .or("is_banned.is.null,is_banned.eq.false")
        .order("created_at", { ascending: false });

      const term = (searchQuery !== undefined ? searchQuery : search).trim();
      if (term) {
        queryBuilder = queryBuilder.or(`full_name.ilike.%${term}%,college.ilike.%${term}%,skills.cs.{${term}}`);
      }

      queryBuilder = queryBuilder.limit(1000);

      let { data, error } = await queryBuilder;

      if (error) {
        console.error("Primary developers query error, running fallback:", error);
        let fbBuilder = supabase
          .from("profiles")
          .select(PUBLIC_BUILDER_COLUMNS)
          .eq("onboarding_completed", true)
          .or("is_banned.is.null,is_banned.eq.false")
          .order("created_at", { ascending: false });

        if (term) {
          fbBuilder = fbBuilder.or(`full_name.ilike.%${term}%,college.ilike.%${term}%,skills.cs.{${term}}`);
        }
        fbBuilder = fbBuilder.limit(1000);
        const { data: fbData, error: fallbackError } = await fbBuilder;
        if (fallbackError) console.error("Public builder fallback failed:", fallbackError);
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
    if (serverRecommendations[other.id]) {
      return serverRecommendations[other.id].compatibility;
    }
    const baseProfile = currentOverride !== undefined ? currentOverride : currentUserProfile;
    if (!baseProfile) return 0;
    
    const mySkills = (baseProfile.skills as string[]) || [];
    const otherSkills = (other.skills as string[]) || [];

    // Jaccard similarity fallback for builders outside the top recommendation pool
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
    if (!currentUserId) { promptDiscoverySignIn(); return; }
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

  return (
    <main className="mx-auto max-w-7xl px-4 pb-28 pt-28 font-[family-name:var(--font-geist-sans)] text-zinc-100 sm:px-6">
      {/* Hero */}
      <section className="mb-9">
        <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B4F461]">BUILDER NETWORK</p>

        <h1 className="mb-3 bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-3xl font-semibold tracking-[-0.04em] text-transparent sm:text-4xl">
          Discover Builders
        </h1>

        <p className="text-sm text-zinc-400 max-w-xl leading-relaxed">
          Connect with developers, designers, and hackathon contenders. Find teammates matching your skill stack and campus.
        </p>
      </section>

      {/* Filter Bar */}
      <div className="mb-8 flex flex-col items-stretch gap-3 rounded-2xl border border-white/[0.08] bg-zinc-950/55 p-3 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:flex-row sm:items-center">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, skill, or college..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900/50 py-2.5 !pl-10 pr-3 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 hover:border-white/20 focus:border-[#B4F461]/50 focus:ring-2 focus:ring-[#B4F461]/10"
            style={{ paddingLeft: "2.5rem" }}
          />
        </div>

        {/* College Filter Select */}
        <div className="relative sm:w-56">
          <select
            value={collegeFilter}
            onChange={(e) => setCollegeFilter(e.target.value)}
            className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-zinc-900/50 px-3.5 pr-9 text-xs text-zinc-200 outline-none transition-colors hover:border-white/20 focus:border-[#B4F461]/50 focus:ring-2 focus:ring-[#B4F461]/10"
          >
            <option value="">All Colleges</option>
            {uniqueColleges.map(({ displayName, count }) => (
              <option key={displayName} value={displayName}>
                {displayName.length > 32 ? displayName.substring(0, 30) + "..." : displayName} ({count})
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Year of Study Filter Select */}
        <div className="relative sm:w-44">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-zinc-900/50 px-3.5 pr-9 text-xs text-zinc-200 outline-none transition-colors hover:border-white/20 focus:border-[#B4F461]/50 focus:ring-2 focus:ring-[#B4F461]/10"
          >
            <option value="">All Academic Years</option>
            <option value="1st Year">1st Year</option>
            <option value="2nd Year">2nd Year</option>
            <option value="3rd Year">3rd Year</option>
            <option value="4th Year">4th Year</option>
            <option value="Postgrad / Alumni">Postgrad / Alumni</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {(collegeFilter || yearFilter) && (
          <button
            type="button"
            onClick={() => {
              setCollegeFilter("");
              setYearFilter("");
            }}
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[11px] font-semibold text-zinc-400 transition-colors hover:border-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461]"
          >
            <span>Clear Filters</span>
          </button>
        )}
      </div>

      {/* Developers Grid */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[240px] flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-5 shadow-lg ring-1 ring-white/5"
            >
              <div>
                <div className="flex items-start justify-between mb-3.5 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-11 w-11 shrink-0 rounded-xl bg-zinc-800/80" />
                    <div className="space-y-2 min-w-0">
                      <div className="h-4 w-28 rounded bg-zinc-800/80" />
                      <div className="h-3 w-20 rounded bg-zinc-900" />
                    </div>
                  </div>
                  <div className="h-5 w-16 rounded-full bg-zinc-900" />
                </div>
                <div className="space-y-1.5 mb-3.5">
                  <div className="h-3 w-full rounded bg-zinc-900" />
                  <div className="h-3 w-3/4 rounded bg-zinc-900" />
                </div>
                <div className="flex gap-1.5 mb-4">
                  <div className="h-4 w-12 rounded bg-zinc-800/80" />
                  <div className="h-4 w-14 rounded bg-zinc-800/80" />
                  <div className="h-4 w-10 rounded bg-zinc-800/80" />
                </div>
              </div>
              <div className="mt-2 flex justify-between border-t border-white/[0.08] pt-3.5">
                <div className="h-3 w-20 rounded bg-zinc-800/80" />
              </div>
            </div>
          ))
        ) : filteredDevelopers.length > 0 ? (
          filteredDevelopers.map((dev) => {
            const matchScore = calculateCompatibility(dev);
            return (
              <div 
                key={dev.id} 
                className="group relative flex min-h-[240px] flex-col justify-between overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-5 shadow-lg ring-1 ring-white/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-950/70 focus-within:border-zinc-700 motion-reduce:transform-none"
              >
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                <div>
                  <div className="flex items-start justify-between mb-3.5 gap-3">
                    {currentUserId ? (
                      <Link href={`/profile/${dev.id}`} className="flex items-center gap-3 min-w-0 hover:opacity-90">
                      {dev.avatar_url ? (
                        <img
                          src={dev.avatar_url}
                          alt={dev.full_name}
                          className="size-11 shrink-0 rounded-xl border border-white/10 object-cover"
                        />
                      ) : (
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 font-mono text-sm font-semibold text-zinc-300">
                          {getInitials(dev.full_name, 1)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold text-white transition-colors group-hover:text-[#B4F461]">
                          {dev.full_name}
                        </h2>
                        <div className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-zinc-500">
                          <span className="truncate">{dev.college || "Independent Builder"}</span>
                          {dev.year_of_study && (
                            <>
                              <span className="text-zinc-600">•</span>
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/[0.07] px-2 py-0.5 font-mono text-[10px] font-medium text-[#22D3EE]">
                                <GraduationCap className="w-3 h-3" />
                                {dev.year_of_study}
                              </span>
                            </>
                          )}
                        </div>
                        {/* Hackathon Badges */}
                        <div className="mt-1 flex items-center gap-1.5">
                          {dev.hackathon_wins && dev.hackathon_wins > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[#B4F461]/20 bg-[#B4F461]/[0.08] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#B4F461]">
                              <Trophy className="w-3 h-3" />
                              {dev.hackathon_wins} Win{dev.hackathon_wins === 1 ? '' : 's'}
                            </span>
                          ) : dev.has_participated_hackathon ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/[0.07] px-2 py-0.5 font-mono text-[10px] font-medium text-[#22D3EE]">
                              <Zap className="w-3 h-3" />
                              Contender
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] font-medium text-zinc-400">
                              <Target aria-hidden="true" className="size-3" />
                              Rookie
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                    ) : (
                      <div className="flex items-center gap-3 min-w-0">
                        {dev.avatar_url ? (
                          <img
                            src={dev.avatar_url}
                            alt={dev.full_name}
                            className="size-11 shrink-0 rounded-xl border border-white/10 object-cover"
                          />
                        ) : (
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 font-mono text-sm font-semibold text-zinc-300">
                            {getInitials(dev.full_name, 1)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-semibold text-white">
                            {dev.full_name}
                          </h2>
                          <div className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-zinc-500">
                            <span className="truncate">{dev.college || "Independent Builder"}</span>
                            {dev.year_of_study && (
                              <>
                                <span className="text-zinc-600">•</span>
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/[0.07] px-2 py-0.5 font-mono text-[10px] font-medium text-[#22D3EE]">
                                  <GraduationCap className="w-3 h-3" />
                                  {dev.year_of_study}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            {dev.hackathon_wins && dev.hackathon_wins > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[#B4F461]/20 bg-[#B4F461]/[0.08] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#B4F461]">
                                <Trophy className="w-3 h-3" />
                                {dev.hackathon_wins} Win{dev.hackathon_wins === 1 ? '' : 's'}
                              </span>
                            ) : dev.has_participated_hackathon ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/[0.07] px-2 py-0.5 font-mono text-[10px] font-medium text-[#22D3EE]">
                                <Zap className="w-3 h-3" />
                                Contender
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] font-medium text-zinc-400">
                                <Target aria-hidden="true" className="size-3" />
                                Rookie
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[10px] font-semibold ${
                        dev.is_available !== false
                          ? "border-[#B4F461]/20 bg-[#B4F461]/10 text-[#B4F461]"
                          : "border-white/10 bg-white/[0.04] text-zinc-500"
                      }`}>
                        <Activity aria-hidden="true" className="size-3" />
                        {dev.is_available !== false ? "Available" : "Busy"}
                      </span>
                      {matchScore > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/[0.07] px-2 py-1 font-mono text-[10px] font-semibold text-[#22D3EE]">
                          <Target aria-hidden="true" className="size-3" />
                          {matchScore}% Fit
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mb-3.5 min-h-[36px] text-sm leading-relaxed text-zinc-400 line-clamp-2">
                    {dev.bio || "No bio added yet."}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {dev.skills?.length ? (
                      <>
                        {dev.skills.slice(0, 3).map((skill) => (
                          <span key={skill} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] font-medium text-zinc-300">
                            {skill}
                          </span>
                        ))}
                        {dev.skills.length > 3 && (
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] font-medium text-zinc-500">
                            +{dev.skills.length - 3}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[10px] text-zinc-600 italic">No skills listed</span>
                    )}
                  </div>

                  {currentUserId ? <MatchReasoningBadge
                    userA={currentUserProfile}
                    userB={dev}
                    isSelfViewer={true}
                    matchScore={matchScore}
                    reasons={serverRecommendations[dev.id]?.reasons}
                    confidence={serverRecommendations[dev.id]?.confidence}
                  /> : <button type="button" onClick={() => promptDiscoverySignIn()} className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-500 transition-colors hover:text-[#B4F461] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461]">Sign in to check fit</button>}
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-white/[0.08] pt-3.5">
                  {currentUserId ? (
                    <>
                      <Link href={`/profile/${dev.id}`} className="group/btn flex items-center gap-1 text-xs font-semibold text-zinc-400 transition-colors hover:text-white">
                        <span>View Profile</span>
                        <span className="group-hover/btn:translate-x-0.5 transition-transform font-mono">→</span>
                      </Link>

                      {userOwnedTeams.length > 0 ? (
                        <button
                          onClick={() => {
                            setSelectedDevId(dev.id);
                            setShowInviteModal(true);
                          }}
                          className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg border border-[#B4F461]/40 bg-[#B4F461] px-3 text-xs font-bold text-[#11160b] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_18px_rgba(180,244,97,0.1)] transition-all hover:-translate-y-0.5 hover:bg-[#c4f782] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 motion-reduce:transform-none"
                        >
                          Invite to Team
                        </button>
                      ) : (
                        <Link href={`/profile/${dev.id}`} className="text-xs font-semibold text-[#B4F461] transition-colors hover:text-[#c4f782]">
                          Connect
                        </Link>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => promptDiscoverySignIn(`/profile/${dev.id}`)}
                      className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[#B4F461]/25 bg-[#B4F461]/[0.08] px-3 text-xs font-semibold text-[#B4F461] transition-all hover:-translate-y-0.5 hover:border-[#B4F461]/40 hover:bg-[#B4F461]/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] motion-reduce:transform-none"
                    >
                      <span>Sign in to Connect</span>
                      <span className="font-mono">→</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900/60 text-zinc-500">
              <Users aria-hidden="true" className="size-6" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1.5">No builders yet</h3>
            <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
              You&apos;re the first one here. Share HackerMate with fellow builders to grow the network!
            </p>
          </div>
        )}
      </div>

      {!loading && !currentUserId && (
        <aside
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-white/10 bg-[#0d0d11]/90 p-3 sm:px-4 sm:py-3 shadow-[0_16px_40px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl animate-fade-in-up"
          aria-label="Guest browsing"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#B4F461]/25 bg-[#B4F461]/10 text-[#B4F461]">
                <Zap aria-hidden="true" className="size-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white tracking-tight">
                  Connect with Hackathon Builders
                </p>
                <p className="text-[11px] text-zinc-400 leading-tight">
                  Sign up to message developers and form your team
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => promptDiscoverySignIn()}
              className="inline-flex h-9 w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#B4F461]/40 bg-[#B4F461] px-4 text-xs font-bold !text-[#08080a] shadow-[0_6px_18px_rgba(180,244,97,0.13)] transition-all hover:-translate-y-0.5 hover:bg-[#c4fa83] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 motion-reduce:transform-none sm:w-auto"
            >
              <span>Sign Up Free</span>
              <ArrowRight className="size-3.5" />
            </button>
          </div>
        </aside>
      )}
      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Invite builder to team" className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-white mb-1.5">Invite to Team</h2>
            <p className="text-xs text-zinc-400 mb-4">
              Select which team you would like to invite this developer to join.
            </p>

            <label className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Your Teams</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="mb-4 min-h-10 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-3.5 text-xs text-zinc-100 outline-none transition-colors hover:border-white/20 focus:border-[#B4F461]/60 focus:ring-2 focus:ring-[#B4F461]/10"
            >
              <option value="">Select a team</option>
              {userOwnedTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-2 border-t border-white/[0.08] pt-3">
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setSelectedTeam("");
                  setSelectedDevId(null);
                }}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/10 bg-zinc-900/60 px-3.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461]"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvite}
                disabled={!selectedTeam || inviteLoading}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[#B4F461]/40 bg-[#B4F461] px-3.5 text-xs font-bold text-[#11160b] transition-colors hover:bg-[#c4f782] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] disabled:cursor-not-allowed disabled:opacity-50"
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
    <>
      <DevelopersContent />
    </>
  );
}
