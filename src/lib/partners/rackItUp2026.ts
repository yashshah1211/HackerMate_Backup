import type { PublicEvent } from "./config";

/** Founder-confirmed public facts only. No database identity or organizer artwork. */
export const RACK_IT_UP_2026 = {
  slug: "rack-it-up-2026",
  name: "Rack It Up 2026",
  organizer: "Rack'Em / Karma Enterprises",
  introduction: "Find teammates for Rack It Up 2026. Free and open to developers and students across India, with teams of 1–4 and solo participants welcome.",
  registrationUrl: "https://unstop.com/hackathons/rack-it-up-2026-48-hour-online-hackathon-by-rackem-karma-enterprises-1777639",
  website: "https://rackitup.karmaenterprises.tech",
} as const;

export const RACK_IT_UP_FACTS: readonly { label: string; value: string; dateTime?: string }[] = [
  { label: "Hackathon", value: "11–13 December 2026" },
  { label: "Finals", value: "14 December 2026", dateTime: "2026-12-14" },
  { label: "Results", value: "15 December 2026", dateTime: "2026-12-15" },
  { label: "Registration opens", value: "30 October 2026", dateTime: "2026-10-30" },
  { label: "Registration closes", value: "9 December 2026, 11:59 PM IST", dateTime: "2026-12-09T23:59:00+05:30" },
  { label: "Team size", value: "1–4 people · solo welcome" },
  { label: "Entry", value: "Free" },
  { label: "Who can join", value: "Developers and students across India" },
];

/** A configured UUID alone does not prove that discovery belongs to this event. */
export function isRackItUpEvent(event: PublicEvent | null): boolean {
  if (!event?.isExternal || !event.registrationUrl) return false;
  try {
    const actual = new URL(event.registrationUrl);
    const official = new URL(RACK_IT_UP_2026.registrationUrl);
    return actual.protocol === "https:" && !actual.username && !actual.password
      && !actual.port && [official.hostname, `www.${official.hostname}`].includes(actual.hostname)
      && actual.pathname.replace(/\/$/, "") === official.pathname;
  } catch { return false; }
}
