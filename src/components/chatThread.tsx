"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import { moderateMessage } from "@/lib/safety";
import LinkPreviewCard from "@/components/LinkPreviewCard";

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  is_pinned?: boolean;
  mentions?: string[] | null;
  reply_to_id?: string | null;
  created_at: string;
};

type Reaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at?: string;
};

type SenderProfile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
};

type Props = {
  conversationId: string;
  currentUserId: string;
  /** Optional: pass known participant profiles to avoid extra fetches (e.g. team members) */
  knownProfiles?: Record<string, SenderProfile>;
  /** Visual height of the scrollable message area */
  height?: string;
};

const STANDARD_EMOJIS = ["👍", "❤️", "🔥", "🚀", "🎉", "😂", "👀"];

function TeamInviteCard({ 
  inviteId, 
  teamName, 
  teamId, 
  isMine
}: { 
  inviteId: string; 
  teamName: string; 
  teamId: string; 
  isMine: boolean;
}) {
  const [status, setStatus] = useState<string>("loading");
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    async function fetchStatus() {
      const { data } = await supabase
        .from("team_invites")
        .select("status")
        .eq("id", inviteId)
        .maybeSingle();
      
      if (active) {
        if (data) {
          setStatus(data.status);
        } else {
          setStatus("invalid");
        }
        setLoading(false);
      }
    }
    fetchStatus();
    return () => { active = false; };
  }, [inviteId]);

  const handleAccept = async () => {
    setActionLoading(true);
    const { error } = await supabase.rpc("accept_team_invite", {
      p_invite_id: inviteId,
    });
    if (error) {
      console.error(error);
    } else {
      setStatus("accepted");
    }
    setActionLoading(false);
  };

  const handleDecline = async () => {
    setActionLoading(true);
    const { error } = await supabase.rpc("reject_team_invite", {
      p_invite_id: inviteId,
    });
    if (error) {
      console.error(error);
    } else {
      setStatus("rejected");
    }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="w-3.5 h-3.5 border border-zinc-800 border-t-white rounded-full animate-spin" />
        <span className="text-[10px] text-zinc-500 font-mono">Loading invitation...</span>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="text-zinc-500 font-mono text-[10px] py-1">
        ⚠️ Invitation no longer exists
      </div>
    );
  }

  return (
    <div className={`p-3.5 rounded-xl border my-1 max-w-[280px] shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-all ${
      isMine 
        ? "bg-zinc-950/80 border-zinc-850 text-zinc-200" 
        : "bg-violet-950/20 border-violet-500/25 text-violet-100"
    }`}>
      <div className="text-[9px] font-mono uppercase tracking-wider text-violet-400 mb-1 flex items-center gap-1">
        <span>✉</span>
        <span>Team Invitation</span>
      </div>
      <p className="text-xs font-medium leading-relaxed mb-3">
        {isMine 
          ? `You invited them to join team "${teamName}"` 
          : `You are invited to join team "${teamName}"`}
      </p>

      {status === "pending" ? (
        isMine ? (
          <span className="text-[10px] font-mono text-zinc-500 uppercase font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse" />
            Pending Response
          </span>
        ) : (
          <div className="flex flex-col gap-1.5 w-full">
            <div className="flex gap-2">
              <button
                onClick={handleAccept}
                disabled={actionLoading}
                className="flex-1 px-3 py-1.5 text-[10px] font-bold bg-white text-black hover:bg-zinc-200 rounded transition-colors disabled:opacity-50 cursor-pointer"
              >
                {actionLoading ? "Joining..." : "Accept"}
              </button>
              <button
                onClick={handleDecline}
                disabled={actionLoading}
                className="flex-1 px-3 py-1.5 text-[10px] font-bold bg-zinc-900 hover:bg-zinc-850 text-rose-400 border border-zinc-800 rounded transition-colors disabled:opacity-50 cursor-pointer"
              >
                {actionLoading ? "Declining..." : "Decline"}
              </button>
            </div>
            <Link
              href={`/teams/${teamId}`}
              className="w-full text-center px-3 py-1.5 text-[10px] font-bold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded transition-colors block"
            >
              View Team
            </Link>
          </div>
        )
      ) : status === "accepted" ? (
        <span className="text-[10px] font-mono text-emerald-400 uppercase font-semibold flex items-center gap-1">
          ✓ Joined
        </span>
      ) : (
        <span className="text-[10px] font-mono text-zinc-500 uppercase flex items-center gap-1">
          ✗ Declined
        </span>
      )}
    </div>
  );
}

