import "server-only";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedProfile } from "@/lib/admin/requireAdmin";
import { requirePartnerAccess } from "./requirePartnerAccess";
import { calendarDate, normalizePartnerConfig, publicText, record } from "./config";

export type WorkspaceIdentity = {
  slug: string; partnerName: string; eventId: string; eventName: string;
  startDate: string | null; endDate: string | null; location: string | null; mode: string | null;
  minTeamSize: number | null; maxTeamSize: number | null; archived: boolean; approvalStatus: string | null; externalRegistration: boolean;
};
export type WorkspaceResolution = { kind: "authorized"; identity: WorkspaceIdentity }
  | { kind: "unauthenticated" | "denied" | "missing" | "unavailable" | "unconfigured" };
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const validSlug = (value: string) => value.length <= 100 && SLUG.test(value);

/** Adapt Next's server cookie store to the existing authoritative access helper. */
export async function organizerPageRequest(path: string): Promise<NextRequest> {
  const request = new NextRequest(new URL(path, "https://hackermate.in"));
  for (const cookie of (await cookies()).getAll()) request.cookies.set(cookie.name, cookie.value);
  return request;
}

function accessState(response: NextResponse): WorkspaceResolution {
  return { kind: response.status === 401 ? "unauthenticated" : response.status === 403 ? "denied"
    : response.status === 404 ? "missing" : "unavailable" };
}

export async function resolveOrganizerWorkspace(request: NextRequest, slug: string): Promise<WorkspaceResolution> {
  try {
    // Identity precedes even configuration/setup states on this private route.
    const verified = await requireVerifiedProfile(request, { unauthenticatedStatus: 401, lookupFailureStatus: 500 });
    if (verified instanceof NextResponse) return accessState(verified);
    if (!validSlug(slug)) return { kind: "missing" };
    const { data: partner, error } = await verified.supabaseUserClient.from("partner_configs")
      .select("id, slug, hackathon_id, partner_name, features").eq("slug", slug).maybeSingle();
    if (error) { console.error("[partner workspace] Configuration lookup failed:", error); return { kind: "unavailable" }; }
    if (!partner) return { kind: "missing" };
    if (typeof partner.hackathon_id !== "string" || !UUID.test(partner.hackathon_id)) return { kind: "unconfigured" };
    const access = await requirePartnerAccess(request, { partnerSlug: slug }, { detailedErrors: true });
    if (access instanceof NextResponse) return access.status === 404 ? { kind: "unconfigured" } : accessState(access);
    // A configuration edit during resolution cannot switch this authorized scope.
    if (access.hackathonId !== partner.hackathon_id.toLowerCase() || access.partnerId !== partner.id) return { kind: "unavailable" };
    const config = normalizePartnerConfig(partner);
    if (config.portalVersion !== "organizer-v1") return { kind: "unconfigured" };
    const eventResult = await access.supabaseUserClient.from("hackathons")
      .select("id, name, start_date, end_date, location, mode, min_team_size, max_team_size, archived, status, type")
      .eq("id", access.hackathonId).maybeSingle();
    if (eventResult.error) { console.error("[partner workspace] Event lookup failed:", eventResult.error); return { kind: "unavailable" }; }
    if (!eventResult.data || eventResult.data.id !== access.hackathonId) return { kind: "unconfigured" };
    const event = record(eventResult.data);
    const limit = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
    let min = limit(event.min_team_size), max = limit(event.max_team_size);
    if (min !== null && max !== null && min > max) { min = null; max = null; }
    const start = calendarDate(event.start_date), end = calendarDate(event.end_date);
    return { kind: "authorized", identity: {
      slug, partnerName: config.name, eventId: access.hackathonId, eventName: publicText(event.name) || config.name,
      startDate: start, endDate: end && (!start || end >= start) ? end : null,
      location: publicText(event.location), mode: ["online", "offline", "hybrid"].includes(String(event.mode)) ? String(event.mode) : null,
      minTeamSize: min, maxTeamSize: max, archived: event.archived === true,
      externalRegistration: event.type === "external" || event.type == null,
      approvalStatus: ["approved", "pending", "rejected"].includes(String(event.status)) ? String(event.status) : null,
    } };
  } catch (error) {
    console.error("[partner workspace] Resolution failed:", error);
    return { kind: "unavailable" };
  }
}

/** A single valid V1 association plus fresh event authority is required to redirect. */
export async function legacyOrganizerDestination(request: NextRequest, eventId: string): Promise<string | null> {
  if (!UUID.test(eventId)) return null;
  try {
    const verified = await requireVerifiedProfile(request, { unauthenticatedStatus: 401, lookupFailureStatus: 500 });
    if (verified instanceof NextResponse) return null;
    const { data, error } = await verified.supabaseUserClient.from("partner_configs")
      .select("slug, features").eq("hackathon_id", eventId).limit(2);
    if (error) { console.error("[partner workspace] Legacy association lookup failed:", error); return null; }
    // Multiple associations are ambiguous; do not borrow another partner's identity.
    if (!Array.isArray(data) || data.length !== 1) return null;
    const config = normalizePartnerConfig(data[0]);
    if (config.portalVersion !== "organizer-v1" || !validSlug(config.slug)) return null;
    const access = await requirePartnerAccess(request, { partnerSlug: config.slug }, { detailedErrors: true });
    if (access instanceof NextResponse || access.hackathonId !== eventId.toLowerCase()) return null;
    return `/partners/${config.slug}/organizer`;
  } catch (error) {
    console.error("[partner workspace] Legacy route resolution failed:", error);
    return null;
  }
}
