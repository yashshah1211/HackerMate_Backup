"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import { moderateMessage } from "@/lib/safety";
import LinkPreviewCard from "@/components/LinkPreviewCard";
import ImageLightbox from "@/components/ImageLightbox";
import VoiceNotePlayer from "@/components/VoiceNotePlayer";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  CheckCircle2,
  Copy,
  Send,
  Image as ImageIcon,
  ImagePlus,
  Mail,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Smile,
  Code2,
  Pin,
  Trash2,
  Flag,
  CornerUpLeft,
  TriangleAlert,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import {
  Avatar,
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  ErrorNotice,
  FieldLabel,
  IconButton,
  Menu,
  Spinner,
  StatusDot,
  Tape,
  Textarea,
} from "@/components/system";
import { cn } from "@/lib/utils";

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
  conversation_id?: string | null;
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
  otherUser?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    college?: string | null;
  } | null;
  onBack?: () => void;
};

const STANDARD_EMOJIS = ["👍", "❤️", "🔥", "🚀", "🎉", "😂", "👀"];

const HACKATHON_EMOJIS = [
  "🚀", "🔥", "💻", "💡", "🐛", "⚡", "🤝", "🙌",
  "🎯", "🏆", "💯", "🧠", "☕", "👍", "❤️", "🎉", "😂", "👀"
];

