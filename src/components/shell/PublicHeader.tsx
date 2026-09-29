"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/system";
import { LandingScrollProgress, LandingStageNav } from "@/components/landing/LandingStageNav";
import Logo from "@/components/Logo";

/**
 * Header for marketing and legal pages. Carries the HackerMate logo, like the
 * app's mobile top bar. On the landing page it also carries the pipeline
 * stage navigation and a reading-progress line.
 */
export function PublicHeader({ signedIn, onRequestSignOut }: { signedIn: boolean; onRequestSignOut: () => void }) {
  const pathname = usePathname();
  const landing = pathname === "/";
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-5 md:px-8">
        <Link href={signedIn ? "/dashboard" : "/"} className="flex shrink-0 items-center rounded-md" aria-label="HackerMate home">
          <Logo decorative className="h-7 md:h-8" />
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
