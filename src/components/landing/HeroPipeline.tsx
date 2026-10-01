"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Globe, Presentation, RotateCcw, Search, Trophy } from "lucide-react";
import { Avatar, AvatarStack, Chip, Progress, SeatMeter, StatusDot, Tape, TeamMark } from "@/components/system";
import { cn } from "@/lib/utils";
import { EXAMPLE_BUILDERS, EXAMPLE_COUNTDOWN_SECONDS, EXAMPLE_DEMO_HOST, EXAMPLE_TEAM, pad2, splitCountdown } from "./fixtures";
import { ExampleNote, STAGES, useCountdown, useStoryActive } from "./primitives";

type Phase = "queued" | "running" | "done";

/** How long each stage "runs" in the hero pipeline (ms). */
const DURATIONS = [2600, 2100, 2300, 2200, 2400];
/** Fixed height of the open stage so the hero never jumps. */
const OPEN_H = 196;
/** Height of a stage row (matches h-[46px] + 1px border). */
const ROW_H = 47;

/** Counts 0 → total while `run` is true (one tick every `ms`). */
function useSequence(total: number, ms: number, run: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run || n >= total) return;
    const t = window.setTimeout(() => setN((v) => v + 1), ms);
    return () => window.clearTimeout(t);
  }, [run, n, total, ms]);
  return n;
}

/** Result line for a passed stage: full on wider screens, short on phones (≤ ~18 chars fits 360px). */
const SUMMARY: Record<string, { full: string; short: string }> = {
  find: { full: "Meera Iyer · adds Figma", short: "Meera · adds Figma" },
  review: { full: "5 hackathons · 1 win · 3 shipped", short: "1 win · 3 shipped" },
  merge: { full: "4/6 seats · every skill covered", short: "All skills covered" },
  build: { full: "7/12 tasks done · 12d left", short: "7/12 tasks done" },
  ship: { full: "Demo up · submitted", short: "Live · submitted" },
};

/**
 * The hero: one team's run through HackerMate, rendered like a CI pipeline.
 * Each stage opens to show the real V2 surface for that step, then passes.
 * Runs once when it scrolls into view; rows are clickable afterwards.
 */
