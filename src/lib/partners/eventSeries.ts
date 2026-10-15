import { publicText, record, safeExternalUrl } from "./config";

export type Qualifier = { slug: string; state: string; eventId: string };
export type EventSeries = {
  slug: string;
  name: string;
  festival: string;
  institution: string;
  officialHub: string;
  teamSize: string;
  collegeRule: string;
  qualifiers: readonly Qualifier[];
};

/** Reviewed organizer mapping. Add qualifiers here, never infer them from event names. */
export const CRAFTNCODE_SERIES: EventSeries = {
  slug: "craftncode",
  name: "Craft N Code",
  festival: "D³ TechFest 2026",
  institution: "IIIT Bhubaneswar",
  officialHub: "https://unstop.com/college-fests/d3-2026-tech-fest-iiit-bhubaneswar-international-institute-of-information-technology-iiit-bhubaneswar-496201",
  teamSize: "2–4 members per team",
  collegeRule: "Inter-college teams are permitted only when all participating colleges are located within the same qualifier state.",
  qualifiers: [
    { slug: "karnataka", state: "Karnataka", eventId: "48578e2f-0012-4357-b610-d6a4af17f961" },
    { slug: "west-bengal", state: "West Bengal", eventId: "52d447ef-f574-4538-b6c1-2e5d9a2e33d6" },
    { slug: "chhattisgarh", state: "Chhattisgarh", eventId: "7050f4bd-df55-49d0-a399-1c4393a140f7" },
    { slug: "delhi", state: "Delhi", eventId: "bd07369c-ff56-4cff-953b-6d550372f415" },
    { slug: "haryana", state: "Haryana", eventId: "2f8e6f49-fcbf-422d-b572-81be3d0197ea" },
    { slug: "telangana", state: "Telangana", eventId: "7df25627-896f-404b-8fa0-a8925ecc5aa2" },
    { slug: "tamil-nadu", state: "Tamil Nadu", eventId: "5fef2bf8-ceb5-4ec8-b037-4a8a9b41f231" },
  ],
};

export type QualifierEvent = {
  id: string;
  name: string;
  registrationUrl: string | null;
  listedLocation: string | null;
  format: string | null;
};

export function qualifierForState(series: EventSeries, state: string): Qualifier | undefined {
  return series.qualifiers.find(qualifier => qualifier.slug === state);
}

/** Registration comes only from this event's stored HTTPS Unstop hackathon URL. */
export function qualifierRegistrationUrl(value: unknown): string | null {
  const safe = safeExternalUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  return url.protocol === "https:" && !url.port
    && ["unstop.com", "www.unstop.com"].includes(url.hostname)
    && /^\/hackathons\/[^/]+\/?$/.test(url.pathname) ? safe : null;
}

export function normalizeQualifierEvent(value: unknown, qualifier: Qualifier): QualifierEvent | null {
  const row = record(value);
  if (row.id !== qualifier.eventId || row.status !== "approved" || row.archived !== false) return null;
  const location = publicText(row.location);
  const genericLocation = /^(?:venue(?: in india)?|india|tba|tbd|n\/?a|not specified|to be (?:announced|decided)|online|virtual)$/i;
  return {
    id: qualifier.eventId,
    name: publicText(row.name) || `${qualifier.state} qualifier`,
    registrationUrl: qualifierRegistrationUrl(row.website_url),
    listedLocation: location && !genericLocation.test(location) ? location : null,
    format: row.mode === "online" ? "Online" : row.mode === "offline" ? "In person" : row.mode === "hybrid" ? "Hybrid" : null,
  };
}
