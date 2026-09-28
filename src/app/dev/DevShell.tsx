"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ShellProvider } from "@/components/shell/ShellContext";
import { ShellFrame } from "@/components/shell/ShellFrame";
import type { ShellSession } from "@/components/shell/useShellSession";
import { DEV_TEAMS } from "./fixtures";

/** Mock signed-in shell for the dev gallery. */
export default function DevShell({ pathname, children, signedIn = true }: { pathname: string; children: ReactNode; signedIn?: boolean }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      const q = new URLSearchParams(window.location.search).get("theme");
      const stored = localStorage.getItem("hm_dev_theme");
      if (q === "light" || stored === "light") setTheme("light");
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(theme === "dark" ? "light" : "dark");
    root.classList.add(theme);
  }, [theme]);

  const session: ShellSession = useMemo(
    () => ({
      mounted: true,
      authLoading: false,
      hasSession: signedIn,
      viewerId: signedIn ? "dev-viewer" : null,
      profile: signedIn ? { id: "dev-viewer", full_name: "Ananya Rao", avatar_url: null, role: "admin" } : null,
      teams: signedIn ? DEV_TEAMS : [],
      unreadNotifications: signedIn ? 3 : 0,
      setUnreadNotifications: () => {},
      unreadMessages: signedIn ? 2 : 0,
      currentStreak: signedIn ? 6 : 0,
      reloadTeams: () => {},
      signOut: async () => {},
    }),
    [signedIn],
  );

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    localStorage.setItem("hm_dev_theme", next);
    setTheme(next);
  };

  return (
    <ShellProvider value={{ session, theme, toggleTheme, setImmersive, openInbox: () => {} }}>
      <ShellFrame
        session={session}
        pathname={pathname}
        theme={theme}
        toggleTheme={toggleTheme}
        immersive={immersive}
        onOpenInbox={() => {}}
        onOpenAccount={() => {}}
        onRequestSignOut={() => {}}
      >
        {children}
      </ShellFrame>
    </ShellProvider>
  );
}
