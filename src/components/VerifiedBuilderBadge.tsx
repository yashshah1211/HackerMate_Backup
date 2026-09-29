"use client";

import { BadgeCheck } from "lucide-react";
import { calculateProfileCompleteness } from "@/lib/profileCompleteness";
import { cn } from "@/lib/utils";

export type VerifiedBuilderBadgeProps = {
  profile: any;
  showLabel?: boolean; // Default true, optional false for icon-only tight spaces
  className?: string;
};

export default function VerifiedBuilderBadge({
  profile,
  showLabel = true,
  className = "",
}: VerifiedBuilderBadgeProps) {
  if (!profile) return null;

  const { score } = calculateProfileCompleteness(profile);
  if (score < 100) return null;

  if (!showLabel) {
    return (
      <span
        title="Verified builder: complete profile"
        role="img"
        aria-label="Verified builder"
        className={cn("inline-flex shrink-0 select-none items-center text-ok", className)}
      >
        <BadgeCheck className="size-3.5" aria-hidden />
      </span>
    );
  }

  return (
    <span
      title="Verified builder: complete profile"
      className={cn(
        "inline-flex h-[18px] shrink-0 select-none items-center gap-1 rounded-[3px] bg-ok-soft px-1.5 text-ok ring-1 ring-inset ring-ok/30 caps-label whitespace-nowrap",
        className,
      )}
    >
      <BadgeCheck className="size-3" aria-hidden />
      <span>Verified</span>
    </span>
  );
}
