"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";

type Team = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
};

function TeamCard({ team, index, isLeader }: { team: Team; index: number; isLeader: boolean }) {
  return (
    <Link
      href={`/teams/${team.id}`}
      className={`card p-5 group animate-fade-in-up stagger-${
        Math.min(index % 6, 6) + 1
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-white group-hover:text-white truncate">
          {team.name}
        </h2>

        <span className={`badge ${isLeader ? "badge-primary" : "badge-success"} text-[10px] py-0.5 px-1.5 flex-shrink-0`}>
          {isLeader ? "Leader" : "Member"}
        </span>
      </div>

      <p className="text-zinc-400 text-xs leading-relaxed mb-4 line-clamp-2 min-h-[32px]">
        {team.description || "No description provided."}
      </p>

      <div className="flex items-center justify-between pt-3 border-t border-zinc-900">
        <span className="text-[11px] text-zinc-500">Team Workspace</span>

        <div className="flex items-center gap-1 text-[11px] font-medium text-zinc-300 group-hover:text-white transition-colors">
          <span>Open Workspace</span>
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
}

function MyTeamsContent() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMyTeams() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setCurrentUserId(user.id);

    const { data, error } = await supabase
      .from("team_members")
      .select(
        `
        teams (
          id,
          name,
          description,
          owner_id
        )
      `
      )
      .eq("user_id", user.id);

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const formattedTeams = (data as unknown as { teams: Team }[])?.map((item) => item.teams) || [];

    setTeams(formattedTeams);
    setLoading(false);
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      loadMyTeams();
    });
  }, []);

  const ownedTeams = teams.filter((t) => t.owner_id === currentUserId);
  const memberTeams = teams.filter((t) => t.owner_id !== currentUserId);

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading workspace...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
      {/* Hero */}
      <section className="mb-8 animate-fade-in-up">
        <p className="section-label">TEAM WORKSPACE</p>

        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
          My teams
        </h1>

        <p className="text-sm text-zinc-400 max-w-xl leading-relaxed">
          Manage your active collaborations, track projects, and keep building.
        </p>
      </section>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="card card-static p-4 animate-fade-in-up stagger-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
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
                  d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z"
                />
              </svg>
            </div>
            <div>
              <p className="text-zinc-500 text-[10px] font-mono uppercase mb-0.5">
                ACTIVE TEAMS
              </p>
              <h2 className="text-lg font-semibold text-white">{teams.length}</h2>
            </div>
          </div>
        </div>

        <div className="card card-static p-4 animate-fade-in-up stagger-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
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
                  d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                />
              </svg>
            </div>
            <div>
              <p className="text-zinc-500 text-[10px] font-mono uppercase mb-0.5">
                STATUS
              </p>
              <h2 className="text-lg font-semibold text-white">Building</h2>
            </div>
          </div>
        </div>

        <div className="card card-static p-4 animate-fade-in-up stagger-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-emerald-400">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
            <div>
              <p className="text-zinc-500 text-[10px] font-mono uppercase mb-0.5">
                NETWORK
              </p>
              <h2 className="text-lg font-semibold text-white">Active</h2>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2.5 mb-8 animate-fade-in-up stagger-4">
        <Link href="/teams" className="btn btn-secondary">
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
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          Explore Teams
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

      {/* Empty State */}
      {teams.length === 0 ? (
        <div className="card card-static p-12 text-center animate-fade-in-up stagger-5">
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
                d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z"
              />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-white mb-1.5">
            No teams yet
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-4">
            Join a team or create your own to start collaborating.
          </p>
          <Link href="/teams" className="btn btn-primary btn-sm">
            Explore Teams
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Teams You Lead */}
          {ownedTeams.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4 animate-fade-in-up stagger-5">
                <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499c-.107-.16-.307-.25-.514-.25s-.407.091-.514.25L3.5 16.19c-.113.168-.118.388-.013.562.106.173.29.28.497.28h13.25c.207 0 .39-.107.497-.28.105-.174.1-.394-.013-.562L11.48 3.5z" />
                </svg>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">Teams You Lead</h2>
                <span className="w-5 h-5 rounded-full bg-violet-600/10 border border-violet-500/20 text-violet-400 text-[10px] flex items-center justify-center font-mono font-bold">{ownedTeams.length}</span>
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {ownedTeams.map((team, i) => (
                  <TeamCard key={team.id} team={team} index={i} isLeader={true} />
                ))}
              </div>
            </div>
          )}

          {/* Teams You've Joined */}
          {memberTeams.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4 animate-fade-in-up stagger-6">
                <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.115a8.312 8.312 0 01-.115 1.342m0 0A8.284 8.284 0 027.747 18.25m8.312 2.22c.28-.654.443-1.373.443-2.128v-.079c0-1.428-.433-2.755-1.173-3.856M7.747 18.25a8.284 8.284 0 01-.115-1.342v-.003c0-1.43.433-2.758 1.173-3.859M7.747 18.25V18a8.312 8.312 0 01.115-1.342m0 0A8.284 8.284 0 0012 15.75m0 0c.928 0 1.815.153 2.642.435" />
                </svg>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">Teams You&apos;ve Joined</h2>
                <span className="w-5 h-5 rounded-full bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 text-[10px] flex items-center justify-center font-mono font-bold">{memberTeams.length}</span>
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {memberTeams.map((team, i) => (
                  <TeamCard key={team.id} team={team} index={i} isLeader={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default function MyTeamsPage() {
  return (
    <AuthGuard>
      <MyTeamsContent />
    </AuthGuard>
  );
}