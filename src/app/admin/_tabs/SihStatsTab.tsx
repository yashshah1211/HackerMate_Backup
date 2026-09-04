"use client";

import { useState, useEffect } from "react";
import { SihStatsResponse, SihCollegeStat } from "../_types";
import { useNotification } from "@/context/NotificationContext";
import { StatusBadge } from "../_components/StatusBadge";
import { AdminStatCard } from "../_components/AdminStatCard";
import {
  Radio,
  Mail,
  RefreshCw,
  AlertTriangle,
  Building2,
  Users,
  ChevronDown,
  ChevronUp,
  Award,
} from "lucide-react";

export default function SihStatsTab() {
  const { showToast } = useNotification();

  const [sihStatsData, setSihStatsData] = useState<SihStatsResponse | null>(null);
  const [loadingSihStats, setLoadingSihStats] = useState(false);
  const [sihCollegeFilter, setSihCollegeFilter] = useState<"all" | "zero_teams">("all");
  const [expandedCollege, setExpandedCollege] = useState<string | null>(null);
  const [sendingSihPdf, setSendingSihPdf] = useState(false);

  async function loadSIHStats() {
    setLoadingSihStats(true);
    try {
      const res = await fetch("/api/admin/sih-college-stats");
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        showToast(`Server returned HTTP ${res.status}`, "error");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setSihStatsData(data);
      } else {
        showToast(data.error || "Failed to load SIH college stats", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to load SIH college stats", "error");
    } finally {
      setLoadingSihStats(false);
    }
  }

  async function sendSIHPdfReport() {
    setSendingSihPdf(true);
    try {
      const res = await fetch("/api/cron/sih-daily-pdf-report", { method: "POST" });
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        showToast(`Server returned HTTP ${res.status}`, "error");
        return;
      }
      const data = await res.json();
      if (data.success) {
        showToast(
          `SIH Daily PDF Report emailed to ${data.recipient || "yashshah7117@gmail.com"}!`,
          "success"
        );
      } else {
        showToast(data.error || "Failed to dispatch SIH PDF report email.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to send SIH PDF report", "error");
    } finally {
      setSendingSihPdf(false);
    }
  }

  useEffect(() => {
    loadSIHStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B4F461] animate-pulse" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 font-semibold">
              National Team Building Telemetry
            </span>
          </div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Smart India Hackathon 2026 — College Breakdown
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Live college-wise telemetry of registered builders, active searchers, team formations, and bottleneck conversions.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0">
          <button
            type="button"
            onClick={sendSIHPdfReport}
            disabled={sendingSihPdf}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-[#B4F461]/10 disabled:opacity-50"
          >
            <Mail className={`w-3.5 h-3.5 ${sendingSihPdf ? "animate-spin" : ""}`} />
            <span>{sendingSihPdf ? "Generating Report..." : "Email PDF Report"}</span>
          </button>
          <button
            type="button"
            onClick={loadSIHStats}
            disabled={loadingSihStats}
            className="px-3.5 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingSihStats ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {loadingSihStats ? (
        <div className="p-16 text-center rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 shadow-xs">
          <RefreshCw className="w-6 h-6 animate-spin text-[#B4F461] mx-auto mb-3" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
            Loading SIH 2026 College Telemetry...
          </p>
        </div>
      ) : !sihStatsData ? (
        <div className="p-12 text-center rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 text-xs text-zinc-500 font-mono">
          Failed to load SIH college statistics.
        </div>
      ) : (
        <>
          {/* Summary Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <AdminStatCard
              title="Total SIH Builders"
              value={sihStatsData.summary.totalBuilders}
              subtitle="Registered builders"
              icon={Users}
            />

            <AdminStatCard
              title="Looking For Team"
              value={sihStatsData.summary.totalLookingForTeam}
              subtitle="Active searchers"
              icon={Radio}
            />

            <AdminStatCard
              title="SIH Teams Formed"
              value={sihStatsData.summary.totalTeams}
              subtitle="Created teams"
              icon={Award}
            />

            <AdminStatCard
              title="Colleges Represented"
              value={sihStatsData.summary.totalColleges}
              subtitle="Unique campuses"
              icon={Building2}
            />

            <AdminStatCard
              title="Bottleneck Colleges"
              value={sihStatsData.summary.highPotentialZeroTeamColleges}
              subtitle="2+ builders, 0 teams"
              icon={AlertTriangle}
              badge={
                sihStatsData.summary.highPotentialZeroTeamColleges > 0 ? (
                  <StatusBadge label="Action Needed" variant="warning" dot />
                ) : (
                  <StatusBadge label="Optimal" variant="neutral" />
                )
              }
            />
          </div>

          {/* Filter Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800/80 shadow-xs">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 select-none">
              <button
                type="button"
                onClick={() => setSihCollegeFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition cursor-pointer ${
                  sihCollegeFilter === "all"
                    ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
                }`}
              >
                All Colleges ({sihStatsData.collegeStats.length})
              </button>
              <button
                type="button"
                onClick={() => setSihCollegeFilter("zero_teams")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
                  sihCollegeFilter === "zero_teams"
                    ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
                }`}
              >
                <span>Conversion Bottlenecks</span>
                <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono text-[10px] font-bold border border-amber-500/25">
                  {sihStatsData.summary.highPotentialZeroTeamColleges}
                </span>
              </button>
            </div>

            <div className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
              Sorted by Builder Count Descending
            </div>
          </div>

          {/* College Cards List */}
          <div className="space-y-4">
            {sihStatsData.collegeStats
              .filter((c: SihCollegeStat) => sihCollegeFilter === "all" || c.isHighPotentialZeroTeams)
              .map((c: SihCollegeStat) => {
                const isExpanded = expandedCollege === c.collegeName;

                return (
                  <div
                    key={c.collegeName}
                    className={`p-5 rounded-2xl border transition shadow-xs ${
                      c.isHighPotentialZeroTeams
                        ? "border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/[0.03]"
                        : "border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 hover:border-zinc-300 dark:hover:border-zinc-700/80"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        {c.isHighPotentialZeroTeams && (
                          <div className="mb-2">
                            <StatusBadge
                              label="High Interest — Zero Teams Formed"
                              variant="warning"
                              dot
                            />
                          </div>
                        )}
                        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-zinc-400 shrink-0" />
                          <span>{c.collegeName}</span>
                        </h3>
                      </div>

                      {/* Metrics Badges & Toggle */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-center">
                          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                            Builders
                          </div>
                          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                            {c.builderCount}
                          </div>
                        </div>

                        <div className="px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-center">
                          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                            Searching
                          </div>
                          <div className="text-sm font-bold text-amber-600 dark:text-amber-400 font-mono">
                            {c.lookingForTeamCount}
                          </div>
                        </div>

                        <div className="px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-center">
                          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                            Teams
                          </div>
                          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                            {c.teamCount}
                          </div>
                        </div>

                        <div className="px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-center">
                          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                            Avg Size
                          </div>
                          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                            {c.avgTeamSize}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCollege(isExpanded ? null : c.collegeName)
                          }
                          className="px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-xs font-mono text-zinc-700 dark:text-zinc-300 cursor-pointer transition flex items-center gap-1 font-semibold"
                        >
                          <span>{isExpanded ? "Hide Roster" : "View Roster"}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Roster & Teams Details */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Builders List */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Registered Builders ({c.builders.length})
                          </h4>
                          <div className="space-y-1.5">
                            {c.builders.map((b) => (
                              <div
                                key={b.id}
                                className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-xs flex items-center justify-between"
                              >
                                <div>
                                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                                    {b.full_name || "Anonymous Builder"}
                                  </div>
                                  <div className="text-[10px] text-zinc-400 font-mono">
                                    {b.email}
                                  </div>
                                </div>
                                {b.looking_for_team && (
                                  <StatusBadge label="Looking for Team" variant="warning" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Teams List */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            Teams Created ({c.teams.length})
                          </h4>
                          {c.teams.length === 0 ? (
                            <div className="p-4 text-center text-xs text-zinc-400 font-mono italic bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800/80">
                              No teams created for this college yet.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {c.teams.map((t) => (
                                <div
                                  key={t.id}
                                  className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-xs space-y-1"
                                >
                                  <div className="flex items-center justify-between font-semibold text-zinc-900 dark:text-zinc-100">
                                    <span>{t.name}</span>
                                    <span className="text-[10px] font-mono text-zinc-500">
                                      {(t.team_members || []).length} / {t.max_members || 6} members
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                                    {t.description || "No description"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
