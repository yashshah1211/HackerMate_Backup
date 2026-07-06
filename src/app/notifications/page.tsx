"use client";

import { useEffect, useState } from "react";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";

type Notification = {
  id: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

/* ── helpers ────────────────────────────────────────────── */

function formatTime(dateString: string) {
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

function isToday(dateString: string) {
  const d = new Date(dateString);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

/** Derive an icon + colour from the notification message */
function getNotifMeta(message: string): {
  icon: React.ReactNode;
  accent: string;
  bg: string;
  label: string;
} {
  const lower = message.toLowerCase();

  if (lower.includes("connection") || lower.includes("connect")) {
    return {
      label: "Connection",
      accent: "text-violet-400",
      bg: "bg-violet-500/10 border-violet-500/20",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584.036-.219.05-.44.05-.666l.001-.03m11.911 0a9.1 9.1 0 00-11.911 0M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    };
  }
  if (lower.includes("invite") || lower.includes("invited")) {
    return {
      label: "Invitation",
      accent: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z" />
        </svg>
      ),
    };
  }
  if (lower.includes("joined") || lower.includes("join")) {
    return {
      label: "Team",
      accent: "text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z" />
        </svg>
      ),
    };
  }
  if (lower.includes("hackathon") || lower.includes("hack")) {
    return {
      label: "Hackathon",
      accent: "text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/20",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      ),
    };
  }
  if (lower.includes("message") || lower.includes("msg")) {
    return {
      label: "Message",
      accent: "text-cyan-400",
      bg: "bg-cyan-500/10 border-cyan-500/20",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-1.074-.765 5.999 5.999 0 011.523-3.678C3.963 15.116 3 13.665 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
        </svg>
      ),
    };
  }
  // default
  return {
    label: "Activity",
    accent: "text-zinc-400",
    bg: "bg-zinc-500/10 border-zinc-500/20",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
  };
}

/* ── component ──────────────────────────────────────────── */

function NotificationsContent() {
  const { showToast, confirm } = useNotification();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

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

  async function loadNotifications() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      // Exclude chat message notifications — these are tracked via the
      // unread-message badge in the Navbar, not the notifications feed.
      .not("message", "ilike", "%sent you a message%")
      .not("message", "ilike", "%new message%")
      .not("link", "ilike", "%/messages%")
      .order("created_at", { ascending: false });
    if (!error) setNotifications(data || []);
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
  const todayNotifs = notifications.filter((n) => isToday(n.created_at));
  const earlierNotifs = notifications.filter((n) => !isToday(n.created_at));

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-zinc-800 border-t-violet-500 rounded-full animate-spin mb-4" />
          <p className="text-xs text-[var(--text-muted)] font-mono uppercase tracking-widest">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">

      {/* ── Page Header ── */}
      <section className="animate-fade-in-up">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest font-mono mb-2">Inbox</p>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-3">
              Notifications
              {unreadCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-600/15 text-violet-400 border border-violet-500/25">
                  {unreadCount} new
                </span>
              )}
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {unreadCount > 0
                ? `You have ${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
                : "You're all caught up — nothing new!"}
            </p>
          </div>

          <div className="flex items-center gap-2 mt-1 shrink-0">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="shrink-0 flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-violet-400 transition-colors border border-[var(--card-border)] rounded-lg px-3 py-1.5 hover:border-violet-500/30 hover:bg-violet-500/5 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Mark all read
              </button>
            )}

            {notifications.length > 0 && (
              <button
                onClick={clearAllNotifications}
                className="shrink-0 flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-rose-400 transition-colors border border-[var(--card-border)] rounded-lg px-3 py-1.5 hover:border-rose-500/30 hover:bg-rose-500/5 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear all
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Empty State ── */}
      {notifications.length === 0 && (
        <div className="card card-static animate-fade-in-up stagger-1">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-5 text-violet-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">No notifications yet</h3>
            <p className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed">
              When you get connection requests, team invitations, or activity, they&apos;ll show up here.
            </p>
          </div>
        </div>
      )}

      {/* ── Today ── */}
      {todayNotifs.length > 0 && (
        <section className="animate-fade-in-up stagger-1 space-y-2">
          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest font-mono px-1">Today</p>
          <div className="space-y-2">
            {todayNotifs.map((n, i) => (
              <NotifCard key={n.id} n={n} idx={i} markAsRead={markAsRead} />
            ))}
          </div>
        </section>
      )}

      {/* ── Earlier ── */}
      {earlierNotifs.length > 0 && (
        <section className="animate-fade-in-up stagger-2 space-y-2">
          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest font-mono px-1">Earlier</p>
          <div className="space-y-2">
            {earlierNotifs.map((n, i) => (
              <NotifCard key={n.id} n={n} idx={i} markAsRead={markAsRead} />
            ))}
          </div>
        </section>
      )}

    </main>
  );
}

/* ── Single notification card ────────────────────────────── */
function NotifCard({
  n,
  idx,
  markAsRead,
}: {
  n: Notification;
  idx: number;
  markAsRead: (id: string) => void;
}) {
  const meta = getNotifMeta(n.message);

  return (
    <div
      className={`
        group relative flex items-start gap-4 p-4 rounded-xl border transition-all duration-200
        ${n.is_read
          ? "bg-[var(--surface-1)] border-[var(--card-border)] opacity-70 hover:opacity-100"
          : "bg-[var(--surface-2)] border-[var(--card-border)] hover:border-violet-500/20"
        }
        animate-fade-in-up stagger-${Math.min(idx + 1, 6)}
      `}
    >
      {/* Unread left accent bar */}
      {!n.is_read && (
        <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-violet-500 rounded-full" />
      )}

      {/* Icon */}
      <div className={`shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center ${meta.bg} ${meta.accent}`}>
        {meta.icon}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* Type label */}
            <span className={`inline-block text-[9px] font-bold uppercase tracking-widest font-mono mb-1 ${meta.accent}`}>
              {meta.label}
            </span>
            {/* Message */}
            <p className={`text-xs leading-relaxed ${n.is_read ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)] font-medium"}`}>
              {n.message}
            </p>
            {/* Timestamp */}
            <div className="flex items-center gap-1.5 mt-1.5">
              {!n.is_read && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
              )}
              <p className="text-[10px] text-[var(--text-muted)] font-mono">
                {formatTime(n.created_at)}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {n.link && (
              <button
                onClick={async () => {
                  await markAsRead(n.id);
                  if (n.link) window.location.href = n.link;
                }}
                className="text-[11px] font-semibold text-violet-400 hover:text-violet-300 border border-violet-500/25 hover:border-violet-400/40 bg-violet-500/5 hover:bg-violet-500/10 px-3 py-1 rounded-lg transition-all cursor-pointer"
              >
                Open →
              </button>
            )}
            {!n.is_read && (
              <button
                onClick={() => markAsRead(n.id)}
                title="Mark as read"
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--card-border)] hover:border-emerald-500/30 hover:bg-emerald-500/5 text-[var(--text-muted)] hover:text-emerald-400 transition-all cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <AuthGuard>
      <NotificationsContent />
    </AuthGuard>
  );
}