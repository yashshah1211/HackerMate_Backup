"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BellOff, Check, CheckCheck, Trash2 } from "lucide-react";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";
import {
  Button,
  EmptyState,
  ErrorNotice,
  IconButton,
  Page,
  PageHeader,
  Section,
  Segmented,
  SkeletonRows,
  Tape,
  type TapeTone,
} from "@/components/system";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

type Filter = "all" | "unread" | "teams" | "connections";

/* ── helpers ────────────────────────────────────────────── */

function isToday(dateString: string) {
  const d = new Date(dateString);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

/** Same keyword classification + tones as the shell inbox drawer. */
function classify(message: string): { label: string; tone: TapeTone } {
  const lower = message.toLowerCase();
  if (lower.includes("connection") || lower.includes("connect")) return { label: "Connection", tone: "info" };
  if (lower.includes("invite") || lower.includes("invited")) return { label: "Invite", tone: "accent" };
  if (lower.includes("joined") || lower.includes("join")) return { label: "Team", tone: "ok" };
  if (lower.includes("hackathon") || lower.includes("hack") || lower.includes("deadline")) return { label: "Hackathon", tone: "hack" };
  if (lower.includes("mentioned") || lower.includes("message")) return { label: "Mention", tone: "proj" };
  return { label: "Activity", tone: "neutral" };
}

/* ── component ──────────────────────────────────────────── */

function NotificationsContent() {
  const { showToast, confirm } = useNotification();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let active = true;
    let unsub: (() => void) | null = null;

    loadNotifications();

    async function initRealtime() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;

      // Clean up previous channel from global client if exists
      const existingChannel = supabase.channel(`notifications-page:${user.id}`);
      await supabase.removeChannel(existingChannel);

      if (!active) return;

      const activeChannel = supabase
        .channel(`notifications-page:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadNotifications();
          }
        );

      unsub = subscribeWithRetry(activeChannel);
    }

    initRealtime();

    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, []);

async function resolveNotificationLink(n: Notification, userInvites: any[]): Promise<string | null> {
  if (n.link && n.link.startsWith("/teams/")) {
    return n.link;
  }

  const lowerMsg = n.message.toLowerCase();
  if (lowerMsg.includes("invited") || lowerMsg.includes("invite")) {
    // 1. Try matching with user's team_invites
    for (const inv of userInvites) {
      if (inv.teams?.name && lowerMsg.includes(inv.teams.name.toLowerCase())) {
        return `/teams/${inv.team_id}`;
      }
    }

    // 2. Try extracting team name from "invited to join <Team Name>"
    const match = n.message.match(/invited\s+to\s+join\s+(.+)$/i);
    if (match && match[1]) {
      const teamName = match[1].trim();
      const { data: matchedTeams } = await supabase
        .from("teams")
        .select("id")
        .ilike("name", teamName)
        .limit(1);

      if (matchedTeams && matchedTeams.length > 0) {
        return `/teams/${matchedTeams[0].id}`;
      }
    }

    // 3. Fallback: if user has 1 invite, return that team link
    if (userInvites.length > 0 && userInvites[0].team_id) {
      return `/teams/${userInvites[0].team_id}`;
    }
  }

  return n.link || (lowerMsg.includes("invite") ? "/invites" : null);
}

  async function loadNotifications() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      // Exclude generic per-message chat notifications (tracked via the
      // unread-message badge in the Navbar). Mention notifications use
      // "mentioned" in the message text and are intentionally kept visible.
      .not("message", "ilike", "%sent you a message%")
      .not("message", "ilike", "%new message%")
      .order("created_at", { ascending: false });

    if (error || !data) {
      if (error) console.error("[notifications] load failed:", error);
      setLoadError(error?.message || null);
      setLoading(false);
      return;
    }
    setLoadError(null);

    // Fetch user's team_invites to resolve team links for invitation notifications
    const { data: userInvites, error: invErr } = await supabase
      .from("team_invites")
      .select("team_id, status, teams(id, name)")
      .eq("invited_user_id", user.id);
    if (invErr) console.error("[notifications] team invites lookup failed:", invErr);

    const resolvedNotifs = await Promise.all(
      data.map(async (n) => {
        const resolvedLink = await resolveNotificationLink(n, userInvites || []);
        return { ...n, link: resolvedLink };
      })
    );

    setNotifications(resolvedNotifs);
    setLoading(false);
  }

  async function markAsRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    loadNotifications();
  }

  async function markAllAsRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    loadNotifications();
  }

  async function clearAllNotifications() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    confirm({
      title: "Clear Notifications",
      message: "Are you sure you want to delete all notifications? This action cannot be undone.",
      confirmText: "Clear All",
      cancelText: "Cancel",
      onConfirm: async () => {
        const { error } = await supabase
          .from("notifications")
          .delete()
          .eq("user_id", user.id);

        if (error) {
          showToast(error.message, "error");
        } else {
          showToast("All notifications cleared.", "success");
          loadNotifications();
        }
      }
    });
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Client-side view filter (same buckets as the inbox drawer).
  const filtered = notifications.filter((n) => {
    const l = n.message.toLowerCase();
    if (filter === "unread") return !n.is_read;
    if (filter === "teams") return l.includes("team") || l.includes("joined") || l.includes("invite");
    if (filter === "connections") return l.includes("connect") || l.includes("connection");
    return true;
  });
  const todayNotifs = filtered.filter((n) => isToday(n.created_at));
  const earlierNotifs = filtered.filter((n) => !isToday(n.created_at));

  return (
    <Page width="narrow">
      <PageHeader
        title="Notifications"
        meta={
          loading
            ? "Checking your inbox…"
            : unreadCount > 0
              ? <><span className="font-mono text-accent-ink tabular">{unreadCount}</span> unread</>
              : "You're all caught up"
        }
        actions={
          !loading && (unreadCount > 0 || notifications.length > 0) ? (
            <>
              {unreadCount > 0 && (
                <Button variant="secondary" icon={<CheckCheck />} onClick={markAllAsRead}>
                  Mark all read
                </Button>
              )}
              {notifications.length > 0 && (
                <Button variant="ghost" icon={<Trash2 />} onClick={clearAllNotifications}>
                  Clear all
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <div className="mt-6">
        {notifications.length > 0 && (
          <div className="max-w-full overflow-x-auto scrollbar-none">
            <Segmented<Filter>
              label="Filter notifications"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "unread", label: "Unread", count: unreadCount },
                { value: "teams", label: "Teams" },
                { value: "connections", label: "Connections" },
              ]}
            />
          </div>
        )}

        {loadError && (
          <ErrorNotice
            className="mt-4"
            title="Couldn't load notifications"
            detail={loadError}
            onRetry={loadNotifications}
          />
        )}

        <div className="mt-5 space-y-8">
          {loading ? (
            <SkeletonRows rows={6} avatar="none" />
          ) : notifications.length === 0 ? (
            !loadError && (
              <EmptyState
                icon={<BellOff />}
                title="No notifications yet"
                body="Connection requests, team invites and activity show up here."
              />
            )
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<BellOff />}
              title={filter === "unread" ? "You're caught up" : "Nothing here"}
              body={filter === "unread" ? "No unread updates." : "No notifications match this filter."}
              action={
                <Button size="sm" variant="secondary" onClick={() => setFilter("all")}>
                  Show all
                </Button>
              }
            />
          ) : (
            <>
              {todayNotifs.length > 0 && (
                <Section title="Today" count={todayNotifs.length} boxed>
                  <ul className="divide-y divide-line">
                    {todayNotifs.map((n) => (
                      <NotifRow key={n.id} n={n} markAsRead={markAsRead} />
                    ))}
                  </ul>
                </Section>
              )}
              {earlierNotifs.length > 0 && (
                <Section title="Earlier" count={earlierNotifs.length} boxed>
                  <ul className="divide-y divide-line">
                    {earlierNotifs.map((n) => (
                      <NotifRow key={n.id} n={n} markAsRead={markAsRead} />
                    ))}
                  </ul>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </Page>
  );
}

/* ── Single notification row (full-page version of the drawer row) ── */
function NotifRow({
  n,
  markAsRead,
}: {
  n: Notification;
  markAsRead: (id: string) => void;
}) {
  const router = useRouter();
  const meta = classify(n.message);
  const lower = n.message.toLowerCase();
  const isInviteNotif = lower.includes("invited") || lower.includes("invite");
  const targetLink = n.link || (isInviteNotif ? "/invites" : null);

  const handleCardClick = async () => {
    if (!n.is_read) {
      await markAsRead(n.id);
    }
    if (targetLink) {
      router.push(targetLink);
    }
  };

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick();
          }
        }}
        className="group flex cursor-pointer flex-col gap-2.5 px-4 py-3.5 text-left transition-colors hover:bg-hover sm:flex-row sm:items-start sm:gap-4 md:px-5"
      >
        <div className="flex min-w-0 flex-1 gap-3">
          {/* Unread indicator */}
          <span
            className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-accent")}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Tape tone={meta.tone}>{meta.label}</Tape>
              <time dateTime={n.created_at} className="font-mono text-[12.5px] text-ink-3">
                {relativeTime(n.created_at)}
              </time>
            </div>
            <p className={cn("break-words text-[14px] leading-snug", n.is_read ? "text-ink-3" : "font-medium text-ink")}>
              {!n.is_read && <span className="sr-only">Unread: </span>}
              {n.message}
            </p>
          </div>
        </div>

        {/* Actions: under the text on mobile, reveal on hover on desktop */}
        {(targetLink || !n.is_read) && (
          <div className="flex shrink-0 items-center gap-1 pl-[18px] sm:pl-0 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            {targetLink && (
              <Button
                size="sm"
                variant="ghost"
                className="h-9 sm:h-8"
                iconRight={<ArrowRight />}
                onClick={async (e) => {
                  e.stopPropagation();
                  await markAsRead(n.id);
                  if (targetLink) router.push(targetLink);
                }}
              >
                {isInviteNotif ? "View team" : "Open"}
              </Button>
            )}
            {!n.is_read && (
              <IconButton
                label="Mark as read"
                size="md"
                onClick={(e) => {
                  e.stopPropagation();
                  markAsRead(n.id);
                }}
              >
                <Check />
              </IconButton>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export default function NotificationsPage() {
  return (
    <AuthGuard>
      <NotificationsContent />
    </AuthGuard>
  );
}

