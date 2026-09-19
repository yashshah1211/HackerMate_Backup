"use client";

import * as Sentry from "@sentry/nextjs";
import { useState } from "react";

export default function SentryTestPage() {
  const [sent, setSent] = useState(false);

  const triggerClientError = () => {
    try {
      throw new Error("HackerMate Client Verification Error");
    } catch (err) {
      Sentry.captureException(err);
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-white p-6">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center shadow-xl">
        <h1 className="text-xl font-bold mb-2">Sentry Verification Test</h1>
        <p className="text-sm text-zinc-400 mb-6">
          Click the button below to trigger a client-side test error to complete your Sentry onboarding.
        </p>
        <button
          onClick={triggerClientError}
          className="w-full py-3 bg-red-600 hover:bg-red-500 font-semibold rounded-lg transition-colors cursor-pointer"
        >
          Trigger Client Test Error
        </button>
        {sent && (
          <p className="mt-4 text-xs text-lime-400 font-mono">
            Test error sent to Sentry! Switch back to your Sentry tab now.
          </p>
        )}
      </div>
    </div>
  );
}
