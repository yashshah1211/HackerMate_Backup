"use client";

import React from "react";
import { generateMatchReasoning, ProfileMatchData } from "@/lib/matchReasoning";
import { Zap, Lightbulb } from "lucide-react";

interface MatchReasoningBadgeProps {
  userA?: ProfileMatchData | null;
  userB: ProfileMatchData;
  className?: string;
  isSelfViewer?: boolean;
  matchScore?: number;
  minThreshold?: number;
  reasons?: string[] | null;
  confidence?: number | null;
}

export default function MatchReasoningBadge({
  userA,
  userB,
  className = "",
  isSelfViewer = true,
  matchScore,
  minThreshold = 50,
  reasons,
  confidence,
}: MatchReasoningBadgeProps) {
  // If server-provided authoritative reasons exist, prefer them
  if (reasons && reasons.length > 0) {
    const isDiscovery = reasons.some((r) => r.toLowerCase().includes("discovery suggestion"));
    return (
      <div
        className={`mt-2.5 p-2.5 rounded-xl border text-[11px] leading-relaxed shadow-2xs ${
          isDiscovery
            ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
            : "bg-zinc-100/90 dark:bg-zinc-900/60 border-zinc-200/90 dark:border-zinc-800/80 text-zinc-700 dark:text-zinc-300"
        } ${className}`}
      >
        <div className="flex items-start gap-1.5">
          {isDiscovery ? (
            <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          ) : (
            <Zap className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
          )}
          <div className="flex flex-col gap-0.5">
            {reasons.slice(0, 2).map((r, i) => (
              <span key={i} className="font-medium">
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const reasoningText = generateMatchReasoning(userA, userB, isSelfViewer, matchScore, minThreshold);

  if (!reasoningText) return null;

  return (
    <div
      className={`mt-2.5 p-2.5 rounded-xl bg-zinc-100/90 dark:bg-zinc-900/60 border border-zinc-200/90 dark:border-zinc-800/80 text-[11px] leading-relaxed shadow-2xs ${className}`}
    >
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{reasoningText}</span>
    </div>
  );
}
