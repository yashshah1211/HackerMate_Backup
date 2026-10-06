import "server-only";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePartnerConfig, record, safeExternalUrl, safeImageUrl } from "@/lib/partners/config";
import type { ManagedPartner, PartnerConfigFields } from "@/lib/partners/adminTypes";

export const CONFIG_COLUMNS = "id, slug, hackathon_id, partner_name, tagline, logo_url, banner_url, brand_color, accent_color, features, updated_at";
export const EVENT_COLUMNS = "id, name, type, archived, start_date, end_date, mode, location, min_team_size, max_team_size";
export const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export class PartnerAdminError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function reply(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
export function privateDenial(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
export function failure(error: unknown) {
  if (error instanceof PartnerAdminError) return reply({ error: error.message }, error.status);
  console.error("[admin/partners] Request failed:", error);
  return reply({ error: "Partner management is temporarily unavailable." }, 500);
}
export function dbFailure(error: unknown, message: string): never {
  console.error("[admin/partners] Database operation failed:", error);
  throw new PartnerAdminError(500, message);
}
export function accountId(value: unknown, label = "Event"): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new PartnerAdminError(400, `${label} ID must be a UUID.`);
  return value.toLowerCase();
}
export function allowKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PartnerAdminError(400, "A JSON object is required.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !keys.includes(key))) throw new PartnerAdminError(400, "Unknown fields are not allowed.");
  return body;
}
export async function readBody(req: NextRequest, keys: readonly string[]) {
  if (Number(req.headers.get("Content-Length")) > 32_768) throw new PartnerAdminError(413, "Request is too large.");
  const raw = await req.text();
  if (raw.length > 32_768) throw new PartnerAdminError(413, "Request is too large.");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new PartnerAdminError(400, "Invalid JSON body."); }
  return allowKeys(value, keys);
}
export function query(req: NextRequest, keys: readonly string[]) {
  const params = req.nextUrl.searchParams;
  if ([...params.keys()].some(key => !keys.includes(key) || params.getAll(key).length !== 1)) throw new PartnerAdminError(400, "Invalid query parameters.");
  return params;
}
export async function existingEvent(client: SupabaseClient, eventId: string) {
  const { data, error } = await client.from("hackathons").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle();
  if (error) dbFailure(error, "Unable to verify the event.");
  if (!data || data.id !== eventId) throw new PartnerAdminError(404, "Event not found.");
  return data;
}
/** Avoid PostgREST's default row cap hiding an existing event or partner. */
export async function configurationRows(client: SupabaseClient, table: "partner_configs" | "hackathons") {
  const rows: Record<string, unknown>[] = [], ids = new Set<string>();
  for (let offset = 0; offset <= 10_000; offset += 500) {
    const read = table === "partner_configs" ? client.from("partner_configs").select(CONFIG_COLUMNS) : client.from("hackathons").select(EVENT_COLUMNS);
    const page = await read.order("id").range(offset, offset + 499);
    if (page.error) dbFailure(page.error, "Unable to load partner configuration or existing events.");
    for (const row of page.data || []) {
      const key = String(row.id);
      if (ids.has(key)) throw new PartnerAdminError(409, "The configuration list changed. Please reload.");
      ids.add(key); rows.push(row);
    }
    if (rows.length > 10_000) throw new PartnerAdminError(413, "The configuration list exceeds the management limit.");
    if ((page.data || []).length < 500) return rows;
  }
  throw new PartnerAdminError(413, "The configuration list exceeds the management limit.");
}

const fieldNames = ["slug", "partner_name", "hackathon_id", "tagline", "logo_url", "banner_url", "accent_color",
  "portal_version", "official_website", "public_contact", "approved_links", "registration_mode"] as const;
