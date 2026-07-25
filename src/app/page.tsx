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

  // Real Database Data States
  const [userCount, setUserCount] = useState<number>(104);
  const [hackathonCount, setHackathonCount] = useState<number>(127);
  const [teamCount, setTeamCount] = useState<number>(3);

  const [realBuilders, setRealBuilders] = useState<RealProfile[]>([]);
  const [realHackathons, setRealHackathons] = useState<RealHackathon[]>([]);
  const [realTeams, setRealTeams] = useState<RealTeam[]>([]);

  // Interactive showcase tab state
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

      {/* Top Floating Glow Ambient Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] pointer-events-none z-0">
        <div className="absolute top-4 left-1/4 w-[350px] h-[350px] bg-[#B4F461]/10 rounded-full blur-[140px]" />
        <div className="absolute top-20 right-1/4 w-[400px] h-[400px] bg-zinc-800/30 rounded-full blur-[150px]" />
      </div>

      {/* Hero Section */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-16 pb-12 text-center">
        <div className="space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B4F461]" />
            <span className="font-sans font-medium text-zinc-300">For hackathon builders</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400 font-mono text-[11px]">{userCount}+ Builders & {hackathonCount}+ Live Events</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1] max-w-4xl mx-auto">
            Find your team. <br />
            <span className="text-white">
              Build something great.
            </span>
          </h1>

          <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            HackerMate is the hackathon team-formation and during-hackathon task/project OS for engineering college students. Connect with compatible teammates, track tasks, and collaborate from start to submission.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 max-w-md mx-auto">
            <button
              onClick={openModal}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-white/10"
            >
              <span>Join HackerMate</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>

            <a
              href="#demo"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-white font-medium text-xs transition-all flex items-center justify-center gap-2"
            >
              <span>Explore Platform Demo</span>
              <span className="text-zinc-500">↓</span>
            </a>
          </div>

          {/* Quick Proof Stat Bar */}
          <div className="flex items-center justify-center gap-8 pt-6 border-t border-zinc-900 max-w-md mx-auto">
            <div>
              <div className="text-xl font-bold font-mono text-white">{userCount}+</div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono">Verified Builders</div>
            </div>
            <div className="h-8 w-[1px] bg-zinc-800" />
            <div>
              <div className="text-xl font-bold font-mono text-[#B4F461]">{hackathonCount}+</div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono">Live Hackathons</div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Platform Demo Section with REAL Database Data */}
      <section id="demo" className="w-full border-t border-zinc-900 bg-zinc-950/60 py-12 relative">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-8">
            <span className="text-[10px] font-bold tracking-widest text-[#B4F461] uppercase bg-[#B4F461]/10 px-3 py-1 rounded-full border border-[#B4F461]/20">
              Live Database Feed
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-3 mb-2 tracking-tight">
              See real builders, hackathons & teams
            </h2>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Real registered engineering students and active hackathons on HackerMate.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4 md:p-6 shadow-2xl backdrop-blur-xl">
            {/* Window Bar Controls */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-900 mb-6">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-xs font-mono text-zinc-500">hackermate.com/workspace</span>
              </div>

              {/* Showcase Tabs */}
              <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setActiveTab("match")}
                  className={`px-3 py-1 text-xs rounded font-medium transition-all cursor-pointer ${
                    activeTab === "match"
                      ? "bg-[#B4F461]/15 text-[#B4F461] border border-[#B4F461]/30 font-semibold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  🤝 Builders ({realBuilders.length || userCount})
                </button>
                <button
                  onClick={() => setActiveTab("hackathons")}
                  className={`px-3 py-1 text-xs rounded font-medium transition-all cursor-pointer ${
                    activeTab === "hackathons"
                      ? "bg-[#B4F461]/15 text-[#B4F461] border border-[#B4F461]/30 font-semibold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  🏆 Hackathons ({realHackathons.length || hackathonCount})
                </button>
                <button
                  onClick={() => setActiveTab("workspace")}
                  className={`px-3 py-1 text-xs rounded font-medium transition-all cursor-pointer ${
                    activeTab === "workspace"
                      ? "bg-[#B4F461]/15 text-[#B4F461] border border-[#B4F461]/30 font-semibold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  ⚡ Active Teams ({realTeams.length || teamCount})
                </button>
              </div>
            </div>

            {/* Tab 1: Real Builders */}
            {activeTab === "match" && (
              <div className="grid sm:grid-cols-3 gap-4 text-left animate-fade-in">
                {realBuilders.length > 0 ? (
                  realBuilders.slice(0, 6).map((b) => (
                    <div key={b.id} className="card card-static p-4 border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700 transition-colors">
                      <div className="flex items-center gap-3 mb-2">
                        {b.avatar_url ? (
                          <img
                            src={b.avatar_url}
                            alt={b.full_name || "Builder"}
                            className="w-8 h-8 rounded-full border border-zinc-800 object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-zinc-800 text-[#B4F461] flex items-center justify-center font-bold text-xs border border-zinc-700">
                            {(b.full_name || "B")[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h4 className="text-xs font-semibold text-white">{b.full_name || "Anonymous Builder"}</h4>
                          <p className="text-[10px] text-zinc-400 font-mono">🏫 {b.college || "Engineering College"}</p>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-400 mb-3 line-clamp-2">
                        {b.bio || "Full-stack developer building projects for upcoming hackathons."}
                      </p>

                      <div className="flex flex-wrap gap-1">
                        {(b.skills && b.skills.length > 0 ? b.skills : ["React", "Python", "Full Stack"]).slice(0, 3).map((s) => (
                          <span key={s} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-950 text-zinc-300 border border-zinc-800">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-3 text-center py-6 text-xs text-zinc-500">
                    Loading real builder profiles from database...
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Real Hackathons */}
            {activeTab === "hackathons" && (
              <div className="grid sm:grid-cols-2 gap-4 text-left animate-fade-in">
                {realHackathons.length > 0 ? (
                  realHackathons.map((h) => (
                    <div key={h.id} className="card card-static p-4 border-zinc-800/80 bg-zinc-900/40">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {h.mode || "Online"} {h.location ? `• ${h.location}` : ""}
                        </span>
                        <span className="text-xs font-mono font-semibold text-[#B4F461]">
                          {h.prize_pool || "Prize Pool Available"}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-white mb-2 line-clamp-1">{h.name}</h4>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(h.tags && h.tags.length > 0 ? h.tags : ["Hackathon", "Coding", "Engineering"]).slice(0, 3).map((t) => (
                          <span key={t} className="text-[9px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-[#B4F461] border border-zinc-800">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 text-center py-6 text-xs text-zinc-500">
                    Loading live hackathons from database...
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Real Teams */}
            {activeTab === "workspace" && (
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 text-left animate-fade-in space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <div>
                    <h4 className="text-xs font-semibold text-white">Registered Teams Workspaces</h4>
                    <p className="text-[10px] text-zinc-400 font-mono">{teamCount} Active Teams Created</p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#B4F461]/10 text-[#B4F461] border border-[#B4F461]/20">
                    🟢 Active Teams
                  </span>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  {realTeams.length > 0 ? (
                    realTeams.map((t) => (
                      <div key={t.id} className="p-3 rounded bg-zinc-950 border border-zinc-800">
                        <span className="text-[9px] font-mono text-[#B4F461] uppercase">
                          {t.team_hackathons?.[0]?.hackathons?.name || "Active Team"}
                        </span>
                        <p className="text-xs text-white font-medium mt-1 truncate">{t.name}</p>
                        <p className="text-[10px] text-zinc-500 mt-1 line-clamp-1">
                          {t.description || "Looking for teammates"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-3 text-center py-4 text-xs text-zinc-500">
                      Loading registered teams from database...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* College Network Section */}
      <section id="colleges" className="w-full border-t border-zinc-900 bg-zinc-950 py-12">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <span className="text-[10px] font-bold tracking-widest text-[#B4F461] uppercase bg-[#B4F461]/10 px-3 py-1 rounded-full border border-[#B4F461]/20">
            College Network
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-3 mb-2 tracking-tight">
            Connect with top engineering college builders
          </h2>
          <p className="text-xs text-zinc-400 max-w-md mx-auto mb-6">
            Find teammates from premier institutes across India.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 max-w-4xl mx-auto">
            {[
              "IIT Bombay", "IIT Delhi", "IIT Madras", "IIT Kharagpur", "BITS Pilani",
              "DTU Delhi", "COEP Pune", "VJTI Mumbai", "NIT Trichy", "NIT Surathkal",
              "VIT Vellore", "SRM Chennai", "DJSCE Mumbai", "SPIT Mumbai", "PICT Pune"
            ].map((col) => (
              <span
                key={col}
                className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-xs font-mono text-zinc-300 hover:border-[#B4F461]/40 hover:text-[#B4F461] transition-colors"
              >
                🏫 {col}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="how-it-works" className="w-full border-t border-zinc-900 bg-zinc-950/60 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-8">
            <span className="text-[10px] font-bold tracking-widest text-[#B4F461] uppercase bg-[#B4F461]/10 px-3 py-1 rounded-full border border-[#B4F461]/20">
              Workflow
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-3 mb-2 tracking-tight">
              Three steps to hackathon success
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                title: "Auto-fill Builder Profile",
                description: "Connect GitHub to import bio, avatar, and top language skills in 15 seconds.",
              },
              {
                step: "02",
                title: "Find Compatible Teammates",
                description: "Browse builders by skill requirements and filter by college to form your team.",
              },
              {
                step: "03",
                title: "Coordinate & Build",
                description: "Manage tasks, track progress, and communicate seamlessly in team workspaces.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 hover:border-[#B4F461]/30 transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono font-bold text-[#B4F461] mb-4">
                  {item.step}
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid Section */}
      <section id="features" className="w-full border-t border-zinc-900 bg-zinc-950 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-8">
            <span className="text-[10px] font-bold tracking-widest text-[#B4F461] uppercase bg-[#B4F461]/10 px-3 py-1 rounded-full border border-[#B4F461]/20">
              Features
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-3 mb-2 tracking-tight">
              Built for Engineering Students
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Skill Match Engine",
                description: "Scoring matches you with builders possessing complementary technical skills.",
              },
              {
                title: "College & Alumni Filter",
                description: "Filter builders from your college or connect across engineering institutions.",
              },
              {
                title: "Direct Event CTAs",
                description: "Discover upcoming hackathons from Unstop & Devfolio, and form teams directly for each event.",
              },
            ].map((f, i) => (
              <div key={i} className="card card-static p-6 border-zinc-800 bg-zinc-900/40 hover:border-[#B4F461]/30 transition-all">
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

      {/* Final Call To Action */}
      <section className="w-full border-t border-zinc-900 bg-[radial-gradient(ellipse_at_bottom,rgba(180,244,97,0.04),transparent_70%)] py-16 px-6 text-center relative overflow-hidden">
        <div className="max-w-3xl mx-auto space-y-4 relative z-10">
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
            Ready to find your hackathon team?
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
            Join over 100+ verified engineering college builders. Form teams, build projects, and submit with confidence.
          </p>
          <button
            onClick={openModal}
            className="px-8 py-3.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-xs shadow-lg transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <span>Join HackerMate</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </section>

      {/* Footer */}
      <Footer />

      {/* DPDPA Consent Sign-In Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-md card card-static p-6 relative animate-scale-in border-zinc-800 bg-zinc-950">
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

            {/* Consent Box */}
            <div className="mb-6 p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-zinc-800 bg-zinc-950 text-[#B4F461] focus:ring-[#B4F461] cursor-pointer"
                />
                <span className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                  I confirm that I am 18 years or older, and I agree to the{" "}
                  <Link href="/terms" target="_blank" className="text-[#B4F461] hover:underline">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" className="text-[#B4F461] hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
            </div>

            {/* OAuth buttons */}
            <div className="space-y-3">
              <button
                disabled={!consentChecked}
                onClick={signInWithGoogle}
                className={`w-full inline-flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-100 text-black font-semibold text-xs transition-all cursor-pointer ${
                  !consentChecked ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <span>Continue with Google</span>
              </button>

              <button
                disabled={!consentChecked}
                onClick={signInWithGithub}
                className={`w-full inline-flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-semibold text-xs transition-all cursor-pointer ${
                  !consentChecked ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <span>Continue with GitHub</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}