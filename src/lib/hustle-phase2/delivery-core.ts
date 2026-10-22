import { createHash, createHmac } from "node:crypto";
import { BASE, CLOSES, escapeHtml, tokenHash } from "./core";

export type ApprovedBatch = { batchId: string; digest: string; count: number };
export type LaunchManifest = { batches: ApprovedBatch[]; scheduledAt: string };
export type DeliveryTeam = { id: string; batch_id: string; team_name: string; leader_email: string };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export function launchManifest(raw: string | undefined): LaunchManifest {
  const m = JSON.parse(raw || "null");
  if (!m || Object.keys(m).sort().join() !== "batches,scheduledAt" || !Array.isArray(m.batches)
    || !m.batches.length || m.batches.length > 500 || typeof m.scheduledAt !== "string"
    || !/^2026-10-(22|23)T\d{2}:\d{2}:\d{2}\.000Z$/.test(m.scheduledAt)
    || !Number.isFinite(Date.parse(m.scheduledAt)) || Date.parse(m.scheduledAt) >= Date.parse(CLOSES)) throw Error("Invalid launch manifest.");
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
  senderAddress(from);
  if (team.leader_email !== team.leader_email.trim().toLowerCase() || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(team.leader_email)
    || /[\r\n]/.test(team.leader_email) || !tokenHash(token)) throw Error("Invalid invitation destination.");
  const link = `https://www.hackermate.in${BASE}/invite#${token}`;
  const text = `HackerMate × Hustle Carnival\n${team.team_name}: you are shortlisted for Round 2.\nPrivate leader invitation: ${link}\nSign in with Google using this organizer-approved email and complete HackerMate onboarding. Verify your roster entry, then Confirm or Decline for your whole team. A forwarded link cannot authorize another account.\nResponses open 23 October 2026 at 10:00 AM IST and close exactly at 11:00 PM IST. Opening this link does not confirm attendance. No fee is required.\nSupport: https://www.hackermate.in/contact`;
  return { from, to: [team.leader_email], subject: "Hustle Carnival Round 2 — private attendance invitation", text,
    html: `<h1>HackerMate × Hustle Carnival</h1><p>${escapeHtml(team.team_name)}: you are shortlisted for Round 2.</p><p><a href="${escapeHtml(link)}">Open your private leader invitation</a></p><p>Sign in with Google using the organizer-approved email that received this message. Complete onboarding, verify your roster entry, then choose Confirm or Decline for your entire team.</p><p>23 October 2026, 10:00 AM–11:00 PM IST. No fee. Opening the invitation does not confirm attendance. Forwarding it does not authorize another account.</p><p><a href="https://www.hackermate.in/contact">Contact support</a></p>`, scheduled_at: scheduledAt };
}
export type ProviderOutcome = { status: "accepted" | "rejected" | "unknown"; providerId: string | null; code: number | null };
/** No retry, no provider body/error logging. The DB reservation is authoritative beyond Resend's 24h key lifetime. */
export async function submitInvitation(key: string, message: ReturnType<typeof deliveryMessage>, id: string): Promise<ProviderOutcome> {
  try {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `hustle-r2/${id}` }, body: JSON.stringify(message), signal: AbortSignal.timeout(15_000), cache: "no-store" });
    const data = await r.json().catch(() => null);
    if (r.ok && typeof data?.id === "string" && UUID.test(data.id) && !data.error) return { status: "accepted", providerId: data.id, code: r.status };
    return { status: r.status >= 400 && r.status < 500 && ![408,409].includes(r.status) ? "rejected" : "unknown", providerId: null, code: r.status };
  } catch { return { status: "unknown", providerId: null, code: null }; }
}
