"use client";
import { useEffect, useState } from "react";

/** Mounted behind the browsing/loading boundary; no server-rendered temporal labels. */
export function useHackathonClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const clock = setInterval(refresh, 30_000);
    window.addEventListener?.("focus", refresh);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(clock);
      window.removeEventListener?.("focus", refresh);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return now;
}
