"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type StreakResult = {
  success: boolean;
  streak_updated?: boolean;
  current_streak?: number;
  longest_streak?: number;
  is_new_record?: boolean;
};

export default function DailyStreakTracker() {
  const [celebration, setCelebration] = useState<{
    current_streak: number;
    is_new_record: boolean;
  } | null>(null);

  useEffect(() => {
    let hasTriggered = false;

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
          // Notify any listening components on the page (Navbar, Dashboard, Profile)
          window.dispatchEvent(
            new CustomEvent("streak-updated", {
              detail: {
                current_streak: res.current_streak || 1,
                longest_streak: res.longest_streak || 1,
              },
            })
          );

          if (res.streak_updated && (res.current_streak || 0) > 0) {
            setCelebration({
              current_streak: res.current_streak!,
              is_new_record: !!res.is_new_record,
            });

            setTimeout(() => {
              setCelebration(null);
            }, 6000);
          }
        }
      } catch (err) {
        console.error("Streak tracking error:", err);
      }
    }

    checkStreak();
  }, []);

  if (!celebration) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-fade-in max-w-sm">
      <div className="p-4 rounded-2xl bg-zinc-900/95 border border-amber-500/40 text-white shadow-2xl backdrop-blur-md flex items-start gap-3.5 relative overflow-hidden">
        {/* Glowing flame backdrop */}
        <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />

        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-xl shadow-md shrink-0 animate-bounce">
          🔥
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
              {celebration.is_new_record ? "🏆 All-Time Record!" : "Streak Active"}
            </span>
          </div>
          <h4 className="text-sm font-bold text-white leading-tight mb-1">
            {celebration.current_streak} Day Streak!
          </h4>
          <p className="text-xs text-zinc-300 leading-relaxed">
            First visit today recorded. Keep coming back tomorrow to maintain your flame!
          </p>
        </div>

        <button
          onClick={() => setCelebration(null)}
          className="text-zinc-400 hover:text-white text-xs p-1 cursor-pointer shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
