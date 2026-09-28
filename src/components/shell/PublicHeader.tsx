"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { ButtonLink } from "@/components/system";

/** Header for marketing and legal pages. */
export function PublicHeader({ signedIn, onRequestSignOut }: { signedIn: boolean; onRequestSignOut: () => void }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 md:px-6">
        <Link href={signedIn ? "/dashboard" : "/"} className="flex items-center" aria-label="HackerMate home">
          <Logo className="h-7 w-auto" />
        </Link>
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
    </header>
  );
}
