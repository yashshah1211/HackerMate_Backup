"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Link as LinkIcon,
  Shield,
  Layers,
  Cpu,
  Palette,
  Users,
  Award,
  Trash2,
  Eye,
  History,
  GitCompare,
  TrendingUp,
  TrendingDown,
  CheckCheck,
  Minus,
  Sparkles,
} from "lucide-react";

interface PPTEvaluation {
  id: string;
  team_id: string;
  ps_title: string;
  ps_category: string;
  submission_type: "pdf_upload" | "external_link";
  external_link_url?: string | null;
  file_name: string;
  version: number;
  status: "evaluating" | "completed" | "failed";
  score_novelty: number;
  score_tech: number;
  score_ui_ux: number;
  score_team: number;
  total_score: number;
  grade: string;
  slide_breakdown?: any[];
  ai_feedback?: {
    strengths?: string[];
    spocRedFlags?: string[];
    formatViolations?: string[];
    slideRecommendations?: Record<string, string>;
    scoreDeductions?: Record<string, string>;
    usedAiFallback?: boolean;
    evaluatedAt?: string;
  };
  error_message?: string | null;
  created_at: string;
}

const ORDERED_SLIDES = [
  { key: "titlePage", label: "Slide 1: Title Page & Team Setup", slideNum: 1 },
  { key: "proposedSolution", label: "Slide 2: Idea & Proposed Solution", slideNum: 2 },
  { key: "technicalApproach", label: "Slide 3: Technical Approach & Architecture", slideNum: 3 },
  { key: "feasibilityAndRisks", label: "Slide 4: Feasibility & Risk Mitigation", slideNum: 4 },
  { key: "impactAndBenefits", label: "Slide 5: Impact, Benefits & Commercial ROI", slideNum: 5 },
  { key: "researchAndReferences", label: "Slide 6: Research Papers & References", slideNum: 6 },
] as const;

