"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import FeedbackWidget from "@/components/FeedbackWidget";
import DailyStreakTracker from "@/components/DailyStreakTracker";
import NotificationDrawer from "@/components/NotificationDrawer";
import Footer from "@/components/Footer";
import { Button, Dialog } from "@/components/system";
import { shouldRenderFooter } from "@/lib/layoutConfig";
import { useShellSession } from "./useShellSession";
import { ShellProvider } from "./ShellContext";
import { ShellFrame } from "./ShellFrame";
import { AccountSheet } from "./AccountMenu";
import { PublicHeader } from "./PublicHeader";
import { isBareRoute, isForcedDarkRoute, isMarketingRoute } from "./navConfig";

function applyThemeClass(theme: "dark" | "light") {
  const root = document.documentElement;
  if (root.classList.contains(theme)) return;
  root.classList.remove(theme === "dark" ? "light" : "dark");
  root.classList.add(theme);
}

/**
 * HackerMate V2 app shell.
 * - Desktop/tablet: 76px navigation rail (destinations, your teams, inbox, account).
 * - Mobile: top bar (brand/back, inbox, account) + 5-tab bottom bar.
 * - Content scrolls inside [data-shell-content] so full-height views (chat,
 *   workspace) can size themselves with h-full, exactly as in V1.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const session = useShellSession();
  const [themePref, setThemePrefState] = useState<"dark" | "light" | "system">("system");
  const [sysTheme, setSysTheme] = useState<"dark" | "light">("dark");
  const [inboxOpen, setInboxOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const update = (e: MediaQueryListEvent | MediaQueryList) => setSysTheme(e.matches ? "light" : "dark");
    update(mq);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Read the saved preference once on the client.
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const stored = localStorage.getItem("theme");
        if (stored === "light" || stored === "dark" || stored === "system") {
          setThemePrefState(stored as any);
        }
      } catch {}
    });
  }, []);

  // V1 rule: marketing/public routes and signed-out visitors are always dark.
  const appliedPref = themePref === "system" ? sysTheme : themePref;
  const theme: "dark" | "light" = isForcedDarkRoute(pathname) || !session.viewerId ? "dark" : appliedPref;

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const applyThemeWithTransition = useCallback((nextApplied: "dark" | "light") => {
    const css = document.createElement("style");
    css.appendChild(document.createTextNode("*,*::before,*::after{transition:none!important}"));
    document.head.appendChild(css);
    applyThemeClass(nextApplied);
    void window.getComputedStyle(document.documentElement).opacity;
    requestAnimationFrame(() => requestAnimationFrame(() => css.remove()));
  }, []);

  const setThemePref = useCallback((pref: "dark" | "light" | "system") => {
    setThemePrefState(pref);
    try {
      localStorage.setItem("theme", pref);
    } catch {}
    const nextApplied = pref === "system" ? sysTheme : pref;
    applyThemeWithTransition(nextApplied);
  }, [sysTheme, applyThemeWithTransition]);

  const toggleTheme = useCallback(() => {
    // Maintain legacy toggle behavior for anywhere it might still be used
    const nextPref = theme === "dark" ? "light" : "dark";
    setThemePref(nextPref);
  }, [theme, setThemePref]);

  const openInbox = useCallback(() => setInboxOpen(true), []);
  const requestSignOut = useCallback(() => setSignOutOpen(true), []);

  const executeSignOut = useCallback(async () => {
    setSigningOut(true);
    await session.signOut();
  }, [session]);

  const ctx = useMemo(
    () => ({ session, theme, themePref, setThemePref, toggleTheme, setImmersive, openInbox }),
    [session, theme, themePref, setThemePref, toggleTheme, openInbox],
  );

  const signOutDialog = (
    <Dialog
      open={signOutOpen}
      onClose={() => setSignOutOpen(false)}
      size="sm"
      title="Sign out of HackerMate?"
      description="You'll need to sign in again to reach your teams and messages."
      footer={
        <>
          <Button variant="ghost" onClick={() => setSignOutOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={signingOut} onClick={executeSignOut}>
            Sign out
          </Button>
        </>
      }
    />
  );

  if (isBareRoute(pathname)) {
    return (
      <ShellProvider value={ctx}>
        {children}
        {signOutDialog}
      </ShellProvider>
    );
  }

  if (isMarketingRoute(pathname)) {
    const signedIn = Boolean(session.mounted && (session.viewerId || session.hasSession));
    return (
      <ShellProvider value={ctx}>
        <PublicHeader signedIn={signedIn} onRequestSignOut={requestSignOut} />
        <div className="flex min-h-[100dvh] flex-col bg-canvas pt-14">
          <div className="flex-1">{children}</div>
          {shouldRenderFooter(pathname) && <Footer />}
        </div>
        {signOutDialog}
      </ShellProvider>
    );
  }

  const showFeedback =
    pathname !== "/hackathons/create" && !pathname.startsWith("/messages") && !pathname.startsWith("/admin");

  return (
    <ShellProvider value={ctx}>
      {session.viewerId && <DailyStreakTracker />}
      <ShellFrame
        session={session}
        pathname={pathname}
        theme={theme}
        toggleTheme={toggleTheme}
        immersive={immersive}
        onOpenInbox={openInbox}
        onOpenAccount={() => setAccountOpen(true)}
        onRequestSignOut={requestSignOut}
        footer={shouldRenderFooter(pathname) ? <Footer /> : null}
      >
        {children}
      </ShellFrame>

      {session.viewerId && (
        <>
          <NotificationDrawer
            isOpen={inboxOpen}
            onClose={() => setInboxOpen(false)}
            onCountChange={session.setUnreadNotifications}
          />
          <AccountSheet
            open={accountOpen}
            onClose={() => setAccountOpen(false)}
            viewerId={session.viewerId}
            profile={session.profile}
            theme={theme}
            toggleTheme={toggleTheme}
            onRequestSignOut={requestSignOut}
          />
        </>
      )}
      {showFeedback && session.viewerId && <FeedbackWidget />}
      {signOutDialog}
    </ShellProvider>
  );
}
