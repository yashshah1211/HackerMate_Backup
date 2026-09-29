"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Mail, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/system";
import { Container, Eyebrow, Lede } from "@/components/landing/primitives";

export default function FAQPage() {
  const faqItems = [
    {
      q: "What is HackerMate?",
      a: "HackerMate is the ultimate Team Operating System designed specifically for hackathon builders. It helps developers, designers, and product managers find compatible teammates, form structured teams, and collaborate seamlessly to ship their projects on time."
    },
    {
      q: "How does the builder matching & compatibility score work?",
      a: "HackerMate calculates builder compatibility using a customized algorithm based on overlapping skills, matching goals, and hackathon schedules. When browsing builders, you will see a percentage score indicating how well your profiles align."
    },
    {
      q: "Is HackerMate free to use?",
      a: "Yes! HackerMate is 100% free for individual hackathon builders looking for teams and developers seeking to collaborate on projects."
    },
    {
      q: "How do I create or join a team?",
      a: "Once onboarding is complete, you can browse available teams in the 'Browse Teams' panel and send join requests. Alternatively, you can create a team profile, list the skills you are looking for, and invite compatible builders directly from the 'Find Builders' screen."
    },
    {
      q: "Can I manage multiple hackathons simultaneously?",
      a: "Absolutely. You can save multiple hackathons to your dashboard, track their specific schedules, and create separate team profiles for different events."
    },
    {
      q: "How do I report spam or platform abuse?",
      a: "We maintain a strict code of conduct. If you encounter harassment, spam, or fake builder profiles, please use the 'Contact Us' page or email our safety desk at contacthackermate@gmail.com immediately."
    }
  ];

  const [open, setOpen] = useState<number | null>(0);

  return (
    <main data-v2 className="border-b border-line">
      <Container className="grid grid-cols-1 gap-10 py-14 md:py-20 lg:grid-cols-12 lg:gap-14">
        <header className="lg:col-span-4">
          <Eyebrow>FAQ</Eyebrow>
          <h1
            data-v2-heading
            className="mt-4 font-display text-[34px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink text-balance [font-variation-settings:'wdth'_88] md:text-[46px]"
          >
            Frequently Asked Questions
          </h1>
          <Lede className="mt-5">
            Everything you need to know about building teams and shipping projects with HackerMate.
          </Lede>
        </header>

        <div className="min-w-0 lg:col-span-8">
          <ul className="divide-y divide-line border-y border-line">
            {faqItems.map((item, idx) => {
              const isOpen = open === idx;
              const panelId = `faq-page-panel-${idx}`;
              return (
                <li key={item.q}>
                  <h2>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpen(isOpen ? null : idx)}
                      className="flex min-h-14 w-full items-center justify-between gap-4 py-4 text-left text-[16px] font-medium text-ink transition-colors hover:text-ink-2"
                    >
                      {item.q}
                      <Plus
                        className={cn("size-4 shrink-0 text-ink-3 transition-transform duration-200", isOpen && "rotate-45 text-ink")}
                        aria-hidden
                      />
                    </button>
                  </h2>
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
                        <p className="max-w-[64ch] pb-5 text-[15px] leading-[1.65] text-ink-2">{item.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>

          {/* Still have questions */}
          <div className="mt-10 flex flex-col gap-4 rounded-lg border border-line bg-raised p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-ink">Still have questions?</h2>
              <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-ink-3">
                Our support desk is always online. Contact us via our official channel or reach out to our team directly.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <a
                href="mailto:contacthackermate@gmail.com"
                className={buttonClass("primary", "md", "h-10 max-w-full")}
              >
                <Mail aria-hidden />
                <span className="min-w-0 truncate">Email contacthackermate@gmail.com</span>
              </a>
              <Link href="/contact" className={buttonClass("secondary", "md", "h-10")}>
                Contact form
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}
