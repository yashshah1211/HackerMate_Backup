import { createHash, createHmac } from "node:crypto";
import { BASE, escapeHtml, tokenHash } from "./core";

export type ApprovedBatch = { batchId: string; digest: string; count: number };
export type LaunchManifest = { batches: ApprovedBatch[]; scheduledAt: string; sender: string };
export const PARTICIPANT_DELIVERY_AT = "2026-10-23T08:35:00.000Z";
export function assertDeliverySchedule(value: string) {
  if (value !== PARTICIPANT_DELIVERY_AT) throw Error("Only 23 October 2026 at 14:05 IST is approved.");
}
export type DeliveryTeam = { id: string; batch_id: string; team_name: string; leader_email: string };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export function launchManifest(raw: string | undefined): LaunchManifest {
  const m = JSON.parse(raw || "null");
  if (!m || Object.keys(m).sort().join() !== "batches,scheduledAt,sender" || !Array.isArray(m.batches)
    || !m.batches.length || m.batches.length > 500 || typeof m.scheduledAt !== "string"
    || typeof m.sender !== "string" || m.sender !== m.sender.trim()) throw Error("Invalid launch manifest.");
  assertDeliverySchedule(m.scheduledAt); senderAddress(m.sender);
  const seen = new Set(); let total = 0;
  for (const b of m.batches) {
    if (!b || Object.keys(b).sort().join() !== "batchId,count,digest" || !UUID.test(b.batchId)
      || !/^[a-f0-9]{64}$/.test(b.digest) || !Number.isInteger(b.count) || b.count < 1 || b.count > 500 || seen.has(b.batchId)) throw Error("Invalid approved batch.");
    total += b.count; seen.add(b.batchId);
  }
  if (total > 500) throw Error("Launch exceeds pilot limit.");
  return m;
}
/** A dedicated 256-bit server secret makes tokens unpredictable; only hashes enter SQL. */
export function deliveryToken(secret: string | undefined, batch: ApprovedBatch, team: DeliveryTeam) {
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) throw Error("Delivery secret unavailable.");
  const token = createHmac("sha256", Buffer.from(secret, "hex")).update(`hustle-r2-delivery-v1:${batch.batchId}:${batch.digest}:${team.id}`).digest("base64url");
  return { token, hash: tokenHash(token)! };
}
export function senderAddress(from: string): string {
  const address = (from.match(/<([^<>]+)>$/)?.[1] || from).trim().toLowerCase();
  if (/[\r\n]/.test(from) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) || address.endsWith("@resend.dev")) throw Error("Verified sender required.");
  return address;
}
export function deliveryMessage(team: DeliveryTeam, token: string, scheduledAt: string, from: string) {
  assertDeliverySchedule(scheduledAt);
  senderAddress(from);
  if (team.leader_email !== team.leader_email.trim().toLowerCase() || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(team.leader_email)
    || /[\r\n]/.test(team.leader_email) || !tokenHash(token)) throw Error("Invalid invitation destination.");
  const link = `https://www.hackermate.in${BASE}/invite#${token}`;
  const text = `HackerMate × Hustle Carnival\n${team.team_name}: you are shortlisted for Round 2.\nPrivate leader invitation: ${link}\nSign in with Google using this organizer-approved email and complete HackerMate onboarding. Verify your roster entry, then Confirm or Decline for your whole team. A forwarded link cannot authorize another account.\nResponses open 23 October 2026 at 9:00 AM IST and close exactly at 11:00 PM IST. Opening this link does not confirm attendance. No fee is required.\nSupport: https://www.hackermate.in/contact`;
  return { from, to: [team.leader_email], subject: "Hustle Carnival Round 2 — private attendance invitation", text,
    html: `<h1>HackerMate × Hustle Carnival</h1><p>${escapeHtml(team.team_name)}: you are shortlisted for Round 2.</p><p><a href="${escapeHtml(link)}">Open your private leader invitation</a></p><p>Sign in with Google using the organizer-approved email that received this message. Complete onboarding, verify your roster entry, then choose Confirm or Decline for your entire team.</p><p>23 October 2026, 9:00 AM–11:00 PM IST. No fee. Opening the invitation does not confirm attendance. Forwarding it does not authorize another account.</p><p><a href="https://www.hackermate.in/contact">Contact support</a></p>`, scheduled_at: scheduledAt };
}
/**
 * Resend may accept a scheduled POST (HTTP 200) before its response body yields a
 * usable ID. Recover the ID ONLY via bounded read-only GET inventory, never by
 * resubmitting the same payload. Reject ambiguous/malformed/incomplete scans.
 */
