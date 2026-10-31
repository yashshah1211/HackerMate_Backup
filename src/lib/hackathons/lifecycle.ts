export type EventDates = { start_date?: string | null; end_date?: string | null };
export type RegistrationDates = EventDates & { registration_start?: string | null; registration_end?: string | null; registration_status?: string | null };
export type EventState = "upcoming" | "ongoing" | "ended" | "unknown";
export type RegistrationState = "open" | "closed" | "not-yet-open" | "unknown";

/** Explicit registration evidence only: event timing never proves applications are open. */
export function registrationState(event: RegistrationDates, now: number): RegistrationState {
  const status = event.registration_status?.trim().toLowerCase();
  if (["closed", "finished", "cancelled"].includes(status || "")) return "closed";
  const start = eventDate(event.registration_start), end = eventDate(event.registration_end, true);
  if (end !== null && now >= end) return "closed";
  if ((event.registration_start && start === null) || (event.registration_end && end === null)
    || (start !== null && end !== null && start >= end)) return "unknown";
  if (start !== null && now < start) return "not-yet-open";
  if ((start !== null && end !== null) || status === "open") return "open";
  return "unknown";
}

/** Unknown permits deliberate review; confirmed restrictions always win. */
export function nativeRegistrationRestriction(event: RegistrationDates, now: number): string | null {
  const eventEnd = eventDate(event.end_date, true);
  if (eventEnd !== null && now >= eventEnd) return "The listed event end has passed. New registration is closed.";
  if (eventDate(event.registration_end, true) !== null && now >= eventDate(event.registration_end, true)!) return "The listed registration deadline has passed.";
  if (eventDate(event.registration_start) !== null && now < eventDate(event.registration_start)!) return "Registration has not opened yet.";
  if (registrationState(event, now) === "closed") return "Registration is closed.";
  return null;
}

export function registrationLabel(event: RegistrationDates, now: number): string {
  const state = registrationState(event, now);
  return { open: "Registration open", closed: "Registration closed", "not-yet-open": "Registration not yet open", unknown: "Registration availability unverified" }[state];
}

export function dateLabel(value?: string | null): string {
  const time = eventDate(value);
  if (time === null) return "Not listed";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric",
    ...(value?.length === 10 ? {} : { hour: "numeric", minute: "2-digit", timeZoneName: "short" as const }) }).format(time);
}
/** Calendar-only dates cover the full day in India; timestamps retain their explicit timezone. */
export function eventDate(value: string | null | undefined, endOfDay = false): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const day = value.slice(0, 10), check = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== day) return null;
  if (value.length === 10) return Date.parse(`${day}T00:00:00+05:30`) + (endOfDay ? 86400000 : 0);
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
export function eventState(event: EventDates, now: number): EventState {
  const start = eventDate(event.start_date), end = eventDate(event.end_date, true);
  if ((event.start_date && start === null) || (event.end_date && end === null) || (start !== null && end !== null && end <= start)) return "unknown";
  if (end !== null && now >= end) return "ended";
  if (start !== null && now < start) return "upcoming";
  if (start !== null && end !== null) return "ongoing";
  return "unknown";
}
