"use client";

import { useState, useEffect } from "react";
import { NativeHackathon } from "../_types";
import { useNotification } from "@/context/NotificationContext";
import { StatusBadge } from "../_components/StatusBadge";
import { AdminStatCard } from "../_components/AdminStatCard";
import {
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  Trash2,
  RefreshCw,
  Globe,
  Coins,
} from "lucide-react";

interface NativeHackathonsTabProps {
  nativeHackathons?: NativeHackathon[];
  loadingNativeHackathons?: boolean;
  onRefresh?: () => Promise<void>;
}

export default function NativeHackathonsTab({
  nativeHackathons: propHackathons,
  loadingNativeHackathons: propLoading,
  onRefresh,
}: NativeHackathonsTabProps = {}) {
  const { showToast, confirm } = useNotification();

  const [localHackathons, setLocalHackathons] = useState<NativeHackathon[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [nativeFilterStatus, setNativeFilterStatus] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");

  const nativeHackathons = propHackathons ?? localHackathons;
  const loadingNativeHackathons = propLoading ?? localLoading;

  async function fetchNativeHackathons() {
    if (onRefresh) {
      await onRefresh();
      return;
    }
    setLocalLoading(true);
    try {
      const res = await fetch("/api/admin/hackathons");
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        const errorMsg = `Server returned ${res.status}`;
        showToast(errorMsg, "error");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setLocalHackathons(data.hackathons || []);
      } else {
        showToast(data.error || "Failed to fetch native hackathons.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to fetch native hackathons.", "error");
    } finally {
      setLocalLoading(false);
    }
  }

  useEffect(() => {
    if (!propHackathons) {
      fetchNativeHackathons();
    }
  }, [propHackathons]);

  function handleNativeHackathonAction(
    hackathonId: string,
    action: "approve" | "reject" | "delete",
    name?: string
  ) {
    if (action === "delete") {
      confirm({
        title: "PERMANENTLY DELETE HACKATHON",
        message: `Are you sure you want to permanently delete "${name || "this hackathon"}" from HackerMate? This will remove all associated teams and registrations. This action cannot be undone.`,
        confirmText: "Delete Permanently",
        onConfirm: async () => {
          executeHackathonAction(hackathonId, action);
        },
      });
      return;
    }
    executeHackathonAction(hackathonId, action);
  }

  async function executeHackathonAction(hackathonId: string, action: string) {
    try {
      const res = await fetch("/api/admin/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hackathonId, action }),
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        showToast(`Server returned HTTP ${res.status}`, "error");
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || `Hackathon ${action} completed successfully!`, "success");
        await fetchNativeHackathons();
      } else {
        showToast(data.error || `Failed to ${action} hackathon.`, "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || `Failed to ${action} hackathon.`, "error");
    }
  }

  const pendingCount = nativeHackathons.filter((h) => h.status === "pending").length;
  const approvedCount = nativeHackathons.filter((h) => h.status === "approved").length;

  return (
    <div className="space-y-6">
      {/* Standardized Stat Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <AdminStatCard
          title="Total Native Hackathons"
          value={nativeHackathons.length}
          subtitle="Host portal submissions"
          icon={Building2}
        />

        <AdminStatCard
          title="Pending Approval"
          value={pendingCount}
          subtitle={pendingCount > 0 ? "Requires admin review" : "All caught up"}
          icon={Clock}
          badge={
            pendingCount > 0 ? (
              <StatusBadge label="Action Required" variant="warning" dot />
            ) : (
              <StatusBadge label="Clear" variant="neutral" />
            )
          }
        />

        <AdminStatCard
          title="Approved & Live"
          value={approvedCount}
          subtitle="Public directory listings"
          icon={Globe}
          badge={<StatusBadge label="Live" variant="accent" dot />}
        />
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800/80 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto select-none p-1 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80">
          <button
            onClick={() => setNativeFilterStatus("all")}
            className={`px-3 py-1 rounded-lg text-xs font-mono uppercase tracking-wider transition cursor-pointer ${
              nativeFilterStatus === "all"
                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            All ({nativeHackathons.length})
          </button>
          <button
            onClick={() => setNativeFilterStatus("pending")}
            className={`px-3 py-1 rounded-lg text-xs font-mono uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
              nativeFilterStatus === "pending"
                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            <span>Pending</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setNativeFilterStatus("approved")}
            className={`px-3 py-1 rounded-lg text-xs font-mono uppercase tracking-wider transition cursor-pointer ${
              nativeFilterStatus === "approved"
                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            Approved ({approvedCount})
          </button>
          <button
            onClick={() => setNativeFilterStatus("rejected")}
            className={`px-3 py-1 rounded-lg text-xs font-mono uppercase tracking-wider transition cursor-pointer ${
              nativeFilterStatus === "rejected"
                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            Rejected ({nativeHackathons.filter((h) => h.status === "rejected").length})
          </button>
        </div>

        <button
          onClick={() => fetchNativeHackathons()}
          disabled={loadingNativeHackathons}
          className="px-3.5 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider bg-zinc-100/80 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium transition cursor-pointer flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingNativeHackathons ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Table */}
      {loadingNativeHackathons ? (
        <div className="py-16 text-center text-zinc-500 flex flex-col items-center gap-2 font-mono text-xs">
          <RefreshCw className="w-6 h-6 animate-spin text-[#B4F461]" />
          <span>Loading Native Hackathons...</span>
        </div>
      ) : nativeHackathons.filter(
          (h) => nativeFilterStatus === "all" || h.status === nativeFilterStatus
        ).length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 text-zinc-500 font-mono text-xs">
          No native hackathons found matching selected filter.
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50/50 dark:bg-zinc-950/40 text-zinc-500 dark:text-zinc-400 font-mono uppercase tracking-wider text-[10px] border-b border-zinc-200 dark:border-zinc-800/80">
                  <th className="p-4 font-semibold">Hackathon Title</th>
                  <th className="p-4 font-semibold">Organizer / Host</th>
                  <th className="p-4 font-semibold">Mode & Location</th>
                  <th className="p-4 font-semibold">Prize Pool</th>
                  <th className="p-4 font-semibold text-center">Status</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {nativeHackathons
                  .filter((h) => nativeFilterStatus === "all" || h.status === nativeFilterStatus)
                  .map((h: any) => (
                    <tr key={h.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40 transition">
                      <td className="p-4 font-bold text-zinc-900 dark:text-zinc-100 max-w-xs">
                        <div>{h.name}</div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                          Type:{" "}
                          <span className="uppercase font-semibold text-zinc-700 dark:text-zinc-300">
                            {h.type || "native"}
                          </span>
                          {h.college && ` • ${h.college}`}
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="font-medium text-zinc-800 dark:text-zinc-200">{h.organizerName}</div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">{h.organizerEmail}</div>
                      </td>

                      <td className="p-4 font-mono text-xs text-zinc-600 dark:text-zinc-300">
                        <span className="capitalize">{h.mode || "Online"}</span>
                        {h.location && (
                          <span className="text-zinc-400 text-[10px] block">{h.location}</span>
                        )}
                      </td>

                      <td className="p-4 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        {h.prize_pool ? `${h.currency || "INR"} ${h.prize_pool}` : "N/A"}
                      </td>

                      <td className="p-4 text-center">
                        <StatusBadge
                          label={h.status || "pending"}
                          variant={
                            h.status === "approved"
                              ? "neutral"
                              : h.status === "rejected"
                              ? "danger"
                              : "warning"
                          }
                          dot={h.status === "pending"}
                        />
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {h.status !== "approved" && (
                            <button
                              onClick={() => handleNativeHackathonAction(h.id, "approve", h.name)}
                              className="px-3 py-1.5 rounded-lg bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 font-bold transition text-xs cursor-pointer shadow-sm shadow-[#B4F461]/10 flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                          )}
                          {h.status !== "rejected" && (
                            <button
                              onClick={() => handleNativeHackathonAction(h.id, "reject", h.name)}
                              className="px-3 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 font-semibold transition text-xs cursor-pointer flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleNativeHackathonAction(h.id, "delete", h.name)}
                            className="px-3 py-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white font-semibold transition text-xs cursor-pointer"
                            title="Permanently Delete Hackathon"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
