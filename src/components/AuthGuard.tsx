"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authorized, setAuthorized] = useState(false);
  const [isBanned, setIsBanned] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/?next=${encodeURIComponent(next)}`;
        return;
      }

      // Check if user has completed onboarding and is banned
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, onboarding_completed, is_banned")
        .eq("id", user.id)
        .single();

      if (profile?.is_banned) {
        setIsBanned(true);
        setAuthorized(false);
        return;
      }

      if (!profile || error || !profile.onboarding_completed) {
        // Profile missing or onboarding not finished — send to onboarding
        window.location.href = "/onboarding";
        return;
      }

      setAuthorized(true);
    }

    checkAuth();
  }, []);

  if (isBanned) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-6">
        <div className="w-full max-w-md text-center card card-static p-8">
          <div className="w-14 h-14 rounded bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto mb-6">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-2">
            Account Suspended
          </h1>
          <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
            Your HackerMate account has been suspended for violating our community guidelines or receiving multiple user reports.
          </p>
          <div className="p-3 bg-zinc-950 border border-zinc-900 rounded text-[10px] text-zinc-500 font-mono">
            Error Code: AUTH_ACCOUNT_BANNED
          </div>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="w-5 h-5 border-2 border-zinc-800 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
