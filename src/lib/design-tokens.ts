// Shared Design Tokens for HackerMate Marketing & Showcase Pages
// Restrained developer aesthetic (Linear / Vercel / Supabase standard)

export const LANDING_TOKENS = {
  // Spacing Rhythm (Strict Direction 1: Linear Dark Studio)
  spacing: {
    section: "py-10 lg:py-14",       // 40px mobile / 56px desktop (combined 112px desktop / 80px mobile)
    sectionTight: "py-8 lg:py-10",
    gap: "gap-8 lg:gap-12",
  },

  // Accent & Action
  accent: {
    primary: "#B4F461",          // Lime accent for primary CTAs only
    primaryBg: "bg-[#B4F461]",
    primaryHover: "hover:bg-[#a8eb52]",
    dot: "bg-[#B4F461]",         // Exactly 1 live status dot indicator on the page
  },

  // Typography
  text: {
    hero: "text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-[-0.035em] text-white leading-[1.08]",
    sectionH2: "text-2xl sm:text-4xl lg:text-5xl font-semibold tracking-[-0.03em] text-white leading-[1.15]",
    primary: "text-zinc-100",    // Headings & high-contrast titles
    secondary: "text-zinc-300",  // Body copy & descriptions (crisp contrast)
    muted: "text-zinc-400",      // Captions, subtitles, secondary metadata
    onAccent: "text-zinc-950 font-semibold", // Dark high-contrast text on lime buttons
    eyebrow: "text-[11px] font-mono font-medium tracking-[0.2em] text-zinc-400 uppercase",
  },

  // Surfaces & Containers
  surface: {
    bg: "bg-[#080808]",
    card: "bg-zinc-950/60 border border-white/[0.08] rounded-2xl backdrop-blur-md transition-all duration-300 hover:border-white/[0.2] hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(0,0,0,0.5)]",
    cardHover: "hover:border-white/[0.2] hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(0,0,0,0.5)] transition-all duration-300 ease-out",
    flagship: "bg-gradient-to-br from-white/[0.045] via-zinc-950/85 to-[#080808]/95 border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_16px_40px_-8px_rgba(0,0,0,0.6)] backdrop-blur-md rounded-2xl",
    flagshipHover: "hover:border-white/[0.2] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_20px_48px_-8px_rgba(0,0,0,0.7)] hover:-translate-y-0.5 transition-all duration-300 ease-out",
    chrome: "bg-gradient-to-br from-white/[0.04] via-zinc-950/90 to-[#080808]/95 border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_20px_50px_-10px_rgba(0,0,0,0.7)] rounded-2xl overflow-hidden transition-all duration-300 hover:border-white/[0.2] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_24px_60px_-10px_rgba(0,0,0,0.8)] hover:-translate-y-0.5",
    tag: "bg-zinc-900 text-zinc-300 border border-zinc-800 rounded-md text-[10px] font-mono px-2 py-0.5",
    subtleCard: "bg-zinc-950/60 border border-white/[0.08] rounded-xl transition-all duration-300 hover:border-white/[0.2] hover:-translate-y-0.5",
  },

  // Interactive Controls & Buttons
  button: {
    primary: "inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#B4F461] hover:bg-[#a8eb52] text-zinc-950 font-semibold text-sm transition-all duration-200 cursor-pointer shadow-[0_0_20px_rgba(180,244,97,0.22)] hover:shadow-[0_0_32px_rgba(180,244,97,0.5)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]",
    secondaryLink: "inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer group",
    secondary: "inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer group",
  },

  // Motion Discipline (Explicitly restrained, no scroll-trigger lag)
  motion: {
    transition: "transition-all duration-200 ease-out",
  },

  // Category Monogram & Tag Themes (Dashboard Teams & Projects)
  categories: {
    sih: {
      color: "#7DD3FC",
      text: "text-sky-700 dark:text-[#7DD3FC]",
      bg: "bg-sky-100/80 dark:bg-[#7DD3FC]/10",
      border: "border-sky-300/80 dark:border-[#7DD3FC]/20",
      tickFilled: "bg-sky-500 dark:bg-[#7DD3FC]",
      tickEmpty: "border border-zinc-300 dark:border-zinc-700/60 bg-transparent",
    },
    project: {
      color: "#C4B5FD",
      text: "text-violet-700 dark:text-[#C4B5FD]",
      bg: "bg-violet-100/80 dark:bg-[#C4B5FD]/10",
      border: "border-violet-300/80 dark:border-[#C4B5FD]/20",
      tickFilled: "bg-violet-500 dark:bg-[#C4B5FD]",
      tickEmpty: "border border-zinc-300 dark:border-zinc-700/60 bg-transparent",
    },
    hackathon: {
      color: "#FDBA74",
      text: "text-amber-800 dark:text-[#FDBA74]",
      bg: "bg-amber-100/80 dark:bg-[#FDBA74]/10",
      border: "border-amber-300/80 dark:border-[#FDBA74]/20",
      tickFilled: "bg-amber-500 dark:bg-[#FDBA74]",
      tickEmpty: "border border-zinc-300 dark:border-zinc-700/60 bg-transparent",
    },
  },
} as const;
