"use client";

import { motion } from "motion/react";
import { ArrowRight, Hash } from "lucide-react";
import { Avatar } from "@/components/system";
import { Container, Eyebrow, ExampleNote, Lede, SectionTitle, STAGES, useStoryActive } from "./primitives";

// Illustrative group-chat messages. Composite, not quotes from real people.
const NOISE = [
  { who: "Rohan", t: "11:02", text: "anyone need a frontend dev for SIH? i know react" },
  { who: "Isha", t: "11:04", text: "team of 3, need ML + design. reply fast pls" },
  { who: "Aditya", t: "11:05", text: "is anyone doing PS 1729?? need 2 more" },
  { who: "Nikhil", t: "11:09", text: "looking for a team. can do backend, some flutter" },
  { who: "Kavya", t: "11:12", text: "need one more woman on the team for SIH rules, DM" },
  { who: "Varun", t: "11:15", text: "does anyone here actually ship or just join" },
  { who: "Sneha", t: "11:21", text: "registrations close tonight, still 2 short" },
  { who: "Tanvi", t: "11:26", text: "who knows figma?? anyone??" },
  { who: "Aman", t: "11:30", text: "our designer left the group" },
  { who: "Riya", t: "11:34", text: "can someone vouch for this guy before we add him" },
];

function ChatNoise() {
  const { ref, active } = useStoryActive<HTMLDivElement>(0.2);
  const rows = [...NOISE, ...NOISE];
  return (
    <div ref={ref} className="overflow-hidden rounded-xl border border-line bg-raised" aria-hidden>
      <div className="flex h-11 items-center justify-between gap-3 border-b border-line px-4">
        <span className="flex items-center gap-1.5 font-mono text-[12.5px] text-ink-2">
          <Hash className="size-3.5 text-ink-3" />
          find-a-team
        </span>
        <span className="font-mono text-[11.5px] text-ink-3">college group chat · 11:34 pm</span>
      </div>
      <div className="relative h-[300px] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_16%,black_84%,transparent)] md:h-[340px]">
        <motion.ul
          className="space-y-3.5 px-4 py-4"
          animate={active ? { y: ["0%", "-50%"] } : undefined}
          transition={{ duration: 48, ease: "linear", repeat: Infinity }}
        >
          {rows.map((m, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <Avatar name={m.who} size="sm" className="opacity-70" />
              <div className="min-w-0">
                <p className="text-[12px] text-ink-3">
                  <span className="font-medium text-ink-2">{m.who}</span> <span className="font-mono text-[11px]">{m.t}</span>
                </p>
                <p className="text-[14px] text-ink-2">{m.text}</p>
              </div>
            </li>
          ))}
        </motion.ul>
      </div>
    </div>
  );
}

/** 00 — why HackerMate exists, then the whole pipeline at a glance. */
export function ScrambleSection() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-16 border-b border-line">
      <Container className="py-16 md:py-24">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <Eyebrow>The problem</Eyebrow>
            <SectionTitle id="how-title" className="mt-4">
              Finding a team shouldn&apos;t cost you the hackathon.
            </SectionTitle>
            <Lede className="mt-5">
              Most teams still get assembled in group chats, from whoever replies first. You find out who can really build somewhere around hour
              twenty.
            </Lede>
            <figure className="mt-9 border-l-2 border-accent pl-5">
              <blockquote className="text-[15.5px] leading-[1.6] text-ink">
                {/* Founder note, verbatim from the V1 landing page. */}
                &ldquo;As a second-year engineering student, I lost count of how many hackathons I almost skipped simply because I couldn&apos;t
                find a reliable frontend developer or AI builder in time. HackerMate was built to solve team formation for good.&rdquo;
              </blockquote>
              <figcaption className="mt-3 text-[13px] text-ink-3">
                <span className="font-medium text-ink-2">Yash Shah</span> · Founder, 2nd-year CS engineering student
              </figcaption>
            </figure>
          </div>
          <div className="lg:col-span-7">
            <ChatNoise />
            <ExampleNote label="Illustration">Composite messages, not real people.</ExampleNote>
          </div>
        </div>

        <div className="mt-16 md:mt-20">
          <h3 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink [font-variation-settings:'wdth'_90] md:text-[30px]">
            HackerMate turns the scramble into a pipeline.
          </h3>
          <ol className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {STAGES.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-4 transition-colors hover:bg-hover md:grid-cols-[44px_110px_minmax(0,1fr)_230px] md:px-5"
                >
                  <span className="inline-flex h-[22px] w-fit items-center rounded-[4px] bg-accent-soft px-1.5 font-mono text-[11.5px] font-semibold text-accent-ink ring-1 ring-inset ring-accent/40 tabular">
                    {s.n}
                  </span>
                  <span className="caps-label text-ink">{s.verb}</span>
                  <span className="col-span-3 row-start-2 text-[14.5px] text-ink-2 md:col-span-1 md:row-start-auto">{s.line}</span>
                  <span className="col-start-3 row-start-1 flex items-center justify-end gap-2 font-mono text-[12px] text-ink-3 md:col-start-auto md:row-start-auto">
                    <ArrowRight className="size-3.5 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-ink" aria-hidden />
                    {s.output}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
