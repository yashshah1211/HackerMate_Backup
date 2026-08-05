"use client";

import Link from "next/link";

type Props = {
  activeCollege: string;
  onSelectCollege: (college: string) => void;
};

export default function DJSCEHackathonHeader({ activeCollege, onSelectCollege }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-gradient-to-r dark:from-emerald-950 dark:via-zinc-900 dark:to-zinc-950 border border-zinc-200 dark:border-emerald-500/30 p-6 shadow-xl mb-8">
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
        <div className="space-y-2 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full text-[10px] font-mono font-extrabold uppercase bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 tracking-wider">
              🏛️ Official College Partner Portal
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-400 dark:text-zinc-950 dark:border-amber-300">
              D.J. Sanghvi College of Engineering (DJSCE)
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            SIH 2026 Internal Hackathon Screening Portal
          </h1>

          <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed font-sans">
            Welcome DJSCE builders! Submit your 6-member squad pitch deck for automated AI screening, SPOC rule validation, and live faculty jury scoring. Top Software & Hardware teams will be nominated for the National Finals!
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/hackathons/sih/spoc"
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-extrabold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
          >
            👑 College SPOC & HOD Dashboard →
          </Link>
        </div>
      </div>
    </div>
  );
}
