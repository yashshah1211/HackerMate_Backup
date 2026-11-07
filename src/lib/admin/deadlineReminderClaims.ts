import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eventDate } from "@/lib/hackathons/sourceEvidence";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isReminderUuid = (value: unknown): value is string => typeof value === "string" && uuid.test(value);

/** Normalize Postgres timestamptz offsets without losing its sub-millisecond precision. */
export function normalizeReminderDeadline(value: unknown): string | null {
  if (typeof value !== "string" || !value.includes("T")) return null;
  const time = eventDate(value);
  if (time === null) return null;
  const fraction = value.match(/\.(\d{1,6})(?:Z|[+-]\d{2}:?\d{2})$/i)?.[1] ?? "";
  return new Date(time).toISOString().slice(0, -5) + "." + fraction.padEnd(6, "0") + "Z";
}

export function reminderIdentity(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const { saved_id, user_id, hackathon_id } = row;
  const deadline = normalizeReminderDeadline(row.registration_end);
  if (!isReminderUuid(saved_id) || !isReminderUuid(user_id) || !isReminderUuid(hackathon_id) || !deadline) return null;
  const savedId = saved_id.toLowerCase();
  const userId = user_id.toLowerCase();
  const hackathonId = hackathon_id.toLowerCase();
  // A new bookmark row for the same builder and deadline is the same reminder.
  const digest = createHash("sha256").update(JSON.stringify([userId, hackathonId, deadline])).digest("hex");
  return { savedId, userId, hackathonId, deadline, digest };
}

export type ReminderIdentity = NonNullable<ReturnType<typeof reminderIdentity>>;

type ReminderOutcome = {
  status: "accepted" | "rejected" | "unknown" | "suppressed" | "not_dispatched";
  providerId?: string;
  providerStatus?: number;
  category?: "eligibility_changed" | "eligibility_unavailable" | "provider_configuration" |
    "provider_rejection" | "ambiguous_provider" | "sandbox";
};
type State = { status: "claimed" } | { status: "dispatching"; payloadHash: string } | ReminderOutcome;
type Evidence = State & { attemptId: string; deadline: string; createdAt: string; updatedAt: string; payloadHash?: string };
type Claim = { key: string; value: string; evidence: Evidence };

export function logReminderError(message: string, error?: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  console.error(message, typeof code === "string" && /^(?:[A-Z0-9]{5}|PGRST[0-9]{3})$/.test(code) ? code : "unavailable");
}

function matchingReceipt(data: unknown, key: string, value: string): boolean {
  if (!Array.isArray(data) || data.length !== 1) return false;
  const row: unknown = data[0];
  return Boolean(row && typeof row === "object" && "key" in row && "value" in row && row.key === key && row.value === value);
}

export async function claimDeadlineReminder(db: SupabaseClient, reminder: ReminderIdentity): Promise<
  { status: "acquired"; claim: Claim } | { status: "duplicate" } | { status: "unavailable" }
> {
  const now = new Date().toISOString();
  const key = "cron:deadline-reminder:v1:" + reminder.digest;
  const evidence: Evidence = { status: "claimed", attemptId: randomUUID(), deadline: reminder.deadline, createdAt: now, updatedAt: now };
  const value = JSON.stringify(evidence);
  try {
    const { data, error } = await db.from("app_settings").insert({ key, value })
      .select("key,value").abortSignal(AbortSignal.timeout(10_000));
    if (error?.code === "23505") return { status: "duplicate" };
    if (!error && matchingReceipt(data, key, value)) return { status: "acquired", claim: { key, value, evidence } };
    logReminderError("[Deadline reminders] Claim receipt unavailable", error);
  } catch (error) {
    logReminderError("[Deadline reminders] Claim write failed", error);
  }
  return { status: "unavailable" };
}

/** Use the full previous value as a compare-and-swap predicate, including the random owner. */
export async function transitionDeadlineReminder(db: SupabaseClient, claim: Claim, next: Exclude<State, { status: "claimed" }>): Promise<Claim | null> {
  const expected = next.status === "dispatching" ? ["claimed"]
    : next.status === "suppressed" ? ["claimed", "dispatching"] : ["dispatching"];
  if (!expected.includes(claim.evidence.status)) return null;
  const evidence: Evidence = { ...claim.evidence, ...next, updatedAt: new Date().toISOString() };
  const value = JSON.stringify(evidence);
  try {
    const { data, error } = await db.from("app_settings").update({ value })
      .eq("key", claim.key).eq("value", claim.value).select("key,value").abortSignal(AbortSignal.timeout(10_000));
    if (!error && matchingReceipt(data, claim.key, value)) return { key: claim.key, value, evidence };
    logReminderError("[Deadline reminders] Outcome receipt unavailable", error);
  } catch (error) {
    logReminderError("[Deadline reminders] Outcome write failed", error);
  }
  return null;
}
