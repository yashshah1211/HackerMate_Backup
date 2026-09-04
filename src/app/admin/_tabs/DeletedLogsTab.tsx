"use client";

import { DeletedUserLog } from "../_types";
import { ShieldAlert, RefreshCw } from "lucide-react";

interface DeletedLogsTabProps {
  deletedUserLogs: DeletedUserLog[];
  loadingDeletedLogs: boolean;
  onRefreshDeletedLogs: () => Promise<void>;
}

export default function DeletedLogsTab({
  deletedUserLogs,
  loadingDeletedLogs,
  onRefreshDeletedLogs,
}: DeletedLogsTabProps) {
  return (
    <div className="space-y-4">
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
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Automatic DB trigger captures user email, name, and college upon account deletion.
              </p>
            </div>
          </div>
          <button
            onClick={onRefreshDeletedLogs}
            disabled={loadingDeletedLogs}
            className="px-3.5 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider bg-zinc-100/80 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer transition font-semibold flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingDeletedLogs ? "animate-spin" : ""}`} />
            <span>{loadingDeletedLogs ? "Refreshing..." : "Refresh Audit Log"}</span>
          </button>
        </div>

        {deletedUserLogs.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 font-mono text-xs bg-zinc-50 dark:bg-zinc-950/40 rounded-xl border border-zinc-200 dark:border-zinc-800/80">
            <p className="text-zinc-700 dark:text-zinc-300 font-semibold text-sm mb-1">
              No Account Deletions Recorded Yet
            </p>
            <p className="text-zinc-500 text-xs">
              The audit trigger is actively listening. Any future user account deletion will
              automatically log the user&apos;s name, email, college, and exact deletion timestamp here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/40 text-zinc-500 dark:text-zinc-400 font-mono uppercase tracking-wider text-[10px]">
                  <th className="p-3.5 font-semibold">User Details</th>
                  <th className="p-3.5 font-semibold">College / Institution</th>
                  <th className="p-3.5 font-semibold">Deleted Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono">
                {deletedUserLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                    <td className="p-3.5">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                        {log.full_name || "Unnamed Builder"}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {log.email || "No Email"}
                      </div>
                    </td>
                    <td className="p-3.5 text-zinc-600 dark:text-zinc-300 text-xs">
                      {log.college || "Unspecified Institution"}
                    </td>
                    <td className="p-3.5 text-zinc-500 dark:text-zinc-400 text-xs">
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
