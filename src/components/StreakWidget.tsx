"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * Visit streak with a rolling 7-day strip. Same reads as V1
 * (profiles streak columns + builder_streak_history); V2 presentation.
 */
export default function StreakWidget({ initialStreak = 0, initialLongest = 0 }: { initialStreak?: number; initialLongest?: number }) {
  const [streak, setStreak] = useState<number>(initialStreak);
  const [longest, setLongest] = useState<number>(initialLongest);
  const [historyDates, setHistoryDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    async function loadStreakInfo() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || !active) return;

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("current_streak, longest_streak, last_active_date")
        .eq("id", session.user.id)
        .maybeSingle();
      if (pErr) console.error("[streak] profile streak read failed:", pErr);

      const todayStr = new Date().toISOString().split("T")[0];
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yesterdayStr = y.toISOString().split("T")[0];

      if (profile && active) {
        const isActive = profile.last_active_date === todayStr || profile.last_active_date === yesterdayStr;
        const val = isActive ? profile.current_streak || 0 : profile.last_active_date === todayStr ? 1 : 0;
        setStreak(val);
        setLongest(profile.longest_streak || val);
      }

      const past7 = new Date();
      past7.setDate(past7.getDate() - 7);
      const { data: history, error: hErr } = await supabase
        .from("builder_streak_history")
        .select("visit_date")
        .eq("user_id", session.user.id)
        .gte("visit_date", past7.toISOString().split("T")[0]);
      if (hErr) console.error("[streak] history read failed:", hErr);
      if (history && active) {
        const dates = new Set(history.map((h) => h.visit_date as string));
        setHistoryDates(dates);
        if (dates.has(todayStr)) setStreak((prev) => Math.max(prev, 1));
      }
    }

    loadStreakInfo();

    const onStreak = (e: Event) => {
      const detail = (e as CustomEvent<{ current_streak: number; longest_streak: number }>).detail;
      if (detail) {
        setStreak(detail.current_streak || 1);
        setLongest(detail.longest_streak || 1);
        const todayStr = new Date().toISOString().split("T")[0];
        setHistoryDates((prev) => new Set([...prev, todayStr]));
      }
    };
    window.addEventListener("streak-updated", onStreak);
    return () => {
      active = false;
      window.removeEventListener("streak-updated", onStreak);
    };
  }, []);

  const todayStr = new Date().toISOString().split("T")[0];
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split("T")[0];
    const isToday = i === 6;
    return {
      dateStr,
      letter: d.toLocaleDateString("en-US", { weekday: "narrow" }),
      isToday,
      checked: historyDates.has(dateStr) || (isToday && (streak > 0 || historyDates.has(todayStr))),
    };
  });
  const effective = streak > 0 ? streak : historyDates.has(todayStr) ? 1 : 0;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <Flame className={cn("size-4 self-center", effective > 0 ? "text-warn" : "text-ink-4")} aria-hidden />
          <span className="font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink tabular">{effective}</span>
          <span className="text-[12.5px] text-ink-3">day streak</span>
        </div>
        <p className="mt-1 text-[12px] text-ink-3">
          {effective > 0 ? `Best: ${Math.max(longest, effective)} days` : "Open HackerMate daily to start one."}
        </p>
      </div>
      <ol className="flex items-end gap-1" aria-label="Last 7 days">
        {days.map((d) => (
          <li key={d.dateStr} className="flex flex-col items-center gap-1" title={`${d.dateStr}${d.checked ? " · visited" : ""}`}>
            <span
              className={cn(
                "block h-5 w-3 rounded-[2px]",
                d.checked ? "bg-warn" : "bg-selected ring-1 ring-inset ring-line-strong",
                d.isToday && "outline outline-1 outline-offset-2 outline-ink-4",
              )}
            />
            <span className="font-mono text-[9.5px] text-ink-4">{d.letter}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
