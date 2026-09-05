"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Trophy,
  Layers,
  Cpu,
  Clock,
  ArrowRight,
  CheckCircle2,
  Filter,
  FileText,
  Flame,
  Award,
  Zap,
} from "lucide-react";
import { ChallengeLeaderboard } from "@/components/challenges/ChallengeLeaderboard";

interface Challenge {
  id: string;
  challenge_number: number;
  title: string;
  slug: string;
  track: string;
  difficulty: string;
  summary: string;
  status: "active" | "closed" | "draft";
  starts_at: string;
  ends_at: string;
}

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrack, setSelectedTrack] = useState<string>("all");
  const [rulesTab, setRulesTab] = useState<"rubric" | "checklist" | "deductions">("rubric");

  useEffect(() => {
    async function loadChallenges() {
      try {
        const res = await fetch("/api/challenges");
        if (res.ok) {
          const data = await res.json();
          setChallenges(data.challenges || []);
        }
      } catch (err) {
        console.error("Failed to load challenges:", err);
      } finally {
        setLoading(false);
      }
    }
    loadChallenges();
  }, []);

  const isChallengeActive = (c: Challenge) => {
    return c.status === "active" && new Date(c.ends_at).getTime() > Date.now();
  };

  const activeChallenge = challenges.find((c) => isChallengeActive(c)) || challenges[0];
  const isActive = activeChallenge ? isChallengeActive(activeChallenge) : false;
  const pastChallenges = challenges.filter((c) => c.id !== activeChallenge?.id);

  const tracks = ["all", "Full-Stack / AI", "FinTech", "Cloud & Systems", "Open"];

  const filteredPast = selectedTrack === "all"
    ? pastChallenges
    : pastChallenges.filter((c) => c.track.toLowerCase().includes(selectedTrack.toLowerCase()));

  const getDaysRemaining = (endsAt: string) => {
    const diff = new Date(endsAt).getTime() - new Date().getTime();
    if (diff <= 0) return "Closed";
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return `${days} day${days > 1 ? "s" : ""} left`;
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Hero Header */}
      <div className="relative mb-10 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-zinc-50 via-white to-zinc-100/60 dark:from-zinc-900/60 dark:via-zinc-950/80 dark:to-zinc-950 p-8 sm:p-12 shadow-xs">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-96 h-96 bg-lime-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-500/10 border border-lime-500/30 text-lime-700 dark:text-lime-400 text-xs font-mono mb-4 font-semibold">
            <Flame className="w-3.5 h-3.5" />
            <span>BIWEEKLY SYSTEM DESIGN & PITCH DECK CHALLENGES</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-zinc-900 dark:text-white tracking-tight leading-tight">
            Sharpen Your Architecture & Pitch Decks
          </h1>
          <p className="mt-4 text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Practice against real-world problem statements solo or with your team. Submit a standardized 6-slide blueprint, receive instant slide-by-slide AI jury diagnostics, and iterate to perfection before hackathon deadline day.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-zinc-600 dark:text-zinc-400">
            <div className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-4 h-4 text-lime-600 dark:text-lime-400" />
              <span>Standard 6-Slide Template</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium">
              <Cpu className="w-4 h-4 text-lime-600 dark:text-lime-400" />
              <span>Multi-Model AI Jury Feedback</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium">
              <Award className="w-4 h-4 text-lime-600 dark:text-lime-400" />
              <span>Solo or Team Submissions</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Challenge Spotlight */}
      {loading ? (
        <div className="card p-12 text-center border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/40">
          <div className="inline-block animate-spin w-8 h-8 border-2 border-lime-500 border-t-transparent rounded-full mb-3" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading Practice Challenges...</p>
        </div>
      ) : activeChallenge ? (
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-lime-600 dark:text-lime-400" />
              <span>{isActive ? "Active Challenge" : "Spotlight Challenge"}</span>
            </h2>
            <span className={`text-xs font-mono flex items-center gap-1.5 ${isActive ? "text-lime-600 dark:text-lime-400" : "text-zinc-500 dark:text-zinc-400"}`}>
              <Clock className="w-3.5 h-3.5" />
              {getDaysRemaining(activeChallenge.ends_at)}
            </span>
          </div>

          <div className="card group relative overflow-hidden p-6 sm:p-8 border-lime-500/40 dark:border-lime-500/30 hover:border-lime-500 bg-white dark:bg-zinc-950/80 transition-all duration-300 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-3 max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-lime-500/15 text-lime-700 dark:text-lime-400 border border-lime-500/30">
                    Challenge #{activeChallenge.challenge_number}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800">
                    {activeChallenge.track}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800">
                    {activeChallenge.difficulty}
                  </span>
                  {!isActive && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">
                      Closed
                    </span>
                  )}
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white group-hover:text-lime-600 dark:group-hover:text-lime-300 transition-colors">
                  {activeChallenge.title}
                </h3>

                <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                  {activeChallenge.summary || "Review the briefing, build your 6-slide architecture pitch deck, and get instant AI scoring."}
                </p>
              </div>

              <div className="shrink-0 flex items-center">
                <Link
                  href={`/challenges/${activeChallenge.slug}`}
                  className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
                    isActive
                      ? "bg-lime-500 hover:bg-lime-400 text-black shadow-lg shadow-lime-500/20 hover:scale-[1.02]"
                      : "bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 shadow-xs"
                  }`}
                >
                  <span>{isActive ? "Submit Solution" : "View Challenge Briefing"}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Feature Pillar Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
        <div className="card p-6 border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/40 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-600 dark:text-violet-400 mb-4">
            <Layers className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-zinc-900 dark:text-white mb-1.5">Standardized 6-Slide Format</h4>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Follow the blueprint: Problem Framing, Solution Moat, Technical Architecture, Risk Mitigation, Impact Baseline, and Sprint Roadmap.
          </p>
        </div>

        <div className="card p-6 border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/40 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-lime-500/10 border border-lime-500/20 flex items-center justify-center text-lime-600 dark:text-lime-400 mb-4">
            <Cpu className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-zinc-900 dark:text-white mb-1.5">Instant Jury Diagnostic</h4>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Receive slide-by-slide feedback, score deductions, and actionable recommendations generated by our multi-model AI evaluation engine.
          </p>
        </div>

        <div className="card p-6 border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/40 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400 mb-4">
            <Trophy className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-zinc-900 dark:text-white mb-1.5">Iterate & Resubmit</h4>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Revise your presentation based on AI feedback and resubmit to track your score progression across versions.
          </p>
        </div>
      </div>

      {/* Embedded Official AI Scoring Rules & 100/100 Guide */}
      <div className="card p-6 sm:p-8 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/90 shadow-sm mb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-lime-500/15 border border-lime-500/30 flex items-center justify-center text-lime-600 dark:text-lime-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <span>AI Jury Scoring Rules & How to Score 100/100</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-lime-500/15 text-lime-700 dark:text-lime-400 font-mono font-bold">100 Pts</span>
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">Master these explicit guidelines to guarantee a 100/100 (Mastery 🏆) rating from the AI evaluator.</p>
            </div>
          </div>

          {/* Tabs Switcher */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shrink-0">
            <button
              type="button"
              onClick={() => setRulesTab("rubric")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                rulesTab === "rubric"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              🎯 4 Core Pillars
            </button>
            <button
              type="button"
              onClick={() => setRulesTab("checklist")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                rulesTab === "checklist"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              📋 6-Slide Checklist
            </button>
            <button
              type="button"
              onClick={() => setRulesTab("deductions")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                rulesTab === "deductions"
                  ? "bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              ⚠️ Deduction Triggers
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="pt-6 text-xs">
          {rulesTab === "rubric" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Pillar 1 */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-lime-500/20 text-lime-600 dark:text-lime-400 text-[11px] font-mono flex items-center justify-center font-bold">1</span>
                    <span>Problem Framing & Target Personas (Slide 1)</span>
                  </h4>
                  <span className="text-lime-600 dark:text-lime-400 font-mono font-bold text-xs">25 Pts Max</span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                  The AI tests for root-cause understanding rather than generic symptom statements.
                </p>
                <div className="space-y-2 pt-1">
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                    <span className="font-bold block mb-1">✅ How to Score Full 25/25:</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                      <li>Name 2+ specific user personas with domain roles.</li>
                      <li>Include quantified baseline metrics (e.g., "$120k/yr loss", "45 min delay").</li>
                      <li>Highlight the real cost of inaction.</li>
                    </ul>
                  </div>
                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-[11px]">
                    <span className="font-bold">❌ Common Penalty (-5 to -8 pts):</span> Vague statements with no personas or baseline metrics.
                  </div>
                </div>
              </div>

              {/* Pillar 2 */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-lime-500/20 text-lime-600 dark:text-lime-400 text-[11px] font-mono flex items-center justify-center font-bold">2</span>
                    <span>Solution Design & Innovation Moat (Slide 2)</span>
                  </h4>
                  <span className="text-lime-600 dark:text-lime-400 font-mono font-bold text-xs">25 Pts Max</span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                  The AI rewards unique defensive moats over thin wrappers around generic APIs.
                </p>
                <div className="space-y-2 pt-1">
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                    <span className="font-bold block mb-1">✅ How to Score Full 25/25:</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                      <li>Detail an architectural moat (custom rule engine, offline cache, edge models).</li>
                      <li>Show why existing market tools fail and how yours overcomes them.</li>
                      <li>Walk through step-by-step user resolution.</li>
                    </ul>
                  </div>
                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-[11px]">
                    <span className="font-bold">❌ Common Penalty (-5 to -8 pts):</span> Superficial ChatGPT wrapper app without proprietary logic.
                  </div>
                </div>
              </div>

              {/* Pillar 3 */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-lime-500/40 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-lime-500/20 text-lime-600 dark:text-lime-400 text-[11px] font-mono flex items-center justify-center font-bold">3</span>
                    <span>Technical Architecture & Data Pipeline (Slide 3 - Highest Weight!)</span>
                  </h4>
                  <span className="text-lime-600 dark:text-lime-400 font-mono font-bold text-xs">30 Pts Max</span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                  The AI requires an unbroken end-to-end data pipeline flowchart and architecture.
                </p>
                <div className="space-y-2 pt-1">
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                    <span className="font-bold block mb-1">✅ How to Score Full 30/30:</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                      <li>Explicit data pipeline: Ingestion → Worker/Queue → Storage → Client.</li>
                      <li>Database choices, latency budgets, and security/auth layers.</li>
                      <li>Clear architecture block diagram flowchart.</li>
                    </ul>
                  </div>
                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-[11px]">
                    <span className="font-bold">❌ Common Penalty (-7 to -12 pts):</span> Merely listing logos ("React, Node, AI") without pipeline flow.
                  </div>
                </div>
              </div>

              {/* Pillar 4 */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-lime-500/20 text-lime-600 dark:text-lime-400 text-[11px] font-mono flex items-center justify-center font-bold">4</span>
                    <span>Feasibility, Edge Cases & Roadmap (Slides 4, 5, 6)</span>
                  </h4>
                  <span className="text-lime-600 dark:text-lime-400 font-mono font-bold text-xs">20 Pts Max</span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                  The AI evaluates real-world system resilience, quantified ROI, and sprint readiness.
                </p>
                <div className="space-y-2 pt-1">
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                    <span className="font-bold block mb-1">✅ How to Score Full 20/20:</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                      <li>Address 3+ concrete edge cases with mitigation in Slide 4.</li>
                      <li>Include baseline vs projected ROI metrics in Slide 5.</li>
                      <li>Sprint milestones with explicit team roles in Slide 6.</li>
                    </ul>
                  </div>
                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-[11px]">
                    <span className="font-bold">❌ Common Penalty (-4 to -7 pts):</span> Omitting failure modes or vague "launching soon" roadmaps.
                  </div>
                </div>
              </div>
            </div>
          )}

          {rulesTab === "checklist" && (
            <div className="space-y-2.5">
              {[
                { slide: "Slide 1", title: "Problem Framing & Personas", check: "2+ Target Personas defined with quantified baseline friction metrics." },
                { slide: "Slide 2", title: "Proposed Solution & Value Moat", check: "Clear architectural value moat beyond existing commercial tools." },
                { slide: "Slide 3", title: "Technical Architecture & Pipeline", check: "End-to-end data flow: Client Ingestion → Backend Worker → DB → Client." },
                { slide: "Slide 4", title: "Feasibility & Risk Mitigation", check: "3+ Edge cases addressed (rate limits, offline mode, fallback behaviors)." },
                { slide: "Slide 5", title: "Impact & Quantified ROI", check: "Quantified baseline vs post-implementation target metrics." },
                { slide: "Slide 6", title: "Execution Roadmap & Team Roles", check: "Sprint milestones with explicit owner roles and deliverables." },
              ].map((item, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-lime-500/20 text-lime-600 dark:text-lime-400 flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold">
                    ✓
                  </div>
                  <div>
                    <span className="text-zinc-900 dark:text-white font-bold text-xs">{item.slide}: {item.title}</span>
                    <p className="text-zinc-600 dark:text-zinc-400 text-[11px] mt-0.5">{item.check}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {rulesTab === "deductions" && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                <div className="px-2 py-1 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 font-mono font-bold text-xs shrink-0">
                  -7 to -12 Pts
                </div>
                <div>
                  <div className="text-rose-700 dark:text-rose-300 font-bold text-xs">Missing End-to-End Data Pipeline (Slide 3)</div>
                  <p className="text-zinc-600 dark:text-zinc-400 text-[11px] mt-0.5">Occurs when tech stack is merely a list of logos without an explicit data flow architecture.</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                <div className="px-2 py-1 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 font-mono font-bold text-xs shrink-0">
                  -5 to -8 Pts
                </div>
                <div>
                  <div className="text-rose-700 dark:text-rose-300 font-bold text-xs">No Innovation Moat / Generic API Wrapper (Slide 2)</div>
                  <p className="text-zinc-600 dark:text-zinc-400 text-[11px] mt-0.5">Occurs when the solution is a thin layer over ChatGPT without proprietary domain logic.</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                <div className="px-2 py-1 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 font-mono font-bold text-xs shrink-0">
                  -5 to -8 Pts
                </div>
                <div>
                  <div className="text-rose-700 dark:text-rose-300 font-bold text-xs">Generic Problem Statement (Slide 1)</div>
                  <p className="text-zinc-600 dark:text-zinc-400 text-[11px] mt-0.5">Occurs when problem lacks specific target user personas and baseline friction numbers.</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                <div className="px-2 py-1 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 font-mono font-bold text-xs shrink-0">
                  -4 to -7 Pts
                </div>
                <div>
                  <div className="text-rose-700 dark:text-rose-300 font-bold text-xs">Ignoring Edge Cases & Fail-Safes (Slide 4)</div>
                  <p className="text-zinc-600 dark:text-zinc-400 text-[11px] mt-0.5">Occurs when failure scenarios (network offline, API timeout, bad input) have no mitigation.</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                <div className="px-2 py-1 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 font-mono font-bold text-xs shrink-0">
                  -3 to -5 Pts
                </div>
                <div>
                  <div className="text-rose-700 dark:text-rose-300 font-bold text-xs">Missing Metrics / Vague Roadmap (Slides 5 & 6)</div>
                  <p className="text-zinc-600 dark:text-zinc-400 text-[11px] mt-0.5">Occurs when impact metrics have no baseline comparison or roadmap has no role ownership.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Weekly Leaderboard & Hall of Fame */}
      <div className="mb-12">
        <ChallengeLeaderboard
          title="🏆 Weekly Practice Hall of Fame"
          subtitle="Top scoring pitch presentations & technical architectures across all challenges."
        />
      </div>

      {/* Past Challenges Section */}
      {pastChallenges.length > 0 && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Challenge Archive</h3>
              <p className="text-xs text-zinc-500">Explore past problem statements and practice at your own pace.</p>
            </div>

            {/* Track Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {tracks.map((track) => (
                <button
                  key={track}
                  onClick={() => setSelectedTrack(track)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                    selectedTrack === track
                      ? "bg-zinc-900 dark:bg-zinc-800 text-white border border-zinc-700"
                      : "bg-zinc-100 dark:bg-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-900"
                  }`}
                >
                  {track}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPast.map((challenge) => (
              <Link
                key={challenge.id}
                href={`/challenges/${challenge.slug}`}
                className="card p-5 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950/60 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-all group shadow-xs"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 font-semibold">
                      #{challenge.challenge_number}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
                      {challenge.track}
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-500 capitalize">{challenge.status}</span>
                </div>

                <h4 className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-lime-600 dark:group-hover:text-lime-400 transition-colors mb-2">
                  {challenge.title}
                </h4>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                  {challenge.summary || "View challenge problem statement and evaluation rubric."}
                </p>

                <div className="mt-4 flex items-center justify-end text-xs font-medium text-lime-600 dark:text-lime-400 group-hover:translate-x-1 transition-transform">
                  <span>View Challenge →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
