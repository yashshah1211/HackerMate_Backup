"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Flame, Trophy, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type StreakResult = {
  success: boolean;
  streak_updated?: boolean;
  current_streak?: number;
  longest_streak?: number;
  is_new_record?: boolean;
};

/**
 * Records the daily visit (record_daily_visit RPC) once per shell mount,
 * broadcasts `streak-updated`, and shows a short confirmation when the
 * streak advances. Behaviour unchanged from V1; UI moved to V2 tokens.
 */
export default function DailyStreakTracker() {
  const [celebration, setCelebration] = useState<{ current_streak: number; is_new_record: boolean } | null>(null);

  useEffect(() => {
    let hasTriggered = false;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    async function checkStreak() {
      if (hasTriggered) return;
      hasTriggered = true;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      try {
        const { data, error } = await supabase.rpc("record_daily_visit");
        if (error) {
          console.warn("Streak check non-fatal error:", error);
          return;
        }
        const res = data as StreakResult;
        if (res?.success) {
          window.dispatchEvent(
            new CustomEvent("streak-updated", {
              detail: { current_streak: res.current_streak || 1, longest_streak: res.longest_streak || 1 },
            }),
          );
          if (res.streak_updated && (res.current_streak || 0) > 0) {
            setCelebration({ current_streak: res.current_streak!, is_new_record: !!res.is_new_record });
            hideTimer = setTimeout(() => setCelebration(null), 6000);
          }
        }
      } catch (err) {
        console.error("Streak tracking error:", err);
      }
    }

    checkStreak();
    return () => {
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  return (
    <AnimatePresence>
      {celebration && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ type: "spring", stiffness: 480, damping: 38 }}
          className="fixed bottom-[calc(var(--hm-tabbar-h)+16px)] left-3 right-3 z-50 flex items-start gap-3 rounded-lg border border-line bg-overlay p-3.5 shadow-pop md:bottom-6 md:left-auto md:right-6 md:w-[340px]"
        >
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-warn-soft text-warn">
            {celebration.is_new_record ? <Trophy className="size-4" /> : <Flame className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="caps-label text-warn">{celebration.is_new_record ? "New record" : "Streak"}</p>
            <p className="mt-0.5 text-[14px] font-semibold text-ink">
              {celebration.current_streak}-day streak
            </p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">Today&apos;s visit is logged. Come back tomorrow to keep it going.</p>
          </div>
          <button
            type="button"
            onClick={() => setCelebration(null)}
            aria-label="Dismiss"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
