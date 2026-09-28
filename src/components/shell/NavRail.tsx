"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Bell, Flame, LogIn, Plus } from "lucide-react";
import { CountBadge, TeamMark } from "@/components/system";
import { cn } from "@/lib/utils";
import { HMMark } from "./HMMark";
import { NAV_ITEMS, type NavSection } from "./navConfig";
import { AccountMenu } from "./AccountMenu";
import type { ShellSession } from "./useShellSession";

const MAX_RAIL_TEAMS = 5;

/**
 * Desktop/tablet navigation rail. Primary destinations on top, the viewer's
 * teams below them (one click into any workspace), inbox + account at the foot.
 */
export function NavRail({
  session,
  section,
  pathname,
  theme,
  toggleTheme,
  onOpenInbox,
  onRequestSignOut,
}: {
  session: ShellSession;
  section: NavSection | null;
  pathname: string;
  theme: "dark" | "light";
  toggleTheme: () => void;
  onOpenInbox: () => void;
  onRequestSignOut: () => void;
}) {
  const signedIn = Boolean(session.viewerId);
  const showSkeleton = !signedIn && (session.authLoading || session.hasSession);
  const teams = session.teams.slice(0, MAX_RAIL_TEAMS);
  const extraTeams = session.teams.length - teams.length;

  return (
    <aside
      aria-label="App navigation"
      className="relative z-40 hidden w-[var(--hm-rail-w)] shrink-0 flex-col items-center border-r border-line bg-raised py-3 md:flex"
    >
      <Link href={signedIn ? "/dashboard" : "/"} aria-label="HackerMate home" className="rounded-[10px] transition-transform active:scale-95">
        <HMMark />
      </Link>

      <nav aria-label="Primary" className="mt-5 flex w-full flex-col items-center gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = section === item.id;
          const badge = item.id === "messages" ? session.unreadMessages : 0;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="group relative flex w-full flex-col items-center gap-1 py-1.5"
            >
              {active && (
                <motion.span
                  layoutId="rail-edge"
                  className="absolute left-0 top-2 h-8 w-[3px] rounded-r-[2px] bg-signal"
                  transition={{ type: "spring", stiffness: 520, damping: 42 }}
                />
              )}
              <span
                className={cn(
                  "relative flex h-8 w-11 items-center justify-center rounded-[9px] transition-colors [&_svg]:size-[19px]",
                  active ? "text-ink" : "text-ink-3 group-hover:bg-hover group-hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="rail-capsule"
                    className="absolute inset-0 rounded-[9px] bg-selected ring-1 ring-inset ring-line-strong"
                    transition={{ type: "spring", stiffness: 520, damping: 42 }}
                  />
                )}
                <span className="relative">{item.icon}</span>
                {badge > 0 && <CountBadge value={badge} className="absolute -right-1 -top-1" />}
              </span>
              <span className={cn("text-[10.5px] font-medium leading-none", active ? "text-ink" : "text-ink-3 group-hover:text-ink-2")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {signedIn && (
        <div className="mt-3 flex w-full flex-col items-center gap-1.5 border-t border-line pt-3">
          <span className="mb-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-4">Teams</span>
          {teams.map((t, i) => {
            const active = pathname.startsWith(`/teams/${t.id}`);
            return (
              <Link
                key={t.id}
                href={`/teams/${t.id}/workspace`}
                aria-label={`${t.name} — open workspace`}
                aria-current={active ? "page" : undefined}
                className={cn("group relative rounded-[8px]", i >= 3 && "[@media(max-height:780px)]:hidden")}
              >
                <TeamMark
                  name={t.name}
                  tone={t.tone}
                  size="md"
                  className={cn("transition-shadow", active ? "ring-2 ring-signal ring-offset-2 ring-offset-raised" : "group-hover:ring-ink-4")}
                />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-overlay px-2.5 py-1.5 text-[12.5px] text-ink opacity-0 shadow-pop transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="ml-2 text-ink-3">{t.isOwner ? "Owner" : "Member"}</span>
                </span>
              </Link>
            );
          })}
          {extraTeams > 0 && (
            <Link href="/my-teams" className="font-mono text-[11px] text-ink-3 hover:text-ink" aria-label={`${extraTeams} more teams`}>
              +{extraTeams}
            </Link>
          )}
          <Link
            href="/teams/create"
            aria-label="Create a team"
            title="Create a team"
            className="flex size-9 items-center justify-center rounded-[7px] border border-dashed border-line-strong text-ink-3 transition-colors hover:border-ink-4 hover:text-ink"
          >
            <Plus className="size-4" />
          </Link>
        </div>
      )}

      <div className="mt-auto flex flex-col items-center gap-2.5 pt-3">
        {signedIn && session.currentStreak > 0 && (
          <span
            className="inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold text-warn"
            title={`${session.currentStreak}-day visit streak`}
            aria-label={`Current visit streak: ${session.currentStreak} days`}
          >
            <Flame className="size-3.5" aria-hidden />
            {session.currentStreak}
          </span>
        )}
        {signedIn ? (
          <>
            <button
              type="button"
              onClick={onOpenInbox}
              aria-label={session.unreadNotifications > 0 ? `Inbox, ${session.unreadNotifications} unread` : "Inbox"}
              title="Inbox"
              className="relative flex size-10 items-center justify-center rounded-[9px] text-ink-3 transition-colors hover:bg-hover hover:text-ink"
            >
              <Bell className="size-[19px]" />
              {session.unreadNotifications > 0 && <CountBadge value={session.unreadNotifications} className="absolute right-0.5 top-0.5" />}
            </button>
            <AccountMenu
              viewerId={session.viewerId as string}
              profile={session.profile}
              theme={theme}
              toggleTheme={toggleTheme}
              onRequestSignOut={onRequestSignOut}
            />
          </>
        ) : showSkeleton ? (
          <span className="hm-skeleton size-9 rounded-full" aria-hidden />
        ) : (
          <Link
            href="/login"
            className="flex w-full flex-col items-center gap-1 py-1.5 text-ink-2 hover:text-ink"
          >
            <span className="flex h-8 w-11 items-center justify-center rounded-[9px] bg-accent text-on-accent">
              <LogIn className="size-[18px]" />
            </span>
            <span className="text-[10.5px] font-medium leading-none">Sign in</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
