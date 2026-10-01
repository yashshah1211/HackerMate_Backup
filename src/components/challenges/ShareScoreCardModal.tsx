"use client";

import React, { useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle, ShieldCheck } from "lucide-react";
import { Button, Dialog, LinkedinIcon, Tape, buttonClass } from "@/components/system";

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

  const shareText = `🚀 Just scored ${totalScore}/100 (${grade}) on HackerMate Practice Challenge #${challengeNumber}: "${challengeTitle}"!\n\nVerified by Multi-Model AI Jury: Technical Architecture (${scores.architecture}/30) • Problem Framing (${scores.problem}/25).\n\nPractice your hackathon pitch decks here:`;

  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      // Fallback
      console.error("[ShareScoreCard] Clipboard copy failed:", err);
    }
  };

  const rubric = [
    { label: "Architecture", value: scores.architecture, max: 30 },
    { label: "Problem framing", value: scores.problem, max: 25 },
    { label: "Solution moat", value: scores.solution, max: 25 },
    { label: "Feasibility & ROI", value: scores.feasibility, max: 20 },
  ];

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Share your score"
      description="Post the result or copy the link."
    >
      <div className="space-y-4">
        {/* Card preview */}
        <div className="rounded-lg border border-line bg-raised p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="caps-label text-ink-3">HackerMate practice</span>
            <span className="font-mono text-[12.5px] text-ink-3 tabular">#{challengeNumber}</span>
          </div>
          <p className="mt-2 truncate text-[14px] font-semibold text-ink">{challengeTitle}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            {participantName} · {submissionMode === "team" ? "Team" : "Solo"}
          </p>

          <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-3">
            <div>
              <div className="caps-label text-ink-3">Total score</div>
              <div className="mt-1 font-display text-[36px] font-semibold leading-none tracking-[-0.03em] text-ink tabular">
                {totalScore}
                <span className="text-[16px] text-ink-3">/100</span>
              </div>
            </div>
            <Tape tone="accent">{grade}</Tape>
          </div>

          <ul className="mt-4 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {rubric.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-2 text-[12.5px] text-ink-2">
                <span className="truncate">{r.label}</span>
                <span className="font-mono text-[12.5px] text-ink-3 tabular">
                  {r.value}/{r.max}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between border-t border-line pt-3 font-mono text-[12px] text-ink-3">
            <span className="inline-flex items-center gap-1 text-ok">
              <ShieldCheck className="size-3.5" aria-hidden />
              Scored by AI review
            </span>
            <span>hackermate.in</span>
          </div>
        </div>

        {/* Share targets */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <a href={linkedinUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md", "w-full")}>
            <LinkedinIcon className="size-4" />
            LinkedIn
          </a>
          <a href={twitterUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md", "w-full")}>
            X
            <ExternalLink />
          </a>
          <a href={whatsappUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md", "w-full")}>
            <MessageCircle />
            WhatsApp
          </a>
        </div>

        <Button
          variant="primary"
          className="w-full"
          onClick={handleCopy}
          icon={copied ? <Check /> : <Copy />}
        >
          {copied ? "Copied" : "Copy post and link"}
        </Button>
      </div>
    </Dialog>
  );
}