export function HeroPipeline() {
  const { ref, active, reduced } = useStoryActive<HTMLDivElement>(0.3);
  const [step, setStep] = useState(0); // index of the running stage; 5 = passed
  const [runId, setRunId] = useState(0);
  const [manual, setManual] = useState<number | null>(null);

  useEffect(() => {
    if (!active || manual !== null || step >= STAGES.length) return;
    const t = window.setTimeout(() => setStep((s) => s + 1), DURATIONS[step]);
    return () => window.clearTimeout(t);
  }, [active, manual, step]);

  const effStep = reduced || manual !== null ? STAGES.length : step;
  const passed = effStep >= STAGES.length;
  const open = manual !== null ? manual : passed ? STAGES.length - 1 : effStep;
  const phaseOf = (i: number): Phase => (effStep > i ? "done" : effStep === i ? "running" : "queued");
  const doneCount = Math.min(effStep, STAGES.length);
  // Spine fill in px: down to the running node (or the last node once passed),
  // accounting for an open stage sitting above that node.
  const target = passed ? STAGES.length - 1 : effStep;
  const spineFill = target * ROW_H + (open < target ? OPEN_H : 0);

  const replay = () => {
    setManual(null);
    setStep(0);
    setRunId((r) => r + 1);
  };

  return (
    <div ref={ref} className="relative">
      <p className="sr-only">
        Example: a team called Null Pointers goes through HackerMate. They find a designer by searching for Figma, check her track record,
        add her to the team so every required skill is covered, plan the build in their workspace, and submit with the demo online.
      </p>
      <div className="overflow-hidden rounded-xl border border-line-strong/80 bg-raised shadow-[0_28px_70px_-36px_rgb(0_0_0/0.9)]">
        {/* Run header */}
        <div className="flex h-11 items-center justify-between gap-3 border-b border-line px-3.5">
          <span className="flex min-w-0 items-center gap-2.5">
            <TeamMark name={EXAMPLE_TEAM.name} tone="hack" size="sm" className="!size-6 !rounded-[5px] !text-[9.5px]" />
            <span className="truncate font-mono text-[12px] text-ink-2">
              null-pointers
              <span className="hidden min-[440px]:inline">
                {" "}
                <span className="text-ink-4">→</span> {EXAMPLE_TEAM.eventSlug}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {passed ? (
              <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-ok">
                <Check className="size-3.5" aria-hidden /> passed {STAGES.length}/{STAGES.length}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-accent-ink tabular">
                <StatusDot tone="accent" pulse /> running {doneCount + 1}/{STAGES.length}
              </span>
            )}
            {passed && !reduced && (
              <button
                type="button"
                onClick={replay}
                className="inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-[12px] font-medium text-ink-3 transition-colors hover:bg-hover hover:text-ink"
              >
                <RotateCcw className="size-3.5" aria-hidden /> Replay
              </button>
            )}
          </span>
        </div>

        {/* Stages */}
        <ol className="relative">
          {/* Spine: fills from the first node down to the current one. */}
          <motion.span
            aria-hidden
            className="absolute left-[23px] top-[23px] w-px bg-line"
            initial={false}
            animate={{ height: (STAGES.length - 1) * ROW_H + (open < STAGES.length - 1 ? OPEN_H : 0) }}
            transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
          />
          <motion.span
            aria-hidden
            className="absolute left-[23px] top-[23px] w-px bg-ok/70"
            initial={false}
            animate={{ height: spineFill }}
            transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          />
          {STAGES.map((s, i) => {
            const phase = phaseOf(i);
            const isOpen = open === i;
            return (
              <li key={s.id} className={cn("relative border-b border-line last:border-b-0", phase === "running" && "bg-accent-soft/40")}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setManual(i)}
                  className="relative flex h-[46px] w-full items-center gap-3 px-3.5 text-left transition-colors hover:bg-hover"
                >
                  <StageNode phase={phase} />
                  <span className="w-[22px] shrink-0 font-mono text-[12.5px] text-ink-3 tabular">{s.n}</span>
                  <span className={cn("w-[62px] shrink-0 caps-label", phase === "queued" ? "text-ink-3" : "text-ink")}>{s.verb}</span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[13px]",
                      phase === "done" ? "text-ink-2" : phase === "running" ? "font-mono text-[12px] text-accent-ink" : "font-mono text-[12px] text-ink-4",
                    )}
                  >
                    {phase === "done" ? (
                      <>
                        <span className="sm:hidden">{SUMMARY[s.id].short}</span>
                        <span className="hidden sm:inline">{SUMMARY[s.id].full}</span>
                      </>
                    ) : phase === "running" ? (
                      "running…"
                    ) : (
                      "queued"
                    )}
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-ink-4 transition-transform", isOpen && "rotate-180")} aria-hidden />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key={`${runId}-${s.id}-${manual !== null ? "m" : "a"}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: OPEN_H, opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      {/* Body aligns with the stage-number column (14px pad + 18px node + 12px gap). */}
                      <div className="h-full px-3.5 pb-3.5 pl-[44px] pt-0.5" aria-hidden>
                        <StageBody id={s.id} phase={phase} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ol>
      </div>
      <ExampleNote>An illustrative team&apos;s run, from search to submission.</ExampleNote>
    </div>
  );
}

function StageNode({ phase }: { phase: Phase }) {
  return (
    <span className="relative z-10 inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] bg-raised">
      {phase === "done" ? (
        <span className="inline-flex size-[18px] items-center justify-center rounded-[5px] bg-ok-soft text-ok ring-1 ring-inset ring-ok/30">
          <Check className="size-3" strokeWidth={3} aria-hidden />
        </span>
      ) : phase === "running" ? (
        <span className="relative inline-flex size-[18px] items-center justify-center rounded-[5px] bg-accent">
          <span className="size-1.5 animate-pulse rounded-full bg-on-accent" />
        </span>
      ) : (
        <span className="inline-flex size-[18px] rounded-[5px] ring-1 ring-inset ring-line-strong" />
      )}
    </span>
  );
}

function StageBody({ id, phase }: { id: string; phase: Phase }) {
  if (id === "find") return <FindBody phase={phase} />;
  if (id === "review") return <ReviewBody phase={phase} />;
  if (id === "merge") return <MergeBody phase={phase} />;
  if (id === "build") return <BuildBody phase={phase} />;
  return <ShipBody phase={phase} />;
}

/** Reveal helper: fades/lifts children in once `show` turns true. */
function Reveal({ show, children, className, delay = 0 }: { show: boolean; children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={false}
      animate={{ opacity: show ? 1 : 0, y: show ? 0 : 6 }}
      transition={{ duration: 0.28, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ── 01 find: search for the missing skill, get a reasoned match ─────── */
function FindBody({ phase }: { phase: Phase }) {
  const seq = useSequence(8, 120, phase === "running");
  const shown = phase === "done" ? 8 : seq;
  const query = "figma".slice(0, Math.min(shown, 5));
  const b = EXAMPLE_BUILDERS[0];
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex h-8 shrink-0 items-center gap-2 rounded-md bg-sunken px-2.5 ring-1 ring-inset ring-line-strong">
        <Search className="size-3.5 shrink-0 text-ink-3" />
        {query ? <span className="font-mono text-[12.5px] text-ink">{query}</span> : <span className="text-[12.5px] text-ink-4">Search skills, roles, colleges</span>}
        {phase === "running" && shown < 5 && <span className="-ml-1.5 h-3.5 w-px animate-pulse bg-ink-2" />}
        {shown >= 6 && <span className="ml-auto font-mono text-[12px] text-ink-3">sorted by fit</span>}
      </div>
      <Reveal show={shown >= 6} className="min-w-0 rounded-md border border-line bg-canvas p-2.5">
        <div className="flex items-start gap-2.5">
          <Avatar name={b.name} size="md" presence="online" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[13.5px] font-semibold text-ink">{b.name}</span>
                <Tape tone="ok" className="hidden min-[400px]:inline-flex">Available</Tape>
              </span>
              <Tape tone="accent">Strong fit</Tape>
            </div>
            <p className="mt-0.5 truncate text-[12px] text-ink-3">
              {b.college} · {b.year} · {b.lastActive}
            </p>
            <Reveal show={shown >= 7} className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-ink-2">
              <span className="mt-[5px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              <span className="line-clamp-2">{b.reason}</span>
            </Reveal>
            <div className="mt-1.5 flex flex-wrap gap-1 overflow-hidden [max-height:24px]">
              {b.skills.map((s) => (
                <Chip key={s} active={s === "Figma"}>
                  {s}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

/* ── 02 review: the track record behind the match ───────────────────── */
const LANGS = [
  { name: "TypeScript", pct: 46, cls: "bg-hack" },
  { name: "Python", pct: 31, cls: "bg-warn" },
  { name: "Swift", pct: 23, cls: "bg-proj" },
];

function ReviewBody({ phase }: { phase: Phase }) {
  const seq = useSequence(4, 260, phase === "running");
  const shown = phase === "done" ? 4 : seq;
  // [label, short label for phones, value]
  const stats = [
    ["Hackathons", "Events", "5"],
    ["Wins", "Wins", "1"],
    ["Shipped", "Shipped", "3"],
    ["Teams", "Teams", "4"],
  ];
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <Avatar name="Meera Iyer" size="lg" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5">
            <span className="truncate font-display text-[17px] font-semibold tracking-[-0.01em] text-ink">Meera Iyer</span>
            <Tape tone="warn" icon={<Trophy />}>
              1 win
            </Tape>
          </p>
          <p className="truncate text-[12px] text-ink-3">
            NIT Trichy · Design and frontend<span className="hidden sm:inline"> · Open to teams</span>
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-4 divide-x divide-line rounded-md border border-line bg-canvas">
        {stats.map(([label, short, value], i) => (
          <Reveal key={label} show={shown >= 1} delay={i * 0.06} className="min-w-0 px-1.5 py-1.5 sm:px-2">
            <dt className="truncate caps-label text-ink-3">
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </dt>
            <dd className="mt-0.5 font-display text-[17px] font-semibold leading-none text-ink tabular">{value}</dd>
          </Reveal>
        ))}
      </dl>
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="caps-label text-ink-3">GitHub languages</span>
          <span className="font-mono text-[12px] text-ink-3">synced</span>
        </div>
        <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-selected">
          {LANGS.map((l) => (
            <span
              key={l.name}
              className={cn("h-full rounded-full transition-[width] duration-700 ease-out", l.cls)}
              style={{ width: shown >= 2 ? `${l.pct}%` : "0%" }}
            />
          ))}
        </div>
        <p className="mt-1.5 truncate font-mono text-[12px] text-ink-3">
          {LANGS.map((l) => `${l.name} ${l.pct}%`).join(" · ")}
        </p>
      </div>
    </div>
  );
}

/* ── 03 merge: she joins, the last skill gap closes ─────────────────── */
function MergeBody({ phase }: { phase: Phase }) {
  const seq = useSequence(3, 520, phase === "running");
  const shown = phase === "done" ? 3 : seq;
  const joined = shown >= 1;
  const skills = ["React", "Python", "PostgreSQL", "Figma"];
  const covered = joined ? 4 : 3;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <TeamMark name={EXAMPLE_TEAM.name} tone="hack" size="sm" className="hidden min-[400px]:inline-flex" />
          <span className="truncate text-[13.5px] font-semibold text-ink">{EXAMPLE_TEAM.name}</span>
          <Tape tone="hack" className="hidden min-[400px]:inline-flex">
            Hackathon
          </Tape>
        </span>
        <SeatMeter filled={joined ? 4 : 3} total={6} />
      </div>
      <div className="flex items-center gap-2.5">
        <AvatarStack
          size="sm"
          people={[
            { id: "a", name: "Ananya Rao" },
            { id: "s", name: "Sara Qureshi" },
            { id: "k", name: "Kabir Menon" },
          ]}
        />
        <Reveal show={joined} className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-2">
          <Avatar name="Meera Iyer" size="sm" />
          <span className="truncate">
            <span className="font-medium text-ink">Meera</span> joined as Design
          </span>
        </Reveal>
      </div>
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="caps-label text-ink-3">Stack coverage</span>
          <span className={cn("font-mono text-[12px] tabular", covered === 4 ? "text-ok" : "text-ink-2")}>{Math.round((covered / 4) * 100)}%</span>
        </div>
        <Progress value={(covered / 4) * 100} tone={covered === 4 ? "ok" : "warn"} />
        <div className="mt-2 flex flex-wrap items-center gap-1 overflow-hidden [max-height:24px]">
          {skills.map((s) => (
            <Chip key={s} active={s !== "Figma" || joined}>
              {s}
            </Chip>
          ))}
        </div>
      </div>
      <Reveal show={shown >= 2} className="mt-auto">
        <Tape tone="ok" icon={<Check />}>
          Every skill covered
        </Tape>
      </Reveal>
    </div>
  );
}

/* ── 04 build: the event clock is running, work moves ───────────────── */
function BuildBody({ phase }: { phase: Phase }) {
  const seq = useSequence(2, 700, phase === "running");
  const shown = phase === "done" ? 2 : seq;
  const left = useCountdown(EXAMPLE_COUNTDOWN_SECONDS, phase !== "queued");
  const c = splitCountdown(left);
  const tasks = [
    { title: "Face-match API", who: "Kabir Menon", done: shown >= 1 },
    { title: "Attendance dashboard", who: "Ananya Rao", done: false, doing: true },
    { title: "Pitch deck v2", who: "Meera Iyer", done: false },
  ];
  const doneCount = shown >= 1 ? 7 : 6;
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate caps-label text-ink-3">Event · {EXAMPLE_TEAM.eventShort}</span>
        <span className="shrink-0 font-mono text-[14px] font-semibold text-ink tabular">
          {c.days}
          <span className="text-[12px] text-ink-4">d </span>
          {pad2(c.hours)}
          <span className="text-[12px] text-ink-4">h </span>
          {pad2(c.minutes)}
          <span className="text-[12px] text-ink-4">m </span>
          <span className="text-ink-3">{pad2(c.seconds)}</span>
          <span className="text-[12px] text-ink-4">s</span>
        </span>
      </div>
      <ul className="divide-y divide-line rounded-md border border-line bg-canvas">
        {tasks.map((t) => (
          <li key={t.title} className="flex h-[33px] items-center gap-2 px-2.5">
            <span
              className={cn(
                "inline-flex size-3.5 shrink-0 items-center justify-center rounded-[3px] ring-1 ring-inset transition-colors duration-300",
                t.done ? "bg-ok text-canvas ring-ok" : "ring-line-strong",
              )}
            >
              {t.done && <Check className="size-2.5" strokeWidth={3.5} />}
            </span>
            <span className={cn("min-w-0 flex-1 truncate text-[12.5px] transition-colors", t.done ? "text-ink-3 line-through decoration-ink-4" : "text-ink")}>{t.title}</span>
            <Avatar name={t.who} size="xs" />
            <span className={cn("hidden w-[74px] shrink-0 text-right font-mono text-[12px] min-[400px]:inline", t.done ? "text-ok" : t.doing ? "text-warn" : "text-ink-3")}>
              {t.done ? "done" : t.doing ? "in progress" : "to do"}
            </span>
          </li>
        ))}
      </ul>
      <div>
        <div className="mb-1 flex justify-between text-[12.5px] text-ink-3">
          <span>Tasks done</span>
          <span className="font-mono tabular">{doneCount}/12</span>
        </div>
        <Progress value={(doneCount / 12) * 100} />
      </div>
    </div>
  );
}

/* ── 05 ship: demo reachable, deck reviewed, submitted ─────────────── */
function ShipBody({ phase }: { phase: Phase }) {
  const seq = useSequence(3, 600, phase === "running");
  const shown = phase === "done" ? 3 : seq;
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex items-center gap-2.5 rounded-md border border-line bg-canvas px-2.5 py-2">
        <Globe className="size-4 shrink-0 text-ink-3" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{EXAMPLE_DEMO_HOST}</span>
        {shown >= 1 ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-ok">
            <StatusDot tone="ok" /> Reachable <span className="hidden font-mono text-[12px] text-ink-3 min-[400px]:inline">182ms</span>
          </span>
        ) : (
          <span className="shrink-0 text-[12px] text-ink-3">Checking…</span>
        )}
      </div>
      <Reveal show={shown >= 2} className="flex items-center gap-2.5 rounded-md border border-line bg-canvas px-2.5 py-2">
        <Presentation className="size-4 shrink-0 text-ink-3" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">Pitch review · deck v3</span>
        <span className="shrink-0 font-mono text-[12.5px] text-ink-2">
          3 fixes<span className="hidden min-[400px]:inline"> applied</span>
        </span>
      </Reveal>
      <motion.div
        className="mt-auto flex items-center gap-2.5"
        initial={false}
        animate={{ opacity: shown >= 3 ? 1 : 0, scale: shown >= 3 ? 1 : 0.96 }}
        transition={{ type: "spring", stiffness: 420, damping: 26 }}
      >
        <Tape tone="solid" icon={<Check />} className="h-6 px-2">
          Submitted
        </Tape>
        <span className="truncate text-[12.5px] text-ink-2">
          <span className="min-[400px]:hidden">{EXAMPLE_TEAM.eventShort}</span>
          <span className="hidden min-[400px]:inline">{EXAMPLE_TEAM.event}</span>
        </span>
      </motion.div>
    </div>
  );
}

