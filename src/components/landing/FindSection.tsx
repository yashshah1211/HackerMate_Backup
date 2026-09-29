"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, SlidersHorizontal, Trophy, UserPlus } from "lucide-react";
import { Avatar, Chip, FilterChip, Tape, buttonClass } from "@/components/system";
import { DISCOVERY_SKILLS, EXAMPLE_BUILDERS } from "./fixtures";
import { Container, Lede, ProductFrame, SectionTitle, StageLabel, useStoryActive } from "./primitives";

function fitLabel(fit: number) {
  return fit >= 85 ? { label: "Strong fit", tone: "accent" as const } : { label: "Good fit", tone: "ok" as const };
}

/** The V2 builder directory with example builders. Skill chips really filter. */
function DiscoveryPreview() {
  const { ref, inView, reduced } = useStoryActive<HTMLDivElement>(0.45);
  const [picked, setPicked] = useState<string[]>([]);
  const touched = useRef(false);
  const demoed = useRef(false);

  // One gentle demo the first time the preview is on screen: pick "Figma".
  useEffect(() => {
    if (!inView || reduced || touched.current || demoed.current) return;
    const t = window.setTimeout(() => {
      demoed.current = true;
      if (!touched.current) setPicked(["Figma"]);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [inView, reduced]);

  const toggle = (s: string) => {
    touched.current = true;
    setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  };

  const results = EXAMPLE_BUILDERS.filter((b) => picked.every((s) => b.skills.includes(s))).sort((a, b) => b.fit - a.fit);

  return (
    <div ref={ref}>
      <ProductFrame route="/developers">
        <div className="border-b border-line px-4 pt-4 md:px-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink [font-variation-settings:'wdth'_92]">Builders</p>
              <p className="mt-1.5 text-[12.5px] text-ink-3">Sorted by fit with your team</p>
            </div>
            <span aria-hidden className={buttonClass("secondary", "sm", "pointer-events-none hidden sm:inline-flex")}>
              <SlidersHorizontal /> Filters
            </span>
          </div>
          <div aria-hidden className="mt-3.5 flex gap-5 text-[13px] font-medium">
            <span className="relative pb-2.5 text-ink">
              Discover
              <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-signal" />
            </span>
            <span className="pb-2.5 text-ink-3">Your network</span>
            <span className="pb-2.5 text-ink-3">Requests</span>
          </div>
        </div>

        <div className="space-y-3 px-4 py-3.5 md:px-5">
          <div aria-hidden className="flex h-[34px] items-center gap-2 rounded-md bg-sunken px-2.5 ring-1 ring-inset ring-line-strong">
            <Search className="size-4 text-ink-3" />
            <span className="text-[13.5px] text-ink-4">Search builders, skills, colleges</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter example builders by skill">
            {DISCOVERY_SKILLS.map((s) => (
              <FilterChip key={s} active={picked.includes(s)} onClick={() => toggle(s)}>
                {s}
              </FilterChip>
            ))}
            <span className="ml-1 text-[12px] text-ink-3">{picked.length ? "Try another skill" : "Pick a skill to filter"}</span>
          </div>
          <p className="text-[12.5px] text-ink-3" aria-live="polite">
            <span className="font-mono text-ink-2 tabular">{results.length}</span> {results.length === 1 ? "builder" : "builders"}
            {picked.length ? ` with ${picked.join(" + ")}` : ""} · best fit first
          </p>
        </div>

        <div aria-hidden className="relative h-[372px] overflow-hidden border-t border-line md:h-[414px]">
          <ul className="divide-y divide-line">
            <AnimatePresence initial={false} mode="popLayout">
              {results.map((b) => {
                const band = fitLabel(b.fit);
                return (
                  <motion.li
                    layout
                    key={b.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={{ type: "spring", stiffness: 420, damping: 38 }}
                    className="flex gap-3 bg-canvas px-4 py-3.5 md:px-5"
                  >
                    <Avatar name={b.name} size="lg" presence={b.online ? "online" : null} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-[15px] font-semibold text-ink">{b.name}</span>
                        {b.wins > 0 ? (
                          <Tape tone="warn" icon={<Trophy />}>
                            {b.wins} win{b.wins === 1 ? "" : "s"}
                          </Tape>
                        ) : b.competed ? (
                          <Tape>Competed</Tape>
                        ) : null}
                        {b.available && <Tape tone="ok">Available</Tape>}
                        <Tape tone={band.tone} className="sm:hidden">
                          {band.label}
                        </Tape>
                      </div>
                      <p className="mt-0.5 truncate text-[12.5px] text-ink-3">
                        {b.college} · {b.year} · {b.lastActive}
                      </p>
                      <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-ink-2">
                        <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                        <span className="truncate">{b.reason}</span>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {b.skills.map((s) => (
                          <Chip key={s} active={picked.includes(s)}>
                            {s}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <div className="hidden w-[132px] shrink-0 flex-col items-end gap-2 sm:flex">
                      <Tape tone={band.tone}>{band.label}</Tape>
                      <span className={buttonClass("secondary", "sm", "pointer-events-none")}>
                        <UserPlus /> Connect
                      </span>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
          {results.length === 0 && (
            <p className="px-5 py-10 text-center text-[13px] text-ink-3">No example builders have all of those. Real searches cover every builder on HackerMate.</p>
          )}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-canvas to-transparent" />
        </div>
      </ProductFrame>
    </div>
  );
}

const FACTS: [string, string][] = [
  ["Filters", "Skill, experience, availability, college and year"],
  ["Ranking", "People who add to your stack come before people who duplicate it"],
  ["Reasons", "Every suggestion says why, in plain words"],
];

export function FindSection() {
  return (
    <section id="find" data-stage="find" aria-labelledby="find-title" className="scroll-mt-16 border-b border-line">
      <Container className="py-16 md:py-24">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <StageLabel id="find" />
            <SectionTitle id="find-title" className="mt-4">
              Search by what your team is missing.
            </SectionTitle>
            <Lede className="mt-5">
              Need a designer who knows Figma, or someone who has shipped Flutter? Filter every builder on HackerMate, and let suggestions surface the
              people who fill your gaps.
            </Lede>
            <dl className="mt-8 divide-y divide-line border-y border-line">
              {FACTS.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-3">
                  <dt className="caps-label pt-0.5 text-ink-3">{k}</dt>
                  <dd className="text-[14px] leading-snug text-ink-2">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="min-w-0 lg:col-span-7">
            <DiscoveryPreview />
          </div>
        </div>
      </Container>
    </section>
  );
}
