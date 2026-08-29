"use client";

import Link from "next/link";
import { Team } from "../_types";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { Search, Building2, Award, Users } from "lucide-react";

interface TeamsTabProps {
  teams: Team[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onRefresh: () => Promise<void>;
}

export default function TeamsTab({
  teams,
  searchQuery,
  setSearchQuery,
  onRefresh,
}: TeamsTabProps) {
  const { showToast, confirm } = useNotification();

  function handleDeleteTeam(teamId: string, teamName: string) {
    confirm({
      title: "DELETE TEAM PERMANENTLY",
      message: `Are you sure you want to permanently delete team "${teamName}"? This will purge the team, its members, document pad, tasks, link hub, brainstorm boards, deployments, and all associated messages. This action is irreversible.`,
      confirmText: "Delete Permanently",
      onConfirm: async () => {
        const { error } = await supabase
          .from("teams")
          .delete()
          .eq("id", teamId);

        if (error) {
          console.error(error);
          showToast(error.message, "error");
        } else {
          showToast(`Team "${teamName}" has been deleted successfully.`, "success");
          await onRefresh();
        }
      },
    });
  }

  const filteredTeams = teams.filter((t) => {
    const query = searchQuery.toLowerCase();
    return (
      t.name?.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query) ||
      t.ownerName?.toLowerCase().includes(query) ||
      t.ownerEmail?.toLowerCase().includes(query) ||
      t.college?.toLowerCase().includes(query) ||
      t.hackathon_name?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            placeholder="Search teams by name, description, or owner..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 pl-9 pr-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition"
          />
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Teams Table */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/40 text-zinc-500 dark:text-zinc-400 font-mono uppercase tracking-wider text-[10px]">
                <th className="p-4 font-semibold">Team Details</th>
                <th className="p-4 font-semibold">Created</th>
                <th className="p-4 font-semibold">Owner</th>
                <th className="p-4 font-semibold">Roster</th>
                <th className="p-4 font-semibold">Affiliation</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {filteredTeams.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500 font-mono">
                    No teams matching search query.
                  </td>
                </tr>
              ) : (
                filteredTeams.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40 transition-colors">
                    {/* Details */}
                    <td className="p-4">
                      <Link
                        href={`/teams/${t.id}`}
                        className="font-semibold text-zinc-900 dark:text-zinc-100 hover:text-[#B4F461] transition-colors"
                      >
                        {t.name}
                      </Link>
                      {t.description && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 max-w-xs truncate">
                          {t.description}
                        </p>
                      )}
                    </td>

                    {/* Created Date */}
                    <td className="p-4 text-zinc-500 dark:text-zinc-400 font-mono text-[10px]">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>

                    {/* Owner */}
                    <td className="p-4">
                      <Link
                        href={`/profile/${t.owner_id}`}
                        className="font-semibold text-zinc-900 dark:text-zinc-100 hover:text-[#B4F461] transition-colors block"
                      >
                        {t.ownerName}
                      </Link>
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                        {t.ownerEmail}
                      </div>
                    </td>

                    {/* Members */}
                    <td className="p-4 font-mono text-zinc-700 dark:text-zinc-300 text-xs">
                      {t.team_members?.length || 0} / {t.max_members}
                    </td>

                    {/* Affiliation */}
                    <td className="p-4 space-y-1">
                      {t.college && (
                        <div className="text-[11px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span>{t.college.split(" (")[0] || t.college}</span>
                        </div>
                      )}
                      {t.team_hackathons?.map((th) => th.hackathons?.name).filter(Boolean).join(", ") ? (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 font-mono">
                          <Award className="w-3 h-3 text-[#B4F461] shrink-0" />
                          <span>{t.team_hackathons?.map((th) => th.hackathons?.name).filter(Boolean).join(", ")}</span>
                        </div>
                      ) : t.hackathon_name ? (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 font-mono">
                          <Award className="w-3 h-3 text-[#B4F461] shrink-0" />
                          <span>{t.hackathon_name}</span>
                        </div>
                      ) : null}
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleDeleteTeam(t.id, t.name)}
                        className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded-lg border border-rose-500/20 bg-rose-500/10 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white transition cursor-pointer font-semibold"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
