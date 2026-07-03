"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Tab = "suggestion" | "bug";
type Status = "idle" | "submitting" | "success" | "error";

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("suggestion");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function close() {
    setOpen(false);
    // reset after animation
    setTimeout(() => {
      setMessage("");
      setStatus("idle");
      setErrorMessage("");
      setTab("suggestion");
    }, 300);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus("submitting");
    setErrorMessage("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErrorMessage("Please sign in before sending feedback.");
      setStatus("error");
      return;
    }

    const { error } = await supabase.rpc("submit_feedback", {
      p_type: tab,
      p_message: message.trim(),
    });

    if (error) {
      console.error("Feedback submission failed:", error);
      setErrorMessage(
        error.message.includes("submit_feedback")
          ? "Feedback storage is not configured yet. Apply the latest Supabase migration."
          : error.message
      );
      setStatus("error");
    } else {
      setStatus("success");
      setMessage("");
    }
  }

  return (
    <>
      {/* ── Floating Trigger Button ── */}
      <button
        onClick={() => setOpen(true)}
        title="Send feedback"
        className="
          fixed bottom-6 right-6 z-50
          flex items-center gap-2
          bg-violet-600 hover:bg-violet-700
          text-white text-xs font-semibold
          pl-3.5 pr-4 py-2.5 rounded-full
          shadow-lg shadow-violet-900/30
          transition-all duration-200 hover:scale-105 active:scale-95
          border border-violet-500/40
        "
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
        Feedback
      </button>

      {/* ── Backdrop ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6 p-0"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          {/* ── Modal Panel ── */}
          <div className="
            w-full sm:max-w-md bg-[var(--surface-1)] border border-[var(--card-border)]
            rounded-t-2xl sm:rounded-2xl shadow-2xl
            animate-fade-in-up overflow-hidden
          ">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--card-border)]">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">Share feedback</h2>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Help us make HackerMate better</p>
              </div>
              <button
                onClick={close}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5">

              {/* Tab Switcher */}
              <div className="flex gap-1.5 p-1 bg-[var(--surface-2)] rounded-lg mb-4">
                {(["suggestion", "bug"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`
                      flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-all
                      ${tab === t
                        ? "bg-[var(--surface-1)] text-[var(--text-primary)] shadow-sm border border-[var(--card-border)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                      }
                    `}
                  >
                    {t === "suggestion" ? (
                      <>
                        <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                        </svg>
                        Suggestion
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44.125 2.104.52 4.136 1.153 6.06M12 12.75a2.25 2.25 0 002.248-2.354M12 12.75a2.25 2.25 0 01-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 00-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.734 3.734 0 01.4-2.253M12 8.25a2.25 2.25 0 00-2.248 2.146M12 8.25a2.25 2.25 0 012.248 2.146M8.683 5a6.032 6.032 0 01-1.155-1.002c.07-.63.27-1.222.574-1.747m.581 2.749A3.75 3.75 0 0115.318 5m0 0c.427-.283.815-.62 1.155-.999a4.471 4.471 0 00-.575-1.752M4.921 6a24.048 24.048 0 00-.392 3.314c1.668.546 3.416.914 5.223 1.082M19.08 6c.205 1.08.337 2.187.392 3.314a23.882 23.882 0 01-5.223 1.082" />
                        </svg>
                        Report Bug
                      </>
                    )}
                  </button>
                ))}
              </div>

              {/* Context hint */}
              <p className="text-[11px] text-[var(--text-muted)] mb-3 leading-relaxed">
                {tab === "suggestion"
                  ? "Got an idea to improve HackerMate? We'd love to hear it — share as much detail as you like."
                  : "Found something broken? Describe what happened and we'll get it fixed ASAP."}
              </p>

              {/* Success state */}
              {status === "success" ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">Thanks for your feedback!</p>
                  <p className="text-xs text-[var(--text-muted)]">We&apos;ll review it and get back to you soon.</p>
                  <button
                    onClick={close}
                    className="mt-5 text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      tab === "suggestion"
                        ? "e.g. It would be great if I could filter hackathons by prize pool..."
                        : "e.g. When I click 'Connect', the page shows a blank error screen..."
                    }
                    rows={5}
                    required
                    className="
                      input w-full resize-none text-xs leading-relaxed
                      placeholder:text-[var(--text-muted)]
                    "
                  />

                  {status === "error" && (
                    <p className="text-xs text-rose-400 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      {errorMessage || "Something went wrong. Please try again."}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <p className="text-[10px] text-[var(--text-muted)]">
                      Your email will be shared so we can follow up.
                    </p>
                    <button
                      type="submit"
                      disabled={status === "submitting" || !message.trim()}
                      className="
                        shrink-0 flex items-center gap-2 bg-violet-600 hover:bg-violet-700
                        disabled:opacity-50 disabled:cursor-not-allowed
                        text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors
                      "
                    >
                      {status === "submitting" ? (
                        <>
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Sending...
                        </>
                      ) : (
                        <>
                          Send
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
