"use client";

import type { ReactNode } from "react";
import { NavRail } from "./NavRail";
import { MobileTabBar, MobileTopBar } from "./MobileBars";
import { isDetailRoute, sectionFor } from "./navConfig";
import type { ShellSession } from "./useShellSession";

/**
 * Pure layout of the signed-in/app shell. AppShell feeds it the live
 * session; the dev gallery feeds it fixtures so screens can be reviewed
 * without touching real accounts.
 */
export function ShellFrame({
  session,
  pathname,
  theme,
  toggleTheme,
  immersive = false,
  onOpenInbox,
  onOpenAccount,
  onRequestSignOut,
  children,
  footer,
}: {
  session: ShellSession;
  pathname: string;
  theme: "dark" | "light";
  toggleTheme: () => void;
  immersive?: boolean;
  onOpenInbox: () => void;
  onOpenAccount: () => void;
  onRequestSignOut: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const section = sectionFor(pathname);
  const detail = isDetailRoute(pathname);
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-canvas text-ink">
      <NavRail
        session={session}
        section={section}
        pathname={pathname}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenInbox={onOpenInbox}
        onRequestSignOut={onRequestSignOut}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {!immersive && <MobileTopBar session={session} detail={detail} onOpenInbox={onOpenInbox} onOpenAccount={onOpenAccount} />}
        <div
          id="hm-scroll"
          data-shell-content
          className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain"
        >
          <div className="relative z-0 flex min-h-0 flex-1 flex-col">{children}</div>
          {footer}
        </div>
        {!immersive && <MobileTabBar session={session} section={section} />}
      </div>
    </div>
  );
}
