"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import Link from "next/link";
import Logo from "@/components/Logo";
import Footer from "@/components/Footer";

type RealProfile = {
  id: string;
  full_name: string | null;
  college: string | null;
  bio: string | null;
  skills: string[] | null;
  avatar_url: string | null;
};

type RealHackathon = {
  id: string;
  name: string;
  mode: string | null;
  location: string | null;
  prize_pool: string | null;
  tags: string[] | null;
  type: string | null;
  website_url: string | null;
  start_date: string | null;
};

type RealTeam = {
  id: string;
  name: string;
  description: string | null;
  max_members: number | null;
  team_hackathons: { hackathons: { name: string } | null }[];
};

export default function Home() {
  const router = useRouter();
  const { showToast } = useNotification();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  const [userCount, setUserCount] = useState<number>(104);
  const [hackathonCount, setHackathonCount] = useState<number>(127);
  const [teamCount, setTeamCount] = useState<number>(3);

  const [realBuilders, setRealBuilders] = useState<RealProfile[]>([]);
  const [realHackathons, setRealHackathons] = useState<RealHackathon[]>([]);
  const [realTeams, setRealTeams] = useState<RealTeam[]>([]);

  const [activeTab, setActiveTab] = useState<"match" | "hackathons" | "workspace">("match");

  const openModal = () => {
    setConsentChecked(false);
    setShowAuthModal(true);
  };

  const closeModal = () => {
    setConsentChecked(false);
    setShowAuthModal(false);
  };

  useEffect(() => {
    async function loadRealData() {
      try {
        // 1. Check if user is already logged in
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          setEmail(user.email ?? null);
          const { data } = await supabase
            .from("profiles")
            .select("onboarding_completed")
            .eq("id", user.id)
            .single();

          if (data?.onboarding_completed) {
            const requestedPath = new URLSearchParams(window.location.search).get("next");
            const safePath =
              requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
                ? requestedPath
                : "/dashboard";
            router.push(safePath);
            return;
          }
        }

        // 2. Fetch showcase data via API route (uses service role key, bypasses RLS)
        const res = await fetch("/api/public-showcase");
        if (!res.ok) throw new Error("Failed to fetch showcase data");
        const data = await res.json();

        if (data.userCount > 0) setUserCount(data.userCount);
        if (data.hackathonCount > 0) setHackathonCount(data.hackathonCount);
        if (data.teamCount > 0) setTeamCount(data.teamCount);
        if (data.builders?.length > 0) setRealBuilders(data.builders);
        if (data.hackathons?.length > 0) setRealHackathons(data.hackathons);
        if (data.teams?.length > 0) setRealTeams(data.teams);
      } catch (err) {
        console.error("Error loading real data for landing page:", err);
      } finally {
        setLoading(false);
      }
    }

    loadRealData();
  }, [router]);

  async function signInWithGoogle() {
    const requestedPath = new URLSearchParams(window.location.search).get("next");
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//")) {
      callbackUrl.searchParams.set("next", requestedPath);
    }
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
  }

  async function signInWithGithub() {
    const requestedPath = new URLSearchParams(window.location.search).get("next");
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//")) {
      callbackUrl.searchParams.set("next", requestedPath);
    }
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: callbackUrl.toString() },
    });
  }

  if (loading && email) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#09090b] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-lg text-[#B4F461] animate-pulse">
            H
          </div>
          <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest">Loading workspace...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-[#09090b] text-white selection:bg-[#B4F461] selection:text-black overflow-x-hidden">
      <h1 className="sr-only">HackerMate - Hackathon Team Operating System</h1>

      {/* Ambient Glow — hidden on mobile to avoid overflow */}
      <div className="hidden sm:block absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] pointer-events-none z-0">
        <div className="absolute top-4 left-1/4 w-[350px] h-[350px] bg-[#B4F461]/10 rounded-full blur-[140px]" />
        <div className="absolute top-20 right-1/4 w-[400px] h-[400px] bg-zinc-800/30 rounded-full blur-[150px]" />
      </div>

      {/* ─── Hero ─── */}
      <section className="relative z-10 w-full max-w-3xl mx-auto px-4 sm:px-6 pt-14 pb-10 text-center">
        <div className="space-y-5">

          {/* Badge */}
          <div className="inline-flex flex-wrap items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B4F461] shrink-0" />
            <span className="font-medium">For hackathon builders</span>
            <span className="text-zinc-600 hidden sm:inline">•</span>
            <span className="text-zinc-400 font-mono text-[11px] hidden sm:inline">{userCount}+ Builders &amp; {hackathonCount}+ Live Events</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
            Find your team. <br />
            Build something great.
          </h1>

          {/* Subtext */}
          <p className="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto leading-relaxed px-2">
            HackerMate connects engineering college students by skill, matches you with teammates for live hackathons, and manages your workspace from ideation to submission.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-1 w-full max-w-xs sm:max-w-sm mx-auto">
            <button
              onClick={openModal}
              className="w-full px-6 py-3 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg"
            >
              <span>Join HackerMate</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
            <a
              href="#demo"
              className="w-full px-5 py-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-white font-medium text-sm transition-all flex items-center justify-center gap-2"
            >
              <span>Platform Demo</span>
              <span className="text-zinc-500">↓</span>
            </a>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-6 sm:gap-8 pt-5 border-t border-zinc-900 max-w-xs mx-auto">
            <div className="text-center">
              <div className="text-xl font-bold font-mono text-white">{userCount}+</div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono">Builders</div>
            </div>
            <div className="h-7 w-[1px] bg-zinc-800" />
            <div className="text-center">
              <div className="text-xl font-bold font-mono text-[#B4F461]">{hackathonCount}+</div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono">Hackathons</div>
            </div>
            <div className="h-7 w-[1px] bg-zinc-800" />
            <div className="text-center">
              <div className="text-xl font-bold font-mono text-zinc-300">{teamCount}</div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono">Teams</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Live Demo Section ─── */}
      <section id="demo" className="w-full border-t border-zinc-900 bg-zinc-950/60 py-10 sm:py-12">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-6">
            <span className="text-[10px] font-bold tracking-widest text-[#B4F461] uppercase bg-[#B4F461]/10 px-3 py-1 rounded-lg border border-[#B4F461]/20">
              Live Database Feed
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-3 mb-1 tracking-tight">
              Real builders, hackathons &amp; teams
            </h2>
            <p className="text-xs text-zinc-400 max-w-xs sm:max-w-sm mx-auto">
              Real registered engineering students and active hackathons on HackerMate.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950 shadow-2xl overflow-hidden">
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-900">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 shrink-0" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 shrink-0" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 shrink-0" />
              <span className="ml-1 text-[10px] font-mono text-zinc-600 truncate">hackermate.com</span>
            </div>

            {/* Tab bar — wraps on mobile */}
            <div className="flex flex-wrap items-center gap-1 px-4 py-3 border-b border-zinc-900 bg-zinc-950">
              {(
                [
                  {
                    key: "match",
                    label: "Builders",
                    count: realBuilders.length || userCount,
                    icon: (
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    ),
                  },
                  {
                    key: "hackathons",
                    label: "Hackathons",
                    count: realHackathons.length || hackathonCount,
                    icon: (
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2 0h4m11-16v4m2-2h-4m2 14v4m-2 0h4M12 3v8m-4 0h8m-8 4h8m-4 0v4m-2 0h4" />
                      </svg>
                    ),
                  },
                  {
                    key: "workspace",
                    label: "Teams",
                    count: realTeams.length || teamCount,
                    icon: (
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    ),
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 text-xs rounded-xl font-medium transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                    activeTab === tab.key
                      ? "bg-[#B4F461]/15 text-[#B4F461] border border-[#B4F461]/30"
                      : "text-zinc-400 hover:text-white border border-transparent"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span> <span className="opacity-60">({tab.count})</span>
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-4 sm:p-5">

              {/* Builders Tab */}
              {activeTab === "match" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {realBuilders.length > 0 ? (
                    realBuilders.slice(0, 6).map((b) => (
                      <div key={b.id} className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700 transition-colors">
                        <div className="flex items-center gap-2.5 mb-2">
                          {b.avatar_url ? (
                            <img
                              src={b.avatar_url}
                              alt={b.full_name || "Builder"}
                              className="w-8 h-8 rounded-full border border-zinc-800 object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-800 text-[#B4F461] flex items-center justify-center font-bold text-xs border border-zinc-700 shrink-0">
                              {(b.full_name || "B")[0].toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-white truncate">{b.full_name || "Builder"}</h4>
                            <p className="text-[10px] text-zinc-400 font-mono truncate flex items-center gap-1">
                              <svg className="w-3 h-3 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0112 20.055a11.952 11.952 0 01-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                              </svg>
                              <span className="truncate">{b.college || "Engineering College"}</span>
                            </p>
                          </div>
                        </div>
                        <p className="text-[11px] text-zinc-400 mb-2 line-clamp-2 leading-relaxed">
                          {b.bio || "Building projects for upcoming hackathons."}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(b.skills && b.skills.length > 0 ? b.skills : ["Full Stack"]).slice(0, 3).map((s) => (
                            <span key={s} className="text-[9px] font-mono px-1.5 py-0.5 rounded-lg bg-zinc-950 text-zinc-300 border border-zinc-800">
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
                      <div key={h.id} className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-300 whitespace-nowrap">
                            {h.mode || "Online"}{h.location ? ` • ${h.location}` : ""}
                          </span>
                          <span className="text-[11px] font-mono font-semibold text-[#B4F461] whitespace-nowrap">
                            {h.prize_pool || "Prize Pool"}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-white mb-2 line-clamp-2 leading-snug">{h.name}</h4>
                        <div className="flex flex-wrap gap-1">
                          {(h.tags && h.tags.length > 0 ? h.tags : ["Hackathon"]).slice(0, 3).map((t) => (
                            <span key={t} className="text-[9px] font-mono px-2 py-0.5 rounded-lg bg-zinc-900 text-[#B4F461] border border-zinc-800">
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
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                    <div>
                      <h4 className="text-xs font-semibold text-white">Registered Team Workspaces</h4>
                      <p className="text-[10px] text-zinc-400 font-mono">{teamCount} active teams</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-[#B4F461]/10 text-[#B4F461] border border-[#B4F461]/20 whitespace-nowrap inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#B4F461] animate-pulse shrink-0" />
                      <span>Active</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {realTeams.length > 0 ? (
                      realTeams.map((t) => (
                        <div key={t.id} className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800">
                          <span className="text-[9px] font-mono text-[#B4F461] uppercase block truncate">
                            {t.team_hackathons?.[0]?.hackathons?.name || "Active Team"}
                          </span>
                          <p className="text-xs text-white font-medium mt-1 truncate">{t.name}</p>
                          <p className="text-[10px] text-zinc-500 mt-1 line-clamp-2">
                            {t.description || "Looking for teammates"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full text-center py-6 text-xs text-zinc-500">
                        Loading teams...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── College Network ─── */}
      <section id="colleges" className="w-full border-t border-zinc-900 bg-zinc-950 py-10 sm:py-12">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <span className="text-[10px] font-bold tracking-widest text-[#B4F461] uppercase bg-[#B4F461]/10 px-3 py-1 rounded-lg border border-[#B4F461]/20">
            College Network
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-3 mb-1 tracking-tight">
            Top engineering college builders
          </h2>
          <p className="text-xs text-zinc-400 max-w-xs mx-auto mb-6">
            Find teammates from premier institutes across India.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {[
              "IIT Bombay", "IIT Delhi", "IIT Madras", "IIT Kharagpur", "BITS Pilani",
              "DTU Delhi", "COEP Pune", "VJTI Mumbai", "NIT Trichy", "NIT Surathkal",
              "VIT Vellore", "SRM Chennai", "DJSCE Mumbai", "SPIT Mumbai", "PICT Pune"
            ].map((col) => (
              <span
                key={col}
                className="px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900/60 text-xs font-mono text-zinc-300 hover:border-[#B4F461]/40 hover:text-[#B4F461] transition-colors"
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Workflow ─── */}
      <section id="how-it-works" className="w-full border-t border-zinc-900 bg-zinc-950/60 py-10 sm:py-12">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <span className="text-[10px] font-bold tracking-widest text-[#B4F461] uppercase bg-[#B4F461]/10 px-3 py-1 rounded-lg border border-[#B4F461]/20">
              Workflow
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-3 mb-1 tracking-tight">
              Three steps to hackathon success
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { step: "01", title: "Build Your Profile", description: "Set up your bio, skills, college, and social links to build your profile." },
              { step: "02", title: "Find Compatible Teammates", description: "Browse builders by skill and filter by college to form your team." },
              { step: "03", title: "Coordinate & Build", description: "Manage tasks, track progress, and collaborate seamlessly in team workspaces." },
            ].map((item) => (
              <div key={item.step} className="p-5 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-[#B4F461]/30 transition-all">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono font-bold text-[#B4F461] mb-3">
                  {item.step}
                </div>
                <h3 className="text-sm font-semibold text-white mb-1.5">{item.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="w-full border-t border-zinc-900 bg-zinc-950 py-10 sm:py-12">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <span className="text-[10px] font-bold tracking-widest text-[#B4F461] uppercase bg-[#B4F461]/10 px-3 py-1 rounded-lg border border-[#B4F461]/20">
              Features
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-3 mb-1 tracking-tight">
              Built for Engineering Students
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { title: "Skill Match Engine", description: "Matches you with builders who have complementary technical skills." },
              { title: "College & Alumni Filter", description: "Filter builders from your college or connect across engineering institutions." },
              { title: "Direct Event CTAs", description: "Discover hackathons from Unstop & Devfolio and form teams directly." },
            ].map((f, i) => (
              <div key={i} className="p-5 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-[#B4F461]/30 transition-all">
                <div className="w-8 h-8 rounded-lg bg-[#B4F461]/10 border border-[#B4F461]/20 text-[#B4F461] flex items-center justify-center font-bold text-xs mb-3">
                  0{i + 1}
                </div>
                <h3 className="text-sm font-semibold text-white mb-1.5">{f.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="w-full border-t border-zinc-900 bg-[radial-gradient(ellipse_at_bottom,rgba(180,244,97,0.04),transparent_70%)] py-14 px-4 sm:px-6 text-center">
        <div className="max-w-xl mx-auto space-y-4">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Ready to find your hackathon team?
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
            Join {userCount}+ verified engineering college builders. Form teams, build projects, and submit with confidence.
          </p>
          <button
            onClick={openModal}
            className="px-8 py-3.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-sm shadow-lg transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <span>Join HackerMate</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </section>

      <Footer />

      {/* ─── Auth Modal ─── */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-950 p-6 relative shadow-2xl">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              ✕
            </button>

            <div className="text-center mb-6">
              <div className="flex justify-center mb-3">
                <Logo className="h-8 text-[#B4F461]" />
              </div>
              <h3 className="text-lg font-semibold text-white">Join HackerMate</h3>
              <p className="text-xs text-zinc-400 mt-1">Find your team and start building.</p>
            </div>

            <div className="mb-5 p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-zinc-800 bg-zinc-950 text-[#B4F461] focus:ring-[#B4F461] cursor-pointer shrink-0"
                />
                <span className="text-[11px] text-zinc-400 leading-relaxed">
                  I confirm that I am 18 years or older, and I agree to the{" "}
                  <Link href="/terms" target="_blank" className="text-[#B4F461] hover:underline">Terms of Service</Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" className="text-[#B4F461] hover:underline">Privacy Policy</Link>.
                </span>
              </label>
            </div>

            <div className="space-y-3">
              <button
                disabled={!consentChecked}
                onClick={signInWithGoogle}
                className={`w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-100 text-black font-semibold text-sm transition-all cursor-pointer ${
                  !consentChecked ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                Continue with Google
              </button>
              <button
                disabled={!consentChecked}
                onClick={signInWithGithub}
                className={`w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-semibold text-sm transition-all cursor-pointer ${
                  !consentChecked ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                Continue with GitHub
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}