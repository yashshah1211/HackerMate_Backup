/** Reviewed presentation facts. Never derive the schedule from the stale event row. */
export const HUSTLE_CARNIVAL = {
  eventId: "0da43cba-90dc-449c-a126-a2fc8be8a379",
  registrationUrl: "https://unstop.com/hackathons/hustle-carnival-gl-bajaj-group-of-institutions-1763514",
  whatsappUrl: "https://chat.whatsapp.com/KRNR8A2WrXi7CFsAWQ1TeH?s=cl&p=a&mlu=4&ilr=4",
  contactEmail: "ellusion@glbajajgroup.org",
  assetRoot: "/partners/hustle-carnival",
} as const;

export type HustleCommunityState = "ready" | "metadata-pending" | "unavailable";

/** Fail closed for participation links; this is a readiness check, never a write. */
export function hustleCommunityState(value: unknown): HustleCommunityState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "unavailable";
  const row = value as Record<string, unknown>;
  if (row.id !== HUSTLE_CARNIVAL.eventId || row.status !== "approved" || row.archived !== false
    || row.type !== "external") return "unavailable";
  if (row.mode !== "hybrid" || row.start_date !== "2026-10-22" || row.end_date !== "2026-10-24"
    || row.min_team_size !== 1 || row.max_team_size !== 2
    || row.website_url !== HUSTLE_CARNIVAL.registrationUrl
    || typeof row.location !== "string" || !/\bmathura\b/i.test(row.location)
    || !/\bbajaj\b/i.test(row.location)) return "metadata-pending";
  return "ready";
}
