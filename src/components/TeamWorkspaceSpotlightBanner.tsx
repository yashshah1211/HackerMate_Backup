"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Rocket,
  Layers,
  FileSpreadsheet,
  Users2,
  GitBranch,
  CheckCircle2,
  ChevronDown,
  ArrowRight,
  ShieldCheck,
  X,
  Code2,
  ExternalLink,
  Plus,
} from "lucide-react";

interface TeamWorkspaceSpotlightProps {
  userTeams?: Array<{
    id: string;
    name: string;
    memberCount?: number;
    max_members?: number | null;
    hackathons?: { name: string } | null;
  }>;
}

export default function TeamWorkspaceSpotlightBanner({
  userTeams = [],
}: TeamWorkspaceSpotlightProps) {
  const router = useRouter();
  const [isDismissed, setIsDismissed] = useState(false);
  const [activeFeatureIdx, setActiveFeatureIdx] = useState(0);
  const [pickerModalOpen, setPickerModalOpen] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("hm_workspace_banner_dismissed");
    if (dismissed === "true") {
      setIsDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem("hm_workspace_banner_dismissed", "true");
  };

  const handleRestore = () => {
    setIsDismissed(false);
    localStorage.removeItem("hm_workspace_banner_dismissed");
  };

  const features = [
    {
      icon: "🎯",
      title: "AI Pitch Deck Evaluator",
      tag: "SIH Grand Jury Engine",
      desc: "Instant slide-by-slide scoring, novelty audits, and presentation feedback before submission.",
    },
    {
      icon: "⚡",
      title: "Smart Squad Matcher",
      tag: "Deficit Auto-Fill",
      desc: "Scans for missing roles (UI/UX, AI/ML) & SIH female teammate rules with 1-click invites.",
    },
    {
      icon: "📋",
      title: "Live Tasks & Milestones",
      tag: "Kanban Roadmaps",
      desc: "Prioritized sprint board, submission countdown clocks, and milestone progress trackers.",
    },
    {
      icon: "🐙",
      title: "GitHub Sync & Deployments",
      tag: "Continuous Build",
      desc: "Live repository commit feeds, branch tracking, and production deployment checklists.",
    },
  ];

  if (isDismissed) {
    return (
      <div className="mb-6 flex items-center justify-between p-3 px-4 rounded-2xl bg-violet-50/80 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/40 text-xs animate-fade-in text-left shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-sm">🚀</span>
          <span className="text-zinc-800 dark:text-zinc-300 font-medium">
            Team Workspace features: AI Deck Evaluator, Squad Matcher, Live Kanban & GitHub Sync.
          </span>
        </div>
        <button
          onClick={handleRestore}
          className="text-violet-600 dark:text-violet-400 hover:underline font-bold cursor-pointer shrink-0 ml-3"
        >
          View Workspace Guide →
        </button>
      </div>
    );
  }

  const primaryTeam = userTeams && userTeams.length > 0 ? userTeams[0] : null;

  return (
    <>
      <div className="relative mb-8 rounded-3xl border border-violet-200 dark:border-violet-500/30 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/50 dark:from-violet-950/40 dark:via-zinc-950/90 dark:to-black p-6 sm:p-8 shadow-sm dark:shadow-xl overflow-hidden animate-fade-in text-left">
        {/* Background Decorative Ambient Lighting */}
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-violet-400/10 dark:bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-indigo-400/10 dark:bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Dismiss Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-white/80 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer z-20 shadow-xs"
          title="Hide guide banner"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          {/* Left Column: Heading & Value Proposition */}
          <div className="max-w-xl space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-500/15 border border-violet-300 dark:border-violet-500/30 text-violet-800 dark:text-violet-300 font-mono text-[10px] font-bold uppercase tracking-wider">
                <Rocket className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                NEW: HACKERMATE TEAM OPERATING SYSTEM
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight leading-snug">
              Your Mission Control for Winning Hackathons
            </h2>

            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Team workspaces are private collaboration hubs designed for SIH and top tech hackathons. Coordinate your codebase, evaluate presentations with AI, and complete your squad before deadline day.
            </p>

            {/* Quick CTA Actions & Team Selector */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {userTeams.length > 0 && primaryTeam ? (
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Main Launch Button */}
                  <Link
                    href={`/teams/${primaryTeam.id}/workspace`}
                    className="btn btn-primary btn-sm px-4 py-2 text-xs flex items-center gap-2 shadow-md shadow-violet-500/20 font-bold"
                  >
                    <span>Launch {primaryTeam.name} Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>

                  {/* Team Switcher Trigger Button */}
                  {userTeams.length > 1 && (
                    <button
                      onClick={() => setPickerModalOpen(true)}
                      className="btn btn-secondary btn-sm px-3 py-2 text-xs flex items-center gap-1.5 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer font-semibold shadow-xs"
                    >
                      <span>Switch Team ({userTeams.length})</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <Link
                  href="/teams/create"
                  className="btn btn-primary btn-sm px-4 py-2 text-xs flex items-center gap-2 shadow-md shadow-violet-500/20 font-bold"
                >
                  <span>Create a Team & Launch Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}

              <Link
                href="/teams"
                className="btn btn-secondary btn-sm px-3.5 py-2 text-xs flex items-center gap-1.5 font-semibold bg-white dark:bg-zinc-900/60 border border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white shadow-xs"
              >
                <span>Explore Active Teams</span>
              </Link>
            </div>
          </div>

          {/* Right Column: Interactive Feature Highlight Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full lg:max-w-md shrink-0">
            {features.map((feat, idx) => {
              const isActive = activeFeatureIdx === idx;
              return (
                <div
                  key={idx}
                  onMouseEnter={() => setActiveFeatureIdx(idx)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isActive
                      ? "bg-violet-100/70 dark:bg-violet-950/40 border-violet-300 dark:border-violet-500/50 shadow-md shadow-violet-500/10 -translate-y-0.5"
                      : "bg-white/85 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800/80 hover:border-violet-200 dark:hover:border-zinc-700 shadow-xs"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-base">{feat.icon}</span>
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400 bg-violet-100 dark:bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-200 dark:border-violet-500/20">
                      {feat.tag}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white mb-0.5">{feat.title}</h4>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug line-clamp-2">
                    {feat.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Team Workspace Picker Modal */}
      {pickerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl p-6 text-left animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <span>🚀</span> Select Team Workspace
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Choose which team workspace you want to manage.
                </p>
              </div>
              <button
                onClick={() => setPickerModalOpen(false)}
                className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Team Cards List */}
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {userTeams.map((team) => (
                <div
                  key={team.id}
                  onClick={() => {
                    setPickerModalOpen(false);
                    router.push(`/teams/${team.id}/workspace`);
                  }}
                  className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 hover:border-violet-400 dark:hover:border-violet-500/50 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-500/20 border border-violet-200 dark:border-violet-500/30 flex items-center justify-center font-bold text-violet-700 dark:text-violet-300 text-sm flex-shrink-0">
                      {team.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors truncate">
                        {team.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                          {team.hackathons?.name || "Smart India Hackathon 2026"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className="btn btn-primary btn-sm text-[11px] py-1 px-3 flex-shrink-0 flex items-center gap-1">
                    <span>Open</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <Link
                href="/teams/create"
                onClick={() => setPickerModalOpen(false)}
                className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Team</span>
              </Link>
              <button
                onClick={() => setPickerModalOpen(false)}
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 font-medium cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
