"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Team = {
  id: string;
  name: string;
  description: string;
  skills: string[] | null;
  college: string | null;
  hackathon_name: string | null;
};

import AuthGuard from "@/components/AuthGuard";

function TeamsContent() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [collegeFilter, setCollegeFilter] = useState("");
  const [hackathonFilter, setHackathonFilter] = useState("");

  async function loadTeams() {
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
      .select("*")
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

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--primary-500)] to-[var(--accent-500)] animate-pulse mb-4" />
          <p className="text-zinc-500">Loading teams...</p>
        </div>
      </main>
    );
  }

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

      {/* Filter Panel */}
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
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between mb-5 animate-fade-in-up stagger-3">
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
            className="text-xs text-zinc-500 hover:text-white transition-colors underline underline-offset-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Grid */}
      {filteredTeams.length === 0 ? (
        <div className="card card-static p-12 text-center animate-fade-in-up">
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
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTeams.map((team, i) => {
            const matchScore = calculateMatchScore(team.skills || []);
            
            return (
              <Link
                key={team.id}
                href={`/teams/${team.id}`}
                className={`card p-5 group animate-fade-in-up stagger-${
                  Math.min(i % 6, 6) + 1
                }`}
              >
                {/* Top - Name & Status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-white group-hover:text-white truncate">
                    {team.name}
                  </h2>

                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="badge badge-success text-[10px] py-0.5 px-1.5">
                      Recruiting
                    </span>

                    <span
                      className={`badge text-[10px] py-0.5 px-1.5 ${
                        matchScore >= 80
                          ? "badge-success"
                          : matchScore >= 50
                          ? "badge-primary"
                          : ""
                      }`}
                    >
                      {matchScore}% Match
                    </span>
                  </div>
                </div>

                {/* Description */}
                <p className="text-zinc-400 text-xs leading-relaxed mb-4 line-clamp-2 min-h-[32px]">
                  {team.description || "No description provided."}
                </p>

                {/* Skills */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {team.skills?.length ? (
                    team.skills.slice(0, 3).map((skill) => (
                      <span key={skill} className="badge text-[10px] py-0.5 px-1.5">
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="badge text-[10px] text-zinc-600">
                      No Skills Listed
                    </span>
                  )}
                  {team.skills && team.skills.length > 3 && (
                    <span className="badge text-[10px] py-0.5 px-1.5">
                      +{team.skills.length - 3}
                    </span>
                  )}
                </div>

                {/* Meta Info */}
                <div className="space-y-2 mb-5 text-xs border-t border-zinc-900 pt-3">
                  <div className="flex items-center gap-2 text-zinc-500">
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
                        d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.485a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"
                      />
                    </svg>
                    <span className="truncate">{team.college || "Unknown College"}</span>
                  </div>

                  <div className="flex items-center gap-2 text-zinc-500">
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
                        d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.5 18h1.5m4.5-13.764c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.5 18h-1.5"
                      />
                    </svg>
                    <span className="truncate">{team.hackathon_name || "No Hackathon Listed"}</span>
                  </div>
                </div>

                {/* CTA */}
                <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80">
                  <span className="text-[11px] text-zinc-500">Team Profile</span>

                  <div className="flex items-center gap-1 text-[11px] font-medium text-zinc-300 group-hover:text-white transition-colors">
                    <span>View Profile</span>
                    <svg
                      className="w-3 h-3 group-hover:translate-x-0.5 transition-transform"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                      />
                    </svg>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
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
