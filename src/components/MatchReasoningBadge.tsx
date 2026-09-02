"use client";

import React from "react";
import { generateMatchReasoning, ProfileMatchData } from "@/lib/matchReasoning";

interface MatchReasoningBadgeProps {
  userA?: ProfileMatchData | null;
  userB: ProfileMatchData;
  className?: string;
  isSelfViewer?: boolean;
  matchScore?: number;
  minThreshold?: number;
}

export default function MatchReasoningBadge({
  userA,
  userB,
  className = "",
  isSelfViewer = true,
  matchScore,
  minThreshold = 50,
}: MatchReasoningBadgeProps) {
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
