"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import Link from "next/link";
import { formatPrizeDisplay } from "@/app/hackathons/page";
import VerifiedBuilderBadge from "@/components/VerifiedBuilderBadge";
import { HeroBackground } from "@/components/ui/hero-background";
import { AnimatedShinyBadge } from "@/components/ui/animated-shiny-badge";
import { AvatarCircles } from "@/components/ui/avatar-circles";
import { SkillMatchShowcase } from "@/components/ui/skill-match-showcase";
import { SihComplianceShowcase } from "@/components/ui/sih-compliance-showcase";
import { LANDING_TOKENS } from "@/lib/design-tokens";
import {
  LandingData,
  RealProfile,
  RealHackathon,
  RealTeam,
} from "@/lib/getLandingData";
import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
} from "lucide-react";

interface LandingPageClientProps {
  initialData: LandingData;
}

export function LandingPageClient({ initialData }: LandingPageClientProps) {
  const router = useRouter();
  const { showToast } = useNotification();

  // Instant server hydration — 0ms delay!
  const [userCount] = useState<number>(initialData.userCount || 100);
  const [hackathonCount] = useState<number>(initialData.hackathonCount || 120);
  const [teamCount] = useState<number>(initialData.teamCount || 10);

  const [realBuilders, setRealBuilders] = useState<RealProfile[]>(initialData.builders || []);
  const [realHackathons] = useState<RealHackathon[]>(initialData.hackathons || []);
  const [realTeams, setRealTeams] = useState<RealTeam[]>(initialData.teams || []);

  // Live rotating indices
  const [activeBuilderIdx, setActiveBuilderIdx] = useState(0);
  const [activeTeamIdx, setActiveTeamIdx] = useState(0);
  const [activeHackathonIdx, setActiveHackathonIdx] = useState(0);
  const [fadeOpacity, setFadeOpacity] = useState(true);

  const [activeTab, setActiveTab] = useState<"product" | "match" | "hackathons" | "workspace">("product");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [showOrganizerModal, setShowOrganizerModal] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("contacthackermate@gmail.com");
    setCopiedEmail(true);
    showToast("Copied contacthackermate@gmail.com to clipboard!", "success");
    setTimeout(() => setCopiedEmail(false), 3000);
  };

  // Auto-rotation timer for live cards (every 4.5s) - pauses when tab is backgrounded
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setFadeOpacity(false);
      setTimeout(() => {
        setActiveBuilderIdx((prev) => (realBuilders.length > 0 ? (prev + 1) % realBuilders.length : 0));
        setActiveTeamIdx((prev) => (realTeams.length > 0 ? (prev + 1) % realTeams.length : 0));
        setActiveHackathonIdx((prev) => (realHackathons.length > 0 ? (prev + 1) % realHackathons.length : 0));
        setFadeOpacity(true);
      }, 250);
    }, 4500);

    return () => clearInterval(interval);
  }, [realBuilders.length, realTeams.length, realHackathons.length]);

  // Realtime subscription for incoming registrations
  useEffect(() => {
    const channel = supabase
      .channel("landing-realtime-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "profiles" },
        (payload) => {
          if (payload.new && payload.new.full_name) {
            setRealBuilders((prev) => [payload.new as RealProfile, ...prev.slice(0, 19)]);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "teams" },
        (payload) => {
          if (payload.new && payload.new.name) {
            setRealTeams((prev) => [payload.new as RealTeam, ...prev.slice(0, 11)]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    async function checkUserSession() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data } = await supabase
            .from("profiles")
            .select("onboarding_completed")
            .eq("id", user.id)
            .maybeSingle();

          const requestedPath = new URLSearchParams(window.location.search).get("next");
          const safePath =
            requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
              ? requestedPath
              : "/dashboard";

          if (data?.onboarding_completed) {
            router.push(safePath);
          } else {
            router.push(`/onboarding?next=${encodeURIComponent(safePath)}`);
          }
        }
      } catch (err) {
        console.error("Session check error on landing page:", err);
      }
    }

    checkUserSession();
  }, [router]);

  // College count aggregation
  const collegeCounts = realBuilders.reduce((acc, b) => {
    if (b.college && b.college.trim()) {
      const col = b.college.trim();
      acc[col] = (acc[col] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const qualifiedColleges = Object.entries(collegeCounts)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  // Live rotating items from real DB data
  const currentBuilder1 = realBuilders[activeBuilderIdx] || {
    full_name: "Aarav Sharma",
    college: "IIT Bombay",
    skills: ["Next.js", "Tailwind CSS", "React"],
  };

  const currentTeam = realTeams[activeTeamIdx] || {
    name: "AI Agents Squad",
    hackathon_name: "SIH 2026",
    description: "Looking for full-stack engineer",
  };

  return (
    <main className="min-h-screen flex flex-col bg-[#080808] text-zinc-100 selection:bg-[#B4F461] selection:text-black overflow-x-hidden relative">
      <h1 className="sr-only">HackerMate - Hackathon Team Operating System</h1>

      {/* Full-bleed background treatment across the entire landing page */}
      <HeroBackground />

      {/* ─── 1. Hero Section (Direction 1: Symmetrical Grounded Grid Layout) ─── */}
      <section className="relative w-full pt-12 sm:pt-16 pb-10 lg:pb-14 z-10 overflow-hidden">
        {/* Soft atmospheric radial gradient glow behind hero for depth */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] sm:w-[1000px] lg:w-[1200px] h-[400px] sm:h-[500px] bg-[radial-gradient(ellipse_at_center,rgba(180,244,97,0.06)_0%,rgba(255,255,255,0.025)_30%,transparent_70%)] blur-[90px] pointer-events-none -z-10" />

        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-8 items-center">

            {/* Left Flank: Grounded Live Verified Builder Card (Desktop) */}
            <div className="hidden lg:block lg:col-span-3">
              <div
                className={`p-4 ${LANDING_TOKENS.surface.flagship} ${LANDING_TOKENS.surface.flagshipHover} space-y-3 text-left group ${
                  fadeOpacity ? "opacity-100" : "opacity-40"
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#B4F461] animate-pulse group-hover:shadow-[0_0_8px_rgba(180,244,97,0.8)] transition-shadow" />
                    <span className="text-zinc-200 font-medium">Verified Builder</span>
                  </span>
                  <span className="text-zinc-500 group-hover:text-[#B4F461] transition-colors">Live</span>
                </div>

                <div>
                  <p className="text-sm font-semibold text-white truncate">
                    {currentBuilder1.full_name || "Active Builder"}
                  </p>
                  <p className="text-xs font-mono text-zinc-400 truncate mt-0.5">
                    {currentBuilder1.college || "Engineering College"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(currentBuilder1.skills && currentBuilder1.skills.length > 0
                    ? currentBuilder1.skills
                    : ["Full Stack", "TypeScript"]
                  ).slice(0, 3).map((s) => (
                    <span
                      key={s}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-300 border border-white/[0.06]"
                    >
                      {s}
                    </span>
                  ))}
                </div>

                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-zinc-500">
                  <span>Available for Squad</span>
                  <span className="text-[#B4F461] font-medium group-hover:text-[#c4f87a] transition-colors">Ready to match</span>
                </div>
              </div>
            </div>

            {/* Center Column: Hero Display Headline, CTAs, Proof */}
            <div className="lg:col-span-6 text-center space-y-6">
              {/* Shimmering Brand Badge */}
              <div className="flex justify-center">
                <AnimatedShinyBadge className="cursor-default">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B4F461] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#B4F461]" />
                  </span>
                  <span className="font-semibold text-zinc-200 tracking-wide text-xs">HackerMate</span>
                  <span className="text-zinc-600 hidden sm:inline">•</span>
                  <span className="text-zinc-400 font-mono text-[11px] hidden sm:inline">
                    {userCount}+ Verified Builders Live
                  </span>
                </AnimatedShinyBadge>
              </div>

              {/* Display Headline */}
              <h2 className="text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-[-0.035em] text-white leading-[1.08] max-w-2xl mx-auto">
                Find your frontend, backend &amp; AI co-builders.
              </h2>

              {/* Subtitle */}
              <p className="text-sm sm:text-base text-zinc-300 max-w-lg mx-auto leading-relaxed">
                The team operating system for college hackathons. Form high-compatibility squads for{" "}
                <strong className="text-white font-medium">SIH 2026</strong> and collaborate in one unified workspace.
              </p>

              {/* Hero CTAs: Dominant Lime Pill with Luminous Underglow + Understated Text Link */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2 w-full max-w-xs sm:max-w-md mx-auto">
                <div className="relative inline-flex group">
                  {/* Subtle ambient lime underglow aura */}
                  <div className="absolute -inset-1 bg-[#B4F461]/25 rounded-full blur-xl opacity-60 group-hover:opacity-100 group-hover:blur-2xl transition-all duration-300 pointer-events-none -z-10" />
                  <button
                    onClick={() => router.push("/login")}
                    className={LANDING_TOKENS.button.primary}
                  >
                    <span>Find Teammates</span>
                    <ArrowRight className="w-4 h-4 text-zinc-950" />
                  </button>
                </div>

                <a
                  href="#demo"
                  className={LANDING_TOKENS.button.secondaryLink}
                >
                  <span>Explore Platform</span>
                  <ChevronDown className="w-4 h-4 text-zinc-400 group-hover:translate-y-0.5 transition-transform" />
                </a>
              </div>

              {/* Active Builders Pill */}
              <div className="pt-2 flex justify-center">
                <div className="flex items-center gap-2.5 bg-zinc-950/90 border border-white/[0.08] px-3.5 py-1.5 rounded-full backdrop-blur-md text-xs text-zinc-400">
                  <AvatarCircles
                    numPeople={userCount > 4 ? userCount - 4 : userCount}
                    avatarUrls={realBuilders.map((b) => ({
                      imageUrl: b.avatar_url,
                      name: b.full_name,
                      skills: b.skills,
                    }))}
                  />
                  <span className="text-zinc-200 font-medium pl-1 text-[11px]">
                    Active builders matching today
                  </span>
                </div>
              </div>

              {/* Single Quiet Stats Row */}
              <div className="grid grid-cols-3 gap-3 pt-6 max-w-sm mx-auto border-t border-white/[0.06]">
                <div className="p-2.5 rounded-xl bg-zinc-950/40 border border-white/[0.05] flex flex-col items-center">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 mb-0.5">Builders</span>
                  <div className="text-lg font-bold font-mono text-zinc-100">{userCount}+</div>
                </div>

                <div className="p-2.5 rounded-xl bg-zinc-950/40 border border-white/[0.05] flex flex-col items-center">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 mb-0.5">Hackathons</span>
                  <div className="text-lg font-bold font-mono text-zinc-100">{hackathonCount}+</div>
                </div>

                <div className="p-2.5 rounded-xl bg-zinc-950/40 border border-white/[0.05] flex flex-col items-center">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 mb-0.5">Teams</span>
                  <div className="text-lg font-bold font-mono text-zinc-100">{teamCount}</div>
                </div>
              </div>

              {/* Grounded Live Telemetry Dock for Mobile/Tablet (< lg) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto pt-4 lg:hidden text-left">
                {/* Mobile Card 1: Verified Builder */}
                <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-white/[0.08] space-y-1.5 transition-all duration-300 hover:border-white/[0.2] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#B4F461]" />
                      <span className="text-zinc-200">Verified Builder</span>
                    </span>
                    <span className="text-zinc-500">Live</span>
                  </div>
                  <p className="text-xs font-semibold text-white truncate">
                    {currentBuilder1.full_name || "Active Builder"}
                  </p>
                  <p className="text-[10px] font-mono text-zinc-400 truncate">
                    {currentBuilder1.college || "Engineering College"}
                  </p>
                </div>

                {/* Mobile Card 2: Active Squad */}
                <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-white/[0.08] space-y-1.5 transition-all duration-300 hover:border-white/[0.2] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                    <span className="text-zinc-200">Active Squad</span>
                    <span className="text-[#B4F461]">{currentTeam.hackathon_name || "SIH 2026"}</span>
                  </div>
                  <p className="text-xs font-semibold text-white truncate">
                    {currentTeam.name}
                  </p>
                  <p className="text-[10px] font-mono text-zinc-400 truncate">
                    {currentTeam.description || "Recruiting complementary roles"}
                  </p>
                </div>
              </div>
            </div>

            {/* Right Flank: Grounded Live Active Squad Card (Desktop) */}
            <div className="hidden lg:block lg:col-span-3">
              <div
                className={`p-4 ${LANDING_TOKENS.surface.flagship} ${LANDING_TOKENS.surface.flagshipHover} space-y-3 text-left group ${
                  fadeOpacity ? "opacity-100" : "opacity-40"
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#B4F461] animate-pulse group-hover:shadow-[0_0_8px_rgba(180,244,97,0.8)] transition-shadow" />
                    <span className="text-zinc-200 font-medium">Active Squad</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-white/[0.06]">
                    {currentTeam.hackathon_name || "SIH 2026"}
                  </span>
                </div>

                <div>
                  <p className="text-sm font-semibold text-white truncate">
                    {currentTeam.name}
                  </p>
                  <p className="text-xs font-mono text-zinc-400 truncate mt-0.5">
                    {currentTeam.description || "Recruiting teammates"}
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.06] space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-zinc-400">Target Track</span>
                    <span className="text-zinc-200">Smart Automation</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-zinc-400">Open Role</span>
                    <span className="text-[#B4F461]">Full Stack / AI Lead</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-zinc-500">
                  <span>Squad Formation</span>
                  <span className="text-zinc-300 group-hover:text-[#B4F461] transition-colors">Recruiting Now</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ─── 2. Differentiator 1: Skill Match Radar Showcase ─── */}
      <SkillMatchShowcase />

      {/* ─── 3. Differentiator 2: SIH 2026 Engine Showcase ─── */}
      <SihComplianceShowcase />

      {/* ─── 4. Product Centerpiece: 9-Tab Workspace OS HUD ─── */}
      <section id="demo" className={`w-full ${LANDING_TOKENS.spacing.section} bg-transparent relative z-10`}>
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-8 text-left">
            <div className="space-y-2 max-w-2xl">
              <p className={LANDING_TOKENS.text.eyebrow}>
                Team Operating System
              </p>
              <h2 className={LANDING_TOKENS.text.sectionH2}>
                One unified workspace from ideation to submission
              </h2>
              <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
                Real-time sprint planning, collaborative chat, AI deck evaluations, and live project feeds.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 pb-1">
              <div className="px-3.5 py-1.5 rounded-full border border-white/[0.08] bg-zinc-950/80 text-xs font-mono text-zinc-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#B4F461] animate-pulse" />
                <span>9 Integrated Modules</span>
              </div>
            </div>
          </div>

          <div className={LANDING_TOKENS.surface.chrome}>
            {/* Window Chrome Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 bg-zinc-950">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                <span className="ml-2 text-[10px] font-mono text-zinc-500 truncate">hackermate.in/workspace</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                Interactive Preview
              </span>
            </div>

            {/* Tab bar */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-zinc-900 bg-zinc-950">
              {(
                [
                  {
                    key: "product",
                    label: "Workspace OS HUD",
                    count: "9 Tabs",
                  },
                  {
                    key: "match",
                    label: "Builders Feed",
                    count: realBuilders.length || userCount,
                  },
                  {
                    key: "hackathons",
                    label: "Hackathons",
                    count: realHackathons.length || hackathonCount,
                  },
                  {
                    key: "workspace",
                    label: "Active Squads",
                    count: realTeams.length || teamCount,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                    activeTab === tab.key
                      ? "bg-zinc-800 text-zinc-100 border border-zinc-700 font-semibold"
                      : "text-zinc-400 hover:text-zinc-200 border border-transparent"
                  }`}
                >
                  <span>{tab.label}</span> <span className="text-zinc-500 font-mono text-[10px]">({tab.count})</span>
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-4 sm:p-6 bg-zinc-950/60">

              {/* Workspace HUD Centerpiece Tab */}
              {activeTab === "product" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-200 font-mono text-[10px] border border-zinc-800">
                        AI Agents 2026 Squad
                      </span>
                      <span className="text-xs font-semibold text-zinc-200">Active Workspace</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#B4F461] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#B4F461]" />
                      3 Online
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-left text-xs">
                    {/* Chat Column */}
                    <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-2.5">
                      <span className="text-[10px] font-mono text-zinc-400 block border-b border-zinc-800/80 pb-1.5">Team Chat</span>
                      <p className="text-xs text-zinc-300 leading-relaxed"><span className="text-white font-mono font-medium">Aarav:</span> API endpoints verified. Wiring up UI components now.</p>
                      <p className="text-xs text-zinc-300 leading-relaxed"><span className="text-zinc-400 font-mono font-medium">Priya:</span> Presentation deck updated for mentor review.</p>
                    </div>

                    {/* Kanban Column */}
                    <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-2.5">
                      <span className="text-[10px] font-mono text-zinc-400 block border-b border-zinc-800/80 pb-1.5">Kanban Board</span>
                      <div className="flex items-center justify-between text-xs text-zinc-300">
                        <span>Pitch Deck</span>
                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">Done</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-zinc-300">
                        <span>Video Demo</span>
                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">In Progress</span>
                      </div>
                    </div>

                    {/* AI Evaluator Column */}
                    <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-2.5">
                      <span className="text-[10px] font-mono text-zinc-400 block border-b border-zinc-800/80 pb-1.5">AI Deck Review</span>
                      <div className="flex items-center justify-between text-xs text-zinc-300">
                        <span>Format Scoring</span>
                        <span className="text-[10px] font-mono text-[#B4F461] font-bold">92 / 100</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-zinc-300">
                        <span>Vercel Build</span>
                        <span className="text-[10px] font-mono text-zinc-400">Passing</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Builders Tab */}
              {activeTab === "match" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {realBuilders.length > 0 ? (
                    realBuilders.slice(0, 6).map((b) => (
                      <div key={b.id} className="p-3.5 rounded-xl border border-zinc-800/70 bg-zinc-900/30 hover:border-zinc-700 transition-colors">
                        <div className="flex items-center gap-2.5 mb-2">
                          {b.avatar_url ? (
                            <img
                              src={b.avatar_url}
                              alt={b.full_name || "Builder"}
                              className="w-8 h-8 rounded-full border border-zinc-800 object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-200 flex items-center justify-center font-bold text-xs border border-zinc-700 shrink-0">
                              {(b.full_name || "B")[0].toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-xs font-semibold text-zinc-200 truncate">{b.full_name || "Builder"}</h4>
                              <VerifiedBuilderBadge profile={b} />
                            </div>
                            <p className="text-[10px] text-zinc-400 font-mono truncate">
                              {b.college || "Engineering College"}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-300 mb-2 line-clamp-2 leading-relaxed">
                          {b.bio || "Building projects for upcoming hackathons."}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(b.skills && b.skills.length > 0 ? b.skills : ["Full Stack"]).slice(0, 3).map((s) => (
                            <span key={s} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full text-center py-8 text-xs text-zinc-500">
                      Loading builders...
                    </div>
                  )}
                </div>
              )}

              {/* Hackathons Tab */}
              {activeTab === "hackathons" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {realHackathons.length > 0 ? (
                    realHackathons.map((h) => (
                      <div key={h.id} className="p-3.5 rounded-xl border border-zinc-800/70 bg-zinc-900/30 hover:border-zinc-700 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                            {h.mode || "Online"}{h.location ? ` • ${h.location}` : ""}
                          </span>
                          <span className="text-[11px] font-mono font-semibold text-zinc-300">
                            {formatPrizeDisplay(h.prize_pool, h.currency) || "Prize Pool"}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-zinc-200 mb-2 line-clamp-1">{h.name}</h4>
                        <div className="flex flex-wrap gap-1">
                          {(h.tags && h.tags.length > 0 ? h.tags : ["Hackathon"]).slice(0, 3).map((t) => (
                            <span key={t} className="text-[9px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full text-center py-8 text-xs text-zinc-500">
                      Loading hackathons...
                    </div>
                  )}
                </div>
              )}

              {/* Teams Tab */}
              {activeTab === "workspace" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 mb-3">
                    <span className="text-xs font-semibold text-zinc-200">Active Squads</span>
                    <span className="text-[10px] font-mono text-zinc-400">{teamCount} squads registered</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {realTeams.length > 0 ? (
                      realTeams.map((t) => (
                        <div key={t.id} className="p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/70">
                          <span className="text-[9px] font-mono text-zinc-400 uppercase block truncate font-medium">
                            {t.hackathon_name || "Active Team"}
                          </span>
                          <p className="text-xs text-zinc-200 font-medium mt-1 truncate">{t.name}</p>
                          <p className="text-[10px] text-zinc-400 mt-1 line-clamp-2">
                            {t.description || "Looking for teammates"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full text-center py-6 text-xs text-zinc-500">
                        Loading squads...
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </section>

      {/* ─── 5. Verified College Network ─── */}
      <section id="colleges" className={`w-full ${LANDING_TOKENS.spacing.section} bg-transparent relative z-10`}>
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-4">
          <p className={LANDING_TOKENS.text.eyebrow}>
            College Network
          </p>
          <h2 className={LANDING_TOKENS.text.sectionH2}>
            Engineers from premier institutes
          </h2>
          <p className="text-sm sm:text-base text-zinc-300 max-w-lg mx-auto leading-relaxed">
            Verified builder communities across top engineering institutes in India.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-3xl mx-auto pt-6">
            {(qualifiedColleges.length >= 4
              ? qualifiedColleges.map(([c]) => c)
              : [
                  "IIT Bombay", "IIT Delhi", "IIT Madras", "BITS Pilani", "COEP Pune",
                  "VJTI Mumbai", "DTU Delhi", "NIT Surathkal", "VIT Vellore", "DJSCE Mumbai", "PICT Pune"
                ]
            ).map((col) => (
              <span
                key={col}
                className="px-4 py-2 rounded-xl border border-white/[0.08] bg-zinc-950/60 text-xs font-mono text-zinc-200 backdrop-blur-sm transition-all duration-200 hover:border-white/[0.25] hover:text-white hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.5)] cursor-default"
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 6. How It Works (Workflow Pipeline) ─── */}
      <section id="how-it-works" className={`w-full ${LANDING_TOKENS.spacing.section} bg-transparent relative z-10`}>
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Left Column: Narrative Anchor (4 cols) */}
            <div className="lg:col-span-4 space-y-4 text-left lg:sticky lg:top-24">
              <p className={LANDING_TOKENS.text.eyebrow}>
                Workflow Pipeline
              </p>
              <h2 className={LANDING_TOKENS.text.sectionH2}>
                Three steps to a winning team.
              </h2>
              <p className="text-sm text-zinc-300 leading-relaxed">
                Form verified squads with complementary stacks, collaborate in unified workspaces, and ship winning projects.
              </p>
              <div className="pt-2">
                <Link
                  href="/login"
                  className={LANDING_TOKENS.button.secondaryLink}
                >
                  <span>Start building your team</span>
                  <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>

            {/* Right Column: 3 Sequential Step Cards (8 cols) */}
            <div className="lg:col-span-8 space-y-4">
              {[
                {
                  step: "01",
                  title: "Build Your Identity",
                  description: "List your verified tech stack, past projects, and college domain to demonstrate your technical depth.",
                  badge: "Profile Setup",
                },
                {
                  step: "02",
                  title: "Match by Role",
                  description: "Filter teammates by complementary skills (Frontend, Backend, AI/ML) and send direct 1-click connect requests.",
                  badge: "Skill Radar",
                },
                {
                  step: "03",
                  title: "Collaborate & Win",
                  description: "Coordinate tasks on the built-in Kanban board, brainstorm in team chat, and test your pitch with Idea Evaluator.",
                  badge: "Workspace OS",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-white/[0.035] via-zinc-950/80 to-[#080808]/90 border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all duration-300 hover:border-white/[0.2] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18),0_12px_36px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 group text-left"
                >
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <span className="text-xs font-mono font-bold text-[#B4F461] bg-[#B4F461]/10 px-2.5 py-0.5 rounded-md border border-[#B4F461]/20">
                      STEP {item.step}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">{item.badge}</span>
                  </div>
                  <h3 className="text-base font-semibold text-white group-hover:text-zinc-100 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-zinc-300 leading-relaxed mt-1">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── 7. Founder Note ─── */}
      <section className={`w-full ${LANDING_TOKENS.spacing.section} bg-transparent relative z-10`}>
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6">
          <div className="p-8 rounded-2xl border border-white/[0.08] bg-zinc-950/80 backdrop-blur-md space-y-4 text-left shadow-2xl transition-all duration-300 hover:border-white/[0.2] hover:-translate-y-0.5 hover:shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
            <p className="text-base sm:text-lg text-zinc-200 leading-relaxed italic font-normal">
              &ldquo;As a second-year engineering student, I lost count of how many hackathons I almost skipped simply because I couldn&apos;t find a reliable frontend developer or AI builder in time. HackerMate was built to solve team formation for good.&rdquo;
            </p>
            <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Yash Shah</p>
                <p className="text-xs text-zinc-400 font-mono">Founder • 2nd-Year CS Engineering Student</p>
              </div>
              <button
                onClick={() => setShowOrganizerModal(true)}
                className={LANDING_TOKENS.button.secondaryLink}
              >
                <span>Organizer Inquiries</span>
                <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 8. FAQ ─── */}
      <section id="faq" className={`w-full ${LANDING_TOKENS.spacing.section} bg-transparent relative z-10`}>
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Left Column: FAQ Anchor (4 cols) */}
            <div className="lg:col-span-4 space-y-4 text-left lg:sticky lg:top-24">
              <p className={LANDING_TOKENS.text.eyebrow}>
                Frequently Asked Questions
              </p>
              <h2 className={LANDING_TOKENS.text.sectionH2}>
                Everything you need to know.
              </h2>
              <p className="text-sm text-zinc-300 leading-relaxed">
                Clear answers about builder matching, squad formation, SIH rule compliance, and college hackathon listings.
              </p>
              <div className="pt-2">
                <Link
                  href="/contact"
                  className={LANDING_TOKENS.button.secondaryLink}
                >
                  <span>Have questions? Contact us</span>
                  <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>

            {/* Right Column: Accordions (8 cols) */}
            <div className="lg:col-span-8 space-y-3">
              {[
                {
                  id: 1,
                  q: "Is HackerMate free for engineering students?",
                  a: "Yes, 100% free for all students to create profiles, search builders, join teams, and collaborate in team workspaces.",
                },
                {
                  id: 2,
                  q: "How does skill-based matching work?",
                  a: "Our algorithm pairs builders with complementary technical skills (e.g. Next.js + FastAPI + PyTorch) rather than duplicate roles.",
                },
                {
                  id: 3,
                  q: "Is SIH 2026 team rule validation supported?",
                  a: "Yes, HackerMate automatically enforces SIH 6-member team limits and the mandatory 1+ female member quota.",
                },
                {
                  id: 4,
                  q: "Do hackathon organizers pay to list events?",
                  a: "No, event listing is completely free for college and community hackathons.",
                },
              ].map((faq) => (
                <div
                  key={faq.id}
                  className="rounded-xl border border-white/[0.08] bg-zinc-950/60 overflow-hidden backdrop-blur-md transition-colors duration-200 hover:border-white/[0.2]"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                    className="w-full p-4 text-left flex items-center justify-between gap-4 text-sm font-medium text-zinc-100 hover:text-white transition-colors cursor-pointer select-none"
                  >
                    <span>{faq.q}</span>
                    <span className="text-zinc-500 font-mono text-base">
                      {expandedFaq === faq.id ? "−" : "+"}
                    </span>
                  </button>
                  {expandedFaq === faq.id && (
                    <div className="px-4 pb-4 text-sm text-zinc-300 leading-relaxed border-t border-white/[0.06] pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── 9. Final Call to Action (High-Momentum Angle) ─── */}
      <section className={`w-full ${LANDING_TOKENS.spacing.section} px-4 sm:px-6 relative z-10`}>
        <div className="max-w-4xl mx-auto rounded-3xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/80 via-zinc-950/80 to-[#080808] p-8 sm:p-16 relative overflow-hidden backdrop-blur-md shadow-2xl text-center space-y-6">
          {/* Subtle inner radial top glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[260px] bg-[radial-gradient(ellipse_at_top,rgba(180,244,97,0.12)_0%,transparent_70%)] blur-[50px] pointer-events-none" />

          {/* Top highlight horizon line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-[#B4F461]/30 to-transparent" />

          {/* Momentum Eyebrow Badge */}
          <div className="flex justify-center relative z-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-950/90 border border-white/[0.08] text-[11px] font-mono text-zinc-300 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B4F461] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#B4F461]" />
              </span>
              <span>UPCOMING HACKATHON DEADLINES ACTIVE</span>
            </div>
          </div>

          {/* Differentiated Momentum Headline & Subtitle */}
          <div className="space-y-3 relative z-10 max-w-xl mx-auto">
            <h2 className="text-3xl sm:text-5xl font-semibold tracking-[-0.03em] text-white leading-tight">
              Your next hackathon win starts with the right squad.
            </h2>
            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
              Team formations for Smart India Hackathon and national college competitions are filling up now. Don&apos;t build alone.
            </p>
          </div>

          {/* Standardized Primary CTA Button */}
          <div className="pt-2 flex justify-center relative z-10">
            <button
              onClick={() => router.push("/login")}
              className={LANDING_TOKENS.button.primary}
            >
              <span>Find Teammates</span>
              <ArrowRight className="w-4 h-4 text-zinc-950" />
            </button>
          </div>

          {/* Value Props & Trust Badges */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs font-mono text-zinc-300 border-t border-white/[0.08] relative z-10">
            <span className="flex items-center gap-2">
              <span className="text-[#B4F461] font-bold">✓</span> Complementary Skill Radar
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[#B4F461] font-bold">✓</span> SIH 2026 Rule Compliance
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[#B4F461] font-bold">✓</span> 100% Free for Students
            </span>
          </div>
        </div>
      </section>


      {/* ─── Organizer Contact Modal ─── */}
      {showOrganizerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 relative shadow-2xl space-y-5">
            <button
              onClick={() => setShowOrganizerModal(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer text-sm font-mono"
            >
              ✕
            </button>

            <div className="text-center space-y-2">
              <span className="text-[10px] font-mono font-semibold tracking-wider text-zinc-400 uppercase bg-zinc-900 px-2.5 py-0.5 rounded border border-zinc-800 inline-block">
                ORGANIZER INQUIRIES
              </span>
              <h3 className="text-lg font-bold text-white">Partner Your Hackathon</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Connect participants across 50+ engineering colleges to form winning teams.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center space-y-1.5">
              <p className="text-[10px] font-mono text-zinc-400">Official Contact Email</p>
              <span className="text-xs font-mono font-bold text-zinc-200 select-all bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800 inline-block">
                contacthackermate@gmail.com
              </span>
            </div>

            <div className="space-y-2">
              <a
                href="https://mail.google.com/mail/?view=cm&fs=1&to=contacthackermate@gmail.com&su=Partner+Hackathon+with+HackerMate"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-all cursor-pointer"
              >
                <span>Open in Gmail</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                type="button"
                onClick={handleCopyEmail}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium text-xs transition-all cursor-pointer"
              >
                <span>{copiedEmail ? "Copied to Clipboard" : "Copy Email Address"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
