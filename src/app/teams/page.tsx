"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { promptDiscoverySignIn } from "@/lib/discovery-auth";
import { ArrowRight, CirclePause, Code2, GraduationCap, Plus, Search, Target, Trophy, UserRoundCheck, Users, Zap } from "lucide-react";

type Team = {
  id: string;
  name: string;
  description: string;
  skills: string[] | null;
  roles_needed?: string[] | null;
  college: string | null;
  hackathon_name: string | null;
  max_members: number;
  is_recruiting?: boolean;
  team_members?: { id: string }[];
  team_hackathons?: { hackathons: { id: string; name: string } | null }[];
  team_ppt_evaluations?: { total_score: number; grade: string; status: string }[];
};

function TeamsContent() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [collegeFilter, setCollegeFilter] = useState("");
  const [hackathonFilter, setHackathonFilter] = useState("");

  async function loadTeams() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setCurrentUserId(user?.id ?? null);
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("skills")
        .eq("id", user.id)
        .single();

      setUserSkills(profile?.skills || []);
    }

    const { data, error } = await supabase
      .from("teams")
      .select(`id, name, description, skills, roles_needed, college, max_members, is_recruiting, team_members(id), team_hackathons(hackathons(id, name))${user ? ", team_ppt_evaluations(total_score, grade, status)" : ""}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
    } else {
      setTeams((data || []) as unknown as Team[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      loadTeams();
    });
  }, []);

  const calculateMatchScore = useCallback((teamSkills: string[] = []) => {
    if (!teamSkills.length) return 0;
    const matchedSkills = teamSkills.filter((skill) =>
      userSkills.includes(skill)
    );
    return Math.round(
      (matchedSkills.length / teamSkills.length) * 100
    );
  }, [userSkills]);

  const filteredTeams = useMemo(() => {
    return teams
      .filter((team) => {
        const matchesSearch =
          !search ||
          team.name.toLowerCase().includes(search.toLowerCase());

        const matchesSkill =
          !skillFilter ||
          team.skills?.some((skill) =>
            skill.toLowerCase().includes(skillFilter.toLowerCase())
          );

        const matchesCollege =
          !collegeFilter ||
          team.college?.toLowerCase().includes(collegeFilter.toLowerCase());

        const matchesHackathon =
          !hackathonFilter ||
          team.team_hackathons?.some((th: any) =>
            th.hackathons?.name?.toLowerCase().includes(hackathonFilter.toLowerCase())
          ) ||
          team.hackathon_name
            ?.toLowerCase()
            .includes(hackathonFilter.toLowerCase());

        return (
          matchesSearch && matchesSkill && matchesCollege && matchesHackathon
        );
      })
      .sort(
        (a, b) =>
          calculateMatchScore(b.skills || []) -
          calculateMatchScore(a.skills || [])
      );
  }, [teams, search, skillFilter, collegeFilter, hackathonFilter, calculateMatchScore]);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-28 font-[family-name:var(--font-geist-sans)] text-zinc-100 sm:px-6">
      {/* Hero */}
      <section className="mb-8">
        <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B4F461]">TEAM DISCOVERY</p>

        <h1 className="mb-3 bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-3xl font-semibold tracking-[-0.04em] text-transparent sm:text-4xl">
          Find your next team
        </h1>

        <p className="text-sm text-zinc-400 max-w-xl leading-relaxed">
          Explore active hackathon teams, discover opportunities, and find
          builders who share your vision.
        </p>
      </section>

      {/* Actions */}
      <div className="mb-8 flex flex-wrap gap-2.5">
        <Link href="/my-teams" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/50 px-4 text-xs font-semibold text-zinc-200 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-zinc-800/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] motion-reduce:transform-none">
          <Code2 aria-hidden="true" className="size-4 text-zinc-400" />
          My Teams
        </Link>

        <Link href="/teams/create" onClick={event => { if (!currentUserId) { event.preventDefault(); promptDiscoverySignIn("/teams/create"); } }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#B4F461]/40 bg-[#B4F461] px-4 text-xs font-bold !text-[#11160b] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_18px_rgba(180,244,97,0.1)] transition-all hover:-translate-y-0.5 hover:bg-[#c4f782] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] motion-reduce:transform-none">
          <Plus aria-hidden="true" className="size-4" />
          Create Team
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="mb-8 rounded-2xl border border-white/[0.08] bg-zinc-950/55 p-4 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Search aria-hidden="true" className="size-3.5 text-[#22D3EE]" />
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Search & Filters</p>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Search team name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-3.5 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 hover:border-white/20 focus:border-[#B4F461]/50 focus:ring-2 focus:ring-[#B4F461]/10"
          />

          <input
            type="text"
            placeholder="Filter by skill..."
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-3.5 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 hover:border-white/20 focus:border-[#B4F461]/50 focus:ring-2 focus:ring-[#B4F461]/10"
          />

          <input
            type="text"
            placeholder="Filter by college..."
            value={collegeFilter}
            onChange={(e) => setCollegeFilter(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-3.5 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 hover:border-white/20 focus:border-[#B4F461]/50 focus:ring-2 focus:ring-[#B4F461]/10"
          />

          <input
            type="text"
            placeholder="Filter by hackathon..."
            value={hackathonFilter}
            onChange={(e) => setHackathonFilter(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-3.5 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 hover:border-white/20 focus:border-[#B4F461]/50 focus:ring-2 focus:ring-[#B4F461]/10"
          />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-3">
          <p className="text-zinc-500 text-xs font-mono uppercase tracking-wider">
            {filteredTeams.length} team{filteredTeams.length !== 1 ? "s" : ""} found
          </p>

          {(search || skillFilter || collegeFilter || hackathonFilter) && (
            <button
              onClick={() => {
                setSearch("");
                setSkillFilter("");
                setCollegeFilter("");
                setHackathonFilter("");
              }}
              className="cursor-pointer text-xs font-medium text-zinc-400 underline-offset-4 transition-colors hover:text-[#B4F461] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461]"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[220px] flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-5 shadow-lg ring-1 ring-white/5"
            >
              <div>
                <div className="flex items-start justify-between mb-3.5 gap-3">
                  <div className="space-y-2 min-w-0">
                    <div className="h-4 w-32 rounded bg-zinc-800/80" />
                    <div className="h-3 w-24 rounded bg-zinc-900" />
                  </div>
                  <div className="h-5 w-14 rounded-full bg-zinc-900" />
                </div>
                <div className="space-y-1.5 mb-3.5">
                  <div className="h-3 w-full rounded bg-zinc-900" />
                  <div className="h-3 w-2/3 rounded bg-zinc-900" />
                </div>
                <div className="flex gap-1.5 mb-4">
                  <div className="h-4 w-12 rounded bg-zinc-800/80" />
                  <div className="h-4 w-14 rounded bg-zinc-800/80" />
                </div>
              </div>
              <div className="mt-2 flex justify-between border-t border-white/[0.08] pt-3.5">
                <div className="h-3 w-20 rounded bg-zinc-800/80" />
              </div>
            </div>
          ))
        ) : filteredTeams.length === 0 ? (
          <div className="col-span-full rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-12 text-center shadow-lg ring-1 ring-white/5">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-white/10 bg-zinc-900/60 text-zinc-500">
              <Users aria-hidden="true" className="size-5" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1.5">
              No teams found
            </h3>
            <p className="text-xs text-zinc-500 max-w-xs mx-auto">
              Try adjusting your filters or create a new team.
            </p>
          </div>
        ) : (
          filteredTeams.map((team) => {
            const matchScore = calculateMatchScore(team.skills || []);
            const currentCount = team.team_members?.length || 0;
            const maxCount = team.max_members || 5;
            const isFull = maxCount > 0 && currentCount >= maxCount;
            const isClosed = team.is_recruiting === false;
            
            return (
              <Link
                key={team.id}
                href={`/teams/${team.id}`}
                className="group relative flex min-h-[250px] flex-col justify-between overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-5 shadow-lg ring-1 ring-white/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-950/70 focus-visible:border-zinc-700 motion-reduce:transform-none"
              >
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                <div>
                  {/* Top - Name & Status */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h2 className="truncate text-base font-semibold text-white transition-colors group-hover:text-[#B4F461]">
                      {team.name}
                    </h2>

                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                        isFull 
                          ? "border-white/10 bg-white/[0.04] text-zinc-400"
                          : isClosed 
                            ? "border-white/10 bg-white/[0.04] text-zinc-500"
                            : "border-[#B4F461]/20 bg-[#B4F461]/10 text-[#B4F461]"
                      }`}>
                        {isFull ? <Users aria-hidden="true" className="size-3" /> : isClosed ? <CirclePause aria-hidden="true" className="size-3" /> : <UserRoundCheck aria-hidden="true" className="size-3" />}
                        {isFull ? "Full" : isClosed ? "Closed" : "Recruiting"}
                      </span>

                      {matchScore > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/[0.07] px-2 py-1 font-mono text-[10px] font-semibold text-[#22D3EE]">
                          <Target aria-hidden="true" className="size-3" />
                          {matchScore}% Match
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="mb-3.5 min-h-[32px] text-xs leading-relaxed text-zinc-400 line-clamp-2">
                    {team.description || "No description provided."}
                  </p>

                  {/* Skills */}
                  <div className="flex flex-wrap gap-1.5 mb-3.5">
                    {team.skills?.length ? (
                      <>
                        {team.skills.slice(0, 3).map((skill) => (
                          <span key={skill} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] font-medium text-zinc-300">
                            {skill}
                          </span>
                        ))}
                        {team.skills.length > 3 && (
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] font-medium text-zinc-500">
                            +{team.skills.length - 3}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="font-mono text-[10px] text-zinc-500">No skills listed</span>
                    )}
                  </div>

                  {team.roles_needed?.length ? (
                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#B4F461]/20 bg-[#B4F461]/[0.08] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#B4F461]">
                        <UserRoundCheck aria-hidden="true" className="size-3" />
                        {team.roles_needed.length} {team.roles_needed.length === 1 ? "role" : "roles"} open
                      </span>
                      {team.roles_needed.map((role) => (
                        <span key={role} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] font-medium text-zinc-300">
                          {role}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {/* Meta Info */}
                  <div className="mb-3 space-y-2 border-t border-white/[0.08] pt-3 text-xs">
                    <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                      <GraduationCap aria-hidden="true" className="size-3.5 shrink-0 text-zinc-500" />
                      <span className="truncate">{team.college || "Independent / Multi-College"}</span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                      <Zap aria-hidden="true" className="size-3.5 shrink-0 text-[#22D3EE]" />
                      <span className="truncate">
                        {team.team_hackathons && team.team_hackathons.length > 0
                          ? team.team_hackathons.map((th) => th.hackathons?.name).filter(Boolean).join(", ")
                          : (team.hackathon_name || "General Project")}
                      </span>
                    </div>
                  </div>

                  {/* SIH Pitch Score Badge */}
                  {(() => {
                    const pptEval = team.team_ppt_evaluations?.find((e: any) => e.status === "completed");
                    if (!pptEval) return null;
                    return (
                      <div className="mb-2.5 flex items-center justify-between rounded-xl border border-[#22D3EE]/15 bg-[#22D3EE]/[0.05] p-2.5">
                        <div className="flex items-center gap-1.5">
                          <Target aria-hidden="true" className="size-3.5 text-[#22D3EE]" />
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#22D3EE]">Pitch Deck</span>
                          <span className="font-mono text-[11px] font-bold text-white">{pptEval.total_score}/100</span>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-300">
                          <Trophy aria-hidden="true" className="size-3" />
                          {pptEval.grade}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* Footer Capacity & Action */}
                <div className="mt-1 flex items-center justify-between border-t border-white/[0.08] pt-3">
                  <span className="font-mono text-[11px] font-medium text-zinc-400">
                    {currentCount}/{maxCount} members
                  </span>

                  <div className="flex items-center gap-1 text-xs font-semibold text-[#B4F461] transition-transform group-hover:translate-x-0.5">
                    <span>View & Apply</span>
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </main>
  );
}

export default function TeamsPage() {
  return (
    <>
      <TeamsContent />
    </>
  );
}
