// Shared Design Tokens for HackerMate Marketing & Showcase Pages
// Restrained developer aesthetic (Linear / Vercel / Supabase standard)

export const LANDING_TOKENS = {
  // Accent & Action
  accent: {
    primary: "#B4F461",          // Lime accent for primary CTAs only
    primaryBg: "bg-[#B4F461]",
    primaryHover: "hover:bg-[#a3e64f]",
    dot: "bg-[#B4F461]",         // Exactly 1 live status dot indicator on the page
  },

  // Typography
  text: {
    primary: "text-zinc-100",    // Headings & high-contrast titles
    secondary: "text-zinc-400",  // Body copy & descriptions
    muted: "text-zinc-500",      // Captions, subtitles, secondary metadata
    onAccent: "text-zinc-950 font-bold", // Dark high-contrast text on lime buttons
    eyebrow: "text-[11px] font-mono font-medium tracking-widest text-zinc-400 uppercase",
  },

  // Surfaces & Containers
  surface: {
    bg: "bg-[#09090b]",
    card: "bg-zinc-900/30 border border-zinc-800/80 rounded-2xl",
    cardHover: "hover:border-zinc-700/80 transition-colors",
    chrome: "bg-zinc-950 border border-zinc-800/80 rounded-2xl shadow-xl overflow-hidden",
    tag: "bg-zinc-900 text-zinc-300 border border-zinc-800/80 rounded-md text-[10px] font-mono px-2 py-0.5",
    subtleCard: "bg-zinc-950/60 border border-zinc-800/80 rounded-xl",
  },

  // Interactive Controls & Buttons
  button: {
    primary: "inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 font-bold text-sm transition-all cursor-pointer shadow-lg shadow-[#B4F461]/10",
    secondary: "inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-white font-medium text-sm transition-colors cursor-pointer",
  },

  // Motion Discipline (Explicitly restrained, no scroll-trigger lag)
  motion: {
    transition: "transition-all duration-200 ease-out",
  },
} as const;
