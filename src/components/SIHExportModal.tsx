"use client";

import { useState } from "react";
import {
  SIHTeamExport,
  SIHTeamMemberExport,
  checkSIHCompliance,
  exportSIHTeamCSV,
  exportSIHTeamJSON,
  generateSPOCEmailSummary,
  openSIHPrintDossier,
} from "@/lib/sihExport";
import { useNotification } from "@/context/NotificationContext";

type SIHExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  team: SIHTeamExport;
  members: SIHTeamMemberExport[];
};

export default function SIHExportModal({
  isOpen,
  onClose,
  team,
  members,
}: SIHExportModalProps) {
  const { showToast } = useNotification();
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [activeTab, setActiveTab] = useState<"export" | "preview" | "email">("export");

  if (!isOpen) return null;

  const compliance = checkSIHCompliance(team, members);
  const emailText = generateSPOCEmailSummary(team, members);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(emailText);
    setCopiedEmail(true);
    showToast("Copied SPOC nomination email brief to clipboard!", "success");
    setTimeout(() => setCopiedEmail(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="relative p-6 border-b border-zinc-200 dark:border-zinc-800 bg-orange-50/50 dark:bg-gradient-to-r dark:from-zinc-900 dark:via-zinc-900 dark:to-orange-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🇮🇳</span>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20 text-[10px] font-mono font-bold uppercase tracking-wider">
                  SIH 2026 Official SPOC Package
                </div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight mt-0.5">
                  Export Team Nomination Dossier
                </h2>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              ✕
            </button>
          </div>

          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2">
            Export official nomination records for team <strong className="text-zinc-900 dark:text-white">{team.name}</strong> to submit to your College SPOC (Faculty Coordinator).
          </p>
        </div>

        {/* Compliance Banner */}
        <div className="px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase font-bold text-zinc-500 dark:text-zinc-400">
              Audit Status:
            </span>
            {compliance.isCompliant ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                ✅ Verified SIH Compliant
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                ⚠️ Action Required ({compliance.issues.length} Check Pending)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className={compliance.hasSixMembers ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-zinc-400"}>
              👥 {compliance.memberCount}/6 Members
            </span>
            <span>•</span>
            <span className={compliance.hasFemaleMember ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-amber-600 dark:text-amber-400"}>
              👩 {compliance.femaleCount} Female
            </span>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 px-6 bg-white dark:bg-zinc-900">
          <button
            onClick={() => setActiveTab("export")}
            className={`py-3 px-4 text-xs font-mono font-bold border-b-2 transition ${
              activeTab === "export"
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            📦 1-Click Exports
          </button>
          <button
            onClick={() => setActiveTab("preview")}
            className={`py-3 px-4 text-xs font-mono font-bold border-b-2 transition ${
              activeTab === "preview"
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            📋 Roster Preview ({members.length})
          </button>
          <button
            onClick={() => setActiveTab("email")}
            className={`py-3 px-4 text-xs font-mono font-bold border-b-2 transition ${
              activeTab === "email"
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            ✉️ Copy SPOC Email
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* TAB 1: 1-CLICK EXPORTS */}
          {activeTab === "export" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. CSV Download */}
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-orange-500/50 transition flex flex-col justify-between group shadow-sm">
                  <div>
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg mb-2">
                      📊
                    </div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Official SIH CSV Sheet</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                      Pre-formatted spreadsheet matching the official SIH SPOC portal upload schema.
                    </p>
                  </div>
                  <button
                    onClick={() => exportSIHTeamCSV(team, members)}
                    className="mt-4 btn text-xs py-2 px-3 font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center justify-center gap-1.5 transition"
                  >
                    ⬇️ Download CSV Spreadsheet
                  </button>
                </div>

                {/* 2. Print / PDF Dossier */}
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-orange-500/50 transition flex flex-col justify-between group shadow-sm">
                  <div>
                    <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center text-lg mb-2">
                      📄
                    </div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Printable PDF Dossier</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                      Official formatted nomination document for physical SPOC submission or saving as PDF.
                    </p>
                  </div>
                  <button
                    onClick={() => openSIHPrintDossier(team, members)}
                    className="mt-4 btn text-xs py-2 px-3 font-bold bg-orange-600 hover:bg-orange-500 text-white rounded-lg flex items-center justify-center gap-1.5 transition"
                  >
                    🖨️ Print / Open PDF
                  </button>
                </div>

                {/* 3. Copy SPOC Email */}
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-orange-500/50 transition flex flex-col justify-between group shadow-sm">
                  <div>
                    <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center text-lg mb-2">
                      ✉️
                    </div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">SPOC Email Brief</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                      Ready-to-send email draft containing team summary & member details for your faculty SPOC.
                    </p>
                  </div>
                  <button
                    onClick={handleCopyEmail}
                    className="mt-4 btn text-xs py-2 px-3 font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-lg flex items-center justify-center gap-1.5 transition"
                  >
                    {copiedEmail ? "✓ Email Copied!" : "📋 Copy Email Text"}
                  </button>
                </div>

                {/* 4. JSON Export */}
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-orange-500/50 transition flex flex-col justify-between group shadow-sm">
                  <div>
                    <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center text-lg mb-2">
                      💾
                    </div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Structured JSON Package</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                      Complete digital dossier payload for portal APIs and institutional archives.
                    </p>
                  </div>
                  <button
                    onClick={() => exportSIHTeamJSON(team, members)}
                    className="mt-4 btn text-xs py-2 px-3 font-bold bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex items-center justify-center gap-1.5 transition"
                  >
                    ⬇️ Download JSON File
                  </button>
                </div>
              </div>

              {/* Compliance Guidance Notice */}
              {compliance.issues.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>⚠️ Compliance Reminder before Official SPOC Submission:</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                    {compliance.issues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ROSTER PREVIEW */}
          {activeTab === "preview" && (
            <div className="space-y-3">
              <div className="text-xs font-mono uppercase text-zinc-500 dark:text-zinc-400 font-bold">
                SIH Team Roster ({members.length} / 6 Members)
              </div>
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-950">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 font-mono text-[10px] uppercase text-zinc-500">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Member Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Gender</th>
                      <th className="p-3">Project Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {members.map((m, idx) => (
                      <tr key={m.id || idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className="p-3 font-mono font-bold text-zinc-400">{idx + 1}</td>
                        <td className="p-3 font-medium text-zinc-900 dark:text-white flex items-center gap-1.5">
                          {m.profiles?.full_name || "Anonymous Member"}
                          {(m.role === "owner" || m.profiles?.id === team.owner_id) && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              LEADER
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-zinc-600 dark:text-zinc-400">{m.profiles?.email || "N/A"}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.profiles?.gender?.toLowerCase() === "female" ||
                              m.profiles?.gender?.toLowerCase() === "f"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                            }`}
                          >
                            {m.profiles?.gender || "Unspecified"}
                          </span>
                        </td>
                        <td className="p-3 text-zinc-700 dark:text-zinc-300">{m.project_role || (m.role === "owner" ? "Team Leader" : "Developer")}</td>
                      </tr>
                    ))}
                    {Array.from({ length: Math.max(0, 6 - members.length) }).map((_, idx) => (
                      <tr key={`empty-${idx}`} className="bg-zinc-50/50 dark:bg-zinc-950/50 text-zinc-400">
                        <td className="p-3 font-mono">{members.length + idx + 1}</td>
                        <td className="p-3 italic font-sans" colSpan={4}>
                          [Vacant Member Slot — Add teammate to reach 6 members]
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: SPOC EMAIL COPY */}
          {activeTab === "email" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-zinc-500 dark:text-zinc-400 font-bold">
                  Email Draft for College Faculty SPOC
                </span>
                <button
                  onClick={handleCopyEmail}
                  className="btn btn-lime text-xs py-1.5 px-3 font-bold bg-[#B4F461] hover:bg-[#a3e64f] text-black"
                >
                  {copiedEmail ? "✓ Copied!" : "📋 Copy Email Text"}
                </button>
              </div>

              <textarea
                readOnly
                value={emailText}
                rows={12}
                className="w-full p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono text-xs leading-relaxed resize-none focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 font-mono">
            Smart India Hackathon 2026 Official Export Tool
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
