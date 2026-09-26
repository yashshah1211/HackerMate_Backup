"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ModernOAuthSignIn } from "@/components/ui/modern-animated-sign-in";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPath = searchParams.get("next") ?? searchParams.get("redirect") ?? "/dashboard";
  const nextUrl = requestedPath.startsWith("/") && !requestedPath.startsWith("//") && !/[\\\u0000-\u001f]/.test(requestedPath)
    ? requestedPath
    : "/dashboard";
  const collegeParam = searchParams.get("college");

  useEffect(() => {
    let cancelled = false;

    async function checkExistingSession() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        if (authError.name !== "AuthSessionMissingError") {
          console.error("Unable to check login session:", authError);
        }
        return;
      }
      if (!user || cancelled) return;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) {
        console.error("Unable to check onboarding status:", profileError);
        return;
      }
      if (cancelled) return;

      if (profile?.onboarding_completed) {
        router.replace(nextUrl);
      } else {
        router.replace(`/onboarding?next=${encodeURIComponent(nextUrl)}${
          collegeParam ? `&college=${encodeURIComponent(collegeParam)}` : ""
        }`);
      }
    }

    void checkExistingSession();
    return () => { cancelled = true; };
  }, [router, nextUrl, collegeParam]);

  return (
    <main className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-[#09090b] px-4 pb-5 pt-5 text-zinc-50 selection:bg-[#B4F461] selection:text-zinc-950 sm:px-8 sm:pb-7 sm:pt-7">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:52px_52px] [mask-image:radial-gradient(ellipse_65%_60%_at_50%_45%,black,transparent)]" />
      <div aria-hidden="true" className="pointer-events-none absolute left-[12%] top-[-240px] -z-10 size-[520px] rounded-full bg-[#B4F461]/[0.045] blur-[120px]" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-[-270px] right-[8%] -z-10 size-[520px] rounded-full bg-[#22D3EE]/[0.035] blur-[130px]" />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between">
        <Link href="/" className="group inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3.5 text-xs font-medium text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.055] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 motion-reduce:transform-none">
          <ArrowLeft aria-hidden="true" className="size-3.5 transition-transform group-hover:-translate-x-0.5 motion-reduce:transform-none" />
          Back to home
        </Link>
        <span className="hidden items-center gap-2 text-[11px] font-medium tracking-[0.12em] text-zinc-600 sm:inline-flex">
          <span className="size-1.5 rounded-full bg-[#B4F461] shadow-[0_0_10px_rgba(180,244,97,0.5)]" />
          HACKERMATE / ACCOUNT
        </span>
      </header>

      <div className="relative z-10 mx-auto my-auto w-full max-w-5xl py-9 sm:py-12">
        <ModernOAuthSignIn
          title="Make your next build count."
          subtitle="Find your people, join the right hackathon, and keep every project moving. Your workspace starts here."
          nextUrl={nextUrl}
        />
      </div>

      <footer className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 border-t border-white/[0.06] pt-5 text-[11px] text-zinc-600 sm:flex-row">
        <span>© {new Date().getFullYear()} HackerMate</span>
        <span className="inline-flex items-center gap-1.5"><LockKeyhole aria-hidden="true" className="size-3" /> Secure sign-in through Google or GitHub</span>
      </footer>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[100dvh] items-center justify-center bg-[#09090b]"><div role="status" aria-label="Loading sign-in" className="size-6 animate-spin rounded-full border-2 border-zinc-800 border-t-[#B4F461]" /></div>}>
      <LoginContent />
    </Suspense>
  );
}
