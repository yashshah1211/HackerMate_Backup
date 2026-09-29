"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock, Cpu, Layers, TriangleAlert, Trophy, Zap } from "lucide-react";
import { ChallengeLeaderboard } from "@/components/challenges/ChallengeLeaderboard";
import {
  ButtonLink,
  EmptyState,
  ErrorNotice,
  FilterChip,
  Page,
  PageHeader,
  Panel,
  Progress,
  Section,
  Segmented,
  SkeletonRows,
  Tape,
  type TapeTone,
} from "@/components/system";
import { eventTimeline } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Challenge {
  id: string;
  challenge_number: number;
  title: string;
  slug: string;
  track: string;
  difficulty: string;
  summary: string;
  status: "active" | "closed" | "draft";
  starts_at: string;
  ends_at: string;
}

/** Presentational: difficulty → tape tone. */
function difficultyTone(difficulty: string | null | undefined): TapeTone {
  const d = (difficulty || "").toLowerCase();
  if (/(beginner|easy|starter)/.test(d)) return "ok";
  if (/(advanced|hard|expert)/.test(d)) return "bad";
  if (/(intermediate|medium)/.test(d)) return "warn";
  return "neutral";
}

const PILLARS = [
  {
    n: 1,
    title: "Problem framing & target personas",
    slides: "Slide 1",
    max: 25,
    intro: "Tests for root-cause understanding rather than generic symptom statements.",
    full: [
      "Name 2+ specific user personas with domain roles.",
      'Include quantified baseline metrics (e.g., "$120k/yr loss", "45 min delay").',
      "Highlight the real cost of inaction.",
    ],
    penalty: "-5 to -8 pts",
    penaltyText: "Vague statements with no personas or baseline metrics.",
  },
  {
    n: 2,
    title: "Solution design & innovation moat",
    slides: "Slide 2",
    max: 25,
    intro: "Rewards unique defensive moats over thin wrappers around generic APIs.",
    full: [
      "Detail an architectural moat (custom rule engine, offline cache, edge models).",
      "Show why existing market tools fail and how yours overcomes them.",
      "Walk through step-by-step user resolution.",
    ],
    penalty: "-5 to -8 pts",
    penaltyText: "Superficial ChatGPT wrapper app without proprietary logic.",
  },
  {
    n: 3,
    title: "Technical architecture & data pipeline",
    slides: "Slide 3 · highest weight",
    max: 30,
    intro: "Requires an unbroken end-to-end data pipeline flowchart and architecture.",
    full: [
      "Explicit data pipeline: Ingestion → Worker/Queue → Storage → Client.",
      "Database choices, latency budgets, and security/auth layers.",
      "Clear architecture block diagram flowchart.",
    ],
    penalty: "-7 to -12 pts",
    penaltyText: 'Merely listing logos ("React, Node, AI") without pipeline flow.',
  },
  {
    n: 4,
    title: "Feasibility, edge cases & roadmap",
    slides: "Slides 4, 5, 6",
    max: 20,
    intro: "Evaluates real-world system resilience, quantified ROI, and sprint readiness.",
    full: [
      "Address 3+ concrete edge cases with mitigation in Slide 4.",
      "Include baseline vs projected ROI metrics in Slide 5.",
      "Sprint milestones with explicit team roles in Slide 6.",
    ],
    penalty: "-4 to -7 pts",
    penaltyText: 'Omitting failure modes or vague "launching soon" roadmaps.',
  },
];

const CHECKLIST = [
  { slide: "Slide 1", title: "Problem Framing & Personas", check: "2+ Target Personas defined with quantified baseline friction metrics." },
  { slide: "Slide 2", title: "Proposed Solution & Value Moat", check: "Clear architectural value moat beyond existing commercial tools." },
  { slide: "Slide 3", title: "Technical Architecture & Pipeline", check: "End-to-end data flow: Client Ingestion → Backend Worker → DB → Client." },
  { slide: "Slide 4", title: "Feasibility & Risk Mitigation", check: "3+ Edge cases addressed (rate limits, offline mode, fallback behaviors)." },
  { slide: "Slide 5", title: "Impact & Quantified ROI", check: "Quantified baseline vs post-implementation target metrics." },
  { slide: "Slide 6", title: "Execution Roadmap & Team Roles", check: "Sprint milestones with explicit owner roles and deliverables." },
];

