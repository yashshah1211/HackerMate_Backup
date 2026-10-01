"use client";

import Link from "next/link";
import { ArrowRight, ArrowDown } from "lucide-react";
import { ButtonLink } from "@/components/system";
import type { UpcomingHackathon } from "@/lib/getLandingData";
import { HeroPipeline } from "./HeroPipeline";
import { Container } from "./primitives";

function dayStamp(iso: string | null) {
  if (!iso) return { day: "--", month: "TBA" };
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("en-IN", { day: "2-digit", timeZone: "Asia/Kolkata" }),
    // en-US gives uniform three-letter months ("SEP", not en-IN's "SEPT") for the mono stamp.
    month: d.toLocaleDateString("en-US", { month: "short", timeZone: "Asia/Kolkata" }).toUpperCase(),
  };
}

function modeLabel(mode: string | null) {
  if (!mode) return "Hackathon";
  const m = mode.toLowerCase();
  if (m.includes("person") || m.includes("offline")) return "In person";
  if (m.includes("online")) return "Online";
  if (m.includes("hybrid")) return "Hybrid";
  return mode;
}

export function LandingHero({
  builderCount,
  teamCount,
  hackathonCount,
  upcoming,
}: {
  builderCount: number;
  teamCount: number;
  hackathonCount: number;
  upcoming: UpcomingHackathon[];
}) {
  // Real platform totals from getLandingData (server snapshot, refreshed every minute).
  // Each label names exactly what is counted. A number is only shown when the query
  // returned one, so a failed count never reads as "0".
  const totals = [
    { value: builderCount, label: builderCount === 1 ? "registered builder" : "registered builders" },
    { value: teamCount, label: teamCount === 1 ? "team created" : "teams created" },
    { value: hackathonCount, label: hackathonCount === 1 ? "hackathon listed" : "hackathons listed" },
  ].filter((t) => t.value > 0);
  return (
    <section aria-labelledby="hero-title" className="relative border-b border-line">
      <Container className="grid grid-cols-1 items-center gap-10 pb-12 pt-10 md:pt-16 lg:grid-cols-12 lg:gap-12 lg:pb-16 lg:pt-20">
        <div className="lg:col-span-6 xl:col-span-7">
          <p className="flex items-center gap-2.5 caps-label text-ink-2">
            <span aria-hidden className="size-2 rounded-[2px] bg-accent" />
            Team operating system for hackathons
          </p>
          <h1
            id="hero-title"
            data-v2-heading
            className="mt-5 font-display text-[38px] font-semibold leading-[0.98] tracking-[-0.035em] text-ink [font-variation-settings:'wdth'_86] min-[400px]:text-[42px] sm:text-[56px] lg:text-[64px] xl:text-[78px]"
          >
            <span className="block">Find teammates</span>
            <span className="block">
              who actually <span className="text-accent-ink">ship.</span>
            </span>
          </h1>
          <p className="mt-6 max-w-[46ch] text-[16.5px] leading-[1.6] text-ink-2 md:text-[18px]">
            Match with builders by skill and track record. Form a team with every gap covered. Then build, review your pitch and submit from one
            workspace.
          </p>
          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <ButtonLink href="/login" variant="primary" size="lg" iconRight={<ArrowRight />} className="w-full sm:w-auto">
              Find teammates
            </ButtonLink>
            <ButtonLink href="#how" variant="secondary" size="lg" iconRight={<ArrowDown />} className="w-full sm:w-auto">
              See how it works
            </ButtonLink>
          </div>
          {totals.length > 0 && (
            <dl className="mt-7 flex flex-wrap gap-x-7 gap-y-3" aria-label="HackerMate today">
              {totals.map((t) => (
                <div key={t.label} className="flex flex-col">
                  <dt className="order-2 mt-1 font-mono text-[12px] text-ink-3">{t.label}</dt>
                  <dd className="order-1 font-display text-[24px] font-semibold leading-none tracking-[-0.02em] text-ink tabular">
                    {t.value.toLocaleString("en-IN")}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[12px] text-ink-3">
            <span>Free for students</span>
            <span aria-hidden className="text-ink-4">/</span>
            <span>Sign in with Google or GitHub</span>
          </p>
        </div>

        <div className="lg:col-span-6 xl:col-span-5">
          <HeroPipeline />
        </div>
      </Container>

      {upcoming.length > 0 && (
        <div className="border-t border-line">
          <Container className="flex items-stretch gap-0 px-0 md:px-8">
            <p className="hidden shrink-0 items-center border-r border-line pr-5 caps-label text-ink-3 md:flex">Upcoming on HackerMate</p>
            <div className="relative min-w-0 flex-1">
              <ul className="flex snap-x overflow-x-auto scroll-px-5 scrollbar-none md:scroll-px-0" aria-label="Upcoming hackathons on HackerMate">
                <li className="flex shrink-0 items-center pl-5 pr-3 caps-label text-ink-3 md:hidden">Upcoming</li>
                {upcoming.map((h) => {
                  const d = dayStamp(h.start_date);
                  return (
                    <li key={h.id} className="shrink-0 snap-start">
                      <Link
                        href={`/hackathons/${h.id}`}
                        className="group flex h-14 items-center gap-3 border-r border-line px-5 transition-colors hover:bg-hover"
                      >
                        <span className="flex flex-col items-center font-mono leading-none">
                          <span className="text-[15px] font-semibold text-ink tabular">{d.day}</span>
                          <span className="mt-0.5 text-[12.5px] text-ink-3">{d.month}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-[200px] truncate text-[13.5px] font-medium text-ink group-hover:underline decoration-line-strong underline-offset-4">
                            {h.name}
                          </span>
                          <span className="block text-[12px] text-ink-3">{modeLabel(h.mode)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
                <li className="shrink-0 snap-start">
                  <Link href="/hackathons" className="flex h-14 items-center gap-1.5 px-5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink">
                    {hackathonCount > 0 ? `All ${hackathonCount.toLocaleString("en-IN")} listed` : "All hackathons"}
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </li>
              </ul>
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-canvas to-transparent" />
            </div>
          </Container>
        </div>
      )}
    </section>
  );
}

