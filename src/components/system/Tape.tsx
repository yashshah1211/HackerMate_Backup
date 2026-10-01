import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TapeTone = "neutral" | "accent" | "solid" | "ok" | "warn" | "bad" | "info" | "sih" | "hack" | "proj";

const tones: Record<TapeTone, string> = {
  neutral: "text-ink-2 bg-selected ring-line-strong",
  accent: "text-accent-ink bg-accent-soft ring-accent/35",
  solid: "text-on-accent bg-accent ring-transparent",
  ok: "text-ok bg-ok-soft ring-ok/30",
  warn: "text-warn bg-warn-soft ring-warn/30",
  bad: "text-bad bg-bad-soft ring-bad/30",
  info: "text-info bg-info-soft ring-info/30",
  sih: "text-sih bg-sih-soft ring-sih/30",
  hack: "text-hack bg-hack-soft ring-hack/30",
  proj: "text-proj bg-proj-soft ring-proj/30",
};

/**
 * Tape: HackerMate's status label. Square-cornered, mono, uppercase — like a
 * label-maker strip. Used for states (AVAILABLE, 2 SEATS OPEN, SIH) — never
 * for free-form text.
 */
export function Tape({
  tone = "neutral",
  dot = false,
  icon,
  className,
  children,
  title,
}: {
  tone?: TapeTone;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 h-[18px] px-1.5 rounded-[3px] ring-1 ring-inset caps-label whitespace-nowrap [&_svg]:size-3",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {icon}
      {children}
    </span>
  );
}

/** Skill / stack chip: sentence case, mono, quieter than a Tape. */
export function Chip({
  children,
  active = false,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-6 px-2 rounded-[4px] font-mono text-[12.5px] whitespace-nowrap",
        active ? "bg-accent-soft text-accent-ink ring-1 ring-inset ring-accent/35" : "bg-selected text-ink-2",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Presence / status dot. */
export function StatusDot({ tone = "ok", pulse = false, className, label }: { tone?: "ok" | "warn" | "bad" | "idle" | "accent"; pulse?: boolean; className?: string; label?: string }) {
  const color = {
    ok: "bg-ok",
    warn: "bg-warn",
    bad: "bg-bad",
    idle: "bg-ink-4",
    accent: "bg-accent",
  }[tone];
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)} role={label ? "img" : undefined} aria-label={label}>
      {pulse && <span className={cn("absolute inset-0 rounded-full opacity-60 animate-ping", color)} aria-hidden />}
      <span className={cn("relative inline-flex size-2 rounded-full", color)} aria-hidden />
    </span>
  );
}

