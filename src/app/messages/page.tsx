"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import ChatThread from "@/components/chatThread";
import { useNotification } from "@/context/NotificationContext";
import { useImmersive } from "@/components/shell/ShellContext";
import {
  Avatar,
  ButtonLink,
  CountBadge,
  EmptyState,
  ErrorNotice,
  PageLoader,
  SearchField,
  Segmented,
  useMediaQuery,
} from "@/components/system";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

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

import { MessageSquare, Users, Image as ImageIcon, Mic, Code2, Mail, SearchX } from "lucide-react";

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

  // Presentation-only state. On phones the page shows the list OR the thread;
  // the thread only takes over after an explicit tap (or a ?user= deep link),
  // so the desktop auto-selection never hides the list on mobile.
  const [mobileView, setMobileView] = useState<"list" | "thread">(targetUserId ? "thread" : "list");
  // Shown instead of a misleading "No conversations yet" when the list can't load.
  const [listError, setListError] = useState<string | null>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");

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
      setListError(null);
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
      setListError(partError?.message || "Conversations could not be loaded.");
      return;
    }
    setListError(null);

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

  const showThread = mobileView === "thread" && !!activeConversationId && !!activeUser;
  // Hide the app's mobile top bar + tab bar only while a thread fills the phone screen.
  useImmersive(isMobile && showThread);

  if (loading || startingChat) {
    return (
      <main data-v2 className="flex min-h-0 flex-1 items-center justify-center bg-canvas">
        <PageLoader label={startingChat ? "Opening conversation" : "Loading messages"} />
      </main>
    );
  }

  if (!currentUserId) {
    return null;
  }

  const listEmpty = conversations.length === 0;

  return (
    // Bounded height chain: shell #hm-scroll → flex-1 wrapper → this <main> (flex-1, min-h-0,
    // overflow-hidden) → panes (min-h-0) → ChatThread (h-full). Only the message log scrolls,
    // so the composer stays on screen at every viewport size.
    <main data-v2 className="flex min-h-0 flex-1 overflow-hidden bg-canvas">
      {/* Left pane: Conversation List */}
      <aside
        aria-label="Conversations"
        className={cn(
          "min-h-0 w-full flex-col bg-raised md:flex md:w-[300px] md:shrink-0 md:border-r md:border-line lg:w-[320px]",
          showThread ? "hidden" : "flex",
        )}
      >
        <div className="shrink-0 border-b border-line px-4 pb-3 pt-4 md:pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <h1
              data-v2-heading
              className="font-display text-[24px] font-semibold leading-none tracking-[-0.025em] text-ink [font-variation-settings:'wdth'_92]"
            >
              Messages
            </h1>
            <span className="shrink-0 font-mono text-[12.5px] text-ink-3 tabular">
              {conversations.length} {conversations.length === 1 ? "chat" : "chats"}
              {totalUnread > 0 && (
                <>
                  {" · "}
                  <span className="text-accent-ink">{totalUnread} unread</span>
                </>
              )}
            </span>
          </div>

          {!listEmpty && (
            <>
              <SearchField
                className="mt-3"
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search people or messages"
                label="Search conversations"
              />
              <Segmented
                className="mt-2.5"
                size="sm"
                label="Filter conversations"
                value={filterTab}
                onChange={setFilterTab}
                options={[
                  { value: "all", label: "All", count: conversations.length },
                  { value: "unread", label: "Unread", count: totalUnread },
                ]}
              />
            </>
          )}
        </div>

        {/* Conversation list */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {listError && (
            <ErrorNotice
              className="m-3"
              title="Couldn't load conversations"
              detail={listError}
              onRetry={() => loadConversations(currentUserId)}
            />
          )}

          {listEmpty ? (
            !listError && (
              <EmptyState
                className="m-4"
                icon={<MessageSquare />}
                title="No conversations yet"
                body="You can message builders you're connected with. Find someone to build with, connect, then say hi."
                action={
                  <ButtonLink href="/developers" size="sm" variant="secondary" icon={<Users />}>
                    Find builders
                  </ButtonLink>
                }
              />
            )
          ) : filteredConversations.length === 0 ? (
            <EmptyState
              className="m-4"
              compact
              icon={<SearchX />}
              title={searchQuery ? "No matches" : "No unread conversations"}
              body={searchQuery ? `Nothing matches “${searchQuery}”.` : "You're all caught up."}
            />
          ) : (
            <ul className="py-1">
              {filteredConversations.map((conv) => {
                const isActive = activeConversationId === conv.conversationId;
                const preview = formatPreviewSnippet(conv.lastMessage);
                const unread = conv.unreadCount > 0;
                return (
                  <li key={conv.conversationId}>
                    <button
                      type="button"
                      onClick={() => {
                        selectConversation(conv);
                        setMobileView("thread");
                      }}
                      aria-current={isActive ? "true" : undefined}
                      className={cn(
                        "relative flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        isActive ? "bg-selected" : "hover:bg-hover",
                      )}
                    >
                      {isActive && (
                        <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-r-[2px] bg-signal" />
                      )}

                      <Avatar name={conv.otherUser.full_name} src={conv.otherUser.avatar_url} size="md" />

                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[14px] font-semibold text-ink">
                            {conv.otherUser.full_name}
                          </span>
                          {conv.lastMessageAt && (
                            <span className="shrink-0 font-mono text-[12.5px] text-ink-3 tabular">
                              {relativeTime(conv.lastMessageAt)}
                            </span>
                          )}
                        </span>

                        <span className="mt-0.5 flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              "flex min-w-0 items-center gap-1 text-[12.5px]",
                              unread ? "font-medium text-ink-2" : "text-ink-3",
                            )}
                          >
                            {preview.icon === "image" && <ImageIcon className="size-3.5 shrink-0" aria-hidden />}
                            {preview.icon === "voice" && <Mic className="size-3.5 shrink-0" aria-hidden />}
                            {preview.icon === "invite" && <Mail className="size-3.5 shrink-0" aria-hidden />}
                            {preview.icon === "code" && <Code2 className="size-3.5 shrink-0" aria-hidden />}
                            <span className="truncate">{preview.text}</span>
                          </span>
                          {unread && (
                            <span className="shrink-0">
                              <CountBadge value={conv.unreadCount} />
                              <span className="sr-only"> unread</span>
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Right pane: Active chat or Empty state */}
      <section
        aria-label="Conversation"
        className={cn("min-h-0 min-w-0 flex-1 flex-col bg-canvas md:flex", showThread ? "flex" : "hidden")}
      >
        {activeConversationId && activeUser ? (
          <ChatThread
            conversationId={activeConversationId}
            currentUserId={currentUserId}
            otherUser={activeUser}
            onBack={() => {
              setActiveConversationId(null);
              setActiveUser(null);
              setMobileView("list");
            }}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-8">
            <EmptyState
              align="center"
              className="max-w-sm"
              icon={<MessageSquare />}
              title={listEmpty ? "Start your first conversation" : "Pick a conversation"}
              body={
                listEmpty
                  ? "Connect with builders on HackerMate, then message them here to plan a team."
                  : "Choose a chat from the list, or find more builders to message."
              }
              action={
                listEmpty ? undefined : (
                  <ButtonLink href="/developers" size="sm" variant="secondary" icon={<Users />}>
                    Find builders
                  </ButtonLink>
                )
              }
            />
          </div>
        )}
      </section>
    </main>
  );
}

export default function MessagesPage() {
  return (
    <AuthGuard>
      <Suspense
        fallback={
          <main data-v2 className="flex min-h-0 flex-1 items-center justify-center bg-canvas">
            <PageLoader label="Loading messages" />
          </main>
        }
      >
        <MessagesContent />
      </Suspense>
    </AuthGuard>
  );
}

