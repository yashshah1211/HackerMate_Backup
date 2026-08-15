"use client";

import { memo } from "react";
import {
  Users,
  ShieldCheck,
  CheckCircle2,
  GitBranch,
  Terminal,
  Layers,
  MessageSquare,
  Kanban,
  FileCheck,
  Send,
  Zap,
} from "lucide-react";

export const BentoFeatures = memo(function BentoFeatures() {
  return (
    <section id="features" className="w-full py-16 sm:py-20 relative z-10">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">

        {/* Section Header */}
        <div className="text-center max-w-xl mx-auto mb-10 space-y-2">
          <p className="text-[11px] font-mono font-medium tracking-widest text-[#B4F461] uppercase">
            Platform Capabilities
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight">
            Engineered for high-performing hackathon teams
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
            Eliminate skill mismatches and chaotic group chats with a unified team operating system.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* ─── Bento Card 1: Complementary Skill Pairing (Span 2) ─── */}
          <div className="md:col-span-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6 sm:p-7 backdrop-blur-sm transition-colors hover:border-zinc-700/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-[#B4F461]">
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-zinc-100 tracking-tight">
                    Complementary Skill Pairing Radar
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-md">
                  98% Compatibility
                </span>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed max-w-lg mb-6">
                Never get stuck with four frontend developers. Our matching engine automatically identifies missing roles and connects you with verified builders.
              </p>
            </div>

            {/* Skill Slots Visualization */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mb-1.5">
                  <span>Frontend</span>
                  <span className="text-[#B4F461] font-medium">Ready</span>
                </div>
                <p className="text-xs font-medium text-zinc-200">React • Next.js</p>
                <p className="text-[10px] font-mono text-zinc-500 mt-0.5">Tailwind CSS</p>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mb-1.5">
                  <span>Backend</span>
                  <span className="text-[#B4F461] font-medium">Ready</span>
                </div>
                <p className="text-xs font-medium text-zinc-200">FastAPI • Python</p>
                <p className="text-[10px] font-mono text-zinc-500 mt-0.5">Supabase / SQL</p>
              </div>

              <div className="p-3 rounded-xl bg-[#B4F461]/5 border border-[#B4F461]/25">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#B4F461] mb-1.5">
                  <span>AI / ML Slot</span>
                  <span className="font-semibold">Recruiting</span>
                </div>
                <p className="text-xs font-medium text-zinc-100">PyTorch • LLMs</p>
                <p className="text-[10px] font-mono text-[#B4F461]/80 mt-0.5">1 Slot Available</p>
              </div>
            </div>
          </div>

          {/* ─── Bento Card 2: SIH 2026 Engine (Span 1) ─── */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6 sm:p-7 backdrop-blur-sm transition-colors hover:border-zinc-700/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-[#B4F461]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-base font-semibold text-zinc-100 tracking-tight">
                  SIH 2026 Rule Validation
                </h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                Automated team composition checks for Smart India Hackathon guidelines.
              </p>
            </div>

            <div className="space-y-2 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs font-mono">
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#B4F461]" />
                  <span>6-Member Team Limit</span>
                </span>
                <span className="text-zinc-500">6 / 6</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#B4F461]" />
                  <span>1+ Female Builder Quota</span>
                </span>
                <span className="text-[#B4F461]">Valid</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#B4F461]" />
                  <span>Idea Pitch Structure</span>
                </span>
                <span className="text-zinc-500">Validated</span>
              </div>
            </div>
          </div>

          {/* ─── Bento Card 3: Builder Identity & Trust (Span 1) ─── */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6 sm:p-7 backdrop-blur-sm transition-colors hover:border-zinc-700/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-[#B4F461]">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-base font-semibold text-zinc-100 tracking-tight">
                  Verified Builder Identity
                </h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                Verified student badges, GitHub commit activity, and authenticated podium finishes.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex items-center justify-between">
                <span className="text-zinc-300 font-medium">College Domain Email</span>
                <span className="text-[10px] font-mono text-[#B4F461] bg-[#B4F461]/10 px-2 py-0.5 rounded border border-[#B4F461]/20">
                  Verified
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex items-center justify-between">
                <span className="text-zinc-300 font-medium">GitHub Repository Stats</span>
                <span className="text-[10px] font-mono text-zinc-400">Synced</span>
              </div>
            </div>
          </div>

          {/* ─── Bento Card 4: 9-Tab Workspace HUD (Span 2) ─── */}
          <div className="md:col-span-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6 sm:p-7 backdrop-blur-sm transition-colors hover:border-zinc-700/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-[#B4F461]">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-zinc-100 tracking-tight">
                    9-Tab Team Operating System
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-zinc-500">
                  Ideation → Submission
                </span>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed max-w-xl mb-6">
                Manage your complete hackathon lifecycle without leaving the workspace. Real-time chat, Kanban task board, AI pitch deck evaluation, and export tools.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-medium text-zinc-200">Team Chat</span>
                <span className="text-[10px] font-mono text-zinc-500">Realtime sync</span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col items-center gap-1">
                <Kanban className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-medium text-zinc-200">Kanban Board</span>
                <span className="text-[10px] font-mono text-zinc-500">Sprint tasks</span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col items-center gap-1">
                <FileCheck className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-medium text-zinc-200">Deck Review</span>
                <span className="text-[10px] font-mono text-zinc-500">AI evaluator</span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col items-center gap-1">
                <Send className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-medium text-zinc-200">Submission</span>
                <span className="text-[10px] font-mono text-zinc-500">1-click export</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
});
