"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase, subscribeWithRetry } from "@/lib/supabase";

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

/* ── helpers ────────────────────────────────────────────── */

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function getNotificationMetadata(message: string): {
  icon: React.ReactNode;
  accent: string;
  badgeBg: string;
  label: string;
} {
  const lower = message.toLowerCase();

  if (lower.includes("connection") || lower.includes("connect")) {
    return {
      label: "Connection",
      accent: "text-violet-400",
      badgeBg: "bg-violet-500/10 border-violet-500/25 text-violet-400",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584.036-.219.05-.44.05-.666l.001-.03m11.911 0a9.1 9.1 0 00-11.911 0M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    };
  }

  if (lower.includes("invite") || lower.includes("invited")) {
    return {
      label: "Invite",
      accent: "text-amber-400",
      badgeBg: "bg-amber-500/10 border-amber-500/25 text-amber-400",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z" />
        </svg>
      ),
    };
  }

  if (lower.includes("joined") || lower.includes("join")) {
    return {
      label: "Team",
      accent: "text-emerald-400",
      badgeBg: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z" />
        </svg>
      ),
    };
  }

  if (lower.includes("hackathon") || lower.includes("hack") || lower.includes("deadline")) {
    return {
      label: "Hackathon",
      accent: "text-blue-400",
      badgeBg: "bg-blue-500/10 border-blue-500/25 text-blue-400",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-.875V10.5h1.5a3.75 3.75 0 100-7.5h-9a3.75 3.75 0 100 7.5h1.5v3.75h-.875c-.621 0-1.125.504-1.125 1.125v3.375m9 0h-9" />
        </svg>
      ),
    };
  }

  if (lower.includes("mentioned") || lower.includes("message")) {
    return {
      label: "Mention",
      accent: "text-cyan-400",
      badgeBg: "bg-cyan-500/10 border-cyan-500/25 text-cyan-400",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-1.074-.765 5.999 5.999 0 011.523-3.678C3.963 15.116 3 13.665 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
        </svg>
      ),
    };
  }

  return {
    label: "Activity",
    accent: "text-zinc-400",
    badgeBg: "bg-zinc-500/10 border-zinc-500/25 text-zinc-400",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
  };
}

