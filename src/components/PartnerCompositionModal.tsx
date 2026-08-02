"use client";

import { useState } from "react";
import Link from "next/link";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-6 overflow-y-auto">
      <div className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-6 relative my-auto max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-800 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                Partner Portal Analytics
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                Slug: /partners/{partnerConfig.slug}
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-white tracking-tight">
              📊 {partnerConfig.partner_name}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Live Team Composition, Builder Registrations, and Partner Announcement Broadcasts.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Modal Sub-Tabs */}
        <div className="flex items-center gap-2 pt-4 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveSubTab("analytics")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSubTab === "analytics"
                ? "bg-[#B4F461] text-black shadow"
                : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
            }`}
          >
            📊 Composition & Skills
          </button>
          <button
            onClick={() => setActiveSubTab("participants")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSubTab === "participants"
                ? "bg-[#B4F461] text-black shadow"
                : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
            }`}
          >
            👥 Participants ({analyticsData?.stats?.totalRegistrations || 0})
          </button>
          <button
            onClick={() => setActiveSubTab("teams")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSubTab === "teams"
                ? "bg-[#B4F461] text-black shadow"
                : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
            }`}
          >
            🛡️ Teams Formed ({analyticsData?.stats?.totalTeams || 0})
          </button>
          <button
            onClick={() => setActiveSubTab("broadcast")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSubTab === "broadcast"
                ? "bg-sky-500 text-white shadow"
                : "bg-sky-950/40 text-sky-400 hover:text-sky-300 border border-sky-800/60"
            }`}
          >
            📢 Send Broadcast
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="py-6 overflow-y-auto grow">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-8 h-8 border-2 border-zinc-800 border-t-[#B4F461] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-zinc-400 font-mono">Loading Team Composition Analytics...</p>
            </div>
          ) : !analyticsData ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              Failed to load composition data.
            </div>
          ) : (
            <>
              {/* STATS OVERVIEW CARDS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="card card-static p-4 border-zinc-800 bg-zinc-900/50">
                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Total Builders</div>
                  <div className="text-2xl font-extrabold text-white mt-1">{analyticsData.stats.totalRegistrations}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Registered for event</div>
                </div>

                <div className="card card-static p-4 border-amber-950/60 bg-amber-950/20">
                  <div className="text-[10px] font-mono text-amber-400 uppercase tracking-wider">Looking for Team</div>
                  <div className="text-2xl font-extrabold text-amber-300 mt-1">{analyticsData.stats.lookingForTeamCount}</div>
                  <div className="text-[10px] text-amber-500/80 mt-0.5">Active searchers</div>
                </div>

                <div className="card card-static p-4 border-emerald-950/60 bg-emerald-950/20">
                  <div className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">Teams Formed</div>
                  <div className="text-2xl font-extrabold text-emerald-300 mt-1">{analyticsData.stats.totalTeams}</div>
                  <div className="text-[10px] text-emerald-500/80 mt-0.5">Linked teams</div>
                </div>

                <div className="card card-static p-4 border-sky-950/60 bg-sky-950/20">
                  <div className="text-[10px] font-mono text-sky-400 uppercase tracking-wider">Broadcasts Sent</div>
                  <div className="text-2xl font-extrabold text-sky-300 mt-1">{analyticsData.announcements.length}</div>
                  <div className="text-[10px] text-sky-500/80 mt-0.5">Official announcements</div>
                </div>
              </div>

              {/* SUB TAB 1: ANALYTICS & SKILLS */}
              {activeSubTab === "analytics" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Top Skills Distribution */}
                  <div className="card card-static p-5 border-zinc-800">
                    <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <span>🛠️ Top Builder Skills</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400">
                        {analyticsData.topSkills.length} skills
                      </span>
                    </h3>
                    {analyticsData.topSkills.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic">No skills listed yet.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {analyticsData.topSkills.map((item: any) => {
                          const maxCount = analyticsData.topSkills[0]?.count || 1;
                          const percent = Math.round((item.count / maxCount) * 100);
                          return (
                            <div key={item.skill} className="space-y-1">
                              <div className="flex justify-between text-xs font-mono">
                                <span className="text-zinc-200">{item.skill}</span>
                                <span className="text-zinc-400 font-bold">{item.count} builder{item.count === 1 ? "" : "s"}</span>
                              </div>
                              <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-sky-500 to-[#B4F461] rounded-full"
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
                  <div className="card card-static p-5 border-zinc-800">
                    <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <span>🏫 Participating Colleges & Institutions</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400">
                        {analyticsData.topColleges.length} colleges
                      </span>
                    </h3>
                    {analyticsData.topColleges.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic">No colleges listed yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {analyticsData.topColleges.map((item: any) => (
                          <div key={item.college} className="flex items-center justify-between p-2 rounded bg-zinc-900/60 border border-zinc-800/80 text-xs">
                            <span className="text-zinc-300 truncate max-w-[240px]" title={item.college}>{item.college}</span>
                            <span className="text-xs font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
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
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-zinc-300">
                      <thead className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider bg-zinc-950/60 border-b border-zinc-900">
                        <tr>
                          <th className="p-3">Builder</th>
                          <th className="p-3">College</th>
                          <th className="p-3">Skills</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Joined</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900">
                        {analyticsData.registrations.map((reg: any) => {
                          const p = reg.profiles;
                          if (!p) return null;
                          return (
                            <tr key={reg.id} className="hover:bg-zinc-900/40 transition">
                              <td className="p-3">
                                <div className="font-bold text-white">{p.full_name || "Anonymous Builder"}</div>
                                <div className="text-[10px] text-zinc-500 font-mono">{p.email}</div>
                              </td>
                              <td className="p-3 text-zinc-300 max-w-[180px] truncate" title={p.college || "Unspecified"}>
                                {p.college || "Unspecified"}
                              </td>
                              <td className="p-3">
                                <div className="flex flex-wrap gap-1">
                                  {(p.skills || []).slice(0, 3).map((s: string) => (
                                    <span key={s} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800">
                                      {s}
                                    </span>
                                  ))}
                                  {(p.skills || []).length > 3 && (
                                    <span className="text-[9px] text-zinc-500 font-mono">+{p.skills.length - 3}</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                {reg.looking_for_team ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                    Looking for Team
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 text-zinc-400 border border-zinc-800">
                                    Registered
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-right text-[10px] font-mono text-zinc-500">
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
                    <div className="p-8 text-center text-xs text-zinc-500 card card-static border-dashed border-zinc-800">
                      No teams registered for this partner hackathon yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {analyticsData.teams.map((t: any) => (
                        <div key={t.id} className="card card-static p-4 border-zinc-800 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-bold text-white">{t.name}</h4>
                              <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{t.description || "No description"}</p>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {(t.team_members || []).length} / {t.max_members} members
                            </span>
                          </div>

                          {/* Member roster */}
                          <div className="pt-2 border-t border-zinc-900 space-y-1.5">
                            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Team Roster</div>
                            {(t.team_members || []).map((m: any) => {
                              const mp = m.profiles;
                              return (
                                <div key={m.id} className="flex items-center justify-between text-xs text-zinc-300">
                                  <span>{mp?.full_name || mp?.email || "Teammate"}</span>
                                  <span className="text-[10px] font-mono text-zinc-500">{mp?.college || ""}</span>
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
                  <form onSubmit={handleBroadcastSubmit} className="card card-static p-6 border-sky-950/80 bg-sky-950/10 space-y-4">
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <span>📢 Broadcast Partner Announcement</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                          To {analyticsData.stats.totalRegistrations} Builder(s)
                        </span>
                      </h3>
                      <p className="text-xs text-zinc-400 mt-1">
                        Dispatches an official email broadcast via Resend and creates in-app notifications for all registered participants of {partnerConfig.partner_name}.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1">
                        Announcement Title
                      </label>
                      <input
                        type="text"
                        value={broadcastTitle}
                        onChange={(e) => setBroadcastTitle(e.target.value)}
                        placeholder="e.g. Round 1 Submissions Are Now Live!"
                        className="input text-xs w-full"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1">
                        Announcement Message
                      </label>
                      <textarea
                        value={broadcastMessage}
                        onChange={(e) => setBroadcastMessage(e.target.value)}
                        rows={5}
                        placeholder="Write your announcement details here. All registered participants will receive an email and in-app notification..."
                        className="input text-xs w-full resize-y"
                        required
                      />
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={sendingBroadcast || !broadcastTitle.trim() || !broadcastMessage.trim()}
                        className="btn btn-primary text-xs py-2 px-6 bg-sky-500 hover:bg-sky-400 text-white border-none font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-sky-500/20 cursor-pointer disabled:opacity-50"
                      >
                        {sendingBroadcast ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            <span>Dispatching Broadcast...</span>
                          </>
                        ) : (
                          <span>📢 Dispatch Broadcast to {analyticsData.stats.totalRegistrations} Registrants</span>
                        )}
                      </button>
                    </div>
                  </form>

                  {/* Broadcast History */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                      Broadcast History ({analyticsData.announcements.length})
                    </h4>
                    {analyticsData.announcements.length === 0 ? (
                      <div className="p-6 text-center text-xs text-zinc-500 card card-static border-dashed border-zinc-800">
                        No broadcasts sent for this partner hackathon yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {analyticsData.announcements.map((ann: any) => (
                          <div key={ann.id} className="card card-static p-4 border-zinc-800 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white">{ann.title}</span>
                              <span className="text-[10px] font-mono text-zinc-500">
                                {ann.sent_at ? new Date(ann.sent_at).toLocaleString() : "Pending"}
                              </span>
                            </div>
                            <p className="text-zinc-400">{ann.message}</p>
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
