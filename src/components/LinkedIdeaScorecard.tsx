"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  JudgingTrackId,
  TRACK_PROFILES,
} from "@/lib/evaluator/evaluatorTypes";
import {
  Lightbulb,
  Sparkles,
  AlertTriangle,
  ShieldCheck,
  Cpu,
  Users,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  Layers,
  Award,
} from "lucide-react";

export interface LinkedEvaluationRecord {
  id: string;
  ps_title: string;
  track_id: string;
  total_score: number;
  grade: string;
  used_ai_engine: boolean;
  sub_scores: {
    novelty: number;
    tech: number;
    uiUxOrFeasibility: number;
    impactOrTeam: number;
  };
  evaluation_result: {
    strengths?: string[];
    redFlags?: string[];
    architectureSuggestions?: string[];
    recommendedRoles?: {
      role: string;
      reason: string;
      suggestedSkills: string[];
    }[];
  };
  created_at: string;
}

export interface LinkedIdeaScorecardProps {
  teamId: string;
  className?: string;
  onSelectIdeaTitle?: (title: string) => void;
  onEvaluationLoaded?: (evaluation: LinkedEvaluationRecord | null) => void;
}

export default function LinkedIdeaScorecard({
  teamId,
  className = "",
  onSelectIdeaTitle,
  onEvaluationLoaded,
}: LinkedIdeaScorecardProps) {
  const [evaluations, setEvaluations] = useState<LinkedEvaluationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"redFlags" | "strengths" | "architecture" | "roles">("redFlags");

  useEffect(() => {
    let isMounted = true;

    async function loadAttachedEvaluations() {
      if (!teamId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Explicit column projections (Rule 2 Compliance: no wildcard selects)
        const { data, error: fetchErr } = await supabase
          .from("user_pitch_evaluations")
          .select("id, ps_title, track_id, total_score, grade, used_ai_engine, sub_scores, evaluation_result, created_at")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false });

        if (fetchErr) {
          console.error("[LinkedIdeaScorecard] Query error:", fetchErr);
          if (isMounted) setError(fetchErr.message);
          return;
        }

        const validList = (data as LinkedEvaluationRecord[]) || [];
        if (isMounted) {
          setEvaluations(validList);
          if (validList.length > 0) {
            setSelectedId(validList[0].id);
            onEvaluationLoaded?.(validList[0]);
            if (onSelectIdeaTitle && validList[0].ps_title) {
              onSelectIdeaTitle(validList[0].ps_title);
            }
          } else {
            setSelectedId(null);
            onEvaluationLoaded?.(null);
          }
        }
      } catch (err: any) {
        console.error("[LinkedIdeaScorecard] Unexpected exception:", err);
        if (isMounted) setError(err.message || "Failed to load linked idea evaluations.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAttachedEvaluations();

    return () => {
      isMounted = false;
    };
  }, [teamId]);

  const currentEval = evaluations.find((e) => e.id === selectedId) || evaluations[0] || null;

  const getScoreColor = (score: number) => {
    if (score >= 88) return "text-amber-500 dark:text-amber-400";
    if (score >= 72) return "text-emerald-500 dark:text-emerald-400";
    if (score >= 50) return "text-yellow-500 dark:text-yellow-400";
    return "text-rose-500 dark:text-rose-400";
  };

  const getGradeBadge = (grade: string = "") => {
    if (grade.includes("Top Tier") || grade.includes("Gold") || grade.includes("🏆")) {
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
    }
    if (grade.includes("Strong") || grade.includes("✅")) {
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    }
    if (grade.includes("Risk") || grade.includes("High Risk") || grade.includes("🚨")) {
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
    }
    return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30";
  };

  if (loading) {
    return (
      <div className={`p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/40 animate-pulse ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="space-y-1.5 flex-1">
            <div className="h-4 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="h-3 w-32 bg-zinc-100 dark:bg-zinc-900 rounded" />
          </div>
        </div>
        <div className="h-12 w-full bg-zinc-100 dark:bg-zinc-900 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between gap-3 ${className}`}>
        <span>Failed to load team&apos;s linked idea benchmark: {error}</span>
        <button
          onClick={() => window.location.reload()}
          className="font-bold underline shrink-0 hover:opacity-80"
        >
          Retry
        </button>
      </div>
    );
  }

  // Zero State: No evaluation linked to this team yet
  if (!currentEval || evaluations.length === 0) {
    return (
      <div className={`p-5 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left ${className}`}>
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-lime-500/10 border border-lime-500/20 flex items-center justify-center text-lime-600 dark:text-lime-400 shrink-0 mt-0.5">
            <Lightbulb className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider font-mono">
                Linked Idea Pitch Benchmark
              </h4>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                Not Linked
              </span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-xl leading-relaxed">
              Establish a baseline 0–100 jury score and identify architecture red flags by evaluating your concept in the Idea Evaluator, then attach it to this workspace.
            </p>
          </div>
        </div>

        <Link
          href="/evaluator"
          className="py-2.5 px-4 rounded-lg bg-lime-400 hover:bg-lime-500 !text-black dark:!text-black font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm shrink-0 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-black" />
          <span>Evaluate Idea on HackerMate →</span>
        </Link>
      </div>
    );
  }

  const trackInfo = TRACK_PROFILES[currentEval.track_id as JudgingTrackId] || TRACK_PROFILES.web_dev;
  const result = currentEval.evaluation_result || {};
  const redFlags = result.redFlags || [];
  const strengths = result.strengths || [];
  const archSuggestions = result.architectureSuggestions || [];
  const roles = result.recommendedRoles || [];

  const formattedDate = new Date(currentEval.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className={`p-5 rounded-2xl border border-lime-500/30 bg-gradient-to-br from-lime-500/5 via-white to-zinc-50 dark:from-lime-950/20 dark:via-zinc-950 dark:to-zinc-900/60 shadow-xs space-y-5 text-left relative overflow-hidden ${className}`}>
      {/* Glow Effect */}
      <div className="pointer-events-none absolute -top-12 -right-12 w-44 h-44 bg-lime-500/10 rounded-full blur-3xl" />

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800/80 pb-4 relative z-10">
        <div className="space-y-1">
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-lime-500/10 border border-lime-500/30 text-lime-700 dark:text-lime-300 text-[10px] font-mono font-bold uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-lime-500" />
              Linked Idea Benchmark
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
              {trackInfo.badge}
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">
              Evaluated on {formattedDate}
            </span>
          </div>

          <h3 className="text-base font-extrabold text-zinc-900 dark:text-white tracking-tight">
            {currentEval.ps_title}
          </h3>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {/* Multiple Attached Versions Dropdown */}
          {evaluations.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-zinc-500">Version:</span>
              <select
                value={selectedId || ""}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  const selected = evaluations.find((ev) => ev.id === e.target.value);
                  if (selected) {
                    onEvaluationLoaded?.(selected);
                    onSelectIdeaTitle?.(selected.ps_title);
                  }
                }}
                className="text-xs py-1 px-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-lime-500 cursor-pointer"
              >
                {evaluations.map((ev, idx) => (
                  <option key={ev.id} value={ev.id}>
                    v{evaluations.length - idx}: {ev.total_score} pts ({new Date(ev.created_at).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Benchmark Score Badge */}
          <div className="flex items-center gap-3 bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 rounded-xl shadow-xs">
            <div className="text-right">
              <div className="text-[9px] font-mono text-zinc-500 dark:text-zinc-400 uppercase font-semibold">
                Idea Benchmark
              </div>
              <div className="flex items-baseline justify-end gap-1">
                <span className={`text-2xl font-black ${getScoreColor(currentEval.total_score)}`}>
                  {currentEval.total_score}
                </span>
                <span className="text-zinc-400 font-mono text-xs">/100</span>
              </div>
            </div>
            <span className={`badge text-[10px] px-2 py-0.5 font-bold ${getGradeBadge(currentEval.grade)}`}>
              {currentEval.grade.split(" ")[0]}
            </span>
          </div>
        </div>
      </div>

      {/* Sub-Score Category Rubric Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 relative z-10">
        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80">
          <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
            {trackInfo.categories.novelty.label}
          </div>
          <div className="text-base font-bold text-zinc-900 dark:text-white mt-1">
            {currentEval.sub_scores?.novelty || 0}
            <span className="text-xs text-zinc-400 font-normal"> / {trackInfo.categories.novelty.maxPts}</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80">
          <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
            {trackInfo.categories.tech.label}
          </div>
          <div className="text-base font-bold text-zinc-900 dark:text-white mt-1">
            {currentEval.sub_scores?.tech || 0}
            <span className="text-xs text-zinc-400 font-normal"> / {trackInfo.categories.tech.maxPts}</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80">
          <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
            {trackInfo.categories.uiUxOrFeasibility.label}
          </div>
          <div className="text-base font-bold text-zinc-900 dark:text-white mt-1">
            {currentEval.sub_scores?.uiUxOrFeasibility || 0}
            <span className="text-xs text-zinc-400 font-normal"> / {trackInfo.categories.uiUxOrFeasibility.maxPts}</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80">
          <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
            {trackInfo.categories.impactOrTeam.label}
          </div>
          <div className="text-base font-bold text-zinc-900 dark:text-white mt-1">
            {currentEval.sub_scores?.impactOrTeam || 0}
            <span className="text-xs text-zinc-400 font-normal"> / {trackInfo.categories.impactOrTeam.maxPts}</span>
          </div>
        </div>
      </div>

      {/* Actionable Jury Checklist Tabs */}
      <div className="space-y-3 relative z-10">
        <div className="flex items-center gap-1.5 border-b border-zinc-200 dark:border-zinc-800 pb-2 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab("redFlags")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === "redFlags"
                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Jury Red Flags ({redFlags.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("strengths")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === "strengths"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Strengths ({strengths.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("architecture")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === "architecture"
                ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Architecture ({archSuggestions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("roles")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === "roles"
                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Role Gaps ({roles.length})</span>
          </button>
        </div>

        {/* Tab Content Panels */}
        <div className="p-4 rounded-xl bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 text-xs">
          {activeTab === "redFlags" && (
            <div className="space-y-2.5">
              <div className="p-2.5 rounded-lg bg-rose-500/5 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-[11px] leading-relaxed">
                <strong>Jury Defense Tip:</strong> These vulnerabilities were detected during idea screening. Make sure your presentation slide deck directly addresses or refutes them.
              </div>
              {redFlags.length > 0 ? (
                <ul className="space-y-2">
                  {redFlags.map((flag, i) => (
                    <li key={i} className="flex items-start gap-2 text-zinc-700 dark:text-zinc-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                      <span>{flag}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-zinc-500 dark:text-zinc-400 italic">No critical red flags flagged for this evaluation.</p>
              )}
            </div>
          )}

          {activeTab === "strengths" && (
            <div className="space-y-2.5">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Core advantages and technical moats to highlight in your pitch deck:
              </p>
              {strengths.length > 0 ? (
                <ul className="space-y-2">
                  {strengths.map((str, i) => (
                    <li key={i} className="flex items-start gap-2 text-zinc-700 dark:text-zinc-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                      <span>{str}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-zinc-500 dark:text-zinc-400 italic">No strengths listed.</p>
              )}
            </div>
          )}

          {activeTab === "architecture" && (
            <div className="space-y-2.5">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Recommended technical architecture and engineering enhancements:
              </p>
              {archSuggestions.length > 0 ? (
                <ul className="space-y-2">
                  {archSuggestions.map((arch, i) => (
                    <li key={i} className="flex items-start gap-2 text-zinc-700 dark:text-zinc-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0 mt-1.5" />
                      <span>{arch}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-zinc-500 dark:text-zinc-400 italic">No architecture recommendations generated.</p>
              )}
            </div>
          )}

          {activeTab === "roles" && (
            <div className="space-y-3">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Identified developer role and skill gaps for this project track:
              </p>
              {roles.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {roles.map((r, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                      <div className="font-bold text-zinc-900 dark:text-white text-xs">{r.role}</div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{r.reason}</div>
                      {r.suggestedSkills && r.suggestedSkills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {r.suggestedSkills.map((sk) => (
                            <span key={sk} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                              {sk}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-500 dark:text-zinc-400 italic">All essential roles covered.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer Utility Bar */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-200/60 dark:border-zinc-800/60 text-[11px] relative z-10 flex-wrap gap-2">
        <span className="text-zinc-500 dark:text-zinc-400">
          Source: Evaluated on HackerMate Idea Evaluator
        </span>
        <div className="flex items-center gap-3">
          {onSelectIdeaTitle && (
            <button
              type="button"
              onClick={() => onSelectIdeaTitle(currentEval.ps_title)}
              className="text-xs font-bold text-lime-600 dark:text-lime-400 hover:underline cursor-pointer"
            >
              Use Idea Title in Deck Form ↵
            </button>
          )}
          <Link
            href="/evaluator"
            className="text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1"
          >
            <span>Open Evaluator</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
