"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, MessageSquare, Send, UsersRound } from "lucide-react";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";
import PostAcceptanceTeamPrompt, { type TeamWithSlots, type ConnectedUser } from "@/components/PostAcceptanceTeamPrompt";
import { trackEvent } from "@/lib/posthog";
import {
  Avatar,
  Button,
  ButtonLink,
  EmptyState,
  ErrorNotice,
  Page,
  PageHeader,
  RouteTabs,
  Segmented,
  SkeletonRows,
} from "@/components/system";
import { relativeTime } from "@/lib/time";

type RequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  message?: string | null;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  college: string | null;
};

type EnrichedRequest = RequestRow & { profile: Profile };

type View = "requests" | "sent" | "connected";

// Taller on touch screens (36px), compact on desktop.
const ROW_BTN = "h-9 sm:h-7";

function ConnectionsContent() {
  const { showToast } = useNotification();
  const router = useRouter();
  const [incoming, setIncoming] = useState<EnrichedRequest[]>([]);
  const [outgoing, setOutgoing] = useState<EnrichedRequest[]>([]);
  const [connections, setConnections] = useState<EnrichedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);

  // ── Post-acceptance team prompt ──
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptUser, setPromptUser] = useState<ConnectedUser | null>(null);
  const [promptTeams, setPromptTeams] = useState<TeamWithSlots[]>([]);

  async function fetchTeamsWithSlots(userId: string): Promise<TeamWithSlots[]> {
    // Fetch teams owned by the accepting user with open slots
    const { data: teamsData, error: teamsError } = await supabase
      .from("teams")
      .select("id, name, max_members, team_members(count)")
      .eq("owner_id", userId);

    if (teamsError) console.error("[connections] owned teams lookup failed:", teamsError);
    if (!teamsData) return [];

    return (teamsData as unknown as {
      id: string;
      name: string;
      max_members: number;
      team_members: { count: number }[] | { count: number };
    }[]).flatMap((t) => {
      const countObj = Array.isArray(t.team_members) ? t.team_members[0] : t.team_members;
      const memberCount = countObj ? countObj.count : 0;
      const openSlots = (t.max_members ?? 4) - memberCount;
      return openSlots > 0 ? [{ id: t.id, name: t.name, openSlots }] : [];
    });
  }

  useEffect(() => {
    let active = true;
    let unsubSender: (() => void) | null = null;
    let unsubReceiver: (() => void) | null = null;

    loadAll();

    async function initRealtime() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;

      // Clean up previous channel from global client if exists
      const existingSender = supabase.channel(`friend_requests-sender:${user.id}`);
      await supabase.removeChannel(existingSender);
      const existingReceiver = supabase.channel(`friend_requests-receiver:${user.id}`);
      await supabase.removeChannel(existingReceiver);

      if (!active) return;

      const senderChannel = supabase.channel(`friend_requests-sender:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "friend_requests",
            filter: `sender_id=eq.${user.id}`,
          },
          () => {
            loadAll();
          }
        );

      const receiverChannel = supabase.channel(`friend_requests-receiver:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "friend_requests",
            filter: `receiver_id=eq.${user.id}`,
          },
          () => {
            loadAll();
          }
        );

      unsubSender = subscribeWithRetry(senderChannel);
      unsubReceiver = subscribeWithRetry(receiverChannel);
    }

    initRealtime();

    return () => {
      active = false;
      if (unsubSender) unsubSender();
      if (unsubReceiver) unsubReceiver();
    };
  }, []);

  async function loadAll() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: requests, error } = await supabase
      .from("friend_requests")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    const rows = requests || [];

    // Collect all the "other person" ids we need profiles for
    const otherIds = Array.from(
      new Set(
        rows.map((r) => (r.sender_id === user.id ? r.receiver_id : r.sender_id))
      )
    );

    let profilesById: Record<string, Profile> = {};
    let profilesError: string | null = null;
    if (otherIds.length > 0) {
      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, college")
        .in("id", otherIds);

      if (profErr) {
        console.error("[connections] profiles lookup failed:", profErr);
        profilesError = profErr.message;
      }

      profilesById = (profiles || []).reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {} as Record<string, Profile>);
    }

    const enriched: EnrichedRequest[] = rows
      .map((r) => {
        const otherId = r.sender_id === user.id ? r.receiver_id : r.sender_id;
        const profile = profilesById[otherId];
        if (!profile) return null;
        return { ...r, profile };
      })
      .filter(Boolean) as EnrichedRequest[];

    setIncoming(
      enriched.filter((r) => r.status === "pending" && r.receiver_id === user.id)
    );
    setOutgoing(
      enriched.filter((r) => r.status === "pending" && r.sender_id === user.id)
    );
    setConnections(enriched.filter((r) => r.status === "accepted"));

    setLoadError(profilesError);
    setLoading(false);
  }

  async function acceptRequest(requestId: string, otherProfile: Profile) {
    setActionLoadingId(requestId);
    const { error } = await supabase.rpc("accept_connection_request", {
      p_request_id: requestId,
    });

    if (error) {
      showToast(error.message, "error");
      setActionLoadingId(null);
      return;
    }

    showToast("Connection accepted!", "success");
    trackEvent("connection_request_accepted", {
      other_user_id: otherProfile.id,
    });
    await loadAll();
    setActionLoadingId(null);

    // Fire team formation prompt
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const slots = await fetchTeamsWithSlots(user.id);
      setPromptTeams(slots);
      setPromptUser(otherProfile);
      setPromptOpen(true);
    }
  }

  async function rejectOrCancel(requestId: string) {
    setActionLoadingId(requestId);
    const { error } = await supabase
      .from("friend_requests")
      .delete()
      .eq("id", requestId);

    if (error) {
      showToast(error.message, "error");
      setActionLoadingId(null);
      return;
    }

    showToast("Request updated.", "info");
    trackEvent("connection_request_declined", {
      request_id: requestId,
    });
    await loadAll();
    setActionLoadingId(null);
  }

  // Open on whatever needs attention first; the builder can switch freely.
  const activeView: View =
    view ??
    (incoming.length > 0 ? "requests" : connections.length > 0 ? "connected" : outgoing.length > 0 ? "sent" : "requests");

  const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

  return (
    <>
      <Page width="wide">
        <PageHeader
          title="Builders"
          meta={
            loading
              ? "Loading your network…"
              : `${plural(connections.length, "connection", "connections")} · ${plural(incoming.length, "request", "requests")} waiting`
          }
          tabs={
            <RouteTabs
              tabs={[
                { href: "/developers", label: "Discover", active: false },
                { href: "/connections", label: "Your network", active: true },
              ]}
            />
          }
        />

        <div className="mt-6 max-w-[860px]">
          <Segmented<View>
            label="Network view"
            value={activeView}
            onChange={setView}
            options={[
              { value: "requests", label: "Requests", count: incoming.length },
              { value: "sent", label: "Sent", count: outgoing.length },
              { value: "connected", label: "Connected", count: connections.length },
            ]}
          />

          {loadError && (
            <ErrorNotice className="mt-4" title="Couldn't load your network" detail={loadError} onRetry={loadAll} />
          )}

          <div className="mt-4">
            {loading ? (
              <SkeletonRows rows={5} />
            ) : activeView === "requests" ? (
              incoming.length === 0 ? (
                <EmptyState
                  icon={<Inbox />}
                  title="No pending requests"
                  body="When a builder asks to connect, it shows up here."
                  action={
                    <ButtonLink href="/developers" size="sm" variant="secondary">
                      Find builders
                    </ButtonLink>
                  }
                />
              ) : (
                <ul className="divide-y divide-line border-y border-line" data-stagger>
                  {incoming.map((req) => (
                    <PersonRow
                      key={req.id}
                      profile={req.profile}
                      when={`Requested ${relativeTime(req.created_at, { suffix: true })}`}
                      message={req.message}
                      actions={
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={ROW_BTN}
                            disabled={actionLoadingId === req.id}
                            onClick={() => rejectOrCancel(req.id)}
                          >
                            Decline
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            className={ROW_BTN}
                            loading={actionLoadingId === req.id}
                            onClick={() => acceptRequest(req.id, req.profile)}
                          >
                            Accept
                          </Button>
                        </>
                      }
                    />
                  ))}
                </ul>
              )
            ) : activeView === "sent" ? (
              outgoing.length === 0 ? (
                <EmptyState
                  icon={<Send />}
                  title="No sent requests"
                  body="Requests you send wait here until the builder responds."
                  action={
                    <ButtonLink href="/developers" size="sm" variant="secondary">
                      Find builders
                    </ButtonLink>
                  }
                />
              ) : (
                <ul className="divide-y divide-line border-y border-line" data-stagger>
                  {outgoing.map((req) => (
                    <PersonRow
                      key={req.id}
                      profile={req.profile}
                      when={`Sent ${relativeTime(req.created_at, { suffix: true })}`}
                      message={req.message}
                      messageLabel="Your pitch"
                      actions={
                        <Button
                          size="sm"
                          variant="ghost"
                          className={ROW_BTN}
                          loading={actionLoadingId === req.id}
                          onClick={() => rejectOrCancel(req.id)}
                        >
                          Cancel request
                        </Button>
                      }
                    />
                  ))}
                </ul>
              )
            ) : connections.length === 0 ? (
              <EmptyState
                icon={<UsersRound />}
                title="No connections yet"
                body="Connect with builders to form hackathon teams and collaborate."
                action={
                  <ButtonLink href="/developers" size="sm" variant="secondary">
                    Explore builders
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="divide-y divide-line border-y border-line" data-stagger>
                {connections.map((conn) => (
                  <PersonRow
                    key={conn.id}
                    profile={conn.profile}
                    actions={
                      <ButtonLink
                        href={`/messages?user=${conn.profile.id}`}
                        size="sm"
                        variant="secondary"
                        className={ROW_BTN}
                        icon={<MessageSquare />}
                      >
                        Message
                      </ButtonLink>
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </Page>

      {/* Post-acceptance team formation prompt */}
      {promptUser && (
        <PostAcceptanceTeamPrompt
          open={promptOpen}
          onClose={() => setPromptOpen(false)}
          connectedUser={promptUser}
          teamsWithSlots={promptTeams}
          onCreateTeam={() =>
            router.push(`/teams/create?invite=${promptUser.id}`)
          }
          onInviteToTeam={async (teamId) => {
            const { error } = await supabase.rpc("send_team_invite", {
              p_team_id: teamId,
              p_invited_user_id: promptUser.id,
            });
            if (error) {
              showToast(error.message, "error");
            } else {
              showToast(`Invite sent to ${promptUser.full_name}!`, "success");
            }

          }}
        />
      )}
    </>
  );
}

/** V2 builder row: avatar, name → profile, meta line, optional pitch, actions on the right. */
function PersonRow({
  profile,
  when,
  message,
  messageLabel,
  actions,
}: {
  profile: Profile;
  when?: string;
  message?: string | null;
  messageLabel?: string;
  actions: ReactNode;
}) {
  return (
    <li className="group relative flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Avatar name={profile.full_name} src={profile.avatar_url} size="lg" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/profile/${profile.id}`}
            className="block truncate text-[15px] font-semibold text-ink decoration-line-strong underline-offset-4 after:absolute after:inset-0 after:content-[''] group-hover:underline"
          >
            {profile.full_name || "Builder"}
          </Link>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-3">
            {[profile.college || "Independent builder", when].filter(Boolean).join(" · ")}
          </p>
          {message && (
            <p className="mt-2 border-l-2 border-line-strong pl-3 text-[13px] leading-relaxed break-words text-ink-2">
              {messageLabel && <span className="mr-1.5 caps-label text-ink-3">{messageLabel}</span>}
              &ldquo;{message}&rdquo;
            </p>
          )}
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-1.5 pl-[60px] sm:pl-0">{actions}</div>
    </li>
  );
}

export default function ConnectionsPage() {
  return (
    <AuthGuard>
      <ConnectionsContent />
    </AuthGuard>
  );
}
