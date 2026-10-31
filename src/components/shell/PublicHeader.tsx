"use client";

import Link from "next/link";
import { Suspense, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ButtonLink } from "@/components/system";
import { LandingScrollProgress, LandingStageNav } from "@/components/landing/LandingStageNav";
import Logo from "@/components/Logo";
import { browsingActionHref } from "@/lib/hackathons/publicBrowsing";
import { normalizeShellPathname } from "./navConfig";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => { window.removeEventListener("hashchange", onChange); window.removeEventListener("popstate", onChange); };
}

function DiscoverySignIn({ pathname }: { pathname: string }) {
  const search = useSearchParams().toString();
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  return <ButtonLink href={browsingActionHref(`${pathname}${search ? `?${search}` : ""}${hash}`)} variant="primary" size="sm">Sign in</ButtonLink>;
}

/**
 * Header for marketing and legal pages. Carries the HackerMate logo, like the
 * app's mobile top bar. On the landing page it also carries the pipeline
 * stage navigation and a reading-progress line.
 */
export function PublicHeader({ signedIn, onRequestSignOut, discovery = false }: { signedIn: boolean; onRequestSignOut: () => void; discovery?: boolean }) {
  const pathname = normalizeShellPathname(usePathname());
  const landing = pathname === "/";
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-5 md:px-8">
        <Link href={signedIn ? "/dashboard" : "/"} className="flex shrink-0 items-center rounded-md" aria-label="HackerMate home">
          <Logo decorative className="h-7 md:h-8" />
        </Link>

        {landing && <LandingStageNav className="hidden lg:flex" />}

        {discovery ? (
          <nav aria-label="Public discovery" className="flex items-center gap-2 sm:gap-4">
            <Link href="/" className="hidden rounded-md px-1 text-[13px] text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent sm:inline-flex">Home</Link>
            <Link href="/hackathons" aria-current="page" className="rounded-md px-1 text-[13px] font-medium text-ink hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent">Hackathons</Link>
            <Suspense fallback={<ButtonLink href={browsingActionHref(pathname || "/hackathons")} variant="primary" size="sm">Sign in</ButtonLink>}>
              <DiscoverySignIn pathname={pathname || "/hackathons"} />
            </Suspense>
          </nav>
        ) : signedIn ? (
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
