"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Code2, ExternalLink, Lock, MoreHorizontal, Presentation, Trophy, UserPlus } from "lucide-react";
import { Avatar, Tape, buttonClass } from "@/components/system";
import { GithubIcon } from "@/components/system/BrandIcons";
import { cn } from "@/lib/utils";
import { Container, Lede, Pin, ProductFrame, SectionTitle, StageLabel, useStoryActive } from "./primitives";

const STATS: [string, string][] = [
  ["Hackathons", "7"],
  ["Wins", "2"],
  ["Teams", "3"],
  ["Connections", "41"],
];

const SHIPPED = [
  // Generic event names only: an example builder's result must never be attached to a real hackathon.
  { title: "Attendance from CCTV, no new hardware", event: "Inter-college hackathon", result: "Finalist", links: ["Demo", "Code", "Slides"] },
  { title: "Rail delay predictor", event: "Campus 24h hackathon", result: "Winner", links: ["Demo", "Code"] },
  { title: "Campus lost-and-found bot", event: "Weekend build sprint", result: "Shipped", links: ["Code"] },
];

const LANGS = [
  { name: "Go", pct: 38, cls: "bg-info" },
  { name: "TypeScript", pct: 29, cls: "bg-hack" },
  { name: "Python", pct: 21, cls: "bg-warn" },
  { name: "Other", pct: 12, cls: "bg-ink-4" },
];

const linkIcon = (l: string) => (l === "Demo" ? <ExternalLink /> : l === "Code" ? <Code2 /> : <Presentation />);

