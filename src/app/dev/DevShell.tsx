"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ShellProvider } from "@/components/shell/ShellContext";
import { ShellFrame } from "@/components/shell/ShellFrame";
import type { ShellSession, ShellTeam } from "@/components/shell/useShellSession";
import { DEV_TEAMS } from "./fixtures";

/** Mock signed-in shell for the dev gallery. */
const EXTRA_TEAM_NAMES = ["Byte Brigade", "Kernel Panic", "Dry Run", "Stack Smash", "Hot Reload", "Edge Cases", "Cold Start"];

/** `?teams=N` repeats the fixture teams so rail layouts can be checked with a long team list. */
function fixtureTeams(count: number | null): ShellTeam[] {
  if (!count || count <= DEV_TEAMS.length) return count === 0 ? [] : DEV_TEAMS.slice(0, count ?? DEV_TEAMS.length);
  const extra = Array.from({ length: count - DEV_TEAMS.length }, (_, i) => {
    const base = DEV_TEAMS[i % DEV_TEAMS.length];
    return { ...base, id: `dev-team-x${i + 1}`, name: EXTRA_TEAM_NAMES[i % EXTRA_TEAM_NAMES.length], isOwner: false };
  });
  return [...DEV_TEAMS, ...extra];
}

export default function DevShell({ pathname, children, signedIn = true }: { pathname: string; children: ReactNode; signedIn?: boolean }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [immersive, setImmersive] = useState(false);
  const [teamCount, setTeamCount] = useState<number | null>(null);
  // Fixtures use Date.now() relative times ("12m ago"), which differ between the
  // server render and hydration. Render the page body on the client only.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      setMounted(true);
      const params = new URLSearchParams(window.location.search);
      const q = params.get("theme");
      const stored = localStorage.getItem("hm_dev_theme");
      if (q === "light" || stored === "light") setTheme("light");
      const n = params.get("teams");
      if (n !== null && !Number.isNaN(Number(n))) setTeamCount(Math.max(0, Math.min(12, Number(n))));
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
      teams: signedIn ? fixtureTeams(teamCount) : [],
      unreadNotifications: signedIn ? 3 : 0,
      setUnreadNotifications: () => {},
      unreadMessages: signedIn ? 2 : 0,
      currentStreak: signedIn ? 6 : 0,
      reloadTeams: () => {},
      signOut: async () => {},
    }),
    [signedIn, teamCount],
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
        {mounted ? children : null}
      </ShellFrame>
    </ShellProvider>
  );
}
