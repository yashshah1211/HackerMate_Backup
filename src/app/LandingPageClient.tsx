"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { LandingData } from "@/lib/getLandingData";
import { ButtonLink } from "@/components/system";
import { LandingHero } from "@/components/landing/LandingHero";
import { ScrambleSection } from "@/components/landing/ScrambleSection";
import { FindSection } from "@/components/landing/FindSection";
import { ReviewSection } from "@/components/landing/ReviewSection";
import { MergeSection } from "@/components/landing/MergeSection";
import { BuildSection } from "@/components/landing/BuildSection";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { OrganizerDialog, ShipSection } from "@/components/landing/ShipSection";

interface LandingPageClientProps {
  initialData: LandingData;
}

/**
 * HackerMate V2 public landing page. The page reads as one pipeline run:
 * the problem, then find → review → merge → build → ship, each stage shown
 * with the real V2 interface (example data), ending in the signup.
 */
export function LandingPageClient({ initialData }: LandingPageClientProps) {
  const router = useRouter();
  const [organizerOpen, setOrganizerOpen] = useState(false);
  // /auth/callback sends failed code exchanges to "/?error=AuthCallbackError".
  const [authFailed, setAuthFailed] = useState(false);
  useEffect(() => {
    Promise.resolve().then(() => setAuthFailed(new URLSearchParams(window.location.search).get("error") === "AuthCallbackError"));
  }, []);

  // Signed-in visitors go straight to the app (same rule as V1).
  useEffect(() => {
    async function checkUserSession() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data, error } = await supabase.from("profiles").select("onboarding_completed").eq("id", user.id).maybeSingle();
          if (error) console.error("[landing] onboarding check failed:", error);

          const requestedPath = new URLSearchParams(window.location.search).get("next");
          const safePath = requestedPath?.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/dashboard";

          if (data?.onboarding_completed) {
            router.push(safePath);
          } else {
            router.push(`/onboarding?next=${encodeURIComponent(safePath)}`);
          }
        }
      } catch (err) {
        console.error("Session check error on landing page:", err);
      }
    }

    checkUserSession();
  }, [router]);

  return (
    <main className="relative flex min-h-screen flex-col overflow-x-clip bg-canvas text-ink">
      {authFailed && (
        <div role="alert" className="border-b border-line bg-bad-soft">
          <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-3 px-5 py-3 md:px-8">
            <p className="text-[13.5px] text-ink">Sign-in didn&apos;t finish. The link may have expired or been cancelled.</p>
            <ButtonLink href="/login" size="sm" variant="secondary">
              Try again
            </ButtonLink>
          </div>
        </div>
      )}
      <LandingHero builderCount={initialData.userCount} hackathonCount={initialData.hackathonCount} upcoming={initialData.upcoming} />
      <ScrambleSection />
      <FindSection />
      <ReviewSection />
      <MergeSection />
      <BuildSection />
      <LandingFaq onOrganizer={() => setOrganizerOpen(true)} />
      <ShipSection onOrganizer={() => setOrganizerOpen(true)} />
      <OrganizerDialog open={organizerOpen} onClose={() => setOrganizerOpen(false)} />
    </main>
  );
}
