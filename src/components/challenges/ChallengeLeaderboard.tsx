"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Trophy, Medal, Users, User, ArrowUpRight, Sparkles, RefreshCw, Zap } from "lucide-react";

interface LeaderboardEntry {
  id: string;
  rank: number;
  participantName: string;
  avatarUrl?: string | null;
  submissionMode: "solo" | "team";
  challengeNumber: number;
  challengeTitle: string;
  challengeSlug: string;
  totalScore: number;
  grade: string;
  scores: {
    problem: number;
    solution: number;
    architecture: number;
    feasibility: number;
  };
  createdAt: string;
}

export function ChallengeLeaderboard({
  challengeSlug,
  title = "🏆 Weekly Hall of Fame & Top Decks",
  subtitle = "The highest-scoring architecture and pitch decks evaluated by our AI Jury.",
}: {
  challengeSlug?: string;
  title?: string;
  subtitle?: string;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modeFilter, setModeFilter] = useState<"all" | "solo" | "team">("all");

  useEffect(() => {
    async function loadLeaderboard() {
      setLoading(true);
      try {
        const url = challengeSlug
          ? `/api/challenges/leaderboard?slug=${challengeSlug}&mode=${modeFilter}`
          : `/api/challenges/leaderboard?mode=${modeFilter}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setEntries(data.leaderboard || []);
        }
      } catch (err) {
        console.error("Failed to load leaderboard:", err);
      } finally {
        setLoading(false);
      }
    }
    loadLeaderboard();
  }, [challengeSlug, modeFilter]);

  return (
    <div className="card p-6 sm:p-8 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 font-bold">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <span>{title}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono font-bold">
                Top 10
              </span>
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{subtitle}</p>
          </div>
        </div>

        {/* Filter Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shrink-0">
          <button
            type="button"
            onClick={() => setModeFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              modeFilter === "all"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setModeFilter("solo")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
              modeFilter === "solo"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            <User className="w-3 h-3" />
            <span>Solo</span>
          </button>
          <button
            type="button"
            onClick={() => setModeFilter("team")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
              modeFilter === "team"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            <Users className="w-3 h-3" />
            <span>Teams</span>
          </button>
        </div>
      </div>

      {/* Leaderboard Table / Rows */}
      <div className="mt-5">
        {loading ? (
          <div className="py-12 text-center">
            <RefreshCw className="w-6 h-6 text-lime-500 animate-spin mx-auto mb-2" />
            <p className="text-xs text-zinc-500 font-mono">Loading Leaderboard Rankings...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 p-6">
            <Sparkles className="w-8 h-8 text-lime-500 mx-auto mb-2 opacity-60" />
            <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Be the First on the Leaderboard!</h4>
            <p className="text-[11px] text-zinc-500 max-w-sm mx-auto mt-1">
              Submit your 6-slide architecture presentation deck and score 80+ to claim the #1 rank of the week.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {entries.map((entry, idx) => {
              const rank = idx + 1;
              const isGold = rank === 1;
              const isSilver = rank === 2;
              const isBronze = rank === 3;

              return (
                <div
                  key={entry.id}
                  className={`p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                    isGold
                      ? "bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/40 shadow-xs"
                      : isSilver
                      ? "bg-zinc-50 dark:bg-zinc-900/60 border-zinc-300 dark:border-zinc-700"
                      : isBronze
                      ? "bg-zinc-50 dark:bg-zinc-900/60 border-amber-800/30"
                      : "bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/80"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Rank Badge */}
                    <div
                      className={`w-8 h-8 rounded-xl font-bold font-mono text-xs flex items-center justify-center shrink-0 ${
                        isGold
                          ? "bg-amber-500 text-black shadow-md shadow-amber-500/30"
                          : isSilver
                          ? "bg-zinc-300 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                          : isBronze
                          ? "bg-amber-700/60 text-amber-200"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {isGold ? "🥇" : isSilver ? "🥈" : isBronze ? "🥉" : `#${rank}`}
                    </div>

                    {/* Participant Details */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white truncate">
                          {entry.participantName}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.2 rounded-full border ${
                            entry.submissionMode === "team"
                              ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/30"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
                          }`}
                        >
                          {entry.submissionMode === "team" ? "👥 Team Squad" : "👤 Solo"}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate flex items-center gap-1.5">
                        <span>Challenge #{entry.challengeNumber}: {entry.challengeTitle}</span>
                      </div>
                    </div>
                  </div>

                  {/* Score & Pillar Highlights */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-200 dark:border-zinc-800/80">
                    <div className="hidden md:flex items-center gap-2 text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                      <span>Arch: <strong className="text-lime-600 dark:text-lime-400">{entry.scores.architecture}/30</strong></span>
                      <span>•</span>
                      <span>Problem: <strong>{entry.scores.problem}/25</strong></span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="text-right">
                        <div className="text-base sm:text-lg font-extrabold font-mono text-lime-600 dark:text-lime-400 leading-tight">
                          {entry.totalScore}<span className="text-[11px] text-zinc-500 font-normal">/100</span>
                        </div>
                        <div className="text-[10px] font-semibold text-zinc-500 font-mono">{entry.grade}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
