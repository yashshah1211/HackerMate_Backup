"use client";

import { useState } from "react";
import Link from "next/link";
import { UserProfile, DeletedUserLog } from "../_types";
import { useNotification } from "@/context/NotificationContext";
import { StatusBadge } from "../_components/StatusBadge";
import { Search, ShieldAlert, Zap, Mail, RefreshCw } from "lucide-react";

interface UsersTabProps {
  users: UserProfile[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  currentUserId: string | null;
  deletedUserLogs: DeletedUserLog[];
  loadingDeletedLogs: boolean;
  onRefresh: () => Promise<void>;
  onRefreshDeletedLogs: () => Promise<void>;
  onToggleBan: (userId: string, currentBan: boolean, fullName: string) => void;
  onToggleRole: (userId: string, currentRole: string, fullName: string) => void;
  onDeleteUser: (userId: string, fullName: string) => void;
  onOpenWarningModal: (reportedId: string, reportedName: string) => void;
  onNavigateToDeletedLogs: () => void;
}

export default function UsersTab({
  users,
  searchQuery,
  setSearchQuery,
  currentUserId,
  deletedUserLogs,
  loadingDeletedLogs,
  onRefresh,
  onRefreshDeletedLogs,
  onToggleBan,
  onToggleRole,
  onDeleteUser,
  onOpenWarningModal,
  onNavigateToDeletedLogs,
}: UsersTabProps) {
  const { showToast, confirm } = useNotification();

  const [onboardingFilter, setOnboardingFilter] = useState<"all" | "incomplete">("all");
  const [nudgingUserId, setNudgingUserId] = useState<string | null>(null);
  const [nudgingAll, setNudgingAll] = useState(false);

  async function handleNudgeUser(targetUserId: string, userName?: string) {
    setNudgingUserId(targetUserId);
    try {
      const res = await fetch("/api/admin/nudge-incomplete-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Email onboarding nudge sent to ${userName || "user"}!`, "success");
      } else {
        showToast(data.error || "Failed to send onboarding nudge.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to send onboarding nudge.", "error");
    } finally {
      setNudgingUserId(null);
    }
  }

  function handleNudgeAllIncomplete() {
    confirm({
      title: "SEND EMAIL NUDGE TO ALL INCOMPLETE USERS",
      message:
        "Are you sure you want to send a manual onboarding email nudge to ALL users with incomplete profiles?",
      confirmText: "Send Emails",
      onConfirm: async () => {
        setNudgingAll(true);
        try {
          const res = await fetch("/api/admin/nudge-incomplete-onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ batchAll: true }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast(
              `Onboarding nudge emails sent to ${data.count} incomplete user(s)!`,
              "success"
            );
          } else {
            showToast(data.error || "Failed to send batch onboarding nudges.", "error");
          }
        } catch (err: any) {
          console.error(err);
          showToast(err.message || "Failed to send batch onboarding nudges.", "error");
        } finally {
          setNudgingAll(false);
        }
      },
    });
  }

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesOnboarding =
      onboardingFilter === "all" || !u.onboarding_completed;

    return matchesSearch && matchesOnboarding;
  });

  return (
    <div className="space-y-4">
      {/* Search & Onboarding Filter Bar */}
      <div className="flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            placeholder="Search registered builders by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 pl-9 pr-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition"
          />
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Filters & Action Triggers */}
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          <div className="flex bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-1 select-none shrink-0">
            <button
              onClick={() => setOnboardingFilter("all")}
              className={`px-3 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider transition cursor-pointer ${
                onboardingFilter === "all"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
              }`}
            >
              All Users
            </button>
            <button
              onClick={() => setOnboardingFilter("incomplete")}
              className={`px-3 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider transition cursor-pointer ${
                onboardingFilter === "incomplete"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
              }`}
            >
              Incomplete ({users.filter((u) => !u.onboarding_completed).length})
            </button>
          </div>

          <button
            onClick={onNavigateToDeletedLogs}
            className="px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider bg-zinc-100/80 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 transition flex items-center gap-1.5 cursor-pointer shrink-0 font-medium"
            title="View historical user account deletion audit log"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-zinc-400" />
            <span>Exits Log ({deletedUserLogs.length})</span>
          </button>

          <button
            onClick={handleNudgeAllIncomplete}
            disabled={nudgingAll}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm shadow-[#B4F461]/10 disabled:opacity-50"
            title="Send manual onboarding email nudge to all users who haven't completed their profile"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{nudgingAll ? "Sending Nudges..." : "Nudge Incomplete"}</span>
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/40 text-zinc-500 dark:text-zinc-400 font-mono uppercase tracking-wider text-[10px]">
                <th className="p-4 font-semibold">User Details</th>
                <th className="p-4 font-semibold">Registered</th>
                <th className="p-4 font-semibold">Source</th>
                <th className="p-4 font-semibold">Role</th>
                <th className="p-4 font-semibold">Onboarding</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-zinc-500 font-mono">
                    No users matching search query.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr
                    key={u.id}
                    className={`transition-colors ${
                      u.is_banned
                        ? "bg-rose-500/5 dark:bg-rose-500/[0.03] hover:bg-rose-500/10"
                        : "hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40"
                    }`}
                  >
                    {/* Details */}
                    <td className="p-4">
                      <Link
                        href={`/profile/${u.id}`}
                        className="font-semibold text-zinc-900 dark:text-zinc-100 hover:text-[#B4F461] transition-colors block"
                      >
                        {u.full_name || "Unnamed"}
                      </Link>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                        {u.email}
                      </div>
                    </td>

                    {/* Registered date */}
                    <td className="p-4 text-zinc-500 dark:text-zinc-400 font-mono text-[10px]">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>

                    {/* Source */}
                    <td className="p-4">
                      <StatusBadge
                        label={u.referrer_source || "Direct"}
                        variant="neutral"
                      />
                    </td>

                    {/* Role */}
                    <td className="p-4">
                      <StatusBadge
                        label={u.role}
                        variant={u.role === "admin" ? "accent" : "neutral"}
                      />
                    </td>

                    {/* Onboarding */}
                    <td className="p-4">
                      <StatusBadge
                        label={u.onboarding_completed ? "Completed" : "Incomplete"}
                        variant={u.onboarding_completed ? "neutral" : "warning"}
                      />
                    </td>

                    {/* Status */}
                    <td className="p-4">
                      <StatusBadge
                        label={u.is_banned ? "Suspended" : "Active"}
                        variant={u.is_banned ? "danger" : "neutral"}
                      />
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {!u.onboarding_completed && (
                          <button
                            onClick={() => handleNudgeUser(u.id, u.full_name || u.email)}
                            disabled={nudgingUserId === u.id}
                            className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
                            title="Send manual email onboarding nudge"
                          >
                            <Mail className="w-3 h-3" />
                            <span>{nudgingUserId === u.id ? "Nudging..." : "Nudge"}</span>
                          </button>
                        )}

                        <button
                          onClick={() => onToggleRole(u.id, u.role, u.full_name || "User")}
                          className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer"
                        >
                          {u.role === "admin" ? "Demote" : "Promote"}
                        </button>

                        <button
                          onClick={() => onOpenWarningModal(u.id, u.full_name || "User")}
                          className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition cursor-pointer font-semibold"
                        >
                          Warn
                        </button>

                        <button
                          onClick={() => onToggleBan(u.id, u.is_banned, u.full_name || "User")}
                          className={`text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded-lg border font-semibold transition cursor-pointer ${
                            u.is_banned
                              ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/20"
                          }`}
                        >
                          {u.is_banned ? "Activate" : "Suspend"}
                        </button>

                        <button
                          onClick={() => onDeleteUser(u.id, u.full_name || "User")}
                          className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded-lg border border-rose-500/20 bg-rose-500/10 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white transition cursor-pointer font-semibold"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deleted Users Audit Log */}
      <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800/80 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-center text-zinc-700 dark:text-zinc-300 shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Deleted User Audit Logs (Account Exits)
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                DB audit captures user email, name, and college upon account deletion.
              </p>
            </div>
          </div>
          <button
            onClick={onRefreshDeletedLogs}
            disabled={loadingDeletedLogs}
            className="px-3 py-1.5 rounded-xl text-[10px] font-mono uppercase tracking-wider bg-zinc-100/80 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer flex items-center gap-1.5 font-semibold transition"
          >
            <RefreshCw className={`w-3 h-3 ${loadingDeletedLogs ? "animate-spin" : ""}`} />
            <span>{loadingDeletedLogs ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>

        {deletedUserLogs.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 font-mono text-xs">
            No user account deletions recorded since audit tracking was enabled.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/40 text-zinc-500 dark:text-zinc-400 font-mono uppercase tracking-wider text-[10px]">
                  <th className="p-3 font-semibold">User Details</th>
                  <th className="p-3 font-semibold">College / Institution</th>
                  <th className="p-3 font-semibold">Deleted Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono">
                {deletedUserLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {log.full_name || "Unnamed Builder"}
                      </div>
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{log.email || "No Email"}</div>
                    </td>
                    <td className="p-3 text-zinc-600 dark:text-zinc-300 text-[11px]">
                      {log.college || "Unspecified"}
                    </td>
                    <td className="p-3 text-zinc-500 dark:text-zinc-400 text-[10px]">
                      {new Date(log.deleted_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
