"use client";

import { useState } from "react";
import Link from "next/link";
import { Report } from "../_types";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { StatusBadge } from "../_components/StatusBadge";
import { AlertOctagon, ArrowRight, ShieldAlert, X, Inbox } from "lucide-react";

interface ReportsTabProps {
  reports: Report[];
  currentUserId?: string | null;
  onRefresh: () => Promise<void>;
  onToggleBan: (userId: string, currentBan: boolean, fullName: string) => void;
}

export default function ReportsTab({
  reports,
  currentUserId,
  onRefresh,
  onToggleBan,
}: ReportsTabProps) {
  const { showToast, confirm } = useNotification();

  // Warning Modal State
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [warningTargetUserId, setWarningTargetUserId] = useState<string | null>(null);
  const [warningTargetName, setWarningTargetName] = useState("");
  const [warningMessageText, setWarningMessageText] = useState("");
  const [sendingWarning, setSendingWarning] = useState(false);

  function handleDismissReport(reportId: string) {
    confirm({
      title: "DISMISS REPORT",
      message: "Are you sure you want to dismiss this report? This will remove the report from the dashboard logs.",
      onConfirm: async () => {
        const { error } = await supabase
          .from("user_reports")
          .delete()
          .eq("id", reportId);

        if (error) {
          console.error(error);
          showToast(error.message, "error");
        } else {
          showToast("Report dismissed.", "success");
          await onRefresh();
        }
      },
    });
  }

  function openWarningModal(reportedId: string, reportedName: string) {
    setWarningTargetUserId(reportedId);
    setWarningTargetName(reportedName);
    setWarningMessageText(
      `We have received reports from other community members regarding inappropriate behavior or content on your HackerMate profile. Please review our community guidelines to avoid account suspension.`
    );
    setWarningModalOpen(true);
  }

  async function submitWarningEmail() {
    if (!warningTargetUserId) return;
    setSendingWarning(true);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          senderId: currentUserId,
          recipientId: warningTargetUserId,
          type: "moderation_warning",
          warningMessage: warningMessageText.trim(),
        }),
      });

      const resData = await res.json();
      if (res.ok) {
        showToast(
          resData.mock
            ? "Mock warning email printed to server terminal."
            : "Warning email sent successfully!",
          "success"
        );
        setWarningModalOpen(false);
      } else {
        showToast(resData.error || "Failed to dispatch warning email.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "error", "error");
    }
    setSendingWarning(false);
  }

  return (
    <>
      <div className="space-y-4">
        {reports.length === 0 ? (
          <div className="p-12 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 text-center space-y-2">
            <Inbox className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mx-auto" />
            <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
              No pending user reports. Clear inbox!
            </p>
          </div>
        ) : (
          reports.map((rep) => (
            <div
              key={rep.id}
              className={`p-5 rounded-2xl border transition-all ${
                rep.reportedBanned
                  ? "border-rose-500/30 bg-rose-500/5 dark:bg-rose-500/[0.03]"
                  : "border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 hover:border-zinc-300 dark:hover:border-zinc-700/80"
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-3 flex-1">
                  {/* Targets */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400 font-medium">Reporter:</span>
                    <Link
                      href={`/profile/${rep.reporter_id}`}
                      className="text-zinc-900 dark:text-zinc-100 font-semibold hover:text-[#B4F461] transition-colors"
                    >
                      {rep.reporterName}
                    </Link>
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                      ({rep.reporterEmail})
                    </span>

                    <ArrowRight className="w-3.5 h-3.5 text-zinc-400 mx-0.5" />

                    <span className="text-zinc-500 dark:text-zinc-400 font-medium">Reported:</span>
                    <Link
                      href={`/profile/${rep.reported_id}`}
                      className="text-rose-600 dark:text-rose-400 font-semibold hover:underline transition-colors"
                    >
                      {rep.reportedName}
                    </Link>
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                      ({rep.reportedEmail})
                    </span>
                    {rep.reportedBanned && (
                      <StatusBadge label="Banned" variant="danger" />
                    )}
                  </div>

                  {/* Reason & Content */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <StatusBadge label={`Reason: ${rep.reason}`} variant="warning" />
                    </div>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3 leading-relaxed">
                      {rep.details || "No details provided."}
                    </p>
                  </div>

                  {/* Date */}
                  <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                    Filed on: {new Date(rep.created_at).toLocaleString()}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-row md:flex-col gap-2 shrink-0 md:items-end justify-start md:justify-center">
                  <button
                    onClick={() =>
                      onToggleBan(rep.reported_id, !!rep.reportedBanned, rep.reportedName || "User")
                    }
                    className={`text-[10px] font-mono uppercase tracking-wider py-1.5 px-3 rounded-xl border font-semibold transition cursor-pointer ${
                      rep.reportedBanned
                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/20"
                    }`}
                  >
                    {rep.reportedBanned ? "Unban User" : "Ban User"}
                  </button>

                  <button
                    onClick={() => openWarningModal(rep.reported_id, rep.reportedName || "User")}
                    className="text-[10px] font-mono uppercase tracking-wider py-1.5 px-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition cursor-pointer font-semibold"
                  >
                    Warn User
                  </button>

                  <button
                    onClick={() => handleDismissReport(rep.id)}
                    className="text-[10px] font-mono uppercase tracking-wider py-1.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer"
                  >
                    Dismiss Report
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Warning Modal */}
      {warningModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090b] shadow-2xl p-6 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-900">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-amber-500" />
                  <span>Send Warning Email to {warningTargetName}</span>
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Sends an official behavioral warning to their registered email address.
                </p>
              </div>
              <button
                onClick={() => setWarningModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              value={warningMessageText}
              onChange={(e) => setWarningMessageText(e.target.value)}
              rows={4}
              placeholder="Type warning details here..."
              className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition-all resize-none"
            />

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-900">
              <button
                type="button"
                onClick={() => setWarningModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs transition cursor-pointer"
                disabled={sendingWarning}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitWarningEmail}
                disabled={sendingWarning || !warningMessageText.trim()}
                className="px-5 py-2 rounded-xl bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 font-bold text-xs transition cursor-pointer disabled:opacity-50 shadow-sm shadow-[#B4F461]/10 flex items-center gap-1.5"
              >
                {sendingWarning ? "Sending..." : "Send Warning"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
