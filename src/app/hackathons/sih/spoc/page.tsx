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
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedSub, setSelectedSub] = useState<any>(null);
  const [editingVivaScore, setEditingVivaScore] = useState<number | "">("");
  const [editingNotes, setEditingNotes] = useState<string>("");
  const [updating, setUpdating] = useState(false);

  const [showRestrictedModal, setShowRestrictedModal] = useState(false);
  const [selectedCertBadge, setSelectedCertBadge] = useState<UserBadge | null>(null);
  const [showCertModal, setShowCertModal] = useState(false);

  useEffect(() => {
    fetchSpocData();
  }, [categoryFilter, statusFilter, searchTerm, collegeName]);

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

  async function handleUpdateSpocStatus(subId: string, status: string, vivaScore?: number | "", notes?: string) {
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
                  Internal Hackathon Round 2026
                </span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                SIH 2026 SPOC & HOD Master Command Dashboard
              </h1>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed font-sans max-w-2xl">
                Manage all internal screening pitch submissions, faculty jury viva scores, SIH 6-member squad compliance, and generate official bulk nomination exports for the SIH National Portal.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-zinc-900/90 border border-emerald-200 dark:border-emerald-500/30 text-right space-y-1 font-mono shrink-0">
              <div className="text-[10px] text-emerald-800 dark:text-emerald-400 uppercase font-bold">Internal Round Status</div>
              <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">Submissions Active ●</div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Official DJSCE Screening</div>
            </div>
          </div>
        </div>

        {/* Status Metrics Grid */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-1">
              <div className="text-3xl font-extrabold text-zinc-900 dark:text-white font-mono">
                {stats.totalTeams}
              </div>
              <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-300">Total Registered Pitches</div>
              <div className="text-[10px] text-zinc-500 font-mono">Internal DJSCE Master List</div>
            </div>

            <div className="p-5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30 shadow-sm space-y-1">
              <div className="text-3xl font-extrabold text-emerald-800 dark:text-emerald-400 font-mono">
                {stats.nominatedSoftware}
              </div>
              <div className="text-xs font-semibold text-emerald-950 dark:text-emerald-300">Software Edition Approved</div>
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono">Approved Pitches</div>
            </div>

            <div className="p-5 rounded-2xl bg-sky-50/80 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-500/30 shadow-sm space-y-1">
              <div className="text-3xl font-extrabold text-sky-800 dark:text-sky-400 font-mono">
                {stats.nominatedHardware}
              </div>
              <div className="text-xs font-semibold text-sky-950 dark:text-sky-300">Hardware Edition Approved</div>
              <div className="text-[10px] text-sky-700 dark:text-sky-400 font-mono">Approved Pitches</div>
            </div>

            <div className="p-5 rounded-2xl bg-rose-50/80 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-500/30 shadow-sm space-y-1">
              <div className="text-3xl font-extrabold text-rose-800 dark:text-rose-400 font-mono">
                {stats.ruleViolations}
              </div>
              <div className="text-xs font-semibold text-rose-950 dark:text-rose-300">Rule Violation Flags</div>
              <div className="text-[10px] text-rose-800 dark:text-rose-400 font-mono">Missing Female Teammate / &lt;6 Members</div>
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
            <span className="text-zinc-500">Master Record Count:</span>
            <span className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-bold text-zinc-900 dark:text-white">
              {submissions.length} Teams
            </span>
          </div>
        </div>

        {/* Master Submissions Spreadsheet Table */}
        {loading ? (
          <div className="py-20 text-center text-zinc-500 flex flex-col items-center gap-3 bg-white dark:bg-zinc-900/40 rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <span className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="font-mono text-xs font-bold">Loading DJSCE Internal Hackathon Submissions...</span>
          </div>
        ) : submissions.length === 0 ? (
          <div className="py-20 text-center text-zinc-500 bg-white dark:bg-zinc-900/40 rounded-2xl border border-zinc-200 dark:border-zinc-800 font-mono text-xs space-y-2">
            <p className="text-base font-bold text-zinc-800 dark:text-zinc-300">No teams found matching current filters.</p>
            <p className="text-zinc-500 font-sans">Try searching for a different Problem Statement ID or clear category filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950 shadow-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-100 dark:bg-zinc-900/90 text-zinc-700 dark:text-zinc-300 font-mono text-[11px] border-b border-zinc-200 dark:border-zinc-800">
                  <th className="p-4">Rank & Team</th>
                  <th className="p-4">SIH Problem Statement</th>
                  <th className="p-4">Rule Compliance</th>
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

                  return (
                    <tr key={sub.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition">
                      <td className="p-4 font-medium">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-zinc-400 text-sm">#{idx + 1}</span>
                          <div>
                            <div className="font-bold text-zinc-900 dark:text-white text-sm">{team.name || "SIH Team"}</div>
                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{team.college || collegeName}</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 max-w-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{sub.ps_number}</span>
                          <span className="px-2 py-0.5 rounded text-[9px] uppercase font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            {sub.ps_category}
                          </span>
                        </div>
                        <div className="font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-2" title={sub.ps_title}>
                          {sub.ps_title}
                        </div>
                        {sub.ppt_url && (
                          <a
                            href={sub.ppt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block text-[10px] font-mono text-emerald-600 dark:text-emerald-400 hover:underline mt-1"
                          >
                            📄 View PPT Deck →
                          </a>
                        )}
                      </td>

                      <td className="p-4 font-mono text-[11px]">
                        <div className="space-y-1">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold ${
                              memberCount === 6
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-400"
                            }`}
                          >
                            {memberCount}/6 Members
                          </span>
                          <br />
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold ${
                              hasFemale
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-400"
                            }`}
                          >
                            {hasFemale ? "✓ Female Teammate" : "🚨 No Female"}
                          </span>
                        </div>
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
                                setEditingVivaScore(sub.jury_viva_score || "");
                                setEditingNotes(sub.spoc_notes || "");
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
                  Select SPOC Verification Action:
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
