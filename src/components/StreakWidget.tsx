"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function StreakWidget({ initialStreak = 0, initialLongest = 0 }: { initialStreak?: number; initialLongest?: number }) {
  const [streak, setStreak] = useState<number>(initialStreak);
  const [longest, setLongest] = useState<number>(initialLongest);
  const [historyDates, setHistoryDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadStreakInfo() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("current_streak, longest_streak, last_active_date")
        .eq("id", session.user.id)
        .maybeSingle();

      const todayStr = new Date().toISOString().split("T")[0];

      if (profile) {
        const val = profile.current_streak || (profile.last_active_date === todayStr ? 1 : 0);
        setStreak(val);
        setLongest(profile.longest_streak || val);
      }

      // Fetch last 7 days checkin history
      const now = new Date();
      const past7 = new Date();
      past7.setDate(now.getDate() - 7);
      const past7Str = past7.toISOString().split("T")[0];

      const { data: history } = await supabase
        .from("builder_streak_history")
        .select("visit_date")
        .eq("user_id", session.user.id)
        .gte("visit_date", past7Str);

      if (history) {
        const datesSet = new Set(history.map((h) => h.visit_date));
        setHistoryDates(datesSet);
        if (datesSet.has(todayStr) && streak === 0) {
          setStreak((prev) => Math.max(prev, 1));
        }
      }
    }

    loadStreakInfo();

    const handleStreakEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ current_streak: number; longest_streak: number }>;
      if (customEvent.detail) {
        setStreak(customEvent.detail.current_streak || 1);
        setLongest(customEvent.detail.longest_streak || 1);
        const todayStr = new Date().toISOString().split("T")[0];
        setHistoryDates((prev) => new Set([...prev, todayStr]));
      }
    };

    window.addEventListener("streak-updated", handleStreakEvent);
    return () => window.removeEventListener("streak-updated", handleStreakEvent);
  }, [streak]);

  // Generate 7-day rolling days (past 6 days + today)
  const todayStr = new Date().toISOString().split("T")[0];
  const daysList = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split("T")[0];
    const dayLetter = d.toLocaleDateString("en-US", { weekday: "narrow" });
    const isToday = i === 6;
    const isChecked = historyDates.has(dateStr) || (isToday && (streak > 0 || historyDates.has(todayStr)));
    return { dateStr, dayLetter, isToday, isChecked };
  });

  const effectiveStreak = streak > 0 ? streak : (historyDates.has(todayStr) ? 1 : 0);

  return (
    <div className="card card-static p-4 bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-transparent border border-amber-500/20 dark:border-amber-500/30 rounded-2xl relative overflow-hidden shadow-sm mb-6">
      {/* Subtle flame glow in top right */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
        {/* Left: Flame & Counter */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-2xl shadow-md shadow-orange-500/20 shrink-0">
            🔥
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
                {effectiveStreak} Day Streak
              </h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {effectiveStreak > 0
                ? `Logged in today! Return tomorrow to reach ${effectiveStreak + 1} days.`
                : "Open HackerMate daily to build your builder streak."}
            </p>
          </div>
        </div>

        {/* Right: 7-Day Rolling Visual Dots */}
        <div className="flex items-center gap-2 self-start sm:self-auto bg-white/60 dark:bg-zinc-900/60 p-2 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 backdrop-blur-xs">
          {daysList.map((day, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-mono text-zinc-400 dark:text-zinc-500 font-semibold uppercase">
                {day.dayLetter}
              </span>
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs transition-all ${
                  day.isChecked
                    ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white font-bold shadow-xs shadow-orange-500/20 scale-100"
                    : "bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-300 dark:text-zinc-600"
                }`}
                title={day.isChecked ? `${day.dateStr}: Active` : `${day.dateStr}: Inactive`}
              >
                {day.isChecked ? "✓" : "•"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
