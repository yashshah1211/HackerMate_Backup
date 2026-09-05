"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, Smile, Zap } from "lucide-react";

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

const EXTENDED_EMOJIS = [
  "👏", "🚀", "🏆", "💯", "🔥", "❤️", "🎉", "🥳", "🤩", "🙌",
  "💡", "🧠", "💎", "⚡", "🎯", "👑", "🥇", "🤖", "💻", "🦄",
  "🎊", "🛠️", "🌈", "🍕", "☕", "🦾", "👾", "🎖️"
];

const DEFAULT_QUICK_REACTIONS = [
  { emoji: "👏", label: "Applause", color: "hover:bg-amber-500/20" },
  { emoji: "🚀", label: "Rocket", color: "hover:bg-lime-500/20" },
  { emoji: "🏆", label: "Trophy", color: "hover:bg-yellow-500/20" },
  { emoji: "💯", label: "100", color: "hover:bg-rose-500/20" },
  { emoji: "🔥", label: "Fire", color: "hover:bg-orange-500/20" },
  { emoji: "❤️", label: "Heart", color: "hover:bg-pink-500/20" },
];

export function TeamsEmojiCelebration({
  active = false,
  theme = "default",
  customEmojis,
  message = "🎉 Solution Received! Pitch Evaluated by AI Jury 🚀",
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
    <div className="fixed inset-0 z-50 pointer-events-none flex flex-col items-center justify-center overflow-hidden">
      {/* Dim overlay with soft glow */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs animate-fade-in pointer-events-auto" />

      {/* Microsoft Teams Style Pop Pill Toast */}
      <div className="relative z-10 px-6 py-4 rounded-2xl bg-zinc-900/95 border border-lime-500/60 shadow-2xl shadow-lime-500/30 text-white flex items-center gap-3 animate-teams-pop pointer-events-auto">
        <div className="w-10 h-10 rounded-full bg-lime-500/20 border border-lime-500 flex items-center justify-center text-xl animate-bounce">
          {CELEBRATION_THEMES[theme]?.icon || "🎉"}
        </div>
        <div>
          <div className="font-extrabold text-sm sm:text-base text-zinc-100 flex items-center gap-1.5">
            <span>Solution Submitted!</span>
            <span className="px-2 py-0.5 rounded-full bg-lime-500/20 text-lime-400 font-mono text-[10px]">100% Evaluated</span>
          </div>
          <p className="text-xs text-zinc-300 font-medium mt-0.5">{message}</p>
        </div>
      </div>

      {/* Floating Animated Emojis */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute bottom-0 text-center select-none"
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
 * Microsoft Teams Style Floating Reaction Toolbar with Emoji Picker
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
      {/* Teams Floating Reaction Bar */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-1 p-1.5 rounded-2xl bg-zinc-900/90 dark:bg-zinc-950/90 border border-zinc-700/80 dark:border-zinc-800 shadow-2xl backdrop-blur-md transition-all hover:scale-[1.02]">
        <span className="text-[10px] font-mono text-zinc-400 uppercase px-2 font-semibold hidden sm:inline-block">
          React:
        </span>
        {DEFAULT_QUICK_REACTIONS.map((r) => (
          <button
            key={r.emoji}
            type="button"
            title={r.label}
            onClick={() => spawnEmoji(r.emoji)}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-lg sm:text-xl transition-all active:scale-125 cursor-pointer hover:bg-zinc-800/80 ${
              r.color
            } ${lastClicked === r.emoji ? "scale-125 bg-lime-500/20" : ""}`}
          >
            <span className="transition-transform hover:scale-125 select-none">{r.emoji}</span>
          </button>
        ))}

        {/* Custom / More Reactions Picker Trigger */}
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            title="More Reactions"
            onClick={() => setShowPicker(!showPicker)}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Emoji Palette Popover */}
          {showPicker && (
            <div className="absolute bottom-12 right-0 p-3 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl backdrop-blur-md w-64 animate-teams-pop">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800 text-xs font-semibold text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-lime-400" />
                  <span>Choose Reaction</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowPicker(false)}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {EXTENDED_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      spawnEmoji(em);
                      setShowPicker(false);
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-base hover:bg-zinc-800 transition hover:scale-125 cursor-pointer"
                  >
                    <span className="select-none">{em}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Render Floating Reaction Emojis Across Screen */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
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
