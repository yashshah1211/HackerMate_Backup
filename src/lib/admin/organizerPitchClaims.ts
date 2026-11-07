import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchEmail, type EmailDispatch, type EmailPayload } from "@/lib/emailDispatch";
import { isLeadId, restorationErrorCode } from "@/lib/admin/organizerLeadRestore";

export type OrganizerPitchMode = "manual" | "scheduled" | "automatic";
const states = ["claimed", "dispatching", "accepted", "sandbox_accepted", "rejected", "unknown", "not_dispatched", "suppressed"];
const completion = ["pending", "recorded", "failed", "not_required"];
type Blocked = { kind: "blocked"; outcome: "duplicate" | "approval_required" | "blocked" | "conflict" | "unavailable"; state?: string; repeatOf?: string };
export type OrganizerPitchResult = Blocked | {
  kind: "dispatched"; intentId: string; dispatch: EmailDispatch;
  bookkeeping: "recorded" | "failed" | "not_required"; journal: "recorded" | "failed";
};

export function normalizedPitchRecipient(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 254 || /[\r\n]/.test(value)) return null;
  const email = value.trim().toLowerCase();
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) ? email : null;
}
function validRepeat(value: unknown): value is string {
  return isLeadId(value) || (typeof value === "string" && /^legacy:[a-f0-9]{64}$/.test(value));
}

async function record(db: SupabaseClient, intentId: string, event: string, recipient?: string, providerId?: string) {
  try {
    const { data, error } = await db.rpc("record_organizer_pitch", {
      p_intent_id: intentId, p_event: event, p_recipient: recipient ?? null, p_provider_id: providerId ?? null,
    });
    if (error) { console.error("[Organizer pitch] Outcome unavailable:", restorationErrorCode(error)); return null; }
    const expected = event.startsWith("accounting_") ? ["accepted", "sandbox_accepted"] : [event];
    if (!data || data.intent_id !== intentId || !expected.includes(data.state) ||
        !completion.includes(data.crm) || !completion.includes(data.accounting)) {
      console.error("[Organizer pitch] Invalid outcome receipt."); return null;
    }
    const businessContact = ["accepted", "unknown"].includes(data.state);
    const expectedAccounting = event.startsWith("accounting_") ? event.slice("accounting_".length)
      : ["accepted", "sandbox_accepted", "dispatching"].includes(event) ? "pending" : "not_required";
    if (data.accounting !== expectedAccounting || (event === "dispatching" ? data.crm !== "pending"
        : businessContact ? !["recorded", "failed"].includes(data.crm) : data.crm !== "not_required")) {
      console.error("[Organizer pitch] Inconsistent outcome receipt."); return null;
    }
    return data as { intent_id: string; state: string; crm: string; accounting: string };
  } catch (error) {
    console.error("[Organizer pitch] Outcome unavailable:", restorationErrorCode(error)); return null;
  }
}

/** No retry/release path: even a crash before provider contact leaves evidence. */
export async function sendClaimedOrganizerPitch(db: SupabaseClient, input: {
  intentId: string; leadId: string; recipient: string; payload: EmailPayload; mode: OrganizerPitchMode; repeatOf?: string;
}): Promise<OrganizerPitchResult> {
  const { payload } = input;
  const recipient = normalizedPitchRecipient(input.recipient);
  if (!isLeadId(input.intentId) || !isLeadId(input.leadId) || !recipient || payload.to !== recipient ||
      (input.repeatOf !== undefined && !validRepeat(input.repeatOf))) return { kind: "blocked", outcome: "blocked" };
  const intentId = input.intentId.toLowerCase();
  const fingerprint = createHash("sha256").update(JSON.stringify({
    from: payload.from, to: recipient, subject: payload.subject, html: payload.html,
    reply_to: payload.reply_to ?? null, attachments: payload.attachments ?? null,
    sandboxTarget: process.env.RESEND_SANDBOX_RECIPIENT ?? null,
  })).digest("hex");
  try {
    const { data, error } = await db.rpc("claim_organizer_pitch", {
      p_intent_id: intentId, p_lead_id: input.leadId.toLowerCase(), p_recipient: recipient,
      p_fingerprint: fingerprint, p_mode: input.mode, p_repeat_of: input.repeatOf ?? null,
    });
    if (error) {
      console.error("[Organizer pitch] Claim unavailable:", restorationErrorCode(error));
      return { kind: "blocked", outcome: "unavailable" };
    }
    if (!data || data.intent_id !== intentId) return { kind: "blocked", outcome: "unavailable" };
    if (data.outcome !== "claimed") {
      if (data.outcome === "approval_required" && validRepeat(data.repeat_of))
        return { kind: "blocked", outcome: "approval_required", repeatOf: data.repeat_of };
      if (data.outcome === "duplicate" && states.includes(data.state))
        return { kind: "blocked", outcome: "duplicate", state: data.state };
      if (["blocked", "conflict"].includes(data.outcome)) return { kind: "blocked", outcome: data.outcome };
      return { kind: "blocked", outcome: "unavailable" };
    }
    if (data.fingerprint !== fingerprint) return { kind: "blocked", outcome: "unavailable" };
  } catch (error) {
    console.error("[Organizer pitch] Claim unavailable:", restorationErrorCode(error));
    return { kind: "blocked", outcome: "unavailable" };
  }
  const started = await record(db, intentId, "dispatching");
  if (!started || started.crm !== "pending" || started.accounting !== "pending")
    return { kind: "blocked", outcome: "unavailable" };
  let dispatch: EmailDispatch;
  try {
    dispatch = await dispatchEmail(payload, { idempotencyKey: "hm-organizer-pitch/v1/" + intentId });
  } catch {
    dispatch = { status: "unknown", attempted: true, intendedRecipientAccepted: false, sandbox: false,
      reason: "Provider outcome unknown. Review durable state and provider history; do not resend.", retrySafe: false };
  }
  const event = dispatch.status === "accepted" ? dispatch.intendedRecipientAccepted ? "accepted" : "sandbox_accepted"
    : dispatch.status === "failed" ? "rejected" : dispatch.status;
  const receipt = await record(db, intentId, event, recipient, dispatch.providerId);
  return { kind: "dispatched", intentId, dispatch, journal: receipt ? "recorded" : "failed",
    bookkeeping: receipt ? receipt.crm === "recorded" ? "recorded" : receipt.crm === "not_required" ? "not_required" : "failed" : "failed" };
}

export async function recordOrganizerPitchAccounting(db: SupabaseClient, intentId: string, recorded: boolean): Promise<boolean> {
  const receipt = await record(db, intentId, recorded ? "accounting_recorded" : "accounting_failed");
  return Boolean(receipt && receipt.accounting === (recorded ? "recorded" : "failed"));
}
