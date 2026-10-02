"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  CloudUpload,
  GitBranch,
  Lightbulb,
  Link2,
  MessageSquare,
  Plus,
  Presentation,
  Share2,
  SquareKanban,
  Target,
  Users,
  Search,
} from "lucide-react";
import { Avatar, AvatarStack, Button, ButtonLink, Menu, Progress, Sheet, Tape, TeamMark, type MenuItem } from "@/components/system";
import { useImmersive, useShell } from "@/components/shell/ShellContext";
import { cn } from "@/lib/utils";

export type WorkspaceTab = "chat" | "tasks" | "brainstorm" | "resources" | "github" | "activity" | "deployments" | "ppt" | "gap_filler";

export const WORKSPACE_SECTIONS: { id: WorkspaceTab; label: string; icon: ReactNode; hint: string }[] = [
  { id: "chat", label: "Chat", icon: <MessageSquare />, hint: "Team thread" },
  { id: "tasks", label: "Tasks", icon: <SquareKanban />, hint: "Board and owners" },
  { id: "brainstorm", label: "Brainstorm", icon: <Lightbulb />, hint: "Ideas and votes" },
  { id: "resources", label: "Resources", icon: <Link2 />, hint: "Links and docs" },
  { id: "github", label: "GitHub", icon: <GitBranch />, hint: "Repo and commits" },
  { id: "deployments", label: "Deployments", icon: <CloudUpload />, hint: "Live builds" },
  { id: "activity", label: "Activity", icon: <Clock />, hint: "What changed" },
  { id: "ppt", label: "Pitch review", icon: <Presentation />, hint: "Deck evaluation" },
  { id: "gap_filler", label: "Squad matcher", icon: <Target />, hint: "Fill skill gaps" },
];