/** One-line, emoji-free summary of a message for quotes, banners and the pinned strip. */
function summarizeContent(content: string): { text: string; icon?: React.ReactNode } {
  if (content.startsWith("__TEAM_INVITE__::")) return { text: "Team invite", icon: <Mail className="size-3.5" aria-hidden /> };
  if (content.startsWith("__IMAGE__::")) return { text: "Photo", icon: <ImageIcon className="size-3.5" aria-hidden /> };
  if (content.startsWith("__VOICE__::")) return { text: "Voice note", icon: <Mic className="size-3.5" aria-hidden /> };
  return { text: content };
}

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
      <div className="flex items-center gap-2 py-1 text-[12px] text-ink-3">
        <Spinner className="size-3.5" label="Loading invite" />
        <span>Loading invite…</span>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="flex items-center gap-1.5 py-1 text-[12px] text-ink-3">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
        This invite no longer exists
      </div>
    );
  }

  return (
    <div className="my-0.5 w-[280px] max-w-full rounded-lg bg-raised p-3.5 ring-1 ring-inset ring-line">
      <div className="mb-1.5 flex items-center gap-1.5 caps-label text-ink-3">
        <Mail className="size-3.5" aria-hidden />
        <span>Team invite</span>
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">
        {isMine ? (
          <>
            You invited them to join <span className="font-semibold text-ink">{teamName}</span>
          </>
        ) : (
          <>
            You&apos;re invited to join <span className="font-semibold text-ink">{teamName}</span>
          </>
        )}
      </p>

      {status === "pending" ? (
        isMine ? (
          <Tape tone="neutral" dot>
            Awaiting reply
          </Tape>
        ) : (
          <div className="flex w-full flex-col gap-1.5">
            <div className="flex gap-1.5">
              <Button
                variant="inverse"
                size="sm"
                onClick={handleAccept}
                disabled={actionLoading}
                className="h-9 flex-1 md:h-7"
              >
                {actionLoading ? "Joining…" : "Accept"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDecline}
                disabled={actionLoading}
                className="h-9 flex-1 md:h-7"
              >
                {actionLoading ? "Declining…" : "Decline"}
              </Button>
            </div>
            <ButtonLink href={`/teams/${teamId}`} variant="ghost" size="sm" className="h-9 w-full md:h-7">
              View team
            </ButtonLink>
          </div>
        )
      ) : status === "accepted" ? (
        <Tape tone="ok" icon={<Check aria-hidden />}>
          Joined
        </Tape>
      ) : (
        <Tape tone="neutral" icon={<X aria-hidden />}>
          Declined
        </Tape>
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
    <div className="my-1.5 w-full max-w-lg min-w-0 overflow-hidden rounded-md bg-sunken font-mono ring-1 ring-inset ring-line">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1">
        <span className="truncate caps-label text-ink-3">{lang || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
          className={cn(
            "-mr-1.5 inline-flex h-8 items-center gap-1 rounded-[5px] px-1.5 text-[12.5px] transition-colors [&_svg]:size-3.5",
            copied ? "text-ok" : "text-ink-3 hover:bg-hover hover:text-ink",
          )}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[12px] leading-relaxed text-ink-2">
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
  height,
  otherUser,
  onBack,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const [profiles, setProfiles] = useState<Record<string, SenderProfile>>(knownProfiles);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  // Surfaces a failed message load instead of showing a misleading "No messages yet".
  const [loadError, setLoadError] = useState<string | null>(null);
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

  // Lightbox full-screen state
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  // Active message reaction picker state
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeReactionPickerId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".reaction-picker-container")) {
        setActiveReactionPickerId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeReactionPickerId]);

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

  function scrollToMessage(msgId: string) {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-accent/40", "rounded-lg", "transition-all", "duration-500");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-accent/40");
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
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("type")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError) {
      console.error("[chatThread] Error loading conversation:", convError);
    }
    setConversationType(conversation?.type || null);

    const { data: participantsData, error: partError } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);

    if (partError) {
      console.error("[chatThread] Error loading conversation participants:", partError);
    }

    const otherUser = (participantsData || []).find((p) => p.user_id !== currentUserId);

    if (otherUser) {
      setRecipientId(otherUser.user_id);
      const { data: block, error: blockError } = await supabase
        .from("blocked_users")
        .select("id")
        .or(`and(blocker_id.eq.${currentUserId},blocked_id.eq.${otherUser.user_id}),and(blocker_id.eq.${otherUser.user_id},blocked_id.eq.${currentUserId})`)
        .maybeSingle();

      if (blockError) {
        console.error("[chatThread] Error checking block status:", blockError);
      }
      setIsBlocked(!!block);
    } else {
      setRecipientId(null);
    }

    const { data: participantData, error: myPartError } = await supabase
      .from("conversation_participants")
      .select("cleared_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (myPartError) {
      console.error("[chatThread] Error loading participant cleared timestamp:", myPartError);
    }

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
      setLoadError(error.message || "Messages could not be loaded.");
      setLoading(false);
      return;
    }
    setLoadError(null);

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
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newReaction = payload.new as Reaction;
          // Discard reactions belonging to other conversations without triggering re-renders or profile lookups
          if (!newReaction?.message_id || !messagesRef.current.some((m) => m.id === newReaction.message_id)) {
            return;
          }
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
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedReaction = payload.new as Reaction;
          if (!updatedReaction?.message_id || !messagesRef.current.some((m) => m.id === updatedReaction.message_id)) {
            return;
          }
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
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const oldReaction = payload.old as { id?: string; message_id?: string; user_id?: string; emoji?: string };
          if (oldReaction?.message_id && !messagesRef.current.some((m) => m.id === oldReaction.message_id)) {
            return;
          }
          setReactions((prev) => {
            const next = { ...prev };
            for (const msgId in next) {
              if (oldReaction?.message_id && msgId !== oldReaction.message_id) continue;
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

        const { error: sendErr } = await supabase.rpc("send_message_with_mentions", {
          p_conversation_id: conversationId,
          p_content: imagePayload,
          p_mentions: [],
          p_reply_to_id: replyingTo?.id || undefined,
        });

        if (sendErr) {
          console.error("[chatThread] Failed to send image message:", sendErr);
          throw new Error(sendErr.message || "Failed to send image message");
        }

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
          <button
            type="button"
            className="my-0.5 block w-72 max-w-full cursor-zoom-in overflow-hidden rounded-md bg-sunken ring-1 ring-inset ring-line transition-[box-shadow] hover:ring-line-strong"
            onClick={() => setLightboxImg(payload.url)}
            aria-label={`Open ${payload.name || "photo"} full size`}
          >
            <img
              src={payload.url}
              alt={payload.name || "Photo attachment"}
              className="block max-h-72 w-full object-cover"
              loading="lazy"
            />
          </button>
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
      return <div className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{elements}</div>;
    }

    // 5. Normal Text with URLs and Link Previews
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(?:com|org|net|in|co|io|edu|gov|us|xyz|info|biz|me|cc|tv)\b[^\s]*)/gi;
    const parts = content.split(urlRegex);
    const firstUrlMatch = content.match(urlRegex);
    const previewUrl = firstUrlMatch ? (firstUrlMatch[0].toLowerCase().startsWith("http") ? firstUrlMatch[0] : "http://" + firstUrlMatch[0]) : null;

    return (
      <div className="min-w-0">
        <div className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">
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
                    className="font-medium text-accent-ink underline decoration-accent-ink/40 underline-offset-2 [overflow-wrap:anywhere] hover:decoration-accent-ink"
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

  function renderReplyQuote(replyToId: string, isMine: boolean) {
    const parentMsg = messages.find((m) => m.id === replyToId);
    const parentSender = parentMsg ? profiles[parentMsg.sender_id] : null;

    return (
      <button
        type="button"
        onClick={() => scrollToMessage(replyToId)}
        className={cn(
          "mb-1.5 block w-full max-w-full overflow-hidden rounded-[5px] border-l-2 border-ink-4 px-2 py-1 text-left transition-colors hover:border-ink-3",
          isMine ? "bg-canvas/60" : "bg-sunken",
        )}
      >
        <span className="flex max-w-full items-center gap-1 text-[12.5px] font-semibold text-ink-2">
          <CornerUpLeft className="size-3 shrink-0 text-ink-3" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            {parentSender?.full_name || (parentMsg ? "User" : "Replied message")}
          </span>
        </span>
        <span className="flex max-w-full items-center gap-1 text-[12px] text-ink-3">
          {parentMsg ? (
            <>
              {summarizeContent(parentMsg.content).icon}
              <span className="truncate">{summarizeContent(parentMsg.content).text}</span>
            </>
          ) : (
            <span className="truncate">Jump to the original message</span>
          )}
        </span>
      </button>
    );
  }

  function renderMessageActions(msg: Message, isMine: boolean) {
    const isPickerOpen = activeReactionPickerId === msg.id;

    return (
      <div
        className={cn(
          "absolute -top-4 flex items-center gap-px rounded-md bg-overlay p-0.5 shadow-pop ring-1 ring-line-strong transition-opacity duration-150",
          isMine ? "right-0" : "left-0",
          isPickerOpen
            ? "pointer-events-auto z-40 opacity-100"
            : "pointer-events-none z-20 opacity-0 focus-within:pointer-events-auto focus-within:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100",
        )}
      >
        {/* Quick reactions: first three on phones (the rest live in the picker), all seven from sm up. */}
        {STANDARD_EMOJIS.map((emoji, i) => (
          <button
            key={emoji}
            type="button"
            onClick={() => toggleReaction(msg.id, emoji)}
            className={cn(
              "size-8 items-center justify-center rounded-[5px] text-[15px] leading-none transition-colors hover:bg-hover md:size-7 md:text-[14px]",
              i < 3 ? "inline-flex" : "hidden sm:inline-flex",
            )}
            title={`React with ${emoji}`}
            aria-label={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}

        {/* More reactions picker button */}
        {/* Not `relative`: the picker anchors to the toolbar edge so it never runs off a 360px screen. */}
        <div className="reaction-picker-container">
          <button
            type="button"
            onClick={() => setActiveReactionPickerId(isPickerOpen ? null : msg.id)}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-[5px] transition-colors md:size-7 [&_svg]:size-4",
              isPickerOpen ? "bg-selected text-ink" : "text-ink-3 hover:bg-hover hover:text-ink",
            )}
            title="More reactions"
            aria-label="More reactions"
            aria-expanded={isPickerOpen}
          >
            <Smile aria-hidden />
          </button>

          {/* Expanded Emoji Picker Popover */}
          {isPickerOpen && (
            <div
              className={cn(
                "absolute top-full z-50 mt-1.5 grid w-56 animate-hm-fade grid-cols-6 gap-0.5 rounded-lg bg-overlay p-1.5 shadow-pop ring-1 ring-line",
                isMine ? "right-0" : "left-0",
              )}
            >
              {HACKATHON_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    toggleReaction(msg.id, emoji);
                    setActiveReactionPickerId(null);
                  }}
                  className="flex size-8 items-center justify-center rounded-md text-[16px] leading-none transition-colors hover:bg-hover"
                  title={`React with ${emoji}`}
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mx-0.5 h-4 w-px bg-line-strong" aria-hidden />

        <button
          type="button"
          onClick={() => setReplyingTo(msg)}
          className="inline-flex size-8 items-center justify-center rounded-[5px] text-ink-3 transition-colors hover:bg-hover hover:text-ink md:size-7 [&_svg]:size-4"
          title="Reply to message"
          aria-label="Reply to message"
        >
          <CornerUpLeft aria-hidden />
        </button>

        <button
          type="button"
          onClick={() =>
            msg.is_pinned ? unpinMessage(msg.id) : pinMessage(msg.id)
          }
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-[5px] transition-colors hover:bg-hover md:size-7 [&_svg]:size-4",
            msg.is_pinned ? "text-ink" : "text-ink-3 hover:text-ink",
          )}
          title={msg.is_pinned ? "Unpin message" : "Pin message"}
          aria-label={msg.is_pinned ? "Unpin message" : "Pin message"}
          aria-pressed={!!msg.is_pinned}
        >
          <Pin className={msg.is_pinned ? "fill-current" : undefined} aria-hidden />
        </button>

        {isMine ? (
          <button
            type="button"
            onClick={() => handleDeleteMessage(msg.id)}
            className="inline-flex size-8 items-center justify-center rounded-[5px] text-ink-3 transition-colors hover:bg-bad-soft hover:text-bad md:size-7 [&_svg]:size-4"
            title="Delete message"
            aria-label="Delete message"
          >
            <Trash2 aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setReportingMsg(msg)}
            className="inline-flex size-8 items-center justify-center rounded-[5px] text-ink-3 transition-colors hover:bg-bad-soft hover:text-bad md:size-7 [&_svg]:size-4"
            title="Report message or attachment"
            aria-label="Report message or attachment"
          >
            <Flag aria-hidden />
          </button>
        )}
      </div>
    );
  }

  const pinnedMessage = [...messages].reverse().find((m) => m.is_pinned) ?? null;
  const activeTyperNames = Object.values(typingUsers).map((u) => u.fullName);

  const composerDisabled = isBlocked || uploadingMedia;
  // IconButton has no disabled styling of its own.
  const toolDisabled = "disabled:pointer-events-none disabled:opacity-40";

  const conversationMenu = (
    <Menu
      align="end"
      trigger={({ open, toggle, ref }) => (
        <IconButton ref={ref} label="Conversation options" onClick={toggle} aria-expanded={open} aria-haspopup="menu">
          <MoreHorizontal aria-hidden />
        </IconButton>
      )}
      items={[{ label: "Clear chat history", icon: <Trash2 />, tone: "danger", onSelect: clearChat }]}
    />
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-canvas transition-[box-shadow,background-color]",
        isDraggingOver && "bg-accent-soft ring-2 ring-inset ring-accent/40",
      )}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex animate-hm-fade items-center justify-center bg-canvas/85 p-6">
          <div className="flex flex-col items-center rounded-lg border-2 border-dashed border-accent/40 bg-accent-soft px-8 py-7 text-center">
            <ImagePlus className="mb-2 size-6 text-accent-ink" aria-hidden />
            <p className="text-[14px] font-semibold text-ink">Drop to attach image</p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">You can add a caption before sending.</p>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImg && (
        <ImageLightbox src={lightboxImg} onClose={() => setLightboxImg(null)} />
      )}

      {/* Report Modal */}
      <Dialog
        open={!!reportingMsg}
        onClose={() => setReportingMsg(null)}
        size="sm"
        title="Report message"
        description="Reports go to the HackerMate moderation team for review."
        footer={
          <>
            <Button variant="ghost" onClick={() => setReportingMsg(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Flag />} loading={submittingReport} onClick={handleReportMessage}>
              {submittingReport ? "Submitting…" : "Submit report"}
            </Button>
          </>
        }
      >
        <fieldset className="space-y-1.5">
          <legend className="mb-2 caps-label text-ink-3">Why are you reporting this?</legend>
          {[
            "Inappropriate or Adult Content",
            "Spam, Scam, or Malicious Link",
            "Harassment or Hate Speech",
            "Other Community Guideline Violation"
          ].map((reason) => (
            <label
              key={reason}
              className={cn(
                "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-[13px] ring-1 ring-inset transition-colors",
                reportReason === reason ? "bg-selected text-ink ring-line-strong" : "bg-sunken text-ink-2 ring-line hover:ring-line-strong",
              )}
            >
              <input
                type="radio"
                name="reportReason"
                value={reason}
                checked={reportReason === reason}
                onChange={(e) => setReportReason(e.target.value)}
                className="accent-accent"
              />
              <span>{reason}</span>
            </label>
          ))}
        </fieldset>

        <div className="mt-4">
          <FieldLabel htmlFor="report-details" hint="Optional">
            Details
          </FieldLabel>
          <Textarea
            id="report-details"
            value={reportDetails}
            onChange={(e) => setReportDetails(e.target.value)}
            placeholder="What's wrong with this message?"
            rows={2}
            className="min-h-20 resize-none"
          />
        </div>
      </Dialog>

      {/* Report Success Toast */}
      {reportSuccessToast && (
        <div
          role="status"
          className="absolute left-1/2 top-16 z-40 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 animate-hm-fade items-start gap-2 rounded-md bg-overlay px-3 py-2 text-[12.5px] text-ink shadow-pop ring-1 ring-line"
        >
          <CheckCircle2 className="mt-px size-4 shrink-0 text-ok" aria-hidden />
          <span>Report submitted. Our moderation team will review it.</span>
        </div>
      )}

      {/* Header */}
      {otherUser ? (
        <header className="z-20 flex shrink-0 items-center gap-1 border-b border-line bg-canvas px-2 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] md:gap-1.5 md:px-4 md:py-2">
          {onBack && (
            <IconButton label="Back to conversations" onClick={onBack} className="md:hidden">
              <ArrowLeft aria-hidden />
            </IconButton>
          )}

          <Link
            href={`/profile/${otherUser.id}`}
            className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-1"
          >
            <Avatar name={otherUser.full_name} src={otherUser.avatar_url} size="md" />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-ink decoration-line-strong underline-offset-4 group-hover:underline">
                {otherUser.full_name}
              </span>
              <span className="block truncate text-[12px] text-ink-3">
                {otherUser.college || "Independent builder"}
              </span>
            </span>
          </Link>

          {uploadingMedia && <Spinner className="mx-1" label="Uploading media" />}

          <ButtonLink
            href={`/profile/${otherUser.id}`}
            variant="ghost"
            size="sm"
            icon={<UserRound />}
            className="hidden sm:inline-flex"
          >
            View profile
          </ButtonLink>

          {conversationMenu}
        </header>
      ) : (
        <header className="z-20 flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line bg-canvas pl-3 pr-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="caps-label text-ink-3">
              {conversationType === "dm" ? "Direct message" : "Team chat"}
            </span>
            {uploadingMedia && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
                <Spinner className="size-3.5" label="Processing media" />
                Processing media…
              </span>
            )}
          </div>

          {conversationMenu}
        </header>
      )}

      {/* Pinned message strip */}
      {pinnedMessage && (
        <div className="shrink-0 border-b border-line bg-canvas px-3 py-2 md:px-4">
          <button
            type="button"
            onClick={() => scrollToMessage(pinnedMessage.id)}
            className="flex w-full min-w-0 items-center gap-2.5 rounded-md bg-sunken px-3 py-2 text-left ring-1 ring-inset ring-line transition-colors hover:ring-line-strong"
            aria-label="Jump to pinned message"
          >
            <Pin className="size-3.5 shrink-0 fill-current text-ink-3" aria-hidden />
            <span className="shrink-0 caps-label text-ink-3">Pinned</span>
            <span className="flex min-w-0 flex-1 items-center gap-1 text-[12.5px] text-ink-2">
              {summarizeContent(pinnedMessage.content).icon}
              <span className="truncate">{summarizeContent(pinnedMessage.content).text}</span>
            </span>
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Messages"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4 md:px-5"
        style={height ? { height } : undefined}
      >
        {loadingMore && (
          <div className="flex justify-center py-1">
            <Spinner label="Loading older messages" />
          </div>
        )}

        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner label="Loading messages" />
          </div>
        ) : loadError && messages.length === 0 ? (
          <ErrorNotice
            title="Couldn't load messages"
            detail={loadError}
            onRetry={() => {
              setLoading(true);
              loadMessages();
            }}
          />
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              align="center"
              compact
              icon={<MessageSquare />}
              title="No messages yet"
              body="Say hi to start the conversation."
              className="max-w-xs"
            />
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_id === currentUserId;
            const sender = profiles[msg.sender_id];
            const isMentioned = msg.mentions && msg.mentions.includes(currentUserId);
            const isInviteCard = msg.content.startsWith("__TEAM_INVITE__::");
            const isImage = msg.content.startsWith("__IMAGE__::");

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
              <div
                id={`msg-${msg.id}`}
                key={msg.id}
                className={cn("group/msg flex gap-2.5", isMine ? "justify-end" : "justify-start")}
              >
                {!isMine && (
                  <Avatar name={sender?.full_name} src={sender?.avatar_url} size="sm" className="mt-0.5" />
                )}

                <div className={cn("flex min-w-0 max-w-[85%] flex-col md:max-w-[72%]", isMine ? "items-end" : "items-start")}>
                  {/* Name + time */}
                  <div className="mb-1 flex max-w-full items-baseline gap-2 px-0.5">
                    {!isMine && (
                      <span className="truncate text-[12.5px] font-semibold text-ink">
                        {sender?.full_name || "Unknown"}
                      </span>
                    )}
                    <span className="shrink-0 font-mono text-[12.5px] text-ink-3 tabular">
                      {formatTime(msg.created_at)}
                    </span>
                    {isMine && (
                      <span
                        className="inline-flex shrink-0 self-center"
                        role="img"
                        title={msg.is_read ? "Read" : "Sent"}
                        aria-label={msg.is_read ? "Read" : "Sent"}
                      >
                        {msg.is_read ? (
                          <CheckCheck className="size-3.5 text-ok" aria-hidden />
                        ) : (
                          <Check className="size-3.5 text-ink-3" aria-hidden />
                        )}
                      </span>
                    )}
                  </div>

                  {isInviteCard ? (
                    renderMessageContent(msg.content, isMine)
                  ) : isImage ? (
                    <div className="relative min-w-0 max-w-full">
                      {msg.reply_to_id && renderReplyQuote(msg.reply_to_id, isMine)}
                      {renderMessageContent(msg.content, isMine)}
                      {renderMessageActions(msg, isMine)}
                    </div>
                  ) : (
                    <div className="relative min-w-0 max-w-full">
                      <div
                        className={cn(
                          "min-w-0 max-w-full rounded-lg px-3 py-2 text-[14px] leading-relaxed md:text-[13.5px]",
                          isMine
                            ? "bg-selected text-ink"
                            : isMentioned
                              ? "bg-accent-soft text-ink ring-1 ring-inset ring-accent/40"
                              : "bg-raised text-ink-2 ring-1 ring-inset ring-line",
                        )}
                      >
                        {msg.reply_to_id && renderReplyQuote(msg.reply_to_id, isMine)}
                        {renderMessageContent(msg.content, isMine)}
                      </div>
                      {renderMessageActions(msg, isMine)}
                    </div>
                  )}

                  {/* Reaction Pills below message */}
                  {reactionGroups.length > 0 && (
                    <div className={cn("mt-1 flex flex-wrap items-center gap-1", isMine && "justify-end")}>
                      {reactionGroups.map((group) => (
                        <button
                          key={group.emoji}
                          type="button"
                          onClick={() => toggleReaction(msg.id, group.emoji)}
                          title={`${group.userNames.join(", ")} reacted`}
                          aria-pressed={group.hasReacted}
                          className={cn(
                            "inline-flex h-7 items-center gap-1 rounded-[5px] px-1.5 text-[13px] leading-none ring-1 ring-inset transition-colors md:h-6 md:text-[12px]",
                            group.hasReacted
                              ? "bg-accent-soft text-accent-ink ring-accent/40"
                              : "bg-raised text-ink-2 ring-line-strong hover:bg-hover",
                          )}
                        >
                          <span>{group.emoji}</span>
                          <span className="font-mono text-[12px] tabular">{group.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input & Footer Area */}
      <div className="relative shrink-0 border-t border-line bg-canvas px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 md:px-4">
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
          <div
            role="status"
            className="absolute bottom-full left-3 mb-1.5 flex max-w-[calc(100%-1.5rem)] animate-hm-fade items-center gap-1.5 rounded-[5px] bg-canvas px-2 py-0.5 text-[12px] text-ink-3 ring-1 ring-line md:left-4"
          >
            <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
              <span className="size-1 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: "0ms" }} />
              <span className="size-1 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: "150ms" }} />
              <span className="size-1 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: "300ms" }} />
            </span>
            <span className="truncate">
              {activeTyperNames.length === 1
                ? `${activeTyperNames[0]} is typing…`
                : `${activeTyperNames.slice(0, 2).join(", ")}${activeTyperNames.length > 2 ? ` +${activeTyperNames.length - 2}` : ""} are typing…`}
            </span>
          </div>
        )}

        {/* Replying banner */}
        {replyingTo && (
          <div className="mb-2 flex animate-hm-fade items-center justify-between gap-2 rounded-md bg-raised py-1 pl-3 pr-1 ring-1 ring-inset ring-line">
            <div className="min-w-0 border-l-2 border-accent-ink pl-2.5">
              <div className="flex min-w-0 items-center gap-1 text-[12px] text-ink-3">
                <CornerUpLeft className="size-3.5 shrink-0" aria-hidden />
                <span className="shrink-0">Replying to</span>
                <span className="truncate font-semibold text-ink">
                  {profiles[replyingTo.sender_id]?.full_name || "User"}
                </span>
              </div>
              <p className="flex min-w-0 items-center gap-1 text-[12.5px] text-ink-2">
                {summarizeContent(replyingTo.content).icon}
                <span className="truncate">{summarizeContent(replyingTo.content).text}</span>
              </p>
            </div>
            <IconButton label="Cancel reply" onClick={() => setReplyingTo(null)}>
              <X aria-hidden />
            </IconButton>
          </div>
        )}

        {/* Staged Image Preview in Typing Box */}
        {stagedImage && (
          <div className="mb-2 flex animate-hm-fade items-center justify-between gap-3 rounded-md bg-raised p-1.5 pl-2 ring-1 ring-inset ring-line">
            <div className="flex min-w-0 items-center gap-2.5">
              <img
                src={stagedImage.previewUrl}
                alt="Staged attachment preview"
                className="size-10 shrink-0 rounded-[5px] object-cover ring-1 ring-line"
              />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">
                  {stagedImage.file.name}
                </p>
                <p className="font-mono text-[12.5px] text-ink-3 tabular">
                  {(stagedImage.file.size / 1024).toFixed(0)} KB · Ready to send
                </p>
              </div>
            </div>
            <IconButton
              label="Remove attachment"
              onClick={() => {
                URL.revokeObjectURL(stagedImage.previewUrl);
                setStagedImage(null);
              }}
            >
              <X aria-hidden />
            </IconButton>
          </div>
        )}

        {conversationType === "dm" && recipientId && ownedTeams.length > 0 && (
          <div className="mb-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="shrink-0 caps-label text-ink-3">Invite to</span>
            {ownedTeams.map((team) => (
              <Button
                key={team.id}
                variant="secondary"
                size="sm"
                icon={<UserPlus />}
                onClick={() => handleSendQuickInvite(team.id, team.name)}
                disabled={sending || uploadingMedia}
                className="h-9 max-w-[200px] shrink-0 md:h-7"
                title={`Invite to ${team.name}`}
              >
                <span className="min-w-0 truncate">{team.name}</span>
              </Button>
            ))}
          </div>
        )}

        {safetyError && (
          <div
            role="alert"
            className="mb-2 flex animate-hm-fade items-start gap-2 rounded-md bg-bad-soft px-3 py-2 text-[12.5px] leading-snug text-bad ring-1 ring-inset ring-bad/25"
          >
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 [overflow-wrap:anywhere]">{safetyError}</span>
          </div>
        )}

        {isBlocked && (
          <p className="mb-2 flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
            You can&apos;t message this user.
          </p>
        )}

        {/* Input Bar & Controls */}
        {isRecording ? (
          <div
            role="status"
            className="flex min-h-[52px] items-center gap-2 rounded-md bg-sunken py-1.5 pl-3 pr-1.5 ring-1 ring-inset ring-bad/40"
          >
            <StatusDot tone="bad" pulse />
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-bad tabular">
              Recording {Math.floor(recordingSeconds / 60)}:{recordingSeconds % 60 < 10 ? "0" : ""}{recordingSeconds % 60}
            </span>

            <Button variant="ghost" onClick={cancelVoiceRecording} className="h-9" title="Cancel recording">
              Cancel
            </Button>

            <Button variant="primary" icon={<Send />} onClick={stopAndSendVoiceNote} className="h-9" title="Send voice note">
              Send
            </Button>
          </div>
        ) : (
          <div className="relative">
            {/* Emoji Picker Popover */}
            {showEmojiPicker && (
              <div className="absolute bottom-full left-0 z-40 mb-2 grid w-[240px] max-w-full animate-hm-fade grid-cols-6 gap-0.5 rounded-lg bg-overlay p-1.5 shadow-pop ring-1 ring-line">
                {HACKATHON_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => insertEmoji(em)}
                    aria-label={`Insert ${em}`}
                    className="flex size-9 items-center justify-center rounded-md text-[18px] leading-none transition-colors hover:bg-hover"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {/* Mentions dropdown */}
            {showMentions && filteredParticipants.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 z-50 mb-2 max-h-48 overflow-y-auto rounded-lg bg-overlay p-1 shadow-pop ring-1 ring-line">
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
                    className="flex h-10 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13.5px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
                  >
                    <Avatar name={user.full_name} src={user.avatar_url} size="sm" />
                    <span className="truncate">{user.full_name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-md bg-sunken ring-1 ring-inset ring-line-strong transition-[box-shadow] focus-within:shadow-[0_0_0_3px_var(--hm-accent-soft)] focus-within:ring-accent-ink">
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
                aria-label="Message"
                placeholder={isBlocked ? "You cannot message this user." : stagedImage ? "Add a caption (optional)…" : "Write a message…"}
                rows={1}
                className="block max-h-[120px] min-h-[40px] w-full resize-none overflow-y-auto bg-transparent px-3 pb-1 pt-2.5 text-[16px] leading-relaxed text-ink placeholder:text-ink-4 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-[13.5px]"
              />

              <div className="flex items-center justify-between gap-2 px-1 pb-1">
                <div className="flex min-w-0 items-center">
                  {/* Attachment Button (Photo / Image) */}
                  <IconButton
                    label="Attach image (or drag & drop / paste)"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={composerDisabled}
                    className={toolDisabled}
                  >
                    <ImageIcon aria-hidden />
                  </IconButton>

                  {/* Voice Note Mic Button */}
                  <IconButton
                    label="Record voice note"
                    onClick={startVoiceRecording}
                    disabled={composerDisabled}
                    className={toolDisabled}
                  >
                    <Mic aria-hidden />
                  </IconButton>

                  {/* Emoji Picker Trigger */}
                  <IconButton
                    label="Add emoji"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    disabled={composerDisabled}
                    aria-expanded={showEmojiPicker}
                    className={cn(toolDisabled, showEmojiPicker && "bg-selected text-ink")}
                  >
                    <Smile aria-hidden />
                  </IconButton>

                  {/* Insert Code Block Button */}
                  <IconButton
                    label="Insert code snippet"
                    onClick={insertCodeBlock}
                    disabled={composerDisabled}
                    className={toolDisabled}
                  >
                    <Code2 aria-hidden />
                  </IconButton>
                </div>

                {/* Send Button */}
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={(!input.trim() && !stagedImage) || sending || isBlocked || uploadingMedia}
                  aria-label="Send message"
                  title="Send message (Enter)"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-on-accent transition-[background-color,opacity,transform] hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-4"
                >
                  {sending || uploadingMedia ? (
                    <Spinner className="text-on-accent" label="Sending" />
                  ) : (
                    <Send aria-hidden />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

