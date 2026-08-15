"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import Link from "next/link";
import Logo from "@/components/Logo";
import Footer from "@/components/Footer";
import { formatPrizeDisplay } from "@/app/hackathons/page";
import VerifiedBuilderBadge from "@/components/VerifiedBuilderBadge";
import { HeroBackground } from "@/components/ui/hero-background";
import { AnimatedShinyBadge } from "@/components/ui/animated-shiny-badge";
import { AvatarCircles } from "@/components/ui/avatar-circles";
import { ShimmerButton } from "@/components/ui/shimmer-button";
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

  const [activeTab, setActiveTab] = useState<"match" | "hackathons" | "workspace" | "product">("product");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [showOrganizerModal, setShowOrganizerModal] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("contacthackermate@gmail.com");
    setCopiedEmail(true);
    showToast("Copied contacthackermate@gmail.com to clipboard!", "success");
    setTimeout(() => setCopiedEmail(false), 3000);
  };

  // Auto-rotation timer for live cards (every 4.5s)
  useEffect(() => {
    const interval = setInterval(() => {
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

  const currentHackathon = realHackathons[activeHackathonIdx] || {
    name: "Smart India Hackathon 2026",
    mode: "National",
    location: "India",
    prize_pool: "₹1,00,000",
    currency: "INR",
    tags: ["SIH", "AI"],
  };

  const currentBuilder2 = realBuilders[(activeBuilderIdx + 1) % (realBuilders.length || 1)] || {
    full_name: "Priya Nair",
    college: "DTU Delhi",
    skills: ["PyTorch", "FastAPI", "Python"],
  };

  return (
    <main className="min-h-screen flex flex-col bg-[#09090b] text-zinc-100 selection:bg-[#B4F461] selection:text-black overflow-x-hidden">
      <h1 className="sr-only">HackerMate - Hackathon Team Operating System</h1>

      {/* ─── Hero Section (Full-bleed container with live updating flank activity cards) ─── */}
      <section className="relative w-full pt-10 sm:pt-14 pb-14 sm:pb-18 overflow-hidden">
        {/* Full-bleed background treatment */}
        <HeroBackground />

        {/* Left Flank Real Live Activity Cards (Wide Screens Only) */}
        <div className="hidden xl:flex absolute left-6 2xl:left-14 top-1/2 -translate-y-1/2 flex-col gap-3.5 max-w-[260px] z-10 select-none">
          {/* Card 1: Real Builder */}
          <div className={`p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-md shadow-xl text-left space-y-1.5 transform -rotate-1 transition-opacity duration-300 ${fadeOpacity ? "opacity-100" : "opacity-40"}`}>
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B4F461]" />
                <span className="text-zinc-300">Verified Builder</span>
              </span>
              <span className="text-zinc-500">Live</span>
            </div>
            <p className="text-xs font-semibold text-zinc-200 truncate">
              {currentBuilder1.full_name || "Active Builder"}
            </p>
            <p className="text-[10px] font-mono text-zinc-400 truncate">
              {currentBuilder1.college || "Engineering College"}
            </p>
            <div className="flex flex-wrap gap-1 pt-0.5">
              {(currentBuilder1.skills && currentBuilder1.skills.length > 0 ? currentBuilder1.skills : ["Full Stack"]).slice(0, 2).map((s) => (
                <span key={s} className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Card 2: Real Team */}
          <div className={`p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-md shadow-xl text-left space-y-1.5 transform rotate-1 transition-opacity duration-300 ${fadeOpacity ? "opacity-100" : "opacity-40"}`}>
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span className="text-zinc-300">Active Squad</span>
              <span className="text-zinc-500 truncate max-w-[90px]">{currentTeam.hackathon_name || "Hackathon"}</span>
            </div>
            <p className="text-xs font-semibold text-zinc-200 truncate">
              {currentTeam.name}
            </p>
            <p className="text-[10px] font-mono text-zinc-400 truncate">
              {currentTeam.description || "Recruiting teammates"}
            </p>
          </div>
        </div>

        {/* Right Flank Real Live Activity Cards (Wide Screens Only) */}
        <div className="hidden xl:flex absolute right-6 2xl:right-14 top-1/2 -translate-y-1/2 flex-col gap-3.5 max-w-[260px] z-10 select-none">
          {/* Card 3: Real Hackathon */}
          <div className={`p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-md shadow-xl text-left space-y-1.5 transform rotate-1 transition-opacity duration-300 ${fadeOpacity ? "opacity-100" : "opacity-40"}`}>
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span className="text-zinc-300">Featured Hackathon</span>
              <span className="text-zinc-300 font-bold truncate">
                {formatPrizeDisplay(currentHackathon.prize_pool, currentHackathon.currency) || "Open"}
              </span>
            </div>
            <p className="text-xs font-semibold text-zinc-200 truncate">
              {currentHackathon.name}
            </p>
            <p className="text-[10px] font-mono text-zinc-400 truncate">
              {currentHackathon.mode || "Online"}{currentHackathon.location ? ` • ${currentHackathon.location}` : ""}
            </p>
          </div>

          {/* Card 4: Real Builder 2 */}
          <div className={`p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-md shadow-xl text-left space-y-1.5 transform -rotate-1 transition-opacity duration-300 ${fadeOpacity ? "opacity-100" : "opacity-40"}`}>
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span className="text-zinc-300">Co-Builder Profile</span>
              <span className="text-zinc-500">Live</span>
            </div>
            <p className="text-xs font-semibold text-zinc-200 truncate">
              {currentBuilder2.full_name || "Active Builder"}
            </p>
            <p className="text-[10px] font-mono text-zinc-400 truncate">
              {currentBuilder2.college || "Engineering College"}
            </p>
            <div className="flex flex-wrap gap-1 pt-0.5">
              {(currentBuilder2.skills && currentBuilder2.skills.length > 0 ? currentBuilder2.skills : ["Full Stack"]).slice(0, 2).map((s) => (
                <span key={s} className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Content measure container */}
        <div className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-6">

          {/* Logo */}
          <div className="flex justify-center">
            <Link href="/" className="inline-flex items-center">
              <Logo className="h-8 w-auto" />
            </Link>
          </div>

          {/* Shimmering Badge with Exactly 1 Live Status Dot */}
          <div className="flex justify-center">
            <AnimatedShinyBadge className="cursor-default">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B4F461] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#B4F461]" />
              </span>
              <span className="font-medium text-zinc-200 tracking-wide text-xs">HackerMate</span>
              <span className="text-zinc-600 hidden sm:inline">•</span>
              <span className="text-zinc-400 font-mono text-[11px] hidden sm:inline">
                {userCount}+ Verified Builders Live
              </span>
            </AnimatedShinyBadge>
          </div>

          {/* Hero Headline */}
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-zinc-100 leading-[1.15] max-w-2xl mx-auto">
            Find your frontend, backend &amp; AI co-builders.
          </h2>

          {/* Subtitle */}
          <p className="text-sm sm:text-base text-zinc-400 max-w-lg mx-auto leading-relaxed">
            The team operating system for college hackathons. Form high-compatibility squads for <strong className="text-zinc-200 font-semibold">SIH 2026</strong> and collaborate in one unified workspace.
          </p>

          {/* Hero CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 w-full max-w-xs sm:max-w-md mx-auto">
            <ShimmerButton
              onClick={() => router.push("/login")}
              className="w-full sm:w-auto px-7 py-3 text-sm shadow-xl"
              background="#B4F461"
              shimmerColor="#ffffff"
            >
              <span className={`${LANDING_TOKENS.text.onAccent} flex items-center justify-center gap-2`}>
                <span>Find Teammates</span>
                <ArrowRight className="w-4 h-4 text-zinc-950" />
              </span>
            </ShimmerButton>

            <a
              href="#demo"
              className={LANDING_TOKENS.button.secondary}
            >
              <span>Explore Platform</span>
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            </a>
          </div>

          {/* Active Builders Pill */}
          <div className="pt-2 flex justify-center">
            <div className="flex items-center gap-2.5 bg-zinc-950/80 border border-zinc-800/80 px-3.5 py-1.5 rounded-full backdrop-blur-md text-xs text-zinc-400">
              <AvatarCircles
                numPeople={userCount > 4 ? userCount - 4 : userCount}
                avatarUrls={realBuilders.map((b) => ({
                  imageUrl: b.avatar_url,
                  name: b.full_name,
                  skills: b.skills,
                }))}
              />
              <span className="text-zinc-300 font-medium pl-1 text-[11px]">
                Active builders matching today
              </span>
            </div>
          </div>

          {/* Single Quiet Stats Row */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-4 max-w-md mx-auto border-t border-zinc-900">
            <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-900 flex flex-col items-center">
              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 mb-0.5">Builders</span>
              <div className="text-lg font-bold font-mono text-zinc-200">{userCount}+</div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-900 flex flex-col items-center">
              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 mb-0.5">Hackathons</span>
              <div className="text-lg font-bold font-mono text-zinc-200">{hackathonCount}+</div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-900 flex flex-col items-center">
              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 mb-0.5">Teams</span>
              <div className="text-lg font-bold font-mono text-zinc-200">{teamCount}</div>
            </div>
          </div>

        </div>
      </section>

      {/* ─── Section 2: Skill Match Radar Showcase (Dual Pane Browser Frame) ─── */}
      <SkillMatchShowcase />

      {/* ─── Section 3: 9-Tab Workspace Centerpiece Showcase ─── */}
      <section id="demo" className="w-full border-t border-zinc-900 bg-zinc-950/40 py-16 sm:py-24">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8 space-y-2">
            <p className={LANDING_TOKENS.text.eyebrow}>
              Team Operating System
            </p>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-zinc-100 tracking-tight">
              One unified workspace from ideation to submission
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto">
              Real-time sprint planning, collaborative chat, AI deck evaluations, and live project feeds.
            </p>
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
            <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-zinc-900 bg-zinc-950">
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
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
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
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-200 font-mono text-[10px] border border-zinc-800">
                        AI Agents 2026 Squad
                      </span>
                      <span className="text-xs font-semibold text-zinc-200">Active Workspace</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">3 Online</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-left text-xs">
                    {/* Chat Column */}
                    <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-2">
                      <span className="text-[10px] font-mono text-zinc-400 block border-b border-zinc-800/80 pb-1">Team Chat</span>
                      <p className="text-[11px] text-zinc-300"><span className="text-zinc-100 font-mono font-medium">Aarav:</span> API endpoints verified. Wiring up UI components now.</p>
                      <p className="text-[11px] text-zinc-300"><span className="text-zinc-400 font-mono font-medium">Priya:</span> Presentation deck updated for mentor review.</p>
                    </div>

                    {/* Kanban Column */}
                    <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-2">
                      <span className="text-[10px] font-mono text-zinc-400 block border-b border-zinc-800/80 pb-1">Kanban Board</span>
                      <div className="flex items-center justify-between text-[11px] text-zinc-300">
                        <span>Pitch Deck</span>
                        <span className="text-[9px] font-mono text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">Done</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-300">
                        <span>Video Demo</span>
                        <span className="text-[9px] font-mono text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">In Progress</span>
                      </div>
                    </div>

                    {/* AI Evaluator & Deploy Column */}
                    <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-2">
                      <span className="text-[10px] font-mono text-zinc-400 block border-b border-zinc-800/80 pb-1">AI Deck Review</span>
                      <div className="flex items-center justify-between text-[11px] text-zinc-300">
                        <span>Format Scoring</span>
                        <span className="text-[9px] font-mono text-zinc-300">92 / 100</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-300">
                        <span>Vercel Build</span>
                        <span className="text-[9px] font-mono text-zinc-400">Passing</span>
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
                        <p className="text-[11px] text-zinc-400 mb-2 line-clamp-2 leading-relaxed">
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
                          <p className="text-[10px] text-zinc-500 mt-1 line-clamp-2">
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

      {/* ─── Section 4: SIH 2026 Engine Showcase ─── */}
      <SihComplianceShowcase />

      {/* ─── Section 5: Verified College Network ─── */}
      <section id="colleges" className="w-full border-t border-zinc-900 bg-zinc-950 py-14 sm:py-18">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className={LANDING_TOKENS.text.eyebrow}>
            College Network
          </p>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight mb-2">
            Engineers from premier institutes
          </h2>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto mb-6">
            Verified builder communities across top engineering colleges in India.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 max-w-3xl mx-auto">
            {(qualifiedColleges.length >= 4
              ? qualifiedColleges.map(([c]) => c)
              : [
                  "IIT Bombay", "IIT Delhi", "IIT Madras", "BITS Pilani", "COEP Pune",
                  "VJTI Mumbai", "DTU Delhi", "NIT Surathkal", "VIT Vellore", "DJSCE Mumbai", "PICT Pune"
                ]
            ).map((col) => (
              <span
                key={col}
                className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 text-xs font-mono text-zinc-300"
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Section 6: Workflow (3 Steps) ─── */}
      <section id="how-it-works" className="w-full border-t border-zinc-900 bg-zinc-950/40 py-14 sm:py-18">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8 space-y-1">
            <p className={LANDING_TOKENS.text.eyebrow}>
              How It Works
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
              Three steps to a winning team
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { step: "01", title: "Build Your Identity", description: "List your verified tech stack, past projects, and college domain." },
              { step: "02", title: "Match by Role", description: "Filter teammates by complementary skills (Frontend, Backend, AI/ML)." },
              { step: "03", title: "Collaborate & Win", description: "Use the built-in Kanban board, team chat, and AI pitch deck evaluator." },
            ].map((item) => (
              <div key={item.step} className={LANDING_TOKENS.surface.card + " p-5"}>
                <span className="text-xs font-mono font-bold text-zinc-400 mb-2 block">{item.step}</span>
                <h3 className="text-sm font-semibold text-zinc-100 mb-1">{item.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Section 7: Founder Note ─── */}
      <section className="w-full border-t border-zinc-900 bg-zinc-950 py-12 sm:py-14">
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6">
          <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-900/20">
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed italic">
              &ldquo;As a second-year engineering student, I lost count of how many hackathons I almost skipped simply because I couldn&apos;t find a reliable frontend developer or AI builder in time. HackerMate was built to solve team formation for good.&rdquo;
            </p>
            <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-200">Yash Shah</p>
                <p className="text-[10px] text-zinc-500 font-mono">Founder • 2nd-Year CS Engineering Student</p>
              </div>
              <button
                onClick={() => setShowOrganizerModal(true)}
                className="text-[11px] font-mono text-zinc-300 hover:text-white hover:underline cursor-pointer"
              >
                Organizer Inquiries →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 8: FAQ ─── */}
      <section id="faq" className="w-full border-t border-zinc-900 bg-zinc-950/40 py-14 sm:py-18">
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8 space-y-1">
            <p className={LANDING_TOKENS.text.eyebrow}>
              Frequently Asked Questions
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
              Got questions?
            </h2>
          </div>

          <div className="space-y-2.5">
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
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                  className="w-full p-3.5 text-left flex items-center justify-between gap-4 text-xs font-medium text-zinc-200 hover:text-white transition-colors cursor-pointer select-none"
                >
                  <span>{faq.q}</span>
                  <span className="text-zinc-500 font-mono">
                    {expandedFaq === faq.id ? "−" : "+"}
                  </span>
                </button>
                {expandedFaq === faq.id && (
                  <div className="px-3.5 pb-3.5 text-xs text-zinc-400 leading-relaxed border-t border-zinc-800/60 pt-2.5">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Section 9: Final Call to Action ─── */}
      <section className="w-full border-t border-zinc-900 bg-zinc-950 py-16 sm:py-20 px-4 sm:px-6 text-center">
        <div className="max-w-md mx-auto space-y-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
            Ready to find your hackathon team?
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
            Join {userCount}+ verified builders and assemble your squad for SIH 2026.
          </p>

          <div className="pt-2 flex justify-center">
            <ShimmerButton
              onClick={() => router.push("/login")}
              className="px-8 py-3 text-sm shadow-xl"
              background="#B4F461"
              shimmerColor="#ffffff"
            >
              <span className={`${LANDING_TOKENS.text.onAccent} flex items-center justify-center gap-2`}>
                <span>Join HackerMate</span>
                <ArrowRight className="w-4 h-4 text-zinc-950" />
              </span>
            </ShimmerButton>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <Footer />

      {/* ─── Organizer Contact Modal ─── */}
      {showOrganizerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 relative shadow-2xl space-y-5">
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
              <p className="text-xs text-zinc-400 leading-relaxed">
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
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-bold text-xs transition-all cursor-pointer"
              >
                <span>Open in Gmail</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                type="button"
                onClick={handleCopyEmail}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium text-xs transition-all cursor-pointer"
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
