import React from "react";
import { LucideIcon } from "lucide-react";

export type BadgeVariant = "neutral" | "warning" | "danger" | "accent" | "info";

export interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  icon?: LucideIcon;
  dot?: boolean;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  // Neutral: Default for active, completed, sent, normal usage, general tags
  neutral:
    "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900/60 dark:text-zinc-400 dark:border-zinc-800",
  // Warning: Reserved for items requiring admin attention (Pending Approval, High Volume, Incomplete)
  warning:
    "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  // Danger: Reserved for critical states (Suspended, Banned, Critical Cap, Delete, Rejected)
  danger:
    "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20",
  // Accent: Primary brand focus (Verified Winner, Live Resend Sync)
  accent:
    "bg-[#B4F461]/10 text-zinc-900 border-[#B4F461]/30 dark:bg-[#B4F461]/10 dark:text-[#B4F461] dark:border-[#B4F461]/25 font-bold",
  // Info: Telemetry / outreach status (Replied, Pitched)
  info:
    "bg-sky-500/10 text-sky-700 border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20",
};

export function StatusBadge({
  label,
  variant = "neutral",
  icon: Icon,
  dot,
  className = "",
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider font-semibold border ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            variant === "accent"
              ? "bg-[#B4F461] animate-pulse"
              : variant === "warning"
              ? "bg-amber-400 animate-pulse"
              : variant === "danger"
              ? "bg-rose-400"
              : "bg-zinc-400 dark:bg-zinc-500"
          }`}
        />
      )}
      {Icon && <Icon className="w-3 h-3 shrink-0 opacity-80" />}
      <span>{label}</span>
    </span>
  );
}
