"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, FileDown, Plus, UserPlus } from "lucide-react";
import { Avatar, Chip, Progress, SeatMeter, Tape, TeamMark, buttonClass } from "@/components/system";
import { cn } from "@/lib/utils";
import { EXAMPLE_ROSTER, EXAMPLE_TEAM, JOINING_MEMBER } from "./fixtures";
import { Container, Lede, ProductFrame, SectionTitle, StageLabel, useStoryActive } from "./primitives";

/** The V2 team page: a join request is accepted and the last skill gap closes. */
function TeamPreview() {
  const { ref, inView, reduced } = useStoryActive<HTMLDivElement>(0.35);
  const [beat, setBeat] = useState(0); // 0 waiting, 1 pressing accept, 2 accepted
  useEffect(() => {
    if (!inView || beat >= 2) return;
    const t = window.setTimeout(() => setBeat((b) => b + 1), beat === 0 ? 1100 : 320);
    return () => window.clearTimeout(t);
  }, [inView, beat]);
  const accepted = reduced || beat >= 2;
  const pressing = !reduced && beat === 1;

  const roster = accepted ? [...EXAMPLE_ROSTER, JOINING_MEMBER] : EXAMPLE_ROSTER;
  const coveredSkills = new Set(roster.flatMap((m) => m.skills));
  const covered = EXAMPLE_TEAM.skills.filter((s) => coveredSkills.has(s)).length;
  const pct = Math.round((covered / EXAMPLE_TEAM.skills.length) * 100);
  const openSeats = EXAMPLE_TEAM.maxMembers - roster.length;

  return (
    <div ref={ref} aria-hidden>
      <ProductFrame route="/teams/null-pointers">
        <div className="flex flex-col gap-4 border-b border-line p-4 md:flex-row md:items-start md:justify-between md:p-5">
          <div className="flex min-w-0 items-start gap-3.5">
            <TeamMark name={EXAMPLE_TEAM.name} tone="sih" size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-[24px] font-semibold leading-none tracking-[-0.025em] text-ink [font-variation-settings:'wdth'_88] md:text-[28px]">
                  {EXAMPLE_TEAM.name}
                </p>
                <Tape tone="accent" dot>
                  Recruiting
                </Tape>
                <Tape tone="sih">SIH</Tape>
              </div>
              <p className="mt-1.5 text-[13px] text-ink-3">
                {EXAMPLE_TEAM.event} · {EXAMPLE_TEAM.idea}
              </p>
            </div>
          </div>
          <span className={buttonClass("primary", "md", "pointer-events-none shrink-0 self-start")}>
            Open workspace <ArrowUpRight />
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Roster + skills */}
          <div className="min-w-0 border-b border-line p-4 md:p-5 lg:border-b-0 lg:border-r">
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
              <p className="text-[13.5px] font-semibold text-ink">
                Roster <span className="ml-1 font-mono text-[11.5px] font-normal text-ink-3 tabular">{roster.length}/6</span>
              </p>
              <SeatMeter filled={roster.length} total={EXAMPLE_TEAM.maxMembers} />
            </div>
            <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
              <AnimatePresence initial={false}>
                {roster.map((m) => (
                  <motion.li
                    key={m.id}
                    layout
                    initial={{ opacity: 0, backgroundColor: "rgba(180,244,97,0.10)" }}
                    animate={{ opacity: 1, backgroundColor: "rgba(180,244,97,0)" }}
                    transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
                    className="flex items-center gap-3 px-3.5 py-2.5"
                  >
                    <Avatar name={m.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-medium text-ink">{m.name}</span>
                        {m.role === "Owner" ? <Tape tone="solid">Owner</Tape> : <Tape>Member</Tape>}
                      </p>
                      <p className="text-[12px] text-ink-3">{m.projectRole}</p>
                    </div>
                    <span className="hidden sm:block">
                      <Chip active>{m.skills[0]}</Chip>
                    </span>
                  </motion.li>
                ))}
                {Array.from({ length: openSeats }).map((_, i) => (
                  <motion.li key={`open-${i}`} layout className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="inline-flex size-7 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-4">
                      <Plus className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-ink-2">Open seat</p>
                      <p className="text-[12px] text-ink-3">{i === 0 && !accepted ? "Looking for a mobile developer" : "Any role that fits the idea"}</p>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            <div className="mt-5">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-[13.5px] font-semibold text-ink">Skills the team needs</p>
                <span className={cn("font-mono text-[12px] tabular", pct === 100 ? "text-ok" : "text-ink-2")}>
                  {covered}/{EXAMPLE_TEAM.skills.length} covered
                </span>
              </div>
              <Progress value={pct} tone={pct === 100 ? "ok" : "warn"} />
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {EXAMPLE_TEAM.skills.map((s) => (
                  <Chip key={s} active={coveredSkills.has(s)}>
                    {coveredSkills.has(s) ? s : `${s} · missing`}
                  </Chip>
                ))}
                <AnimatePresence>
                  {pct === 100 && (
                    <motion.span initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 26 }}>
                      <Tape tone="ok" icon={<Check />}>
                        Every skill covered
                      </Tape>
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Requests, invites, SIH checks */}
          <div className="space-y-5 p-4 md:p-5">
            <div>
              <p className="mb-2 caps-label text-ink-3">Join requests</p>
              <AnimatePresence mode="wait" initial={false}>
                {!accepted ? (
                  <motion.div
                    key="request"
                    exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }}
                    className="overflow-hidden rounded-lg border border-line bg-raised p-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <Avatar name={JOINING_MEMBER.name} size="md" />
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-ink">{JOINING_MEMBER.name}</p>
                        <p className="text-[12px] text-ink-3">BITS Pilani · 4th year · asked to join</p>
                      </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      <Chip active>Flutter</Chip>
                      <Chip>Firebase</Chip>
                      <Chip>Kotlin</Chip>
                    </div>
                    <div className="mt-3 flex gap-1.5">
                      <span
                        className={buttonClass(
                          "primary",
                          "sm",
                          cn("pointer-events-none flex-1 transition-transform", pressing && "scale-[0.96] bg-accent-hover ring-2 ring-accent/40"),
                        )}
                      >
                        <Check /> Accept
                      </span>
                      <span className={buttonClass("ghost", "sm", "pointer-events-none")}>Decline</span>
                    </div>
                  </motion.div>
                ) : (
                  <motion.p
                    key="joined"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[12.5px] text-ink-2"
                  >
                    <Check className="size-3.5 text-ok" /> {JOINING_MEMBER.name} joined as Mobile
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div>
              <p className="mb-2 caps-label text-ink-3">Invites sent</p>
              <div className="flex items-center gap-2.5 rounded-lg border border-line bg-raised px-3 py-2.5">
                <Avatar name="Priya Kulkarni" size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">Priya Kulkarni</span>
                <Tape>Pending</Tape>
              </div>
            </div>

            <div>
              <p className="mb-2 caps-label text-ink-3">SIH checks</p>
              <ul className="space-y-1.5 text-[12.5px]">
                <li className="flex items-center justify-between gap-2 text-ink-2">
                  <span>Team size, 6 max</span>
                  <span className="flex items-center gap-1 font-mono text-[11.5px] text-ok tabular">
                    <Check className="size-3.5" /> {roster.length}/6
                  </span>
                </li>
                <li className="flex items-center justify-between gap-2 text-ink-2">
                  <span>At least one woman</span>
                  <Check className="size-3.5 text-ok" />
                </li>
                <li className="flex items-center justify-between gap-2 text-ink-2">
                  <span>Roster export for SPOC</span>
                  <span className="flex items-center gap-1 text-[12px] text-ink-3">
                    <FileDown className="size-3.5" /> Ready
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </ProductFrame>
    </div>
  );
}

const FACTS: [string, string][] = [
  ["Requests", "Builders ask to join. You see their profile, then accept or decline."],
  ["Invites", "Invite anyone from search or from the squad matcher in your workspace."],
  ["SIH", "Team size and the at-least-one-woman rule are checked, and the roster exports for your college SPOC."],
];

export function MergeSection() {
  return (
    <section id="merge" data-stage="merge" aria-labelledby="merge-title" className="scroll-mt-16 border-b border-line">
      <Container className="py-16 md:py-24">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-6">
            <StageLabel id="merge" />
            <SectionTitle id="merge-title" className="mt-4">
              Fill the gaps, not just the seats.
            </SectionTitle>
            <Lede className="mt-5">
              Post the idea, the event and the skills you need. As builders join, the team page shows which skills are still missing, so you know
              what the next invite has to cover.
            </Lede>
          </div>
          <div className="lg:col-span-6 lg:self-end">
            <dl className="divide-y divide-line border-y border-line">
              {FACTS.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-3">
                  <dt className="caps-label pt-0.5 text-ink-3">{k}</dt>
                  <dd className="text-[14px] leading-snug text-ink-2">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <div className="mt-10 md:mt-12">
          <TeamPreview />
        </div>
        <p className="mt-4 flex items-center gap-2 text-[13px] text-ink-3">
          <UserPlus className="size-3.5" aria-hidden />
          No team yet? Start one for your next event, or ask to join a team that&apos;s recruiting.
        </p>
      </Container>
    </section>
  );
}
