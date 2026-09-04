"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { identifyUser } from "@/lib/posthog";

export default function AuthGuard({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    async function evaluateUser(user: any) {
      if (!isMountedRef.current) return;

      if (!user) {
        const next = `${window.location.pathname}${window.location.search}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      try {
        // Fetch user profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, onboarding_completed, is_banned, role")
          .eq("id", user.id)
          .maybeSingle();

        if (!isMountedRef.current) return;

        if (profile) {
          identifyUser(profile.id, {
            onboarding_completed: profile.onboarding_completed,
            role: profile.role,
          });
        }

        if (profile?.is_banned) {
          setIsBanned(true);
          setAuthorized(false);
          return;
        }

        const isSuperAdmin = user.email?.toLowerCase().trim() === "yashshah7117@gmail.com";
        const isAdmin = isSuperAdmin || profile?.role === "admin";

        if (adminOnly && !isAdmin) {
          router.replace("/dashboard");
          return;
        }

        if (!profile || !profile.onboarding_completed) {
          const pathname = window.location.pathname;
          if (
            !adminOnly &&
            (pathname.startsWith("/dashboard") ||
              pathname.startsWith("/hackathons") ||
              pathname.startsWith("/developers"))
          ) {
            setAuthorized(true);
            return;
          }
          const next = `${window.location.pathname}${window.location.search}`;
          router.replace(`/onboarding?next=${encodeURIComponent(next)}`);
          return;
        }

        setAuthorized(true);
      } catch (err) {
        console.error("[AuthGuard] Profile verification error:", err);
        // Fallback: keep user authorized if network error occurs to avoid destructive logout
        if (isMountedRef.current) {
          setAuthorized(true);
        }
      }
    }

    // 1. Check existing session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        evaluateUser(session.user);
      } else {
        // If getSession is empty, double check getUser before deciding to redirect
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) {
            evaluateUser(user);
          }
        });
      }
    });

    // 2. Subscribe to auth state changes to handle initialization & token refreshes seamlessly
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        if (isMountedRef.current) {
          setAuthorized(false);
          const next = `${window.location.pathname}${window.location.search}`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        }
      } else if (session?.user) {
        evaluateUser(session.user);
      } else if (event === "INITIAL_SESSION" && !session) {
        // Initial session resolution confirmed no active session
        if (isMountedRef.current) {
          const next = `${window.location.pathname}${window.location.search}`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        }
      }
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [adminOnly, router]);

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
