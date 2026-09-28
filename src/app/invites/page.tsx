"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Inbox } from "lucide-react";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { Button, ButtonLink, EmptyState, ErrorNotice, Page, PageHeader, SkeletonRows, TeamMark } from "@/components/system";
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
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadInvites() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data, error: qErr } = await supabase
        .from("team_invites")
        .select(`*, teams ( id, name, description, max_members ), profiles!team_invites_invited_by_fkey ( full_name )`)
        .eq("invited_user_id", user.id)
        .eq("status", "pending");
      if (qErr) {
        console.error("[invites] load failed:", qErr);
        setError(qErr.message);
      } else {
        setError(null);
        setInvites((data as Invite[]) || []);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
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

  async function acceptInvite(invite: Invite) {
    setBusyId(invite.id);
    try {
      const { error: rpcErr } = await supabase.rpc("accept_team_invite", { p_invite_id: invite.id });
      if (rpcErr) {
        showToast(rpcErr.message, "error");
        return;
      }
      showToast("Invite accepted!", "success");
      window.dispatchEvent(new Event("hm:teams-changed"));
      loadInvites();
    } catch (err) {
      console.error(err);
      showToast("Failed to accept invite.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function rejectInvite(inviteId: string) {
    setBusyId(inviteId);
    try {
      const { error: rpcErr } = await supabase.rpc("reject_team_invite", { p_invite_id: inviteId });
      if (rpcErr) {
        showToast(rpcErr.message, "error");
        return;
      }
      showToast("Invite rejected.", "info");
      loadInvites();
    } catch (err) {
      console.error(err);
      showToast("Failed to reject invite.", "error");
    } finally {
      setBusyId(null);
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
        {error && <ErrorNotice className="mb-4" title="Couldn't load invites" detail={error} onRetry={loadInvites} />}
        {loading ? (
          <SkeletonRows rows={2} avatar="square" />
        ) : invites.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="No invites yet"
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
                    <Button size="sm" variant="ghost" disabled={busyId === inv.id} onClick={() => rejectInvite(inv.id)}>
                      Decline
                    </Button>
                    <Button size="sm" variant="primary" loading={busyId === inv.id} onClick={() => acceptInvite(inv)}>
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
