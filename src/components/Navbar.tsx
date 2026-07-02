"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import FeedbackWidget from "@/components/FeedbackWidget";

export default function Navbar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [user, setUser] = useState<import("@supabase/supabase-js").User | null>(null);
  const [profile, setProfile] = useState<{ full_name: string | null } | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  async function loadUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUser(user);
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      setProfile(data);
    }
  }

  async function loadUnreadCount() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { count } = await supabase
      .from("notifications")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setUnreadCount(count || 0);
  }

  async function loadUnreadMessages() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: participantRows } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    const conversationIds =
      participantRows?.map(
        (row) => row.conversation_id
      ) || [];

    if (!conversationIds.length) {
      setUnreadMessages(0);
      return;
    }

    const { count } = await supabase
      .from("messages")
      .select("*", {
        count: "exact",
        head: true,
      })
      .in("conversation_id", conversationIds)
      .neq("sender_id", user.id)
      .eq("is_read", false);

    setUnreadMessages(count || 0);
  }

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
    const initialTheme = savedTheme || "dark";
    Promise.resolve().then(() => {
      setTheme(initialTheme);
    });
    document.documentElement.className = initialTheme;
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.className = nextTheme;
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      loadUser();
      loadUnreadCount();
      loadUnreadMessages();
    });

    const channel = supabase
      .channel("notifications-navbar")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
        },
        () => {
          loadUnreadCount();
        }
      )
      .subscribe();

    const messagesChannel = supabase
      .channel("messages-navbar")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        () => {
          loadUnreadMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(messagesChannel);
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  // Sidebar Layout is used when user is logged in, except on Landing page (/) or Onboarding setup
  const isWorkspaceLayout = user && pathname !== "/" && pathname !== "/onboarding";

  if (!isWorkspaceLayout) {
    return (
      <>
        <header className="fixed top-0 left-0 right-0 z-50">
          <div className="bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/80">
            <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
              {/* Logo */}
              <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center font-bold text-sm text-white">
                  HM
                </div>
                <span className="font-semibold text-sm tracking-tight text-white">HackerMate</span>
              </Link>

              {user && (
                <div className="flex items-center gap-4">
                  <Link href="/dashboard" className="text-xs text-zinc-400 hover:text-white transition-colors">
                    Dashboard
                  </Link>
                  <button onClick={handleLogout} className="text-xs text-zinc-500 hover:text-white transition-colors">
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="pt-14 min-h-screen bg-[var(--background)]">
          {children}
        </div>
      </>
    );
  }

  const sidebarLinks = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      )
    },
    {
      href: "/developers",
      label: "Builders",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.219-.044-7.499-.12a.75.75 0 01-.5-.18z" />
        </svg>
      )
    },
    {
      href: "/connections",
      label: "Connections",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
      )
    },
    {
      href: "/teams",
      label: "Teams",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z" />
        </svg>
      )
    },
    {
      href: "/hackathons",
      label: "Hackathons",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      )
    },
    {
      href: "/messages",
      label: "Messages",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-1.074-.765 5.999 5.999 0 011.523-3.678C3.963 15.116 3 13.665 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
        </svg>
      )
    }
  ];

  return (
    <div className="layout-root flex h-screen overflow-hidden bg-[var(--background)] text-zinc-300 font-sans">
      {/* Sidebar - Desktop */}
      <aside className={`
        sidebar-panel fixed inset-y-0 left-0 z-40 w-64 bg-[var(--surface-1)] border-r border-zinc-900/60 flex flex-col justify-between
        transition-transform duration-300 md:translate-x-0 md:static md:flex-shrink-0
        ${showMobileSidebar ? "translate-x-0" : "-translate-x-full"}
      `}>
        {/* Sidebar Header / Logo */}
        <div className="p-6 border-b border-zinc-900/60 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center font-bold text-sm text-white">
              HM
            </div>
            <span className="font-semibold text-sm tracking-tight text-white">HackerMate</span>
          </Link>
          <button className="md:hidden text-zinc-500 hover:text-white" onClick={() => setShowMobileSidebar(false)}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sidebar Navigation */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-7">
          {/* Main Menu */}
          <div className="space-y-1.5">
            {sidebarLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setShowMobileSidebar(false)}
                  className={`
                    flex items-center justify-between px-3.5 py-2 rounded-lg text-xs font-medium transition-all
                    ${active ? "bg-zinc-900 text-white border border-zinc-800/80" : "text-zinc-400 hover:bg-zinc-900/40 hover:text-white"}
                  `}
                >
                  <span className="flex items-center gap-3">
                    {link.icon}
                    {link.label}
                  </span>
                  {link.href === "/messages" && unreadMessages > 0 && (
                    <span className="w-5 h-5 rounded-full bg-violet-600/20 text-violet-400 border border-violet-500/20 text-[9px] flex items-center justify-center font-bold">
                      {unreadMessages}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Your Stuff */}
          <div className="space-y-2">
            <p className="px-3.5 text-[9px] font-semibold text-zinc-500 uppercase tracking-widest font-mono">Your Stuff</p>
            <div className="space-y-1">
              <Link
                href="/my-teams"
                onClick={() => setShowMobileSidebar(false)}
                className={`
                  flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-medium transition-all
                  ${pathname === "/my-teams" ? "bg-zinc-900 text-white border border-zinc-800/80" : "text-zinc-400 hover:bg-zinc-900/40 hover:text-white"}
                `}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z" />
                </svg>
                My Teams
              </Link>
            </div>
          </div>

        </div>

        {/* Sidebar Profile Footer */}
        <div className="p-4 border-t border-zinc-900/60 relative">
          <div className="flex items-center justify-between gap-3 bg-zinc-900/20 border border-zinc-900/40 p-2 rounded-lg">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center font-semibold text-xs text-zinc-300 shrink-0">
                {profile?.full_name?.charAt(0).toUpperCase() || "B"}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate mb-0.5 leading-none">{profile?.full_name || "Builder"}</p>
                <p className="text-[9px] text-zinc-500 truncate leading-none">{user?.email}</p>
              </div>
            </div>

            <button 
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-900"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
              </svg>
            </button>
          </div>

          {/* Profile Dropdown */}
          {profileDropdownOpen && (
            <div className="absolute bottom-16 right-4 left-4 bg-[var(--surface-2)] border border-zinc-800 rounded-lg p-1.5 shadow-xl z-50 space-y-1">
              <Link
                href="/profile/edit"
                onClick={() => setProfileDropdownOpen(false)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors"
              >
                Edit Profile
              </Link>
              <button
                onClick={() => {
                  setProfileDropdownOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-rose-400 hover:bg-rose-500/10 transition-colors text-left"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="content-area flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Header */}
        <header className="topbar-panel h-14 border-b border-zinc-900/60 flex items-center justify-between px-6 bg-[var(--background)]/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4">
            <button className="md:hidden text-zinc-500 hover:text-white" onClick={() => setShowMobileSidebar(true)}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg bg-zinc-900/30 border border-zinc-900/80 hover:bg-zinc-900 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            >
              {theme === "dark" ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              )}
            </button>

            {/* Notifications */}
            <Link
              href="/notifications"
              className="relative w-8 h-8 rounded-lg bg-zinc-900/30 border border-zinc-900/80 hover:bg-zinc-900 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-3.5 px-1 rounded-full bg-violet-600 text-white text-[8px] font-bold flex items-center justify-center border border-zinc-900">
                  {unreadCount}
                </span>
              )}
            </Link>

            {/* User Initials Badge */}
            <Link href={`/profile/${user.id}`} className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-300 hover:border-zinc-700 transition-colors">
              {profile?.full_name ? profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) : "YS"}
            </Link>
          </div>
        </header>

        {/* Page Content Scroll Container */}
        <div className="flex-1 overflow-y-auto bg-[var(--background)] dashboard-content-reset">
          {children}
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setShowMobileSidebar(false)} />
      )}

      {/* Feedback Widget */}
      <FeedbackWidget />
    </div>
  );
}