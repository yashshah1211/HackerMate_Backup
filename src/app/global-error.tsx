"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Logo from "@/components/Logo";
// global-error replaces the root layout, so load the design tokens here.
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen items-center justify-center bg-canvas p-6 font-sans text-ink antialiased">
        <main data-v2 className="flex w-full max-w-md flex-col items-center text-center">
          <Logo className="h-8" />
          <h1 className="mt-3 text-[24px] font-semibold tracking-[-0.02em] text-ink">Something went wrong</h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">
            An unexpected error occurred. Our team has been notified.
          </p>
          <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex h-11 items-center justify-center rounded-[7px] bg-accent px-5 text-[14px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
            >
              Try again
            </button>
            {/* Full page load on purpose: the root layout (and client router) crashed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-[7px] border border-line-strong bg-raised px-5 text-[14px] font-medium text-ink transition-colors hover:bg-overlay"
            >
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
