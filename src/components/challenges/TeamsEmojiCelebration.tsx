"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle2, Plus, X } from "lucide-react";
import { Tape } from "@/components/system";
import { cn } from "@/lib/utils";

interface FloatingEmoji {
  id: number;
  emoji: string;
  left: number; // percentage from left
  size: number; // font size in px
  duration: number; // seconds
  delay: number; // seconds
  rotation: number; // deg
  drift: number; // px horizontal drift
}

export const CELEBRATION_THEMES: Record<string, { name: string; emoji: string; icon: string }> = {
  default: { name: "🎉 Party Popper", emoji: "🎉", icon: "🎉" },
  party: { name: "🎉 Party Popper", emoji: "🎉", icon: "🎉" },
  rocket: { name: "🚀 Speed Rocket", emoji: "🚀", icon: "🚀" },
  trophy: { name: "🏆 Gold Trophy", emoji: "🏆", icon: "🏆" },
  ai: { name: "🤖 AI Bot", emoji: "🤖", icon: "🤖" },
  fire: { name: "🔥 Pure Fire", emoji: "🔥", icon: "🔥" },
  hundred: { name: "💯 100 Score", emoji: "💯", icon: "💯" },
  applause: { name: "👏 Applause", emoji: "👏", icon: "👏" },
  heart: { name: "❤️ Heart", emoji: "❤️", icon: "❤️" },
};

// No star / sparkle emojis (workspace rule). Star-struck face removed.
const EXTENDED_EMOJIS = [
  "👏", "🚀", "🏆", "💯", "🔥", "❤️", "🎉", "🥳", "🙌", "💡",
  "🧠", "💎", "⚡", "🎯", "👑", "🥇", "🤖", "💻", "🦄", "🎊",
  "🛠️", "🌈", "🍕", "☕", "🦾", "👾", "🎖️", "🤝"
];

const DEFAULT_QUICK_REACTIONS = [
  { emoji: "👏", label: "Applause" },
  { emoji: "🚀", label: "Rocket" },
  { emoji: "🏆", label: "Trophy" },
  { emoji: "💯", label: "100" },
  { emoji: "🔥", label: "Fire" },
  { emoji: "❤️", label: "Heart" },
];

