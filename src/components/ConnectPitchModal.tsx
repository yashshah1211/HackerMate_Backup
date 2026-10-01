"use client";

import { useState } from "react";
import { moderateMessage } from "@/lib/safety";
import { Avatar, Button, Dialog } from "@/components/system";
import { cn } from "@/lib/utils";

type TargetProfile = {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  college?: string | null;
  skills?: string[] | null;
};

type ConnectPitchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSend: (pitchMessage?: string) => Promise<void>;
  targetProfile: TargetProfile;
  loading?: boolean;
};

const QUICK_TEMPLATES = [
  "Building a team for SIH 2026 — your skills would fill a gap we have.",
  "Liked your stack and projects. Want to team up for the next hackathon?",
  "Looking for a teammate who ships. Open to building something together?",
];

const LIMIT = 140;

/**
 * Connection request with an optional note. Same contract as V1: the note
 * is moderated client-side, capped at 140 chars, and `onSend(undefined)`
 * sends a request without a note.
 */
export default function ConnectPitchModal({ isOpen, onClose, onSend, targetProfile, loading = false }: ConnectPitchModalProps) {
  const [pitch, setPitch] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const first = targetProfile.full_name?.split(" ")[0] || "them";

  const handleSendWithPitch = async () => {
    const trimmed = pitch.trim();
    if (trimmed.length > 0) {
      const moderation = moderateMessage(trimmed);
      if (!moderation.isValid) {
        setErrorText(moderation.error || "Message contains inappropriate content.");
        return;
      }
      await onSend(moderation.sanitized);
    } else {
      await onSend(undefined);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={() => {
        if (!loading) onClose();
      }}
      title={`Connect with ${first}`}
      description="A one-line reason gets far more accepts than a blank request."
      footer={
        <>
          <Button variant="ghost" disabled={loading} onClick={() => onSend(undefined)}>
            Send without a note
          </Button>
          <Button variant="primary" loading={loading} disabled={pitch.length > LIMIT} onClick={handleSendWithPitch}>
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={targetProfile.full_name} src={targetProfile.avatar_url} size="md" />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-ink">{targetProfile.full_name}</p>
            <p className="truncate text-[12px] text-ink-3">{targetProfile.college || "Independent builder"}</p>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor="pitch-note" className="caps-label text-ink-3">
              Your note
            </label>
            <span className={cn("font-mono text-[12px] tabular", pitch.length > LIMIT ? "text-bad" : "text-ink-4")}>
              {pitch.length}/{LIMIT}
            </span>
          </div>
          <textarea
            id="pitch-note"
            data-autofocus
            value={pitch}
            maxLength={LIMIT}
            rows={3}
            onChange={(e) => {
              setPitch(e.target.value);
              if (errorText) setErrorText(null);
            }}
            placeholder={`e.g. Need a backend dev for SIH — saw your Postgres work, ${first}.`}
            className="w-full resize-none rounded-md bg-sunken px-3 py-2 text-[13.5px] leading-relaxed text-ink ring-1 ring-inset ring-line-strong placeholder:text-ink-4 focus:outline-none focus:ring-accent-ink focus:shadow-[0_0_0_3px_var(--hm-accent-soft)]"
          />
          {errorText && (
            <p className="mt-1.5 text-[12px] text-bad" role="alert">
              {errorText}
            </p>
          )}
        </div>

        <div>
          <p className="caps-label mb-1.5 text-ink-4">Or start from</p>
          <div className="flex flex-col gap-1">
            {QUICK_TEMPLATES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setPitch(t);
                  setErrorText(null);
                }}
                className="rounded-md px-2.5 py-2 text-left text-[12.5px] text-ink-2 ring-1 ring-inset ring-line transition-colors hover:bg-hover hover:text-ink"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

