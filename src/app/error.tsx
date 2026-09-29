"use client";

import { useEffect } from "react";
import { LayoutDashboard, RotateCw, TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/system";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Application error boundary triggered:", error);
  }, [error]);

  return (
    <main
      data-v2
      className="mx-auto flex min-h-[70vh] w-full max-w-[560px] flex-col items-center justify-center px-5 py-16 text-center"
    >
      <span className="inline-flex size-11 items-center justify-center rounded-md bg-bad-soft text-bad">
        <TriangleAlert className="size-5" aria-hidden />
      </span>
      <h1
        data-v2-heading
        className="mt-5 font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink [font-variation-settings:'wdth'_92] md:text-[34px]"
      >
        Something went wrong
      </h1>
      <p className="mt-3 max-w-sm text-[14.5px] leading-relaxed text-ink-2">
        An unexpected error occurred. We have logged the details and are looking into it.
      </p>

      {/* Technical details */}
      {error.message && (
        <div className="mt-6 max-h-32 w-full overflow-auto rounded-md bg-sunken px-3 py-2.5 text-left font-mono text-[12px] leading-relaxed text-ink-3 ring-1 ring-inset ring-line">
          <span className="select-none font-semibold text-ink-2">Error: </span>
          <span className="break-words">{error.message}</span>
        </div>
      )}

      <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button variant="primary" size="lg" icon={<RotateCw aria-hidden />} onClick={() => reset()}>
          Try again
        </Button>
        <ButtonLink href="/dashboard" variant="secondary" size="lg" icon={<LayoutDashboard aria-hidden />}>
          Go to Dashboard
        </ButtonLink>
      </div>
    </main>
  );
}
