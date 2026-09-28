"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, type CSSProperties } from "react";
import { cn, getInitials } from "@/lib/utils";

/** Deterministic hue (0-359) from a string, used for fallback avatar tint. */
export function hueFor(seed: string | null | undefined): number {
  const s = seed || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  // Snap to six curated hues so tints never get garish.
  const hues = [28, 72, 148, 196, 252, 318];
  return hues[h % hues.length];
}

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const sizeMap: Record<AvatarSize, { box: string; text: string; dot: string }> = {
  xs: { box: "size-5", text: "text-[9px]", dot: "size-1.5" },
  sm: { box: "size-7", text: "text-[10.5px]", dot: "size-2" },
  md: { box: "size-9", text: "text-[12px]", dot: "size-2.5" },
  lg: { box: "size-12", text: "text-[15px]", dot: "size-3" },
  xl: { box: "size-16", text: "text-[20px]", dot: "size-3.5" },
  "2xl": { box: "size-24", text: "text-[30px]", dot: "size-4" },
};

/**
 * People are circles. Teams are squares (see TeamMark). The shape alone tells
 * you whether you're looking at a person or a team.
 */
export function Avatar({
  name,
  src,
  size = "md",
  presence,
  className,
  ring = false,
}: {
  name?: string | null;
  src?: string | null;
  size?: AvatarSize;
  presence?: "online" | "away" | null;
  className?: string;
  ring?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const s = sizeMap[size];
  const showImg = Boolean(src) && !failed;

  return (
    <span className={cn("relative inline-flex shrink-0", s.box, className)}>
      {showImg ? (
        <img
          src={src as string}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={cn("size-full rounded-full object-cover bg-selected", ring && "ring-2 ring-canvas")}
        />
      ) : (
        <span
          aria-hidden
          style={{ "--av-h": hueFor(name) } as CSSProperties}
          className={cn(
            "hm-avatar-fallback size-full rounded-full inline-flex items-center justify-center font-semibold tracking-tight",
            s.text,
            ring && "ring-2 ring-canvas",
          )}
        >
          {getInitials(name)}
        </span>
      )}
      {presence && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full ring-2 ring-canvas",
            s.dot,
            presence === "online" ? "bg-ok" : "bg-ink-4",
          )}
          aria-label={presence === "online" ? "Online" : "Away"}
          role="img"
        />
      )}
    </span>
  );
}

/** Overlapping row of avatars with a +N overflow counter. */
export function AvatarStack({
  people,
  max = 4,
  size = "sm",
  className,
}: {
  people: { id?: string; name?: string | null; src?: string | null }[];
  max?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className={cn("inline-flex items-center", className)}>
      {shown.map((p, i) => (
        <Avatar key={p.id || i} name={p.name} src={p.src} size={size} ring className={i > 0 ? "-ml-1.5" : undefined} />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            "-ml-1.5 inline-flex items-center justify-center rounded-full bg-selected text-ink-2 font-mono ring-2 ring-canvas",
            sizeMap[size].box,
            "text-[10px]",
          )}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

const markSize = {
  sm: "size-7 rounded-[6px] text-[11px]",
  md: "size-9 rounded-[7px] text-[13px]",
  lg: "size-12 rounded-[9px] text-[17px]",
  xl: "size-16 rounded-[11px] text-[22px]",
};

const markTone = {
  sih: "bg-sih-soft text-sih ring-sih/25",
  hack: "bg-hack-soft text-hack ring-hack/25",
  proj: "bg-proj-soft text-proj ring-proj/25",
  neutral: "bg-selected text-ink ring-line-strong",
};

/** Team identity mark: a square monogram tinted by the team's event category. */
export function TeamMark({
  name,
  tone = "neutral",
  size = "md",
  className,
}: {
  name?: string | null;
  tone?: keyof typeof markTone;
  size?: keyof typeof markSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-display font-bold tracking-tight ring-1 ring-inset",
        markSize[size],
        markTone[tone],
        className,
      )}
    >
      {getInitials(name, 2)}
    </span>
  );
}
