import React from "react";
import { LucideIcon } from "lucide-react";

export interface AdminStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  badge?: React.ReactNode;
  highlight?: boolean;
  action?: React.ReactNode;
  className?: string;
}

export function AdminStatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  badge,
  highlight,
  action,
  className = "",
}: AdminStatCardProps) {
  return (
    <div
      className={`p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700/80 transition-colors space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {Icon && <Icon className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />}
          <span>{title}</span>
        </div>
        {badge}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div
          className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${
            highlight
              ? "text-zinc-950 dark:text-[#B4F461]"
              : "text-zinc-900 dark:text-zinc-100"
          }`}
        >
          {value}
        </div>
        {action}
      </div>

      {subtitle && (
        <div className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
          {subtitle}
        </div>
      )}
    </div>
  );
}