const DEDUCTIONS = [
  { pts: "-7 to -12 pts", title: "Missing End-to-End Data Pipeline (Slide 3)", body: "Occurs when tech stack is merely a list of logos without an explicit data flow architecture." },
  { pts: "-5 to -8 pts", title: "No Innovation Moat / Generic API Wrapper (Slide 2)", body: "Occurs when the solution is a thin layer over ChatGPT without proprietary domain logic." },
  { pts: "-5 to -8 pts", title: "Generic Problem Statement (Slide 1)", body: "Occurs when problem lacks specific target user personas and baseline friction numbers." },
  { pts: "-4 to -7 pts", title: "Ignoring Edge Cases & Fail-Safes (Slide 4)", body: "Occurs when failure scenarios (network offline, API timeout, bad input) have no mitigation." },
  { pts: "-3 to -5 pts", title: "Missing Metrics / Vague Roadmap (Slides 5 & 6)", body: "Occurs when impact metrics have no baseline comparison or roadmap has no role ownership." },
];

export default function ChallengesPage() {
  const router = useRouter();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<string>("all");
  const [rulesTab, setRulesTab] = useState<"rubric" | "checklist" | "deductions">("rubric");

  // 2-Hour TTL for draft restoration (7,200,000 ms)
  const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

  // If user lands on /challenges with a fresh unsubmitted draft, navigate directly to that challenge
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem("hackermate_challenge_draft");
      if (raw) {
        const draft = JSON.parse(raw);
        const savedAt = Number(draft?.savedAt);
        const now = Date.now();
        if (!isNaN(savedAt) && now - savedAt < DRAFT_TTL_MS) {
          if (draft.slug && draft.externalLink) {
            const queryParams = new URLSearchParams();
            queryParams.set("prefill_link", draft.externalLink);
            queryParams.set("ts", String(savedAt));
            if (draft.githubUrl) queryParams.set("github_url", draft.githubUrl);
            if (draft.demoUrl) queryParams.set("demo_url", draft.demoUrl);
            if (draft.submissionMode) queryParams.set("mode", draft.submissionMode);
            router.push(`/challenges/${encodeURIComponent(draft.slug)}?${queryParams.toString()}`);
          }
        } else {
          // Stale draft: purge
          sessionStorage.removeItem("hackermate_challenge_draft");
        }
      }
    } catch (err) {
      console.warn("[Challenges Hub] Error checking draft:", err);
    }
  }, [router]);

  useEffect(() => {
    async function loadChallenges() {
      try {
        const res = await fetch("/api/challenges");
        if (res.ok) {
          const data = await res.json();
          setChallenges(data.challenges || []);
        } else {
          console.error("Failed to load challenges: HTTP", res.status);
          setLoadError(`HTTP ${res.status}`);
        }
      } catch (err) {
        console.error("Failed to load challenges:", err);
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    loadChallenges();
  }, []);

  const isChallengeActive = (c: Challenge) => {
    return c.status === "active" && new Date(c.ends_at).getTime() > Date.now();
  };

  const activeChallenge = challenges.find((c) => isChallengeActive(c)) || challenges[0];
  const isActive = activeChallenge ? isChallengeActive(activeChallenge) : false;
  const pastChallenges = challenges.filter((c) => c.id !== activeChallenge?.id);

  const tracks = ["all", "Full-Stack / AI", "FinTech", "Cloud & Systems", "Open"];

  const filteredPast = selectedTrack === "all"
    ? pastChallenges
    : pastChallenges.filter((c) => c.track.toLowerCase().includes(selectedTrack.toLowerCase()));

  const getDaysRemaining = (endsAt: string) => {
    const diff = new Date(endsAt).getTime() - new Date().getTime();
    if (diff <= 0) return "Closed";
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return `${days} day${days > 1 ? "s" : ""} left`;
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Weekly challenges"
        title="Practice"
        meta="Real problem statements, solo or with your team. Submit a 6-slide deck and get slide-by-slide AI feedback before deadline day."
      />

      <div className="mt-2 space-y-10">
        {/* Current challenge */}
        {loading ? (
          <SkeletonRows rows={2} avatar="none" />
        ) : loadError ? (
          <ErrorNotice title="Couldn't load challenges" detail={loadError} />
        ) : activeChallenge ? (
          <Section
            title={isActive ? "This week" : "Latest challenge"}
            action={
              <span className={cn("inline-flex items-center gap-1.5 font-mono text-[12px] tabular", isActive ? "text-accent-ink" : "text-ink-3")}>
                <Clock className="size-3.5" aria-hidden />
                {getDaysRemaining(activeChallenge.ends_at)}
              </span>
            }
          >
            <Panel className="p-4 md:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 max-w-3xl">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[12px] text-ink-3 tabular">#{activeChallenge.challenge_number}</span>
                    <Tape>{activeChallenge.track}</Tape>
                    <Tape tone={difficultyTone(activeChallenge.difficulty)}>{activeChallenge.difficulty}</Tape>
                    {isActive ? <Tape tone="ok" dot>Open</Tape> : <Tape tone="bad">Closed</Tape>}
                  </div>
                  <h2 className="mt-2 font-display text-[20px] font-semibold leading-tight tracking-[-0.02em] text-ink md:text-[22px] [font-variation-settings:'wdth'_92]">
                    {activeChallenge.title}
                  </h2>
                  <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">
                    {activeChallenge.summary || "Review the briefing, build your 6-slide architecture pitch deck, and get instant AI scoring."}
                  </p>
                </div>
                <ButtonLink
                  href={`/challenges/${activeChallenge.slug}`}
                  variant={isActive ? "primary" : "secondary"}
                  size="lg"
                  iconRight={<ArrowRight />}
                  className="w-full shrink-0 sm:w-auto"
                >
                  {isActive ? "Submit solution" : "View briefing"}
                </ButtonLink>
              </div>
            </Panel>
          </Section>
        ) : (
          <EmptyState icon={<Zap />} title="No challenges yet" body="New practice challenges are posted weekly." />
        )}

        {/* How it works */}
        <ul className="grid grid-cols-1 gap-x-8 gap-y-5 border-y border-line py-5 md:grid-cols-3">
          {[
            { icon: <Layers />, title: "Standard 6-slide format", body: "Problem, solution moat, architecture, risk mitigation, impact baseline and sprint roadmap." },
            { icon: <Cpu />, title: "Instant AI review", body: "Slide-by-slide feedback, score deductions and concrete fixes from a multi-model evaluator." },
            { icon: <Trophy />, title: "Iterate and resubmit", body: "Revise from the feedback and track your score across versions." },
          ].map((p) => (
            <li key={p.title} className="flex min-w-0 gap-3">
              <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-selected text-ink-2 [&_svg]:size-4" aria-hidden>
                {p.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink">{p.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>

        {/* Scoring rules */}
        <Section
          title="How decks are scored"
          count="100 pts"
          description="What the AI review checks for, and what costs points."
          action={
            <Segmented
              label="Scoring guide view"
              size="sm"
              value={rulesTab}
              onChange={setRulesTab}
              options={[
                { value: "rubric", label: "4 pillars" },
                { value: "checklist", label: "Checklist" },
                { value: "deductions", label: "Deductions" },
              ]}
            />
          }
        >
          {rulesTab === "rubric" && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {PILLARS.map((p) => (
                <Panel key={p.n} className="min-w-0 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="caps-label text-ink-3">
                        {p.n} · {p.slides}
                      </p>
                      <h3 className="mt-1 text-[13.5px] font-semibold text-ink">{p.title}</h3>
                    </div>
                    <span className="shrink-0 font-mono text-[12px] text-ink-2 tabular">{p.max} pts</span>
                  </div>
                  <Progress value={(p.max / 30) * 100} className="mt-3" />
                  <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">{p.intro}</p>
                  <p className="mt-3 caps-label text-ink-3">
                    For {p.max}/{p.max}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {p.full.map((f) => (
                      <li key={f} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-2">
                        <CheckCircle2 className="mt-[3px] size-3.5 shrink-0 text-ok" aria-hidden />
                        <span className="min-w-0">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 flex gap-2 border-t border-line pt-3 text-[12.5px] leading-relaxed text-ink-2">
                    <TriangleAlert className="mt-[3px] size-3.5 shrink-0 text-bad" aria-hidden />
                    <span className="min-w-0">
                      <span className="font-mono text-[11.5px] text-bad">{p.penalty}</span> {p.penaltyText}
                    </span>
                  </p>
                </Panel>
              ))}
            </div>
          )}

          {rulesTab === "checklist" && (
            <ol className="divide-y divide-line border-y border-line">
              {CHECKLIST.map((item) => (
                <li key={item.slide} className="flex gap-3 py-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-ink">
                      <span className="font-mono text-[12px] text-ink-3">{item.slide}</span> · {item.title}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">{item.check}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {rulesTab === "deductions" && (
            <ul className="divide-y divide-line border-y border-line">
              {DEDUCTIONS.map((d) => (
                <li key={d.title} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <Tape tone="bad" className="self-start">{d.pts}</Tape>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-ink">{d.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">{d.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Leaderboard */}
        <ChallengeLeaderboard
          title="Top decks this week"
          subtitle="Highest-scoring decks across all challenges."
        />

        {/* Archive */}
        {pastChallenges.length > 0 && (
          <Section title="Archive" count={filteredPast.length} description="Past problem statements. Practice at your own pace.">
            <div className="-mx-4 mb-3 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:px-0">
              {tracks.map((track) => (
                <FilterChip key={track} active={selectedTrack === track} onClick={() => setSelectedTrack(track)}>
                  {track === "all" ? "All tracks" : track}
                </FilterChip>
              ))}
            </div>

            {filteredPast.length === 0 ? (
              <EmptyState compact title="No challenges in this track" body="Try another track." />
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {filteredPast.map((challenge) => {
                  const tl = eventTimeline(challenge.starts_at, challenge.ends_at);
                  return (
                    <li key={challenge.id}>
                      <Link
                        href={`/challenges/${challenge.slug}`}
                        className="group -mx-2 flex min-w-0 items-start gap-3 rounded-md px-2 py-3 transition-colors hover:bg-hover md:items-center"
                      >
                        <span className="w-10 shrink-0 pt-px font-mono text-[12.5px] text-ink-3 tabular md:pt-0">
                          #{challenge.challenge_number}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-ink">{challenge.title}</p>
                          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-ink-3">
                            {challenge.summary || "View challenge problem statement and evaluation rubric."}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 md:hidden">
                            <Tape>{challenge.track}</Tape>
                            <Tape tone={difficultyTone(challenge.difficulty)}>{challenge.difficulty}</Tape>
                            <span className="font-mono text-[11.5px] text-ink-3">{tl.label}</span>
                          </div>
                        </div>
                        <div className="hidden shrink-0 items-center gap-1.5 md:flex">
                          <Tape>{challenge.track}</Tape>
                          <Tape tone={difficultyTone(challenge.difficulty)}>{challenge.difficulty}</Tape>
                        </div>
                        <div className="hidden w-28 shrink-0 text-right md:block">
                          <p className="font-mono text-[11.5px] text-ink-3">{tl.label}</p>
                          <p className="mt-0.5 caps-label text-ink-3">{challenge.status}</p>
                        </div>
                        <ArrowRight className="mt-0.5 size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink md:mt-0" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}
      </div>
    </Page>
  );
}
