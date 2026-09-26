"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";

type Team = {
  id: string;
  name: string;
  description: string;
  skills: string[] | null;
  college: string | null;
  hackathon_name: string | null;
  max_members: number;
  is_recruiting?: boolean;
  team_members?: { id: string }[];
  team_hackathons?: { hackathons: { id: string; name: string } | null }[];
  team_ppt_evaluations?: { total_score: number; grade: string; status: string }[];
};

function TeamsContent() {
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
      .select("*, team_members(id), team_hackathons(hackathons(id, name)), team_ppt_evaluations(total_score, grade, status)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
    } else {
      setTeams(data || []);
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
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
      {/* Hero */}
      <section className="mb-8 animate-fade-in-up">
        <p className="section-label">TEAM DISCOVERY</p>

        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
          Find your next team
        </h1>

        <p className="text-sm text-zinc-400 max-w-xl leading-relaxed">
          Explore active hackathon teams, discover opportunities, and find
          builders who share your vision.
        </p>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-2.5 mb-8 animate-fade-in-up stagger-1">
        <Link href="/my-teams" className="btn btn-secondary">
          <svg
            className="w-4 h-4 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
            />
          </svg>
          My Teams
        </Link>

        <Link href="/teams/create" className="btn btn-primary">
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
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Create Team
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="card card-static p-5 mb-8 animate-fade-in-up stagger-2">
        <div className="flex items-center gap-2 mb-3">
          <svg
            className="w-3.5 h-3.5 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <p className="section-label mb-0">Search & Filters</p>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Search team name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />

          <input
            type="text"
            placeholder="Filter by skill..."
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value)}
            className="input"
          />

          <input
            type="text"
            placeholder="Filter by college..."
            value={collegeFilter}
            onChange={(e) => setCollegeFilter(e.target.value)}
            className="input"
          />

          <input
            type="text"
            placeholder="Filter by hackathon..."
            value={hackathonFilter}
            onChange={(e) => setHackathonFilter(e.target.value)}
            className="input"
          />
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
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
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors underline underline-offset-2 cursor-pointer"
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
              className="card p-5 flex flex-col justify-between min-h-[220px] rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950/40 animate-pulse shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between mb-3.5 gap-3">
                  <div className="space-y-2 min-w-0">
                    <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800/80 rounded" />
                    <div className="h-3 w-24 bg-zinc-100 dark:bg-zinc-900 rounded" />
                  </div>
                  <div className="h-5 w-14 bg-zinc-100 dark:bg-zinc-900 rounded-full" />
                </div>
                <div className="space-y-1.5 mb-3.5">
                  <div className="h-3 w-full bg-zinc-100 dark:bg-zinc-900 rounded" />
                  <div className="h-3 w-2/3 bg-zinc-100 dark:bg-zinc-900 rounded" />
                </div>
                <div className="flex gap-1.5 mb-4">
                  <div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-800/80 rounded" />
                  <div className="h-4 w-14 bg-zinc-200 dark:bg-zinc-800/80 rounded" />
                </div>
              </div>
              <div className="pt-3.5 mt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-between">
                <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-800/80 rounded" />
              </div>
            </div>
          ))
        ) : filteredTeams.length === 0 ? (
          <div className="col-span-full card card-static p-12 text-center animate-fade-in-up">
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
                  d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.115a8.312 8.312 0 01-.115 1.342m0 0A8.284 8.284 0 027.747 18.25m8.312 2.22c.28-.654.443-1.373.443-2.128v-.079c0-1.428-.433-2.755-1.173-3.856M7.747 18.25a8.284 8.284 0 01-.115-1.342v-.003c0-1.43.433-2.758 1.173-3.859M7.747 18.25V18a8.312 8.312 0 01.115-1.342m0 0A8.284 8.284 0 0012 15.75m0 0c.928 0 1.815.153 2.642.435"
                />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-white mb-1.5">
              No teams found
            </h3>
            <p className="text-xs text-zinc-500 max-w-xs mx-auto">
              Try adjusting your filters or create a new team.
            </p>
          </div>
        ) : (
          filteredTeams.map((team, i) => {
            const matchScore = calculateMatchScore(team.skills || []);
            const currentCount = team.team_members?.length || 0;
            const maxCount = team.max_members || 5;
            const isFull = maxCount > 0 && currentCount >= maxCount;
            const isClosed = team.is_recruiting === false;
            
            return (
              <Link
                key={team.id}
                href={`/teams/${team.id}`}
                className="card group p-5 flex flex-col justify-between min-h-[250px] hover:border-sky-500/40 dark:hover:border-sky-500/30 hover:-translate-y-1 hover:shadow-xl transition-all duration-300 rounded-2xl relative overflow-hidden bg-zinc-950/40 dark:bg-zinc-950/40 border border-zinc-200/80 dark:border-zinc-800"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-sky-500/10 transition-colors" />
                <div>
                  {/* Top - Name & Status */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h2 className="text-base font-bold text-zinc-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors truncate">
                      {team.name}
                    </h2>

                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-[9px] font-bold font-mono py-0.5 px-2 rounded-full border ${
                        isFull 
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" 
                          : isClosed 
                            ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-500 border-zinc-300 dark:border-zinc-700" 
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      }`}>
                        {isFull ? "● FULL" : isClosed ? "○ CLOSED" : "● RECRUITING"}
                      </span>

                      {matchScore > 0 && (
                        <span className="text-[10px] text-sky-600 dark:text-sky-400 font-extrabold font-mono bg-sky-500/10 border border-sky-500/20 rounded-md px-1.5 py-0.5">
                          {matchScore}% Match
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-zinc-600 dark:text-zinc-400 text-xs leading-relaxed mb-3.5 line-clamp-2 min-h-[32px]">
                    {team.description || "No description provided."}
                  </p>

                  {/* Skills */}
                  <div className="flex flex-wrap gap-1.5 mb-3.5">
                    {team.skills?.length ? (
                      <>
                        {team.skills.slice(0, 3).map((skill) => (
                          <span key={skill} className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/60">
                            {skill}
                          </span>
                        ))}
                        {team.skills.length > 3 && (
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
                            +{team.skills.length - 3}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-600 italic">No skills listed</span>
                    )}
                  </div>

                  {/* Meta Info */}
                  <div className="space-y-1.5 mb-3 text-xs border-t border-zinc-200 dark:border-zinc-800/80 pt-2.5">
                    <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-[11px]">
                      <svg className="w-3.5 h-3.5 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.485a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" /></svg>
                      <span className="truncate">{team.college || "Independent / Multi-College"}</span>
                    </div>

                    <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-[11px]">
                      <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
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
                      <div className="flex items-center justify-between p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 mb-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-mono font-bold text-violet-600 dark:text-violet-400">🎯 Pitch Deck:</span>
                          <span className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">{pptEval.total_score}/100</span>
                        </div>
                        <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-700 dark:text-violet-300">
                          {pptEval.grade}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* Footer Capacity & Action */}
                <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-800/80 mt-1">
                  <span className="text-[11px] font-mono font-semibold text-zinc-500 dark:text-zinc-400">
                    {currentCount}/{maxCount} members
                  </span>

                  <div className="flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400 group-hover:translate-x-0.5 transition-transform">
                    <span>View & Apply</span>
                    <span className="font-mono">→</span>
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
    <AuthGuard>
      <TeamsContent />
    </AuthGuard>
  );
}
