"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Bell, ChevronLeft, Flame } from "lucide-react";
import { Avatar, ButtonLink, CountBadge } from "@/components/system";
import { cn } from "@/lib/utils";
import { HMMark } from "./HMMark";
import { NAV_ITEMS, type NavSection } from "./navConfig";
import type { ShellSession } from "./useShellSession";

/** Mobile top bar: brand or back, then streak, inbox and account. */
export function MobileTopBar({
  session,
  detail,
  onOpenInbox,
  onOpenAccount,
}: {
  session: ShellSession;
  detail: boolean;
  onOpenInbox: () => void;
  onOpenAccount: () => void;
}) {
  const router = useRouter();
  const signedIn = Boolean(session.viewerId);
  const showSkeleton = !signedIn && (session.authLoading || session.hasSession);

  return (
    <header className="z-40 flex h-[var(--hm-topbar-h)] shrink-0 items-center justify-between gap-2 border-b border-line bg-canvas px-2.5 md:hidden">
      <div className="flex min-w-0 items-center gap-1.5">
        {detail ? (
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push(signedIn ? "/dashboard" : "/"))}
            aria-label="Back"
            className="inline-flex size-10 items-center justify-center rounded-md text-ink-2 active:bg-hover"
          >
            <ChevronLeft className="size-5" />
          </button>
        ) : (
          <Link href={signedIn ? "/dashboard" : "/"} aria-label="HackerMate home" className="inline-flex items-center gap-2 pl-1">
            <HMMark size={30} />
            <span className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink [font-variation-settings:'wdth'_90]">
              HackerMate
            </span>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-1">
        {signedIn && session.currentStreak > 0 && (
          <span className="mr-1 inline-flex items-center gap-0.5 font-mono text-[12px] font-semibold text-warn" aria-label={`Visit streak: ${session.currentStreak} days`}>
            <Flame className="size-4" aria-hidden />
            {session.currentStreak}
          </span>
        )}
        {signedIn ? (
          <>
            <button
              type="button"
              onClick={onOpenInbox}
              aria-label={session.unreadNotifications > 0 ? `Inbox, ${session.unreadNotifications} unread` : "Inbox"}
              className="relative inline-flex size-10 items-center justify-center rounded-md text-ink-2 active:bg-hover"
            >
              <Bell className="size-5" />
              {session.unreadNotifications > 0 && <CountBadge value={session.unreadNotifications} className="absolute right-1 top-1" />}
            </button>
            <button type="button" onClick={onOpenAccount} aria-label="Account" className="inline-flex size-10 items-center justify-center rounded-full">
              <Avatar name={session.profile?.full_name} src={session.profile?.avatar_url} size="sm" />
            </button>
          </>
        ) : showSkeleton ? (
          <span className="hm-skeleton mr-1 size-7 rounded-full" aria-hidden />
        ) : (
          <ButtonLink href="/login" variant="primary" size="sm">
            Sign in
          </ButtonLink>
        )}
      </div>
    </header>
  );
}

/** Mobile bottom tab bar: five destinations, thumb-reachable. */
export function MobileTabBar({ session, section }: { session: ShellSession; section: NavSection | null }) {
  return (
    <nav aria-label="Primary" className="z-40 flex shrink-0 border-t border-line bg-raised pb-safe md:hidden">
      {NAV_ITEMS.filter((i) => i.mobile).map((item) => {
        const active = section === item.id;
        const badge = item.id === "messages" ? session.unreadMessages : 0;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="relative flex h-[var(--hm-tabbar-h)] flex-1 flex-col items-center justify-center gap-1 active:bg-hover"
          >
            {active && (
              <motion.span
                layoutId="tab-edge"
                className="absolute inset-x-5 top-0 h-[2px] rounded-b-[2px] bg-signal"
                transition={{ type: "spring", stiffness: 520, damping: 42 }}
              />
            )}
            <span className={cn("relative [&_svg]:size-[21px]", active ? "text-ink" : "text-ink-3")}>
              {item.icon}
              {badge > 0 && <CountBadge value={badge} className="absolute -right-2.5 -top-1.5" />}
            </span>
            <span className={cn("text-[10.5px] font-medium leading-none", active ? "text-ink" : "text-ink-3")}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
