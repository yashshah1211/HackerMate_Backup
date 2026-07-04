"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { moderateMessage } from "@/lib/safety";

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
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

export default function ChatThread({
  conversationId,
  currentUserId,
  knownProfiles = {},
  height = "420px",
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, SenderProfile>>(
    knownProfiles
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadMessages() {
    // Check if direct message conversation has blocked participant relationships
    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);

    const otherUser = (participants || []).find((p) => p.user_id !== currentUserId);

    if (otherUser) {
      const { data: block } = await supabase
        .from("blocked_users")
        .select("id")
        .or(`and(blocker_id.eq.${currentUserId},blocked_id.eq.${otherUser.user_id}),and(blocker_id.eq.${otherUser.user_id},blocked_id.eq.${currentUserId})`)
        .maybeSingle();

      setIsBlocked(!!block);
    }

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setMessages(data || []);

    // Mark messages as read since we are actively viewing this conversation
    supabase.rpc("mark_conversation_read", {
      p_conversation_id: conversationId,
    }).then(({ error: readErr }) => {
      if (readErr) console.error("Error marking messages read:", readErr);
    });

    const senderIds = Array.from(
      new Set((data || []).map((m) => m.sender_id))
    ).filter((id) => !profiles[id]);

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

  useEffect(() => {
    if (!conversationId) return;
    Promise.resolve().then(() => {
      loadMessages();
    });

    const channel = supabase
      .channel(`messages:${conversationId}`)
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function sendMessage() {
    if (isBlocked) return;
    const content = input.trim();
    if (!content) return;

    // Run safety moderation filters
    const safetyResult = moderateMessage(content);
    if (!safetyResult.isValid) {
      setSafetyError(safetyResult.error || "Message blocked by safety filters.");
      setTimeout(() => {
        setSafetyError(null);
      }, 5000); // auto-hide warning after 5s
      return;
    }

    setSending(true);
    setInput("");
    setSafetyError(null);

    const { error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId,
      p_content: safetyResult.sanitized,
    });

    if (error) {
      console.error(error);
      setSafetyError(error.message);
      setInput(content); // restore input on failure
    }

    setSending(false);
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
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(?:com|org|net|in|co|io|edu|gov|us|xyz|info|biz|me|cc|tv)\b[^\s]*)/gi;
    const parts = content.split(urlRegex);
    if (parts.length === 1) return content;

    return parts.map((part, index) => {
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
                ? "text-blue-700 hover:text-blue-900 font-semibold" 
                : "text-blue-400 hover:text-blue-300 font-semibold"
            }`}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  }

  return (
    <div className="card card-static flex flex-col overflow-hidden">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="overflow-y-auto px-4 py-4 space-y-3.5"
        style={{ height }}
      >
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

            return (
              <div key={msg.id} className={`flex gap-2.5 ${isMine ? "flex-row-reverse" : ""}`}>
                {sender?.avatar_url ? (
                  <img
                    src={sender.avatar_url}
                    alt={sender.full_name}
                    className="w-7 h-7 rounded object-cover flex-shrink-0 border border-zinc-800"
                  />
                ) : (
                  <div className="w-7 h-7 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 flex-shrink-0">
                    {sender?.full_name?.charAt(0) || "?"}
                  </div>
                )}

                <div className={`max-w-[75%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                  {!isMine && (
                    <span className="text-[10px] text-zinc-500 mb-0.5 px-0.5">
                      {sender?.full_name || "Unknown"}
                    </span>
                  )}
                  <div
                    className={`px-3 py-1.5 rounded text-xs leading-relaxed ${
                      isMine
                        ? "bg-white text-black"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-200"
                    }`}
                  >
                    {renderMessageContent(msg.content, isMine)}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 px-0.5">
                    <span className="text-[9px] text-zinc-600">
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

      {/* Input */}
      <div className="border-t border-zinc-900 bg-zinc-950/20 p-3">
        {safetyError && (
          <div className="mb-2 p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] leading-normal animate-fade-in">
            ⚠️ {safetyError}
          </div>
        )}
        <div className="flex items-end gap-2.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isBlocked}
            placeholder={isBlocked ? "You cannot message this user." : "Type a message..."}
            rows={2}
            className="input flex-1 resize-none py-1.5 px-3 text-xs bg-zinc-950/60 border-zinc-800 focus:border-zinc-700 min-h-[42px] max-h-[100px] overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending || isBlocked}
            className="btn btn-primary flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ height: "36px", width: "36px", padding: 0 }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
