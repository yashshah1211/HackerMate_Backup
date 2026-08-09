"use client";

import { useState, useEffect } from "react";
import { useNotification } from "@/context/NotificationContext";
import { SIH_PROBLEM_STATEMENTS, SIHProblemStatement } from "@/lib/sihProblemStatements";
import { isPptDomainWhitelisted, ALLOWED_PPT_DOMAINS } from "@/lib/sihUrlValidator";

type Team = {
  id: string;
  name: string;
  college?: string | null;
  team_members?: any[];
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
  existingSubmission?: any;
  onSubmitted: (submission?: any) => void;
  onDeleted?: () => void;
};

export default function MockSIHSubmissionModal({
  isOpen,
  onClose,
  team,
  existingSubmission,
  onSubmitted,
  onDeleted,
}: Props) {
  const { showToast, confirm } = useNotification();

  const [psNumber, setPsNumber] = useState(existingSubmission?.ps_number || "");
  const [psTitle, setPsTitle] = useState(existingSubmission?.ps_title || "");
  const [psCategory, setPsCategory] = useState<"software" | "hardware">(
    existingSubmission?.ps_category || "software"
  );
  const [theme, setTheme] = useState(existingSubmission?.theme || "Smart Automation");
  const [pptUrl, setPptUrl] = useState(existingSubmission?.ppt_url || "");
  const [githubUrl, setGithubUrl] = useState(existingSubmission?.github_url || "");
  const [demoUrl, setDemoUrl] = useState(existingSubmission?.demo_url || "");

  const [psSearch, setPsSearch] = useState("");
  const [psFilterCategory, setPsFilterCategory] = useState<"all" | "software" | "hardware">("all");
  const [showPsDropdown, setShowPsDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [evalStage, setEvalStage] = useState<string>("");

  useEffect(() => {
    if (existingSubmission && isOpen) {
      setPsNumber(existingSubmission.ps_number || "");
      setPsTitle(existingSubmission.ps_title || "");
      setPsCategory(existingSubmission.ps_category || "software");
      setTheme(existingSubmission.theme || "Smart Automation");
      setPptUrl(existingSubmission.ppt_url || "");
      setGithubUrl(existingSubmission.github_url || "");
      setDemoUrl(existingSubmission.demo_url || "");
    }
  }, [existingSubmission, isOpen]);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const filteredPsList = SIH_PROBLEM_STATEMENTS.filter((ps) => {
    const matchesCategory = psFilterCategory === "all" || ps.category === psFilterCategory;
    const query = psSearch.toLowerCase().trim();
    const matchesQuery =
      !query ||
      ps.id.toLowerCase().includes(query) ||
      ps.title.toLowerCase().includes(query) ||
      ps.theme.toLowerCase().includes(query) ||
      ps.organization.toLowerCase().includes(query);

    return matchesCategory && matchesQuery;
  });

  function handleSelectPs(ps: SIHProblemStatement) {
    setPsNumber(ps.id);
    setPsTitle(ps.title);
    setPsCategory(ps.category);
    setTheme(ps.theme);
    setPsSearch("");
    setShowPsDropdown(false);
    showToast(`Auto-filled ${ps.id} (${ps.organization})!`, "info");
  }

  function handleDelete() {
    if (!team) return;
    confirm({
      title: "Remove Pitch Presentation",
      message: "Are you sure you want to remove this pitch presentation? You can submit a new one anytime.",
      confirmText: "Remove Pitch",
      cancelText: "Cancel",
      onConfirm: async () => {
        setDeleting(true);
        try {
          const subId = existingSubmission?.id;
          const res = await fetch(`/api/sih/mock-submit?${subId ? `submissionId=${subId}&` : ""}teamId=${team.id}`, {
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
      },
    });
  }

  if (!isOpen || !team) return null;

  const members = team.team_members || [];
  const memberCount = members.length;
  const hasFemale = members.some(
    (m: any) =>
      m.profiles?.gender?.toLowerCase() === "female" ||
      m.profiles?.gender?.toLowerCase() === "f"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmissionError(null);

    if (!psNumber.trim() || !psTitle.trim() || !pptUrl.trim()) {
      showToast("Please fill in PS Number, Title, and PPT link.", "error");
      return;
    }

    // Domain Whitelist Validation
    const domainCheck = isPptDomainWhitelisted(pptUrl);
    if (!domainCheck.isValid && !pptUrl.includes("sample_pitch.pdf")) {
      setSubmissionError(domainCheck.error || "Unallowed PPT domain link.");
      showToast(domainCheck.error || "Unallowed PPT domain link.", "error");
      return;
    }

    setSubmitting(true);
    setEvalStage("1/4: Validating Pitch Domain Whitelist & Drive Accessibility...");

    const idempotencyKey = `sub_${team!.id}_${Date.now()}`;

    try {
      const res = await fetch("/api/sih/mock-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: team!.id,
          psNumber,
          psTitle,
          psCategory,
          theme,
          pptUrl,
          githubUrl,
          demoUrl,
          idempotencyKey,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const errorMsg = data.details ? `${data.error} (${data.details})` : (data.error || "Failed to submit pitch.");
        setSubmissionError(errorMsg);
        showToast(data.error || "Failed to submit pitch.", "error");
        setSubmitting(false);
        return;
      }

      setEvalStage("2/4: Auditing SIH Team Mandates (6 Members, Female Teammate)...");
      await new Promise((r) => setTimeout(r, 400));

      setEvalStage("3/4: Jury AI Technical Architecture Analysis...");
      await new Promise((r) => setTimeout(r, 600));

      setEvalStage("4/4: Finalizing Diagnostic Scorecard...");
      await new Promise((r) => setTimeout(r, 300));

      showToast("🚀 Pitch evaluated! Opening your AI Scorecard...", "success");
      onSubmitted(data.submission);
      onClose();
    } catch (err: any) {
      console.error(err);
      setSubmissionError(err.message || "Failed to submit pitch.");
      showToast(err.message || "Failed to submit pitch.", "error");
    } finally {
      setSubmitting(false);
      setEvalStage("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col transition-colors">
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-gradient-to-r dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase bg-emerald-100 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20">
                Official Mock SIH Pitch Submission
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono font-bold">
                {team.name}
              </span>
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
              {existingSubmission ? "Update Pitch Deck & SIH Details" : "Submit Pitch Deck for Mock SIH 2026"}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Team Mandates Banner */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="flex items-center justify-between font-mono">
              <span className="font-bold text-zinc-700 dark:text-zinc-300">SIH Team Mandate Status</span>
              <span className="text-[10px] text-zinc-500 font-normal">Official SIH 2026 Rulebook</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
              <div className="flex items-center gap-2">
                <span className={memberCount === 6 ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-rose-600 dark:text-rose-400 font-bold"}>
                  {memberCount === 6 ? "✓" : "🚨"} {memberCount}/6 Members
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={hasFemale ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-rose-600 dark:text-rose-400 font-bold"}>
                  {hasFemale ? "✓ Female Teammate" : "🚨 Missing Female Teammate"}
                </span>
              </div>
            </div>
            {(!hasFemale || memberCount !== 6) && (
              <p className="text-[10px] text-rose-600 dark:text-rose-400 font-sans italic pt-1">
                Note: Non-compliant teams will have penalty deductions applied on the scorecard, but can still submit for practice feedback.
              </p>
            )}
          </div>

          {/* Search SIH PS Dropdown */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-zinc-700 dark:text-zinc-300 font-semibold">
                Auto-Fill SIH 2026 Problem Statement (Search {SIH_PROBLEM_STATEMENTS.length}+ Official Statements)
              </label>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                {SIH_PROBLEM_STATEMENTS.length} Available
              </span>
            </div>
            <input
              type="text"
              placeholder="Search by PS ID, Keyword, Theme, or Ministry (e.g. 1280, Railway, AI, Drone, Medical)..."
              value={psSearch}
              onFocus={() => setShowPsDropdown(true)}
              onChange={(e) => {
                setPsSearch(e.target.value);
                setShowPsDropdown(true);
              }}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-emerald-300 dark:border-emerald-500/30 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500 text-xs font-mono"
            />

            {showPsDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-80">
                {/* Category Filter Pills Header */}
                <div className="p-2.5 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-1.5 font-mono text-[10px]">
                    <button
                      type="button"
                      onClick={() => setPsFilterCategory("all")}
                      className={`px-2 py-0.5 rounded-md font-bold transition ${
                        psFilterCategory === "all"
                          ? "bg-emerald-600 text-white dark:bg-emerald-500"
                          : "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300"
                      }`}
                    >
                      All ({SIH_PROBLEM_STATEMENTS.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPsFilterCategory("software")}
                      className={`px-2 py-0.5 rounded-md font-bold transition ${
                        psFilterCategory === "software"
                          ? "bg-emerald-600 text-white dark:bg-emerald-500"
                          : "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300"
                      }`}
                    >
                      Software ({SIH_PROBLEM_STATEMENTS.filter((p) => p.category === "software").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPsFilterCategory("hardware")}
                      className={`px-2 py-0.5 rounded-md font-bold transition ${
                        psFilterCategory === "hardware"
                          ? "bg-emerald-600 text-white dark:bg-emerald-500"
                          : "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300"
                      }`}
                    >
                      Hardware ({SIH_PROBLEM_STATEMENTS.filter((p) => p.category === "hardware").length})
                    </button>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                    Showing {filteredPsList.length}
                  </span>
                </div>

                {/* List Items */}
                <div className="overflow-y-auto flex-1 divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredPsList.length === 0 ? (
                    <div className="p-4 text-zinc-500 dark:text-zinc-400 text-center text-xs">
                      No matching SIH problem statement found. Type manually below!
                    </div>
                  ) : (
                    filteredPsList.map((ps) => (
                      <button
                        key={ps.id}
                        type="button"
                        onClick={() => handleSelectPs(ps)}
                        className="w-full text-left p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition flex items-center justify-between gap-3 text-xs group"
                      >
                        <div className="truncate">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{ps.id}</span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                              {ps.organization}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] uppercase font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                              {ps.theme}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[8px] uppercase font-mono font-bold ${
                              ps.category === "software"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400"
                            }`}>
                              {ps.category}
                            </span>
                          </div>
                          <div className="text-zinc-800 dark:text-zinc-200 font-medium truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                            {ps.title}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 shrink-0">
                          Select →
                        </span>
                      </button>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowPsDropdown(false)}
                  className="w-full py-2 text-center text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 text-[10px] uppercase font-mono bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 shrink-0"
                >
                  Close Dropdown
                </button>
              </div>
            )}
          </div>

          {/* PS Number & Title */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-semibold mb-1.5">
                Problem Statement ID *
              </label>
              <input
                type="text"
                placeholder="e.g. SIH1524"
                value={psNumber}
                onChange={(e) => setPsNumber(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-zinc-700 dark:text-zinc-300 font-semibold mb-1.5">
                Problem Statement Title *
              </label>
              <input
                type="text"
                placeholder="e.g. Smart Traffic Management & Emergency Vehicle Dispatch using AI"
                value={psTitle}
                onChange={(e) => setPsTitle(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
          </div>

          {/* Category & Theme */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-semibold mb-1.5">PS Category *</label>
              <select
                value={psCategory}
                onChange={(e: any) => setPsCategory(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="software">Software Edition</option>
                <option value="hardware">Hardware Edition</option>
              </select>
            </div>
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-semibold mb-1.5">Domain / Theme</label>
              <input
                type="text"
                placeholder="e.g. MedTech, Smart Automation, Agriculture"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* PPT Link (Required + Domain Whitelist Protection) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-zinc-700 dark:text-zinc-300 font-semibold">
                SIH 6-Slide Pitch PPT Link *
              </label>
              <button
                type="button"
                onClick={() => {
                  const sampleLink = `${window.location.origin}/sih1330_sample_pitch.pdf`;
                  setPptUrl(sampleLink);
                  if (!githubUrl) setGithubUrl("https://github.com/hackermate/sih1330-ai-tour-guide");
                  if (!demoUrl) setDemoUrl("https://youtu.be/dQw4w9WgXcQ");
                  showToast("⚡ Auto-filled official SIH1330 6-Slide Demo PDF Pitch!", "info");
                }}
                className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10 hover:bg-emerald-200 dark:hover:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-500/30 transition cursor-pointer"
              >
                ⚡ Auto-Fill Demo 6-Slide Pitch PDF
              </button>
            </div>
            <div className="flex items-start gap-2 mb-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-700/30">
              <span className="text-amber-500 text-sm mt-0.5 shrink-0">🛡️</span>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                <strong>Domain Whitelist Active:</strong> PPT link must be hosted on Google Drive/Slides, Canva, OneDrive, Gamma, Pitch, Figma, Notion, or Dropbox. Set permission to <strong>"Anyone with link can view"</strong> during evaluation.
              </p>
            </div>

            <input
              type="url"
              placeholder="https://docs.google.com/presentation/d/... or https://canva.com/design/..."
              value={pptUrl}
              onChange={(e) => setPptUrl(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
              required
            />

            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] text-zinc-500 font-mono">Allowed Cloud Providers:</span>
              {["Google Drive/Slides", "Canva", "OneDrive", "SharePoint", "Figma", "Pitch", "Gamma", "Notion", "Dropbox"].map((d) => (
                <span key={d} className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                  {d}
                </span>
              ))}
            </div>
          </div>

          {/* Optional Code & Demo Links */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-semibold mb-1">
                GitHub Repository URL (Optional)
              </label>
              <input
                type="url"
                placeholder="https://github.com/org/repo"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
              />
            </div>
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-semibold mb-1">
                Live Prototype / Video Demo (Optional)
              </label>
              <input
                type="url"
                placeholder="https://youtube.com/watch?v=... or https://demo.app"
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
              />
            </div>
          </div>

          {/* Error Message Display */}
          {submissionError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs font-mono">
              ⚠️ {submissionError}
            </div>
          )}

          {/* Eval Stage Loader Banner */}
          {submitting && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-500/30 text-center space-y-2">
              <div className="flex items-center justify-center gap-2 font-mono font-bold text-emerald-800 dark:text-emerald-400">
                <span className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span>Evaluating Pitch Deck...</span>
              </div>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-mono">{evalStage}</p>
            </div>
          )}

          {/* Footer Submit Action */}
          <div className="pt-2 flex items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800">
            {existingSubmission ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting || deleting}
                className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:border-rose-800/60 dark:text-rose-300 font-semibold text-xs transition cursor-pointer"
              >
                {deleting ? "Removing..." : "🗑️ Remove Pitch Deck"}
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting || deleting}
                className="px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || deleting}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-extrabold shadow-lg shadow-emerald-500/20 transition cursor-pointer flex items-center gap-2"
              >
                {submitting ? "Evaluating..." : existingSubmission ? "🚀 Save & Re-Evaluate Pitch" : "🚀 Submit & Screen Pitch Deck"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
