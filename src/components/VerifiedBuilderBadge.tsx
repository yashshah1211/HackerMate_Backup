"use client";

import { calculateProfileCompleteness } from "@/lib/profileCompleteness";

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

  return (
    <span
      title="Verified Builder — complete profile"
      className={`inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-400 select-none shadow-xs shrink-0 ${className}`}
    >
      <svg
        className="w-3 h-3 text-emerald-400 shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
      {showLabel && <span>Verified</span>}
    </span>
  );
}
