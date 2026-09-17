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

import { Search, X, MessageSquare, Users, Image as ImageIcon, Mic, Code2, Mail } from "lucide-react";

function formatPreviewSnippet(content: string | null): { text: string; icon?: "image" | "voice" | "invite" | "code" } {
  if (!content) return { text: "Start the conversation" };
  if (content.startsWith("__IMAGE__::")) return { text: "Photo attachment", icon: "image" };
  if (content.startsWith("__VOICE__::")) return { text: "Voice note", icon: "voice" };
  if (content.startsWith("__TEAM_INVITE__::")) return { text: "Team invitation", icon: "invite" };
  if (content.startsWith("```")) return { text: "Code snippet", icon: "code" };
  return { text: content };
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

    let lastRan = 0;
    let timer: NodeJS.Timeout | null = null;
    const throttledRefresh = () => {
      const now = Date.now();
      if (now - lastRan >= 600) {
        lastRan = now;
        loadConversations(currentUserId);
      } else {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          lastRan = Date.now();
          loadConversations(currentUserId);
        }, 600 - (now - lastRan));
      }
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
          throttledRefresh();
        }
      );

    const unsubscribe = subscribeWithRetry(participantChannel);

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId || !conversationIds.length) return;

    let lastRan = 0;
    let timer: NodeJS.Timeout | null = null;
    const throttledRefresh = () => {
      const now = Date.now();
      if (now - lastRan >= 600) {
        lastRan = now;
        loadConversations(currentUserId);
      } else {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          lastRan = Date.now();
          loadConversations(currentUserId);
        }, 600 - (now - lastRan));
      }
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
            throttledRefresh();
          }
        );
      return subscribeWithRetry(channel);
    });

    return () => {
      if (timer) clearTimeout(timer);
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
      <div className="h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center p-6">
        <div className="w-8 h-8 border-2 border-zinc-200 dark:border-zinc-800 border-t-violet-600 rounded-full animate-spin mb-3" />
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading messages...</p>
      </div>
    );
  }

  if (!currentUserId) {
    return null;
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col p-2.5 sm:p-4 max-w-[1600px] w-full mx-auto min-h-0">
      {/* Top Header / Subheader */}
      <div className="flex items-center justify-between mb-2 sm:mb-3 px-1 shrink-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Direct Messages
          </h1>
          <span className="hidden sm:inline-flex text-[11px] font-mono px-2 py-0.5 rounded-md font-medium bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
            {conversations.length} {conversations.length === 1 ? "chat" : "chats"}
          </span>
          {totalUnread > 0 && (
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-violet-600 text-white shadow-xs">
              {totalUnread} unread
            </span>
          )}
        </div>
      </div>

      {/* Unified Dual-Pane Shell */}
      <div className="flex-1 min-h-0 rounded-2xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 shadow-xs flex overflow-hidden">
        {/* Left pane: Conversation List */}
        <aside
          className={`w-full lg:w-80 xl:w-96 border-r border-zinc-200 dark:border-zinc-800/80 flex flex-col min-h-0 bg-zinc-50/60 dark:bg-zinc-950/40 shrink-0 ${
            activeConversationId ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Search bar */}
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800/80 shrink-0 space-y-2.5">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-8 pr-7 py-2 text-xs rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/30 transition-all shadow-xs"
              />
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFilterTab("all")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  filterTab === "all"
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700/60"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                }`}
              >
                All ({conversations.length})
              </button>
              <button
                onClick={() => setFilterTab("unread")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  filterTab === "unread"
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700/60"
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
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center h-full">
                <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-400 mb-2.5">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <p className="text-xs text-zinc-500 max-w-[200px] leading-relaxed">
                  {searchQuery ? "No conversations match your query." : "No conversations yet. Connect with builders to chat."}
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isActive = activeConversationId === conv.conversationId;
                const preview = formatPreviewSnippet(conv.lastMessage);
                return (
                  <button
                    key={conv.conversationId}
                    onClick={() => selectConversation(conv)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all relative cursor-pointer group ${
                      isActive
                        ? "bg-violet-50 dark:bg-violet-950/40 text-violet-950 dark:text-violet-100 shadow-xs border border-violet-200 dark:border-violet-500/30"
                        : "hover:bg-zinc-100/90 dark:hover:bg-zinc-900/60 border border-transparent"
                    }`}
                  >
                    {/* Subtle active pill indicator on left edge */}
                    {isActive && (
                      <div className="absolute left-1 top-3 bottom-3 w-1 rounded-full bg-violet-600 dark:bg-violet-400" />
                    )}

                    {/* Avatar */}
                    <div className="relative shrink-0 ml-1">
                      {conv.otherUser.avatar_url ? (
                        <img
                          src={conv.otherUser.avatar_url}
                          alt={conv.otherUser.full_name}
                          className="w-10 h-10 rounded-xl object-cover border border-zinc-200 dark:border-zinc-800"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 flex items-center justify-center font-bold text-violet-700 dark:text-violet-300 text-sm">
                          {conv.otherUser.full_name?.charAt(0)}
                        </div>
                      )}
                      {conv.unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-violet-600 ring-2 ring-white dark:ring-zinc-950 animate-pulse" />
                      )}
                    </div>

                    {/* Content Preview */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className={`text-xs truncate ${isActive ? "font-bold text-violet-950 dark:text-violet-100" : "font-semibold text-zinc-900 dark:text-white"}`}>
                          {conv.otherUser.full_name}
                        </p>
                        {conv.lastMessageAt && (
                          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 shrink-0">
                            {formatRelativeTime(conv.lastMessageAt)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1 min-w-0 text-[11px] truncate text-zinc-500 dark:text-zinc-400">
                          {preview.icon === "image" && <ImageIcon className="w-3 h-3 text-violet-500 shrink-0" />}
                          {preview.icon === "voice" && <Mic className="w-3 h-3 text-emerald-500 shrink-0" />}
                          {preview.icon === "invite" && <Mail className="w-3 h-3 text-amber-500 shrink-0" />}
                          {preview.icon === "code" && <Code2 className="w-3 h-3 text-blue-500 shrink-0" />}
                          <span className={`truncate ${conv.unreadCount > 0 ? "font-semibold text-zinc-900 dark:text-zinc-200" : ""}`}>
                            {preview.text}
                          </span>
                        </div>
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
        </aside>

        {/* Right pane: Active chat or Empty state */}
        <section
          className={`flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-zinc-950 ${
            activeConversationId ? "flex" : "hidden lg:flex"
          }`}
        >
          {activeConversationId && activeUser ? (
            <ChatThread
              conversationId={activeConversationId}
              currentUserId={currentUserId}
              otherUser={activeUser}
              onBack={() => {
                setActiveConversationId(null);
                setActiveUser(null);
              }}
              height="100%"
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-zinc-50/30 dark:bg-zinc-950/40">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-400 dark:text-zinc-500 mb-4 shadow-xs">
                <MessageSquare className="w-7 h-7 text-violet-600 dark:text-violet-400" />
              </div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-1.5">
                No Conversation Selected
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm leading-relaxed mb-5">
                Choose a conversation from the sidebar to chat, share code, record voice notes, or send team invites.
              </p>
              <Link
                href="/developers"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-xs hover:shadow transition-all"
              >
                <Users className="w-3.5 h-3.5" />
                Find Builders to Message
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <AuthGuard>
      <Suspense
        fallback={
          <div className="h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center p-6">
            <div className="w-8 h-8 border-2 border-zinc-200 dark:border-zinc-800 border-t-violet-600 rounded-full animate-spin mb-3" />
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading messages...</p>
          </div>
        }
      >
        <MessagesContent />
      </Suspense>
    </AuthGuard>
  );
}