function boundedText(value: unknown, limit: number, required = false): string | null {
  if (value === null && !required) return null;
  if (typeof value !== "string" || value.trim().length > limit || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new PartnerAdminError(400, "Invalid public text field.");
  }
  return value.trim() || null;
}
function url(value: unknown, image = false): string | null {
  if (value === null) return null;
  const safe = image ? safeImageUrl(value) : safeExternalUrl(value);
  if (!safe) throw new PartnerAdminError(400, "URLs must use safe HTTP/HTTPS or supported local image paths.");
  return safe;
}
function publicLink(value: unknown) {
  const item = allowKeys(value, ["label", "url"]);
  const linkUrl = url(item.url);
  if (!linkUrl) throw new PartnerAdminError(400, "A public link URL is required.");
  return { label: boundedText(item.label, 80, true)!, url: linkUrl };
}
export function configPatch(value: unknown, creating = false): Partial<PartnerConfigFields> {
  const body = allowKeys(value, fieldNames);
  if (!Object.keys(body).length) throw new PartnerAdminError(400, "At least one configuration field is required.");
  if (creating && ["slug", "partner_name", "hackathon_id"].some(key => !(key in body))) throw new PartnerAdminError(400, "Name, slug and an existing event are required.");
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "slug") {
      if (typeof value !== "string" || value.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new PartnerAdminError(400, "Slug must use lowercase letters, numbers and single hyphens.");
      patch[key] = value;
    } else if (key === "hackathon_id") patch[key] = accountId(value);
    else if (key === "partner_name" || key === "tagline") patch[key] = boundedText(value, key === "tagline" ? 360 : 200, key === "partner_name");
    else if (["logo_url", "banner_url", "official_website"].includes(key)) patch[key] = url(value, key !== "official_website");
    else if (key === "accent_color") {
      if (value !== null && (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))) throw new PartnerAdminError(400, "Accent must be a six-digit hex color or null.");
      patch[key] = value;
    } else if (key === "portal_version") {
      if (value !== "legacy" && value !== "organizer-v1") throw new PartnerAdminError(400, "Unknown portal version.");
      patch[key] = value;
    } else if (key === "registration_mode") {
      if (value !== null && value !== "external" && value !== "native") throw new PartnerAdminError(400, "Unknown registration mode.");
      patch[key] = value;
    } else if (key === "public_contact") patch[key] = value === null ? null : publicLink(value);
    else if (key === "approved_links") {
      if (!Array.isArray(value) || value.length > 8) throw new PartnerAdminError(400, "At most eight approved public links are allowed.");
      patch[key] = value.map(publicLink);
    }
  }
  return patch;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(record(value)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function revision(row: Record<string, unknown>) { return createHash("sha256").update(canonical(row)).digest("hex"); }
export function managedConfig(row: Record<string, unknown>): ManagedPartner {
  const config = normalizePartnerConfig(row);
  return { id: String(row.id), revision: revision(row), slug: config.slug, partner_name: config.name,
    hackathon_id: typeof row.hackathon_id === "string" ? row.hackathon_id : "", tagline: config.tagline,
    logo_url: config.logoUrl, banner_url: config.bannerUrl, accent_color: config.identityColor,
    portal_version: config.portalVersion, official_website: config.officialWebsite, public_contact: config.publicContact,
    approved_links: config.approvedLinks, registration_mode: config.registrationMode };
}
export function configWrite(patch: Partial<PartnerConfigFields>, current: Record<string, unknown> | null) {
  const write: Record<string, unknown> = {};
  const featureKeys = ["portal_version", "official_website", "public_contact", "approved_links", "registration_mode"];
  if (current?.features != null && (typeof current.features !== "object" || Array.isArray(current.features)) && featureKeys.some(key => key in patch)) {
    throw new PartnerAdminError(409, "Stored public features need review before these fields can be changed.");
  }
  const features = { ...record(current?.features) };
  for (const [key, value] of Object.entries(patch)) {
    if (featureKeys.includes(key)) features[key] = value; else write[key] = value;
  }
  if (!current || featureKeys.some(key => key in patch)) write.features = features;
  if (!current) {
    write.brand_color = null; // No inherited partner branding or guessed public copy.
    if (!("accent_color" in write)) write.accent_color = null;
  }
  write.updated_at = new Date().toISOString();
  return write;
}
