"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Mic,
  Paperclip,
  PenTool,
  Pin as PinIcon,
  SendHorizontal,
  UserPlus,
} from "lucide-react";
import { Avatar, AvatarStack, Chip, Progress, StatusDot, Tape, TeamMark, buttonClass } from "@/components/system";
import { WORKSPACE_SECTIONS, type WorkspaceTab } from "@/components/workspace/WorkspaceFrame";
import { cn } from "@/lib/utils";
import { EXAMPLE_COUNTDOWN_SECONDS, EXAMPLE_TEAM, pad2, splitCountdown } from "./fixtures";
import { Container, Lede, SectionTitle, StageLabel, useCountdown, useStoryActive } from "./primitives";

const CAPTIONS: Record<WorkspaceTab, string> = {
  chat: "The team thread, with voice notes, images, link previews and reactions.",
  tasks: "A board with owners, priorities and due dates. Drag cards between columns.",
  brainstorm: "Post ideas and vote on them, or write the plan together in a shared doc.",
  resources: "The Figma file, repo, deck and problem statement, one tap away for everyone.",
  github: "Link the repo to see recent commits and who is pushing code.",
  deployments: "Add your demo and API URLs and check they're reachable before judging.",
  activity: "New tasks, finished tasks, shared links and doc saves, newest first.",
  ppt: "An AI review of your pitch deck against the judging rubric for your track.",
  gap_filler: "Builders who have the skills your team is still missing, ready to invite.",
};

const CYCLE_MS = 4600;

/* ── Section bodies (container-query responsive: same content, any width) ── */

