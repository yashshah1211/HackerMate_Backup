"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, MessageSquare, Send, TriangleAlert } from "lucide-react";
import { Button, Dialog, Segmented, Textarea } from "@/components/system";

type Tab = "suggestion" | "bug";
type Status = "idle" | "submitting" | "success" | "error";

export default function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("suggestion");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  if (pathname?.startsWith("/admin")) return null;

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
          fixed bottom-5 right-5 z-40
          hidden lg:flex items-center gap-1.5
          h-8 px-3 rounded-md
          bg-raised border border-line-strong shadow-pop
          text-ink-3 hover:text-ink hover:border-ink-4 text-[12.5px] font-medium
          transition-colors active:scale-[0.98]
        "
      >
        <MessageSquare className="size-3.5" aria-hidden />
        Feedback
      </button>

      <Dialog open={open} onClose={close} title="Share feedback" description="Help us make HackerMate better.">
        {status === "success" ? (
          <div className="flex flex-col items-center py-6 text-center">
            <span className="mb-4 inline-flex size-11 items-center justify-center rounded-md bg-ok-soft text-ok">
              <CheckCircle2 className="size-5" aria-hidden />
            </span>
            <p className="text-[14px] font-semibold text-ink">Thanks for your feedback</p>
            <p className="mt-1 text-[13px] text-ink-3">We&apos;ll review it and follow up if we need more detail.</p>
            <Button variant="secondary" className="mt-5" onClick={close}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Segmented<Tab>
              label="Feedback type"
              value={tab}
              onChange={setTab}
              className="w-full [&>button]:flex-1"
              options={[
                { value: "suggestion", label: "Suggestion" },
                { value: "bug", label: "Report bug" },
              ]}
            />

            <p className="text-[12.5px] leading-relaxed text-ink-3">
              {tab === "suggestion"
                ? "Got an idea to improve HackerMate? Share as much detail as you like."
                : "Found something broken? Describe what happened and we'll get it fixed."}
            </p>

            <Textarea
              aria-label={tab === "suggestion" ? "Your suggestion" : "Bug description"}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                tab === "suggestion"
                  ? "e.g. It would be great if I could filter hackathons by prize pool..."
                  : "e.g. When I click 'Connect', the page shows a blank error screen..."
              }
              rows={5}
              required
              className="resize-none"
            />

            {status === "error" && (
              <p role="alert" className="flex items-start gap-1.5 text-[12.5px] text-bad">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {errorMessage || "Something went wrong. Please try again."}
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] text-ink-3">Your email will be shared so we can follow up.</p>
              <Button
                type="submit"
                variant="primary"
                loading={status === "submitting"}
                disabled={!message.trim()}
                iconRight={status === "submitting" ? undefined : <Send aria-hidden />}
              >
                {status === "submitting" ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
