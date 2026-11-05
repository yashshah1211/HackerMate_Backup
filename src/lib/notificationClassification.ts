import type { TapeTone } from "@/components/system/Tape";

export type NotificationFilter = "all" | "unread" | "teams" | "connections";
export type NotificationClassification = Readonly<{
  category: "connections" | "teams" | "other";
  label: string;
  tone: TapeTone;
}>;

/**
 * Notifications have no structured event type in the installed schema.
 * Match producer event phrases, not incidental words in a pitch or team name.
 * Connection events take precedence over team wording in their optional pitch.
 */
export function classifyNotification(message: string): NotificationClassification {
  const text = message.trim().replace(/\s+/g, " ");
  // These producer preambles precede an arbitrary team name, which can itself
  // contain connection/invitation words. A connection pitch follows its event.
  if (/^you have been invited to join\b/i.test(text)) {
    return { category: "teams", label: "Invite", tone: "accent" };
  }
  if (/^(?:you joined|new join request for|your team request was accepted|you have been promoted to owner of team)\b/i.test(text)) {
    return { category: "teams", label: "Team", tone: "ok" };
  }
  if (/\b(?:sent you a connection request|you have a new connection request|accepted your connection request|(?:your )?connection request (?:was )?accepted)\b/i.test(text)) {
    return { category: "connections", label: "Connection", tone: "info" };
  }
  if (/\b(?:invited (?:you )?to join|team invit(?:e|ation)|invite to join)\b/i.test(text)) {
    return { category: "teams", label: "Invite", tone: "accent" };
  }
  if (/\b(?:join request|team request|you joined|joined (?:your |the |a )?team|(?:added to|removed from) (?:your |the |a )?team|promoted to owner of team|team membership (?:updated|changed))\b/i.test(text)
    || /\b(?:commented on task|assigned you to task|moved your task|updated your task)\b.*\bin team\b/i.test(text)) {
    return { category: "teams", label: "Team", tone: "ok" };
  }
  if (/\b(?:hackathon|hack|deadline)\b/i.test(text)) {
    return { category: "other", label: "Hackathon", tone: "hack" };
  }
  if (/\b(?:mentioned|message)\b/i.test(text)) {
    return { category: "other", label: "Mention", tone: "proj" };
  }
  return { category: "other", label: "Activity", tone: "neutral" };
}

export function matchesNotificationFilter(
  filter: NotificationFilter,
  isRead: boolean | null,
  classification: NotificationClassification,
): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return !isRead;
  return classification.category === filter;
}