export default function PPTEvaluatorTab({ teamId }: { teamId: string }) {
  const [evaluations, setEvaluations] = useState<PPTEvaluation[]>([]);
  const [selectedEval, setSelectedEval] = useState<PPTEvaluation | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form State
  const [externalLink, setExternalLink] = useState("");
  const [psTitle, setPsTitle] = useState("");
  const [psCategory, setPsCategory] = useState("software");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadEvaluations();
  }, [teamId]);

  async function loadEvaluations() {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/teams/${teamId}/ppt-evaluations`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("application/json")) {
        const data = await res.json();
        const list = data.evaluations || [];
        setEvaluations(list);
        if (list.length > 0) {
          setSelectedEval((prev) => (prev ? list.find((e: any) => e.id === prev.id) || list[0] : list[0]));
        } else {
          setSelectedEval(null);
        }
      }
    } catch (err) {
      console.error("[PPTEvaluatorTab] Load error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleEvaluate(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!externalLink.trim()) {
      setErrorMsg("Please paste your Google Slides or Google Drive presentation link.");
      return;
    }

    setIsSubmitting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setErrorMsg("Session expired. Please log in again.");
        setIsSubmitting(false);
        return;
      }

      const res = await fetch(`/api/teams/${teamId}/ppt-evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          external_link_url: externalLink.trim(),
          ps_title: psTitle.trim() || "SIH 2026 Problem Statement",
          ps_category: psCategory,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      let data: any = null;

      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const rawText = await res.text();
        console.error("[PPTEvaluatorTab] Server error response:", res.status, rawText.slice(0, 300));
        setErrorMsg(
          `Server returned status ${res.status} (${res.statusText || "Error"}). Please verify your presentation link sharing permissions and try again.`
        );
        setIsSubmitting(false);
        return;
      }

      if (!res.ok || data?.error) {
        setErrorMsg(data?.error || "Evaluation failed. Please try again.");
      } else if (data?.evaluation) {
        setEvaluations((prev) => [data.evaluation, ...prev]);
        setSelectedEval(data.evaluation);
        setExternalLink("");
      }
    } catch (err: any) {
      console.error("[PPTEvaluatorTab] Network/Evaluation exception:", err);
      setErrorMsg(err.message || "Network exception occurred during evaluation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteEvaluation(evalId: string) {
    setDeletingId(evalId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setErrorMsg("Session expired. Please log in again.");
        setDeletingId(null);
        setConfirmDeleteId(null);
        return;
      }

      const res = await fetch(`/api/teams/${teamId}/ppt-evaluations?evalId=${evalId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const contentType = res.headers.get("content-type") || "";
      let data: any = null;
      if (contentType.includes("application/json")) {
        data = await res.json();
      }

      if (!res.ok || data?.error) {
        setErrorMsg(data?.error || "Failed to delete evaluation record.");
      } else {
        const remaining = evaluations.filter((e) => e.id !== evalId);
        setEvaluations(remaining);
        if (selectedEval?.id === evalId) {
          setSelectedEval(remaining.length > 0 ? remaining[0] : null);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error deleting evaluation.");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  const getGradeBadge = (grade: string = "") => {
    if (grade.includes("Gold")) {
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
    }
    if (grade.includes("Ready") || grade.includes("Candidate") || grade.includes("A")) {
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    }
    if (grade.includes("Risk") || grade.includes("Poor") || grade.includes("F")) {
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
    }
    return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30";
  };

  const getScoreColor = (score: number) => {
    if (score >= 88) return "text-amber-500 dark:text-amber-400";
    if (score >= 72) return "text-emerald-500 dark:text-emerald-400";
    if (score >= 50) return "text-yellow-500 dark:text-yellow-400";
    return "text-rose-500 dark:text-rose-400";
  };

  // Version-over-Version Diff Calculations
  const otherCompletedEvals = evaluations.filter(
    (e) => e.id !== selectedEval?.id && e.status === "completed"
  );

  const compareEval = compareVersionId
    ? otherCompletedEvals.find((e) => e.id === compareVersionId) || null
    : otherCompletedEvals.find((e) => e.version < (selectedEval?.version || 0)) ||
      (otherCompletedEvals.length > 0 ? otherCompletedEvals[0] : null);

  const scoreDiff =
    selectedEval && compareEval ? selectedEval.total_score - compareEval.total_score : null;
  const noveltyDiff =
    selectedEval && compareEval ? selectedEval.score_novelty - compareEval.score_novelty : null;
  const techDiff =
    selectedEval && compareEval ? selectedEval.score_tech - compareEval.score_tech : null;
  const uiUxDiff =
    selectedEval && compareEval ? selectedEval.score_ui_ux - compareEval.score_ui_ux : null;
  const teamDiff =
    selectedEval && compareEval ? selectedEval.score_team - compareEval.score_team : null;

  const prevFlags = compareEval?.ai_feedback?.spocRedFlags || [];
  const currFlags = selectedEval?.ai_feedback?.spocRedFlags || [];
  const resolvedRedFlags = prevFlags.filter((rf) => !currFlags.includes(rf));

  const renderDiffBadge = (diff: number | null, prefix: string = "") => {
    if (diff === null) return null;
    if (diff > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
          <TrendingUp className="w-3 h-3" />
          <span>+{diff}</span>
          {prefix && <span className="text-[10px] font-normal opacity-80">{prefix}</span>}
        </span>
      );
    }
    if (diff < 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
          <TrendingDown className="w-3 h-3" />
          <span>{diff}</span>
          {prefix && <span className="text-[10px] font-normal opacity-80">{prefix}</span>}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-500/10 px-1.5 py-0.5 rounded border border-zinc-500/20">
        <Minus className="w-3 h-3" />
        <span>0</span>
        {prefix && <span className="text-[10px] font-normal opacity-80">{prefix}</span>}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 text-violet-500 dark:text-violet-400 animate-spin mb-4" />
        <p className="text-zinc-500 dark:text-zinc-400 text-sm font-mono uppercase tracking-wider">
          Loading Pitch Deck Evaluations...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Top Diagnostic Banner */}
      <div className="rounded-2xl p-6 border border-violet-500/20 bg-gradient-to-br from-violet-50 via-white to-zinc-50 dark:from-violet-950/20 dark:via-zinc-950/60 dark:to-black relative overflow-hidden shadow-xs">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="badge bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20 text-xs px-2.5 py-0.5 font-mono font-bold">
                SIH 2026 AI JURY EVALUATOR
              </span>
              <span className="badge bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 text-xs px-2 py-0.5">
                Official 6-Slide Rubric
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              AI Pitch Presentation Diagnostic
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 text-sm mt-1 max-w-2xl leading-relaxed">
              Paste your Google Slides or Drive presentation link (ensure sharing is set to &ldquo;Anyone with the link can view&rdquo;). Receive instant 0–100 rubric scores across Novelty, Technical Architecture, UI/UX, and Squad Compliance with slide-by-slide actionable jury feedback.
            </p>
          </div>

          {evaluations.length > 0 && selectedEval && (
            <div className="flex flex-col items-end flex-shrink-0 bg-white/90 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-xs">
              <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono uppercase mb-1">Active Scorecard Total</div>
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl font-extrabold ${getScoreColor(selectedEval.total_score)}`}>
                  {selectedEval.total_score}
                </span>
                <span className="text-zinc-400 font-mono text-lg">/100</span>
                {compareEval && renderDiffBadge(scoreDiff, `vs v${compareEval.version}`)}
              </div>
              <span className={`badge mt-2 text-xs px-2.5 py-0.5 font-bold ${getGradeBadge(selectedEval.grade)}`}>
                {selectedEval.grade}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Submission Form Card */}
      <div className="rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">Evaluate New Pitch Deck Version</h3>
        </div>

        <form onSubmit={handleEvaluate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 uppercase font-mono tracking-wider">
                Problem Statement Title / Idea Name
              </label>
              <input
                type="text"
                value={psTitle}
                onChange={(e) => setPsTitle(e.target.value)}
                placeholder="e.g. AI Monument Audio Guide & Multilingual Vision"
                className="w-full bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 uppercase font-mono tracking-wider">
                Category / Track
              </label>
              <select
                value={psCategory}
                onChange={(e) => setPsCategory(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 transition-colors"
              >
                <option value="software">Software Edition</option>
                <option value="hardware">Hardware Edition</option>
                <option value="open_innovation">Open Innovation Track</option>
              </select>
            </div>
          </div>

          {/* Google Slides Presentation Link Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase font-mono tracking-wider">
              Google Slides / Drive Presentation Link
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                <LinkIcon className="w-4 h-4" />
              </div>
              <input
                type="url"
                value={externalLink}
                onChange={(e) => setExternalLink(e.target.value)}
                placeholder="https://docs.google.com/presentation/d/.../edit?usp=sharing"
                className="w-full bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 transition-colors"
                required
              />
            </div>
            <p className="text-xs text-zinc-500">
              Ensure your Google Slides presentation sharing permission is set to &ldquo;Anyone with the link can view&rdquo;.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg shadow-lg shadow-violet-600/20 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Evaluating Presentation...</span>
                </>
              ) : (
                <span>Run AI Evaluation</span>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Selected Evaluation Scorecard */}
      {selectedEval && selectedEval.status === "completed" && (
        <div className="space-y-6">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{selectedEval.ps_title}</h3>
                <span className="badge bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20 text-xs px-2.5 py-0.5 font-bold font-mono">
                  v{selectedEval.version} (Active)
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Evaluated on {new Date(selectedEval.created_at).toLocaleDateString()} at{" "}
                {new Date(selectedEval.created_at).toLocaleTimeString()} • {selectedEval.file_name}
              </p>
            </div>
          </div>

          {/* Iteration Progress Diff Card (When multiple versions exist) */}
          {compareEval && (
            <div className="rounded-2xl p-5 border border-violet-200 dark:border-violet-500/30 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/60 dark:from-violet-950/20 dark:via-zinc-950/70 dark:to-indigo-950/20 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200/80 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-violet-600/10 border border-violet-500/20 text-violet-600 dark:text-violet-400">
                    <GitCompare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                        Iteration Progress Diff
                      </h4>
                      <span className="badge bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20 text-[10px] px-2 py-0.5 font-bold font-mono">
                        v{selectedEval.version} vs v{compareEval.version}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                      Comparing Active Version ({selectedEval.file_name}) against Baseline Version ({compareEval.file_name})
                    </p>
                  </div>
                </div>

                {otherCompletedEvals.length > 1 && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Compare with:</label>
                    <select
                      value={compareEval.id}
                      onChange={(e) => setCompareVersionId(e.target.value)}
                      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs rounded-lg px-2.5 py-1.5 text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 shadow-xs"
                    >
                      {otherCompletedEvals.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          v{ev.version} ({ev.total_score}/100 - {new Date(ev.created_at).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Metric Progression Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs">
                  <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 block mb-1">Overall Total</span>
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-base sm:text-lg font-extrabold font-mono text-zinc-900 dark:text-white">
                      {compareEval.total_score} → {selectedEval.total_score}
                    </span>
                    {renderDiffBadge(scoreDiff)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs">
                  <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 block mb-1">Problem & Novelty</span>
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-sm sm:text-base font-bold font-mono text-zinc-900 dark:text-white">
                      {compareEval.score_novelty} → {selectedEval.score_novelty}
                    </span>
                    {renderDiffBadge(noveltyDiff)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs">
                  <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 block mb-1">Tech Architecture</span>
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-sm sm:text-base font-bold font-mono text-zinc-900 dark:text-white">
                      {compareEval.score_tech} → {selectedEval.score_tech}
                    </span>
                    {renderDiffBadge(techDiff)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs">
                  <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 block mb-1">UI/UX & Impact</span>
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-sm sm:text-base font-bold font-mono text-zinc-900 dark:text-white">
                      {compareEval.score_ui_ux} → {selectedEval.score_ui_ux}
                    </span>
                    {renderDiffBadge(uiUxDiff)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 col-span-2 sm:col-span-1 shadow-xs">
                  <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 block mb-1">Team & Rules</span>
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-sm sm:text-base font-bold font-mono text-zinc-900 dark:text-white">
                      {compareEval.score_team} → {selectedEval.score_team}
                    </span>
                    {renderDiffBadge(teamDiff)}
                  </div>
                </div>
              </div>

              {/* Resolved Red Flags celebration banner */}
              {resolvedRedFlags.length > 0 && (
                <div className="p-3.5 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-300 shadow-xs">
                  <CheckCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-1">Resolved Jury Concerns from v{compareEval.version}:</span>
                    <ul className="space-y-1 list-disc list-inside text-[11px]">
                      {resolvedRedFlags.map((rf, i) => (
                        <li key={i}>{rf}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4 Core Rubric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Novelty */}
            <div className="rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 shadow-xs flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-300">Problem & Novelty</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold text-violet-600 dark:text-violet-400">
                    {selectedEval.score_novelty}/25
                  </span>
                  {compareEval && renderDiffBadge(noveltyDiff)}
                </div>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-1.5 mb-3 overflow-hidden">
                <div
                  className="bg-violet-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(selectedEval.score_novelty / 25) * 100}%` }}
                />
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {selectedEval.ai_feedback?.scoreDeductions?.novelty || "Originality and problem alignment analysis complete."}
              </p>
            </div>

            {/* Technical Architecture */}
            <div className="rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 shadow-xs flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-300">Technical Architecture</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400">
                    {selectedEval.score_tech}/35
                  </span>
                  {compareEval && renderDiffBadge(techDiff)}
                </div>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-1.5 mb-3 overflow-hidden">
                <div
                  className="bg-cyan-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(selectedEval.score_tech / 35) * 100}%` }}
                />
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {selectedEval.ai_feedback?.scoreDeductions?.tech || "Tech stack feasibility and pipeline architecture analysis."}
              </p>
            </div>

            {/* UI/UX & Polish */}
            <div className="rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 shadow-xs flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-300">UI/UX & Impact</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {selectedEval.score_ui_ux}/25
                  </span>
                  {compareEval && renderDiffBadge(uiUxDiff)}
                </div>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-1.5 mb-3 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(selectedEval.score_ui_ux / 25) * 100}%` }}
                />
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {selectedEval.ai_feedback?.scoreDeductions?.uiUx || "Interface presentation, prototype demo, and quantified metrics."}
              </p>
            </div>

            {/* Team Squad & Rules */}
            <div className="rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 shadow-xs flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-300">Team & Rules</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                    {selectedEval.score_team}/15
                  </span>
                  {compareEval && renderDiffBadge(teamDiff)}
                </div>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-1.5 mb-3 overflow-hidden">
                <div
                  className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(selectedEval.score_team / 15) * 100}%` }}
                />
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {selectedEval.ai_feedback?.scoreDeductions?.team || "6-member squad size, female builder rule, and 6-slide max compliance."}
              </p>
            </div>
          </div>

          {/* Slide-by-Slide Actionable Recommendations */}
          {selectedEval.ai_feedback?.slideRecommendations && (
            <div className="rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 shadow-xs">
              <h4 className="text-sm font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                <Award className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <span>Slide-by-Slide Jury Recommendations (Official 6-Slide Template)</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ORDERED_SLIDES.map((slide) => {
                  const rec =
                    selectedEval.ai_feedback?.slideRecommendations?.[slide.key] ||
                    "Include complete section data adhering to SIH official presentation rubric.";

                  return (
                    <div
                      key={slide.key}
                      className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 rounded-xl hover:border-violet-300 dark:hover:border-violet-500/40 transition-colors"
                    >
                      <div className="text-xs font-bold text-violet-700 dark:text-violet-300 mb-1.5 flex items-center justify-between">
                        <span>{slide.label}</span>
                        <span className="text-[10px] font-mono text-zinc-400 font-normal">#{slide.slideNum}</span>
                      </div>
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans">
                        {rec}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Strengths & Red Flags */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Strengths */}
            <div className="rounded-2xl p-5 border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/10 shadow-xs">
              <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase font-mono tracking-wider mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span>Identified Deck Strengths</span>
              </h4>
              <ul className="space-y-2">
                {(selectedEval.ai_feedback?.strengths || ["Problem statement alignment verified."]).map(
                  (str, i) => (
                    <li key={i} className="text-xs text-zinc-800 dark:text-zinc-300 flex items-start gap-2">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                      <span>{str}</span>
                    </li>
                  )
                )}
              </ul>
            </div>

            {/* Red Flags / Format Warnings */}
            <div className="rounded-2xl p-5 border border-rose-500/30 bg-rose-50/50 dark:bg-rose-950/10 shadow-xs">
              <h4 className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase font-mono tracking-wider mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>Jury Warnings & Red Flags</span>
              </h4>
              <ul className="space-y-2">
                {selectedEval.ai_feedback?.spocRedFlags && selectedEval.ai_feedback.spocRedFlags.length > 0 ? (
                  selectedEval.ai_feedback.spocRedFlags.map((rf, i) => (
                    <li key={i} className="text-xs text-zinc-800 dark:text-zinc-300 flex items-start gap-2">
                      <span className="text-rose-600 dark:text-rose-400 font-bold">•</span>
                      <span>{rf}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-zinc-600 dark:text-zinc-400">No critical squad or format red flags detected.</li>
                )}
                {(selectedEval.ai_feedback?.formatViolations || []).map((fv, i) => (
                  <li key={`fv-${i}`} className="text-xs text-amber-700 dark:text-yellow-300 flex items-start gap-2">
                    <span className="text-amber-600 dark:text-yellow-400 font-bold">•</span>
                    <span>{fv}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Evaluation Version History Section */}
      {evaluations.length > 0 && (
        <div className="rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Evaluation Version History ({evaluations.length})
                </h3>
                <p className="text-xs text-zinc-500">
                  Switch active diagnostic scorecard or delete outdated evaluation runs.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {evaluations.map((ev) => {
              const isCurrentSelected = selectedEval?.id === ev.id;
              const isDeleting = deletingId === ev.id;
              const isConfirming = confirmDeleteId === ev.id;

              return (
                <div
                  key={ev.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isCurrentSelected
                      ? "bg-violet-50/70 dark:bg-violet-950/30 border-violet-400 dark:border-violet-500/50 shadow-xs ring-1 ring-violet-400/30"
                      : "bg-zinc-50/70 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                          v{ev.version}
                        </span>
                        <h4 className="text-xs font-bold text-zinc-900 dark:text-white truncate max-w-[180px]">
                          {ev.ps_title}
                        </h4>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5 truncate max-w-[240px]">
                        {ev.file_name} • {new Date(ev.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex flex-col items-end flex-shrink-0">
                      <span className={`text-base font-extrabold font-mono ${getScoreColor(ev.total_score)}`}>
                        {ev.total_score}/100
                      </span>
                      <span className={`badge text-[9px] py-0.2 px-1.5 font-bold ${getGradeBadge(ev.grade)}`}>
                        {ev.grade}
                      </span>
                    </div>
                  </div>

                  {/* Rubric Breakdown Pills */}
                  <div className="grid grid-cols-4 gap-1.5 py-2 my-2 border-y border-zinc-200/80 dark:border-zinc-800/80 text-[10px] font-mono">
                    <div className="text-center">
                      <span className="text-zinc-400 block text-[9px]">Nov</span>
                      <span className="font-bold text-zinc-700 dark:text-zinc-300">{ev.score_novelty}/25</span>
                    </div>
                    <div className="text-center">
                      <span className="text-zinc-400 block text-[9px]">Tech</span>
                      <span className="font-bold text-zinc-700 dark:text-zinc-300">{ev.score_tech}/35</span>
                    </div>
                    <div className="text-center">
                      <span className="text-zinc-400 block text-[9px]">UI/UX</span>
                      <span className="font-bold text-zinc-700 dark:text-zinc-300">{ev.score_ui_ux}/25</span>
                    </div>
                    <div className="text-center">
                      <span className="text-zinc-400 block text-[9px]">Team</span>
                      <span className="font-bold text-zinc-700 dark:text-zinc-300">{ev.score_team}/15</span>
                    </div>
                  </div>

                  {/* Action Controls */}
                  <div className="flex items-center justify-between pt-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedEval(ev)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isCurrentSelected
                          ? "bg-violet-600 text-white shadow-xs"
                          : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{isCurrentSelected ? "Active Scorecard" : "View Scorecard"}</span>
                    </button>

                    {isConfirming ? (
                      <div className="flex items-center gap-1.5 animate-scale-in">
                        <button
                          type="button"
                          onClick={() => handleDeleteEvaluation(ev.id)}
                          disabled={isDeleting}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer"
                        >
                          {isDeleting ? "Deleting..." : "Confirm Delete"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1.5 rounded-lg text-[11px] font-medium bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(ev.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
                        title="Delete this evaluation run"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