function ChatBody() {
  const msgs = [
    { who: "Kabir Menon", t: "21:04", text: "Pushed the face-match endpoint. About 180ms per frame on CPU." },
    { who: "Sara Qureshi", t: "21:06", text: "Nice. Wiring it into the attendance API now.", react: "2" },
    { who: "Meera Iyer", t: "21:11", voice: "0:18" },
    { who: "Ananya Rao", t: "21:14", text: "Deck review at 10. Who owns the demo video?" },
  ];
  return (
    <div className="flex h-full flex-col">
      <p className="flex items-center gap-2 rounded-md bg-sunken px-3 py-2 text-[12.5px] text-ink-2 ring-1 ring-inset ring-line">
        <PinIcon className="size-3.5 shrink-0 text-ink-3" />
        <span className="truncate">Kickoff notes are in Resources</span>
      </p>
      <ul className="mt-3 min-h-0 flex-1 space-y-3.5 overflow-hidden">
        {msgs.map((m) => (
          <li key={m.t} className="flex gap-2.5">
            <Avatar name={m.who} size="sm" />
            <div className="min-w-0">
              <p className="text-[12.5px]">
                <span className="font-semibold text-ink">{m.who.split(" ")[0]}</span> <span className="font-mono text-[11px] text-ink-3">{m.t}</span>
              </p>
              {m.voice ? (
                <span className="mt-1 inline-flex h-8 items-center gap-2 rounded-full bg-selected px-3 ring-1 ring-inset ring-line-strong">
                  <Mic className="size-3.5 text-ink-2" />
                  <span className="flex h-4 items-center gap-[2px]" aria-hidden>
                    {[5, 9, 13, 7, 11, 15, 8, 12, 6, 10, 14, 7, 9, 5].map((h, i) => (
                      <span key={i} className="w-[2px] rounded-full bg-ink-3" style={{ height: h }} />
                    ))}
                  </span>
                  <span className="font-mono text-[11px] text-ink-3">{m.voice}</span>
                </span>
              ) : (
                <p className="text-[13.5px] leading-snug text-ink-2">{m.text}</p>
              )}
              {m.react && (
                <span className="mt-1 inline-flex h-6 items-center gap-1 rounded-full bg-accent-soft px-2 font-mono text-[11px] text-accent-ink ring-1 ring-inset ring-accent/30">
                  +1 <span className="tabular">{m.react}</span>
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex h-10 shrink-0 items-center gap-2 rounded-md bg-sunken px-3 ring-1 ring-inset ring-line-strong">
        <Paperclip className="size-4 text-ink-3" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-4">Message {EXAMPLE_TEAM.name}</span>
        <Mic className="size-4 text-ink-3" />
        <span className="inline-flex size-7 items-center justify-center rounded-[5px] bg-accent text-on-accent">
          <SendHorizontal className="size-3.5" />
        </span>
      </div>
    </div>
  );
}

const TASK_COLS = [
  {
    id: "todo",
    label: "To do",
    dot: "bg-ink-4",
    tasks: [
      { title: "Record the demo video", who: "Meera Iyer", p: "medium", due: "12 Oct" },
      { title: "Pitch deck v2", who: "Ananya Rao", p: "high", due: "10 Oct" },
    ],
  },
  {
    id: "doing",
    label: "In progress",
    dot: "bg-warn",
    tasks: [
      { title: "Attendance dashboard", who: "Ananya Rao", p: "high", due: "9 Oct" },
      { title: "Offline sync for the field app", who: "Dev Malhotra", p: "medium", due: "11 Oct" },
    ],
  },
  {
    id: "done",
    label: "Done",
    dot: "bg-ok",
    tasks: [
      { title: "Face-match API", who: "Kabir Menon", p: "high", due: "7 Oct" },
      { title: "Repo and README", who: "Kabir Menon", p: "low", due: "5 Oct" },
    ],
  },
] as const;

function TasksBody() {
  return (
    <div className="grid grid-cols-1 gap-3 @xl:grid-cols-3">
      {TASK_COLS.map((col) => (
        <div key={col.id} className="min-w-0">
          <p className="mb-2 flex items-center gap-2 px-0.5 text-[12.5px] font-semibold text-ink">
            <span className={cn("size-2 rounded-full", col.dot)} />
            {col.label}
            <span className="font-mono text-[11px] font-normal text-ink-3 tabular">{col.tasks.length}</span>
          </p>
          <ul className="space-y-2 rounded-lg bg-sunken p-2 ring-1 ring-inset ring-line">
            {col.tasks.map((t, i) => (
              <li key={t.title} className={cn("rounded-md border border-line bg-raised p-2.5", i > 0 && "hidden @xl:block")}>
                <p className={cn("text-[13px] font-medium leading-snug text-ink", col.id === "done" && "text-ink-3 line-through decoration-ink-4")}>{t.title}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <Tape tone={t.p === "high" ? "bad" : t.p === "medium" ? "warn" : "neutral"}>{t.p}</Tape>
                  <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-ink-3">
                    <CalendarDays className="size-3" /> {t.due}
                  </span>
                  <Avatar name={t.who} size="xs" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function BrainstormBody() {
  const ideas = [
    { cat: "Core feature", tone: "accent", title: "Mark attendance from existing CCTV feeds", votes: 5, voted: true, who: "Sara Qureshi" },
    { cat: "Pitch / story", tone: "proj", title: "Open with the 40-minute roll-call problem", votes: 4, voted: false, who: "Ananya Rao" },
    { cat: "Tech stack", tone: "warn", title: "FastAPI + Postgres, face embeddings cached", votes: 3, voted: false, who: "Kabir Menon" },
    { cat: "Nice to have", tone: "info", title: "Alerts to parents after two absences", votes: 2, voted: false, who: "Dev Malhotra" },
  ] as const;
  return (
    <div>
      <div className="inline-flex h-8 items-center rounded-md bg-sunken p-0.5 ring-1 ring-inset ring-line">
        <span className="rounded-[5px] bg-raised px-2.5 py-1 text-[12.5px] font-medium text-ink ring-1 ring-inset ring-line-strong">
          Ideas <span className="font-mono text-[10.5px] text-ink-4">4</span>
        </span>
        <span className="px-2.5 text-[12.5px] font-medium text-ink-3">Shared doc</span>
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-2.5 @lg:grid-cols-2">
        {ideas.map((idea, i) => (
          <li key={idea.title} className={cn("flex flex-col rounded-lg border border-line bg-raised p-3", i > 1 && "hidden @lg:flex")}>
            <Tape tone={idea.tone} className="self-start">
              {idea.cat}
            </Tape>
            <p className="mt-2 text-[13.5px] font-semibold leading-snug text-ink">{idea.title}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
                <Avatar name={idea.who} size="xs" />
                {idea.who.split(" ")[0]}
              </span>
              <span
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-md px-2 font-mono text-[12px] font-semibold ring-1 ring-inset tabular",
                  idea.voted ? "bg-accent-soft text-accent-ink ring-accent/40" : "text-ink-2 ring-line-strong",
                )}
              >
                <ChevronUp className="size-3.5" /> {idea.votes}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResourcesBody() {
  const groups = [
    { label: "Design", icon: <PenTool />, title: "Figma file", host: "figma.com", scope: "event" },
    { label: "Code", icon: <Code2 />, title: "Repository", host: "github.com", scope: "all" },
    { label: "Docs & slides", icon: <FileText />, title: "Pitch deck", host: "docs.google.com", scope: "event" },
    { label: "Other", icon: <Link2 />, title: "Problem statement", host: "sih.gov.in", scope: "event" },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
      {groups.map((g) => (
        <div key={g.label} className="min-w-0">
          <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink [&_svg]:size-3.5 [&_svg]:text-ink-3">
            {g.icon}
            {g.label}
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-[13.5px] font-medium text-ink">
                <span className="truncate">{g.title}</span>
                <ExternalLink className="size-3 shrink-0 text-ink-3" />
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                <span className="truncate font-mono text-[11.5px] text-ink-3">{g.host}</span>
                {g.scope === "event" ? <Tape tone="info">This event</Tape> : <Tape>All events</Tape>}
              </span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function GithubBody() {
  const commits = [
    { msg: "feat: face-match endpoint with cached embeddings", who: "Kabir Menon", t: "12m ago", sha: "8f3c2a1" },
    { msg: "fix: timezone bug in attendance export", who: "Ananya Rao", t: "1h ago", sha: "41b9e0d" },
    { msg: "feat: offline queue for the field app", who: "Dev Malhotra", t: "3h ago", sha: "c07d5f2" },
    { msg: "chore: seed demo data for judging", who: "Sara Qureshi", t: "5h ago", sha: "9aa31e4" },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-[minmax(0,1fr)_200px]">
      <div className="min-w-0 rounded-lg border border-line bg-raised">
        <p className="flex items-center justify-between border-b border-line px-3 py-2 text-[13px] font-semibold text-ink">
          <span>
            Recent commits <span className="ml-1 font-mono text-[11px] font-normal text-ink-3">15</span>
          </span>
          <span className="font-mono text-[11px] font-normal text-ink-3">nullpointers/attendance</span>
        </p>
        <ul className="divide-y divide-line">
          {commits.map((c, i) => (
            <li key={c.sha} className={cn("flex items-start gap-2.5 px-3 py-2.5", i > 2 && "hidden @md:flex")}>
              <Avatar name={c.who} size="xs" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">{c.msg}</p>
                <p className="text-[11.5px] text-ink-3">
                  {c.who.split(" ")[0]} · {c.t}
                </p>
              </div>
              <span className="hidden shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-ink-2 ring-1 ring-inset ring-line-strong @sm:inline-flex">
                {c.sha}
                <Copy className="size-3 text-ink-4" />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden rounded-lg border border-line bg-raised p-3 @2xl:block">
        <p className="caps-label text-ink-3">Contributors</p>
        <ul className="mt-2.5 space-y-2">
          {[
            ["Kabir Menon", 7],
            ["Ananya Rao", 4],
            ["Dev Malhotra", 2],
            ["Sara Qureshi", 2],
          ].map(([name, n]) => (
            <li key={name} className="flex items-center gap-2 text-[12.5px] text-ink-2">
              <Avatar name={name as string} size="xs" />
              <span className="truncate">{(name as string).split(" ")[0]}</span>
              <span className="ml-auto font-mono text-[11px] text-ink-3 tabular">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DeploymentsBody() {
  const deps = [
    { name: "Live demo", url: "nullpointers.app", ok: true, ms: 182 },
    { name: "API", url: "api.nullpointers.app", ok: true, ms: 240 },
    { name: "Staging", url: "staging.nullpointers.app", ok: false },
  ];
  return (
    <ul className="grid grid-cols-1 gap-2.5 @lg:grid-cols-2">
      {deps.map((d) => (
        <li key={d.url} className="rounded-lg border border-line bg-raised p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
              <Globe className="size-3.5 text-ink-3" /> {d.name}
            </p>
            {d.ok ? <span className="font-mono text-[11px] text-ink-3 tabular">{d.ms}ms</span> : null}
          </div>
          <p className="mt-0.5 truncate font-mono text-[12px] text-ink-3">{d.url}</p>
          <p className={cn("mt-2.5 flex items-center gap-2 border-t border-line pt-2.5 text-[12.5px]", d.ok ? "text-ok" : "text-bad")}>
            <StatusDot tone={d.ok ? "ok" : "bad"} /> {d.ok ? "Reachable" : "Not reachable, fix before judging"}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ActivityBody() {
  const rows = [
    { icon: <Check />, title: "Task completed", body: "Face-match API", who: "Kabir Menon", t: "12m" },
    { icon: <Link2 />, title: "Resource added", body: "Pitch deck", who: "Ananya Rao", t: "1h" },
    { icon: <Check />, title: "Task created", body: "Offline sync for the field app", who: "Dev Malhotra", t: "2h" },
    { icon: <FileText />, title: "Shared doc saved", body: "Architecture notes", who: "Sara Qureshi", t: "3h" },
    { icon: <PenTool />, title: "Resource added", body: "Figma file", who: "Meera Iyer", t: "5h" },
  ];
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
      {rows.map((r, i) => (
        <li key={i} className={cn("flex items-start gap-2.5 px-3 py-2.5", i > 3 && "hidden @md:flex")}>
          <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-selected text-ink-2 [&_svg]:size-3.5">{r.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-ink">{r.title}</p>
            <p className="truncate text-[12.5px] text-ink-2">{r.body}</p>
          </div>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className="font-mono text-[11px] text-ink-3">{r.t}</span>
            <Avatar name={r.who} size="xs" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function PitchBody() {
  const rubric = [
    ["Novelty", 16],
    ["Technical depth", 17],
    ["Impact", 15],
    ["Feasibility", 14],
    ["Clarity", 16],
  ] as const;
  return (
    <div className="grid grid-cols-1 gap-3 @xl:grid-cols-[200px_minmax(0,1fr)]">
      <div className="rounded-lg border border-line bg-raised p-3.5">
        <p className="caps-label text-ink-3">Deck v3 · SIH track</p>
        <p className="mt-2 font-display text-[40px] font-semibold leading-none tracking-[-0.03em] text-ink tabular">
          78<span className="text-[18px] text-ink-3">/100</span>
        </p>
        <p className="mt-1 text-[12.5px] text-ink-3">Up 11 from v2</p>
      </div>
      <div className="min-w-0 rounded-lg border border-line bg-raised p-3.5">
        <ul className="space-y-2">
          {rubric.map(([k, v]) => (
            <li key={k} className="grid grid-cols-[96px_minmax(0,1fr)_36px] items-center gap-2 text-[12.5px] text-ink-2">
              <span className="truncate">{k}</span>
              <Progress value={(v / 20) * 100} tone={v >= 16 ? "ok" : "warn"} />
              <span className="text-right font-mono text-[11px] text-ink-3 tabular">{v}/20</span>
            </li>
          ))}
        </ul>
        <p className="mt-3.5 border-t border-line pt-3 caps-label text-ink-3">What judges will push back on</p>
        <ul className="mt-1.5 space-y-1 text-[12.5px] text-ink-2">
          <li>No accuracy numbers for the face-match model.</li>
          <li className="hidden @md:list-item">Cost per classroom isn&apos;t stated.</li>
        </ul>
      </div>
    </div>
  );
}

function SquadBody() {
  const people = [
    { name: "Priya Kulkarni", meta: "COEP Pune · 3rd year", has: ["ML", "Python"], note: "Has the ML depth your pitch review flagged" },
    { name: "Arjun Nair", meta: "VIT Vellore · 2nd year", has: ["PostgreSQL", "Go"], note: "Backs up your only backend developer" },
  ];
  return (
    <div>
      <p className="text-[12.5px] text-ink-3">1 seat open · suggestions based on the skills your team asked for</p>
      <ul className="mt-2.5 grid grid-cols-1 gap-2.5 @xl:grid-cols-2">
        {people.map((p) => (
          <li key={p.name} className="rounded-lg border border-line bg-raised p-3">
            <div className="flex items-start gap-2.5">
              <Avatar name={p.name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-ink">{p.name}</p>
                <p className="truncate text-[12px] text-ink-3">{p.meta}</p>
              </div>
              <span className={buttonClass("secondary", "sm", "pointer-events-none shrink-0")}>
                <UserPlus /> Invite
              </span>
            </div>
            <p className="mt-2 text-[12.5px] text-ink-2">{p.note}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {p.has.map((s) => (
                <Chip key={s} active>
                  {s}
                </Chip>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionBody({ id }: { id: WorkspaceTab }) {
  switch (id) {
    case "chat":
      return <ChatBody />;
    case "tasks":
      return <TasksBody />;
    case "brainstorm":
      return <BrainstormBody />;
    case "resources":
      return <ResourcesBody />;
    case "github":
      return <GithubBody />;
    case "deployments":
      return <DeploymentsBody />;
    case "activity":
      return <ActivityBody />;
    case "ppt":
      return <PitchBody />;
    default:
      return <SquadBody />;
  }
}

/* ── Frames ──────────────────────────────────────────────────────────── */

function Countdown({ running, compact = false }: { running: boolean; compact?: boolean }) {
  const left = useCountdown(EXAMPLE_COUNTDOWN_SECONDS, running);
  const c = splitCountdown(left);
  if (compact) return <>{`${c.days}d ${pad2(c.hours)}h left`}</>;
  return (
    <span className="font-mono text-[17px] font-semibold leading-none text-ink tabular">
      {c.days}
      <span className="text-[11px] text-ink-4">d </span>
      {pad2(c.hours)}
      <span className="text-[11px] text-ink-4">h </span>
      {pad2(c.minutes)}
      <span className="text-[11px] text-ink-4">m </span>
      <span className="text-ink-3">{pad2(c.seconds)}</span>
      <span className="text-[11px] text-ink-4">s</span>
    </span>
  );
}

const PRESENT = [
  { id: "a", name: "Ananya Rao" },
  { id: "k", name: "Kabir Menon" },
  { id: "s", name: "Sara Qureshi" },
];

/** Desktop/tablet: the WorkspaceFrame layout (sidebar + section header + body). */
function DesktopWorkspace({ tab, onPick, running }: { tab: WorkspaceTab; onPick: (t: WorkspaceTab) => void; running: boolean }) {
  const current = WORKSPACE_SECTIONS.find((s) => s.id === tab)!;
  return (
    <div className="hidden overflow-hidden rounded-xl border border-line-strong/80 bg-canvas shadow-[0_28px_70px_-36px_rgb(0_0_0/0.9)] md:grid md:h-[580px] md:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r border-line bg-raised">
        <div className="border-b border-line p-2.5" aria-hidden>
          <div className="flex items-center gap-2.5 rounded-md p-1.5">
            <TeamMark name={EXAMPLE_TEAM.name} tone="sih" size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-ink">{EXAMPLE_TEAM.name}</span>
              <span className="block truncate text-[11.5px] text-ink-3">You lead this team</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-ink-4" />
          </div>
        </div>
        <div className="border-b border-line px-3.5 py-3" aria-hidden>
          <p className="caps-label text-ink-3">Event</p>
          <p className="mt-1 truncate text-[13px] font-semibold text-ink">{EXAMPLE_TEAM.event}</p>
          <p className="mt-2">
            <Countdown running={running} />
          </p>
          <div className="mt-2.5">
            <div className="mb-1 flex justify-between text-[11.5px] text-ink-3">
              <span>Tasks done</span>
              <span className="font-mono tabular">7/12</span>
            </div>
            <Progress value={58} />
          </div>
        </div>
        <nav aria-label="Example workspace sections" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden p-2">
          {WORKSPACE_SECTIONS.map((s) => {
            const active = s.id === tab;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s.id)}
                aria-pressed={active}
                className={cn(
                  "relative flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition-colors [&_svg]:size-4",
                  active ? "text-ink" : "text-ink-3 hover:bg-hover hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="landing-ws-nav"
                    className="absolute inset-0 rounded-md bg-selected ring-1 ring-inset ring-line-strong"
                    transition={{ type: "spring", stiffness: 520, damping: 42 }}
                  />
                )}
                <span className="relative">{s.icon}</span>
                <span className="relative flex-1 font-medium">{s.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="border-t border-line px-3.5 py-3" aria-hidden>
          <p className="caps-label text-ink-3">Team · 3/5 here</p>
          <AvatarStack className="mt-2" size="xs" people={PRESENT} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col" aria-hidden>
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line px-5">
          <span className="flex min-w-0 items-baseline gap-3">
            <span className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink">{current.label}</span>
            <span className="truncate text-[12.5px] text-ink-3">{current.hint}</span>
          </span>
          <span className="flex items-center gap-2 text-[12px] text-ink-3">
            <span className="size-1.5 rounded-full bg-ok" /> 3 here now
          </span>
        </header>
        <div className="@container relative min-h-0 flex-1 overflow-hidden p-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              className="h-full"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <SectionBody id={tab} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** Phones: the real mobile workspace model (team header + scrollable section chips). */
function MobileWorkspace({ tab, onPick, running }: { tab: WorkspaceTab; onPick: (t: WorkspaceTab) => void; running: boolean }) {
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>("[data-active]");
    if (row && active) row.scrollTo({ left: Math.max(0, active.offsetLeft - row.clientWidth / 2 + active.clientWidth / 2), behavior: "smooth" });
  }, [tab]);
  return (
    <div className="overflow-hidden rounded-xl border border-line-strong/80 bg-canvas md:hidden">
      <div className="border-b border-line" aria-hidden>
        <div className="flex h-[52px] items-center gap-1.5 px-2">
          <span className="inline-flex size-9 items-center justify-center text-ink-2">
            <ArrowLeft className="size-5" />
          </span>
          <TeamMark name={EXAMPLE_TEAM.name} tone="sih" size="sm" />
          <span className="min-w-0 flex-1 pl-1">
            <span className="block truncate text-[14px] font-semibold text-ink">{EXAMPLE_TEAM.name}</span>
            <span className="block truncate text-[11.5px] text-ink-3">
              <Countdown running={running} compact /> · {EXAMPLE_TEAM.eventShort}
            </span>
          </span>
          <AvatarStack size="xs" max={3} people={PRESENT} className="mr-1" />
        </div>
      </div>
      <div className="relative border-b border-line">
        <div ref={rowRef} className="flex snap-x gap-1 overflow-x-auto px-2 py-2 scrollbar-none" role="group" aria-label="Example workspace sections">
          {WORKSPACE_SECTIONS.map((s) => {
            const active = s.id === tab;
            return (
              <button
                key={s.id}
                type="button"
                data-active={active || undefined}
                aria-pressed={active}
                onClick={() => onPick(s.id)}
                className={cn(
                  "inline-flex h-9 shrink-0 snap-start items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors [&_svg]:size-3.5",
                  active ? "bg-ink text-canvas" : "text-ink-2 ring-1 ring-inset ring-line-strong",
                )}
              >
                {s.icon}
                {s.label}
              </button>
            );
          })}
        </div>
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end bg-gradient-to-l from-canvas via-canvas/80 to-transparent pr-1">
          <ChevronRight className="size-4 text-ink-3" />
        </span>
      </div>
      <div className="@container relative h-[416px] overflow-hidden p-3.5" aria-hidden>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            className="h-full"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <SectionBody id={tab} />
          </motion.div>
        </AnimatePresence>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-canvas to-transparent" />
      </div>
    </div>
  );
}

function WorkspacePreview() {
  const { ref, active } = useStoryActive<HTMLDivElement>(0.3);
  const [tab, setTab] = useState<WorkspaceTab>("chat");
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!active || !auto) return;
    const t = window.setTimeout(() => {
      const i = WORKSPACE_SECTIONS.findIndex((s) => s.id === tab);
      setTab(WORKSPACE_SECTIONS[(i + 1) % WORKSPACE_SECTIONS.length].id);
    }, CYCLE_MS);
    return () => window.clearTimeout(t);
  }, [active, auto, tab]);

  const pick = (t: WorkspaceTab) => {
    setAuto(false);
    setTab(t);
  };
  const current = WORKSPACE_SECTIONS.find((s) => s.id === tab)!;

  return (
    <div ref={ref}>
      <p className="sr-only">
        Example workspace for the team Null Pointers. Pick a section to see what it holds: chat, tasks, brainstorm, resources, GitHub,
        deployments, activity, pitch review and squad matcher.
      </p>
      <DesktopWorkspace tab={tab} onPick={pick} running={active} />
      <MobileWorkspace tab={tab} onPick={pick} running={active} />
      <div className="mt-4 flex items-start gap-3">
        <span className="mt-[3px] inline-flex h-[22px] shrink-0 items-center rounded-[4px] bg-selected px-1.5 font-mono text-[11px] text-ink-2 ring-1 ring-inset ring-line-strong tabular">
          {pad2(WORKSPACE_SECTIONS.findIndex((s) => s.id === tab) + 1)}/{pad2(WORKSPACE_SECTIONS.length)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] text-ink-2" aria-live="polite">
            <span className="font-semibold text-ink">{current.label}.</span> {CAPTIONS[tab]}
          </p>
          {auto && active && (
            <span className="mt-2 block h-px w-full max-w-[240px] overflow-hidden bg-line">
              <motion.span
                key={tab}
                className="block h-full origin-left bg-accent"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: CYCLE_MS / 1000, ease: "linear" }}
              />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function BuildSection() {
  return (
    <section id="build" data-stage="build" aria-labelledby="build-title" className="scroll-mt-16 border-b border-line">
      <Container className="py-16 md:py-24">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-6">
            <StageLabel id="build" />
            <SectionTitle id="build-title" className="mt-4">
              One workspace, from kickoff to submission.
            </SectionTitle>
          </div>
          <div className="lg:col-span-6 lg:pt-10">
            <Lede>
              Every team gets a workspace with the event clock running. Talk, plan, keep the links and the repo in view, check the demo is up, and get
              the deck reviewed before the judges see it.
            </Lede>
          </div>
        </div>
        <div className="mt-10 md:mt-12">
          <WorkspacePreview />
        </div>
      </Container>
    </section>
  );
}
