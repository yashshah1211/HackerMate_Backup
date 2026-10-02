"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, Eyebrow, SectionTitle } from "./primitives";

type Item = { q: string; a: string; organizer?: boolean };

const ITEMS: Item[] = [
  { q: "Is HackerMate free?", a: "Yes. Profiles, search, teams and team workspaces are free for students." },
  {
    q: "How are builders suggested to me?",
    a: "Suggestions weigh how much someone adds to your stack, the fundamentals you share, their hackathon experience and whether they're available. Each one lists its reasons, and you can always filter the full directory yourself.",
  },
  {
    q: "What's on a builder's profile?",
    a: "Skills, college and links, plus a track record: hackathons entered and won, teams, and delivered projects with demo, code and slide links. GitHub languages can be synced. Anyone can hide their track record in Settings.",
  },

  { q: "How do I sign in?", a: "With Google or GitHub. You set up your builder profile right after, then you can start searching." },
  { q: "I'm organising a hackathon. Can I list it?", a: "Yes. Listing is free for college and community hackathons.", organizer: true },
];

export function LandingFaq({ onOrganizer }: { onOrganizer: () => void }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 border-b border-line">
      <Container className="grid grid-cols-1 gap-10 py-16 md:py-24 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-4">
          <Eyebrow>Questions</Eyebrow>
          <SectionTitle id="faq-title" className="mt-4">
            Before you sign up.
          </SectionTitle>
          <p className="mt-5 text-[15px] text-ink-2">
            Something else?{" "}
            <Link href="/contact" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Contact us
            </Link>{" "}
            or read the{" "}
            <Link href="/faq" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              full FAQ
            </Link>
            .
          </p>
        </div>
        <ul className="divide-y divide-line border-y border-line lg:col-span-8">
          {ITEMS.map((item, i) => {
            const isOpen = open === i;
            const panelId = `faq-panel-${i}`;
            return (
              <li key={item.q}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex min-h-14 w-full items-center justify-between gap-4 py-4 text-left text-[16px] font-medium text-ink transition-colors hover:text-ink-2"
                  >
                    {item.q}
                    <Plus className={cn("size-4 shrink-0 text-ink-3 transition-transform duration-200", isOpen && "rotate-45 text-ink")} aria-hidden />
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={panelId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="max-w-[64ch] pb-5 text-[15px] leading-[1.65] text-ink-2">
                        {item.a}
                        {item.organizer && (
                          <button
                            type="button"
                            onClick={onOrganizer}
                            className="ml-2 inline-flex items-center gap-1 font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                          >
                            Get in touch <ArrowRight className="size-3.5" aria-hidden />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
