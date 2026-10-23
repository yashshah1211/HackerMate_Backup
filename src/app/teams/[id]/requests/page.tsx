"use client";
import { useEffect, useRef, useState } from "react";
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [capacityKnown, setCapacityKnown] = useState(false);
  const [pendingKnown, setPendingKnown] = useState(false);
  const pendingVerified = useRef(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const scope = useRef(0);
  const read = useRef(0);
  const owner = useRef<string | null>(null);
  const action = useRef(false);
  const mounted = useRef(false);
  const current = (epoch: number) => mounted.current && epoch === scope.current;

  async function checkOwnership() {
    const epoch = scope.current, generation = ++read.current;
    const valid = () => current(epoch) && generation === read.current;
    pendingVerified.current = false;
    setPendingKnown(false);
    setCapacityKnown(false);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!valid()) return;
      if (authError) throw authError;
      if (!user) { owner.current = null; setIsOwner(false); setRequests([]); return; }
      const { data: team, error } = await supabase.from("teams")
        .select("owner_id, max_members, name").eq("id", teamId).single();
      if (!valid()) return;
      if (error) throw error;
      if (!team) throw new Error("Couldn't verify this team.");
      setTeamName(team.name);
      owner.current = team.owner_id === user.id ? user.id : null;
      setIsOwner(!!owner.current);
      if (!owner.current) { setRequests([]); return; }
      setMaxMembers(team.max_members || 0);
      const [capacityRead, pendingRead] = await Promise.allSettled([
        supabase.from("team_members").select("id", { count: "exact", head: true }).eq("team_id", teamId),
        supabase.from("team_join_requests").select("id, user_id, status, profiles(id, full_name, avatar_url)")
          .eq("team_id", teamId).eq("status", "pending"),
      ]);
      if (!valid()) return;
      const capacity = capacityRead.status === "fulfilled" ? capacityRead.value : { count: null, error: capacityRead.reason };
      if (capacity.error) console.error("[requests] capacity read failed:", capacity.error);
      const known = !capacity.error && typeof capacity.count === "number" && Number.isInteger(capacity.count) && capacity.count >= 0;
      setCapacityKnown(known);
      if (known) {
        setMemberCount(capacity.count!);
        setTeamFull(!!team.max_members && capacity.count! >= team.max_members);
      }
      if (pendingRead.status === "rejected") throw pendingRead.reason;
      const pending = pendingRead.value;
      if (pending.error) throw pending.error;
      if (!Array.isArray(pending.data)) throw new Error("Couldn't verify pending requests.");
      setRequests(pending.data as unknown as Request[]);
      pendingVerified.current = true;
      setPendingKnown(true);
      setLoadError(known ? null : "Capacity is unavailable. Refresh before accepting requests.");
    } catch (error) {
      console.error("[requests] load failed:", error);
      if (valid()) setLoadError("Couldn't verify the latest requests. Please refresh.");
    } finally { if (valid()) setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    ++scope.current;
    const initialEpoch = scope.current;
    const reset = () => {
      ++scope.current; owner.current = null; action.current = false;
      pendingVerified.current = false;
      setPendingKnown(false);
      setIsOwner(false); setRequests([]); setCapacityKnown(false); setBusyId(null);
      setLoadError(null); setLoading(true);
    };
    queueMicrotask(() => { if (current(initialEpoch)) void checkOwnership(); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id === owner.current) return;
      reset();
      // Avoid a Supabase auth call inside its auth callback.
      queueMicrotask(() => { if (mounted.current) void checkOwnership(); });
    });
    return () => { mounted.current = false; subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function runForRow(request: Request, accept: boolean) {
    if (action.current || !owner.current || !pendingVerified.current || (accept && (!capacityKnown || teamFull))) return;
    action.current = true;
    const epoch = scope.current, expectedOwner = owner.current;
    setBusyId(request.id);
    ++read.current;
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!current(epoch)) return;
      if (authError) throw authError;
      if (user?.id !== expectedOwner) { ++scope.current; owner.current = null; setIsOwner(false); setRequests([]); return; }
      // The RPC enforces capacity and ownership transactionally; deletes remain team/pending scoped.
      const result = accept
        ? await supabase.rpc("accept_team_join_request", { p_request_id: request.id })
        : await supabase.rpc("reject_team_join_request", { p_request_id: request.id });
      if (!current(epoch)) return;
      if (result.error) throw result.error;
      const confirmed = result.data === (accept ? teamId : request.id);
      if (!confirmed) throw new Error("Unexpected request confirmation");
      showToast(accept ? "Join request accepted!" : "Join request rejected.", accept ? "success" : "info");
    } catch (error) {
      console.error("[requests] decision could not be confirmed:", error);
      if (current(epoch)) showToast("Couldn't verify the change. Refresh requests before trying again.", "error");
    } finally {
      if (current(epoch)) {
        action.current = false; setBusyId(null);
        await checkOwnership(); // Reconcile with reads only, including uncertain responses.
      }
    }
  }

  function retryLoad() { setLoading(true); void checkOwnership(); }

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
            {capacityKnown ? <SeatMeter filled={memberCount} total={maxMembers || null} /> : <span>Capacity unavailable</span>}
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
                      disabled={busyId !== null || !pendingKnown}
                      onClick={() => runForRow(request, false)}
                      className="h-9 md:h-[34px]"
                    >
                      Decline
                    </Button>
                    {capacityKnown && !teamFull && (
                      <Button
                        variant="primary"
                        icon={<Check aria-hidden />}
                        loading={busy}
                        disabled={busyId !== null || !pendingKnown}
                        onClick={() => runForRow(request, true)}
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
  const params = useParams();
  return (
    <AuthGuard>
      <TeamRequestsContent key={params.id as string} />
    </AuthGuard>
  );
}
