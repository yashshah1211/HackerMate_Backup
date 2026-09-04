"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  JudgingTrackId,
  TRACK_PROFILES,
  ProjectEvaluationResult,
} from "@/lib/evaluator/evaluatorTypes";
import {
  Layers,
  Cpu,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Share2,
  Copy,
  Users,
  Terminal,
  ExternalLink,
  RefreshCw,
  Zap,
  Trophy,
  Check,
  Sparkles,
  History,
  Trash2,
  X,
  Clock,
} from "lucide-react";

interface PitchEvaluatorClientProps {
  initialTrack?: JudgingTrackId;
}

export default function PitchEvaluatorClient({
  initialTrack = "web_dev",
}: PitchEvaluatorClientProps) {
  const searchParams = useSearchParams();
  const forceHeuristic = searchParams?.get("engine") === "heuristic";
  const [selectedTrack, setSelectedTrack] = useState<JudgingTrackId>(initialTrack);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [techStack, setTechStack] = useState("");
  const [architecture, setArchitecture] = useState("");

  // Logged-in user context & hackathon auto-detection
  const [user, setUser] = useState<any | null>(null);
  const [userTeams, setUserTeams] = useState<any[]>([]);
  const [allHackathons, setAllHackathons] = useState<any[]>([]);
  const [selectedHackathonId, setSelectedHackathonId] = useState<string>("");
  const [autoDetectedBadge, setAutoDetectedBadge] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [evaluatingStep, setEvaluatingStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ProjectEvaluationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"feedback" | "architecture" | "team">("feedback");

  // History Drawer State
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/evaluator/history", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error("[PitchEvaluatorClient] loadHistory error:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setDeletingHistoryId(id);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/evaluator/history?id=${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (res.ok) {
        setHistory((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (err) {
      console.error("[PitchEvaluatorClient] deleteHistoryItem error:", err);
    } finally {
      setDeletingHistoryId(null);
    }
  };

  const handleSelectHistoryItem = (item: any) => {
    if (item.evaluation_result) {
      setResult(item.evaluation_result);
      if (item.ps_title) setTitle(item.ps_title);
      if (item.track_id) setSelectedTrack(item.track_id as JudgingTrackId);
      setShowHistoryDrawer(false);
      setTimeout(() => {
        document.getElementById("evaluation-results")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  // Load user session, user teams, and platform hackathons
  useEffect(() => {
    async function loadUserAndHackathons() {
      const {
        data: { user: sessionUser },
      } = await supabase.auth.getUser();

      if (sessionUser) {
        setUser(sessionUser);
        loadHistory();

        // 1. Fetch user's teams & joined hackathons
        try {
          const { data: memberData } = await supabase
            .from("team_members")
            .select("teams(id, name, description, team_hackathons(hackathons(id, name, description)))")
            .eq("user_id", sessionUser.id);

          const formattedTeams = (memberData as any[])
            ?.map((d) => d.teams)
            .filter(Boolean) || [];
          setUserTeams(formattedTeams);
        } catch (err) {
          console.warn("Could not load user teams:", err);
        }

        // 2. Fetch all platform hackathons for dropdown (alphabetical A-Z)
        try {
          const { data: hackathonList } = await supabase
            .from("hackathons")
            .select("id, name, description")
            .order("name", { ascending: true });

          if (hackathonList) {
            setAllHackathons(hackathonList);
          }
        } catch (err) {
          console.warn("Could not load hackathons:", err);
        }
      }
    }

    loadUserAndHackathons();
  }, []);

  // Auto-detect track when a hackathon is selected
  const handleHackathonSelect = (hackathonId: string) => {
    setSelectedHackathonId(hackathonId);
    if (!hackathonId) {
      setAutoDetectedBadge(null);
      return;
    }

    // Look for hackathon in user teams first, then in platform list
    let targetHackathon: any = null;
    for (const t of userTeams) {
      const thList = t.team_hackathons || [];
      for (const th of thList) {
        if (th.hackathons && th.hackathons.id === hackathonId) {
          targetHackathon = th.hackathons;
          // Optionally prefill title & description from user's team if empty
          if (!title && t.name) setTitle(t.name);
          if (!description && t.description) setDescription(t.description);
          break;
        }
      }
      if (targetHackathon) break;
    }

    if (!targetHackathon) {
      targetHackathon = allHackathons.find((h) => h.id === hackathonId);
    }

    if (targetHackathon) {
      const text = `${targetHackathon.name} ${targetHackathon.tag || ""} ${targetHackathon.description || ""}`.toLowerCase();
      let detected: JudgingTrackId = "web_dev";

      if (text.includes("sih") || text.includes("smart india")) {
        detected = "sih";
      } else if (
        text.includes("ai") ||
        text.includes("ml") ||
        text.includes("genai") ||
        text.includes("agent") ||
        text.includes("machine learning") ||
        text.includes("data science")
      ) {
        detected = "ai_genai";
      } else {
        detected = "web_dev";
      }

      setSelectedTrack(detected);
      setAutoDetectedBadge(`Auto-detected ${TRACK_PROFILES[detected].badge} for "${targetHackathon.name}"`);
    }
  };

  const currentProfile = TRACK_PROFILES[selectedTrack] || TRACK_PROFILES.web_dev;

  // Sample idea presets engineered for top-tier score demonstrations
  const loadSample = () => {
    if (selectedTrack === "web_dev") {
      setTitle("DevOrbit: High-Throughput Edge-Synchronized Developer Collaboration Suite");
      setDescription("Modern hackathon teams face 40% collaboration loss across fragmented tools. DevOrbit provides a unified workspace with sub-30ms CRDT state synchronization, integrated schema-to-mock API generation, and real-time multiplayer code review designed for 36-hour sprint environments.");
      setTechStack("Next.js 15 (App Router + Server Components), TypeScript 5.5, Tailwind CSS v4, PostgreSQL with Supabase RLS, Prisma ORM, Redis (Upstash) for sub-10ms ephemeral presence, Yjs CRDTs, Docker, Vercel Edge Middleware.");
      setArchitecture("Client connects via Yjs WebSockets to edge gateways with optimistic local state updates. Backend executes relational ACID transactions on PostgreSQL with row-level security (RLS) policies per team workspace. Database indexes applied on (team_id, updated_at). Sensitive endpoints protected by sliding-window Redis rate-limiting (100 req/min) and HMAC-signed webhook validation. Background export jobs queued asynchronously with BullMQ worker pools.");
    } else if (selectedTrack === "ai_genai") {
      setTitle("OmniAudit: Multi-Agent Regulatory & Compliance Verification Engine");
      setDescription("Enterprise legal and fintech audits require parsing 500+ page compliance binders with 0% tolerance for hallucinations. OmniAudit provides an end-to-end multi-agent verification system with hybrid semantic retrieval, deterministic citation hashes, and automated cross-encoder re-ranking achieving 98.4% retrieval precision.");
      setTechStack("Python 3.11, FastAPI, PyTorch, LlamaIndex, pgvector on PostgreSQL, BGE-M3 hybrid embeddings, Cohere ReRank v3, vLLM inference server, Next.js 15 dashboard, Docker.");
      setArchitecture("Documents ingested via hierarchical chunking (512 token chunks with 64 overlap + parent-document metadata). Retrieval fuses BM25 sparse search and dense vector cosine similarity via Reciprocal Rank Fusion (RRF). Queries pass through a cross-encoder re-ranker before entering a 3-stage agent loop (Researcher -> Drafter -> Auditor) in LangGraph. Ground-truth citation engine maps every paragraph to source SHA-256 hashes, rejecting responses with confidence < 0.92 to prevent hallucinations.");
    } else {
      setTitle("JalDrishti: IoT Acoustic Telemetry & Satellite GIS Water Pipeline Anomaly Detection");
      setDescription("Problem Statement ID 1729 (Ministry of Jal Shakti): Municipal water networks lose 38% of drinking water to undetected subterranean pipeline bursts. JalDrishti deploys non-invasive acoustic vibration telemetry paired with satellite GIS mapping to detect underground leaks within 15 meters in real-time.");
      setTechStack("ESP32 Acoustic Vibration Sensors (I2S MEMS), LoRaWAN Gateway, Next.js 15 Web Dashboard, Python FastAPI, TimescaleDB (Postgres time-series), XGBoost anomaly classifier, Mapbox GL JS.");
      setArchitecture("Slide 1: Problem Statement 1729 & Ministry alignment. Slide 2: Pipeline acoustic wave transient physics. Slide 3: Telemetry pipeline: ESP32 -> LoRaWAN -> MQTT Broker -> TimescaleDB -> FastAPI -> Next.js GIS UI. Slide 4: 36h bench execution roadmap with hardware bench-test and synthetic leak test rig. Slide 5: Quantified impact: 42M liters saved, ₹3.2 Cr annual municipal loss prevention, 85% reduction in repair response time. Slide 6: IEEE citations on pipe acoustic transients, Jal Jeevan Mission open dataset integration.");
    }
  };

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setErrorMsg("Please provide at least a project title and problem statement description.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    // Simulated evaluation steps for animated UX
    setEvaluatingStep(1);
    const stepInterval = setInterval(() => {
      setEvaluatingStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 900);

    try {
      const res = await fetch("/api/evaluator/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          psTitle: title,
          solutionDescription: description,
          techStack,
          architectureDetails: architecture,
          trackId: selectedTrack,
          hackathonId: selectedHackathonId || undefined,
          userId: user?.id,
          forceFallback: forceHeuristic,
        }),
      });

      clearInterval(stepInterval);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Evaluation failed. Please try again.");
      } else {
        setResult(data.result);
        if (user) {
          loadHistory();
        }
        setTimeout(() => {
          document.getElementById("evaluation-results")?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    } catch (err: any) {
      clearInterval(stepInterval);
      setErrorMsg(err.message || "Network exception during evaluation.");
    } finally {
      setLoading(false);
      setEvaluatingStep(0);
    }
  };

  const shareOnWhatsApp = () => {
    if (!result) return;
    const text = `🚀 My project "${title}" scored ${result.totalScore}/100 on the HackerMate Idea Evaluator (${result.grade})! Test your pitch & find teammates: https://www.hackermate.in/evaluator`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const copySummary = () => {
    if (!result) return;
    const summary = `📊 HackerMate Idea Evaluation: ${title}\nScore: ${result.totalScore}/100 (${result.grade})\nTrack: ${currentProfile.name}\n\nTop Strengths:\n${result.strengths.map((s) => `• ${s}`).join("\n")}\n\nKey Recommendations:\n${result.architectureSuggestions.map((a) => `• ${a}`).join("\n")}\n\nEvaluated at: https://www.hackermate.in/evaluator`;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header Banner */}
      <div className="text-center max-w-3xl mx-auto mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          {!user ? (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-500/10 border border-lime-500/20 text-lime-600 dark:text-lime-400 text-xs font-mono">
              <Cpu className="w-3.5 h-3.5" />
              <span>ZERO-LOGIN HACKATHON & IDEA GRADER</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-500/10 border border-lime-500/20 text-lime-600 dark:text-lime-400 text-xs font-mono">
                <Sparkles className="w-3.5 h-3.5" />
                <span>IDEA EVALUATOR ACTIVE</span>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryDrawer(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-700 dark:text-zinc-300 transition-all cursor-pointer shadow-xs"
              >
                <Clock className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
                <span>History ({history.length})</span>
              </button>
            </div>
          )}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Track-Aware Idea Evaluator & Pitch Grader
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm sm:text-base mt-3 leading-relaxed">
          Select your hackathon domain. The Idea Evaluator dynamically adapts its judging rubric, scrutinizes your architecture, highlights domain red flags, and identifies missing teammate skill gaps.
        </p>
      </div>

      {/* Hackathon Selector (Auto-Track Detection for Logged-in Users) */}
      {user && (userTeams.length > 0 || allHackathons.length > 0) && (
        <div className="mb-6 p-4 rounded-xl bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-lime-500/10 text-lime-600 dark:text-lime-400">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-2 flex-wrap">
                <span>Evaluating for a Specific Hackathon?</span>
                {autoDetectedBadge && (
                  <span className="text-[10px] font-mono font-bold text-lime-600 dark:text-lime-400 bg-lime-500/10 px-2 py-0.5 rounded-full animate-fade-in flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    {autoDetectedBadge}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Pick a hackathon to auto-detect its judging track and criteria.
              </p>
            </div>
          </div>

          <div className="w-full sm:w-auto min-w-[260px]">
            <select
              value={selectedHackathonId}
              onChange={(e) => handleHackathonSelect(e.target.value)}
              className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-lime-500 cursor-pointer"
            >
              <option value="">Choose Hackathon (or select track below)...</option>
              {userTeams.length > 0 && (
                <optgroup label="Your Joined Team Hackathons">
                  {userTeams.map((team) => {
                    const th = team.team_hackathons?.[0]?.hackathons;
                    if (!th) return null;
                    return (
                      <option key={`team-${th.id}`} value={th.id}>
                        🏆 {th.name} ({team.name})
                      </option>
                    );
                  })}
                </optgroup>
              )}
              {allHackathons.length > 0 && (
                <optgroup label="All Platform Hackathons">
                  {allHackathons.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {userTeams.length > 0 && (
              <div className="mt-2 text-right">
                <Link
                  href={`/teams/${selectedHackathonId ? (userTeams.find(t => t.team_hackathons?.some((th: any) => th.hackathons?.id === selectedHackathonId))?.id || userTeams[0].id) : userTeams[0].id}/workspace?tab=ppt`}
                  className="text-[11px] font-mono text-lime-600 dark:text-lime-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>Open Team Workspace PPT Evaluator →</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Track Selector Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {(["web_dev", "ai_genai", "sih"] as JudgingTrackId[]).map((trackKey) => {
          const profile = TRACK_PROFILES[trackKey];
          const isSelected = selectedTrack === trackKey;
          return (
            <button
              key={trackKey}
              onClick={() => {
                setSelectedTrack(trackKey);
                setResult(null);
              }}
              type="button"
              className={`p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "bg-zinc-900 border-lime-400 dark:bg-zinc-900 text-white shadow-lg shadow-lime-500/10 ring-1 ring-lime-400"
                  : "bg-white dark:bg-zinc-950/60 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl">{profile.icon}</span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    isSelected
                      ? "bg-lime-400 text-zinc-950 font-bold"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {profile.badge}
                </span>
              </div>
              <div className="font-bold text-sm text-zinc-900 dark:text-white mb-1">
                {profile.name}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-tight">
                {profile.tagline}
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Evaluator Form */}
      <div className="card p-6 sm:p-8 bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl mb-12">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-6">
          <div>
            <span className="text-xs font-mono uppercase text-lime-600 dark:text-lime-400 font-bold">
              Active Mode: {currentProfile.name}
            </span>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {currentProfile.description}
            </p>
          </div>
          <button
            type="button"
            onClick={loadSample}
            className="text-xs font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center gap-1.5 transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Load Sample Idea</span>
          </button>
        </div>

        <form onSubmit={handleEvaluate} className="space-y-5">
          {/* Project Title */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5">
              Project / Pitch Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Nexus: Distributed Real-Time Developer Collaboration Workspace"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-lime-500"
            />
          </div>

          {/* Problem Statement & Solution */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5">
              Problem Statement & Proposed Solution <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              placeholder="What core problem are you solving, who is your target user, and what is your unique solution/moat?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-lime-500 leading-relaxed"
            />
          </div>

          {/* Tech Stack & Frameworks */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5">
              Tech Stack & Frameworks
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Next.js 16, TypeScript, PostgreSQL with Supabase RLS, Redis, Docker, Tailwind CSS v4"
              value={techStack}
              onChange={(e) => setTechStack(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-lime-500 leading-relaxed"
            />
          </div>

          {/* Architecture Details */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5">
              Technical Architecture & Data Pipeline Flow
            </label>
            <textarea
              rows={3}
              placeholder="Explain how components connect: request flow -> API -> database schema -> caching / RAG / background queues -> response handling."
              value={architecture}
              onChange={(e) => setArchitecture(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-lime-500 leading-relaxed"
            />
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 rounded-xl bg-lime-400 hover:bg-lime-500 text-zinc-950 font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-lime-400/10"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>
                    {evaluatingStep === 1 && "Analyzing Architecture & Domain Stack..."}
                    {evaluatingStep === 2 && "Checking Failure Edge Cases & Red Flags..."}
                    {evaluatingStep >= 3 && "Finalizing Jury Scores & Teammate Gap Analysis..."}
                  </span>
                </>
              ) : (
                <>
                  <Cpu className="w-4 h-4" />
                  <span>Run AI Evaluation ({currentProfile.badge}) →</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Results Section */}
      {result && (
        <div id="evaluation-results" className="card p-6 sm:p-8 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl text-zinc-900 dark:text-white animate-fade-in-up mb-12">
          {/* Top Score Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-6 mb-6 gap-6">
            <div className="flex items-center gap-5">
              <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-zinc-100 dark:bg-zinc-900 border-4 border-lime-500 dark:border-lime-400 text-center shadow-lg shadow-lime-500/20">
                <div>
                  <div className="text-3xl font-black text-zinc-900 dark:text-white">{result.totalScore}</div>
                  <div className="text-[9px] font-mono text-zinc-500 dark:text-zinc-400 uppercase">/ 100 PTS</div>
                </div>
              </div>
              <div>
                <span className="text-xs font-mono uppercase text-lime-600 dark:text-lime-400 font-bold tracking-wider">
                  {currentProfile.name} Result
                </span>
                <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white mt-0.5">{title}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <div className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-lime-400">
                    {result.grade}
                  </div>

                  {/* Engine Transparency Badge */}
                  {result.usedAiEngine ? (
                    <div
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold font-mono tracking-tight bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 shadow-xs select-none"
                      title="Evaluated using live Gemini AI model with deep semantic reasoning and domain jury rubric checks."
                    >
                      <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                      <span>Gemini AI Engine</span>
                    </div>
                  ) : (
                    <div
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold font-mono tracking-tight bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 shadow-xs select-none"
                      title="Evaluated using static pattern heuristic rules (offline / fast check mode)."
                    >
                      <Zap className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                      <span>Quick Heuristic Check</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={shareOnWhatsApp}
                className="px-3.5 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 dark:border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share WhatsApp</span>
              </button>
              <button
                onClick={copySummary}
                className="px-3.5 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? "Copied!" : "Copy Summary"}</span>
              </button>
            </div>
          </div>

          {/* Fallback Notice Banner if heuristic engine was used */}
          {!result.usedAiEngine && (
            <div className="mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold">Heuristic Evaluation Mode:</span> This scorecard was generated using static rule heuristics because the live AI model was temporarily rate-limited or offline. Scores from the heuristic engine are conservative baseline approximations.
              </div>
            </div>
          )}

          {/* 4 Category Score Bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800">
              <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase font-semibold">
                {result.categoryLabels.novelty}
              </div>
              <div className="text-xl font-bold text-zinc-900 dark:text-white mt-1">
                {result.subScores.novelty} <span className="text-xs text-zinc-500">/ {currentProfile.categories.novelty.maxPts}</span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-lime-500 dark:bg-lime-400 h-full rounded-full"
                  style={{ width: `${(result.subScores.novelty / currentProfile.categories.novelty.maxPts) * 100}%` }}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800">
              <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase font-semibold">
                {result.categoryLabels.tech}
              </div>
              <div className="text-xl font-bold text-zinc-900 dark:text-white mt-1">
                {result.subScores.tech} <span className="text-xs text-zinc-500">/ {currentProfile.categories.tech.maxPts}</span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-cyan-500 dark:bg-cyan-400 h-full rounded-full"
                  style={{ width: `${(result.subScores.tech / currentProfile.categories.tech.maxPts) * 100}%` }}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800">
              <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase font-semibold">
                {result.categoryLabels.uiUxOrFeasibility}
              </div>
              <div className="text-xl font-bold text-zinc-900 dark:text-white mt-1">
                {result.subScores.uiUxOrFeasibility} <span className="text-xs text-zinc-500">/ {currentProfile.categories.uiUxOrFeasibility.maxPts}</span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-emerald-500 dark:bg-emerald-400 h-full rounded-full"
                  style={{ width: `${(result.subScores.uiUxOrFeasibility / currentProfile.categories.uiUxOrFeasibility.maxPts) * 100}%` }}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800">
              <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase font-semibold">
                {result.categoryLabels.impactOrTeam}
              </div>
              <div className="text-xl font-bold text-zinc-900 dark:text-white mt-1">
                {result.subScores.impactOrTeam} <span className="text-xs text-zinc-500">/ {currentProfile.categories.impactOrTeam.maxPts}</span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-amber-500 dark:bg-amber-400 h-full rounded-full"
                  style={{ width: `${(result.subScores.impactOrTeam / currentProfile.categories.impactOrTeam.maxPts) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Interactive Analysis Tabs */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 mb-6 gap-6 overflow-x-auto">
            <button
              onClick={() => setActiveTab("feedback")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === "feedback"
                  ? "border-lime-500 dark:border-lime-400 text-lime-600 dark:text-lime-400"
                  : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              Jury Strengths & Red Flags
            </button>
            <button
              onClick={() => setActiveTab("architecture")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === "architecture"
                  ? "border-lime-500 dark:border-lime-400 text-lime-600 dark:text-lime-400"
                  : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              Architecture & Moat Suggestions
            </button>
            <button
              onClick={() => setActiveTab("team")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === "team"
                  ? "border-lime-500 dark:border-lime-400 text-lime-600 dark:text-lime-400"
                  : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              Missing Teammate Skill Gaps ({result.recommendedRoles.length})
            </button>
          </div>

          {/* Tab Content 1: Feedback */}
          {activeTab === "feedback" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-xs uppercase mb-3">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Key Technical Strengths</span>
                </div>
                <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-bold text-xs uppercase mb-3">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Jury Red Flags & Vulnerabilities</span>
                </div>
                <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                  {result.redFlags.map((rf, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-red-600 dark:text-red-400 font-bold">•</span>
                      <span>{rf}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Tab Content 2: Architecture Suggestions */}
          {activeTab === "architecture" && (
            <div className="p-5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-3">
              <div className="flex items-center gap-2 text-lime-600 dark:text-lime-400 font-bold text-xs uppercase">
                <Cpu className="w-4 h-4" />
                <span>Next Technical Iteration Steps to Boost Score</span>
              </div>
              <ul className="space-y-2.5 text-xs text-zinc-700 dark:text-zinc-300">
                {result.architectureSuggestions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2.5 bg-white dark:bg-zinc-900 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <span className="text-lime-600 dark:text-lime-400 font-bold">0{i + 1}.</span>
                    <span className="leading-relaxed">{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tab Content 3: Team Skill Gaps */}
          {activeTab === "team" && (
            <div className="space-y-4">
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                Based on your project architecture, the AI identified these recommended builder roles to complete your squad:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {result.recommendedRoles.map((role, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="font-bold text-sm text-zinc-900 dark:text-white">{role.role}</div>
                      <span className="text-[10px] font-mono text-lime-600 dark:text-lime-400 bg-lime-500/10 px-2 py-0.5 rounded font-bold">
                        Needed Role
                      </span>
                    </div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">{role.reason}</div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {role.suggestedSkills.map((sk, sIdx) => (
                        <Link
                          key={sIdx}
                          href={`/developers?skills=${encodeURIComponent(sk)}`}
                          className="text-[10px] font-mono bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 px-2 py-0.5 rounded font-medium transition-colors"
                          title={`Find builders with ${sk}`}
                        >
                          {sk}
                        </Link>
                      ))}
                    </div>
                    <Link
                      href={`/developers?skills=${encodeURIComponent(role.suggestedSkills.join(","))}`}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-lime-600 dark:text-lime-400 hover:underline"
                    >
                      <span>Find {role.role} builders on HackerMate →</span>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Viral CTA Banner */}
          <div className="mt-8 p-5 rounded-xl bg-gradient-to-r from-lime-500/10 via-emerald-500/10 to-transparent border border-lime-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                <span>Ready to build this project with verified developers?</span>
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Find teammates on HackerMate with the exact skills your project needs.
              </div>
            </div>
            <Link
              href="/developers"
              className="px-5 py-2.5 rounded-lg bg-lime-400 hover:bg-lime-500 text-zinc-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shrink-0"
            >
              <span>Find Teammates on HackerMate →</span>
            </Link>
          </div>
        </div>
      )}

      {/* Evaluation History Slide-Over Drawer */}
      {showHistoryDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setShowHistoryDrawer(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 h-full flex flex-col shadow-2xl z-10 animate-fade-in">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-lime-500/10 text-lime-600 dark:text-lime-400">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Evaluation History
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {history.length} saved {history.length === 1 ? "pitch scorecard" : "pitch scorecards"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryDrawer(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingHistory ? (
                <div className="text-center py-16 text-xs text-zinc-400 flex flex-col items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-lime-500" />
                  <span>Loading your evaluation history...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-900 mx-auto flex items-center justify-center text-zinc-400 mb-3">
                    <History className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white mb-1">
                    No Saved Evaluations Yet
                  </h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-xs mx-auto">
                    Evaluate your project ideas or hackathon decks while signed in. All your scorecards and jury feedback will automatically save here.
                  </p>
                </div>
              ) : (
                history.map((item) => {
                  const trackInfo = TRACK_PROFILES[item.track_id as JudgingTrackId] || TRACK_PROFILES.web_dev;
                  const dateStr = new Date(item.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  });
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectHistoryItem(item)}
                      className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-all cursor-pointer group space-y-2 relative"
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-zinc-500 dark:text-zinc-400">{dateStr}</span>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                          {trackInfo.badge}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-zinc-900 dark:text-white group-hover:text-lime-600 dark:group-hover:text-lime-400 transition-colors line-clamp-2">
                        {item.ps_title}
                      </h4>

                      <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono font-extrabold text-lime-600 dark:text-lime-400">
                            {item.total_score}/100
                          </span>
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-[150px]">
                            • {item.grade}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-zinc-400 group-hover:text-zinc-200 font-medium">
                            View →
                          </span>
                          <button
                            type="button"
                            onClick={(e) => deleteHistoryItem(item.id, e)}
                            disabled={deletingHistoryId === item.id}
                            className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Delete this evaluation"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
