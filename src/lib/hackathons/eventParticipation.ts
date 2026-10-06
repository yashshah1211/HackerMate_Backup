import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/types/supabase";

export type DiscoveryBuilder = {
  id: string;
  full_name: string;
  college: string | null;
  avatar_url: string | null;
  skills: string[];
};
export type DiscoveryPage = { items: DiscoveryBuilder[]; total: number; offset: number; limit: number };
export type RegistrationCounts = { registration_count: number; confirmed_count: number; waitlisted_count: number };
export type OwnRegistration = {
  id: string; user_id: string; team_id: string | null; status: string;
  looking_for_team: boolean; metadata: Json | null;
};
export type OwnParticipation = { userId: string | null; registration: OwnRegistration | null };

export class EventReadError extends Error {
  constructor(public readonly kind: "unauthorized" | "unavailable", message: string) {
    super(message);
  }
}
function failure(error: { code?: string } | null, message: string): never {
  throw new EventReadError(error?.code === "42501" ? "unauthorized" : "unavailable",
    error?.code === "42501" ? "This event data is not available to your session." : message);
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function nullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** Visibility is exclusively defined by the SQL RPC. No raw-read fallback. */
export async function loadEventDiscovery(client: SupabaseClient, eventId: string, offset = 0): Promise<DiscoveryPage> {
  const { data, error } = await client.rpc("list_event_discovery_builders", {
    p_hackathon_id: eventId, p_offset: offset, p_limit: 50,
  });
  if (error) failure(error, "Builder discovery is unavailable. Please retry.");
  if (!object(data) || !count(data.total) || data.offset !== offset || data.limit !== 50 || !Array.isArray(data.items)
    || data.items.length !== Math.min(50, Math.max(0, data.total - offset))) {
    failure(null, "Builder discovery returned an invalid result. Please retry.");
  }
  const items = data.items.map((item: unknown): DiscoveryBuilder => {
    if (!object(item) || typeof item.user_id !== "string" || !nullableText(item.full_name)
      || !nullableText(item.college) || !nullableText(item.avatar_url)
      || !Array.isArray(item.skills) || !item.skills.every((skill: unknown) => typeof skill === "string")) {
      failure(null, "Builder discovery returned an invalid result. Please retry.");
    }
    // Explicit mapping also excludes unexpected fields from component state.
    return { id: item.user_id, full_name: item.full_name || "Builder", college: item.college,
      avatar_url: item.avatar_url, skills: item.skills };
  });
  return { items, total: data.total, offset, limit: 50 };
}

export async function loadEventRegistrationCounts(client: SupabaseClient, eventId: string): Promise<RegistrationCounts> {
  const { data, error } = await client.rpc("get_hackathon_registration_counts", { p_hackathon_id: eventId });
  if (error) failure(error, "Participation counts are unavailable. Please retry.");
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!object(row) || !count(row.registration_count) || !count(row.confirmed_count) || !count(row.waitlisted_count)
    || row.confirmed_count + row.waitlisted_count > row.registration_count) {
    failure(null, "Participation counts returned an invalid result. Please retry.");
  }
  return { registration_count: row.registration_count, confirmed_count: row.confirmed_count, waitlisted_count: row.waitlisted_count };
}

const OWN_COLUMNS = "id, user_id, team_id, status, looking_for_team, metadata";
function ownRow(data: unknown, userId: string): OwnRegistration | null {
  if (data === null) return null;
  if (!object(data) || typeof data.id !== "string" || data.user_id !== userId
    || !nullableText(data.team_id) || typeof data.status !== "string" || typeof data.looking_for_team !== "boolean") {
    failure(null, "Your participation state is unavailable. Please retry.");
  }
  return { id: data.id, user_id: userId, team_id: data.team_id, status: data.status,
    looking_for_team: data.looking_for_team, metadata: (data.metadata ?? null) as Json | null };
}

/** No caller-supplied identity: getUser binds every raw query to the session. */
export async function loadOwnEventParticipation(client: SupabaseClient, eventId: string): Promise<OwnParticipation> {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError && (authError.name !== "AuthSessionMissingError" || auth.user)) failure(authError, "Unable to verify your session. Please retry.");
  if (!auth.user) return { userId: null, registration: null };
  const { data, error } = await client.from("hackathon_registrations").select(OWN_COLUMNS)
    .eq("hackathon_id", eventId).eq("user_id", auth.user.id).maybeSingle();
  if (error) failure(error, "Your participation state is unavailable. Please retry.");
  return { userId: auth.user.id, registration: ownRow(data, auth.user.id) };
}

/** Discovery off never deletes participation; existing status/team are preserved. */
export async function setOwnDiscoveryPreference(
  client: SupabaseClient, eventId: string, enabled: boolean,
  options: { allowCreate: boolean; maxParticipants?: number | null; metadataPatch?: Record<string, Json> }
): Promise<OwnParticipation> {
  const own = await loadOwnEventParticipation(client, eventId);
  if (!own.userId) failure({ code: "42501" }, "Please sign in to change discovery preferences.");
  const userId = own.userId;
  async function update(registration: OwnRegistration) {
    const payload: { looking_for_team: boolean; metadata?: Json } = { looking_for_team: enabled };
    if (options.metadataPatch) {
      if (registration.metadata !== null && !object(registration.metadata)) {
        failure(null, "Unable to preserve your participation details. Please retry.");
      }
      payload.metadata = { ...(registration.metadata || {}), ...options.metadataPatch };
    }
    const { data, error } = await client.from("hackathon_registrations").update(payload)
      .eq("hackathon_id", eventId).eq("user_id", userId).select(OWN_COLUMNS).maybeSingle();
    if (error) failure(error, "Unable to update your discovery preference. Please retry.");
    const saved = ownRow(data, userId);
    if (!saved) failure(null, "Your participation changed. Please retry.");
    return { userId, registration: saved };
  }
  if (own.registration) return update(own.registration);
  if (!enabled) return own; // Idempotent off, including an absent registration.
  if (!options.allowCreate) failure(null, "Join this event before listing your profile.");
  let status = "confirmed";
  if (options.maxParticipants !== null && options.maxParticipants !== undefined) {
    const totals = await loadEventRegistrationCounts(client, eventId);
    if (totals.confirmed_count >= options.maxParticipants) status = "waitlisted";
  }
  const { data, error } = await client.from("hackathon_registrations").insert({
    hackathon_id: eventId, user_id: userId, looking_for_team: true,
    status, ...(options.metadataPatch ? { metadata: options.metadataPatch } : {}),
  }).select(OWN_COLUMNS).maybeSingle();
  if (error?.code === "23505") {
    // Another request may have joined meanwhile. Re-read own state once; never
    // upsert over its status/team/metadata or retry an insertion indefinitely.
    const concurrent = await loadOwnEventParticipation(client, eventId);
    if (concurrent.userId !== userId || !concurrent.registration) failure(error, "Your participation changed. Please retry.");
    return update(concurrent.registration);
  }
  if (error) failure(error, "Unable to join the event community. Please retry.");
  const saved = ownRow(data, userId);
  if (!saved) failure(null, "Unable to verify your saved preference. Please retry.");
  return { userId, registration: saved };
}
