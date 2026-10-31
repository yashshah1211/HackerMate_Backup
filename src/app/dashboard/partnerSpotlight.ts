import { calendarDate, safeImageUrl } from "@/lib/partners/config";
import { RACK_IT_UP_2026, RACK_IT_UP_FACTS } from "@/lib/partners/rackItUp2026";

/** Only fields already returned by the dashboard's authenticated partner read. */
export type PartnerEvent = { slug: string; name: string; logoUrl: string | null; eventName: string | null; endDate: string | null };

const rackFinal = RACK_IT_UP_FACTS.find(fact => fact.label === "Finals")?.dateTime ?? null;

/** Earliest known end first, undated last, slug ties. No inferred publication state.
 * Rack's verified final date supplies expiry only when its linked end is missing.
 * Unknown dates remain unknown, never a claim that an event is ongoing.
 */
export function selectPartnerEvents(events: readonly PartnerEvent[], today: string): PartnerEvent[] {
  if (!calendarDate(today)) return [];
  const selected = events
    .filter(event => typeof event.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.slug) && event.slug.length <= 100)
    .map(event => ({ ...event,
      endDate: calendarDate(event.endDate) ?? (event.slug === RACK_IT_UP_2026.slug ? calendarDate(rackFinal) : null),
      logoUrl: safeImageUrl(event.logoUrl),
    }))
    .filter(event => !event.endDate || event.endDate >= today)
    .sort((a, b) => {
      const endA = a.endDate ?? "9999-12-31", endB = b.endDate ?? "9999-12-31";
      return endA < endB ? -1 : endA > endB ? 1 : a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  return selected.filter((event, index) => selected.findIndex(other => other.slug === event.slug) === index).slice(0, 3);
}

export function partnerSpotlightContent(event: PartnerEvent) {
  const rack = event.slug === RACK_IT_UP_2026.slug;
  const title = rack ? RACK_IT_UP_2026.name : event.eventName?.trim() || event.name?.trim() || "Partner event";
  const end = calendarDate(event.endDate);
  const date = end ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${end}T00:00:00Z`)) : null;
  return {
    title,
    credit: rack ? `Organised by ${RACK_IT_UP_2026.organizer}` : event.name?.trim() || "Partner event",
    dates: rack ? `${RACK_IT_UP_FACTS.find(fact => fact.label === "Hackathon")!.value} · Finals 14 December` : date ? `Ends ${date}` : "Dates to be confirmed",
    description: rack ? RACK_IT_UP_2026.introduction.replace(`Find teammates for ${RACK_IT_UP_2026.name}. `, "") : null,
    logo: rack ? "/partners/rack-it-up-2026/RackItUp-mark.png" : safeImageUrl(event.logoUrl),
    rack,
  };
}
