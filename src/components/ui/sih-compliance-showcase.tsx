"use client";

import { memo } from "react";
import { LANDING_TOKENS } from "@/lib/design-tokens";
import { CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";

export const SihComplianceShowcase = memo(function SihComplianceShowcase() {
  return (
    <section className={`w-full ${LANDING_TOKENS.spacing.section} bg-transparent relative z-10`}>
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

          {/* Left Column: Browser-Chrome SIH Validator Frame */}
          <div className="lg:col-span-7 order-2 lg:order-1">
            <div className={LANDING_TOKENS.surface.chrome}>
              {/* Window Chrome Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 bg-zinc-950">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                  <span className="ml-2 text-[10px] font-mono text-zinc-500 truncate">hackermate.in/sih-checker</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  SIH 2026 Ready
                </span>
              </div>

              {/* Window Content: Rule Validation Checklist */}
              <div className="p-4 sm:p-5 space-y-3 bg-zinc-950/60 text-xs">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5">
                  <span className="font-semibold text-zinc-200">Team Compliance Report</span>
                  <span className="text-[10px] font-mono text-zinc-400">Status: Complete</span>
                </div>

                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between group hover:border-white/[0.18] hover:bg-zinc-900/70 transition-all duration-200 cursor-default">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-zinc-300 group-hover:text-[#B4F461] transition-colors shrink-0" />
                      <div>
                        <p className="font-medium text-zinc-200">6-Member Squad Structure</p>
                        <p className="text-[10px] font-mono text-zinc-500">Exact required team count enforced</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 group-hover:text-[#B4F461] transition-colors">6 / 6 Members</span>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between group hover:border-white/[0.18] hover:bg-zinc-900/70 transition-all duration-200 cursor-default">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-zinc-300 group-hover:text-[#B4F461] transition-colors shrink-0" />
                      <div>
                        <p className="font-medium text-zinc-200">1+ Female Builder Quota</p>
                        <p className="text-[10px] font-mono text-zinc-500">Official SIH mandatory regulation</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 group-hover:text-[#B4F461] transition-colors">Validated</span>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between group hover:border-white/[0.18] hover:bg-zinc-900/70 transition-all duration-200 cursor-default">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-zinc-300 group-hover:text-[#B4F461] transition-colors shrink-0" />
                      <div>
                        <p className="font-medium text-zinc-200">Problem Statement Idea Deck</p>
                        <p className="text-[10px] font-mono text-zinc-500">AI format evaluation &amp; review</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 group-hover:text-[#B4F461] transition-colors">Ready</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Copy Block */}
          <div className="lg:col-span-5 space-y-4 text-left order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B4F461]/10 border border-[#B4F461]/25 text-[#B4F461] text-[11px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B4F461] animate-pulse" />
              <span>SIH 2026 Guidelines Verified</span>
            </div>

            <p className={LANDING_TOKENS.text.eyebrow}>
              SIH 2026 Engine
            </p>

            <h2 className={LANDING_TOKENS.text.sectionH2}>
              Automatic rule validation for Smart India Hackathon.
            </h2>

            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
              Form compliant teams effortlessly with built-in quotas, verified student email domains, and presentation deck review tools.
            </p>

            <div className="pt-3">
              <Link
                href="/hackathons/sih"
                className={LANDING_TOKENS.button.secondaryLink}
              >
                <span>Explore SIH 2026 Hub</span>
                <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
});
