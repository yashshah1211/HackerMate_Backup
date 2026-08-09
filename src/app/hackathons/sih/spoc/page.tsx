"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useNotification } from "@/context/NotificationContext";
import Footer from "@/components/Footer";
import CertificateModal, { UserBadge } from "@/components/CertificateModal";

export default function SIHSpocDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-xs text-zinc-400 font-mono">Loading DJSCE SPOC Command Dashboard...</span>
        </div>
      }
    >
      <SpocDashboardContent />
    </Suspense>
  );
}

function SpocDashboardContent() {
  const { showToast } = useNotification();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isSpocAuthorized, setIsSpocAuthorized] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>("");

  const [collegeName, setCollegeName] = useState("D.J. Sanghvi College of Engineering (DJSCE)");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedSubIds, setSelectedSubIds] = useState<string[]>([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const [selectedSub, setSelectedSub] = useState<any>(null);
  const [editingVivaScore, setEditingVivaScore] = useState<number | "">("");
  const [editingNotes, setEditingNotes] = useState<string>("");
  const [updating, setUpdating] = useState(false);

  // Live Viva Timer & Rubric States (Feature 1)
  const [vivaTimerSeconds, setVivaTimerSeconds] = useState(300);
  const [vivaTimerActive, setVivaTimerActive] = useState(false);
  const [presScore, setPresScore] = useState<number>(25);
  const [qaScore, setQaScore] = useState<number>(30);
  const [protoScore, setProtoScore] = useState<number>(25);

  useEffect(() => {
    let interval: any = null;
    if (vivaTimerActive && vivaTimerSeconds > 0) {
      interval = setInterval(() => {
        setVivaTimerSeconds((prev) => prev - 1);
      }, 1000);
    } else if (vivaTimerSeconds === 0) {
      setVivaTimerActive(false);
    }
    return () => clearInterval(interval);
  }, [vivaTimerActive, vivaTimerSeconds]);

  const [showRestrictedModal, setShowRestrictedModal] = useState(false);
  const [selectedCertBadge, setSelectedCertBadge] = useState<UserBadge | null>(null);
  const [showCertModal, setShowCertModal] = useState(false);

  useEffect(() => {
    fetchSpocData();
  }, [categoryFilter, statusFilter, stageFilter, searchTerm, collegeName]);

  async function fetchSpocData() {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        college: collegeName,
        category: categoryFilter,
        status: statusFilter,
        stage: stageFilter,
        search: searchTerm,
      });

      const res = await fetch(`/api/sih/spoc?${query.toString()}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setSubmissions(data.submissions || []);
        setStats(data.stats || null);
        setIsSpocAuthorized(!!data.isSpocAuthorized);
        if (data.userEmail) setUserEmail(data.userEmail);
      } else {
        showToast(data.error || "Failed to load SPOC master data.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to load SPOC data.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateSpocStatus(subId: string, status: string, vivaScore?: number | "", notes?: string, vivaBreakdown?: any) {
    if (!isSpocAuthorized) {
      setShowRestrictedModal(true);
      return;
    }

    setUpdating(true);
    try {
      const numericViva = typeof vivaScore === "number" ? vivaScore : 0;
      const res = await fetch("/api/sih/spoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: subId,
          spocStatus: status,
          juryVivaScore: numericViva,
          spocNotes: notes,
          vivaBreakdown,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Updated SPOC verification status for team!`, "success");
        setSelectedSub(null);
        fetchSpocData();
      } else {
        showToast(data.error || "Failed to update SPOC decision.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to update SPOC decision.", "error");
    } finally {
      setUpdating(false);
    }
  }

  function handleExportCsv() {
    if (!isSpocAuthorized) {
      setShowRestrictedModal(true);
      return;
    }
    const url = `/api/sih/spoc-export?category=${categoryFilter}&status=${statusFilter}`;
    window.open(url, "_blank");
    showToast("📥 Generating official SIH CSV nomination file...", "info");
  }

  async function handleBulkShortlist(targetStage: string) {
    if (!isSpocAuthorized) {
      setShowRestrictedModal(true);
      return;
    }
    if (selectedSubIds.length === 0) return;

    setBulkUpdating(true);
    try {
      const res = await fetch("/api/sih/spoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionIds: selectedSubIds,
          roundStage: targetStage,
          spocStatus: targetStage === "shortlisted_round2" ? "approved" : targetStage === "final_nominated" ? "nominated" : "approved",
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Updated ${data.count} teams to ${targetStage === "shortlisted_round2" ? "Round 2 Shortlist ⭐" : "Final Nominees 🏆"}!`, "success");
        setSelectedSubIds([]);
        fetchSpocData();
      } else {
        showToast(data.error || "Failed to execute bulk action.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to execute bulk shortlist action.", "error");
    } finally {
      setBulkUpdating(false);
    }
  }

  function toggleSelectAll() {
    if (selectedSubIds.length === submissions.length && submissions.length > 0) {
      setSelectedSubIds([]);
    } else {
      setSelectedSubIds(submissions.map((s) => s.id));
    }
  }

  function toggleSelectRow(subId: string) {
    if (selectedSubIds.includes(subId)) {
      setSelectedSubIds(selectedSubIds.filter((id) => id !== subId));
    } else {
      setSelectedSubIds([...selectedSubIds, subId]);
    }
  }

  const numericViva = typeof editingVivaScore === "number" ? editingVivaScore : 0;

  return (
    <div className="min-h-screen bg-[var(--background)] text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors">
      {/* Top Breadcrumb Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/hackathons/sih"
              className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition flex items-center gap-1.5"
            >
              ← Back to SIH Hackathon Hub
            </Link>
            <span className="text-zinc-300 dark:text-zinc-700">|</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase border ${
                isSpocAuthorized
                  ? "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                  : "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20"
              }`}
            >
              {isSpocAuthorized
                ? `👑 College SPOC Verified (${userEmail || "Admin"})`
                : "🔒 Student / Visitor Mode (Read-Only)"}
            </span>
          </div>

          {isSpocAuthorized && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportCsv}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                📥 Download Official SIH CSV Bulk Export
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Page Body */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 space-y-8">
        {/* Title Header Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-gradient-to-r dark:from-emerald-950 dark:via-zinc-900 dark:to-zinc-950 border border-zinc-200 dark:border-emerald-500/30 p-8 shadow-xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2 max-w-3xl">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-3 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-400 dark:text-zinc-950 dark:border-amber-300">
                  {collegeName}
                </span>
                <span className="text-xs font-mono text-zinc-500 dark:text-emerald-300 font-semibold">
                  2-Round Selection Pipeline 2026
                </span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                SIH 2026 SPOC & HOD Master Command Dashboard
              </h1>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed font-sans max-w-2xl">
                Screen initial pitch decks in Round 1, advance top teams to the Round 2 live presentation round, assign faculty viva scores, and generate official nomination exports.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-zinc-900/90 border border-emerald-200 dark:border-emerald-500/30 text-right space-y-1 font-mono shrink-0">
              <div className="text-[10px] text-emerald-800 dark:text-emerald-400 uppercase font-bold">2-Round Selection Pipeline</div>
              <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">R1 Screening / R2 Shortlist ●</div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Official {collegeName} Screening</div>
            </div>
          </div>
        </div>

        {/* 2-Round Pipeline Stage Tabs */}
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 overflow-x-auto">
          {[
            { id: "all", label: "All Submissions", icon: "📋" },
            { id: "round1_submitted", label: "Round 1 Screening (Submitted)", icon: "📄" },
            { id: "shortlisted_round2", label: "Round 2 Shortlist", icon: "⭐" },
            { id: "final_nominated", label: "Final Nominees (Winners)", icon: "🏆" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStageFilter(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 cursor-pointer shrink-0 border ${
                stageFilter === tab.id
                  ? "bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-500/20"
                  : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Floating Bulk Shortlist Action Bar */}
        {selectedSubIds.length > 0 && isSpocAuthorized && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950 via-zinc-900 to-zinc-950 border border-emerald-500/40 shadow-2xl flex flex-wrap items-center justify-between gap-4 animate-fadeIn">
            <div className="flex items-center gap-3 font-mono text-xs text-white">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold">{selectedSubIds.length} Teams Selected</span>
              <span className="text-zinc-400">| Perform Bulk Action:</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleBulkShortlist("shortlisted_round2")}
                disabled={bulkUpdating}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                ⭐ Advance Selected ({selectedSubIds.length}) to Round 2 Shortlist
              </button>
              <button
                onClick={() => handleBulkShortlist("final_nominated")}
                disabled={bulkUpdating}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                🏆 Nominate Selected ({selectedSubIds.length}) as Final Winners
              </button>
              <button
                onClick={() => setSelectedSubIds([])}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs transition cursor-pointer"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {/* Master Control Search & Filter Bar */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <input
              type="text"
              placeholder="Search team, leader name, PS ID, or Title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 font-mono text-xs focus:outline-none focus:border-emerald-500 flex-1 min-w-[240px]"
            />

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3.5 py-2 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-800 rounded-xl text-xs font-mono font-semibold"
            >
              <option value="all">All Editions (Software + Hardware)</option>
              <option value="software">Software Edition</option>
              <option value="hardware">Hardware Edition</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3.5 py-2 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-800 rounded-xl text-xs font-mono font-semibold"
            >
              <option value="all">All SPOC Statuses</option>
              <option value="pending">Pending Verification</option>
              <option value="approved">Approved Pitch ✅</option>
              <option value="revision_requested">Revision Requested ⚠️</option>
              <option value="rejected">Rejected 🚨</option>
            </select>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-zinc-500">Filtered Count:</span>
            <span className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-bold text-zinc-900 dark:text-white">
              {submissions.length} Teams
            </span>
          </div>
        </div>

        {/* Master Submissions Spreadsheet Table */}
        {loading ? (
          <div className="py-20 text-center text-zinc-500 flex flex-col items-center gap-3 bg-white dark:bg-zinc-900/40 rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <span className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="font-mono text-xs font-bold">Loading {collegeName} Hackathon Submissions...</span>
          </div>
        ) : submissions.length === 0 ? (
          <div className="py-20 text-center text-zinc-500 bg-white dark:bg-zinc-900/40 rounded-2xl border border-zinc-200 dark:border-zinc-800 font-mono text-xs space-y-2">
            <p className="text-base font-bold text-zinc-800 dark:text-zinc-300">No teams found matching current pipeline stage or filters.</p>
            <p className="text-zinc-500 font-sans">Try selecting "All Submissions" tab or clearing search term filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950 shadow-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-100 dark:bg-zinc-900/90 text-zinc-700 dark:text-zinc-300 font-mono text-[11px] border-b border-zinc-200 dark:border-zinc-800">
                  <th className="p-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedSubIds.length === submissions.length && submissions.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-zinc-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-4">Rank & Team</th>
                  <th className="p-4">SIH Problem Statement</th>
                  <th className="p-4">Round Stage</th>
                  <th className="p-4 text-center">AI Score</th>
                  <th className="p-4 text-center">Faculty Viva</th>
                  <th className="p-4 text-center">Final Score</th>
                  <th className="p-4 text-center">SPOC Status</th>
                  <th className="p-4 text-right">SPOC Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-sans">
                {submissions.map((sub, idx) => {
                  const team = sub.teams || {};
                  const members = team.team_members || [];
                  const memberCount = members.length;
                  const hasFemale = members.some(
                    (m: any) => m.profiles?.gender?.toLowerCase() === "female" || m.profiles?.gender?.toLowerCase() === "f"
                  );

                  const aiScore = sub.total_score || 0;
                  const vivaScore = sub.jury_viva_score || 0;
                  const compositeScore = sub.final_composite_score || aiScore;
                  const isChecked = selectedSubIds.includes(sub.id);

                  return (
                    <tr
                      key={sub.id}
                      className={`transition ${
                        isChecked
                          ? "bg-emerald-500/10 dark:bg-emerald-950/30"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                      }`}
                    >
                      <td className="p-4 w-10">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectRow(sub.id)}
                          className="rounded border-zinc-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-4 font-medium">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-zinc-400 text-sm">#{idx + 1}</span>
                          <div>
                            <div className="font-bold text-zinc-900 dark:text-white text-sm">{team.name || "SIH Team"}</div>
                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{team.college || collegeName}</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 max-w-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{sub.ps_number}</span>
                          <span className="px-2 py-0.5 rounded text-[9px] uppercase font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            {sub.ps_category}
                          </span>
                        </div>
                        <div className="font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-2" title={sub.ps_title}>
                          {sub.ps_title}
                        </div>
                        {sub.ppt_url ? (
                          <a
                            href={sub.ppt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block text-[10px] font-mono text-emerald-600 dark:text-emerald-400 hover:underline mt-1"
                          >
                            📄 View PPT Deck →
                          </a>
                        ) : (
                          <span className="inline-block text-[10px] font-mono text-zinc-400 dark:text-zinc-500 mt-1 select-none" title="Pitch PPT URL is strictly private to team members & authorized SPOC jury members">
                            🔒 PPT Deck (Private)
                          </span>
                        )}
                      </td>

                      <td className="p-4 font-mono text-[11px]">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${getRoundStageBadgeClass(
                            sub.round_stage
                          )}`}
                        >
                          {getRoundStageLabel(sub.round_stage)}
                        </span>
                      </td>

                      <td className="p-4 text-center font-mono font-bold text-zinc-900 dark:text-white text-base">
                        {aiScore}
                      </td>

                      <td className="p-4 text-center font-mono font-bold text-amber-600 dark:text-amber-400 text-base">
                        {vivaScore > 0 ? vivaScore : "-"}
                      </td>

                      <td className="p-4 text-center font-mono font-extrabold text-emerald-600 dark:text-emerald-400 text-lg">
                        {compositeScore}
                      </td>

                      <td className="p-4 text-center">
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold border ${getSpocBadgeClass(
                            sub.spoc_approval_status
                          )}`}
                        >
                          {sub.spoc_approval_status || "pending"}
                        </span>
                      </td>

                      <td className="p-4 text-right">
                        {isSpocAuthorized ? (
                          <div className="flex items-center justify-end gap-2">
                            {(sub.spoc_approval_status === "approved" || sub.spoc_approval_status === "nominated") && (
                              <button
                                onClick={() => {
                                  const certBadge: UserBadge = {
                                    id: sub.id,
                                    user_id: sub.submitted_by,
                                    badge_type: "sih_nomination",
                                    badge_name: `SIH 2026 Official DJSCE Internal Finalist (${sub.ps_number})`,
                                    issuer_name: "D.J. Sanghvi College of Engineering (DJSCE) x HackerMate",
                                    rank_title: "Official College Nominee",
                                    metadata: {
                                      certificate_id: `DJSCE-SIH26-${sub.id.slice(0, 8).toUpperCase()}`,
                                      team_name: team.name || "SIH Squad",
                                      track: sub.ps_category === "software" ? "Software Edition" : "Hardware Edition",
                                    },
                                    issued_at: new Date().toISOString(),
                                  };
                                  setSelectedCertBadge(certBadge);
                                  setShowCertModal(true);
                                }}
                                className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold rounded-xl transition text-xs cursor-pointer flex items-center gap-1"
                                title="View & Issue Official DJSCE Nomination Certificate PDF"
                              >
                                📜 Certificate
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setSelectedSub(sub);
                                setEditingVivaScore(sub.jury_viva_score || 80);
                                setEditingNotes(sub.spoc_notes || "");
                                setVivaTimerSeconds(300);
                                setVivaTimerActive(false);
                                const vb = sub.viva_breakdown || sub.ai_feedback?.viva_breakdown || {};
                                setPresScore(vb.presentationScore ?? 25);
                                setQaScore(vb.qaScore ?? 30);
                                setProtoScore(vb.prototypeScore ?? 25);
                              }}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition text-xs cursor-pointer shadow-md"
                            >
                              SPOC Review →
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowRestrictedModal(true)}
                            className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700 font-medium rounded-xl text-xs cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700"
                          >
                            🔒 SPOC Access Restricted
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Restricted Access Information Modal */}
      {showRestrictedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔒</span>
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">
                  College SPOC & HOD Restricted Access
                </h3>
              </div>
              <button
                onClick={() => setShowRestrictedModal(false)}
                className="text-zinc-400 hover:text-white text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs font-sans">
              <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                Administrative actions (live faculty viva grading, pitch status approvals, and bulk CSV exports) are strictly restricted to verified DJSCE College SPOC, HOD, and Faculty accounts.
              </p>

              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1 font-mono text-[11px]">
                <div className="text-zinc-500">Current Session Account:</div>
                <div className="font-bold text-zinc-900 dark:text-white">{userEmail || "Not signed in"}</div>
                <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold pt-1">
                  Status: Student / Non-SPOC Account (Read-Only Mode)
                </div>
              </div>

              <p className="text-[11px] text-zinc-500">
                If you are a DJSCE faculty member or designated SPOC, please sign in with your institutional SPOC or HOD email account.
              </p>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setShowRestrictedModal(false)}
                  className="px-5 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold transition shadow-md cursor-pointer"
                >
                  Understood
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SPOC Decision Drawer Modal */}
      {selectedSub && isSpocAuthorized && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-base text-zinc-900 dark:text-white">
                SPOC Decision: {selectedSub.teams?.name}
              </h3>
              <button
                onClick={() => setSelectedSub(null)}
                className="text-zinc-400 hover:text-white text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs max-h-[75vh] overflow-y-auto pr-1">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1">
                <div className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  PS #{selectedSub.ps_number} • {selectedSub.theme}
                </div>
                <div className="text-zinc-800 dark:text-zinc-200 font-medium">{selectedSub.ps_title}</div>
              </div>

              {/* Live 5-Minute Presentation Timer (Feature 1) */}
              <div className="p-4 rounded-xl bg-slate-900 dark:bg-zinc-950 border border-slate-800 dark:border-zinc-800 text-white space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Live Jury Presentation Timer
                    </span>
                  </div>
                  <span className={`font-mono text-xs px-2.5 py-1 rounded-md font-bold border ${
                    vivaTimerSeconds === 0
                      ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                      : vivaTimerSeconds <= 60
                      ? "bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse"
                      : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                  }`}>
                    {vivaTimerSeconds === 0 ? "🚨 TIME'S UP" : vivaTimerSeconds <= 60 ? "⚠️ 1 MIN REMAINING" : "⏱️ IN PROGRESS"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                  <div className="font-mono text-3xl font-black tracking-widest text-emerald-400">
                    {Math.floor(vivaTimerSeconds / 60).toString().padStart(2, "0")}:
                    {(vivaTimerSeconds % 60).toString().padStart(2, "0")}
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setVivaTimerActive(!vivaTimerActive)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition cursor-pointer shadow-md flex items-center gap-1.5 ${
                        vivaTimerActive
                          ? "bg-amber-500 text-zinc-950 hover:bg-amber-400"
                          : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                      }`}
                    >
                      {vivaTimerActive ? "⏸️ Pause" : "▶️ Start Timer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVivaTimerActive(false);
                        setVivaTimerSeconds(300);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold font-mono bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition cursor-pointer flex items-center gap-1.5 shadow-md"
                      title="Reset timer to 5:00"
                    >
                      🔄 Reset Timer
                    </button>
                  </div>
                </div>
              </div>

              {/* 3-Part Faculty Viva Rubric (Feature 1) */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-4">
                <div className="flex items-center justify-between font-mono">
                  <span className="font-bold text-zinc-900 dark:text-white text-xs">Faculty Live Viva Rubric Breakdown</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">
                    Calculated Viva Score: {presScore + qaScore + protoScore} / 100 pts
                  </span>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-zinc-600 dark:text-zinc-400">1. Pitch Presentation & Slides (0-30 pts):</span>
                      <span className="font-bold text-zinc-900 dark:text-white">{presScore} pts</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="30"
                      value={presScore}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setPresScore(val);
                        setEditingVivaScore(val + qaScore + protoScore);
                      }}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-zinc-600 dark:text-zinc-400">2. Technical Q&A & Defense (0-40 pts):</span>
                      <span className="font-bold text-zinc-900 dark:text-white">{qaScore} pts</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={qaScore}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setQaScore(val);
                        setEditingVivaScore(presScore + val + protoScore);
                      }}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-zinc-600 dark:text-zinc-400">3. Working Prototype / Tech Proof (0-30 pts):</span>
                      <span className="font-bold text-zinc-900 dark:text-white">{protoScore} pts</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="30"
                      value={protoScore}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setProtoScore(val);
                        setEditingVivaScore(presScore + qaScore + val);
                      }}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center text-[11px] font-mono">
                  <span className="text-zinc-500">Composite Score Formula:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {Math.round((selectedSub.total_score || 0) * 0.6 + (presScore + qaScore + protoScore) * 0.4)} pts (60% AI Pitch + 40% Viva)
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-zinc-700 dark:text-zinc-300">
                  SPOC Committee Notes & Student Feedback
                </label>
                <textarea
                  rows={3}
                  placeholder="Enter notes or revision feedback for team..."
                  value={editingNotes}
                  onChange={(e) => setEditingNotes(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl p-2.5 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-2 pt-2">
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
                  Select SPOC Verification Action:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() =>
                      handleUpdateSpocStatus(
                        selectedSub.id,
                        "approved",
                        presScore + qaScore + protoScore,
                        editingNotes,
                        { presentationScore: presScore, qaScore, prototypeScore: protoScore }
                      )
                    }
                    disabled={updating}
                    className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition text-center cursor-pointer shadow-md"
                  >
                    ✅ Approve Pitch
                  </button>
                  <button
                    onClick={() =>
                      handleUpdateSpocStatus(
                        selectedSub.id,
                        "revision_requested",
                        presScore + qaScore + protoScore,
                        editingNotes,
                        { presentationScore: presScore, qaScore, prototypeScore: protoScore }
                      )
                    }
                    disabled={updating}
                    className="p-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition text-center cursor-pointer shadow-md"
                  >
                    ⚠️ Pitch Revision
                  </button>
                  <button
                    onClick={() =>
                      handleUpdateSpocStatus(
                        selectedSub.id,
                        "rejected",
                        presScore + qaScore + protoScore,
                        editingNotes,
                        { presentationScore: presScore, qaScore, prototypeScore: protoScore }
                      )
                    }
                    disabled={updating}
                    className="p-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition text-center cursor-pointer shadow-md"
                  >
                    🚨 Reject Pitch
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Modal */}
      <CertificateModal
        isOpen={showCertModal}
        onClose={() => setShowCertModal(false)}
        badge={selectedCertBadge}
        recipientName="DJSCE Student Nominee"
      />

      <Footer />
    </div>
  );
}

function getSpocBadgeClass(status: string) {
  if (status === "approved" || status === "nominated")
    return "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30";
  if (status === "revision_requested")
    return "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/30";
  if (status === "rejected")
    return "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30";
  return "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700";
}

function getRoundStageBadgeClass(stage: string) {
  if (stage === "shortlisted_round2")
    return "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30";
  if (stage === "final_nominated")
    return "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30";
  if (stage === "round1_rejected" || stage === "final_rejected")
    return "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30";
  return "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700";
}

function getRoundStageLabel(stage: string) {
  if (stage === "shortlisted_round2") return "⭐ Round 2 Shortlist";
  if (stage === "final_nominated") return "🏆 Final Nominee";
  if (stage === "round1_rejected") return "🚨 R1 Eliminated";
  if (stage === "final_rejected") return "🚨 R2 Eliminated";
  return "📄 R1 Submitted";
}

