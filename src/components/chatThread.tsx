"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import { moderateMessage } from "@/lib/safety";
import LinkPreviewCard from "@/components/LinkPreviewCard";
import ImageLightbox from "@/components/ImageLightbox";
import VoiceNotePlayer from "@/components/VoiceNotePlayer";
import { soundManager } from "@/lib/audioSounds";

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
  knownProfiles?: Record<string, SenderProfile>;
  height?: string;
};

const STANDARD_EMOJIS = ["👍", "❤️", "🔥", "🚀", "🎉", "😂", "👀"];

const HACKATHON_EMOJIS = [
  "🚀", "🔥", "💻", "💡", "🐛", "⚡", "🤝", "🙌",
  "🎯", "✨", "💯", "🧠", "☕", "👍", "❤️", "🎉", "😂", "👀"
];

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

function CodeBlockCard({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 font-mono text-xs max-w-lg shadow-md">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/90 border-b border-zinc-800 text-[10px] text-zinc-400">
        <span className="uppercase tracking-wider font-semibold">{lang || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <span className="text-emerald-400">✓</span>
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <span>📋</span>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-zinc-200 text-[11px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Client-side image compression to WebP using Canvas
async function compressImageToWebP(file: File, maxDimension = 1600, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(file);
          }
        },
        "image/webp",
        quality
      );
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
  });
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
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Audio chimes sound state
  const [isMuted, setIsMuted] = useState(false);

  // Lightbox full-screen state
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  // Voice note recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Typing indicators state
  const [typingUsers, setTypingUsers] = useState<Record<string, { fullName: string; timerId: NodeJS.Timeout }>>({});
  const lastTypingSentRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Reporting state
  const [reportingMsg, setReportingMsg] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState("Inappropriate or Adult Content");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportSuccessToast, setReportSuccessToast] = useState(false);

  // Staged Attachment Preview State
  const [stagedImage, setStagedImage] = useState<{ file: File; previewUrl: string } | null>(null);

  // Drag-and-drop & Emoji picker state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const myProfile = profiles[currentUserId] || null;

  useEffect(() => {
    setIsMuted(soundManager.getMuted());
  }, []);

  const toggleSoundMute = () => {
    const nextMute = soundManager.toggleMute();
    setIsMuted(nextMute);
  };

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
    const { data: conversation } = await supabase
      .from("conversations")
      .select("type")
      .eq("id", conversationId)
      .maybeSingle();

    setConversationType(conversation?.type || null);

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

    const messageIds = fetchedMessages.map((m) => m.id);
    fetchReactionsForMessages(messageIds);

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
            soundManager.playReceived();
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
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const oldMsg = payload.old as { id?: string };
          if (oldMsg?.id) {
            setMessages((prev) => prev.filter((m) => m.id !== oldMsg.id));
          }
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

    if (myExisting) {
      if (myExisting.emoji === emoji) {
        setReactions((prev) => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter((r) => r.user_id !== currentUserId),
        }));
      } else {
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
      fetchReactionsForMessages([messageId]);
    }
  }

  const handleDeleteMessage = async (messageId: string) => {
    // Optimistic UI delete
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    const { error } = await supabase.rpc("delete_message", {
      p_message_id: messageId,
    });
    if (error) {
      console.error("Failed to delete message:", error);
      loadMessages();
    }
  };

  const handleReportMessage = async () => {
    if (!reportingMsg) return;
    setSubmittingReport(true);
    const { error } = await supabase.from("user_reports").insert({
      reported_id: reportingMsg.sender_id,
      reporter_id: currentUserId,
      reason: reportReason,
      details: reportDetails ? `${reportDetails} (Message preview: ${reportingMsg.content.slice(0, 200)})` : `Reported in chat. Preview: ${reportingMsg.content.slice(0, 200)}`,
    });

    setSubmittingReport(false);
    if (!error) {
      setReportingMsg(null);
      setReportDetails("");
      setReportSuccessToast(true);
      setTimeout(() => setReportSuccessToast(false), 4000);
    } else {
      console.error("Report error:", error);
    }
  };

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

  // Pre-Send Staging: Stage image file in the typing box
  const stageImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setSafetyError("Please select a valid image file.");
      setTimeout(() => setSafetyError(null), 4000);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setSafetyError("Image must be smaller than 10 MB.");
      setTimeout(() => setSafetyError(null), 4000);
      return;
    }

    setSafetyError(null);
    if (stagedImage) {
      URL.revokeObjectURL(stagedImage.previewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setStagedImage({ file, previewUrl });
  };

  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    stageImageFile(file);
  };

  // Clipboard Paste handler (Ctrl + V images staged in typing box)
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          stageImageFile(file);
          return;
        }
      }
    }
  };

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && files[0].type.startsWith("image/")) {
      stageImageFile(files[0]);
    }
  };

  const insertEmoji = (emoji: string) => {
    setInput((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  const insertCodeBlock = () => {
    setInput((prev) => {
      if (prev.trim()) {
        return `${prev}\n\`\`\`typescript\n// Code snippet\n\n\`\`\`\n`;
      }
      return "```typescript\n// Code snippet\n\n```\n";
    });
  };

  // Voice Note Recorder handlers
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 120) {
            stopAndSendVoiceNote();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Microphone permission error:", err);
      setSafetyError("Microphone access denied or unavailable.");
      setTimeout(() => setSafetyError(null), 4000);
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const stopAndSendVoiceNote = async () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    const finalSeconds = recordingSeconds;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }

    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      setRecordingSeconds(0);

      if (audioBlob.size < 500 || finalSeconds < 1) {
        return;
      }

      try {
        setUploadingMedia(true);
        setSafetyError(null);

        const formData = new FormData();
        formData.append("file", audioBlob, "voice.webm");
        formData.append("folder", "chat_voice");

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const errJson = await uploadRes.json().catch(() => ({}));
          throw new Error(errJson.error || "Failed to upload audio");
        }

        const { publicUrl } = await uploadRes.json();

        const voicePayload = `__VOICE__::${JSON.stringify({ url: publicUrl, duration: finalSeconds })}`;
        soundManager.playSent();

        await supabase.rpc("send_message_with_mentions", {
          p_conversation_id: conversationId,
          p_content: voicePayload,
          p_mentions: [],
        });
      } catch (err: unknown) {
        console.error("Voice upload error:", err);
        setSafetyError(err instanceof Error ? err.message : "Voice upload failed");
        setTimeout(() => setSafetyError(null), 5000);
      } finally {
        setUploadingMedia(false);
      }
    };

    mediaRecorderRef.current.stop();
  };

  async function sendMessage() {
    if (isBlocked) return;
    const content = input.trim();
    const hasStaged = !!stagedImage;

    if (!content && !hasStaged) return;

    if (content.length > 2000) {
      setSafetyError("Message is too long (max 2000 characters).");
      setTimeout(() => setSafetyError(null), 5000);
      return;
    }

    setSending(true);
    setSafetyError(null);

    try {
      // 1. If an image is staged, compress and upload first
      if (stagedImage) {
        setUploadingMedia(true);
        const compressedBlob = await compressImageToWebP(stagedImage.file);

        const formData = new FormData();
        formData.append("file", compressedBlob, "image.webp");
        formData.append("folder", "chat_images");

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const errJson = await uploadRes.json().catch(() => ({}));
          throw new Error(errJson.error || "Image upload failed");
        }

        const { publicUrl } = await uploadRes.json();
        const imagePayload = `__IMAGE__::${JSON.stringify({ url: publicUrl, name: stagedImage.file.name })}`;
        
        soundManager.playSent();

        await supabase.rpc("send_message_with_mentions", {
          p_conversation_id: conversationId,
          p_content: imagePayload,
          p_mentions: [],
          p_reply_to_id: replyingTo?.id || undefined,
        });

        URL.revokeObjectURL(stagedImage.previewUrl);
        setStagedImage(null);
        setUploadingMedia(false);
      }

      // 2. If text content was also entered alongside image or standalone
      if (content) {
        const safetyResult = moderateMessage(content);
        if (!safetyResult.isValid) {
          setSafetyError(safetyResult.error || "Message blocked by safety filters.");
          setTimeout(() => setSafetyError(null), 5000);
          setSending(false);
          return;
        }

        const resolvedMentionIds = Array.from(new Set(
          mentionIds.filter((id) => {
            const user = participants.find((p) => p.id === id);
            return user ? safetyResult.sanitized.includes(`@${user.full_name}`) : false;
          })
        ));

        soundManager.playSent();

        const { error } = await supabase.rpc("send_message_with_mentions", {
          p_conversation_id: conversationId,
          p_content: safetyResult.sanitized,
          p_mentions: resolvedMentionIds,
          p_reply_to_id: !stagedImage ? (replyingTo?.id || undefined) : undefined,
        });

        if (error) {
          throw new Error(error.message);
        }
      }

      setInput("");
      setReplyingTo(null);
      setMentionIds([]);
      setShowMentions(false);
    } catch (err: unknown) {
      console.error("Send error:", err);
      setSafetyError(err instanceof Error ? err.message : "Failed to send message");
      setTimeout(() => setSafetyError(null), 5000);
    } finally {
      setSending(false);
      setUploadingMedia(false);
    }
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
    // 1. Team Invite Card
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

    // 2. Image Attachment
    if (content.startsWith("__IMAGE__::")) {
      try {
        const payloadStr = content.substring("__IMAGE__::".length);
        const payload = JSON.parse(payloadStr);
        return (
          <div className="my-1.5 overflow-hidden rounded-2xl max-w-xs border border-zinc-700/60 shadow-md group/img cursor-pointer transition-transform hover:scale-[1.01]" onClick={() => setLightboxImg(payload.url)}>
            <img
              src={payload.url}
              alt={payload.name || "Photo attachment"}
              className="w-full max-h-72 object-cover"
              loading="lazy"
            />
          </div>
        );
      } catch (err) {
        console.error("Failed to parse image payload", err);
      }
    }

    // 3. Voice Note
    if (content.startsWith("__VOICE__::")) {
      try {
        const payloadStr = content.substring("__VOICE__::".length);
        const payload = JSON.parse(payloadStr);
        return (
          <VoiceNotePlayer
            src={payload.url}
            duration={payload.duration}
            isMine={isMine}
          />
        );
      } catch (err) {
        console.error("Failed to parse voice payload", err);
      }
    }

    // 4. Code Block Detection (```lang ... ```)
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
    if (codeBlockRegex.test(content)) {
      const elements: React.ReactNode[] = [];
      let lastIdx = 0;
      let match: RegExpExecArray | null;

      const regex = new RegExp(codeBlockRegex);
      while ((match = regex.exec(content)) !== null) {
        if (match.index > lastIdx) {
          elements.push(
            <span key={`text-${lastIdx}`}>{content.slice(lastIdx, match.index)}</span>
          );
        }
        const lang = match[1] || "";
        const code = match[2] || "";
        elements.push(
          <CodeBlockCard key={`code-${match.index}`} code={code.trim()} lang={lang} />
        );
        lastIdx = match.index + match[0].length;
      }
      if (lastIdx < content.length) {
        elements.push(<span key={`text-${lastIdx}`}>{content.slice(lastIdx)}</span>);
      }
      return <div>{elements}</div>;
    }

    // 5. Normal Text with URLs and Link Previews
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
                        ? "text-blue-100 hover:text-white font-semibold" 
                        : "text-blue-400 hover:text-blue-300 font-semibold"
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
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`card card-static flex flex-col overflow-hidden relative transition-all ${
        isDraggingOver ? "ring-2 ring-violet-500 bg-violet-950/20" : ""
      }`}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-violet-950/80 backdrop-blur-xs border-2 border-dashed border-violet-400 rounded-2xl flex flex-col items-center justify-center p-6 animate-fade-in pointer-events-none">
          <div className="w-12 h-12 rounded-2xl bg-violet-600/30 flex items-center justify-center text-2xl mb-2 animate-bounce">
            📸
          </div>
          <p className="text-sm font-bold text-white">Drop image to stage in chat</p>
          <p className="text-xs text-violet-300">Preview and add caption before sending</p>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImg && (
        <ImageLightbox src={lightboxImg} onClose={() => setLightboxImg(null)} />
      )}

      {/* Report Modal */}
      {reportingMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setReportingMsg(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-rose-400 text-base">🚩</span>
                <h3 className="text-sm font-bold text-white">Report Content</h3>
              </div>
              <button
                onClick={() => setReportingMsg(null)}
                className="text-zinc-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-zinc-300">Why are you reporting this?</label>
              <div className="space-y-1.5 text-xs text-zinc-300">
                {[
                  "Inappropriate or Adult Content",
                  "Spam, Scam, or Malicious Link",
                  "Harassment or Hate Speech",
                  "Other Community Guideline Violation"
                ].map((reason) => (
                  <label key={reason} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 cursor-pointer">
                    <input
                      type="radio"
                      name="reportReason"
                      value={reason}
                      checked={reportReason === reason}
                      onChange={(e) => setReportReason(e.target.value)}
                      className="accent-rose-500"
                    />
                    <span>{reason}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-300">Additional Details (Optional)</label>
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Explain what is wrong with this content..."
                rows={2}
                className="w-full text-xs p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white placeholder:text-zinc-600 focus:border-rose-500 focus:outline-none resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReportingMsg(null)}
                className="flex-1 px-3 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReportMessage}
                disabled={submittingReport}
                className="flex-1 px-3 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {submittingReport ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Success Toast */}
      {reportSuccessToast && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 px-3.5 py-2 rounded-full bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-xs font-semibold shadow-xl flex items-center gap-1.5 animate-fade-in">
          <span>✓</span>
          <span>Report submitted. Our moderation team will review this.</span>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/70 dark:bg-zinc-950/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 dark:text-zinc-400 font-semibold">
            {conversationType === "dm" ? "Direct Message" : "Team Chat"}
          </span>
          {uploadingMedia && (
            <span className="text-[9px] font-mono text-violet-600 dark:text-violet-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-ping" />
              Processing media...
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Sound Mute Toggle */}
          <button
            onClick={toggleSoundMute}
            className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            title={isMuted ? "Unmute chat sound effects" : "Mute chat sound effects"}
          >
            {isMuted ? "🔇" : "🔊"}
          </button>

          {/* Clear Chat */}
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
                    {pinnedMessage.content.startsWith("__IMAGE__::")
                      ? "🖼️ Photo Attachment"
                      : pinnedMessage.content.startsWith("__VOICE__::")
                        ? "🎙️ Voice Note"
                        : pinnedMessage.content}
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
                    className="w-7 h-7 rounded-xl object-cover flex-shrink-0 border border-zinc-200 dark:border-zinc-800"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-600 dark:text-zinc-400 flex-shrink-0">
                    {sender?.full_name?.charAt(0) || "?"}
                  </div>
                )}

                <div className={`max-w-[75%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                  {!isMine && (
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-0.5 px-0.5 font-medium">
                      {sender?.full_name || "Unknown"}
                    </span>
                  )}
                  {isInviteCard ? (
                    renderMessageContent(msg.content, isMine)
                  ) : (
                    <div className="group relative">
                      <div
                        className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                          isMine
                            ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-600/10"
                            : isMentioned
                              ? "bg-violet-50 dark:bg-violet-950/40 border border-violet-300 dark:border-violet-500/40 text-violet-950 dark:text-violet-100 shadow-xs"
                              : "bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                        }`}
                      >
                        {msg.reply_to_id && (
                          <div
                            onClick={() => scrollToMessage(msg.reply_to_id!)}
                            className={`mb-2 p-2 rounded-xl border text-[11px] cursor-pointer transition-all ${
                              isMine
                                ? "bg-black/20 border-white/20 text-white hover:bg-black/30"
                                : "bg-white dark:bg-zinc-950/80 border-zinc-200 dark:border-zinc-800/90 text-zinc-800 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-xs"
                            }`}
                          >
                            <div className={`flex items-center gap-1 font-bold text-[10px] mb-0.5 ${isMine ? "text-violet-200" : "text-violet-600 dark:text-violet-400"}`}>
                              <span>↩️</span>
                              <span className="truncate">
                                {parentSender?.full_name || (parentMsg ? "User" : "Replied message")}
                              </span>
                            </div>
                            <p className="truncate opacity-90 text-[10px]">
                              {parentMsg
                                ? parentMsg.content.startsWith("__TEAM_INVITE__::")
                                  ? "✉️ Team Invitation"
                                  : parentMsg.content.startsWith("__IMAGE__::")
                                    ? "🖼️ Photo Attachment"
                                    : parentMsg.content.startsWith("__VOICE__::")
                                      ? "🎙️ Voice Note"
                                      : parentMsg.content
                                : "Click to jump to original message"}
                            </p>
                          </div>
                        )}
                        {renderMessageContent(msg.content, isMine)}
                      </div>

                      {/* Floating Action & Quick Reaction Bar */}
                      <div className={`absolute -top-3.5 ${isMine ? "-left-2" : "-right-2"} opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-all duration-150 flex items-center gap-0.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-full px-1.5 py-0.5 shadow-lg z-20`}>
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

                        <button
                          onClick={() => setReplyingTo(msg)}
                          className="px-1 text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-white text-[10px] transition-colors cursor-pointer"
                          title="Reply to message"
                        >
                          ↩️
                        </button>

                        <button
                          onClick={() =>
                            msg.is_pinned ? unpinMessage(msg.id) : pinMessage(msg.id)
                          }
                          className="px-1 text-zinc-500 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-white text-[10px] transition-colors cursor-pointer"
                          title={msg.is_pinned ? "Unpin message" : "Pin message"}
                        >
                          {msg.is_pinned ? "📍" : "📌"}
                        </button>

                        {/* Delete message button (Sender only) */}
                        {isMine && (
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="px-1 text-zinc-500 dark:text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 text-[10px] transition-colors cursor-pointer"
                            title="Delete message"
                          >
                            🗑️
                          </button>
                        )}

                        {/* Report message button (Recipient only) */}
                        {!isMine && (
                          <button
                            onClick={() => setReportingMsg(msg)}
                            className="px-1 text-zinc-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 text-[10px] transition-colors cursor-pointer"
                            title="Report message or attachment"
                          >
                            🚩
                          </button>
                        )}
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
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] transition-all cursor-pointer border ${
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
        {/* Hidden File Input for Image attachments */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageSelected}
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
        />

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

        {/* Replying banner */}
        {replyingTo && (
          <div className="mb-2.5 p-2 rounded-xl bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs shadow-xs animate-fade-in">
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
                    : replyingTo.content.startsWith("__IMAGE__::")
                      ? "🖼️ Photo Attachment"
                      : replyingTo.content.startsWith("__VOICE__::")
                        ? "🎙️ Voice Note"
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

        {/* Staged Image Preview in Typing Box */}
        {stagedImage && (
          <div className="mb-2.5 p-2 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 shadow-md animate-fade-in">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <img
                  src={stagedImage.previewUrl}
                  alt="Staged attachment preview"
                  className="w-12 h-12 rounded-xl object-cover border border-zinc-200 dark:border-zinc-750 shadow-xs"
                />
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-violet-500 ring-2 ring-zinc-900 flex items-center justify-center text-[7px] text-white font-bold">
                  ✓
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate max-w-[220px]">
                  {stagedImage.file.name}
                </p>
                <p className="text-[10px] text-zinc-500 font-mono">
                  {(stagedImage.file.size / 1024).toFixed(0)} KB • Ready to send (add caption below)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(stagedImage.previewUrl);
                setStagedImage(null);
              }}
              className="w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer"
              title="Remove attachment"
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
                disabled={sending || uploadingMedia}
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

        {/* Emoji Picker Popover */}
        {showEmojiPicker && (
          <div className="absolute bottom-16 left-3 p-2 rounded-2xl bg-zinc-900/95 border border-zinc-800 shadow-2xl backdrop-blur-md z-40 grid grid-cols-6 gap-1 max-w-[240px] animate-fade-in">
            {HACKATHON_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => insertEmoji(em)}
                className="p-1.5 hover:bg-zinc-800 rounded-xl text-lg hover:scale-125 transition-transform cursor-pointer"
              >
                {em}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar & Controls */}
        {isRecording ? (
          <div className="flex items-center gap-3 py-1.5 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 animate-pulse">
            <div className="flex items-center gap-2 flex-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping" />
              <span className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">
                Recording Voice Note... {Math.floor(recordingSeconds / 60)}:{recordingSeconds % 60 < 10 ? "0" : ""}{recordingSeconds % 60}
              </span>
            </div>

            <button
              onClick={cancelVoiceRecording}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-xs font-semibold cursor-pointer"
              title="Cancel recording"
            >
              Cancel ✕
            </button>

            <button
              onClick={stopAndSendVoiceNote}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-1"
              title="Send voice note"
            >
              <span>Send</span>
              <span>✓</span>
            </button>
          </div>
        ) : (
          <div className="relative flex items-end gap-1.5">
            {/* Attachment Button (Photo / Image) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBlocked || uploadingMedia}
              className="p-2 rounded-xl text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 transition-all cursor-pointer disabled:opacity-50"
              title="Attach image (or drag & drop / Ctrl+V)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </button>

            {/* Voice Note Mic Button */}
            <button
              type="button"
              onClick={startVoiceRecording}
              disabled={isBlocked || uploadingMedia}
              className="p-2 rounded-xl text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 transition-all cursor-pointer disabled:opacity-50"
              title="Record voice note"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15a3 3 0 01-3-3V4.5a3 3 0 116 0v7.5a3 3 0 01-3 3z" />
              </svg>
            </button>

            {/* Emoji Picker Trigger */}
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={isBlocked || uploadingMedia}
              className="p-2 rounded-xl text-zinc-500 hover:text-amber-500 hover:bg-zinc-200/60 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 transition-all cursor-pointer disabled:opacity-50 text-xs leading-none"
              title="Add emoji"
            >
              😀
            </button>

            {/* Insert Code Block Button */}
            <button
              type="button"
              onClick={insertCodeBlock}
              disabled={isBlocked || uploadingMedia}
              className="p-2 rounded-xl text-zinc-500 hover:text-violet-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 transition-all cursor-pointer disabled:opacity-50 text-[11px] font-mono font-bold leading-none"
              title="Insert code snippet"
            >
              {"</>"}
            </button>

            {/* Textarea */}
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
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              disabled={isBlocked}
              placeholder={isBlocked ? "You cannot message this user." : stagedImage ? "Add an optional caption..." : "Type message... (Paste image, drag & drop, or code ```)"}
              rows={2}
              className="input flex-1 resize-none py-2 px-3 text-xs bg-white dark:bg-zinc-950/80 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40 shadow-xs rounded-xl min-h-[40px] max-h-[100px] overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed"
            />

            {/* Send Button */}
            <button
              onClick={sendMessage}
              disabled={(!input.trim() && !stagedImage) || sending || isBlocked || uploadingMedia}
              className="btn flex-shrink-0 bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
              style={{ height: "38px", width: "38px", padding: 0 }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>

            {/* Mentions dropdown */}
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
        )}
      </div>
    </div>
  );
}
