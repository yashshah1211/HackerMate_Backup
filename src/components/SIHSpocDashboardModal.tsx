"use client";

import { useEffect, useState } from "react";
import { useNotification } from "@/context/NotificationContext";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  collegeName?: string;
};

export default function SIHSpocDashboardModal({
  isOpen,
  onClose,
  collegeName = "D.J. Sanghvi College of Engineering (DJSCE)",
}: Props) {
  const { showToast } = useNotification();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isSpocAuthorized, setIsSpocAuthorized] = useState<boolean>(false);

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedSub, setSelectedSub] = useState<any>(null);
  const [editingVivaScore, setEditingVivaScore] = useState<number | "">("");
  const [editingNotes, setEditingNotes] = useState<string>("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSpocData();
    }
  }, [isOpen, categoryFilter, statusFilter, searchTerm, collegeName]);

  async function fetchSpocData() {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        college: collegeName,
        category: categoryFilter,
        status: statusFilter,
        search: searchTerm,
      });

      const res = await fetch(`/api/sih/spoc?${query.toString()}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setSubmissions(data.submissions || []);
        setStats(data.stats || null);
        setIsSpocAuthorized(!!data.isSpocAuthorized);
      } else {
        showToast(data.error || "Failed to load SPOC data.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to load SPOC data.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateSpocStatus(subId: string, status: string, vivaScore?: number | "", notes?: string) {
    if (!isSpocAuthorized) {
      showToast("Access Restricted. Only authorized College SPOC / HOD accounts can perform review actions.", "error");
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
      showToast("Access Restricted. Only authorized College SPOC / HOD accounts can export CSV.", "error");
      return;
    }
    const url = `/api/sih/spoc-export?category=${categoryFilter}&status=${statusFilter}`;
    window.open(url, "_blank");
    showToast("📥 Exporting official SIH CSV Nomination File...", "info");
  }

  if (!isOpen) return null;

  const numericViva = typeof editingVivaScore === "number" ? editingVivaScore : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-5xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col transition-colors">
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800/80 bg-emerald-50/80 dark:bg-gradient-to-r dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase bg-emerald-200/80 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20">
                Official College SPOC & HOD Control Portal
              </span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400 font-mono">{collegeName}</span>
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
              SIH 2026 Internal Hackathon Submissions & Pitch Manager
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {isSpocAuthorized && (
              <button
                onClick={handleExportCsv}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                📥 Download Official SIH CSV Bulk Export
              </button>
            )}
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
          {/* Status Stats Bar (Unlimited Pitches & Approvals) */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-1">
                <div className="text-2xl font-extrabold text-zinc-900 dark:text-white font-mono">
                  {stats.totalTeams}
                </div>
                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Total Registered Pitches</div>
                <div className="text-[10px] text-zinc-500 font-mono">Internal DJSCE Master List</div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30 space-y-1">
                <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 font-mono">
                  {stats.nominatedSoftware}
                </div>
                <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">Software Edition Approved</div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">Approved Pitches</div>
              </div>

              <div className="p-4 rounded-xl bg-sky-50/80 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-500/30 space-y-1">
                <div className="text-2xl font-extrabold text-sky-700 dark:text-sky-400 font-mono">
                  {stats.nominatedHardware}
                </div>
                <div className="text-xs font-semibold text-sky-900 dark:text-sky-300">Hardware Edition Approved</div>
                <div className="text-[10px] text-sky-600 dark:text-sky-400 font-mono">Approved Pitches</div>
              </div>

              <div className="p-4 rounded-xl bg-rose-50/80 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-500/30 space-y-1">
                <div className="text-2xl font-extrabold text-rose-700 dark:text-rose-400 font-mono">
                  {stats.ruleViolations}
                </div>
                <div className="text-xs font-semibold text-rose-900 dark:text-rose-300">Rule Violation Flags</div>
                <div className="text-[10px] text-rose-600 dark:text-rose-400 font-mono">Missing Female Teammate / &lt;6 Members</div>
              </div>
            </div>
          )}

          {/* Search & Filter Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <input
                type="text"
                placeholder="Search team name, PS ID, or title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 font-mono text-xs focus:outline-none focus:border-emerald-500 flex-1 min-w-[200px]"
              />

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-1.5 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-800 rounded-lg text-xs font-mono font-semibold"
              >
                <option value="all">All Editions (Software + Hardware)</option>
                <option value="software">Software Edition</option>
                <option value="hardware">Hardware Edition</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-800 rounded-lg text-xs font-mono font-semibold"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending Verification</option>
                <option value="approved">Approved Pitch ✅</option>
                <option value="revision_requested">Revision Requested ⚠️</option>
                <option value="rejected">Rejected 🚨</option>
              </select>
            </div>

            <div className="text-[11px] font-mono text-zinc-500">
              Filtered: <strong className="text-zinc-900 dark:text-white">{submissions.length}</strong> teams
            </div>
          </div>

          {/* Submissions Table */}
          {loading ? (
            <div className="py-16 text-center text-zinc-500 flex flex-col items-center gap-2">
              <span className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="font-mono text-xs">Loading DJSCE Submissions...</span>
            </div>
          ) : submissions.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 font-mono text-xs">
              No submissions found matching selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-mono text-[11px] border-b border-zinc-200 dark:border-zinc-800">
                    <th className="p-3">Rank & Team</th>
                    <th className="p-3">PS Details</th>
                    <th className="p-3">Compliance</th>
                    <th className="p-3 text-center">AI Score</th>
                    <th className="p-3 text-center">Viva Score</th>
                    <th className="p-3 text-center">Composite Score</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-sans">
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

                    return (
                      <tr key={sub.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition">
                        <td className="p-3 font-medium">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-zinc-400">#{idx + 1}</span>
                            <div>
                              <div className="font-bold text-zinc-900 dark:text-white">{team.name || "SIH Team"}</div>
                              <div className="text-[10px] text-zinc-500 font-mono">{team.college || collegeName}</div>
                            </div>
                          </div>
                        </td>

                        <td className="p-3 max-w-xs">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{sub.ps_number}</span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] uppercase font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                              {sub.ps_category}
                            </span>
                          </div>
                          <div className="font-medium text-zinc-800 dark:text-zinc-200 truncate" title={sub.ps_title}>
                            {sub.ps_title}
                          </div>
                        </td>

                        <td className="p-3 font-mono text-[10px]">
                          <div className="space-y-0.5">
                            <span
                              className={`inline-block px-2 py-0.2 rounded font-bold ${
                                memberCount === 6
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400"
                                  : "bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-400"
                              }`}
                            >
                              {memberCount}/6 Members
                            </span>
                            <br />
                            <span
                              className={`inline-block px-2 py-0.2 rounded font-bold ${
                                hasFemale
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400"
                                  : "bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-400"
                              }`}
                            >
                              {hasFemale ? "✓ Female Teammate" : "🚨 No Female"}
                            </span>
                          </div>
                        </td>

                        <td className="p-3 text-center font-mono font-bold text-zinc-900 dark:text-white text-sm">
                          {aiScore}
                        </td>

                        <td className="p-3 text-center font-mono font-bold text-amber-600 dark:text-amber-400 text-sm">
                          {vivaScore > 0 ? vivaScore : "-"}
                        </td>

                        <td className="p-3 text-center font-mono font-extrabold text-emerald-600 dark:text-emerald-400 text-base">
                          {compositeScore}
                        </td>

                        <td className="p-3 text-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${getSpocBadgeClass(
                              sub.spoc_approval_status
                            )}`}
                          >
                            {sub.spoc_approval_status || "pending"}
                          </span>
                        </td>

                        <td className="p-3 text-right">
                          {isSpocAuthorized ? (
                            <button
                              onClick={() => {
                                setSelectedSub(sub);
                                setEditingVivaScore(sub.jury_viva_score || "");
                                setEditingNotes(sub.spoc_notes || "");
                              }}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition text-[11px] cursor-pointer"
                            >
                              Review →
                            </button>
                          ) : (
                            <span className="text-[10px] text-zinc-400 font-mono italic">Read-Only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Review Modal Drawer */}
      {selectedSub && isSpocAuthorized && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-base text-zinc-900 dark:text-white">
                SPOC Review: {selectedSub.teams?.name}
              </h3>
              <button
                onClick={() => setSelectedSub(null)}
                className="text-zinc-400 hover:text-white text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1">
                <div className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  PS #{selectedSub.ps_number} • {selectedSub.theme}
                </div>
                <div className="text-zinc-800 dark:text-zinc-200 font-medium">{selectedSub.ps_title}</div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-zinc-700 dark:text-zinc-300">
                  Faculty / Jury Live Viva Score (0 - 100 pts)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="Enter viva score (e.g. 85)..."
                  value={editingVivaScore}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") setEditingVivaScore("");
                    else setEditingVivaScore(Math.min(100, Math.max(0, parseInt(val, 10))));
                  }}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl p-2.5 font-mono text-sm text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-zinc-500 font-mono mt-1 block">
                  Composite Score: {Math.round((selectedSub.total_score || 0) * 0.6 + numericViva * 0.4)} pts (60% AI Pitch + 40% Viva)
                </span>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-zinc-700 dark:text-zinc-300">
                  SPOC Committee Notes / Feedback for Team
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
                  Select Verification Action:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() =>
                      handleUpdateSpocStatus(selectedSub.id, "approved", editingVivaScore, editingNotes)
                    }
                    disabled={updating}
                    className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition text-center cursor-pointer shadow-md"
                  >
                    ✅ Approve Pitch
                  </button>
                  <button
                    onClick={() =>
                      handleUpdateSpocStatus(selectedSub.id, "revision_requested", editingVivaScore, editingNotes)
                    }
                    disabled={updating}
                    className="p-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition text-center cursor-pointer shadow-md"
                  >
                    ⚠️ Pitch Revision
                  </button>
                  <button
                    onClick={() =>
                      handleUpdateSpocStatus(selectedSub.id, "rejected", editingVivaScore, editingNotes)
                    }
                    disabled={updating}
                    className="p-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition text-center cursor-pointer shadow-md"
                  >
                    🚨 Flag / Reject
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
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
