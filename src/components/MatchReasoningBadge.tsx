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
      className={`mt-2.5 p-2 rounded-lg bg-indigo-500/5 border border-indigo-500/10 text-zinc-300 text-[11px] leading-relaxed flex items-start gap-1.5 ${className}`}
    >
      <span className="text-indigo-400 shrink-0 text-xs mt-0.5 select-none">✨</span>
      <span className="font-normal text-zinc-300/90">{reasoningText}</span>
    </div>
  );
}
