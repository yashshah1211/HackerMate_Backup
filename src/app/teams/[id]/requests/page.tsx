"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Inbox, Lock, TriangleAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";
import {
  Avatar,
  Button,
  ButtonLink,
  EmptyState,
  ErrorNotice,
  Page,
  PageHeader,
  SeatMeter,
  SkeletonRows,
} from "@/components/system";
type Request = {
  id: string;
  user_id: string;
  status: string;
  // Matches the embedded select below (id, full_name, avatar_url).
  profiles: {
    id: string;
    full_name: string;
    avatar_url?: string | null;
  };
};
function TeamRequestsContent() {
  const params = useParams();
  const { showToast } = useNotification();
  const teamId = params.id as string;
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [maxMembers, setMaxMembers] = useState(0);
  const [teamFull, setTeamFull] = useState(false);
  const [teamName, setTeamName] = useState("");
  // UI-only: surfaces query failures instead of a silent empty state.
  const [loadError, setLoadError] = useState<string | null>(null);
  // UI-only: disables a row's buttons while its action runs.
  const [busyId, setBusyId] = useState<string | null>(null);
  async function checkOwnership() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data: team, error } = await supabase
      .from("teams")
      .select("owner_id, max_members, name")
      .eq("id", teamId)
      .single();
    if (error || !team) {
      console.error(error);
      setLoadError(error?.message ?? null);
      setLoading(false);
      return;
    }
    setTeamName(team.name);
    if (team.owner_id !== user.id) {
      setLoading(false);
      return;
    }
    setMaxMembers(team.max_members || 0);
    const { count } = await supabase
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId);
    const currentCount = count || 0;
    setMemberCount(currentCount);
    if (team.max_members && currentCount >= team.max_members) {
      setTeamFull(true);
    } else {
      setTeamFull(false);
    }
    setIsOwner(true);
    loadRequests();
  }
  async function loadRequests() {
    const { data, error } = await supabase
      .from("team_join_requests")
      .select(
        `
        id,
        user_id,
        status,
        profiles (
          id,
          full_name,
          avatar_url
        )
      `
      )
      .eq("team_id", teamId)
      .eq("status", "pending");
    if (error) {
      console.error(error);
      setLoadError(error.message);
    } else {
      setLoadError(null);
      setRequests(data as unknown as Request[]);
    }
    setLoading(false);
  }
  useEffect(() => {
    if (teamId) {
      Promise.resolve().then(() => {
        checkOwnership();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);
  async function acceptRequest(request: Request) {
    const { error } = await supabase.rpc("accept_team_join_request", {
      p_request_id: request.id,
    });
    if (error) {
      showToast(error.message, "error");
      return;
    }
    showToast("Join request accepted!", "success");
    await checkOwnership();
  }
  async function rejectRequest(requestId: string) {
    const { error } = await supabase
      .from("team_join_requests")
      .delete()
      .eq("id", requestId);
    if (error) {
      console.error(error);
      showToast(error.message, "error");
      return;
    }
    showToast("Join request rejected.", "info");
    loadRequests();
  }

  // UI wrapper: tracks the busy row around the unchanged handlers.
  async function runForRow(id: string, action: () => Promise<void>) {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  }

  function retryLoad() {
    setLoadError(null);
    setLoading(true);
    checkOwnership();
  }

  const backLink = (
    <Link
      href={`/teams/${teamId}`}
      className="-ml-1 inline-flex h-9 max-w-full items-center gap-1.5 rounded-md px-1 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink"
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{teamName ? `Back to ${teamName}` : "Back to team"}</span>
    </Link>
  );

  if (loading) {
    return (
      <Page width="narrow">
        <div className="pt-3 md:pt-5">{backLink}</div>
        <PageHeader className="pt-1 md:pt-2" title="Join requests" meta="Loading requests…" />
        <div className="mt-2">
          <SkeletonRows rows={3} />
        </div>
      </Page>
    );
  }
  if (!isOwner) {
    return (
      <Page width="narrow">
        <div className="pt-3 md:pt-5">{backLink}</div>
        <PageHeader className="pt-1 md:pt-2" title="Join requests" />
        {loadError ? (
          <ErrorNotice title="Couldn't load this team" detail={loadError} onRetry={retryLoad} />
        ) : (
          <EmptyState
            icon={<Lock />}
            title="Only the team owner can review requests"
            body="Ask the owner to accept you, or head back to the team page."
            action={
              <ButtonLink href={`/teams/${teamId}`} size="sm" variant="secondary">
                Back to team
              </ButtonLink>
            }
          />
        )}
      </Page>
    );
  }
  return (
    <Page width="narrow">
      <div className="pt-3 md:pt-5">{backLink}</div>
      <PageHeader
        className="pt-1 md:pt-2"
        eyebrow={teamName || "Team"}
        title="Join requests"
        meta={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {requests.length} pending
            </span>
            <SeatMeter filled={memberCount} total={maxMembers || null} />
          </span>
        }
      />

      <div className="space-y-4">
        {loadError && (
          <ErrorNotice title="Couldn't load join requests" detail={loadError} onRetry={retryLoad} />
        )}

        {/* Team Full Warning */}
        {teamFull && (
          <div className="flex items-start gap-2.5 rounded-lg bg-warn-soft px-4 py-3 ring-1 ring-inset ring-warn/30" role="status">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            <p className="text-[13px] text-ink-2">
              <span className="font-semibold text-ink">Team is full.</span> Free up a seat before accepting anyone else.
            </p>
          </div>
        )}

        {/* Requests List */}
        {requests.length === 0 ? (
          !loadError && (
            <EmptyState
              icon={<Inbox />}
              title="No pending requests"
              body="When builders ask to join your team, they show up here."
            />
          )
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
            {requests.map((request) => {
              const displayName = request.profiles?.full_name || "Unnamed builder";
              const busy = busyId === request.id;
              return (
                <li key={request.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={displayName} src={request.profiles?.avatar_url} size="md" />
                    <div className="min-w-0">
                      <Link
                        href={`/profile/${request.user_id}`}
                        className="block truncate text-[14px] font-semibold text-ink decoration-line-strong underline-offset-4 hover:underline"
                      >
                        {displayName}
                      </Link>
                      <p className="text-[12.5px] text-ink-3">Wants to join</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-12 sm:pl-0">
                    <ButtonLink href={`/profile/${request.user_id}`} variant="ghost" className="h-9 md:h-[34px]">
                      View profile
                    </ButtonLink>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => runForRow(request.id, () => rejectRequest(request.id))}
                      className="h-9 md:h-[34px]"
                    >
                      Decline
                    </Button>
                    {!teamFull && (
                      <Button
                        variant="primary"
                        icon={<Check aria-hidden />}
                        loading={busy}
                        onClick={() => runForRow(request.id, () => acceptRequest(request))}
                        className="h-9 md:h-[34px]"
                      >
                        Accept
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Page>
  );
}
export default function TeamRequestsPage() {
  return (
    <AuthGuard>
      <TeamRequestsContent />
    </AuthGuard>
  );
}
