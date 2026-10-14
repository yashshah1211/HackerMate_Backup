/** Public discovery tabs only; organizer tools are never selected from a query. */
export const EVENT_DISCOVERY_TABS = ["teams", "builders", "looking_for_teams", "looking_for_builders"] as const;
export type EventDiscoveryTab = typeof EVENT_DISCOVERY_TABS[number];

function isDiscoveryTab(value: unknown): value is EventDiscoveryTab {
  return typeof value === "string" && EVENT_DISCOVERY_TABS.some(tab => tab === value);
}

/** Missing, unsupported or ambiguous tab parameters retain the existing default. */
export function eventDiscoveryTab(values: readonly string[]): EventDiscoveryTab {
  return values.length === 1 && isDiscoveryTab(values[0]) ? values[0] : "teams";
}

/** Only link to a resolved event ID; never guess an event from a partner slug. */
export function eventDiscoveryHref(eventId: unknown, tab: unknown = "looking_for_teams"): string | null {
  if (typeof eventId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(eventId)
    || !isDiscoveryTab(tab)) return null;
  return `/hackathons/${eventId}?tab=${tab}`;
}
