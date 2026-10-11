"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Inbox } from "lucide-react";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { trackEvent } from "@/lib/posthog";
import { Button, ButtonLink, EmptyState, ErrorNotice, Page, PageHeader, Panel, SkeletonRows, TeamMark } from "@/components/system";
import { TeamsTabs } from "@/app/teams/TeamsTabs";

type Invite = {
  id: string;
  status: string;
  team_id: string;
  teams: { id: string; name: string; description: string | null; max_members: number } | null;
  profiles: { full_name: string | null } | null;
};

/**
 * Team invites. Same query, realtime channel and RPCs as V1
 * (accept_team_invite / reject_team_invite).
 */
export default function InvitesPage() {
  const { showToast } = useNotification();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [joinedTeam, setJoinedTeam] = useState<{ id: string; name: string } | null>(null);
  const pendingActions = useRef(new Set<string>());
  const resolvedInvites = useRef(new Set<string>());
  const loadVersion = useRef(0);

  async function loadInvites() {
    const version = ++loadVersion.current;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return;
      }
      const { data, error: qErr } = await supabase
        .from("team_invites")
        .select(`*, teams ( id, name, description, max_members ), profiles!team_invites_invited_by_fkey ( full_name )`)
        .eq("invited_user_id", user.id)
        .eq("status", "pending");
      // Realtime and post-action refreshes can complete out of order.
      if (version !== loadVersion.current) return;
      if (qErr) {
        console.error("[invites] load failed:", qErr);
        setError(qErr.message);
      } else {
        setError(null);
        setInvites(((data as Invite[]) || []).filter(invite => !resolvedInvites.current.has(invite.id)));
      }
    } catch (err) {
      console.error(err);
      if (version === loadVersion.current) setError("Couldn't refresh invitations. Please try again.");
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    let unsub: (() => void) | null = null;
    Promise.resolve().then(async () => {
      await loadInvites();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;
      const channel = supabase
        .channel(`team_invites:${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "team_invites", filter: `invited_user_id=eq.${user.id}` }, () => {
          loadInvites();
        });
      unsub = subscribeWithRetry(channel);
    });
    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, []);

  function beginAction(inviteId: string) {
    if (pendingActions.current.has(inviteId) || resolvedInvites.current.has(inviteId)) return false;
    pendingActions.current.add(inviteId);
    setBusyIds(current => new Set(current).add(inviteId));
    return true;
  }

  function finishAction(inviteId: string) {
    pendingActions.current.delete(inviteId);
    setBusyIds(current => {
      const next = new Set(current);
      next.delete(inviteId);
      return next;
    });
  }

  function removeResolvedInvite(inviteId: string) {
    resolvedInvites.current.add(inviteId);
    setInvites(current => current.filter(invite => invite.id !== inviteId));
  }

  async function acceptInvite(invite: Invite) {
    if (!beginAction(invite.id)) return;
    // Keep a snapshot independent of the pending list and Realtime updates.
    const acceptedTeam = { id: invite.team_id, name: invite.teams?.name || "your team" };
    try {
      const { error: rpcErr } = await supabase.rpc("accept_team_invite", { p_invite_id: invite.id });
      if (rpcErr) {
        showToast(rpcErr.message, "error");
        return;
      }
      removeResolvedInvite(invite.id);
      setJoinedTeam(acceptedTeam);
      try {
        trackEvent("team_invite_accepted", { team_id: acceptedTeam.id });
      } catch (trackingError) {
        console.error("[invites] acceptance analytics failed:", trackingError);
      }
      showToast("Invite accepted!", "success");
      window.dispatchEvent(new Event("hm:teams-changed"));
      loadInvites();
    } catch (err) {
      console.error(err);
      showToast("Failed to accept invite.", "error");
    } finally {
      finishAction(invite.id);
    }
  }

  async function rejectInvite(inviteId: string) {
    if (!beginAction(inviteId)) return;
    try {
      const { error: rpcErr } = await supabase.rpc("reject_team_invite", { p_invite_id: inviteId });
      if (rpcErr) {
        showToast(rpcErr.message, "error");
        return;
      }
      removeResolvedInvite(inviteId);
      showToast("Invite rejected.", "info");
      loadInvites();
    } catch (err) {
      console.error(err);
      showToast("Failed to reject invite.", "error");
    } finally {
      finishAction(inviteId);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Teams"
        meta={loading ? "Checking invites…" : invites.length ? `${invites.length} team${invites.length === 1 ? " wants" : "s want"} you` : "No pending invites"}
        tabs={<TeamsTabs invites={invites.length} />}
      />
      <div className="mt-7">
        {joinedTeam && (
          <Panel as="section" className="mb-5 p-4 sm:p-5">
            <div role="status" aria-live="polite" aria-atomic="true">
              <h2 className="text-[15px] font-semibold text-ink">You joined {joinedTeam.name}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                Your team workspace is ready. Open it now or keep reviewing your invitations below.
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <ButtonLink href={`/teams/${encodeURIComponent(joinedTeam.id)}/workspace`} variant="primary" className="w-full sm:w-auto">
                Open team workspace
              </ButtonLink>
              <Button variant="ghost" onClick={() => setJoinedTeam(null)} aria-label="Dismiss joined team notice">
                Dismiss
              </Button>
            </div>
          </Panel>
        )}
        {error && <ErrorNotice className="mb-4" title="Couldn't load invites" detail={error} onRetry={loadInvites} />}
        {loading ? (
          <SkeletonRows rows={2} avatar="square" />
        ) : invites.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="No pending invites"
            body="When a team owner invites you, it shows up here and on your home screen."
            action={
              <ButtonLink href="/teams" size="sm" variant="secondary">
                Find a team
              </ButtonLink>
            }
          />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
            <AnimatePresence initial={false}>
              {invites.map((inv) => (
                <motion.li
                  key={inv.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3.5">
                    <TeamMark name={inv.teams?.name} size="lg" />
                    <div className="min-w-0">
                      <Link href={`/teams/${inv.team_id}`} className="text-[15px] font-semibold text-ink hover:underline decoration-line-strong underline-offset-4">
                        {inv.teams?.name || "A team"}
                      </Link>
                      <p className="mt-0.5 text-[12.5px] text-ink-3">Invited by {inv.profiles?.full_name || "the team owner"}</p>
                      <p className="mt-1.5 line-clamp-2 text-[13px] text-ink-2">{inv.teams?.description || "No description provided."}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 pl-[62px] sm:pl-0">
                    <ButtonLink href={`/teams/${inv.team_id}`} size="sm" variant="ghost">
                      View team
                    </ButtonLink>
                    <Button size="sm" variant="ghost" disabled={busyIds.has(inv.id)} onClick={() => rejectInvite(inv.id)}>
                      Decline
                    </Button>
                    <Button size="sm" variant="primary" loading={busyIds.has(inv.id)} onClick={() => acceptInvite(inv)}>
                      Accept
                    </Button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </Page>
  );
}