type Props = {
  team: { id: string; name: string };
  tone: "hack" | "proj" | "neutral";
  isOwner: boolean;
  canShare: boolean;
  tab: WorkspaceTab;
  onTabChange: (t: WorkspaceTab) => void;
  listedHackathons: { id: string; name: string; end_date?: string }[];
  activeHackathon: { id: string; name: string } | null;
  countdown: { days: number; hours: number; minutes: number; seconds: number; ended: boolean };
  tasks: { done: number; total: number; pct: number };
  coverage: { desired: string[]; covered: string[]; missing: string[] };
  onlineTeammates: { id: string; name: string; avatarUrl: string | null }[];
  members: { id: string; profiles: { id: string; full_name: string; avatar_url?: string | null } }[];
  onShare: () => void;
  onFindBuilders: () => void;
  children: ReactNode;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * The team room. A dedicated working layout — team switcher, the event
 * clock, sections and who's here — so the workspace feels like a place you
 * work in rather than another dashboard page.
 */
export function WorkspaceFrame(props: Props) {
  const { team, tab, onTabChange, children } = props;
  const [teamSheet, setTeamSheet] = useState(false);
  const router = useRouter();
  useImmersive(true);

  // Mobile section row: track whether there's more to scroll on either side,
  // and keep the active section in view when it changes (e.g. ?tab=ppt).
  const mobileNavRef = useRef<HTMLElement>(null);
  const [navEdges, setNavEdges] = useState({ start: false, end: true });
  const updateNavEdges = useCallback(() => {
    const el = mobileNavRef.current;
    if (!el) return;
    const start = el.scrollLeft > 4;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setNavEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);
  useEffect(() => {
    const el = mobileNavRef.current;
    const active = el?.querySelector<HTMLElement>("[data-active]");
    if (el && active) {
      const left = active.offsetLeft - el.clientWidth / 2 + active.clientWidth / 2;
      el.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    }
    const t = window.setTimeout(updateNavEdges, 350);
    window.addEventListener("resize", updateNavEdges);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", updateNavEdges);
    };
  }, [tab, updateNavEdges]);
  const current = WORKSPACE_SECTIONS.find((s) => s.id === tab) || WORKSPACE_SECTIONS[0];

  return (
    <main data-v2 className="flex min-h-full w-full flex-1">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-[100dvh] w-[264px] shrink-0 flex-col overflow-y-auto border-r border-line bg-raised lg:flex">
        <div className="border-b border-line p-3">
          <TeamSwitcher {...props} />
        </div>
        <EventBlock {...props} />
        <nav aria-label="Workspace sections" className="flex flex-col gap-0.5 p-2">
          {WORKSPACE_SECTIONS.map((s) => {
            const active = s.id === tab;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onTabChange(s.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition-colors [&_svg]:size-4",
                  active ? "text-ink" : "text-ink-3 hover:bg-hover hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="ws-nav"
                    className="absolute inset-0 rounded-md bg-selected ring-1 ring-inset ring-line-strong"
                    transition={{ type: "spring", stiffness: 520, damping: 42 }}
                  />
                )}
                <span className="relative">{s.icon}</span>
                <span className="relative flex-1 font-medium">{s.label}</span>
                {s.id === "tasks" && props.tasks.total > 0 && (
                  <span className="relative font-mono text-[12.5px] text-ink-4 tabular">
                    {props.tasks.done}/{props.tasks.total}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <CoverageBlock {...props} />
        <PresenceBlock {...props} />
        <div className="mt-auto flex flex-col gap-1 border-t border-line p-3">
          <Link href={`/teams/${team.id}`} className="flex h-8 items-center gap-2 rounded-md px-2 text-[12.5px] text-ink-3 hover:bg-hover hover:text-ink">
            <Users className="size-3.5" aria-hidden /> Team page
          </Link>
          {props.canShare && (
            <button type="button" onClick={props.onShare} className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-[12.5px] text-ink-3 hover:bg-hover hover:text-ink">
              <Share2 className="size-3.5" aria-hidden /> Share workspace
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile / tablet header */}
        <div className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur lg:hidden">
          <div className="flex h-[52px] items-center gap-1.5 px-2">
            <button
              type="button"
              onClick={() => router.push(`/teams/${team.id}`)}
              aria-label="Back to team page"
              className="inline-flex size-10 items-center justify-center rounded-md text-ink-2 active:bg-hover"
            >
              <ArrowLeft className="size-5" />
            </button>
            <button type="button" onClick={() => setTeamSheet(true)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left active:bg-hover">
              <TeamMark name={team.name} tone={props.tone} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-ink">{team.name}</span>
                <span className="block truncate text-[12px] text-ink-3">
                  {props.activeHackathon && !props.countdown.ended
                    ? `${props.countdown.days}d ${pad(props.countdown.hours)}h left · ${props.activeHackathon.name}`
                    : props.activeHackathon?.name || "Workspace"}
                </span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-ink-4" aria-hidden />
            </button>
            {props.onlineTeammates.length > 0 && (
              <AvatarStack className="mr-1" size="xs" max={3} people={props.onlineTeammates.map((u) => ({ id: u.id, name: u.name, src: u.avatarUrl }))} />
            )}
          </div>
          <div className="relative">
            <nav
              ref={mobileNavRef}
              aria-label="Workspace sections"
              onScroll={updateNavEdges}
              className="flex snap-x gap-1 overflow-x-auto scroll-px-2 px-2 pb-2 scrollbar-none"
            >
              {WORKSPACE_SECTIONS.map((s) => {
                const active = s.id === tab;
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-active={active || undefined}
                    onClick={() => onTabChange(s.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-9 shrink-0 snap-start items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors [&_svg]:size-3.5",
                      active ? "bg-ink text-canvas" : "text-ink-2 ring-1 ring-inset ring-line-strong active:bg-hover",
                    )}
                  >
                    {s.icon}
                    {s.label}
                  </button>
                );
              })}
            </nav>
            {/* Edge fades + chevron make it obvious the row scrolls. */}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-canvas to-transparent transition-opacity",
                navEdges.start ? "opacity-100" : "opacity-0",
              )}
            />
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 right-0 flex w-10 items-start justify-end bg-gradient-to-l from-canvas via-canvas/80 to-transparent pr-1 pt-2 transition-opacity",
                navEdges.end ? "opacity-100" : "opacity-0",
              )}
            >
              <ChevronRight className="size-4 text-ink-3" />
            </span>
          </div>
        </div>

        {/* Desktop section header */}
        <header className="sticky top-0 z-20 hidden h-14 items-center justify-between gap-4 border-b border-line bg-canvas/95 px-8 backdrop-blur lg:flex">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 data-v2-heading className="font-display text-[20px] font-semibold tracking-[-0.02em] text-ink">
              {current.label}
            </h1>
            <span className="truncate text-[12.5px] text-ink-3">{current.hint}</span>
          </div>
          <div className="flex items-center gap-3">
            {props.onlineTeammates.length > 0 && (
              <span className="flex items-center gap-2 text-[12px] text-ink-3">
                <span className="size-1.5 rounded-full bg-ok" aria-hidden />
                {props.onlineTeammates.length} here now
              </span>
            )}
            {props.isOwner && props.coverage.missing.length > 0 && (
              <Button size="sm" variant="secondary" icon={<Plus />} onClick={props.onFindBuilders}>
                Find builders
              </Button>
            )}
          </div>
        </header>

        <div className="min-w-0 flex-1 px-4 py-4 md:px-8 md:py-6">{children}</div>
      </div>

      {/* Mobile team sheet: switcher, event, coverage, presence */}
      <Sheet open={teamSheet} onClose={() => setTeamSheet(false)} label="Team" title={team.name}>
        <div className="space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SwitcherList {...props} onPick={() => setTeamSheet(false)} />
          <EventBlock {...props} />
          <CoverageBlock {...props} />
          <PresenceBlock {...props} />
          <div className="flex gap-2 px-4 pt-2">
            <ButtonLink href={`/teams/${team.id}`} variant="secondary" className="flex-1" icon={<Users />} onClick={() => setTeamSheet(false)}>
              Team page
            </ButtonLink>
            {props.canShare && (
              <Button
                variant="secondary"
                className="flex-1"
                icon={<Share2 />}
                onClick={() => {
                  setTeamSheet(false);
                  props.onShare();
                }}
              >
                Share
              </Button>
            )}
          </div>
        </div>
      </Sheet>
    </main>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────── */

function TeamSwitcher(props: Props) {
  const shell = useShell();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const teams = shell?.session.teams || [];

  const showSearch = teams.length > 5;
  const filtered = (showSearch && query)
    ? teams.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    : teams;

  const items: MenuItem[] = [
    { type: "label", label: "Switch team" },
    ...filtered.map((t) => ({
      label: t.name,
      icon: <TeamMark name={t.name} tone={t.tone} size="sm" className="!size-5 !rounded-[4px] !text-[8px]" />,
      hint: t.id === props.team.id ? "current" : undefined,
      onSelect: () => router.push(`/teams/${t.id}/workspace`),
    })),
    ...(filtered.length === 0 ? [{ type: "label" as const, label: "No matches found" }] : []),
    { type: "separator" },
    { label: "All your teams", icon: <Users />, onSelect: () => router.push("/my-teams") },
    { label: "New team", icon: <Plus />, onSelect: () => router.push("/teams/create") },
  ];
  return (
    <Menu
      align="start"
      scrollableItems
      items={items}
      className="w-full"
      header={
        showSearch ? (
          <div className="border-b border-line px-2 pb-2 pt-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-hover px-2 text-ink-3 focus-within:text-ink focus-within:ring-1 focus-within:ring-inset focus-within:ring-signal">
              <Search className="size-3.5 shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder="Find team..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4"
              />
            </div>
          </div>
        ) : undefined
      }
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn("flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-hover", open && "bg-hover")}
        >
          <TeamMark name={props.team.name} tone={props.tone} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-ink">{props.team.name}</span>
            <span className="block truncate text-[12.5px] text-ink-3">{props.isOwner ? "You lead this team" : "Member"}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-ink-4" aria-hidden />
        </button>
      )}
    />
  );
}

function SwitcherList(props: Props & { onPick: () => void }) {
  const shell = useShell();
  const [query, setQuery] = useState("");
  const teams = shell?.session.teams || [];
  if (teams.length <= 1) return null;

  const showSearch = teams.length > 5;
  const filtered = (showSearch && query)
    ? teams.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    : teams;

  return (
    <div className="px-2 pt-1">
      {showSearch && (
        <div className="px-2 pb-2 mt-1">
          <div className="flex h-9 items-center gap-2 rounded-md bg-hover px-2.5 text-ink-3 focus-within:text-ink focus-within:ring-1 focus-within:ring-inset focus-within:ring-signal">
            <Search className="size-4 shrink-0" />
            <input
              type="text"
              placeholder="Find team..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-4"
            />
          </div>
        </div>
      )}
      <p className="caps-label px-2 pb-1 pt-2 text-ink-4">Switch team</p>
      {filtered.length === 0 && (
        <p className="px-2 py-3 text-[13px] text-ink-3">No matches found</p>
      )}
      {filtered.map((t) => (
        <Link
          key={t.id}
          href={`/teams/${t.id}/workspace`}
          onClick={props.onPick}
          className={cn("flex h-12 items-center gap-3 rounded-md px-2 active:bg-hover", t.id === props.team.id && "bg-selected")}
        >
          <TeamMark name={t.name} tone={t.tone} size="sm" />
          <span className="flex-1 truncate text-[14px] text-ink">{t.name}</span>
          {t.id === props.team.id && <Tape>Current</Tape>}
        </Link>
      ))}
    </div>
  );
}

function EventBlock({ activeHackathon, listedHackathons, countdown, tasks }: Props) {
  if (!activeHackathon) return null;
  return (
    <div className="border-b border-line px-4 py-3.5">
      <p className="caps-label text-ink-3">Event</p>
      {listedHackathons.length > 1 ? (
        <select
          aria-label="Switch event track"
          value={activeHackathon.id}
          onChange={(e) => {
            // Same behaviour as V1: reload the workspace scoped to the chosen event.
            const url = new URL(window.location.href);
            url.searchParams.set("hackathon_id", e.target.value);
            window.location.href = url.toString();
          }}
          className="mt-1 w-full truncate rounded-md bg-transparent py-0.5 text-[13px] font-semibold text-ink outline-none hover:text-ink-2"
        >
          {listedHackathons.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="mt-1 truncate text-[13px] font-semibold text-ink">{activeHackathon.name}</p>
      )}
      {countdown.ended ? (
        <p className="mt-2 font-mono text-[12px] text-ink-3">Event closed</p>
      ) : (
        <p className="mt-2 font-mono text-[18px] font-semibold leading-none text-ink tabular" aria-label={`${countdown.days} days ${countdown.hours} hours left`}>
          {countdown.days}
          <span className="text-[12px] text-ink-4">d </span>
          {pad(countdown.hours)}
          <span className="text-[12px] text-ink-4">h </span>
          {pad(countdown.minutes)}
          <span className="text-[12px] text-ink-4">m </span>
          <span className="text-ink-3">{pad(countdown.seconds)}</span>
          <span className="text-[12px] text-ink-4">s</span>
        </p>
      )}
      {tasks.total > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[12.5px] text-ink-3">
            <span>Tasks done</span>
            <span className="font-mono tabular">
              {tasks.done}/{tasks.total}
            </span>
          </div>
          <Progress value={tasks.pct} />
        </div>
      )}
    </div>
  );
}

function CoverageBlock({ coverage, isOwner, onFindBuilders }: Props) {
  if (!coverage.desired.length) return null;
  const pct = Math.round((coverage.covered.length / coverage.desired.length) * 100);
  return (
    <div className="border-t border-line px-4 py-3.5 lg:border-b-0">
      <div className="flex items-baseline justify-between">
        <p className="caps-label text-ink-3">Stack coverage</p>
        <span className="font-mono text-[12px] text-ink-2 tabular">{pct}%</span>
      </div>
      <Progress className="mt-2" value={pct} tone={pct >= 80 ? "ok" : "warn"} />
      {coverage.missing.length > 0 ? (
        <>
          <p className="mt-2.5 text-[12.5px] text-ink-3">Missing</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {coverage.missing.map((s) => (
              <Tape key={s} tone="warn">
                {s}
              </Tape>
            ))}
          </div>
          {isOwner && (
            <button type="button" onClick={onFindBuilders} className="mt-2.5 text-[12px] font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
              Find builders for these
            </button>
          )}
        </>
      ) : (
        <p className="mt-2 text-[12px] text-ok">Every skill the team asked for is covered.</p>
      )}
    </div>
  );
}

function PresenceBlock({ members, onlineTeammates }: Props) {
  const online = new Set(onlineTeammates.map((u) => u.id));
  return (
    <div className="border-t border-line px-4 py-3.5">
      <p className="caps-label text-ink-3">
        Team · {onlineTeammates.length}/{members.length} here
      </p>
      <ul className="mt-2 space-y-1.5">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-2">
            <Avatar name={m.profiles.full_name} src={m.profiles.avatar_url} size="xs" presence={online.has(m.profiles.id) ? "online" : null} />
            <Link href={`/profile/${m.profiles.id}`} className="truncate text-[12.5px] text-ink-2 hover:text-ink">
              {m.profiles.full_name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

