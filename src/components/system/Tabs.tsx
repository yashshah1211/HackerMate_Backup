"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type RouteTab = {
  href: string;
  label: string;
  count?: number;
  active: boolean;
  icon?: ReactNode;
};

/**
 * Section navigation between sibling routes (e.g. Teams · Mine · Invites).
 * The underline glides between tabs to show that these pages belong together.
 */
export function RouteTabs({ tabs, className }: { tabs: RouteTab[]; className?: string }) {
  const layoutId = useId();
  return (
    <nav aria-label="Section" className={cn("-mb-px flex items-end gap-5 overflow-x-auto scrollbar-none", className)}>
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "relative flex h-10 shrink-0 items-center gap-1.5 text-[13px] font-medium transition-colors [&_svg]:size-4",
            t.active ? "text-ink" : "text-ink-3 hover:text-ink",
          )}
        >
          {t.icon}
          {t.label}
          {typeof t.count === "number" && t.count > 0 && (
            <span className={cn("font-mono text-[11px] tabular", t.active ? "text-ink-2" : "text-ink-4")}>{t.count}</span>
          )}
          {t.active && (
            <motion.span
              layoutId={`route-tab-${layoutId}`}
              className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-signal"
              transition={{ type: "spring", stiffness: 520, damping: 42 }}
            />
          )}
        </Link>
      ))}
    </nav>
  );
}

export type SegmentOption<T extends string> = { value: T; label: string; count?: number };

/** In-page view switch (e.g. Best fit / Your campus). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  label,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
  label: string;
}) {
  const layoutId = useId();
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "inline-flex items-center rounded-md bg-sunken p-0.5 ring-1 ring-inset ring-line",
        size === "sm" ? "h-7" : "h-8",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative h-full rounded-[5px] px-2.5 font-medium transition-colors",
              size === "sm" ? "text-[12px]" : "text-[12.5px]",
              active ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {active && (
              <motion.span
                layoutId={`segment-${layoutId}`}
                className="absolute inset-0 rounded-[5px] bg-raised shadow-[0_1px_0_0_var(--hm-line-strong)] ring-1 ring-inset ring-line-strong"
                transition={{ type: "spring", stiffness: 560, damping: 44 }}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {o.label}
              {typeof o.count === "number" && (
                <span className="font-mono text-[10.5px] text-ink-4 tabular">{o.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
