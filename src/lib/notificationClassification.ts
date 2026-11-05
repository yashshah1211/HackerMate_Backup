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
  if (/^(?:you have a new connection request|(?:your )?connection request (?:was )?accepted)(?::.*)?[.!]?$/i.test(text)) {
    return { category: "connections", label: "Connection", tone: "info" };
  }
  // The first producer action belongs to the outer event. Do not let a title
  // impersonate a connection, or a connection pitch impersonate a task event.
  const actorEvent = /^(.+?) (sent you a connection request|accepted your connection request|assigned you to task|commented on task|moved your task|updated your task)(.*)$/i.exec(text);
  if (actorEvent) {
    const action = actorEvent[2].toLowerCase();
    const body = actorEvent[3];
    if ((action === "sent you a connection request" || action === "accepted your connection request") && /^(?::.*)?$/.test(body)) {
      return { category: "connections", label: "Connection", tone: "info" };
    }
    if (((action === "assigned you to task" || action === "commented on task") && /^ ".*" in team ".*"$/.test(body))
      || (action === "moved your task" && /^ ".*" to "[^"]*" in team ".*"$/.test(body))
      || (action === "updated your task" && /^ ".*" status to "[^"]*" in team ".*"$/.test(body))) {
      return { category: "teams", label: "Team", tone: "ok" };
    }
    // Incomplete/quoted action text is not a verified producer envelope.
    return { category: "other", label: "Activity", tone: "neutral" };
  }
  if (/\b(?:invited (?:you )?to join|team invit(?:e|ation)|invite to join)\b/i.test(text)) {
    return { category: "teams", label: "Invite", tone: "accent" };
  }
  if (/\b(?:join request|team request|you joined|joined (?:your |the |a )?team|(?:added to|removed from) (?:your |the |a )?team|promoted to owner of team|team membership (?:updated|changed))\b/i.test(text)) {
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
