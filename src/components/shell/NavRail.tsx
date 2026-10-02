"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, LogIn } from "lucide-react";
import { CountBadge } from "@/components/system";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/Logo";
import { NAV_ITEMS, type NavSection } from "./navConfig";
import { AccountMenu } from "./AccountMenu";
import type { ShellSession } from "./useShellSession";

// Short viewports (1080p laptops at 125% OS scaling, 768px screens, landscape
// tablets) get slightly tighter spacing via height media variants
// ([@media(max-height:820px)] / [@media(max-height:700px)]), written out in full
// so Tailwind can see them. Nothing shrinks globally.

/**
 * Desktop/tablet navigation rail, in three zones:
 *   top    — brand (fixed)
 *   middle — primary destinations + your teams; scrolls only when the
 *            viewport is too short to show everything
 *   bottom — streak, inbox and account (fixed, always reachable)
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

  // Scroll affordance for the middle zone.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateEdges());
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [updateEdges, signedIn]);

  return (
    <aside
      aria-label="App navigation"
      className="relative z-40 hidden h-full w-[var(--hm-rail-w)] shrink-0 flex-col border-r border-line bg-raised md:flex"
    >
      {/* Top: brand */}
      <div className="flex shrink-0 justify-center pb-1 pt-3 [@media(max-height:700px)]:pt-2">
        {/* The rail is 76px wide, so it carries the app icon; the full logo sits in wider headers. */}
        <Link href={signedIn ? "/dashboard" : "/"} aria-label="HackerMate home" className="rounded-[10px] transition-transform active:scale-95">
          <LogoMark size={36} />
        </Link>
      </div>

      {/* Middle: destinations + teams */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          data-rail-scroll
          onScroll={updateEdges}
          className="h-full overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-none"
        >
          <div className="flex flex-col items-center pb-3">
            <nav aria-label="Primary" className="mt-4 flex w-full flex-col items-center gap-0.5 [@media(max-height:820px)]:mt-2.5">
              {NAV_ITEMS.map((item) => {
                const active = section === item.id;
                const badge = item.id === "messages" ? session.unreadMessages : 0;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex w-[calc(100%-16px)] flex-col items-center gap-1 rounded-[10px] py-1.5 transition-colors [@media(max-height:820px)]:py-1 [@media(max-height:700px)]:gap-0.5",
                      active ? "" : "hover:bg-hover"
                    )}
                  >
                    <span
                      className={cn(
                        "relative flex h-8 w-full items-center justify-center transition-colors [&_svg]:size-[19px] [@media(max-height:700px)]:h-7",
                        active ? "text-accent-ink" : "text-ink-3 group-hover:text-ink",
                      )}
                    >
                      <span className="relative">{item.icon}</span>
                      {badge > 0 && <CountBadge value={badge} className="absolute -right-1 -top-1" />}
                    </span>
                    <span className={cn("text-[12.5px] leading-none transition-colors", active ? "text-ink font-semibold" : "text-ink-3 font-medium group-hover:text-ink-2")}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Edge fades only appear when the middle zone actually overflows. */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-raised to-transparent transition-opacity",
            edges.top ? "opacity-100" : "opacity-0",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 flex h-9 items-end justify-center bg-gradient-to-t from-raised via-raised/80 to-transparent pb-0.5 transition-opacity",
            edges.bottom ? "opacity-100" : "opacity-0",
          )}
        >
          <ChevronDown className="size-3.5 text-ink-3" />
        </span>
      </div>

      {/* Bottom: always visible */}
      <div className="flex shrink-0 flex-col items-center gap-2 pb-3 pt-3 [@media(max-height:700px)]:gap-1.5 [@media(max-height:700px)]:pb-2 [@media(max-height:700px)]:pt-2">
        {signedIn ? (
          <>
            <button
              type="button"
              onClick={onOpenInbox}
              aria-label={session.unreadNotifications > 0 ? `Inbox, ${session.unreadNotifications} unread` : "Inbox"}
              title="Inbox"
              className="relative flex size-10 items-center justify-center rounded-[9px] text-ink-3 transition-colors hover:bg-hover hover:text-ink [@media(max-height:700px)]:size-9"
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
          <Link href="/login" className="flex w-full flex-col items-center gap-1 py-1.5 text-ink-2 hover:text-ink">
            <span className="flex h-8 w-11 items-center justify-center rounded-[9px] bg-accent text-on-accent">
              <LogIn className="size-[18px]" />
            </span>
            <span className="text-[12.5px] font-medium leading-none">Sign in</span>
          </Link>
        )}
      </div>
    </aside>
  );
}

