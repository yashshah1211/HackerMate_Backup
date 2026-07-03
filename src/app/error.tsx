"use client";

import { useEffect } from "react";
import Link from "next/link";

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
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 py-12 bg-[var(--background)] transition-colors duration-300">
      <div className="w-full max-w-md p-8 rounded-2xl bg-[var(--surface-1)] border border-[var(--card-border)] shadow-2xl text-center space-y-6">
        
        {/* Error icon with rose aura */}
        <div className="mx-auto w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
            Application Error
          </h2>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            An unexpected error occurred in your workspace. We have logged the details and are looking into it.
          </p>
        </div>

        {/* Technical details accordion (collapsible to keep UI clean) */}
        {error.message && (
          <div className="p-3 bg-[var(--surface-2)] border border-[var(--card-border)] rounded-lg text-left text-xs font-mono text-[var(--text-secondary)] overflow-x-auto max-h-32">
            <span className="text-[var(--text-muted)] font-semibold select-none">Error: </span>
            {error.message}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 active:scale-98 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-lg shadow-violet-900/10 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4 animate-spin-hover" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Try Again
          </button>
          
          <Link
            href="/dashboard"
            className="flex-1 flex items-center justify-center border border-[var(--card-border)] hover:bg-[var(--surface-2)] active:scale-98 text-[var(--text-primary)] text-xs font-semibold px-4 py-2.5 rounded-lg transition-all"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
