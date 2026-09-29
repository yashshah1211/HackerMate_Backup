"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/system";
import { LandingScrollProgress, LandingStageNav } from "@/components/landing/LandingStageNav";
import { HMMark } from "./HMMark";

/**
 * Header for marketing and legal pages. Uses the same brand lockup as the
 * app's mobile top bar. On the landing page it also carries the pipeline
 * stage navigation and a reading-progress line.
 */
export function PublicHeader({ signedIn, onRequestSignOut }: { signedIn: boolean; onRequestSignOut: () => void }) {
  const pathname = usePathname();
  const landing = pathname === "/";
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-5 md:px-8">
        <Link href={signedIn ? "/dashboard" : "/"} className="flex shrink-0 items-center gap-2 rounded-md" aria-label="HackerMate home">
          <HMMark size={28} className="rounded-[7px]" />
          <span className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink [font-variation-settings:'wdth'_90]">HackerMate</span>
        </Link>

        {landing && <LandingStageNav className="hidden lg:flex" />}

        {signedIn ? (
          <div className="flex items-center gap-1">
            <ButtonLink href="/dashboard" variant="ghost" size="sm">
              Open app
            </ButtonLink>
            <button type="button" onClick={onRequestSignOut} className="h-7 rounded-[5px] px-2.5 text-[12.5px] font-medium text-ink-3 hover:text-ink">
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <ButtonLink href="/login" variant="ghost" size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink href="/login" variant="primary" size="sm">
              Find teammates
            </ButtonLink>
          </div>
        )}
      </div>
      {landing && <LandingScrollProgress />}
    </header>
  );
}
