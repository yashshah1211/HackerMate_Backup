"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { LogoMark } from "@/components/Logo";
import { cn } from "@/lib/utils";

/** Landing content width. Slightly wider than the app's 1240px pages. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1280px] px-5 md:px-8", className)}>{children}</div>;
}

export type StageId = "find" | "review" | "merge" | "build" | "ship";

export const STAGES: { id: StageId; n: string; verb: string; output: string; line: string }[] = [
  { id: "find", n: "01", verb: "Find", output: "a shortlist", line: "Search by the skill you're missing, not by who replies first." },
  { id: "review", n: "02", verb: "Review", output: "people you can count on", line: "Check what someone has actually built before you invite them." },
  { id: "merge", n: "03", verb: "Merge", output: "a team with no gaps", line: "Turn the shortlist into a roster with every skill covered." },
  { id: "build", n: "04", verb: "Build", output: "a working demo", line: "Chat, tasks, repo, deploys and pitch review in one room." },
  { id: "ship", n: "05", verb: "Ship", output: "a submission", line: "Submit with a team that pulled its weight." },
];

/** Pipeline stage marker: "01  FIND ——". */
export function StageLabel({ id, className }: { id: StageId; className?: string }) {
  const stage = STAGES.find((s) => s.id === id)!;
  return (
    <p className={cn("flex items-center gap-2.5", className)}>
      <span className="inline-flex h-[22px] items-center rounded-[4px] bg-accent-soft px-1.5 font-mono text-[11.5px] font-semibold text-accent-ink ring-1 ring-inset ring-accent/40 tabular">
        {stage.n}
      </span>
      <span className="caps-label text-ink-2">{stage.verb}</span>
      <span aria-hidden className="h-px w-10 bg-line-strong" />
    </p>
  );
}

/** Mono eyebrow for non-stage sections. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2.5 caps-label text-ink-3", className)}>
      <span aria-hidden className="size-1.5 rounded-[1px] bg-ink-3" />
      {children}
    </p>
  );
}

export function SectionTitle({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <h2
      id={id}
      data-v2-heading
      className={cn(
        "font-display text-[34px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink text-balance [font-variation-settings:'wdth'_88] md:text-[50px]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function Lede({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("max-w-[54ch] text-[16px] leading-[1.6] text-ink-2 md:text-[17px]", className)}>{children}</p>;
}

/**
 * Frame for a product preview: a slim V2 window bar with the route it
 * represents. Always labelled as example data.
 */
export function ProductFrame({
  route,
  children,
  className,
  bodyClassName,
}: {
  route: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-line-strong/80 bg-canvas shadow-[0_28px_70px_-36px_rgb(0_0_0/0.9)]",
        className,
      )}
    >
      <div className="flex h-9 items-center justify-between gap-3 border-b border-line bg-raised px-3">
        <span className="flex min-w-0 items-center gap-2">
          <LogoMark size={16} />
          <span className="truncate font-mono text-[11.5px] text-ink-3">
            <span className="hidden sm:inline">hackermate.in</span>
            {route}
          </span>
        </span>
        <span className="shrink-0 caps-label text-ink-3">Example data</span>
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

/**
 * Visible caption for illustrative previews that don't sit in a ProductFrame
 * (the hero run, the group-chat illustration), so no example reads as live data.
 */
export function ExampleNote({ label = "Example data", children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <p className={cn("mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px] text-ink-3", className)}>
      <span className="caps-label text-ink-3">{label}</span>
      <span>{children}</span>
    </p>
  );
}

/** Numbered annotation pin used to tie copy to a spot in a preview. */
export function Pin({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-canvas font-mono text-[11px] font-semibold text-accent-ink ring-1 ring-accent/60",
        className,
      )}
    >
      {n}
    </span>
  );
}

/** True while the document is visible (pauses loops in background tabs). */
export function usePageVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

/**
 * Drives a preview's choreography: `active` is true while the element is on
 * screen, the tab is visible and the user hasn't asked for reduced motion.
 */
export function useStoryActive<T extends Element>(amount = 0.35) {
  const ref = useRef<T>(null);
  const inView = useInView(ref, { amount });
  const visible = usePageVisible();
  const reduced = Boolean(useReducedMotion());
  return { ref, active: inView && visible && !reduced, inView, reduced };
}

/** Ticking example event clock. Starts from a fixed value so SSR and client agree. */
export function useCountdown(startSeconds: number, running: boolean) {
  const [left, setLeft] = useState(startSeconds);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setLeft((s) => (s > 0 ? s - 1 : startSeconds)), 1000);
    return () => window.clearInterval(id);
  }, [running, startSeconds]);
  return left;
}
