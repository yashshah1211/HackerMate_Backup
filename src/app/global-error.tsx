"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

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
    <html>
      <body className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100 font-sans p-6">
        <div className="max-w-md text-center">
          <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
          <p className="text-zinc-400 text-sm mb-6">
            An unexpected error occurred. Our team has been notified.
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-lime-400 text-zinc-950 font-medium rounded-lg hover:bg-lime-300 transition-colors text-sm"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
