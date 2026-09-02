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
      className={`mt-2.5 p-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40 text-[11px] leading-relaxed flex items-start gap-1.5 ${className}`}
    >
      <span className="text-zinc-400 shrink-0 text-xs mt-0.5 select-none">✨</span>
      <span className="font-medium text-zinc-300">{reasoningText}</span>
    </div>
  );
}
