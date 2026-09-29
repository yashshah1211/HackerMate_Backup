"use client";

import React from "react";
import { Lock, ExternalLink, TriangleAlert, X, FileText, UploadCloud } from "lucide-react";
import { Button, buttonClass } from "@/components/system";
import { cn } from "@/lib/utils";

interface PresentationErrorAlertProps {
  error: string | null;
  onDismiss?: () => void;
  targetUrl?: string;
  onSwitchToUpload?: () => void;
  className?: string;
}

function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Dismiss error"
      className="-m-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink md:size-7"
    >
      <X className="size-4" />
    </button>
  );
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
    const steps: React.ReactNode[] = [
      <>
        Click <strong className="font-semibold text-ink">Share</strong> in the top-right of your Google Slides or Drive deck.
      </>,
      <>
        Under General access, switch to <strong className="font-semibold text-ink">&ldquo;Anyone with the link&rdquo;</strong>.
      </>,
      <>
        Keep the role as <strong className="font-semibold text-ink">&ldquo;Viewer&rdquo;</strong>, click <strong className="font-semibold text-ink">Done</strong>, then submit again.
      </>,
    ];

    return (
      <div role="alert" className={cn("rounded-lg bg-bad-soft p-4 ring-1 ring-inset ring-bad/25", className)}>
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-ink">This deck is private</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
              The reviewer can&apos;t open this Google Slides deck until link sharing is turned on.
            </p>
          </div>
          {onDismiss && <DismissButton onDismiss={onDismiss} />}
        </div>

        {/* Detected URL & direct open */}
        {detectedUrl && (
          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md bg-sunken px-2.5 py-1.5 ring-1 ring-inset ring-line">
            <FileText className="size-3.5 shrink-0 text-ink-3" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-2">{detectedUrl}</span>
            <a
              href={detectedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("secondary", "sm", "h-9 shrink-0 md:h-7")}
            >
              Open
              <ExternalLink />
            </a>
          </div>
        )}

        {/* 3-step fix */}
        <p className="mt-3.5 caps-label text-ink-3">How to fix it</p>
        <ol className="mt-1.5 space-y-1.5">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[12.5px] leading-snug text-ink-2">
              <span className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-[4px] bg-raised font-mono text-[11px] text-ink-3 ring-1 ring-inset ring-line-strong tabular">
                {i + 1}
              </span>
              <span className="min-w-0">{s}</span>
            </li>
          ))}
        </ol>

        {/* Alternative: switch to PDF upload if sharing is blocked by a college/org account */}
        {onSwitchToUpload && (
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-bad/20 pt-3">
            <span className="text-[12.5px] text-ink-3">College or work account blocking public sharing?</span>
            <Button variant="secondary" size="sm" icon={<UploadCloud />} onClick={onSwitchToUpload} className="h-9 md:h-7">
              Upload a PDF instead
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Fallback for standard system/network errors (e.g. rate limit, file size, quota, network timeout)
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-lg bg-bad-soft px-4 py-3 ring-1 ring-inset ring-bad/25", className)}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink">Review didn&apos;t go through</p>
        <p className="mt-0.5 break-words text-[12.5px] leading-relaxed text-ink-3">{error}</p>
      </div>
      {onDismiss && <DismissButton onDismiss={onDismiss} />}
    </div>
  );
}
