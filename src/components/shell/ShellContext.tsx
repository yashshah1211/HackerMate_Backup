"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { ShellSession } from "./useShellSession";

type ShellContextValue = {
  session: ShellSession;
  theme: "dark" | "light";
  toggleTheme: () => void;
  /** Immersive mode hides mobile chrome (tab bar + top bar) for chat/workspace. */
  setImmersive: (on: boolean) => void;
  openInbox: () => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ value, children }: { value: ShellContextValue; children: ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue | null {
  return useContext(ShellContext);
}

/** Opt a view into immersive mode while it is mounted. */
export function useImmersive(on: boolean) {
  const shell = useShell();
  const setImmersive = shell?.setImmersive;
  useEffect(() => {
    if (!setImmersive) return;
    setImmersive(on);
    return () => setImmersive(false);
  }, [on, setImmersive]);
}
