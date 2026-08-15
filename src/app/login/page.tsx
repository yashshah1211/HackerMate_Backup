"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ModernOAuthSignIn } from "@/components/ui/modern-animated-sign-in";
import Link from "next/link";
import Logo from "@/components/Logo";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") ?? "/dashboard";

  // If already logged in, redirect directly to onboarding or dashboard
  useEffect(() => {
    async function checkExistingSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", user.id)
          .maybeSingle();

        const safePath =
          nextUrl.startsWith("/") && !nextUrl.startsWith("//")
            ? nextUrl
            : "/dashboard";

        if (profile?.onboarding_completed) {
          router.push(safePath);
        } else {
          router.push(`/onboarding?next=${encodeURIComponent(safePath)}`);
        }
      }
    }

    checkExistingSession();
  }, [router, nextUrl]);

  return (
    <main className="min-h-screen w-full flex flex-col justify-between bg-[#09090b] text-white p-4 sm:p-6 relative overflow-hidden selection:bg-[#B4F461] selection:text-black">
      {/* Background Ambience */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[400px]">
        <div className="absolute top-10 left-1/4 w-[350px] h-[350px] bg-[#B4F461]/8 rounded-full blur-[140px]" />
        <div className="absolute top-10 right-1/4 w-[350px] h-[350px] bg-[#22D3EE]/8 rounded-full blur-[140px]" />
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-20 w-full max-w-5xl mx-auto flex items-center justify-between py-2">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-white transition-colors bg-zinc-900/70 hover:bg-zinc-850 border border-zinc-800 px-3.5 py-1.5 rounded-xl backdrop-blur-md"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </Link>
      </header>

      {/* Main 21st.dev Animated Sign In View */}
      <div className="relative z-10 w-full max-w-5xl mx-auto my-auto py-6">
        <ModernOAuthSignIn
          title="Welcome to HackerMate"
          subtitle="Sign in with Google or GitHub in 1 tap to find teammates, join live hackathons, and access your workspace."
          nextUrl={nextUrl}
        />
      </div>

      {/* Bottom Footer */}
      <footer className="relative z-20 w-full max-w-5xl mx-auto text-center py-2">
        <p className="text-[11px] font-mono text-zinc-600">
          HackerMate • Team Operating System for College Hackathons
        </p>
      </footer>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-white">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-[#B4F461] rounded-full animate-spin" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
