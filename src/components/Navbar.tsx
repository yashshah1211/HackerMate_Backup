"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import FeedbackWidget from "@/components/FeedbackWidget";
import { useNotification } from "@/context/NotificationContext";
import Logo from "@/components/Logo";

export default function Navbar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { showToast } = useNotification();

  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [user, setUser] = useState<import("@supabase/supabase-js").User | null>(null);
  const [profile, setProfile] = useState<{ full_name: string | null; role?: string | null } | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const [conversationIds, setConversationIds] = useState<string[]>([]);

  async function loadUser(userObj?: import("@supabase/supabase-js").User) {
    const activeUser = userObj || (await supabase.auth.getUser()).data.user;
    setUser(activeUser);
    if (activeUser) {
      const { data } = await supabase.from("profiles").select("*").eq("id", activeUser.id).single();
      setProfile(data);
      // Immediately set user active status
      await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", activeUser.id);
    }
    return activeUser;
  }

  async function loadUnreadCount(userId: string) {
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .not("message", "ilike", "%sent you a message%")
      .not("message", "ilike", "%new message%");
    setUnreadCount(count || 0);
  }

  async function loadUnreadMessages(userId: string) {
    const { data: participantRows } = await supabase
      .from("conversation_participants")
      .select("conversation_id, conversations!inner(type)")
      .eq("user_id", userId)
      .eq("conversations.type", "dm");
    const ids = participantRows?.map((row) => row.conversation_id) || [];
    setConversationIds(ids);
    if (!ids.length) { setUnreadMessages(0); return; }
    const { data: unreadMsgs } = await supabase
      .from("messages")
      .select("sender_id")
      .in("conversation_id", ids)
      .neq("sender_id", userId)
      .eq("is_read", false);
    const uniqueSenders = new Set(unreadMsgs?.map((m) => m.sender_id) || []);
    setUnreadMessages(uniqueSenders.size);
  }

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
    const initialTheme = savedTheme || "dark";
    Promise.resolve().then(() => { setTheme(initialTheme); });
    document.documentElement.className = initialTheme;
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.className = nextTheme;
  };

  useEffect(() => {
    let active = true;
    let unsubNotif: (() => void) | null = null;
    let unsubParticipant: (() => void) | null = null;
    let heartbeatInterval: NodeJS.Timeout | null = null;

    Promise.resolve().then(async () => {
      const { data: { user: sessionUser } } = await supabase.auth.getUser();
      if (!sessionUser) return;
      if (!active) return;
      
      await loadUser(sessionUser);
      await loadUnreadCount(sessionUser.id);
      await loadUnreadMessages(sessionUser.id);

      // Start periodic 30-second heartbeat to track user activity/online status
      heartbeatInterval = setInterval(async () => {
        if (active) {
          await supabase
            .from("profiles")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", sessionUser.id);
        }
      }, 30000);

      const notifChannel = supabase.channel(`notifications-navbar:${sessionUser.id}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${sessionUser.id}`
        }, (payload) => {
          loadUnreadCount(sessionUser.id);
          if (payload.eventType === "INSERT") {
            const newNotif = payload.new as { message: string };
            showToast(newNotif.message, "info");
          }
        });

      const participantChannel = supabase.channel(`participants-navbar:${sessionUser.id}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${sessionUser.id}`
        }, () => {
          loadUnreadMessages(sessionUser.id);
        });

      unsubNotif = subscribeWithRetry(notifChannel);
      unsubParticipant = subscribeWithRetry(participantChannel);
    });

    return () => {
      active = false;
      if (unsubNotif) unsubNotif();
      if (unsubParticipant) unsubParticipant();
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };
  }, []);

  useEffect(() => {
    if (!user || !conversationIds.length) return;

    const unsubs = conversationIds.map((id) => {
      const channel = supabase.channel(`messages-navbar:${id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${id}`
          },
          () => {
            loadUnreadMessages(user.id);
          }
        );
      return subscribeWithRetry(channel);
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [conversationIds, user]);

  function handleLogout() {
    setShowSignOutConfirm(true);
  }

  async function executeLogout() {
    setShowSignOutConfirm(false);
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const isWorkspaceLayout = user && pathname !== "/" && pathname !== "/onboarding";

  if (!isWorkspaceLayout) {
    return (
      <>
        <header className="fixed top-0 left-0 right-0 z-50">
          <div className="bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/80">
            <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
              <Link href={user ? "/dashboard" : "/"} className="flex items-center">
                <Logo className="h-8 w-auto" />
              </Link>
              {user && (
                <div className="flex items-center gap-4">
                  <Link href="/dashboard" className="text-xs text-zinc-400 hover:text-white transition-colors">Dashboard</Link>
                  <button onClick={handleLogout} className="text-xs text-zinc-500 hover:text-white transition-colors">Sign Out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="pt-14 min-h-screen bg-[var(--background)]">{children}</div>
        {showSignOutConfirm && <SignOutConfirmModal />}
      </>
    );
  }

  // Active / Inactive states configured for Light and Dark modes
  const sidebarLinks = [
    {
      href: "/dashboard", label: "Dashboard",
      color: "text-violet-600 dark:text-violet-400",
      activeBg: "bg-violet-500/5 dark:bg-violet-500/10 border-violet-500/10 dark:border-violet-500/20",
      activeBar: "bg-violet-600 dark:bg-violet-500",
      icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>)
    },
    {
      href: "/developers", label: "Builders",
      color: "text-sky-600 dark:text-sky-400",
      activeBg: "bg-sky-500/5 dark:bg-sky-500/10 border-sky-500/10 dark:border-sky-500/20",
      activeBar: "bg-sky-600 dark:bg-sky-500",
      icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.219-.044-7.499-.12a.75.75 0 01-.5-.18z" /></svg>)
    },
    {
      href: "/connections", label: "Connections",
      color: "text-emerald-600 dark:text-emerald-400",
      activeBg: "bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/10 dark:border-emerald-500/20",
      activeBar: "bg-emerald-600 dark:bg-emerald-500",
      icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>)
    },
    {
      href: "/teams", label: "Teams",
      color: "text-amber-600 dark:text-amber-400",
      activeBg: "bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/10 dark:border-amber-500/20",
      activeBar: "bg-amber-600 dark:bg-amber-500",
      icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z" /></svg>)
    },
    {
      href: "/hackathons", label: "Hackathons",
      color: "text-rose-600 dark:text-rose-400",
      activeBg: "bg-rose-500/5 dark:bg-rose-500/10 border-rose-500/10 dark:border-rose-500/20",
      activeBar: "bg-rose-600 dark:bg-rose-500",
      icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>)
    },
    {
      href: "/messages", label: "Messages",
      color: "text-cyan-600 dark:text-cyan-400",
      activeBg: "bg-cyan-500/5 dark:bg-cyan-500/10 border-cyan-500/10 dark:border-cyan-500/20",
      activeBar: "bg-cyan-600 dark:bg-cyan-500",
      icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-1.074-.765 5.999 5.999 0 011.523-3.678C3.963 15.116 3 13.665 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>)
    }
  ];

  const userInitials = profile?.full_name
    ? profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "YS";

  const avatarGradients = [
    "from-violet-500 to-indigo-600",
    "from-sky-500 to-cyan-600",
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-rose-500 to-pink-600",
  ];
  const gradientIndex = (profile?.full_name?.charCodeAt(0) || 0) % avatarGradients.length;
  const avatarGradient = avatarGradients[gradientIndex];

  const sidebarAvatarGradients = [
    ["#3b82f6", "#1d4ed8"],
    ["#8b5cf6", "#6d28d9"],
    ["#10b981", "#047857"],
    ["#f59e0b", "#b45309"]
  ];
  const sidebarGradientIndex = (profile?.full_name?.charCodeAt(0) || 0) % sidebarAvatarGradients.length;
  const sidebarColorsGradient = sidebarAvatarGradients[sidebarGradientIndex];

  return (
    <div className="layout-root flex h-screen overflow-hidden bg-[var(--background)] text-[var(--text-secondary)] font-sans transition-colors duration-200 dashboard-redesign">

      {/* Sidebar */}
      <aside
        className={`sidebar-panel fixed inset-y-0 left-0 z-40 w-[248px] flex flex-col border-r border-[var(--border-soft)] bg-[var(--bg)] transition-all duration-300 md:translate-x-0 md:static md:flex-shrink-0 ${showMobileSidebar ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Logo */}
        <div className="logo px-5 py-5 flex items-center justify-between shrink-0">
          <Link href="/dashboard" className="flex items-center">
            <Logo className="h-10 w-auto" />
          </Link>
          <button className="md:hidden text-zinc-500 hover:text-white p-1" onClick={() => setShowMobileSidebar(false)}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto">
          <div className="nav-label">NAVIGATE</div>

          {sidebarLinks.map((link) => {
            const isSaved = pathname === "/hackathons" && typeof window !== "undefined" && window.location.search.includes("tab=saved");
            const active = (link.href === "/hackathons" && isSaved)
              ? false
              : (pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href)));
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setShowMobileSidebar(false)}
                className={`nav-item ${active ? "active" : ""}`}
              >
                {link.icon}
                {link.label}
                {link.href === "/messages" && unreadMessages > 0 && (
                  <span className="nav-badge">{unreadMessages}</span>
                )}
              </Link>
            );
          })}

          <div className="nav-label">YOUR STUFF</div>

          {profile?.role === "admin" && (
            <Link
              href="/admin"
              onClick={() => setShowMobileSidebar(false)}
              className={`nav-item ${pathname === "/admin" ? "active" : ""}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" /></svg>
              Admin Panel
            </Link>
          )}

          <Link
            href="/my-teams"
            onClick={() => setShowMobileSidebar(false)}
            className={`nav-item ${pathname === "/my-teams" ? "active" : ""}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>
            My Teams
          </Link>

          <Link
            href="/hackathons?tab=saved"
            onClick={() => setShowMobileSidebar(false)}
            className={`nav-item ${pathname === "/hackathons" && typeof window !== "undefined" && window.location.search.includes("tab=saved") ? "active" : ""}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
            Saved Hackathons
          </Link>
        </nav>

        {/* Profile footer with dropdown */}
        <div className="relative mt-auto">
          <div
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="sidebar-footer"
          >
            <div className="avatar-sm font-bold text-xs" style={{ background: `linear-gradient(135deg, ${sidebarColorsGradient[0]}, ${sidebarColorsGradient[1]})` }}>
              {userInitials}
            </div>
            <div className="who text-left flex-1 min-w-0">
              <b className="truncate block">{profile?.full_name || "Builder"}</b>
              <small className="truncate block text-zinc-500">{user?.email}</small>
            </div>
            <svg className={`w-3.5 h-3.5 text-[var(--text-faint)] hover:text-white transition-transform duration-200 shrink-0 ${profileDropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {profileDropdownOpen && (
            <div className="absolute bottom-16 left-0 right-0 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)] shadow-2xl overflow-hidden z-50">
              <div className="p-1">
                <Link href="/profile/edit" onClick={() => setProfileDropdownOpen(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-[var(--text-dim)] hover:bg-[var(--bg-raised)] hover:text-white transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.219-.044-7.499-.12a.75.75 0 01-.5-.18z" /></svg>
                  Edit Profile
                </Link>
                <Link href={`/profile/${user?.id}`} onClick={() => setProfileDropdownOpen(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-[var(--text-dim)] hover:bg-[var(--bg-raised)] hover:text-white transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  View Profile
                </Link>
              </div>
              <div className="h-px bg-[var(--border-soft)] mx-1" />
              <div className="p-1">
                <button onClick={() => { setProfileDropdownOpen(false); handleLogout(); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-rose-500 dark:text-rose-400 hover:bg-rose-500/10 transition-colors text-left">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="content-area flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="topbar-panel h-14 border-b border-[var(--card-border)] flex items-center justify-between px-6 bg-[var(--background)]/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4">
            <button className="md:hidden text-zinc-500 hover:text-white" onClick={() => setShowMobileSidebar(true)}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="w-8 h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--card-border)] hover:bg-[var(--surface-3)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              {theme === "dark" ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>
              )}
            </button>
            <Link href="/notifications" className="relative w-8 h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--card-border)] hover:bg-[var(--surface-3)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-3.5 px-1 rounded-full bg-violet-500 text-white text-[8px] font-bold flex items-center justify-center border border-[var(--background)]">{unreadCount}</span>
              )}
            </Link>
            <Link href={`/profile/${user.id}`} className={`w-8 h-8 rounded-lg bg-gradient-to-br ${avatarGradient} flex items-center justify-center font-bold text-[11px] text-white hover:opacity-90 transition-opacity`}>
              {userInitials}
            </Link>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto bg-[var(--background)] dashboard-content-reset">{children}</div>
      </div>

      {showMobileSidebar && (
        <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setShowMobileSidebar(false)} />
      )}

      <FeedbackWidget />
      {showSignOutConfirm && <SignOutConfirmModal />}
    </div>
  );

  function SignOutConfirmModal() {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm hm-fade-in">
        <style>{`
          @keyframes hmFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes hmScaleUp {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
          .hm-fade-in { animation: hmFadeIn 0.2s ease-out forwards; }
          .hm-scale-up { animation: hmScaleUp 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        `}</style>
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center gap-4 hm-scale-up">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20 shadow-inner shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-lg text-zinc-900 dark:text-white">Sign Out</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">Are you sure you want to sign out of HackerMate?</p>
          </div>
          <div className="flex gap-3 w-full mt-2">
            <button
              onClick={() => setShowSignOutConfirm(false)}
              className="flex-1 px-4 py-2.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800/80 rounded-xl transition-colors border border-zinc-200 dark:border-zinc-800/50"
            >
              Cancel
            </button>
            <button
              onClick={executeLogout}
              className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors border border-rose-500/50 shadow-lg shadow-rose-500/10"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }
}
