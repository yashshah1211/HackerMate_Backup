"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import ChatThread from "@/components/chatThread";
import { useNotification } from "@/context/NotificationContext";

type Profile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  college: string | null;
};

type DMConversation = {
  conversationId: string;
  otherUser: Profile;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const now = new Date();
  const date = new Date(iso);
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatPreviewSnippet(content: string | null): string {
  if (!content) return "Start the conversation";
  if (content.startsWith("__IMAGE__::")) return "🖼️ Photo attachment";
  if (content.startsWith("__VOICE__::")) return "🎙️ Voice note";
  if (content.startsWith("__TEAM_INVITE__::")) return "✉️ Team invitation";
  if (content.startsWith("```")) return "💻 Code snippet";
  return content;
}

function MessagesContent() {
  const router = useRouter();
  const { showToast } = useNotification();
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get("user");

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeUser, setActiveUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);
  const [conversationIds, setConversationIds] = useState<string[]>([]);
  
  // Sidebar Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "unread">("all");

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadConversations(currentUserId);
      }, 300);
    };

    const participantChannel = supabase
      .channel(`participants-list:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          debouncedRefresh();
        }
      );

    const unsubscribe = subscribeWithRetry(participantChannel);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId || !conversationIds.length) return;

    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadConversations(currentUserId);
      }, 300);
    };

    const unsubs = conversationIds.map((id) => {
      const channel = supabase
        .channel(`messages-list:${id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${id}`,
          },
          () => {
            debouncedRefresh();
          }
        );
      return subscribeWithRetry(channel);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubs.forEach((unsub) => unsub());
    };
  }, [conversationIds, currentUserId]);

  async function init() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setCurrentUserId(user.id);
    await loadConversations(user.id);

    if (targetUserId) {
      await startOrOpenDM(user.id, targetUserId);
    }

    setLoading(false);
  }

  async function loadConversations(myId: string) {
    // 1. Try optimized single-query RPC (replaces 30+ sequential queries)
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_my_dm_conversations");

    if (!rpcError && rpcData) {
      const dmRows = rpcData as Array<{
        conversation_id: string;
        other_user_id: string;
        last_message: string | null;
        last_message_at: string | null;
        unread_count: number;
      }>;

      const convIds = dmRows.map((r) => r.conversation_id);
      setConversationIds(convIds);

      if (dmRows.length === 0) {
        setConversations([]);
        return;
      }

      const otherUserIds = Array.from(new Set(dmRows.map((r) => r.other_user_id)));
      const { data: profileList, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, college")
        .in("id", otherUserIds);

      if (profileError) {
        console.error("Error fetching DM profiles:", profileError);
      }

      const profileMap = new Map<string, Profile>();
      (profileList || []).forEach((p) => profileMap.set(p.id, p));

      const results: DMConversation[] = [];
      for (const row of dmRows) {
        const otherProfile = profileMap.get(row.other_user_id);
        if (!otherProfile) continue;

        results.push({
          conversationId: row.conversation_id,
          otherUser: otherProfile,
          lastMessage: row.last_message,
          lastMessageAt: row.last_message_at,
          unreadCount: Number(row.unread_count) || 0,
        });
      }

      results.sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });

      setConversations(results);

      if (results.length > 0 && !activeConversationId && !targetUserId) {
        setActiveConversationId(results[0].conversationId);
        setActiveUser(results[0].otherUser);
        markConversationRead(results[0].conversationId);
      }
      return;
    }

    if (rpcError) {
      console.warn("get_my_dm_conversations RPC fallback:", rpcError);
    }

    // 2. Fallback: sequential query path
    const { data: myParticipations, error: partError } = await supabase
      .from("conversation_participants")
      .select("conversation_id, cleared_at")
      .eq("user_id", myId);

    if (partError || !myParticipations) {
      console.error("Error loading conversation participants:", partError);
      return;
    }

    const convIds = myParticipations.map((p) => p.conversation_id);
    setConversationIds(convIds);

    if (convIds.length === 0) {
      setConversations([]);
      return;
    }

    const { data: dmConvs } = await supabase
      .from("conversations")
      .select("id")
      .in("id", convIds)
      .eq("type", "dm");

    const dmIds = (dmConvs || []).map((c) => c.id);
    if (dmIds.length === 0) {
      setConversations([]);
      return;
    }

    const { data: allParticipants } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", dmIds)
      .neq("user_id", myId);

    const otherUserIds = Array.from(
      new Set((allParticipants || []).map((p) => p.user_id))
    );

    const { data: profileList } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, college")
      .in("id", otherUserIds);

    const profileMap = new Map<string, Profile>();
    (profileList || []).forEach((p) => profileMap.set(p.id, p));

    const { data: blocks } = await supabase
      .from("blocked_users")
      .select("blocked_id, blocker_id")
      .or(`blocker_id.eq.${myId},blocked_id.eq.${myId}`);

    const blockedSet = new Set<string>();
    (blocks || []).forEach((b) => {
      if (b.blocker_id === myId) blockedSet.add(b.blocked_id);
      if (b.blocked_id === myId) blockedSet.add(b.blocker_id);
    });

    const results: DMConversation[] = [];

    for (const convId of dmIds) {
      const otherPart = (allParticipants || []).find(
        (p) => p.conversation_id === convId
      );
      if (!otherPart) continue;

      if (blockedSet.has(otherPart.user_id)) continue;

      const otherProfile = profileMap.get(otherPart.user_id);
      if (!otherProfile) continue;

      const myPart = myParticipations.find(
        (p) => p.conversation_id === convId
      );
      const myClearedAt = myPart?.cleared_at || null;

      let msgQuery = supabase
        .from("messages")
        .select("content, created_at")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false });

      if (myClearedAt) {
        msgQuery = msgQuery.gt("created_at", myClearedAt);
      }

      const { data: lastMsgData } = await msgQuery.limit(1);

      const lastMsg = lastMsgData && lastMsgData.length > 0 ? lastMsgData[0] : null;

      let unreadQuery = supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", convId)
        .neq("sender_id", myId)
        .eq("is_read", false);

      if (myClearedAt) {
        unreadQuery = unreadQuery.gt("created_at", myClearedAt);
      }

      const { count: unreadCount } = await unreadQuery;

      results.push({
        conversationId: convId,
        otherUser: otherProfile,
        lastMessage: lastMsg?.content || null,
        lastMessageAt: lastMsg?.created_at || null,
        unreadCount: unreadCount || 0,
      });
    }

    results.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });

    setConversations(results);

    if (results.length > 0 && !activeConversationId && !targetUserId) {
      setActiveConversationId(results[0].conversationId);
      setActiveUser(results[0].otherUser);
      markConversationRead(results[0].conversationId);
    }
  }

  async function markConversationRead(convId: string) {
    await supabase.rpc("mark_conversation_read", {
      p_conversation_id: convId,
    });

    setConversations((prev) =>
      prev.map((c) =>
        c.conversationId === convId ? { ...c, unreadCount: 0 } : c
      )
    );
  }

  async function startOrOpenDM(myId: string, otherUserId: string) {
    if (myId === otherUserId) return;
    setStartingChat(true);

    const { data: blockCheck } = await supabase
      .from("blocked_users")
      .select("id")
      .or(`and(blocker_id.eq.${myId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${myId})`)
      .maybeSingle();

    if (blockCheck) {
      showToast("This user is blocked.", "warning");
      setStartingChat(false);
      router.replace("/messages");
      return;
    }

    const { data: conversationId, error: rpcError } = await supabase.rpc(
      "get_or_create_dm",
      { other_user_id: otherUserId }
    );

    if (rpcError || !conversationId) {
      console.error(rpcError);
      showToast(
        rpcError?.message?.includes("connected")
          ? "You can only message users you're connected with."
          : "Failed to start conversation",
        "error"
      );
      setStartingChat(false);
      router.replace("/messages");
      return;
    }

    await loadConversations(myId);

    const { data: otherProfile } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, college")
      .eq("id", otherUserId)
      .single();

    setActiveConversationId(conversationId);
    setActiveUser(otherProfile);
    setStartingChat(false);

    router.replace("/messages");
  }

  function selectConversation(conv: DMConversation) {
    setActiveConversationId(conv.conversationId);
    markConversationRead(conv.conversationId);
    setActiveUser(conv.otherUser);
  }

  // Filter conversations based on search and tab
  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      if (!conv || !conv.otherUser) return false;
      const q = searchQuery.toLowerCase().trim();
      const name = conv.otherUser.full_name?.toLowerCase() || "";
      const college = conv.otherUser.college?.toLowerCase() || "";
      const lastMsg = conv.lastMessage?.toLowerCase() || "";

      const matchesSearch = !q || name.includes(q) || college.includes(q) || lastMsg.includes(q);

      if (!matchesSearch) return false;
      if (filterTab === "unread") return conv.unreadCount > 0;
      return true;
    });
  }, [conversations, searchQuery, filterTab]);

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount > 0 ? 1 : 0), 0);

  if (loading || startingChat) {
    return (
      <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-6 h-6 border-2 border-zinc-300 dark:border-zinc-800 border-t-violet-600 rounded-full animate-spin mb-3" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading messages...</p>
        </div>
      </main>
    );
  }

  if (!currentUserId) {
    return null;
  }

  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
      <div className="mb-6 animate-fade-in-up flex items-center justify-between">
        <div>
          <p className="section-label">COMMUNICATION</p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white mb-1">
            Direct Messages
          </h1>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Realtime messaging with builder connections & hackathon teammates.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-6 animate-fade-in-up stagger-1 items-start">
        {/* Conversation list sidebar */}
        <div className={`card card-static p-3 h-fit max-h-[660px] flex flex-col bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 shadow-xs ${activeConversationId ? "hidden lg:flex" : "flex"}`}>
          {/* Search Input */}
          <div className="relative mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-8 pr-7 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/40 shadow-xs"
            />
            <svg
              className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-800/80">
            <button
              onClick={() => setFilterTab("all")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterTab === "all"
                  ? "bg-zinc-200/90 dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              All ({conversations.length})
            </button>
            <button
              onClick={() => setFilterTab("unread")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterTab === "unread"
                  ? "bg-zinc-200/90 dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              <span>Unread</span>
              {totalUnread > 0 && (
                <span className="w-4 h-4 rounded-full bg-violet-600 text-white text-[10px] flex items-center justify-center font-bold">
                  {totalUnread}
                </span>
              )}
            </button>
          </div>

          {/* Conversation Cards List */}
          <div className="overflow-y-auto flex-1 space-y-1 pr-0.5 max-h-[500px]">
            {filteredConversations.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-zinc-500 text-xs leading-relaxed">
                  {searchQuery ? "No conversations match your search." : "No conversations yet. Connect with builders to chat."}
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isActive = activeConversationId === conv.conversationId;
                return (
                  <button
                    key={conv.conversationId}
                    onClick={() => selectConversation(conv)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all relative cursor-pointer group ${
                      isActive
                        ? "bg-violet-100/80 dark:bg-violet-950/30 border border-violet-300 dark:border-violet-500/40 shadow-xs"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-900/60 border border-transparent"
                    }`}
                  >
                    {/* Active left indicator bar */}
                    {isActive && (
                      <div className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r bg-violet-600 dark:bg-violet-500 shadow-sm" />
                    )}

                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {conv.otherUser.avatar_url ? (
                        <img
                          src={conv.otherUser.avatar_url}
                          alt={conv.otherUser.full_name}
                          className="w-10 h-10 rounded-xl object-cover border border-zinc-200 dark:border-zinc-800 group-hover:border-zinc-300 dark:group-hover:border-zinc-700 transition-colors"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center font-bold text-violet-700 dark:text-violet-400 text-sm">
                          {conv.otherUser.full_name?.charAt(0)}
                        </div>
                      )}
                      {conv.unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-violet-600 ring-2 ring-white dark:ring-zinc-950 animate-pulse" />
                      )}
                    </div>

                    {/* Meta info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className={`font-semibold text-xs truncate ${isActive ? "text-violet-950 dark:text-violet-200 font-bold" : "text-zinc-900 dark:text-white"}`}>
                          {conv.otherUser.full_name}
                        </p>
                        {conv.lastMessageAt && (
                          <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 shrink-0">
                            {formatRelativeTime(conv.lastMessageAt)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-[11px] truncate ${conv.unreadCount > 0 ? "text-zinc-900 dark:text-zinc-200 font-semibold" : "text-zinc-600 dark:text-zinc-400"}`}>
                          {formatPreviewSnippet(conv.lastMessage)}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className="shrink-0 px-1.5 py-0.2 rounded-full bg-violet-600 text-white font-mono text-[9px] font-bold">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Active thread */}
        <div className={`${activeConversationId ? "block" : "hidden lg:block"} w-full`}>
          {activeConversationId && activeUser ? (
            <>
              {/* Back to list button on mobile */}
              <button
                onClick={() => {
                  setActiveConversationId(null);
                  setActiveUser(null);
                }}
                className="lg:hidden mb-4 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors font-mono uppercase tracking-wider cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to Messages
              </button>

              {/* Chat Top Banner (Clean & Beautiful in both Light & Dark modes) */}
              <div className="flex items-center justify-between mb-3.5 p-3 rounded-2xl bg-white dark:bg-zinc-900/60 border border-zinc-200/90 dark:border-zinc-800/80 shadow-xs backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {activeUser.avatar_url ? (
                      <img
                        src={activeUser.avatar_url}
                        alt={activeUser.full_name}
                        className="w-10 h-10 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center font-bold text-zinc-700 dark:text-zinc-300 text-sm">
                        {activeUser.full_name?.charAt(0)}
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" title="Active connection" />
                  </div>

                  <div>
                    <p className="font-semibold text-xs text-zinc-900 dark:text-white">
                      {activeUser.full_name}
                    </p>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-xs">
                      {activeUser.college || "Independent Builder"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/profile/${activeUser.id}`}
                    className="px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 hover:text-zinc-900 border border-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 dark:hover:text-white dark:border-zinc-700 text-[11px] font-semibold transition-all shadow-xs"
                  >
                    View Profile ↗
                  </Link>
                </div>
              </div>

              <ChatThread
                conversationId={activeConversationId}
                currentUserId={currentUserId}
                height="500px"
              />
            </>
          ) : (
            <div className="card card-static flex items-center justify-center h-[520px] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <div className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mx-auto mb-3 text-zinc-500 shadow-xs">
                  <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">Your Conversations</h3>
                <p className="text-zinc-500 text-xs">
                  Select a conversation from the sidebar to chat
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function MessagesPage() {
  return (
    <AuthGuard>
      <Suspense fallback={
        <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <div className="w-6 h-6 border-2 border-zinc-300 dark:border-zinc-800 border-t-violet-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading messages...</p>
          </div>
        </main>
      }>
        <MessagesContent />
      </Suspense>
    </AuthGuard>
  );
}
