"use client";

import { memo } from "react";
import { LANDING_TOKENS } from "@/lib/design-tokens";
import { Check, ArrowRight } from "lucide-react";
import Link from "next/link";

export const SkillMatchShowcase = memo(function SkillMatchShowcase() {
  return (
    <section id="features" className={`w-full ${LANDING_TOKENS.spacing.section} bg-transparent relative z-10`}>
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

          {/* Left Column: Asymmetrical Copy Block */}
          <div className="lg:col-span-5 space-y-4 text-left">
            <p className={LANDING_TOKENS.text.eyebrow}>
              Skill Match Radar
            </p>

            <h2 className={LANDING_TOKENS.text.sectionH2}>
              Complementary technical pairings, zero duplicate roles.
            </h2>

            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
              Our matching algorithm balances technical stacks so you never end up in a team of four frontend developers with no backend or AI engineer.
            </p>

            <div className="pt-2 space-y-2.5 text-sm text-zinc-300">
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 shrink-0">
                  <Check className="w-2.5 h-2.5" />
                </div>
                <span>Matches Frontend, Backend, and AI/ML specialists</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 shrink-0">
                  <Check className="w-2.5 h-2.5" />
                </div>
                <span>Filters by college affiliation and hackathon goals</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 shrink-0">
                  <Check className="w-2.5 h-2.5" />
                </div>
                <span>Direct 1-click connect requests without spam</span>
              </div>
            </div>

            <div className="pt-3">
              <Link
                href="/login"
                className={LANDING_TOKENS.button.secondaryLink}
              >
                <span>Browse matching builders</span>
                <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Right Column: Browser-Chrome Product Showcase Frame */}
          <div className="lg:col-span-7">
            <div className={LANDING_TOKENS.surface.chrome}>
              {/* Window Chrome Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 bg-zinc-950">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                  <span className="ml-2 text-[10px] font-mono text-zinc-500 truncate">hackermate.in/radar</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  Live Synergy Check
                </span>
              </div>

              {/* Window Content: Real Matched Squad Mockup */}
              <div className="p-4 sm:p-5 space-y-3 bg-zinc-950/60">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-200">Suggested Team Squad</span>
                    <span className="text-[10px] font-mono text-zinc-500">SIH 2026 • AI Track</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">3 of 3 Roles Filled</span>
                </div>

                <div className="space-y-2">
                  {/* Match Card 1: Frontend */}
                  <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between gap-3 group/row hover:border-white/[0.18] hover:bg-zinc-900/70 transition-all duration-200 cursor-default">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-200 font-bold text-xs flex items-center justify-center shrink-0">
                        AS
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-zinc-200 truncate">Aarav Sharma</p>
                          <span className={LANDING_TOKENS.surface.tag}>Frontend Lead</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-mono truncate">IIT Bombay • Next.js, Tailwind, React</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 group-hover/row:text-[#B4F461] transition-colors shrink-0">Matched</span>
                  </div>

                  {/* Match Card 2: Backend */}
                  <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between gap-3 group/row hover:border-white/[0.18] hover:bg-zinc-900/70 transition-all duration-200 cursor-default">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-200 font-bold text-xs flex items-center justify-center shrink-0">
                        RP
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-zinc-200 truncate">Rohan Patel</p>
                          <span className={LANDING_TOKENS.surface.tag}>Backend Lead</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-mono truncate">BITS Pilani • FastAPI, Supabase, PostgreSQL</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 group-hover/row:text-[#B4F461] transition-colors shrink-0">Matched</span>
                  </div>

                  {/* Match Card 3: AI / ML */}
                  <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between gap-3 group/row hover:border-white/[0.18] hover:bg-zinc-900/70 transition-all duration-200 cursor-default">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-200 font-bold text-xs flex items-center justify-center shrink-0">
                        PN
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-zinc-200 truncate">Priya Nair</p>
                          <span className={LANDING_TOKENS.surface.tag}>AI / ML Engineer</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-mono truncate">DTU Delhi • PyTorch, Gemini API, Python</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 group-hover/row:text-[#B4F461] transition-colors shrink-0">Matched</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
});
