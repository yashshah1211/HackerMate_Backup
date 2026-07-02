"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Team = {
  id: string;
  name: string;
  description: string;
};

import AuthGuard from "@/components/AuthGuard";

function MyTeamsContent() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadMyTeams() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("team_members")
      .select(
        `
        teams (
          id,
          name,
          description
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
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {teams.map((team, i) => (
            <Link
              key={team.id}
              href={`/teams/${team.id}`}
              className={`card p-5 group animate-fade-in-up stagger-${
                Math.min(i % 6, 6) + 1
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h2 className="text-sm font-semibold text-white group-hover:text-white truncate">
                  {team.name}
                </h2>

                <span className="badge badge-success text-[10px] py-0.5 px-1.5 flex-shrink-0">
                  Active
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
          ))}
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