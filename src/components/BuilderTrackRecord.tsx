"use client";

import { useState } from "react";
import Link from "next/link";
import VerifiedBuilderBadge from "@/components/VerifiedBuilderBadge";

type Teammate = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
};

type Registration = {
  registration_id: string;
  hackathon_id: string;
  hackathon_name: string;
  mode: string | null;
  location: string | null;
  prize_pool: string | null;
  start_date: string | null;
  end_date: string | null;
  website_url: string | null;
  registration_status: string;
  looking_for_team: boolean;
  registered_at: string;
};

type Team = {
  team_id: string;
  team_name: string;
  description: string | null;
  user_role: string;
  joined_at: string;
  team_hackathons: string[];
  teammates: Teammate[];
};

type Submission = {
  team_id: string;
  hackathon_id: string;
  project_title: string;
  demo_url?: string | null;
  github_url?: string | null;
  pitch_video_url?: string | null;
  slides_url?: string | null;
  completion_status: string;
  submitted_at: string;
};

export type TrackRecordData = {
  profile: {
    id: string;
    username?: string | null;
    full_name: string | null;
    college: string | null;
    bio: string | null;
    avatar_url: string | null;
    skills: string[] | null;
    github_url: string | null;
    linkedin_url: string | null;
    created_at: string;
    show_track_record: boolean;
  };
  registrations?: Registration[];
  teams?: Team[];
  submissions?: Submission[];
};

type Props = {
  data: TrackRecordData;
  isOwner?: boolean;
};

