"use client";

import { useEffect, useState } from "react";
import { Check, Mail, Plus, UsersRound } from "lucide-react";
import { trackEvent } from "@/lib/posthog";
import { Avatar, Button, Dialog, Tape, TeamMark } from "@/components/system";
import { cn } from "@/lib/utils";

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

/**
 * Shown right after a connection is accepted. Branch A offers to create a team
 * together; Branch B invites the new connection to one of your teams with an
 * open seat. Same props, analytics events and callbacks as V1.
 */
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

  const firstName = connectedUser.full_name?.split(" ")[0] || connectedUser.full_name;

  // V1 defaulted to the first team; fall back to it if the list arrived after mount.
  const selected = teamsWithSlots.some((t) => t.id === selectedTeamId)
    ? selectedTeamId
    : teamsWithSlots[0]?.id ?? "";

  async function handleInvite() {
    if (!selected) return;
    setInviting(true);
    trackEvent("post_acceptance_prompt_acted", {
      action: "send_invite",
      team_id: selected,
      connected_user_id: connectedUser.id,
    });
    await onInviteToTeam(selected);
    setInviting(false);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={isBranchB ? `Invite ${firstName} to your team?` : `Form a team with ${firstName}?`}
      description={
        isBranchB
          ? `You have a team with open seats. Send ${firstName} an invite now.`
          : "You're connected. Take it further and build something together."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          {isBranchB ? (
            <Button
              variant="primary"
              icon={<Mail />}
              loading={inviting}
              disabled={!selected}
              onClick={handleInvite}
            >
              Send invite
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<Plus />}
              onClick={() => {
                trackEvent("post_acceptance_prompt_acted", {
                  action: "create_team_together",
                  connected_user_id: connectedUser.id,
                });
                onCreateTeam();
                onClose();
              }}
            >
              Create team together
            </Button>
          )}
        </>
      }
    >
      {/* Who you just connected with */}
      <div className="flex items-center gap-3">
        <Avatar name={connectedUser.full_name} src={connectedUser.avatar_url} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-ink">{connectedUser.full_name}</p>
          {connectedUser.college && (
            <p className="truncate text-[12.5px] text-ink-3">{connectedUser.college}</p>
          )}
        </div>
        <Tape tone="ok" dot>
          Connected
        </Tape>
      </div>

      {isBranchB ? (
        <div className="mt-5">
          <p className="mb-2 caps-label text-ink-3">
            {teamsWithSlots.length === 1 ? "Your team" : "Choose team"}
          </p>
          <div role="radiogroup" aria-label="Your teams with open seats" className="space-y-1.5">
            {teamsWithSlots.map((t) => {
              const active = selected === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelectedTeamId(t.id)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2.5 text-left ring-1 ring-inset transition-colors",
                    active ? "bg-selected ring-ink-4" : "ring-line hover:bg-hover",
                  )}
                >
                  <TeamMark name={t.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{t.name}</span>
                    <span className="block text-[12px] text-ink-3">
                      <span className="font-mono tabular">{t.openSlots}</span> open seat{t.openSlots !== 1 ? "s" : ""}
                    </span>
                  </span>
                  {active && <Check className="size-4 shrink-0 text-ink" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-5 flex items-start gap-3 rounded-md bg-sunken px-3 py-3 ring-1 ring-inset ring-line">
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-selected text-ink-3">
            <UsersRound className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">You&apos;ll go to the team creator</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
              {firstName} gets a team invite automatically once your team is set up.
            </p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
