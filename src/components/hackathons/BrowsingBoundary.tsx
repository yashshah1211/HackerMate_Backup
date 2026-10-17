"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { verifyBrowsingAccess, type BrowsingAccess } from "@/lib/hackathons/publicBrowsing";
import { Button, ErrorNotice, Page, PageLoader } from "@/components/system";

type ReadableAccess = Extract<BrowsingAccess, { kind: "guest" | "member" }>;
const BrowsingAccessContext = createContext<ReadableAccess | null>(null);

/** Reuse the outer trusted decision instead of mounting a second auth verifier. */
export default function BrowsingBoundary({ children }: { children: (access: ReadableAccess) => ReactNode }) {
  const inherited = useContext(BrowsingAccessContext);
  if (inherited) return <>{children(inherited)}</>;
  return <BrowsingBoundaryRoot>{children}</BrowsingBoundaryRoot>;
}

function BrowsingBoundaryRoot({ children }: { children: (access: ReadableAccess) => ReactNode }) {
  const [access, setAccess] = useState<BrowsingAccess | null>(null);
  const requiresExplicitGuest = useRef(false);
  const actions = useRef<{ retry: () => void; signOut: () => void } | null>(null);
  useEffect(() => {
    let alive = true, generation = 0;
    let signOutRequest: number | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const evaluate = () => {
      const request = ++generation;
      setAccess(null);
      // Defer Supabase calls outside its auth callback/lock.
      const timer = setTimeout(async () => {
        timers.delete(timer);
        if (!alive || request !== generation) return;
        const next = await verifyBrowsingAccess(supabase);
        if (!alive || request !== generation) return;
        if (next.kind !== "guest") requiresExplicitGuest.current = true;
        // Missing credentials cannot erase an observed account or verification failure.
        setAccess(next.kind === "guest" && requiresExplicitGuest.current ? { kind: "unavailable" } : next);
      }, 0);
      timers.add(timer);
    };
    const signOut = () => {
      if (!alive || signOutRequest !== null) return;
      const request = ++generation;
      signOutRequest = request;
      requiresExplicitGuest.current = true;
      setAccess(null);
      const timer = setTimeout(async () => {
        timers.delete(timer);
        if (!alive || request !== generation) { signOutRequest = null; return; }
        try {
          const result = await supabase.auth.signOut({ scope: "local" });
          if (!alive || request !== generation) return;
          if (result.error) throw result.error;
          const next = await verifyBrowsingAccess(supabase);
          if (!alive || request !== generation) return;
          if (next.kind !== "guest") throw new Error("Sign-out did not establish public browsing access");
          requiresExplicitGuest.current = false;
          setAccess(next);
        } catch (error) {
          console.error("Public browsing sign-out failed:", error);
          if (alive && request === generation) setAccess({ kind: "unavailable" });
        } finally { signOutRequest = null; }
      }, 0);
      timers.add(timer);
    };
    actions.current = { retry: evaluate, signOut };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (session || event === "SIGNED_OUT") requiresExplicitGuest.current = true;
      // This event alone proves no intent. Only our still-current explicit action
      // may wait for its own signOut + verification to establish a guest state.
      if (event === "SIGNED_OUT" && !session && signOutRequest === generation) return;
      evaluate();
    });
    evaluate();
    // Recheck account state when returning from another tab, without polling.
    const onFocus = () => { evaluate(); };
    window.addEventListener("focus", onFocus);
    return () => { alive = false; generation++; actions.current = null; subscription.unsubscribe(); timers.forEach(clearTimeout); window.removeEventListener("focus", onFocus); };
  }, []);

  if (!access) return <PageLoader label="Checking account access" />;
  if (access.kind === "suspended" || access.kind === "unavailable") return <Page>
    <ErrorNotice title={access.kind === "suspended" ? "Account suspended" : "Account verification unavailable"}
      detail={access.kind === "suspended" ? "Your account cannot use this page. Contact support if you believe this is an error. You can sign out to browse public events."
        : "We could not verify your account, or your session ended. Retry verification or explicitly sign out to browse public events. You have not been switched to guest access."}
      onRetry={() => actions.current?.retry()} />
    <div className="mt-4"><Button variant="secondary" onClick={() => actions.current?.signOut()}>Sign out and browse public events</Button></div>
  </Page>;
  return <BrowsingAccessContext.Provider value={access}><div key={access.kind === "member" ? access.userId : "guest"}>{children(access)}</div></BrowsingAccessContext.Provider>;
}
