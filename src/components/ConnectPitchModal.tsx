"use client";

import { useState } from "react";
import { moderateMessage } from "@/lib/safety";

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
  "🚀 Building an SIH 2026 team, would love to have your skills!",
  "⚡ Loved your tech stack & projects — let's connect for hackathons!",
  "🤝 Looking for a compatible teammate for upcoming hackathons!",
];

export default function ConnectPitchModal({
  isOpen,
  onClose,
  onSend,
  targetProfile,
  loading = false,
}: ConnectPitchModalProps) {
  const [pitch, setPitch] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTemplateClick = (template: string) => {
    setPitch(template);
    setErrorText(null);
  };

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

  const handleSkipAndSend = async () => {
    await onSend(undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4 animate-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 relative shadow-2xl space-y-5 text-left text-zinc-900 dark:text-zinc-100">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer text-sm font-mono"
          aria-label="Close modal"
        >
          ✕
        </button>

        {/* Header */}
        <div className="space-y-1">
          <span className="text-[10px] font-mono font-bold tracking-widest text-indigo-600 dark:text-indigo-400 uppercase bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-0.5 rounded border border-indigo-200/60 dark:border-indigo-800/40 inline-block">
            Connect Pitch Note
          </span>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
            Connect with {targetProfile.full_name.split(" ")[0]}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Attach a short note to stand out and explain why you&apos;d like to connect.
          </p>
        </div>

        {/* Profile Card Preview */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80">
          {targetProfile.avatar_url ? (
            <img
              src={targetProfile.avatar_url}
              alt={targetProfile.full_name}
              className="w-10 h-10 rounded-lg object-cover border border-zinc-200 dark:border-zinc-800 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold text-sm shrink-0">
              {targetProfile.full_name.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
              {targetProfile.full_name}
            </h4>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
              {targetProfile.college || "Engineering Student"}
            </p>
          </div>
        </div>

        {/* Quick Templates */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
            Quick Pitch Templates
          </label>
          <div className="flex flex-col gap-1.5">
            {QUICK_TEMPLATES.map((tmpl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleTemplateClick(tmpl)}
                className="text-[11px] text-left p-2 rounded-lg bg-zinc-100/70 hover:bg-indigo-50 dark:bg-zinc-900 dark:hover:bg-indigo-950/40 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors cursor-pointer"
              >
                {tmpl}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Textarea */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <span>Your Pitch Note (Optional)</span>
            <span className={pitch.length > 140 ? "text-rose-500 font-bold" : ""}>
              {pitch.length}/140
            </span>
          </div>
          <textarea
            value={pitch}
            maxLength={140}
            onChange={(e) => {
              setPitch(e.target.value);
              if (errorText) setErrorText(null);
            }}
            placeholder="e.g., Hey! Loved your React skills, building a team for SIH 2026 and would love to connect..."
            rows={3}
            className="w-full p-3 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-all"
          />
          {errorText && (
            <p className="text-[11px] text-rose-500 font-medium tracking-tight">
              ⚠️ {errorText}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={handleSendWithPitch}
            disabled={loading || pitch.length > 140}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md shadow-indigo-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span>Send Connection Pitch →</span>
            )}
          </button>
          
          <button
            type="button"
            onClick={handleSkipAndSend}
            disabled={loading}
            className="w-full py-2 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 font-medium text-[11px] transition-all cursor-pointer text-center"
          >
            Skip & Send Blank Request
          </button>
        </div>
      </div>
    </div>
  );
}