/** The V2 builder profile ("dossier") that opens out of a search result. */
function ProfilePreview() {
  const { ref, inView, reduced } = useStoryActive<HTMLDivElement>(0.4);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!inView || opened) return;
    const t = window.setTimeout(() => setOpened(true), 450);
    return () => window.clearTimeout(t);
  }, [inView, opened]);
  const expanded = opened || reduced;

  return (
    <div ref={ref} aria-hidden>
      <ProductFrame route="/profile/kabir">
        {/* Header: what you saw in the search result */}
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between md:p-5">
          <div className="flex min-w-0 items-start gap-3.5">
            <Avatar name="Kabir Menon" size="xl" presence="online" />
            <div className="min-w-0">
              <p className="font-display text-[26px] font-semibold leading-none tracking-[-0.025em] text-ink [font-variation-settings:'wdth'_88] md:text-[30px]">
                Kabir Menon
              </p>
              <p className="mt-1.5 text-[13px] text-ink-3">IIT Madras · 3rd year · Backend and infra</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Tape tone="ok" dot>
                  Open to teams
                </Tape>
                <Tape tone="warn" icon={<Trophy />}>
                  2 wins
                </Tape>
                <Tape tone="accent">Strong fit</Tape>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <span className={buttonClass("primary", "md", "pointer-events-none")}>
              <UserPlus /> Connect
            </span>
            <span className={buttonClass("secondary", "md", "pointer-events-none px-2.5")}>
              <MoreHorizontal />
            </span>
          </div>
        </div>

        <motion.div
          initial={false}
          animate={{ height: expanded ? "auto" : 0, opacity: expanded ? 1 : 0 }}
          transition={{ duration: reduced ? 0 : 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          className="overflow-hidden"
        >
          <div className="border-t border-line">
            {/* 1 · track record */}
            <div className="relative">
              <Pin n={1} className="absolute right-4 top-3.5 md:right-5" />
              <dl className="grid grid-cols-2 border-b border-line sm:grid-cols-4">
                {STATS.map(([k, v], i) => (
                  <motion.div
                    key={k}
                    initial={false}
                    animate={{ opacity: expanded ? 1 : 0, y: expanded ? 0 : 6 }}
                    transition={{ delay: reduced ? 0 : 0.25 + i * 0.07, duration: 0.3 }}
                    className={cn(
                      "border-line px-4 py-3.5 md:px-5",
                      // 2×2 on phones, one row of four from sm up.
                      i === 0 && "border-b border-r sm:border-b-0",
                      i === 1 && "border-b sm:border-b-0 sm:border-r",
                      i === 2 && "border-r",
                    )}
                  >
                    <dt className="caps-label text-ink-3">{k}</dt>
                    <dd className="mt-1 font-display text-[24px] font-semibold leading-none tracking-[-0.02em] text-ink tabular">{v}</dd>
                  </motion.div>
                ))}
              </dl>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px]">
              {/* 2 · shipped work */}
              <div className="relative min-w-0 border-b border-line p-4 md:border-b-0 md:border-r md:p-5">
                <Pin n={2} className="absolute right-4 top-4 md:right-5" />
                <div className="inline-flex h-8 items-center rounded-md bg-sunken p-0.5 ring-1 ring-inset ring-line">
                  <span className="px-2.5 text-[12.5px] font-medium text-ink-3">Events</span>
                  <span className="rounded-[5px] bg-raised px-2.5 py-1 text-[12.5px] font-medium text-ink ring-1 ring-inset ring-line-strong">
                    Delivered <span className="font-mono text-[10.5px] text-ink-4">3</span>
                  </span>
                  <span className="px-2.5 text-[12.5px] font-medium text-ink-3">Teams</span>
                </div>
                <ul className="mt-3.5 divide-y divide-line">
                  {SHIPPED.map((p, i) => (
                    <motion.li
                      key={p.title}
                      initial={false}
                      animate={{ opacity: expanded ? 1 : 0, x: expanded ? 0 : -6 }}
                      transition={{ delay: reduced ? 0 : 0.45 + i * 0.08, duration: 0.3 }}
                      className="py-3 first:pt-0"
                    >
                      <p className="text-[14px] font-semibold text-ink">{p.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
                        {p.event}
                        <Tape tone={p.result === "Winner" ? "warn" : p.result === "Finalist" ? "info" : "neutral"}>{p.result}</Tape>
                      </p>
                      <p className="mt-1.5 flex flex-wrap gap-3">
                        {p.links.map((l) => (
                          <span key={l} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-2 [&_svg]:size-3.5 [&_svg]:text-ink-3">
                            {linkIcon(l)} {l}
                          </span>
                        ))}
                      </p>
                    </motion.li>
                  ))}
                </ul>
              </div>

              {/* 3 · GitHub */}
              <div className="relative p-4 md:p-5">
                <Pin n={3} className="absolute right-4 top-4 md:right-5" />
                <p className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                  <GithubIcon className="size-4" /> GitHub
                </p>
                <p className="mt-0.5 text-[12px] text-ink-3">Synced from their GitHub account</p>
                <div className="mt-4 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-selected">
                  {LANGS.map((l, i) => (
                    <span
                      key={l.name}
                      className={cn("h-full rounded-full transition-[width] ease-out", l.cls)}
                      style={{ width: expanded ? `${l.pct}%` : "0%", transitionDuration: reduced ? "0ms" : `${700 + i * 120}ms` }}
                    />
                  ))}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {LANGS.map((l) => (
                    <li key={l.name} className="flex items-center gap-2 text-[12.5px] text-ink-2">
                      <span className={cn("size-2 rounded-full", l.cls)} />
                      {l.name}
                      <span className="ml-auto font-mono text-[11.5px] text-ink-3 tabular">{l.pct}%</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3.5">
                  <div>
                    <dt className="caps-label text-ink-3">Public repos</dt>
                    <dd className="mt-1 font-display text-[18px] font-semibold leading-none text-ink tabular">38</dd>
                  </div>
                  <div>
                    <dt className="caps-label text-ink-3">Followers</dt>
                    <dd className="mt-1 font-display text-[18px] font-semibold leading-none text-ink tabular">112</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </motion.div>
      </ProductFrame>
    </div>
  );
}

const NOTES = [
  { n: 1, title: "Track record", body: "Hackathons entered, wins, teams and connections, at a glance." },
  { n: 2, title: "Shipped work", body: "Projects with demo, code and slide links, next to the event they were built for." },
  { n: 3, title: "GitHub", body: "Languages and activity synced from their account, so the stack on the profile is backed by code." },
];

export function ReviewSection() {
  return (
    <section id="review" data-stage="review" aria-labelledby="review-title" className="scroll-mt-16 border-b border-line">
      <Container className="py-16 md:py-24">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:order-1 lg:col-span-7">
            <ProfilePreview />
          </div>
          <div className="lg:order-2 lg:col-span-5 lg:pt-4">
            <StageLabel id="review" />
            <SectionTitle id="review-title" className="mt-4">
              Know who actually builds.
            </SectionTitle>
            <Lede className="mt-5">
              A HackerMate profile is a record, not a bio. Before you invite someone, you can see what they have entered, won and shipped.
            </Lede>
            <ol className="mt-8 space-y-5">
              {NOTES.map((note) => (
                <li key={note.n} className="flex gap-3.5">
                  <Pin n={note.n} className="mt-0.5" />
                  <div>
                    <p className="text-[15px] font-semibold text-ink">{note.title}</p>
                    <p className="mt-0.5 text-[14.5px] leading-relaxed text-ink-2">{note.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-8 flex items-start gap-2 border-t border-line pt-5 text-[13.5px] text-ink-3">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Track records are public by default. Anyone can hide theirs in Settings.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
