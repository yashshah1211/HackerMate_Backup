"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { BellOff, Check, CheckCheck } from "lucide-react";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import { relativeTime } from "@/lib/time";
import { Segmented, Sheet, SkeletonRows, Tape, type TapeTone } from "@/components/system";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}

type Filter = "all" | "unread" | "teams" | "connections";

/** Same keyword classification as V1, mapped onto V2 tape tones. */
function classify(message: string): { label: string; tone: TapeTone } {
  const lower = message.toLowerCase();
  if (lower.includes("connection") || lower.includes("connect")) return { label: "Connection", tone: "info" };
  if (lower.includes("invite") || lower.includes("invited")) return { label: "Invite", tone: "accent" };
  if (lower.includes("joined") || lower.includes("join")) return { label: "Team", tone: "ok" };
  if (lower.includes("hackathon") || lower.includes("hack") || lower.includes("deadline")) return { label: "Hackathon", tone: "hack" };
  if (lower.includes("mentioned") || lower.includes("message")) return { label: "Mention", tone: "proj" };
  return { label: "Activity", tone: "neutral" };
}

/**
 * Inbox sheet. Preserves the V1 drawer contract (props, queries, link
 * resolution, realtime, mark-read) with the V2 sheet UI.
 */
export default function NotificationDrawer({ isOpen, onClose, onCountChange }: NotificationDrawerProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Pending invites let us resolve invite notifications to the right team.
    const { data: invites, error: invErr } = await supabase
      .from("team_invites")
      .select("team_id, teams(name)")
      .eq("invited_user_id", user.id)
      .eq("status", "pending");
    if (invErr) console.error("[inbox] pending invites lookup failed:", invErr);
    const userInvites = invites || [];

    const { data, error } = await supabase
      .from("notifications")
      .select("id, message, link, is_read, created_at")
      .eq("user_id", user.id)
      .not("message", "ilike", "%sent you a message%")
      .not("message", "ilike", "%new message%")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !data) {
      if (error) console.error("[inbox] notifications load failed:", error);
      setLoadError(error?.message || null);
      setLoading(false);
      return;
    }
    setLoadError(null);

    const resolved = data.map((n) => {
      if (n.link && n.link.startsWith("/teams/")) return n;
      const lowerMsg = n.message.toLowerCase();
      if (lowerMsg.includes("invited") || lowerMsg.includes("invite")) {
        for (const inv of userInvites) {
          const tName = (inv as { teams?: { name?: string } | null }).teams?.name;
          if (tName && lowerMsg.includes(tName.toLowerCase())) {
            return { ...n, link: `/teams/${inv.team_id}` };
          }
        }
        if (userInvites.length > 0 && userInvites[0].team_id) {
          return { ...n, link: `/teams/${userInvites[0].team_id}` };
        }
      }
      return { ...n, link: n.link || (lowerMsg.includes("invite") ? "/invites" : null) };
    });

    setNotifications(resolved);
    if (onCountChange) onCountChange(resolved.filter((item) => !item.is_read).length);
    setLoading(false);
  }, [onCountChange]);

  useEffect(() => {
    if (isOpen) {
      Promise.resolve().then(loadNotifications);
    }
  }, [isOpen, loadNotifications]);

  useEffect(() => {
    let active = true;
    let unsub: (() => void) | null = null;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;
      const channel = supabase
        .channel(`notifications-drawer:${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
          if (active) loadNotifications();
        });
      unsub = subscribeWithRetry(channel);
    })();
    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, [loadNotifications]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActionInProgress(id);
    const updated = notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n));
    setNotifications(updated);
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    if (error) console.error("[inbox] mark read failed:", error);
    setActionInProgress(null);
    if (onCountChange) onCountChange(updated.filter((n) => !n.is_read).length);
  };

  const handleMarkAllAsRead = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setActionInProgress("all");
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    if (onCountChange) onCountChange(0);
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    if (error) console.error("[inbox] mark all read failed:", error);
    setActionInProgress(null);
  };

  const handleNotificationClick = (item: NotificationItem) => {
    if (!item.is_read) handleMarkAsRead(item.id);
    onClose();
    if (item.link) router.push(item.link);
  };

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  const filtered = useMemo(
    () =>
      notifications.filter((n) => {
        const l = n.message.toLowerCase();
        if (filter === "unread") return !n.is_read;
        if (filter === "teams") return l.includes("team") || l.includes("joined") || l.includes("invite");
        if (filter === "connections") return l.includes("connect") || l.includes("connection");
        return true;
      }),
    [notifications, filter],
  );

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      label="Inbox"
      width={460}
      title={
        <span className="flex items-baseline gap-2">
          Inbox
          {unreadCount > 0 && <span className="font-mono text-[12px] font-normal text-accent-ink tabular">{unreadCount} new</span>}
        </span>
      }
      headerExtra={
        unreadCount > 0 ? (
          <button
            type="button"
            onClick={handleMarkAllAsRead}
            disabled={actionInProgress === "all"}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-50"
          >
            <CheckCheck className="size-4" />
            Mark all read
          </button>
        ) : null
      }
      footer={
        <button
          type="button"
          onClick={() => {
            onClose();
            router.push("/notifications");
          }}
          className="text-[12.5px] font-medium text-ink-2 hover:text-ink"
        >
          Open full notifications →
        </button>
      }
    >
      <div className="sticky top-0 z-10 border-b border-line bg-overlay px-4 py-2.5 md:px-5">
        <Segmented<Filter>
          label="Filter notifications"
          size="sm"
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

      {loading ? (
        <div className="px-4 md:px-5">
          <SkeletonRows rows={5} avatar="none" />
        </div>
      ) : loadError ? (
        <p className="px-5 py-10 text-center text-[13px] text-ink-3">
          Couldn&apos;t load notifications. <span className="font-mono text-[12.5px]">{loadError}</span>
        </p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <BellOff className="mb-3 size-5 text-ink-4" aria-hidden />
          <p className="text-[13.5px] font-semibold text-ink">{filter === "unread" ? "You're caught up" : "Nothing here yet"}</p>
          <p className="mt-1 max-w-[260px] text-[12.5px] text-ink-3">
            {filter === "unread" ? "No unread updates." : "Team, request and connection activity lands here."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          <AnimatePresence initial={false}>
            {filtered.map((item) => {
              const meta = classify(item.message);
              return (
                <motion.li key={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleNotificationClick(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleNotificationClick(item);
                      }
                    }}
                    className="group relative flex gap-3 px-4 py-3.5 text-left transition-colors hover:bg-hover md:px-5"
                  >
                    <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", item.is_read ? "bg-transparent" : "bg-accent")} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <Tape tone={meta.tone}>{meta.label}</Tape>
                        <span className="font-mono text-[12px] text-ink-4">{relativeTime(item.created_at)}</span>
                      </div>
                      <p className={cn("text-[13.5px] leading-snug", item.is_read ? "text-ink-3" : "text-ink")}>{item.message}</p>
                    </div>
                    {!item.is_read && (
                      <button
                        type="button"
                        onClick={(e) => handleMarkAsRead(item.id, e)}
                        disabled={actionInProgress === item.id}
                        aria-label="Mark as read"
                        title="Mark as read"
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-4 opacity-100 hover:bg-selected hover:text-ink md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                      >
                        <Check className="size-3.5" />
                      </button>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </Sheet>
  );
}