export function TeamsEmojiCelebration({
  active = false,
  theme = "default",
  customEmojis,
  message = "Your deck has been scored.",
  onComplete,
}: {
  active: boolean;
  theme?: string;
  customEmojis?: string[];
  message?: string;
  onComplete?: () => void;
}) {
  const [particles, setParticles] = useState<FloatingEmoji[]>([]);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }

    const themeObj = CELEBRATION_THEMES[theme] || CELEBRATION_THEMES.default;
    // Ensure all particles use the single selected emoji type
    const singleEmoji = customEmojis?.[0] || themeObj?.emoji || (theme && theme.length <= 4 ? theme : "🎉");

    // Generate 26 floating particle emojis - all using the exact same chosen single emoji
    const newParticles: FloatingEmoji[] = Array.from({ length: 26 }, (_, i) => ({
      id: Date.now() + i,
      emoji: singleEmoji,
      left: 10 + Math.random() * 80, // spread between 10% and 90%
      size: 26 + Math.floor(Math.random() * 28), // 26px - 54px
      duration: 1.8 + Math.random() * 1.4, // 1.8s - 3.2s
      delay: Math.random() * 0.4,
      rotation: (Math.random() - 0.5) * 60,
      drift: (Math.random() - 0.5) * 120,
    }));

    setParticles(newParticles);

    const timer = setTimeout(() => {
      onComplete?.();
    }, 2200);

    return () => clearTimeout(timer);
  }, [active, theme, customEmojis, onComplete]);

  if (!active && particles.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-4">
      {/* Scrim */}
      <div className="pointer-events-auto absolute inset-0 bg-[var(--hm-scrim)] animate-fade-in" />

      {/* Toast */}
      <div
        role="status"
        className="pointer-events-auto relative z-10 flex w-full max-w-sm items-center gap-3 rounded-lg border border-line bg-overlay px-4 py-3.5 shadow-pop animate-teams-pop"
      >
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xl" aria-hidden>
          {CELEBRATION_THEMES[theme]?.icon || "🎉"}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-ink">Deck submitted</span>
            <Tape tone="ok" icon={<CheckCircle2 />}>Scored</Tape>
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-2">{message}</p>
        </div>
      </div>

      {/* Floating emojis */}
      {particles.map((p) => (
        <div
          key={p.id}
          aria-hidden
          className="absolute bottom-0 select-none text-center"
          style={{
            left: `${p.left}%`,
            fontSize: `${p.size}px`,
            animation: `teamsFloatUp ${p.duration}s cubic-bezier(0.2, 0.8, 0.2, 1) ${p.delay}s forwards`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        >
          {p.emoji}
        </div>
      ))}
    </div>
  );
}

/**
 * Floating reaction toolbar with an emoji picker.
 */
export function TeamsLiveReactionBar() {
  const [floatingList, setFloatingList] = useState<FloatingEmoji[]>([]);
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const spawnEmoji = useCallback((emoji: string) => {
    setLastClicked(emoji);
    setTimeout(() => setLastClicked(null), 300);

    const count = 3 + Math.floor(Math.random() * 3); // 3 to 5 emojis per click
    const newItems: FloatingEmoji[] = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + Math.random() + i,
      emoji,
      left: 75 + (Math.random() - 0.5) * 25, // around the bottom-right corner
      size: 26 + Math.floor(Math.random() * 22),
      duration: 1.6 + Math.random() * 1.0,
      delay: i * 0.08,
      rotation: (Math.random() - 0.5) * 45,
      drift: (Math.random() - 0.5) * 80,
    }));

    setFloatingList((prev) => [...prev, ...newItems]);

    // Clean up old emojis
    setTimeout(() => {
      setFloatingList((prev) => prev.filter((item) => !newItems.some((n) => n.id === item.id)));
    }, 2800);
  }, []);

  // Close picker on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    if (showPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPicker]);

  return (
    <>
      <div className="fixed bottom-[calc(var(--hm-tabbar-h)+env(safe-area-inset-bottom)+12px)] right-4 z-40 flex items-center gap-0.5 rounded-lg border border-line bg-overlay p-1 shadow-pop md:bottom-6 md:right-6">
        <span className="hidden px-2 caps-label text-ink-3 sm:inline-block">React</span>
        {DEFAULT_QUICK_REACTIONS.map((r) => (
          <button
            key={r.emoji}
            type="button"
            title={r.label}
            aria-label={r.label}
            onClick={() => spawnEmoji(r.emoji)}
            className={cn(
              "flex size-9 items-center justify-center rounded-md text-lg transition-transform hover:bg-hover active:scale-110",
              lastClicked === r.emoji && "scale-110 bg-selected",
            )}
          >
            <span className="select-none">{r.emoji}</span>
          </button>
        ))}

        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            title="More reactions"
            aria-label="More reactions"
            aria-expanded={showPicker}
            onClick={() => setShowPicker(!showPicker)}
            className="flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
          >
            <Plus className="size-4" />
          </button>

          {showPicker && (
            <div className="absolute bottom-11 right-0 w-64 rounded-lg border border-line bg-overlay p-2.5 shadow-pop animate-teams-pop">
              <div className="mb-2 flex items-center justify-between border-b border-line pb-2">
                <span className="caps-label text-ink-3">Choose reaction</span>
                <button
                  type="button"
                  onClick={() => setShowPicker(false)}
                  aria-label="Close reactions"
                  className="inline-flex size-7 items-center justify-center rounded-[5px] text-ink-3 hover:bg-hover hover:text-ink"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {EXTENDED_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      spawnEmoji(em);
                      setShowPicker(false);
                    }}
                    className="flex size-9 items-center justify-center rounded-md text-base hover:bg-hover"
                  >
                    <span className="select-none">{em}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
        {floatingList.map((p) => (
          <div
            key={p.id}
            className="absolute bottom-16 select-none"
            style={{
              left: `${p.left}%`,
              fontSize: `${p.size}px`,
              animation: `teamsFloatUp ${p.duration}s cubic-bezier(0.25, 1, 0.5, 1) ${p.delay}s forwards`,
              transform: `rotate(${p.rotation}deg)`,
            }}
          >
            {p.emoji}
          </div>
        ))}
      </div>
    </>
  );
}