export default function NotificationDrawer({ isOpen, onClose, onCountChange }: NotificationDrawerProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "teams" | "connections">("all");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Close drawer on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const loadNotifications = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Fetch user's pending invites for accurate team route resolution
    const { data: invites } = await supabase
      .from("team_invites")
      .select("team_id, teams(name)")
      .eq("invited_user_id", user.id)
      .eq("status", "pending");

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
      setLoading(false);
      return;
    }

    // Resolve accurate links
    const resolved = data.map((n) => {
      if (n.link && n.link.startsWith("/teams/")) {
        return n;
      }
      const lowerMsg = n.message.toLowerCase();
      if (lowerMsg.includes("invited") || lowerMsg.includes("invite")) {
        for (const inv of userInvites) {
          const tName = (inv as any)?.teams?.name;
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
    const unread = resolved.filter((item) => !item.is_read).length;
    if (onCountChange) onCountChange(unread);
    setLoading(false);
  }, [onCountChange]);

  // Load when drawer opens or on initial mount
  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, loadNotifications]);

  // Subscribe to realtime updates
  useEffect(() => {
    let active = true;
    let unsub: (() => void) | null = null;

    async function setupSubscription() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;

      const channel = supabase
        .channel(`notifications-drawer:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            if (active) loadNotifications();
          }
        );

      unsub = subscribeWithRetry(channel);
    }

    setupSubscription();

    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, [loadNotifications]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActionInProgress(id);

    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );

    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setActionInProgress(null);

    const updated = notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n));
    const newUnread = updated.filter((n) => !n.is_read).length;
    if (onCountChange) onCountChange(newUnread);
  };

  const handleMarkAllAsRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setActionInProgress("all");

    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    if (onCountChange) onCountChange(0);

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setActionInProgress(null);
  };

  const handleNotificationClick = (item: NotificationItem) => {
    if (!item.is_read) {
      handleMarkAsRead(item.id);
    }
    onClose();
    if (item.link) {
      router.push(item.link);
    }
  };

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === "unread") return !n.is_read;
      if (filter === "teams") {
        const l = n.message.toLowerCase();
        return l.includes("team") || l.includes("joined") || l.includes("invite");
      }
      if (filter === "connections") {
        const l = n.message.toLowerCase();
        return l.includes("connect") || l.includes("connection");
      }
      return true;
    });
  }, [notifications, filter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        style={{ width: "min(680px, 96vw)" }}
        className="relative h-full bg-white dark:bg-zinc-950/95 backdrop-blur-2xl border-l border-zinc-200 dark:border-zinc-800/80 shadow-2xl flex flex-col z-10 transition-transform duration-300 ease-out animate-slideInRight"
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/80 dark:bg-zinc-900/40">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2.5">
              Notifications
              {unreadCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 dark:bg-[#B4F461]/15 dark:text-[#B4F461] dark:border-[#B4F461]/30">
                  {unreadCount} new
                </span>
              )}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                disabled={actionInProgress === "all"}
                className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Mark all notifications as read"
              >
                <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-[#B4F461]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Mark all read
              </button>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
              aria-label="Close notification panel"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800/60 flex items-center gap-2 overflow-x-auto scrollbar-none bg-zinc-50/50 dark:bg-zinc-950/60">
          {(
            [
              { id: "all", label: "All" },
              { id: "unread", label: `Unread (${unreadCount})` },
              { id: "teams", label: "Teams" },
              { id: "connections", label: "Connections" },
            ] as const
          ).map((t) => {
            const isActive = filter === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#B4F461] text-zinc-950 shadow-sm shadow-[#B4F461]/25 font-bold"
                    : "bg-zinc-100 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900/80 p-3 space-y-1.5">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="w-6 h-6 border-2 border-zinc-300 dark:border-zinc-800 border-t-[#B4F461] rounded-full animate-spin mb-3" />
              <p className="text-xs text-zinc-500 font-mono tracking-wider uppercase">Loading updates...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="py-24 px-6 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mb-3 text-zinc-400 dark:text-zinc-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-300 mb-1">
                {filter === "unread" ? "All caught up!" : "No notifications"}
              </p>
              <p className="text-xs text-zinc-500 max-w-[280px]">
                {filter === "unread"
                  ? "You have zero unread updates right now."
                  : "Activity regarding your teams, requests, and connections will show here."}
              </p>
            </div>
          ) : (
            filteredNotifications.map((item) => {
              const meta = getNotificationMetadata(item.message);
              return (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`group relative p-3.5 sm:p-4 rounded-xl transition-all cursor-pointer flex gap-3.5 items-start border ${
                    item.is_read
                      ? "bg-transparent hover:bg-zinc-100/60 dark:hover:bg-zinc-900/50 border-transparent hover:border-zinc-200 dark:hover:border-zinc-800/60"
                      : "bg-zinc-50/80 hover:bg-zinc-100/90 dark:bg-zinc-900/60 dark:hover:bg-zinc-900/90 border-zinc-200 dark:border-zinc-800/80 shadow-xs"
                  }`}
                >
                  {/* Category Icon */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${meta.badgeBg}`}>
                    {meta.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${meta.accent}`}>
                        {meta.label}
                      </span>
                      <span className="text-zinc-400 dark:text-zinc-600 text-xs">&bull;</span>
                      <span className="text-xs text-zinc-500 font-mono">
                        {formatRelativeTime(item.created_at)}
                      </span>
                    </div>

                    <p className={`text-xs sm:text-sm leading-relaxed ${item.is_read ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-900 dark:text-zinc-200 font-medium"}`}>
                      {item.message}
                    </p>
                  </div>

                  {/* Mark as read button / unread dot */}
                  <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5">
                    {!item.is_read ? (
                      <button
                        onClick={(e) => handleMarkAsRead(item.id, e)}
                        title="Mark as read"
                        className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-emerald-700 dark:hover:text-[#B4F461] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </button>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700/50" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Link to full-page notifications */}
        <div className="p-3.5 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-between text-xs">
          <span className="text-[11px] text-zinc-500">Need full view?</span>
          <button
            onClick={() => {
              onClose();
              router.push("/notifications");
            }}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-[#B4F461] dark:hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
          >
            Open notifications page &rarr;
          </button>
        </div>
      </aside>
    </div>
  );
}
