import { eventDate, windowState } from "./sourceEvidence";
export { eventDate } from "./sourceEvidence";
import { hasEventScheduleEvidence, sourceMetadata, sourceFresh, synchronizedEvent } from "./source";
export type EventDates = { type?: string | null; source_metadata?: unknown; website_url?: string | null; start_date?: string | null; end_date?: string | null };
export type RegistrationDates = EventDates & { registration_start?: string | null; registration_end?: string | null; registration_status?: string | null };
export type EventState = "upcoming" | "ongoing" | "ended" | "unknown";
export type RegistrationState = "open" | "closed" | "not-yet-open" | "unknown";

/** Explicit registration evidence only: event timing never proves applications are open. */
export function registrationState(event: RegistrationDates, now: number): RegistrationState {
  if (event.type !== "native" && event.source_metadata != null && !sourceFresh(sourceMetadata(event.source_metadata, event.website_url), now)) return "unknown";
  const value = synchronizedEvent(event);
  const status = value.registration_status?.trim().toLowerCase();
  if (["closed", "finished", "cancelled"].includes(status || "")) return "closed";
  const start = eventDate(value.registration_start), end = eventDate(value.registration_end, true);
  if (end !== null && now >= end) return "closed";
  if ((value.registration_start && start === null) || (value.registration_end && end === null)
    || (start !== null && end !== null && start >= end)) return "unknown";
  if (start !== null && now < start) return "not-yet-open";
  if (event.type !== "native" && sourceMetadata(event.source_metadata, event.website_url)?.facts.registration_status === "unknown") return "unknown";
  if ((start !== null && end !== null) || status === "open") return "open";
  return "unknown";
}

export function registrationLabel(event: RegistrationDates, now: number): string {
  const state = registrationState(event, now);
  if (state === "open" && scheduleIsUnverified(event, now)) return "Registration listed as open";
  return { open: "Registration open", closed: "Registration closed", "not-yet-open": "Registration not yet open", unknown: "Registration availability unverified" }[state];
}

export function dateLabel(value?: string | null): string {
  const time = eventDate(value);
  if (time === null) return "Not listed";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric",
    ...(value?.length === 10 ? {} : { hour: "numeric", minute: "2-digit", timeZoneName: "short" as const }) }).format(time);
}
/** Raw listed calendar window: useful for explicit historical browsing, never evidence of provider verification. */
export function listedEventState(event: EventDates, now: number): EventState {
  const start = eventDate(event.start_date), end = eventDate(event.end_date, true);
  if ((event.start_date && start === null) || (event.end_date && end === null) || (start !== null && end !== null && end <= start)) return "unknown";
  if (end !== null && now >= end) return "ended";
  if (start !== null && now < start) return "upcoming";
  if (start !== null && end !== null) return "ongoing";
  return "unknown";
}

/** Native schedules describe events hosted here. Non-native classifications, including official,
 * need protected provider evidence; an official classification alone establishes no freshness or category. */
export function scheduleIsUnverified(event: Pick<EventDates, "type" | "source_metadata" | "website_url">, now = Date.now()): boolean {
  if (event.type === "native") return false;
  const metadata = sourceMetadata(event.source_metadata, event.website_url);
  return !sourceFresh(metadata, now) || !hasEventScheduleEvidence(metadata);
}
export function eventState(event: EventDates, now: number): EventState {
  if (scheduleIsUnverified(event, now)) return "unknown";
  const metadata = sourceMetadata(event.source_metadata, event.website_url);
  if (event.type !== "native" && metadata) return windowState(metadata.facts.start_date, metadata.facts.end_date, now);
  return listedEventState(synchronizedEvent(event), now);
}
export function eventStateLabel(event: EventDates, now: number): string {
  if (scheduleIsUnverified(event, now)) return "Event schedule unverified";
  return { upcoming: "Upcoming", ongoing: "Ongoing", ended: "Ended", unknown: "Dates unclear" }[eventState(event, now)];
}
export function activeOpportunity(event: RegistrationDates, now: number): boolean {
  const metadata = sourceMetadata(event.source_metadata, event.website_url);
  if (event.type !== "native" && (!sourceFresh(metadata, now) || metadata.category !== "hackathon")) return false;
  const state = eventState(event, now);
  return state !== "ended" && (registrationState(event, now) === "open" || state === "ongoing");
}
