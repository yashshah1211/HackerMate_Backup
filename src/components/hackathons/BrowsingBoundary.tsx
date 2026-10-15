"use client";

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { verifyBrowsingAccess, type BrowsingAccess } from "@/lib/hackathons/publicBrowsing";
import { ErrorNotice, Page, PageLoader } from "@/components/system";

export default function BrowsingBoundary({ children }: { children: (access: Extract<BrowsingAccess, { kind: "guest" | "member" }>) => ReactNode }) {
  const [access, setAccess] = useState<BrowsingAccess | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true, generation = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const evaluate = () => {
      const request = ++generation;
      // Defer Supabase calls outside its auth callback/lock.
      const timer = setTimeout(async () => {
        timers.delete(timer);
        if (!alive || request !== generation) return;
        setAccess(null);
        const next = await verifyBrowsingAccess(supabase);
        if (alive && request === generation) setAccess(next);
      }, 0);
      timers.add(timer);
    };
    evaluate();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setAccess(null);
      evaluate();
    });
    // Recheck account state when returning from another tab, without polling.
    const onFocus = () => { setAccess(null); evaluate(); };
    window.addEventListener("focus", onFocus);
    return () => { alive = false; generation++; subscription.unsubscribe(); timers.forEach(clearTimeout); window.removeEventListener("focus", onFocus); };
  }, [attempt]);

  if (!access) return <PageLoader label="Checking account access" />;
  if (access.kind === "suspended") return <Page><ErrorNotice title="Account suspended" detail="Your account cannot use this page. Contact support if you believe this is an error." /></Page>;
  if (access.kind === "unavailable") return <Page><ErrorNotice title="Account verification unavailable" detail="We could not verify your session. Please retry; you have not been switched to guest access." onRetry={() => { setAccess(null); setAttempt(value => value + 1); }} /></Page>;
  return <div key={access.kind === "member" ? access.userId : "guest"}>{children(access)}</div>;
}
