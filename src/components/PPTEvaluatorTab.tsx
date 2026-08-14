"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  FileText,
  Upload,
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
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form State
  const [inputMode, setInputMode] = useState<"upload" | "link">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [externalLink, setExternalLink] = useState("");
  const [psTitle, setPsTitle] = useState("");
  const [psCategory, setPsCategory] = useState("software");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

      if (res.ok) {
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

    if (inputMode === "upload" && !file) {
      setErrorMsg("Please select a presentation PDF file to upload.");
      return;
    }

    if (inputMode === "link" && !externalLink.trim()) {
      setErrorMsg("Please paste your Google Slides or Drive presentation link.");
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

      const formData = new FormData();
      if (inputMode === "upload" && file) {
        formData.append("file", file);
      }
      if (inputMode === "link" && externalLink) {
        formData.append("external_link_url", externalLink.trim());
      }
      formData.append("ps_title", psTitle.trim() || "SIH 2026 Problem Statement");
      formData.append("ps_category", psCategory);

      const res = await fetch(`/api/teams/${teamId}/ppt-evaluate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setErrorMsg(data.error || "Evaluation failed. Please try again.");
      } else if (data.evaluation) {
        setEvaluations((prev) => [data.evaluation, ...prev]);
        setSelectedEval(data.evaluation);
        setFile(null);
        setExternalLink("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch (err: any) {
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

      const data = await res.json();

      if (!res.ok || data.error) {
        setErrorMsg(data.error || "Failed to delete evaluation record.");
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
              Upload your 6-slide SIH PDF deck or paste your Google Slides link. Receive instant 0–100 rubric scores across Novelty, Technical Architecture, UI/UX, and Squad Compliance with slide-by-slide actionable jury feedback.
            </p>
          </div>

          {evaluations.length > 0 && selectedEval && (
            <div className="flex flex-col items-end flex-shrink-0 bg-white/90 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-xs">
              <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono uppercase mb-1">Active Scorecard Total</div>
              <div className="flex items-baseline gap-1">
                <span className={`text-4xl font-extrabold ${getScoreColor(selectedEval.total_score)}`}>
                  {selectedEval.total_score}
                </span>
                <span className="text-zinc-400 font-mono text-lg">/100</span>
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

          {/* Tab Selector: Upload vs Link */}
          <div className="pt-2">
            <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-900/80 rounded-lg w-fit border border-zinc-200 dark:border-zinc-800 mb-3">
              <button
                type="button"
                onClick={() => setInputMode("upload")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  inputMode === "upload"
                    ? "bg-violet-600 text-white shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload PDF Deck (.pdf)
              </button>
              <button
                type="button"
                onClick={() => setInputMode("link")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  inputMode === "link"
                    ? "bg-violet-600 text-white shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                Google Slides / Drive Link
              </button>
            </div>

            {inputMode === "upload" ? (
              <div>
                <label
                  htmlFor="deck-file-input"
                  className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-violet-500/50 bg-zinc-50 dark:bg-zinc-900/30 hover:bg-zinc-100 dark:hover:bg-zinc-900/50 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all duration-200"
                >
                  <FileText className="w-8 h-8 text-violet-500 dark:text-violet-400 mb-2" />
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">
                    {file ? file.name : "Click to select or drag & drop your 6-slide SIH PDF deck"}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">PDF format up to 15 MB (Processed in-memory)</p>
                </label>
                <input
                  id="deck-file-input"
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </div>
            ) : (
              <div>
                <input
                  type="url"
                  value={externalLink}
                  onChange={(e) => setExternalLink(e.target.value)}
                  placeholder="https://docs.google.com/presentation/d/.../edit?usp=sharing"
                  className="w-full bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 transition-colors"
                />
                <p className="text-xs text-zinc-500 mt-1.5">
                  Make sure your Google Slides presentation is set to &ldquo;Anyone with the link can view&rdquo;.
                </p>
              </div>
            )}
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
                  <span>Evaluating Pitch Deck...</span>
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

          {/* 4 Core Rubric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Novelty */}
            <div className="rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-300">Problem & Novelty</span>
                </div>
                <span className="text-xs font-mono font-bold text-violet-600 dark:text-violet-400">
                  {selectedEval.score_novelty}/25
                </span>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-1.5 mb-3 overflow-hidden">
                <div
                  className="bg-violet-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(selectedEval.score_novelty / 25) * 100}%` }}
                />
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-3 leading-relaxed">
                {selectedEval.ai_feedback?.scoreDeductions?.novelty || "Originality and problem alignment analysis complete."}
              </p>
            </div>

            {/* Technical Architecture */}
            <div className="rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-300">Technical Architecture</span>
                </div>
                <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400">
                  {selectedEval.score_tech}/35
                </span>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-1.5 mb-3 overflow-hidden">
                <div
                  className="bg-cyan-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(selectedEval.score_tech / 35) * 100}%` }}
                />
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-3 leading-relaxed">
                {selectedEval.ai_feedback?.scoreDeductions?.tech || "Tech stack feasibility and pipeline architecture analysis."}
              </p>
            </div>

            {/* UI/UX & Polish */}
            <div className="rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-300">UI/UX & Impact</span>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {selectedEval.score_ui_ux}/25
                </span>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-1.5 mb-3 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(selectedEval.score_ui_ux / 25) * 100}%` }}
                />
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-3 leading-relaxed">
                {selectedEval.ai_feedback?.scoreDeductions?.uiUx || "Interface presentation, prototype demo, and quantified metrics."}
              </p>
            </div>

            {/* Team Squad & Rules */}
            <div className="rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-300">Team & Rules</span>
                </div>
                <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                  {selectedEval.score_team}/15
                </span>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-1.5 mb-3 overflow-hidden">
                <div
                  className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(selectedEval.score_team / 15) * 100}%` }}
                />
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-3 leading-relaxed">
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
