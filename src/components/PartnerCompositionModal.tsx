"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Users,
  Shield,
  Send,
  X,
  Building2,
  Radio,
  Clock,
  Layers,
} from "lucide-react";

type Props = {
  partnerConfig: any;
  analyticsData: any;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSendBroadcast: (title: string, message: string) => Promise<void>;
  sendingBroadcast: boolean;
};

export default function PartnerCompositionModal({
  partnerConfig,
  analyticsData,
  loading,
  onClose,
  onRefresh,
  onSendBroadcast,
  sendingBroadcast,
}: Props) {
  const [activeSubTab, setActiveSubTab] = useState<"analytics" | "participants" | "teams" | "broadcast">("analytics");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");

  const handleBroadcastSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return;
    await onSendBroadcast(broadcastTitle.trim(), broadcastMessage.trim());
    setBroadcastTitle("");
    setBroadcastMessage("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 md:p-6 overflow-y-auto animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-white dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 relative my-auto max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-900 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                Partner Analytics
              </span>
              <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                Slug: /partners/{partnerConfig.slug}
              </span>
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {partnerConfig.partner_name}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Live Team Composition, Builder Registrations, and Partner Announcement Broadcasts.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Sub-Tabs */}
        <div className="flex items-center gap-1.5 pt-4 shrink-0 overflow-x-auto select-none">
          <button
            onClick={() => setActiveSubTab("analytics")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === "analytics"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold shadow-xs"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Composition</span>
          </button>
          <button
            onClick={() => setActiveSubTab("participants")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === "participants"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold shadow-xs"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Participants ({analyticsData?.stats?.totalRegistrations || 0})</span>
          </button>
          <button
            onClick={() => setActiveSubTab("teams")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === "teams"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold shadow-xs"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Teams ({analyticsData?.stats?.totalTeams || 0})</span>
          </button>
          <button
            onClick={() => setActiveSubTab("broadcast")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === "broadcast"
                ? "bg-[#B4F461] text-zinc-950 font-bold shadow-xs"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Broadcast</span>
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="py-6 overflow-y-auto grow">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-8 h-8 border-2 border-zinc-300 dark:border-zinc-800 border-t-[#B4F461] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Loading Team Composition Analytics...</p>
            </div>
          ) : !analyticsData ? (
            <div className="py-12 text-center text-xs text-zinc-500 font-mono">
              Failed to load composition data.
            </div>
          ) : (
            <>
              {/* STATS OVERVIEW CARDS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30">
                  <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Total Builders</div>
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 font-mono">{analyticsData.stats.totalRegistrations}</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">Registered for event</div>
                </div>

                <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30">
                  <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Looking for Team</div>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1 font-mono">{analyticsData.stats.lookingForTeamCount}</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">Active searchers</div>
                </div>

                <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30">
                  <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Teams Formed</div>
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 font-mono">{analyticsData.stats.totalTeams}</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">Linked teams</div>
                </div>

                <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30">
                  <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Broadcasts Sent</div>
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 font-mono">{analyticsData.announcements.length}</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">Official updates</div>
                </div>
              </div>

              {/* SUB TAB 1: ANALYTICS & SKILLS */}
              {activeSubTab === "analytics" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Top Skills Distribution */}
                  <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-zinc-400" />
                        <span>Top Builder Skills</span>
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 font-semibold">
                        {analyticsData.topSkills.length} skills
                      </span>
                    </h3>
                    {analyticsData.topSkills.length === 0 ? (
                      <p className="text-xs text-zinc-400 font-mono italic">No skills listed yet.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {analyticsData.topSkills.map((item: any) => {
                          const maxCount = analyticsData.topSkills[0]?.count || 1;
                          const percent = Math.round((item.count / maxCount) * 100);
                          return (
                            <div key={item.skill} className="space-y-1">
                              <div className="flex justify-between text-xs font-mono">
                                <span className="text-zinc-700 dark:text-zinc-200">{item.skill}</span>
                                <span className="text-zinc-500 dark:text-zinc-400 font-bold">{item.count} builder{item.count === 1 ? "" : "s"}</span>
                              </div>
                              <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#B4F461] rounded-full"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Top Participating Colleges */}
                  <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-zinc-400" />
                        <span>Colleges & Institutions</span>
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 font-semibold">
                        {analyticsData.topColleges.length} colleges
                      </span>
                    </h3>
                    {analyticsData.topColleges.length === 0 ? (
                      <p className="text-xs text-zinc-400 font-mono italic">No colleges listed yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {analyticsData.topColleges.map((item: any) => (
                          <div key={item.college} className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs">
                            <span className="text-zinc-700 dark:text-zinc-300 truncate max-w-[240px]" title={item.college}>{item.college}</span>
                            <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700">
                              {item.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUB TAB 2: PARTICIPANTS ROSTER */}
              {activeSubTab === "participants" && (
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50/50 dark:bg-zinc-950/40 border-b border-zinc-200 dark:border-zinc-800/80">
                        <tr>
                          <th className="p-3 font-semibold">Builder</th>
                          <th className="p-3 font-semibold">College</th>
                          <th className="p-3 font-semibold">Skills</th>
                          <th className="p-3 font-semibold">Status</th>
                          <th className="p-3 font-semibold text-right">Joined</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                        {analyticsData.registrations.map((reg: any) => {
                          const p = reg.profiles;
                          if (!p) return null;
                          return (
                            <tr key={reg.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition">
                              <td className="p-3">
                                <div className="font-semibold text-zinc-900 dark:text-zinc-100">{p.full_name || "Anonymous Builder"}</div>
                                <div className="text-[10px] text-zinc-400 font-mono">{p.email}</div>
                              </td>
                              <td className="p-3 text-zinc-600 dark:text-zinc-300 max-w-[180px] truncate" title={p.college || "Unspecified"}>
                                {p.college || "Unspecified"}
                              </td>
                              <td className="p-3">
                                <div className="flex flex-wrap gap-1">
                                  {(p.skills || []).slice(0, 3).map((s: string) => (
                                    <span key={s} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                                      {s}
                                    </span>
                                  ))}
                                  {(p.skills || []).length > 3 && (
                                    <span className="text-[9px] text-zinc-400 font-mono">+{p.skills.length - 3}</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                {reg.looking_for_team ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                    Searching
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                                    Registered
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-right text-[10px] font-mono text-zinc-400">
                                {new Date(reg.created_at).toLocaleDateString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SUB TAB 3: TEAMS FORMED */}
              {activeSubTab === "teams" && (
                <div className="space-y-4">
                  {analyticsData.teams.length === 0 ? (
                    <div className="p-8 text-center text-xs text-zinc-400 font-mono rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                      No teams registered for this partner hackathon yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {analyticsData.teams.map((t: any) => (
                        <div key={t.id} className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t.name}</h4>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{t.description || "No description"}</p>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 font-semibold">
                              {(t.team_members || []).length} / {t.max_members}
                            </span>
                          </div>

                          {/* Member roster */}
                          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-1.5">
                            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Team Roster</div>
                            {(t.team_members || []).map((m: any) => {
                              const mp = m.profiles;
                              return (
                                <div key={m.id} className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300">
                                  <span>{mp?.full_name || mp?.email || "Teammate"}</span>
                                  <span className="text-[10px] font-mono text-zinc-400">{mp?.college || ""}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SUB TAB 4: BROADCAST ANNOUNCEMENT */}
              {activeSubTab === "broadcast" && (
                <div className="space-y-6">
                  <form onSubmit={handleBroadcastSubmit} className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 space-y-4">
                    <div>
                      <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Send className="w-4 h-4 text-zinc-500" />
                        <span>Broadcast Partner Announcement</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 font-semibold">
                          To {analyticsData.stats.totalRegistrations} Builder(s)
                        </span>
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        Dispatches an official email broadcast and creates in-app notifications for all registered participants of {partnerConfig.partner_name}.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                        Announcement Title
                      </label>
                      <input
                        type="text"
                        value={broadcastTitle}
                        onChange={(e) => setBroadcastTitle(e.target.value)}
                        placeholder="e.g. Round 1 Submissions Are Now Live!"
                        className="w-full rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                        Announcement Message
                      </label>
                      <textarea
                        value={broadcastMessage}
                        onChange={(e) => setBroadcastMessage(e.target.value)}
                        rows={5}
                        placeholder="Write your announcement details here. All registered participants will receive an email and in-app notification..."
                        className="w-full rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition resize-none"
                        required
                      />
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={sendingBroadcast || !broadcastTitle.trim() || !broadcastMessage.trim()}
                        className="px-6 py-2.5 rounded-xl bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer shadow-sm shadow-[#B4F461]/10 disabled:opacity-50"
                      >
                        {sendingBroadcast ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
                            <span>Dispatching...</span>
                          </>
                        ) : (
                          <span>Dispatch Broadcast ({analyticsData.stats.totalRegistrations})</span>
                        )}
                      </button>
                    </div>
                  </form>

                  {/* Broadcast History */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Broadcast History ({analyticsData.announcements.length})
                    </h4>
                    {analyticsData.announcements.length === 0 ? (
                      <div className="p-6 text-center text-xs text-zinc-400 font-mono rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                        No broadcasts sent for this partner hackathon yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {analyticsData.announcements.map((ann: any) => (
                          <div key={ann.id} className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-zinc-900 dark:text-zinc-100">{ann.title}</span>
                              <span className="text-[10px] font-mono text-zinc-400">
                                {ann.sent_at ? new Date(ann.sent_at).toLocaleString() : "Pending"}
                              </span>
                            </div>
                            <p className="text-zinc-600 dark:text-zinc-400">{ann.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
