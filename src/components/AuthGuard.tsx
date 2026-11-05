"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { identifyUser } from "@/lib/posthog";
import { cn } from "@/lib/utils";
import { Button, PageLoader } from "@/components/system";
import { Ban, TriangleAlert } from "lucide-react";

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
  const [authError, setAuthError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    let verificationId = 0;
    let authorizedUserId: string | null = null;
    const isCurrent = (id: number) => mounted && verificationId === id;

    async function evaluateUser(user: { id: string; email?: string } | null) {
      if (!mounted) return;
      const id = ++verificationId;
      // Keep existing workspace state during a same-account token refresh.
      // Account changes and failed verification still revoke access.
      if (!user || authorizedUserId !== user.id) {
        authorizedUserId = null;
        setAuthorized(false);
      }
      setIsBanned(false);
      setAuthError(null);

      if (!user) {
        const next = `${window.location.pathname}${window.location.search}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      try {
        // Fetch user profile
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, onboarding_completed, is_banned, role")
          .eq("id", user.id)
          .maybeSingle();

        if (!isCurrent(id)) return;
        if (profileError) throw profileError;
        if (!profile || profile.id !== user.id || typeof profile.is_banned !== "boolean") {
          throw new Error("Account status unavailable");
        }

        if (profile) {
          identifyUser(profile.id, {
            onboarding_completed: profile.onboarding_completed,
            role: profile.role,
          });
        }

        if (profile?.is_banned) {
          authorizedUserId = null;
          setIsBanned(true);
          setAuthorized(false);
          return;
        }

        const isSuperAdmin = user.email?.toLowerCase().trim() === "yashshah7117@gmail.com";
        const isAdmin = isSuperAdmin || profile?.role === "admin";

        if (adminOnly && !isAdmin) {
          authorizedUserId = null;
          setAuthorized(false);
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
            authorizedUserId = user.id;
            setAuthorized(true);
            return;
          }
          authorizedUserId = null;
          setAuthorized(false);
          const next = `${window.location.pathname}${window.location.search}`;
          router.replace(`/onboarding?next=${encodeURIComponent(next)}`);
          return;
        }

        authorizedUserId = user.id;
        setAuthorized(true);
      } catch (err) {
        // Never fail-open to authorized=true, which bypasses bans, onboarding, and admin gates
        if (isCurrent(id)) {
          console.error("[AuthGuard] Profile verification error:", err);
          authorizedUserId = null;
          setAuthorized(false);
          setAuthError("Unable to verify your account session. Please check your network connection.");
        }
      }
    }

    // 1. Check existing session first
    const initialId = verificationId;
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (!isCurrent(initialId)) return;
      if (error) throw error;
      if (session?.user) {
        void evaluateUser(session.user);
      } else {
        // If getSession is empty, double check getUser before deciding to redirect
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (!isCurrent(initialId)) return;
        if (userError && userError.name !== "AuthSessionMissingError") throw userError;
        void evaluateUser(user);
      }
    }).catch(error => {
      if (isCurrent(initialId)) {
        console.error("[AuthGuard] Session verification error:", error);
        setAuthorized(false);
        setAuthError("Unable to verify your account session. Please check your network connection.");
      }
    });

    // 2. Subscribe to auth state changes to handle initialization & token refreshes seamlessly
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        if (mounted) {
          ++verificationId;
          authorizedUserId = null;
          setAuthorized(false);
          setIsBanned(false);
          setAuthError(null);
          const next = `${window.location.pathname}${window.location.search}`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        }
      } else if (session?.user) {
        void evaluateUser(session.user);
      } else if (event === "INITIAL_SESSION" && !session) {
        // Initial session resolution confirmed no active session
        if (mounted) {
          ++verificationId;
          authorizedUserId = null;
          setAuthorized(false);
          const next = `${window.location.pathname}${window.location.search}`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        }
      }
    });

    return () => {
      mounted = false;
      ++verificationId;
      subscription.unsubscribe();
    };
  }, [adminOnly, router]);

  if (isBanned) {
    return (
      <GuardNotice
        icon={<Ban aria-hidden />}
        tone="bad"
        title="Account suspended"
        body="Your HackerMate account has been suspended for violating our community guidelines or receiving multiple user reports."
        code="AUTH_ACCOUNT_BANNED"
      />
    );
  }

  if (authError) {
    return (
      <GuardNotice
        icon={<TriangleAlert aria-hidden />}
        tone="warn"
        title="Verification unavailable"
        body={authError}
        actions={
          <>
            <Button
              variant="primary"
              onClick={() => {
                setAuthError(null);
                supabase.auth.getUser().then(({ data: { user } }) => {
                  if (user) {
                    supabase.auth.getSession().then(({ data: { session } }) => {
                      if (session?.user) {
                        window.location.reload();
                      }
                    });
                  } else {
                    const next = `${window.location.pathname}${window.location.search}`;
                    router.replace(`/login?next=${encodeURIComponent(next)}`);
                  }
                });
              }}
            >
              Retry connection
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                router.replace("/login");
              }}
            >
              Back to login
            </Button>
          </>
        }
      />
    );
  }

  if (!authorized) {
    return <PageLoader label="Checking your session" />;
  }

  return <>{children}</>;
}

/** Full-page account notice (suspended / verification failure). */
function GuardNotice({
  icon,
  tone,
  title,
  body,
  code,
  actions,
}: {
  icon: React.ReactNode;
  tone: "bad" | "warn";
  title: string;
  body: string;
  code?: string;
  actions?: React.ReactNode;
}) {
  return (
    <main data-v2 className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div role="alert" className="w-full max-w-md rounded-lg border border-line bg-raised p-6 text-center md:p-8">
        <span
          className={cn(
            "mx-auto mb-5 inline-flex size-11 items-center justify-center rounded-md [&_svg]:size-5",
            tone === "bad" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn",
          )}
        >
          {icon}
        </span>
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink [font-variation-settings:'wdth'_92]">
          {title}
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{body}</p>
        {code && (
          <p className="mt-5 rounded-md bg-sunken px-3 py-2 font-mono text-[12.5px] text-ink-3 ring-1 ring-inset ring-line">
            Error code: {code}
          </p>
        )}
        {actions && <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">{actions}</div>}
      </div>
    </main>
  );
}

