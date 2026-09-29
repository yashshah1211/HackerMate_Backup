"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageLoader } from "@/components/system";
import Logo from "@/components/Logo";
import { SignInPanel } from "@/components/auth/SignInPanel";
import { STAGES } from "@/components/landing/primitives";

/** Human label for where sign-in will return the visitor. */
function destinationLabel(path: string): string | null {
  if (!path || path === "/dashboard" || path === "/") return null;
  if (path.startsWith("/hackathons/sih")) return "the SIH team builder";
  if (path.startsWith("/hackathons/")) return "that hackathon";
  if (path.startsWith("/hackathons")) return "hackathons";
  if (/^\/teams\/[^/]+\/workspace/.test(path)) return "the team workspace";
  if (path.startsWith("/teams/")) return "that team";
  if (path.startsWith("/profile/")) return "that builder's profile";
  if (path.startsWith("/challenges")) return "the challenge";
  if (path.startsWith("/messages")) return "your messages";
  return null;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") ?? searchParams.get("redirect") ?? "/dashboard";
  const collegeParam = searchParams.get("college");
  const returnTo = destinationLabel(nextUrl);

  // If already logged in, redirect directly to onboarding or dashboard (V1 behaviour).
  useEffect(() => {
    async function checkExistingSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile, error } = await supabase.from("profiles").select("onboarding_completed").eq("id", user.id).maybeSingle();
        if (error) console.error("[login] onboarding check failed:", error);

        const safePath = nextUrl.startsWith("/") && !nextUrl.startsWith("//") ? nextUrl : "/dashboard";

        if (profile?.onboarding_completed) {
          router.push(safePath);
        } else {
          const onboardingUrl = `/onboarding?next=${encodeURIComponent(safePath)}${collegeParam ? `&college=${encodeURIComponent(collegeParam)}` : ""}`;
          router.push(onboardingUrl);
        }
      }
    }

    checkExistingSession();
  }, [router, nextUrl, collegeParam]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas text-ink">
      {/* Same logo placement as the landing header */}
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between gap-4 px-5 md:px-8">
          <Link href="/" className="flex items-center rounded-md" aria-label="HackerMate home">
            <Logo decorative className="h-7 md:h-8" />
          </Link>
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to home
          </Link>
        </div>
      </header>

      <main data-v2 className="mx-auto grid w-full max-w-[1280px] flex-1 grid-cols-1 items-center gap-12 px-5 py-10 md:px-8 md:py-16 lg:grid-cols-12 lg:gap-16">
        <div className="mx-auto w-full max-w-[440px] lg:col-span-5 lg:mx-0 lg:max-w-none">
          <SignInPanel
            nextUrl={nextUrl}
            subtitle={
              returnTo
                ? `Use Google or GitHub. You'll go straight back to ${returnTo}.`
                : "Use Google or GitHub. New here? The same button creates your account."
            }
          />
          <p className="mt-6 font-mono text-[12px] text-ink-3">Free for students · First time? You&apos;ll set up your builder profile next.</p>
        </div>

        {/* The same five-stage pipeline the landing page walks through */}
        <aside aria-label="What happens after you sign in" className="hidden lg:col-span-6 lg:col-start-7 lg:block">
          <div className="overflow-hidden rounded-xl border border-line-strong/80 bg-raised">
            <div className="flex h-11 items-center justify-between border-b border-line px-4">
              <span className="font-mono text-[12px] text-ink-2">your-team → next-hackathon</span>
              <span className="font-mono text-[12px] text-ink-3">queued</span>
            </div>
            <ol className="divide-y divide-line">
              {STAGES.map((s, i) => (
                <li key={s.id} className="grid grid-cols-[18px_24px_72px_minmax(0,1fr)] items-center gap-3 px-4 py-3.5">
                  <span
                    aria-hidden
                    className={
                      i === 0
                        ? "inline-flex size-[18px] items-center justify-center rounded-[5px] bg-accent"
                        : "inline-flex size-[18px] rounded-[5px] ring-1 ring-inset ring-line-strong"
                    }
                  >
                    {i === 0 && <span className="size-1.5 rounded-full bg-on-accent" />}
                  </span>
                  <span className="font-mono text-[11.5px] text-ink-3 tabular">{s.n}</span>
                  <span className={i === 0 ? "caps-label text-ink" : "caps-label text-ink-3"}>{s.verb}</span>
                  <span className="text-[13.5px] text-ink-2">{s.line}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="mt-4 text-[13px] text-ink-3">Sign in to start at step one: search builders by the skill your team is missing.</p>
        </aside>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-2 px-5 py-4 font-mono text-[12px] text-ink-3 md:px-8">
          <span>HackerMate · Team operating system for hackathons</span>
          <span className="flex gap-4">
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading sign-in" />}>
      <LoginContent />
    </Suspense>
  );
}
