/** Public presentation only. Authorization never comes from partner features. */
export type PublicLink = { label: string; url: string };
export type PublicPartnerConfig = {
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  identityColor: string | null;
  portalVersion: "legacy" | "organizer-v1";
  officialWebsite: string | null;
  publicContact: PublicLink | null;
  approvedLinks: PublicLink[];
  registrationMode: "external" | "native" | null;
};
export type PublicEvent = {
  id: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  mode: string | null;
  minTeamSize: number | null;
  maxTeamSize: number | null;
  registrationUrl: string | null;
  isExternal: boolean;
};

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function publicText(value: unknown, maxLength = 200): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

/** No credentials, protocol-relative URLs, control characters or URL backslashes. */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || !/^https?:\/\//i.test(value)
    || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function safeImageUrl(value: unknown): string | null {
  if (typeof value === "string" && /^\/(?!\/)/.test(value)
    && !/[\u0000-\u0020\u007f\\?#]/.test(value) && !/%(?:00|0a|0d|5c)/i.test(value)) return value;
  return safeExternalUrl(value);
}

function link(value: unknown): PublicLink | null {
  const item = record(value);
  const label = publicText(item.label, 80);
  const url = safeExternalUrl(item.url);
  return label && url ? { label, url } : null;
}

export function normalizePartnerConfig(value: unknown): PublicPartnerConfig {
  const row = record(value);
  const features = record(row.features);
  const color = [row.accent_color, row.brand_color].find(value =>
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value));
  return {
    slug: publicText(row.slug, 100) || "",
    name: publicText(row.partner_name) || "Partner event",
    tagline: publicText(row.tagline, 360),
    logoUrl: safeImageUrl(row.logo_url),
    bannerUrl: safeImageUrl(row.banner_url),
    identityColor: typeof color === "string" ? color : null,
    portalVersion: features.portal_version === "organizer-v1" ? "organizer-v1" : "legacy",
    officialWebsite: safeExternalUrl(features.official_website),
    publicContact: link(features.public_contact),
    approvedLinks: Array.isArray(features.approved_links)
      ? features.approved_links.slice(0, 8).map(link).filter((item): item is PublicLink => item !== null) : [],
    registrationMode: features.registration_mode === "external" || features.registration_mode === "native"
      ? features.registration_mode : null,
  };
}

/** Calendar dates are displayed in UTC so a timezone cannot move the event day. */
export function calendarDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  if (value.length > 10 && !Number.isFinite(Date.parse(value))) return null;
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}

export function normalizePublicEvent(value: unknown, config: PublicPartnerConfig): PublicEvent | null {
  const row = record(value);
  // Match the public-event gate used by the existing safe count/discovery RPCs.
  const status = row.status ?? row.approval_status ?? (row.type && row.type !== "native" ? "approved" : null);
  if (row.archived !== false || !(row.type === "external" || row.type == null || status === "approved")
    || typeof row.id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.id)) return null;
  const startDate = calendarDate(row.start_date);
  const end = calendarDate(row.end_date);
  const teamSize = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null;
  let minTeamSize = teamSize(row.min_team_size);
  let maxTeamSize = teamSize(row.max_team_size);
  if (minTeamSize !== null && maxTeamSize !== null && minTeamSize > maxTeamSize) {
    minTeamSize = null;
    maxTeamSize = null;
  }
  return {
    id: row.id,
    name: publicText(row.name) || config.name,
    description: publicText(row.description, 360),
    startDate,
    endDate: end && (!startDate || end >= startDate) ? end : null,
    location: publicText(row.location),
    mode: row.mode === "online" ? "Online" : row.mode === "offline" ? "Offline" : row.mode === "hybrid" ? "Hybrid" : null,
    minTeamSize,
    maxTeamSize,
    registrationUrl: safeExternalUrl(row.website_url),
    isExternal: row.type !== "native" && (config.registrationMode === "external" || row.type === "external" || row.type == null),
  };
}
