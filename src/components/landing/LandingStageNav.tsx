"use client";

import { useEffect, useState } from "react";
import { motion, useScroll } from "motion/react";
import { cn } from "@/lib/utils";
import { STAGES, type StageId } from "./primitives";

/**
 * Landing header navigation: the pipeline stages as anchors, with the stage
 * in view highlighted (same gliding underline as the app's route tabs).
 */
export function LandingStageNav({ className }: { className?: string }) {
  const [active, setActive] = useState<StageId | null>(null);

  // Scroll-driven (rAF-throttled) instead of an IntersectionObserver attached
  // once: the header mounts before the page content streams in (and stays
  // mounted across marketing routes), so sections are looked up on every pass
  // and a late or re-mounted page can never leave the nav stuck.
  useEffect(() => {
    let frame = 0;
    const compute = () => {
      frame = 0;
      const doc = document.documentElement;
      let found: StageId | null = null;
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= doc.scrollHeight - 2) {
        // At the very bottom the last stage stays lit even if it sits above the reading line.
        if (document.getElementById(STAGES[STAGES.length - 1].id)) found = STAGES[STAGES.length - 1].id;
      } else {
        const line = window.innerHeight * 0.45;
        for (const s of STAGES) {
          const r = document.getElementById(s.id)?.getBoundingClientRect();
          if (r && r.top <= line && r.bottom > line) {
            found = s.id;
            break;
          }
        }
      }
      setActive((prev) => (prev === found ? prev : found));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(compute);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <nav aria-label="How HackerMate works" className={cn("items-stretch", className)}>
      {STAGES.map((s) => {
        const on = active === s.id;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={on ? "step" : undefined}
            className={cn(
              "relative flex h-14 items-center gap-1.5 px-2.5 text-[13px] font-medium transition-colors",
              on ? "text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            <span className={cn("font-mono text-[11px] tabular transition-colors", on ? "text-accent-ink" : "text-ink-4")}>{s.n}</span>
            {s.verb}
            {on && (
              <motion.span
                layoutId="landing-stage-underline"
                className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-signal"
                transition={{ type: "spring", stiffness: 520, damping: 42 }}
              />
            )}
          </a>
        );
      })}
    </nav>
  );
}

/** 2px reading-progress line along the bottom edge of the landing header. */
export function LandingScrollProgress() {
  const { scrollYProgress } = useScroll();
  return (
    <motion.span
      aria-hidden
      style={{ scaleX: scrollYProgress }}
      className="pointer-events-none absolute inset-x-0 -bottom-px h-[2px] origin-left bg-accent"
    />
  );
}
