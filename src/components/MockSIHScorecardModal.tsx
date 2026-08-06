"use client";

import { useEffect, useState, useRef } from "react";
import { useNotification } from "@/context/NotificationContext";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  submission: any;
  teamName: string;
  isOwnTeam?: boolean;
  onReEvaluated?: () => void;
  onEditRequested?: (submission: any) => void;
  onDeleted?: () => void;
};

export default function MockSIHScorecardModal({
  isOpen,
  onClose,
  submission,
  teamName,
  isOwnTeam = false,
  onReEvaluated,
  onEditRequested,
  onDeleted,
}: Props) {
  const { showToast } = useNotification();
  const [reEvaluating, setReEvaluating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyVersions, setHistoryVersions] = useState<any[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [displayedSubmission, setDisplayedSubmission] = useState<any>(submission);
  const autoEvalRef = useRef<string | null>(null);

  useEffect(() => {
    setDisplayedSubmission(submission);
    if (submission && isOpen) {
      setSelectedVersionId(submission.id);
      fetchHistory(submission.team_id);

      // Auto-evaluate ONCE if submission has 0 score or status evaluating
      if (
        (!submission.total_score || submission.total_score === 0 || submission.status === "evaluating") &&
        autoEvalRef.current !== submission.id
      ) {
        autoEvalRef.current = submission.id;
        triggerAutoEval(submission.id);
      }
    }
  }, [submission, isOpen]);

  async function triggerAutoEval(subId: string) {
    setReEvaluating(true);
    try {
      const res = await fetch("/api/sih/mock-evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: subId }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.submission) {
        setDisplayedSubmission(data.submission);
        if (onReEvaluated) onReEvaluated();
      } else {
        showToast(data.error || "Evaluation issue encountered. Please re-run AI Jury.", "error");
      }
    } catch (err) {
      console.error("Auto eval error:", err);
    } finally {
      setReEvaluating(false);
    }
  }

  async function fetchHistory(teamId: string) {
    try {
      const res = await fetch(`/api/sih/history?teamId=${teamId}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setHistoryVersions(data.versions || []);
      }
    } catch {
      // Ignore background history fetch errors
    }
  }

  function handleVersionChange(verId: string) {
    setSelectedVersionId(verId);
    const found = historyVersions.find((v) => v.id === verId);
    if (found) {
      setDisplayedSubmission(found);
    }
  }

  if (!isOpen || !displayedSubmission) return null;

  const activeSub = displayedSubmission;
  const totalScore = activeSub.total_score || 0;
  const grade = activeSub.grade || "Pending Evaluation";
  const feedback = activeSub.ai_feedback || {};
  const deductions = activeSub.score_deductions || feedback.scoreDeductions || {};
  const benchmarks = feedback.benchmarks;
  const isStale = activeSub.is_stale || false;

  const scoreNovelty = activeSub.score_novelty || 0;
  const scoreTech = activeSub.score_tech || 0;
  const scoreUiUx = activeSub.score_ui_ux || 0;
  const scoreImpact = activeSub.score_impact || 0;
  const scoreTeam = activeSub.score_team || 0;

  const strengths = feedback.strengths || [];
  const redFlags = feedback.spocRedFlags || [];
  const slideRecs = feedback.slideRecommendations || {};

  const previousVersion = historyVersions.find((v) => v.version === (activeSub.version || 1) - 1);
  const scoreDelta = previousVersion ? totalScore - (previousVersion.total_score || 0) : null;

  async function handleReEvaluate() {
    setReEvaluating(true);
    try {
      const res = await fetch("/api/sih/mock-evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: activeSub.id }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.submission) {
          setDisplayedSubmission(data.submission);
        }
        showToast("⚡ Pitch re-evaluated against latest SIH criteria!", "success");
        if (onReEvaluated) onReEvaluated();
      } else {
        showToast(data.error || "Failed to re-evaluate pitch.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to re-evaluate pitch.", "error");
    } finally {
      setReEvaluating(false);
    }
  }

  async function handleDeleteSubmission() {
    if (!window.confirm("Are you sure you want to remove this pitch deck presentation? You can submit a new one anytime.")) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/sih/mock-submit?submissionId=${activeSub.id}&teamId=${activeSub.team_id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast("🗑️ Pitch presentation removed successfully.", "info");
        if (onDeleted) onDeleted();
        onClose();
      } else {
        showToast(data.error || "Failed to remove pitch presentation.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to remove pitch presentation.", "error");
    } finally {
      setDeleting(false);
    }
  }

  function getGradeBadgeColor(g: string) {
    if (g.includes("Gold")) return "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30";
    if (g.includes("Ready")) return "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30";
    if (g.includes("Needs Iteration")) return "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/30";
    return "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col transition-colors">
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800/80 bg-emerald-50/80 dark:bg-gradient-to-r dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase bg-emerald-200/80 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20">
                Diagnostic Scorecard
              </span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400 font-mono">Team: {teamName}</span>
              {activeSub.version > 1 && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                  Version v{activeSub.version}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
              Mock SIH 2026 Pitch Evaluation
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {historyVersions.length > 1 && (
              <select
                value={selectedVersionId || ""}
                onChange={(e) => handleVersionChange(e.target.value)}
                className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs font-mono font-bold focus:outline-none"
              >
                {historyVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version} ({v.total_score}/100 pts) {v.is_active ? "★ Active" : ""}
                  </option>
                ))}
              </select>
            )}

            {isOwnTeam && (
              <>
                <button
                  onClick={() => {
                    if (onEditRequested) onEditRequested(activeSub);
                  }}
                  className="px-2.5 py-1.5 bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 text-xs font-semibold rounded-lg transition flex items-center gap-1 cursor-pointer shadow-sm"
                  title="Edit or replace pitch deck presentation link"
                >
                  ✏️ Edit / Replace
                </button>
                <button
                  onClick={handleDeleteSubmission}
                  disabled={deleting}
                  className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:border-rose-800/60 dark:text-rose-300 text-xs font-semibold rounded-lg transition disabled:opacity-50 flex items-center gap-1 cursor-pointer shadow-sm"
                  title="Remove pitch deck presentation from team"
                >
                  {deleting ? "Removing..." : "🗑️ Remove Pitch"}
                </button>
              </>
            )}

            <button
              onClick={handleReEvaluate}
              disabled={reEvaluating}
              className="px-3 py-1.5 bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 text-xs font-semibold rounded-lg transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              {reEvaluating ? "Evaluating..." : "🔄 Re-Run AI Jury"}
            </button>

            <button
              onClick={onClose}
              className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
          {/* Re-evaluating banner if auto-evaluating */}
          {reEvaluating && totalScore === 0 && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-between gap-3 text-emerald-800 dark:text-emerald-300">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span className="font-mono text-xs font-bold">Running AI Jury & Heuristic Evaluation for your pitch...</span>
              </div>
            </div>
          )}

          {isStale && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/40 flex items-center justify-between gap-3 text-amber-900 dark:text-amber-300">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <div>
                  <strong className="block text-xs">Team Composition Changed</strong>
                  <span className="text-[11px] text-amber-800 dark:text-amber-400">
                    A team member was added or removed since this pitch was judged. Re-evaluate now to verify updated SIH squad rules.
                  </span>
                </div>
              </div>
              <button
                onClick={handleReEvaluate}
                disabled={reEvaluating}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shrink-0 cursor-pointer shadow-sm"
              >
                Re-Evaluate Now
              </button>
            </div>
          )}

          {/* Main Hero Score Gauge */}
          <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-gradient-to-br dark:from-zinc-900 dark:via-zinc-950 dark:to-zinc-900 border border-zinc-200 dark:border-zinc-800/90 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="relative w-24 h-24 rounded-full bg-white dark:bg-zinc-950 border-4 border-zinc-200 dark:border-zinc-800 flex items-center justify-center shadow-inner shrink-0">
                <div className="text-center">
                  <div className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                    {totalScore}
                  </div>
                  <div className="text-[10px] text-zinc-500 uppercase font-mono font-bold">
                    / 100 PTS
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`inline-block px-3 py-1 rounded-full font-mono text-xs font-bold border ${getGradeBadgeColor(
                      grade
                    )}`}
                  >
                    {grade}
                  </span>
                  {scoreDelta !== null && (
                    <span
                      className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                        scoreDelta >= 0
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-400"
                      }`}
                    >
                      {scoreDelta >= 0 ? `+${scoreDelta}` : scoreDelta} pts vs v{(activeSub.version || 1) - 1}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  PS #{activeSub.ps_number}: {activeSub.ps_title}
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-[11px] mt-0.5">
                  Category: <span className="capitalize font-semibold text-zinc-800 dark:text-zinc-200">{activeSub.ps_category}</span> • Theme: {activeSub.theme}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:items-end gap-2 shrink-0">
              {activeSub.ppt_url && isOwnTeam ? (
                <a
                  href={activeSub.ppt_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-500/20 font-semibold transition text-center"
                >
                  📄 View Submitted Pitch PPT →
                </a>
              ) : (
                <span className="px-3.5 py-2 rounded-lg text-xs font-mono text-zinc-400 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 cursor-not-allowed select-none" title="PPT link is private to the submitting team">
                  🔒 Pitch Deck (Private to Team)
                </span>
              )}
              {activeSub.github_url && isOwnTeam && (
                <a
                  href={activeSub.github_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-1.5 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-800 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition font-mono text-[11px] text-center"
                >
                  💻 GitHub Repository
                </a>
              )}
            </div>
          </div>

          {/* Comparative Benchmarks Grid */}
          {benchmarks && (
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <h4 className="font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider text-[10px] font-mono">
                Comparative Benchmarks
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {benchmarks.teamScore}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-sans font-medium">Your Team</div>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    {benchmarks.collegeAvg !== null && benchmarks.collegeAvg !== undefined
                      ? benchmarks.collegeAvg
                      : "N/A"}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-sans font-medium">
                    {benchmarks.collegeAvg !== null && benchmarks.collegeAvg !== undefined
                      ? "College Avg"
                      : "College Avg (Not enough data)"}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-lg font-bold text-sky-600 dark:text-sky-400">
                    {benchmarks.top10Percent !== null && benchmarks.top10Percent !== undefined
                      ? benchmarks.top10Percent
                      : "N/A"}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-sans font-medium">
                    {benchmarks.top10Percent !== null && benchmarks.top10Percent !== undefined
                      ? "Top 10% Cutoff"
                      : "Top 10% (Not enough data)"}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-lg font-bold text-zinc-700 dark:text-zinc-300">
                    {benchmarks.nationalAvg !== null && benchmarks.nationalAvg !== undefined
                      ? benchmarks.nationalAvg
                      : "N/A"}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-sans font-medium">
                    {benchmarks.nationalAvg !== null && benchmarks.nationalAvg !== undefined
                      ? "National Avg"
                      : "National Avg (Not enough data)"}
                  </div>
                </div>
              </div>
              {(benchmarks.collegeAvg === null || benchmarks.nationalAvg === null) && (
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-sans italic text-center pt-1">
                  * Comparative averages require at least 5 national submissions and 3 college submissions to compute. Metrics will update automatically as more teams submit.
                </p>
              )}
            </div>
          )}

          {/* 5-Dimension Score Progress Bars & Explanations */}
          <div className="p-5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 space-y-4">
            <h4 className="font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider text-[11px] font-mono">
              Judged Criteria Breakdown & Deductions
            </h4>

            <div className="space-y-4">
              {/* Novelty */}
              <div>
                <div className="flex justify-between text-[11px] mb-1 font-medium">
                  <span className="text-zinc-700 dark:text-zinc-300">1. Problem Novelty & Alignment</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">{scoreNovelty} / 20 pts</span>
                </div>
                <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-950 rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(scoreNovelty / 20) * 100}%` }}
                  />
                </div>
                {deductions.novelty && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-sans">
                    💡 <strong className="text-zinc-700 dark:text-zinc-300">Feedback:</strong> {deductions.novelty}
                  </p>
                )}
              </div>

              {/* Tech */}
              <div>
                <div className="flex justify-between text-[11px] mb-1 font-medium">
                  <span className="text-zinc-700 dark:text-zinc-300">2. Technical Architecture & Feasibility</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">{scoreTech} / 25 pts</span>
                </div>
                <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-950 rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(scoreTech / 25) * 100}%` }}
                  />
                </div>
                {deductions.tech && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-sans">
                    💡 <strong className="text-zinc-700 dark:text-zinc-300">Feedback:</strong> {deductions.tech}
                  </p>
                )}
              </div>

              {/* UI/UX */}
              <div>
                <div className="flex justify-between text-[11px] mb-1 font-medium">
                  <span className="text-zinc-700 dark:text-zinc-300">3. UI/UX & Presentation Polish</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">{scoreUiUx} / 20 pts</span>
                </div>
                <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-950 rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(scoreUiUx / 20) * 100}%` }}
                  />
                </div>
                {deductions.uiUx && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-sans">
                    💡 <strong className="text-zinc-700 dark:text-zinc-300">Feedback:</strong> {deductions.uiUx}
                  </p>
                )}
              </div>

              {/* Impact */}
              <div>
                <div className="flex justify-between text-[11px] mb-1 font-medium">
                  <span className="text-zinc-700 dark:text-zinc-300">4. Impact & 36h Implementation Roadmap</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">{scoreImpact} / 20 pts</span>
                </div>
                <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-950 rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(scoreImpact / 20) * 100}%` }}
                  />
                </div>
                {deductions.impact && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-sans">
                    💡 <strong className="text-zinc-700 dark:text-zinc-300">Feedback:</strong> {deductions.impact}
                  </p>
                )}
              </div>

              {/* Team */}
              <div>
                <div className="flex justify-between text-[11px] mb-1 font-medium">
                  <span className="text-zinc-700 dark:text-zinc-300">5. Team Squad Balance & SIH Rules</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">{scoreTeam} / 15 pts</span>
                </div>
                <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-950 rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(scoreTeam / 15) * 100}%` }}
                  />
                </div>
                {deductions.team && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-sans">
                    💡 <strong className="text-zinc-700 dark:text-zinc-300">Feedback:</strong> {deductions.team}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Red Flags & Strengths Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Red Flags / Rejection Risks */}
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-500/30 space-y-2">
              <h4 className="font-bold text-rose-800 dark:text-rose-400 uppercase tracking-wider text-[10px] font-mono flex items-center gap-1.5">
                <span>🚨 SPOC Rejection Risks</span>
                <span>({redFlags.length})</span>
              </h4>
              {redFlags.length === 0 ? (
                <p className="text-zinc-600 dark:text-zinc-400 text-[11px]">No critical red flags detected. Clean submission!</p>
              ) : (
                <ul className="space-y-1.5">
                  {redFlags.map((rf: string, idx: number) => (
                    <li key={idx} className="text-rose-900 dark:text-rose-300 text-[11px] flex items-start gap-1.5">
                      <span className="shrink-0">•</span>
                      <span>{rf}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Strengths */}
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30 space-y-2">
              <h4 className="font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider text-[10px] font-mono flex items-center gap-1.5">
                <span>⭐ Key Strengths</span>
                <span>({strengths.length})</span>
              </h4>
              {strengths.length === 0 ? (
                <p className="text-zinc-600 dark:text-zinc-400 text-[11px]">Evaluating key strengths...</p>
              ) : (
                <ul className="space-y-1.5">
                  {strengths.map((st: string, idx: number) => (
                    <li key={idx} className="text-emerald-900 dark:text-emerald-300 text-[11px] flex items-start gap-1.5">
                      <span className="shrink-0">✓</span>
                      <span>{st}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Slide Advice Section */}
          <div className="p-5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 space-y-3">
            <h4 className="font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider text-[11px] font-mono flex items-center gap-1.5">
              💡 Slide-by-Slide Recommendations for National Finals
            </h4>
            {Object.keys(slideRecs).length === 0 ? (
              <p className="text-zinc-600 dark:text-zinc-400 text-[11px]">No slide feedback available.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {Object.entries(slideRecs).map(([slideKey, text]: [string, any], idx) => (
                  <div key={slideKey} className="p-2.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-700 dark:text-zinc-300 text-[11px]">
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 mr-1.5">Slide {idx + 1}:</span>
                    {text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-between text-[11px]">
          <span className="text-zinc-500 font-mono">Official HackerMate AI Evaluation Engine</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-bold transition cursor-pointer"
          >
            Close Scorecard
          </button>
        </div>
      </div>
    </div>
  );
}