async function findNewScheduledProviderId(
  key: string, message: ReturnType<typeof deliveryMessage>, submittedAt: number,
): Promise<string | null> {
  const notBefore = submittedAt - 5000;
  const endBy = Date.now() + 15_000;
  for (const delay of [300, 700, 1200]) {
    await new Promise(resolve => setTimeout(resolve, delay));
    const seen = new Set<string>();
    const matches: string[] = [];
    let after: string | null = null;
    let previousTime = Infinity;
    for (let page = 0; page < 5; page++) {
      const timeLeft = endBy - Date.now();
      if (timeLeft < 750) return null;
      let response: Response;
      try {
        response = await fetch("https://api.resend.com/emails?limit=100" +
          (after ? "&after=" + encodeURIComponent(after) : ""), {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(Math.min(3500, timeLeft - 300)),
          cache: "no-store",
        });
      } catch { return null; }
      if (!response.ok) return null;
      const inventory = await response.json().catch(() => null) as {
        data?: Array<{ id?: unknown; created_at?: unknown; subject?: unknown;
          to?: unknown; from?: unknown; scheduled_at?: unknown }>;
        has_more?: unknown;
      } | null;
      if (!inventory || !Array.isArray(inventory.data) || inventory.data.length > 100
        || typeof inventory.has_more !== "boolean"
        || (!inventory.data.length && inventory.has_more)) return null;
      let beforeAttempt = false;
      for (const item of inventory.data) {
        if (!item || typeof item.id !== "string" || !UUID.test(item.id)
          || typeof item.created_at !== "string") return null;
        const created = Date.parse(item.created_at);
        if (!Number.isFinite(created) || created > previousTime || seen.has(item.id))
          return null;
        previousTime = created;
        seen.add(item.id);
        if (created < notBefore) beforeAttempt = true;
        if (created >= notBefore && created <= Date.now() + 60_000
          && item.subject === message.subject && item.from === message.from
          && JSON.stringify(item.to) === JSON.stringify(message.to)
          && typeof item.scheduled_at === "string"
          && Date.parse(item.scheduled_at) === Date.parse(PARTICIPANT_DELIVERY_AT)) {
          matches.push(item.id);
        }
      }
      // Two provider records for the same new invitation means STOP, never guess.
      if (matches.length > 1) return null;
      if (beforeAttempt || inventory.has_more === false) {
        if (matches.length === 1) return matches[0];
        break; // Completed this scan; allow delayed provider visibility.
      }
      if (!inventory.data.length) return null;
      after = inventory.data[inventory.data.length - 1].id as string;
    }
  }
  return null;
}

export type ProviderOutcome = { status: "accepted" | "rejected" | "unknown"; providerId: string | null; code: number | null };
/** No retry, no provider body/error logging. The DB reservation is authoritative beyond Resend's 24h key lifetime. */
export async function submitInvitation(key: string, message: ReturnType<typeof deliveryMessage>, id: string, timeout = 15_000): Promise<ProviderOutcome> {
  assertDeliverySchedule(message.scheduled_at); // Outside catch: malformed schedules make zero provider calls.
  let providerId: string | null = null;
  try {
    await new Promise(resolve => setTimeout(resolve, 125));
    const submittedAt = Date.now();
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `hustle-r2/${id}` }, body: JSON.stringify(message), signal: AbortSignal.timeout(timeout), cache: "no-store" });
    const data = await r.json().catch(() => null);
    if (r.ok && !data?.error) {
      const candidate = typeof data?.id === "string" ? data.id
        : typeof data?.data?.id === "string" ? data.data.id : null;
      providerId = candidate && UUID.test(candidate) ? candidate : null;
      if (!providerId) {
        // Never repeat an accepted POST with an unparseable response.
        // Reconcile against the actual provider's immutable scheduled metadata.
        providerId = await findNewScheduledProviderId(key, message, submittedAt);
      }
      if (!providerId) return { status: "unknown", providerId: null, code: r.status };
      // Never retry the POST. A successfully created scheduled email may take
      // a moment to become visible with last_event=scheduled in the GET API.
      // Follow its *known provider ID* with bounded, read-only GET probes.
      let lastReadbackCode: number | null = null;
      for (let probe = 0; probe < 5; probe++) {
        await new Promise(resolve => setTimeout(resolve, [250, 500, 750, 1000, 1500][probe]));
        let readback: Response;
        try {
          readback = await fetch(`https://api.resend.com/emails/${providerId}`, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(Math.min(timeout, 4000)), cache: "no-store",
          });
        } catch { continue; } // GET-only transport uncertainty never authorizes another POST.
        lastReadbackCode = readback.status;
        const proof = await readback.json().catch(() => null);
        if (!readback.ok || !proof) continue;
        // The API may omit absent CC/BCC entirely; absence and empty arrays are safe.
        const noExtraRecipients = (value: unknown) => value == null || (Array.isArray(value) && value.length === 0);
        const identityMatches = proof.id === providerId
          && Date.parse(proof.scheduled_at) === Date.parse(PARTICIPANT_DELIVERY_AT)
          && JSON.stringify(proof.to) === JSON.stringify(message.to)
          && proof.from === message.from && proof.subject === message.subject
          && noExtraRecipients(proof.cc) && noExtraRecipients(proof.bcc);
        if (identityMatches && proof.last_event === "scheduled")
          return { status: "accepted", providerId, code: r.status };
        // A definite recipient, sender, subject or schedule mismatch is a STOP,
        // not an eventual-consistency wait.
        if (proof.id === providerId && (
          (proof.to != null && JSON.stringify(proof.to) !== JSON.stringify(message.to))
          || (proof.from != null && proof.from !== message.from)
          || (proof.subject != null && proof.subject !== message.subject)
          || (proof.scheduled_at != null && Date.parse(proof.scheduled_at) !== Date.parse(PARTICIPANT_DELIVERY_AT))
          || !noExtraRecipients(proof.cc) || !noExtraRecipients(proof.bcc)
        )) return { status: "unknown", providerId, code: readback.status };
      }
      // Retain unknown outcome after bounded GETs: never submit the same email again.
      return { status: "unknown", providerId, code: lastReadbackCode };
    }
    return { status: r.status >= 400 && r.status < 500 && ![408,409].includes(r.status) ? "rejected" : "unknown", providerId: null, code: r.status };
  } catch { return { status: "unknown", providerId, code: null }; }
}