export default function ChatThread({
  conversationId,
  currentUserId,
  knownProfiles = {},
  height = "420px",
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, SenderProfile>>(knownProfiles);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const isInitialLoad = useRef(true);
  const prevLastMessageId = useRef<string | null>(null);
  const [participants, setParticipants] = useState<SenderProfile[]>([]);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  const clearedAtRef = useRef<string | null>(null);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [ownedTeams, setOwnedTeams] = useState<{ id: string; name: string }[]>([]);
  const [conversationType, setConversationType] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Typing indicators state
  const [typingUsers, setTypingUsers] = useState<Record<string, { fullName: string; timerId: NodeJS.Timeout }>>({});
  const lastTypingSentRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const myProfile = profiles[currentUserId] || null;

  function scrollToMessage(msgId: string) {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-violet-500", "rounded-lg", "transition-all", "duration-500");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-violet-500");
      }, 2000);
    }
  }

  const filteredParticipants = participants.filter((p) =>
    p.full_name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const fetchReactionsForMessages = useCallback(async (msgIds: string[]) => {
    if (msgIds.length === 0) return;
    const { data: reactionData, error } = await supabase
      .from("message_reactions")
      .select("id, message_id, user_id, emoji")
      .in("message_id", msgIds);

    if (error) {
      console.error("Error fetching message reactions:", error);
      return;
    }

    if (reactionData) {
      setReactions((prev) => {
        const next = { ...prev };
        reactionData.forEach((r) => {
          const list = next[r.message_id] || [];
          const filtered = list.filter(
            (existing) =>
              !(existing.id === r.id || (existing.user_id === r.user_id && existing.emoji === r.emoji))
          );
          next[r.message_id] = [...filtered, r as Reaction];
        });
        return next;
      });
    }
  }, []);

  async function loadMessages() {
    // Fetch conversation type
    const { data: conversation } = await supabase
      .from("conversations")
      .select("type")
      .eq("id", conversationId)
      .maybeSingle();

    setConversationType(conversation?.type || null);

    // Check if direct message conversation has blocked participant relationships
    const { data: participantsData } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);

    const otherUser = (participantsData || []).find((p) => p.user_id !== currentUserId);

    if (otherUser) {
      setRecipientId(otherUser.user_id);
      const { data: block } = await supabase
        .from("blocked_users")
        .select("id")
        .or(`and(blocker_id.eq.${currentUserId},blocked_id.eq.${otherUser.user_id}),and(blocker_id.eq.${otherUser.user_id},blocked_id.eq.${currentUserId})`)
        .maybeSingle();

      setIsBlocked(!!block);
    } else {
      setRecipientId(null);
    }

    // Fetch user's own cleared_at timestamp for this conversation
    const { data: participantData } = await supabase
      .from("conversation_participants")
      .select("cleared_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", currentUserId)
      .maybeSingle();

    const currentClearedAt = participantData?.cleared_at || null;
    setClearedAt(currentClearedAt);
    clearedAtRef.current = currentClearedAt;

    let query = supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false });

    if (currentClearedAt) {
      query = query.gt("created_at", currentClearedAt);
    }

    const { data, error } = await query.range(0, 29);

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const fetchedMessages = [...(data || [])].reverse();
    setMessages(fetchedMessages);
    setHasMore(data ? data.length === 30 : false);

    // Fetch reactions for these messages
    const messageIds = fetchedMessages.map((m) => m.id);
    fetchReactionsForMessages(messageIds);

    // Mark messages as read since we are actively viewing this conversation
    supabase.rpc("mark_conversation_read", {
      p_conversation_id: conversationId,
    }).then(({ error: readErr }) => {
      if (readErr) console.error("Error marking messages read:", readErr);
    });

    const senderIds = Array.from(
      new Set((data || []).map((m) => m.sender_id))
    ).filter((id) => !profiles[id]);

    if (!profiles[currentUserId]) {
      senderIds.push(currentUserId);
    }

    if (senderIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", senderIds);

      if (profileData) {
        setProfiles((prev) => {
          const next = { ...prev };
          profileData.forEach((p) => {
            next[p.id] = p;
          });
          return next;
        });
      }
    }

    setLoading(false);
  }

  async function ensureProfile(userId: string) {
    if (profiles[userId]) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("id", userId)
      .single();
    if (data) {
      setProfiles((prev) => ({ ...prev, [userId]: data }));
    }
  }

  async function loadParticipants() {
    const { data: members } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);

    if (!members?.length) return;

    const ids = members.map((m) => m.user_id);

    const { data: users } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", ids);

    if (users) {
      setParticipants(
        users.filter((user) => user.id !== currentUserId)
      );
    }
  }

  // Realtime Broadcast Typing Trigger
  const sendTypingBroadcast = () => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;

    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: {
          userId: currentUserId,
          fullName: myProfile?.full_name || "Someone",
        },
      });
    }
  };

  useEffect(() => {
    if (!conversationId) return;
    Promise.resolve().then(() => {
      loadMessages();
      loadParticipants();
    });

    const channel = supabase.channel(`messages:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          const activeClearedAt = clearedAtRef.current;
          if (activeClearedAt && new Date(newMsg.created_at) <= new Date(activeClearedAt)) return;
          const isMine = newMsg.sender_id === currentUserId;
          if (!isMine) {
            supabase.rpc("mark_conversation_read", {
              p_conversation_id: conversationId,
            }).then(({ error: readErr }) => {
              if (readErr) console.error("Error marking incoming message read:", readErr);
            });
          }
          setMessages((prev) =>
            prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]
          );
          ensureProfile(newMsg.sender_id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedMsg = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          const newReaction = payload.new as Reaction;
          setReactions((prev) => {
            const list = prev[newReaction.message_id] || [];
            // Remove any existing reaction by the same user_id (enforcing 1 per user)
            const filtered = list.filter(
              (r) => !(r.id === newReaction.id || r.user_id === newReaction.user_id)
            );
            return {
              ...prev,
              [newReaction.message_id]: [...filtered, newReaction],
            };
          });
          ensureProfile(newReaction.user_id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          const updatedReaction = payload.new as Reaction;
          setReactions((prev) => {
            const list = prev[updatedReaction.message_id] || [];
            const filtered = list.filter(
              (r) => !(r.id === updatedReaction.id || r.user_id === updatedReaction.user_id)
            );
            return {
              ...prev,
              [updatedReaction.message_id]: [...filtered, updatedReaction],
            };
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          const oldReaction = payload.old as { id?: string; message_id?: string; user_id?: string; emoji?: string };
          setReactions((prev) => {
            const next = { ...prev };
            for (const msgId in next) {
              next[msgId] = next[msgId].filter((r) => {
                if (oldReaction.id && r.id === oldReaction.id) return false;
                if (oldReaction.user_id && r.user_id === oldReaction.user_id) return false;
                return true;
              });
            }
            return next;
          });
        }
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload || payload.userId === currentUserId) return;
        const typerId = payload.userId;
        const typerName = payload.fullName || "Someone";

        setTypingUsers((prev) => {
          if (prev[typerId]) {
            clearTimeout(prev[typerId].timerId);
          }
          const timerId = setTimeout(() => {
            setTypingUsers((current) => {
              const updated = { ...current };
              delete updated[typerId];
              return updated;
            });
          }, 2500);

          return {
            ...prev,
            [typerId]: { fullName: typerName, timerId },
          };
        });
      });

    const unsubscribe = subscribeWithRetry(channel);

    return () => {
      unsubscribe();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (!currentUserId) return;
    supabase
      .from("teams")
      .select("id, name")
      .eq("owner_id", currentUserId)
      .then(({ data }) => {
        setOwnedTeams(data || []);
      });
  }, [currentUserId]);

  const handleScroll = async (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop === 0 && hasMore && !isLoadingMoreRef.current && messages.length > 0) {
      isLoadingMoreRef.current = true;
      setLoadingMore(true);
      const prevScrollHeight = target.scrollHeight;
      const currentOffset = messages.length;

      let query = supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false });

      if (clearedAt) {
        query = query.gt("created_at", clearedAt);
      }

      const { data: moreData, error } = await query.range(currentOffset, currentOffset + 29);

      if (error) {
        console.error(error);
      } else if (moreData) {
        if (moreData.length < 30) {
          setHasMore(false);
        }
        const olderMessages = [...moreData].reverse();
        setMessages((prev) => [...olderMessages, ...prev]);

        // Fetch reactions for older messages
        const moreIds = olderMessages.map((m) => m.id);
        fetchReactionsForMessages(moreIds);

        const newSenderIds = Array.from(
          new Set(olderMessages.map((m) => m.sender_id))
        ).filter((id) => !profiles[id]);

        if (newSenderIds.length > 0) {
          const { data: newProfileData } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .in("id", newSenderIds);

          if (newProfileData) {
            setProfiles((prev) => {
              const next = { ...prev };
              newProfileData.forEach((p) => {
                next[p.id] = p;
              });
              return next;
            });
          }
        }

        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop =
              scrollRef.current.scrollHeight - prevScrollHeight;
          }
        });
      }
      isLoadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    if (messages.length === 0) {
      prevLastMessageId.current = null;
      return;
    }

    const lastMsg = messages[messages.length - 1];

    if (isInitialLoad.current) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "auto",
      });
      isInitialLoad.current = false;
    } else if (lastMsg.id !== prevLastMessageId.current) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }

    prevLastMessageId.current = lastMsg.id;
  }, [messages, loading]);

  async function toggleReaction(messageId: string, emoji: string) {
    const existingReactions = reactions[messageId] || [];
    const myExisting = existingReactions.find((r) => r.user_id === currentUserId);

    // Optimistic UI update
    if (myExisting) {
      if (myExisting.emoji === emoji) {
        // Same emoji: untoggle / remove
        setReactions((prev) => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter((r) => r.user_id !== currentUserId),
        }));
      } else {
        // Different emoji: swap to new emoji
        const updatedReaction: Reaction = {
          ...myExisting,
          emoji,
        };
        setReactions((prev) => ({
          ...prev,
          [messageId]: [
            ...(prev[messageId] || []).filter((r) => r.user_id !== currentUserId),
            updatedReaction,
          ],
        }));
      }
    } else {
      // Add new reaction
      const tempReaction: Reaction = {
        id: `temp-${Date.now()}`,
        message_id: messageId,
        user_id: currentUserId,
        emoji,
      };
      setReactions((prev) => ({
        ...prev,
        [messageId]: [
          ...(prev[messageId] || []).filter((r) => r.user_id !== currentUserId),
          tempReaction,
        ],
      }));
    }

    const { error } = await supabase.rpc("toggle_message_reaction", {
      p_message_id: messageId,
      p_emoji: emoji,
    });

    if (error) {
      console.error("Failed to toggle reaction:", error);
      // Revert on error
      fetchReactionsForMessages([messageId]);
    }
  }

  async function handleSendQuickInvite(teamId: string, teamName: string) {
    if (!recipientId || isBlocked || sending) return;

    setSending(true);
    setSafetyError(null);

    const { data: inviteId, error: rpcError } = await supabase.rpc("send_team_invite", {
      p_team_id: teamId,
      p_invited_user_id: recipientId,
    });

    if (rpcError || !inviteId) {
      console.error("RPC send_team_invite error:", rpcError);
      setSafetyError(rpcError?.message || "Failed to create team invitation.");
      setSending(false);
      setTimeout(() => setSafetyError(null), 5000);
      return;
    }

    const cardContent = `__TEAM_INVITE__::${JSON.stringify({ 
      invite_id: inviteId, 
      team_name: teamName, 
      team_id: teamId 
    })}`;

    const { error: msgError } = await supabase.rpc("send_message_with_mentions", {
      p_conversation_id: conversationId,
      p_content: cardContent,
      p_mentions: [recipientId],
    });

    if (msgError) {
      console.error("Message send error:", msgError);
      setSafetyError(msgError.message || "Failed to post invite message in chat.");
      setTimeout(() => setSafetyError(null), 5000);
    }

    setSending(false);
  }

  async function sendMessage() {
    if (isBlocked) return;
    const content = input.trim();
    if (!content) return;

    // Enforce message length limit
    if (content.length > 2000) {
      setSafetyError("Message is too long (max 2000 characters).");
      setTimeout(() => setSafetyError(null), 5000);
      return;
    }

    // Run safety moderation filters
    const safetyResult = moderateMessage(content);
    if (!safetyResult.isValid) {
      setSafetyError(safetyResult.error || "Message blocked by safety filters.");
      setTimeout(() => {
        setSafetyError(null);
      }, 5000);
      return;
    }

    const resolvedMentionIds = Array.from(new Set(
      mentionIds.filter((id) => {
        const user = participants.find((p) => p.id === id);
        return user ? safetyResult.sanitized.includes(`@${user.full_name}`) : false;
      })
    ));

    const currentReplyToId = replyingTo?.id || undefined;
    setSending(true);
    setInput("");
    setReplyingTo(null);
    setMentionIds([]);
    setShowMentions(false);
    setSafetyError(null);

    const { error } = await supabase.rpc("send_message_with_mentions", {
      p_conversation_id: conversationId,
      p_content: safetyResult.sanitized,
      p_mentions: resolvedMentionIds,
      p_reply_to_id: currentReplyToId,
    });

    if (error) {
      console.error(error);
      setSafetyError(error.message);
      setInput(content);
    }

    setSending(false);
  }

  async function pinMessage(messageId: string) {
    const { error } = await supabase.rpc("pin_message", {
      p_message_id: messageId,
    });
    if (error) {
      console.error(error);
    }
  }

  async function unpinMessage(messageId: string) {
    const { error } = await supabase.rpc("unpin_message", {
      p_message_id: messageId,
    });
    if (error) {
      console.error(error);
    }
  }

  async function clearChat() {
    const nowStr = new Date().toISOString();
    const { error } = await supabase
      .from("conversation_participants")
      .update({ cleared_at: nowStr })
      .eq("conversation_id", conversationId)
      .eq("user_id", currentUserId);

    if (error) {
      console.error("Error clearing chat:", error);
    } else {
      setClearedAt(nowStr);
      clearedAtRef.current = nowStr;
      setMessages([]);
      setHasMore(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function renderMessageContent(content: string, isMine: boolean) {
    if (content.startsWith("__TEAM_INVITE__::")) {
      try {
        const payloadStr = content.substring("__TEAM_INVITE__::".length);
        const payload = JSON.parse(payloadStr);
        return (
          <TeamInviteCard
            inviteId={payload.invite_id}
            teamName={payload.team_name}
            teamId={payload.team_id}
            isMine={isMine}
          />
        );
      } catch (err) {
        console.error("Failed to parse team invite payload", err);
      }
    }

    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(?:com|org|net|in|co|io|edu|gov|us|xyz|info|biz|me|cc|tv)\b[^\s]*)/gi;
    const parts = content.split(urlRegex);
    const firstUrlMatch = content.match(urlRegex);
    const previewUrl = firstUrlMatch ? (firstUrlMatch[0].toLowerCase().startsWith("http") ? firstUrlMatch[0] : "http://" + firstUrlMatch[0]) : null;

    return (
      <div>
        <div className="leading-relaxed">
          {parts.length === 1 ? (
            content
          ) : (
            parts.map((part, index) => {
              if (part.match(urlRegex)) {
                const href = part.toLowerCase().startsWith("http") ? part : "http://" + part;
                return (
                  <a
                    key={index}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={`underline underline-offset-2 break-all ${
                      isMine 
                        ? "text-blue-200 hover:text-white font-semibold" 
                        : "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold"
                    }`}
                  >
                    {part}
                  </a>
                );
              }
              return part;
            })
          )}
        </div>
        {previewUrl && (
          <LinkPreviewCard url={previewUrl} isMine={isMine} />
        )}
      </div>
    );
  }

  const pinnedMessage = [...messages].reverse().find((m) => m.is_pinned) ?? null;
  const activeTyperNames = Object.values(typingUsers).map((u) => u.fullName);

  return (
    <div className="card card-static flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/70 dark:bg-zinc-950/60 flex items-center justify-between shrink-0">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 dark:text-zinc-400 font-semibold">
          {conversationType === "dm" ? "Direct Message" : "Team Chat"}
        </span>
        <button
          onClick={clearChat}
          className="text-[10px] font-mono text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors uppercase flex items-center gap-1.5 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          Clear Chat
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-y-auto px-4 py-4 space-y-3.5"
        style={{ height }}
      >
        {pinnedMessage && (
          <div className="mb-4 sticky top-0 z-10">
            <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-amber-400">📌</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold">
                    Pinned Message
                  </p>
                  <p className="text-xs text-zinc-200 truncate">
                    {pinnedMessage.content}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {loadingMore && (
          <div className="flex justify-center py-2">
            <div className="w-4 h-4 border-2 border-zinc-800 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-zinc-800 border-t-white rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <p className="text-zinc-500 text-xs">No messages yet. Say hi 👋</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_id === currentUserId;
            const sender = profiles[msg.sender_id];
            const isMentioned = msg.mentions && msg.mentions.includes(currentUserId);
            const isInviteCard = msg.content.startsWith("__TEAM_INVITE__::");

            const parentMsg = msg.reply_to_id
              ? messages.find((m) => m.id === msg.reply_to_id)
              : null;
            const parentSender = parentMsg ? profiles[parentMsg.sender_id] : null;

            const msgReactions = reactions[msg.id] || [];
            // Group reactions by emoji
            const reactionGroups: { emoji: string; count: number; hasReacted: boolean; userNames: string[] }[] = [];
            msgReactions.forEach((r) => {
              let group = reactionGroups.find((g) => g.emoji === r.emoji);
              if (!group) {
                group = { emoji: r.emoji, count: 0, hasReacted: false, userNames: [] };
                reactionGroups.push(group);
              }
              group.count += 1;
              if (r.user_id === currentUserId) {
                group.hasReacted = true;
              }
              const uName = r.user_id === currentUserId ? "You" : (profiles[r.user_id]?.full_name || "User");
              group.userNames.push(uName);
            });

            return (
              <div id={`msg-${msg.id}`} key={msg.id} className={`flex gap-2.5 group/msg ${isMine ? "flex-row-reverse" : ""}`}>
                {sender?.avatar_url ? (
                  <img
                    src={sender.avatar_url}
                    alt={sender.full_name}
                    className="w-7 h-7 rounded object-cover flex-shrink-0 border border-zinc-200 dark:border-zinc-800"
                  />
                ) : (
                  <div className="w-7 h-7 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-600 dark:text-zinc-400 flex-shrink-0">
                    {sender?.full_name?.charAt(0) || "?"}
                  </div>
                )}

                <div className={`max-w-[75%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                  {!isMine && (
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-0.5 px-0.5">
                      {sender?.full_name || "Unknown"}
                    </span>
                  )}
                  {isInviteCard ? (
                    renderMessageContent(msg.content, isMine)
                  ) : (
                    <div className="group relative">
                      <div
                        className={`px-3 py-2 rounded-xl text-xs leading-relaxed shadow-xs ${
                          isMine
                            ? "bg-violet-600 text-white"
                            : isMentioned
                              ? "bg-violet-50 dark:bg-violet-950/40 border border-violet-300 dark:border-violet-500/40 text-violet-950 dark:text-violet-100 shadow-xs"
                              : "bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                        }`}
                      >
                        {msg.reply_to_id && (
                          <div
                            onClick={() => scrollToMessage(msg.reply_to_id!)}
                            className={`mb-1.5 p-2 rounded-lg border text-[11px] cursor-pointer transition-all ${
                              isMine
                                ? "bg-violet-700/60 border-violet-500/50 text-white hover:bg-violet-700/80"
                                : "bg-white dark:bg-zinc-950/80 border-zinc-200 dark:border-zinc-800/90 text-zinc-800 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-xs"
                            }`}
                          >
                            <div className={`flex items-center gap-1 font-bold text-[10px] mb-0.5 ${isMine ? "text-violet-200" : "text-violet-600 dark:text-violet-400"}`}>
                              <span>↩️</span>
                              <span className="truncate">
                                {parentSender?.full_name || (parentMsg ? "User" : "Replied message")}
                              </span>
                            </div>
                            <p className="truncate opacity-90">
                              {parentMsg
                                ? parentMsg.content.startsWith("__TEAM_INVITE__::")
                                  ? "✉️ Team Invitation"
                                  : parentMsg.content
                                : "Click to jump to original message"}
                            </p>
                          </div>
                        )}
                        {renderMessageContent(msg.content, isMine)}
                      </div>

                      {/* Floating Action & Quick Reaction Bar */}
                      <div className={`absolute -top-3 ${isMine ? "-left-2" : "-right-2"} opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-all duration-150 flex items-center gap-0.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-full px-1.5 py-0.5 shadow-lg z-20`}>
                        {/* Quick Reaction Emojis */}
                        {STANDARD_EMOJIS.slice(0, 4).map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(msg.id, emoji)}
                            className="hover:scale-125 transition-transform text-[12px] p-0.5 cursor-pointer leading-none"
                            title={`React with ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                        
                        <div className="w-[1px] h-3 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

                        {/* Reply Button */}
                        <button
                          onClick={() => setReplyingTo(msg)}
                          className="px-1 text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-white text-[10px] transition-colors cursor-pointer"
                          title="Reply to message"
                        >
                          ↩️
                        </button>
                        {/* Pin Button */}
                        <button
                          onClick={() =>
                            msg.is_pinned ? unpinMessage(msg.id) : pinMessage(msg.id)
                          }
                          className="px-1 text-zinc-500 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-white text-[10px] transition-colors cursor-pointer"
                          title={msg.is_pinned ? "Unpin message" : "Pin message"}
                        >
                          {msg.is_pinned ? "📍" : "📌"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Reaction Pills below message */}
                  {reactionGroups.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-1 px-0.5">
                      {reactionGroups.map((group) => (
                        <button
                          key={group.emoji}
                          onClick={() => toggleReaction(msg.id, group.emoji)}
                          title={`${group.userNames.join(", ")} reacted`}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] transition-all cursor-pointer border ${
                            group.hasReacted
                              ? "bg-violet-100 dark:bg-violet-950/70 border-violet-400 dark:border-violet-600 text-violet-900 dark:text-violet-200 font-semibold scale-100"
                              : "bg-zinc-100/90 dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                          }`}
                        >
                          <span>{group.emoji}</span>
                          <span className="text-[9px] font-mono">{group.count}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Timestamp & Read Receipt */}
                  <div className="flex items-center gap-1 mt-0.5 px-0.5">
                    <span className="text-[9px] text-zinc-600 dark:text-zinc-400">
                      {formatTime(msg.created_at)}
                    </span>
                    {isMine && (
                      <div className="flex items-center" title={msg.is_read ? "Read" : "Sent"}>
                        {msg.is_read ? (
                          <div className="flex items-center -space-x-1.5">
                            <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          </div>
                        ) : (
                          <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input & Footer Area */}
      <div className="border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/70 dark:bg-zinc-950/40 p-3.5 relative">
        {/* Live Typing Indicator */}
        {activeTyperNames.length > 0 && (
          <div className="absolute -top-6 left-4 flex items-center gap-1.5 text-[10px] text-violet-600 dark:text-violet-400 font-medium bg-white/90 dark:bg-zinc-900/90 px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-900/60 shadow-xs animate-fade-in">
            <span>💬</span>
            <span>
              {activeTyperNames.length === 1
                ? `${activeTyperNames[0]} is typing...`
                : `${activeTyperNames.slice(0, 2).join(", ")}${activeTyperNames.length > 2 ? ` +${activeTyperNames.length - 2}` : ""} are typing...`}
            </span>
            <span className="flex items-center gap-0.5 ml-0.5">
              <span className="w-1 h-1 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1 h-1 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1 h-1 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          </div>
        )}

        {replyingTo && (
          <div className="mb-2.5 p-2 rounded-lg bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs shadow-xs animate-fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-1 h-7 rounded-full bg-violet-500 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-violet-600 dark:text-violet-400 flex items-center gap-1">
                  <span>↩️ Replying to</span>
                  <span className="text-zinc-900 dark:text-zinc-200 truncate">
                    {profiles[replyingTo.sender_id]?.full_name || "User"}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate">
                  {replyingTo.content.startsWith("__TEAM_INVITE__::")
                    ? "✉️ Team Invitation"
                    : replyingTo.content}
                </p>
              </div>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded transition-colors cursor-pointer"
              title="Cancel reply"
            >
              ✕
            </button>
          </div>
        )}

        {conversationType === "dm" && recipientId && ownedTeams.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2.5 pb-2 border-b border-zinc-200 dark:border-zinc-800/60">
            <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mr-1 select-none font-semibold">Quick Invites:</span>
            {ownedTeams.map((team) => (
              <button
                key={team.id}
                onClick={() => handleSendQuickInvite(team.id, team.name)}
                disabled={sending}
                className="px-2.5 py-1 text-[10px] rounded-full border border-violet-300 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 dark:hover:bg-violet-500/20 text-violet-700 dark:text-violet-300 transition-all font-medium disabled:opacity-50 flex items-center gap-1 cursor-pointer"
              >
                <span>➕ Invite to {team.name}</span>
              </button>
            ))}
          </div>
        )}

        {safetyError && (
          <div className="mb-2 p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] leading-normal animate-fade-in">
            ⚠️ {safetyError}
          </div>
        )}

        <div className="relative flex items-end gap-2.5">
          <textarea
            value={input}
            onChange={(e) => {
              const value = e.target.value;
              setInput(value);
              sendTypingBroadcast();

              const match = value.match(/@([a-zA-Z\s]*)$/);
              if (match) {
                setMentionQuery(match[1]);
                setShowMentions(true);
              } else {
                setShowMentions(false);
              }
            }}
            onKeyDown={handleKeyDown}
            disabled={isBlocked}
            placeholder={isBlocked ? "You cannot message this user." : "Type a message..."}
            rows={2}
            className="input flex-1 resize-none py-2 px-3 text-xs bg-white dark:bg-zinc-950/80 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40 shadow-xs rounded-xl min-h-[42px] max-h-[100px] overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending || isBlocked}
            className="btn flex-shrink-0 bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
            style={{ height: "38px", width: "38px", padding: 0 }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>

          {showMentions && filteredParticipants.length > 0 && (
            <div className="absolute bottom-16 left-0 right-0 mx-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl max-h-48 overflow-y-auto z-50">
              {filteredParticipants.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    const updated = input.replace(
                      /@[a-zA-Z\s]*$/,
                      `@${user.full_name} `
                    );
                    setInput(updated);
                    setShowMentions(false);
                    setMentionIds((prev) =>
                      prev.includes(user.id) ? prev : [...prev, user.id]
                    );
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center gap-2 cursor-pointer"
                >
                  <div className="w-7 h-7 rounded bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold">
                    {user.full_name.charAt(0)}
                  </div>
                  <span className="text-sm text-zinc-800 dark:text-zinc-200">
                    {user.full_name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
