"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import ChatThread from "@/components/chatThread";

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

function MessagesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get("user"); // for "Message" button deep-link

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null
  );
  const [activeUser, setActiveUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
  if (!currentUserId) return;

  const channel = supabase
    .channel("messages-list")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
      },
      async () => {
        await loadConversations(currentUserId);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [currentUserId]);

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

    if (targetUserId && targetUserId !== user.id) {
      await openOrCreateDM(user.id, targetUserId);
    }

    setLoading(false);
  }

async function markConversationRead(
  conversationId: string
) {
  const { error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
  });
  if (error) {
    console.error(error);
  }
}

  async function loadConversations(myId: string) {
    // Get all DM conversation_ids I'm part of
    const { data: myParticipantRows } = await supabase
      .from("conversation_participants")
      .select("conversation_id, conversations!inner(id, type)")
      .eq("user_id", myId)
      .eq("conversations.type", "dm");

    const conversationIds = (myParticipantRows || []).map(
      (r: { conversation_id: string }) => r.conversation_id
    );

    const { data: unreadMessages } = await supabase
  .from("messages")
  .select("conversation_id")
  .in("conversation_id", conversationIds)
  .neq("sender_id", myId)
  .eq("is_read", false);

    const unreadByConversation: Record<string, number> = {};

(unreadMessages || []).forEach((msg) => {
  unreadByConversation[msg.conversation_id] =
    (unreadByConversation[msg.conversation_id] || 0) + 1;
});

    if (conversationIds.length === 0) {
      setConversations([]);
      return;
    }

    // For each conversation, find the other participant
    const { data: allParticipants } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", conversationIds);

    const otherUserIdByConv: Record<string, string> = {};
    (allParticipants || []).forEach((p) => {
      if (p.user_id !== myId) {
        otherUserIdByConv[p.conversation_id] = p.user_id;
      }
    });

    const otherUserIds = Array.from(new Set(Object.values(otherUserIdByConv)));

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, college")
      .in("id", otherUserIds);

    const profileById: Record<string, Profile> = {};
    (profiles || []).forEach((p) => {
      profileById[p.id] = p;
    });

    // Last message per conversation
    const { data: lastMessages } = await supabase
      .from("messages")
      .select("conversation_id, content, created_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false });

    const lastMsgByConv: Record<string, { content: string; created_at: string }> =
      {};
    (lastMessages || []).forEach((m) => {
      if (!lastMsgByConv[m.conversation_id]) {
        lastMsgByConv[m.conversation_id] = m;
      }
    });

    const enriched: DMConversation[] = conversationIds
      .map((id) => {
        const otherId = otherUserIdByConv[id];
        const profile = profileById[otherId];
        if (!profile) return null;
        return {
          conversationId: id,
          otherUser: profile,
          lastMessage: lastMsgByConv[id]?.content || null,
          lastMessageAt: lastMsgByConv[id]?.created_at || null,
          unreadCount: unreadByConversation[id] || 0,
        };
      })
      .filter(Boolean) as DMConversation[];

    // Sort: most recent message first
    enriched.sort((a, b) => {
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return (
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );
    });

    setConversations(enriched);
  }

  async function openOrCreateDM(myId: string, otherUserId: string) {
    setStartingChat(true);

    // Atomically get the existing DM conversation for this pair, or create
    // it if it doesn't exist. This single RPC call also verifies the two
    // users are connected, and is race-condition-safe — no duplicate
    // conversations can ever be created, even from rapid double-clicks
    // or multiple tabs.
    const { data: conversationId, error: rpcError } = await supabase.rpc(
      "get_or_create_dm",
      { other_user_id: otherUserId }
    );

    if (rpcError || !conversationId) {
      console.error(rpcError);
      alert(
        rpcError?.message?.includes("connected")
          ? "You can only message users you're connected with."
          : "Failed to start conversation"
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

  if (loading || startingChat) {
    return (
      <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
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
      <div className="mb-8 animate-fade-in-up">
        <p className="section-label">DIRECT MESSAGES</p>
        <h1 className="text-2xl font-semibold tracking-tight text-white mb-1">
          Direct Messages
        </h1>
        <p className="text-xs text-zinc-400">
          Chat with builders you&apos;re connected with.
        </p>
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-6 animate-fade-in-up stagger-1">
        {/* Conversation list */}
        <div className="card card-static p-2 h-fit max-h-[600px] overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-zinc-500 text-xs leading-relaxed">
                No conversations yet. Connect with someone and message them
                from their profile.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => (
                <button
                  key={conv.conversationId}
                  onClick={() => selectConversation(conv)}
                  className={`w-full flex items-center gap-2.5 p-2 rounded text-left transition-colors ${
                    activeConversationId === conv.conversationId
                      ? "bg-zinc-900 border border-zinc-800"
                      : "hover:bg-zinc-900/40 border border-transparent"
                  }`}
                >
                  {conv.otherUser.avatar_url ? (
                    <img
                      src={conv.otherUser.avatar_url}
                      alt={conv.otherUser.full_name}
                      className="w-8 h-8 rounded object-cover flex-shrink-0 border border-zinc-800"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-center font-bold text-zinc-400 text-xs flex-shrink-0">
                      {conv.otherUser.full_name?.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-white text-xs truncate">
                        {conv.otherUser.full_name}
                      </p>

                      {conv.unreadCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      )}
                    </div>
                    <p className="text-zinc-500 text-[10px] truncate">
                      {conv.lastMessage || "Start the conversation"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active thread */}
        <div>
          {activeConversationId && activeUser ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  {activeUser.avatar_url ? (
                    <img
                      src={activeUser.avatar_url}
                      alt={activeUser.full_name}
                      className="w-9 h-9 rounded object-cover border border-zinc-800"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-zinc-400 text-xs">
                      {activeUser.full_name?.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-xs text-white">
                      {activeUser.full_name}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {activeUser.college || "Independent Builder"}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/profile/${activeUser.id}`}
                  className="btn btn-secondary btn-xs text-[10px] py-1.5 px-3 font-mono uppercase tracking-wider"
                >
                  View Profile
                </Link>
              </div>

              <ChatThread
                conversationId={activeConversationId}
                currentUserId={currentUserId}
                height="480px"
              />
            </>
          ) : (
            <div className="card card-static flex items-center justify-center h-[480px]">
              <div className="text-center">
                <div className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-3 text-zinc-400">
                  <svg
                    className="w-5 h-5 text-zinc-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                    />
                  </svg>
                </div>
                <p className="text-zinc-500 text-xs">
                  Select a conversation to start chatting
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
            <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading messages...</p>
          </div>
        </main>
      }>
        <MessagesContent />
      </Suspense>
    </AuthGuard>
  );
}
