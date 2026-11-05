import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { recordEmailBookkeeping, type EmailDispatch } from "@/lib/emailDispatch";

/** Existing app_settings.key primary key makes this reservation first-writer-wins. */
export async function claimNotificationEmail(client: SupabaseClient, notificationId: string) {
  const key = `notification:email:${notificationId.toLowerCase()}`;
  const nonce = randomUUID(), reservedAt = new Date().toISOString();
  const value = JSON.stringify({ status: "reserved", nonce, at: reservedAt });
  try {
    const { error } = await client.from("app_settings").insert({ key, value });
    if (!error) return { status: "reserved" as const, key, value, nonce, reservedAt };
    if (error.code === "23505") return { status: "duplicate" as const };
    console.error("[Notification email] Reservation failed:", error);
  } catch (error) {
    console.error("[Notification email] Reservation outcome unavailable:", error);
  }
  return { status: "unavailable" as const };
}

export async function finishNotificationEmail(
  client: SupabaseClient, claim: { key: string; value: string; nonce: string; reservedAt: string }, dispatch: EmailDispatch,
) {
  // Only a provably never-attempted dispatch can release a claim for retry.
  // Accepted, rejected and ambiguous attempts retain a permanent reservation.
  return recordEmailBookkeeping(() => dispatch.attempted
    ? client.from("app_settings").update({ value: JSON.stringify({ status: dispatch.status, nonce: claim.nonce,
      reservedAt: claim.reservedAt, at: new Date().toISOString(), attempted: true, providerId: dispatch.providerId,
      providerStatus: dispatch.providerStatus, sandbox: dispatch.sandbox, intendedRecipientAccepted: dispatch.intendedRecipientAccepted }) })
      .eq("key", claim.key).eq("value", claim.value).select("key")
    : client.from("app_settings").delete().eq("key", claim.key).eq("value", claim.value).select("key"));
}
