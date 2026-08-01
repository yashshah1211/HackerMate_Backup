"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/posthog";

export type TeamWithSlots = {
  id: string;
  name: string;
  openSlots: number;
};

export type ConnectedUser = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  college?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  connectedUser: ConnectedUser;
  /** Empty = Branch A (create team). Non-empty = Branch B (invite to existing team). */
  teamsWithSlots: TeamWithSlots[];
  onCreateTeam: () => void;
  onInviteToTeam: (teamId: string) => Promise<void>;
};

export default function PostAcceptanceTeamPrompt({
  open,
  onClose,
  connectedUser,
  teamsWithSlots,
  onCreateTeam,
  onInviteToTeam,
}: Props) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    teamsWithSlots[0]?.id ?? ""
  );
  const [inviting, setInviting] = useState(false);

  const isBranchB = teamsWithSlots.length > 0;

  useEffect(() => {
    if (open) {
      trackEvent("post_acceptance_prompt_viewed", {
        connected_user_id: connectedUser.id,
        branch: isBranchB ? "invite_existing" : "create_team",
      });
    }
  }, [open, connectedUser.id, isBranchB]);

  if (!open) return null;

  const firstName = connectedUser.full_name?.split(" ")[0] || connectedUser.full_name;

  async function handleInvite() {
    if (!selectedTeamId) return;
    setInviting(true);
    trackEvent("post_acceptance_prompt_acted", {
      action: "send_invite",
      team_id: selectedTeamId,
      connected_user_id: connectedUser.id,
    });
    await onInviteToTeam(selectedTeamId);
    setInviting(false);
    onClose();
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-sm rounded-2xl border border-zinc-800/80 bg-zinc-950 shadow-2xl overflow-hidden animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600" />

        <div className="p-6">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white hover:border-zinc-700 transition-colors"
            aria-label="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Avatar + name row */}
          <div className="flex items-center gap-3 mb-5">
            {connectedUser.avatar_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={connectedUser.avatar_url}
                alt={connectedUser.full_name}
                className="w-11 h-11 rounded-xl object-cover border border-zinc-800 flex-shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-400 flex-shrink-0">
                {connectedUser.full_name?.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">
                {connectedUser.full_name}
              </p>
              {connectedUser.college && (
                <p className="text-zinc-500 text-[11px] truncate">
                  {connectedUser.college}
                </p>
              )}
            </div>
            {/* Connected badge */}
            <span className="ml-auto flex-shrink-0 flex items-center gap-1 bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Connected
            </span>
          </div>

          {/* Headline */}
          {isBranchB ? (
            <>
              <h2 className="text-base font-semibold text-white mb-1">
                Invite {firstName} to your team?
              </h2>
              <p className="text-zinc-400 text-xs mb-5 leading-relaxed">
                You have a team with open slots — send {firstName} an invite to join right now.
              </p>

              {/* Team selector — dropdown if multiple, display-only if one */}
              {teamsWithSlots.length === 1 ? (
                <div className="mb-5 p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white text-xs font-semibold truncate">
                      {teamsWithSlots[0].name}
                    </p>
                    <p className="text-zinc-500 text-[11px]">
                      {teamsWithSlots[0].openSlots} open slot{teamsWithSlots[0].openSlots !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              ) : (
                <div className="mb-5">
                  <label className="block text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1.5">
                    Choose team
                  </label>
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg text-white text-xs px-3 py-2.5 focus:outline-none focus:border-indigo-500 transition-colors appearance-none cursor-pointer"
                  >
                    {teamsWithSlots.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.openSlots} open slot{t.openSlots !== 1 ? "s" : ""})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleInvite}
                  disabled={inviting || !selectedTeamId}
                  className="btn btn-primary flex-1 text-xs py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {inviting ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )}
                  Send Invite
                </button>
                <button
                  onClick={onClose}
                  className="btn btn-secondary text-xs py-2.5 px-4"
                >
                  Not now
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold text-white mb-1">
                Form a team with {firstName}?
              </h2>
              <p className="text-zinc-400 text-xs mb-5 leading-relaxed">
                You're connected — take it further and build something together at a hackathon.
              </p>

              {/* Visual hint */}
              <div className="mb-5 p-3.5 rounded-xl bg-gradient-to-br from-indigo-950/40 to-violet-950/30 border border-indigo-900/40 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031a.005.005 0 01-.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zm-3.75 9h7.5m-7.5 0H12" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-zinc-300 font-medium">
                    You&apos;ll be taken to the team creator
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                    {firstName} will automatically receive a team invite once your team is set up.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    trackEvent("post_acceptance_prompt_acted", {
                      action: "create_team_together",
                      connected_user_id: connectedUser.id,
                    });
                    onCreateTeam();
                    onClose();
                  }}
                  className="btn btn-primary flex-1 text-xs py-2.5 flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create Team Together
                </button>
                <button
                  onClick={onClose}
                  className="btn btn-secondary text-xs py-2.5 px-4"
                >
                  Not now
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
