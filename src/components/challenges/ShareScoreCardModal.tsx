"use client";

import React, { useState } from "react";
import {
  X,
  Share2,
  Check,
  Copy,
  ExternalLink,
  MessageCircle,
  Trophy,
  ShieldCheck,
  Layers,
} from "lucide-react";

interface ShareScoreCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  challengeTitle: string;
  challengeNumber: number;
  totalScore: number;
  grade: string;
  scores: {
    problem: number;
    solution: number;
    architecture: number;
    feasibility: number;
  };
  participantName: string;
  submissionMode: "solo" | "team";
  shareUrl: string;
}

export function ShareScoreCardModal({
  isOpen,
  onClose,
  challengeTitle,
  challengeNumber,
  totalScore,
  grade,
  scores,
  participantName,
  submissionMode,
  shareUrl,
}: ShareScoreCardModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const shareText = `🚀 Just scored ${totalScore}/100 (${grade}) on HackerMate Practice Challenge #${challengeNumber}: "${challengeTitle}"!\n\nVerified by Multi-Model AI Jury: Technical Architecture (${scores.architecture}/30) • Problem Framing (${scores.problem}/25).\n\nPractice your hackathon pitch decks here:`;

  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-md rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden animate-teams-pop">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Trophy className="w-4 h-4 text-lime-400" />
            <span>Share Achievement & Score</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Graphic Preview Card */}
        <div className="p-5 space-y-4">
          {/* Aesthetic Card Preview */}
          <div className="relative p-5 rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 border border-lime-500/40 shadow-xl shadow-lime-500/10 overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-lime-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-lime-400 font-bold">
                <Trophy className="w-3.5 h-3.5" />
                <span>HACKERMATE PRACTICE DECK</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                #{challengeNumber}
              </span>
            </div>

            <h4 className="text-sm font-bold text-white line-clamp-1 mb-1">
              {challengeTitle}
            </h4>
            <p className="text-[11px] text-zinc-400 mb-4">
              Submitted by <span className="text-zinc-200 font-semibold">{participantName}</span> ({submissionMode === "team" ? "Team Squad" : "Solo Builder"})
            </p>

            {/* Big Neon Score Highlight */}
            <div className="flex items-end justify-between p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 mb-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Total Score</span>
                <div className="text-3xl font-extrabold text-lime-400 font-mono tracking-tight flex items-baseline gap-1">
                  <span>{totalScore}</span>
                  <span className="text-xs text-zinc-500 font-normal">/100</span>
                </div>
              </div>
              <div className="text-right">
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-lime-500/15 text-lime-400 border border-lime-500/30 font-mono">
                  {grade}
                </span>
              </div>
            </div>

            {/* Rubric Breakdown Grid */}
            <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400 font-mono pt-1">
              <div className="flex items-center justify-between p-1.5 rounded bg-zinc-900/60 border border-zinc-800/80">
                <span>Architecture</span>
                <span className="text-lime-400 font-bold">{scores.architecture}/30</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded bg-zinc-900/60 border border-zinc-800/80">
                <span>Problem Framing</span>
                <span className="text-zinc-200 font-bold">{scores.problem}/25</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded bg-zinc-900/60 border border-zinc-800/80">
                <span>Solution Moat</span>
                <span className="text-zinc-200 font-bold">{scores.solution}/25</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded bg-zinc-900/60 border border-zinc-800/80">
                <span>Feasibility & ROI</span>
                <span className="text-zinc-200 font-bold">{scores.feasibility}/20</span>
              </div>
            </div>

            {/* Verified Badge */}
            <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
              <div className="flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verified by AI Jury</span>
              </div>
              <span>hackermate.in</span>
            </div>
          </div>

          {/* Social Share Buttons */}
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-3 gap-2">
              {/* LinkedIn */}
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 rounded-xl bg-[#0A66C2] hover:bg-[#084e96] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs"
              >
                <span>LinkedIn</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              {/* X / Twitter */}
              <a
                href={twitterUrl}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs"
              >
                <span>X / Tweet</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              {/* WhatsApp */}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 rounded-xl bg-[#25D366] hover:bg-[#1fa951] text-black font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
            </div>

            {/* Copy Shareable Link / Text Button */}
            <button
              type="button"
              onClick={handleCopy}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 hover:text-white font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-lime-400" />
                  <span className="text-lime-400">Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Formatted Post & Score Link</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