export default function BuilderTrackRecord({ data, isOwner = false }: Props) {
  const { profile, registrations = [], teams = [], submissions = [] } = data;
  const [filter, setFilter] = useState<"all" | "submitted" | "teams">("all");

  if (!profile.show_track_record && !isOwner) {
    return (
      <div className="card p-8 text-center space-y-3 bg-[var(--surface-1)] border-[var(--card-border)] text-zinc-400">
        <div className="w-12 h-12 rounded-full bg-zinc-800/60 border border-zinc-700 flex items-center justify-center mx-auto text-xl">
          🔒
        </div>
        <h4 className="text-sm font-bold text-white">Private Track Record</h4>
        <p className="text-xs text-zinc-500 max-w-sm mx-auto">
          This builder has set their hackathon track record to private.
        </p>
      </div>
    );
  }

  // Map submissions by (team_id + hackathon_id) or team_id
  const submissionMap = new Map<string, Submission>();
  submissions.forEach((sub) => {
    submissionMap.set(`${sub.team_id}_${sub.hackathon_id}`, sub);
    submissionMap.set(sub.team_id, sub);
  });

  // Unique hackathons count
  const totalHackathons = registrations.length;
  const totalTeams = teams.length;
  const totalSubmissions = submissions.length;

  return (
    <div className="space-y-6 text-left">
      {/* Header & Stats Banner */}
      <div className="p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--card-border)] space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] pb-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-mono font-bold uppercase tracking-wider">
              <span>⚡ Verified Builder Track Record</span>
            </div>
            <h3 className="text-base font-bold text-[var(--foreground)] mt-1">
              Hackathon History &amp; Submissions
            </h3>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-zinc-900/60 p-1 rounded-xl border border-zinc-800 text-[11px] font-medium">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                filter === "all" ? "bg-indigo-600 text-white font-bold" : "text-zinc-400 hover:text-white"
              }`}
            >
              All Events ({totalHackathons})
            </button>
            <button
              onClick={() => setFilter("submitted")}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                filter === "submitted" ? "bg-indigo-600 text-white font-bold" : "text-zinc-400 hover:text-white"
              }`}
            >
              Projects ({totalSubmissions})
            </button>
          </div>
        </div>

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-3 gap-3 font-mono text-center">
          <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
            <span className="text-[10px] text-zinc-500 uppercase block">Hackathons</span>
            <span className="text-lg font-black text-indigo-400">{totalHackathons}</span>
          </div>
          <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
            <span className="text-[10px] text-zinc-500 uppercase block">Teams Joined</span>
            <span className="text-lg font-black text-sky-400">{totalTeams}</span>
          </div>
          <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
            <span className="text-[10px] text-zinc-500 uppercase block">Projects Delivered</span>
            <span className="text-lg font-black text-emerald-400">{totalSubmissions}</span>
          </div>
        </div>
      </div>

      {/* Timeline List */}
      {registrations.length === 0 ? (
        <div className="p-10 rounded-2xl bg-[var(--surface-1)] border border-[var(--card-border)] text-center text-xs text-zinc-500 font-mono">
          No hackathon participation records available yet.
        </div>
      ) : (
        <div className="relative pl-4 sm:pl-6 border-l-2 border-indigo-500/20 space-y-6">
          {registrations.map((reg) => {
            // Find teams for this hackathon
            const matchingTeams = teams.filter(
              (t) => t.team_hackathons.includes(reg.hackathon_id) || t.team_hackathons.length === 0
            );

            const submission = matchingTeams.length > 0
              ? submissionMap.get(`${matchingTeams[0].team_id}_${reg.hackathon_id}`) || submissionMap.get(matchingTeams[0].team_id)
              : undefined;

            if (filter === "submitted" && !submission) return null;

            return (
              <div key={reg.registration_id} className="relative group">
                {/* Timeline node icon */}
                <div className="absolute -left-[23px] sm:-left-[31px] top-1.5 w-4 h-4 rounded-full bg-indigo-600 border-4 border-zinc-950 shadow-md group-hover:scale-125 transition-transform" />

                {/* Event Card */}
                <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--card-border)] space-y-3 hover:border-indigo-500/40 transition-colors shadow-xs">
                  {/* Top Line */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--card-border)] pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/hackathons/${reg.hackathon_id}`}
                          className="text-sm font-bold text-[var(--foreground)] hover:text-indigo-400 transition-colors"
                        >
                          {reg.hackathon_name}
                        </Link>
                        {reg.mode && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 uppercase">
                            {reg.mode}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        Registered {new Date(reg.registered_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                      </p>
                    </div>

                    {/* Submission status pill */}
                    {submission ? (
                      <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Project Delivered</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Participated
                      </span>
                    )}
                  </div>

                  {/* Team & Teammates Roster */}
                  {matchingTeams.length > 0 && (
                    <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                          <span>👥 Team:</span>
                          <Link
                            href={`/teams/${matchingTeams[0].team_id}`}
                            className="text-indigo-400 font-bold hover:underline"
                          >
                            {matchingTeams[0].team_name}
                          </Link>
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400 uppercase">
                          Role: {matchingTeams[0].user_role}
                        </span>
                      </div>

                      {/* Teammates Avatar Strip */}
                      {matchingTeams[0].teammates?.length > 0 && (
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[10px] text-zinc-500 font-mono">Teammates:</span>
                          <div className="flex items-center -space-x-2">
                            {matchingTeams[0].teammates.slice(0, 5).map((m) => (
                              <div key={m.user_id} title={m.full_name || "Teammate"}>
                                {m.avatar_url ? (
                                  <img
                                    src={m.avatar_url}
                                    alt={m.full_name || "Teammate"}
                                    className="w-6 h-6 rounded-full object-cover border-2 border-zinc-900"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 font-bold text-[9px] flex items-center justify-center border-2 border-zinc-900">
                                    {m.full_name?.charAt(0) || "U"}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Submitted Project Showcase Card */}
                  {submission && (
                    <div className="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 space-y-2 text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-wider">
                          🚀 Project Submission
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(submission.submitted_at).toLocaleDateString("en-IN")}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-white">{submission.project_title}</h4>

                      {/* Project Links */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {submission.demo_url && (
                          <a
                            href={submission.demo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>Live Demo ↗</span>
                          </a>
                        )}
                        {submission.github_url && (
                          <a
                            href={submission.github_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>Code Repo ↗</span>
                          </a>
                        )}
                        {submission.slides_url && (
                          <a
                            href={submission.slides_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>Pitch Deck ↗</span>
                          </a>
                        )}
                      </div>
                    </div>
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
