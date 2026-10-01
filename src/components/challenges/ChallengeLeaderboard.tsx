"use client";

import React, { useState, useEffect } from "react";
import { Trophy } from "lucide-react";
import { EmptyState, Section, Segmented, SkeletonRows, Tape } from "@/components/system";
import { cn } from "@/lib/utils";

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
  title = "Top decks",
  subtitle = "Highest-scoring decks from the AI review.",
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
        } else {
          console.error("Failed to load leaderboard: HTTP", res.status);
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
    <Section
      title={title}
      count="Top 10"
      description={subtitle}
      action={
        <Segmented
          label="Submission type"
          size="sm"
          value={modeFilter}
          onChange={setModeFilter}
          options={[
            { value: "all", label: "All" },
            { value: "solo", label: "Solo" },
            { value: "team", label: "Teams" },
          ]}
        />
      }
    >
      {loading ? (
        <SkeletonRows rows={4} avatar="none" />
      ) : entries.length === 0 ? (
        <EmptyState
          compact
          icon={<Trophy />}
          title="No ranked decks yet"
          body="Submit a 6-slide deck and score 80+ to take the top spot this week."
        />
      ) : (
        <ol className="divide-y divide-line border-y border-line">
          {entries.map((entry, idx) => {
            const rank = idx + 1;
            return (
              <li key={entry.id} className="flex items-center gap-3 py-3">
                <span
                  className={cn(
                    "w-8 shrink-0 font-mono text-[12.5px] tabular",
                    rank <= 3 ? "font-semibold text-ink" : "text-ink-3",
                  )}
                >
                  #{rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{entry.participantName}</span>
                    <Tape tone={entry.submissionMode === "team" ? "info" : "neutral"}>
                      {entry.submissionMode === "team" ? "Team" : "Solo"}
                    </Tape>
                  </div>
                  <p className="mt-0.5 truncate text-[12.5px] text-ink-3">
                    #{entry.challengeNumber} · {entry.challengeTitle}
                  </p>
                </div>
                <div className="hidden shrink-0 items-center gap-3 font-mono text-[12.5px] text-ink-3 tabular md:flex">
                  <span>Arch {entry.scores.architecture}/30</span>
                  <span>Problem {entry.scores.problem}/25</span>
                </div>
                <div className="w-16 shrink-0 text-right">
                  <div className="font-display text-[18px] font-semibold leading-none text-ink tabular">
                    {entry.totalScore}
                    <span className="text-[12px] font-normal text-ink-3">/100</span>
                  </div>
                  <div className="mt-1 font-mono text-[12px] text-ink-3">{entry.grade}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

