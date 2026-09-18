"use client";

import React from "react";
import {
  Lock,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  X,
  FileText,
  UploadCloud,
  HelpCircle,
} from "lucide-react";

interface PresentationErrorAlertProps {
  error: string | null;
  onDismiss?: () => void;
  targetUrl?: string;
  onSwitchToUpload?: () => void;
  className?: string;
}

export default function PresentationErrorAlert({
  error,
  onDismiss,
  targetUrl,
  onSwitchToUpload,
  className = "",
}: PresentationErrorAlertProps) {
  if (!error) return null;

  // 1. Detect if this is a Google Link sharing / permission restriction error
  const isPermissionError =
    error.toLowerCase().includes("verify link sharing") ||
    error.toLowerCase().includes("could not access presentation") ||
    error.toLowerCase().includes("permissions") ||
    error.toLowerCase().includes("permission") ||
    error.toLowerCase().includes("access denied") ||
    error.toLowerCase().includes("sign in") ||
    error.toLowerCase().includes("anyone with the link");

  // 2. Extract URL if embedded in error text (e.g., "Could not access presentation at https://...")
  let detectedUrl = targetUrl;
  if (!detectedUrl) {
    const urlMatch = error.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      detectedUrl = urlMatch[0].replace(/[.,;:)]+$/, "");
    }
  }

  // If it's a link sharing permission error, render the dedicated structured guide
  if (isPermissionError) {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl border border-rose-500/40 dark:border-rose-500/30 bg-gradient-to-b from-rose-950/40 via-zinc-950/90 to-zinc-950 p-4 sm:p-5 shadow-xl shadow-rose-950/20 text-zinc-100 ${className} animate-in fade-in duration-200`}
      >
        {/* Subtle accent glow */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500 opacity-80" />

        {/* Header Row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-white tracking-tight">
                  Presentation Link Is Private
                </h4>
                <span className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  Access Denied
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                The AI evaluation engine cannot read this Google Slides deck until public view permissions are enabled.
              </p>
            </div>
          </div>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss error"
              className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Detected URL Chip & Direct Open Button */}
        {detectedUrl && (
          <div className="my-3 p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800/80 flex items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-mono text-zinc-300 truncate text-[11px]">
                {detectedUrl}
              </span>
            </div>
            <a
              href={detectedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-[11px] shrink-0 transition shadow-xs cursor-pointer"
            >
              <span>Open in Drive</span>
              <ExternalLink className="w-3 h-3 text-zinc-400" />
            </a>
          </div>
        )}

        {/* 3-Step Visual Resolution Guide */}
        <div className="mt-3.5 pt-3 border-t border-zinc-800/80">
          <div className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider font-mono mb-2 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-lime-400" />
            <span>How to unlock access in 10 seconds:</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/60 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-300 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                1
              </span>
              <span className="text-[11px] text-zinc-300 leading-snug">
                Click <strong className="text-white">Share</strong> in the top-right of your Google Slides / Drive deck.
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/60 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                2
              </span>
              <span className="text-[11px] text-zinc-300 leading-snug">
                Under General Access, switch to <strong className="text-white">&ldquo;Anyone with the link&rdquo;</strong>.
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/60 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                3
              </span>
              <span className="text-[11px] text-zinc-300 leading-snug">
                Ensure role is <strong className="text-white">&ldquo;Viewer&rdquo;</strong>, click <strong className="text-white">Done</strong>, then click submit again!
              </span>
            </div>
          </div>
        </div>

        {/* Alternative Action: Switch to PDF Upload if Restricted by College/Org */}
        {onSwitchToUpload && (
          <div className="mt-3 pt-2.5 flex items-center justify-between gap-3 text-xs border-t border-zinc-900">
            <span className="text-[11px] text-zinc-400">
              Is your college/work Google account blocking public link sharing?
            </span>
            <button
              type="button"
              onClick={onSwitchToUpload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-500/15 hover:bg-lime-500/25 border border-lime-500/30 text-lime-400 font-semibold text-xs transition cursor-pointer shrink-0"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Upload PDF File Instead →</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Fallback for standard system/network errors (e.g. rate limit, file size, quota, network timeout)
  return (
    <div
      className={`rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 sm:p-4 text-rose-600 dark:text-rose-400 text-xs shadow-sm flex items-start justify-between gap-3 ${className} animate-in fade-in duration-200`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
        <div>
          <h5 className="font-bold text-rose-700 dark:text-rose-300 text-xs mb-0.5">
            Submission Evaluation Alert
          </h5>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed text-[11px]">
            {error}
          </p>
        </div>
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
