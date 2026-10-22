import "server-only";
import { CLOSES } from "./core";
import { deliveryMessage, deliveryToken, launchManifest, senderAddress, sha256, submitInvitation, type ApprovedBatch, type DeliveryTeam } from "./delivery-core";

type Rpc = <T>(name: string, args?: Record<string, unknown>) => Promise<T>;
type Delivery = { team_id: string; status: string };
type Teams = DeliveryTeam & { decision: string };
export function deliveryEnabled(): boolean {
  const DELIVERY_RELEASE_APPROVED = true; // This code requires separate live dispatch approval and an exact manifest.
  return DELIVERY_RELEASE_APPROVED && process.env.HUSTLE_PHASE2_DELIVERY_ENABLED === "true"
    && process.env.HUSTLE_PHASE2_DELIVERY_RELEASE_APPROVED === "true";
}
export async function providerGet(path: string, timeout = 10_000) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw Error("Provider key unavailable.");
  await new Promise(resolve => setTimeout(resolve, 125));
  const r = await fetch(`https://api.resend.com${path}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw Error("Provider preflight unavailable.");
  return r.json();
}
/** Read-only provider checks. No message body or recipient list is fetched. */
export async function providerPreflight(required: number, timeout = 10_000) {
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "", address = senderAddress(from);
  const usage = await providerGet("/usage", timeout);
  const daily = usage?.emails?.daily, monthly = usage?.emails?.monthly;
  // Explicit free allowance, with no paid/uncapped fallback or speculative quota reset.
  if (daily?.limit !== 100 || monthly?.limit > 3000 || !Number.isInteger(monthly?.limit)
    || !Number.isInteger(daily?.used) || daily.used < 0 || !Number.isInteger(monthly?.used) || monthly.used < 0
    || daily.used + required > daily.limit || monthly.used + required > monthly.limit) throw Error("Free provider quota cannot cover this operation.");
  const domains = await providerGet("/domains", timeout);
  const domain = domains?.data?.find((d: { name: string }) => d.name === address.split("@")[1]);
  if (!domain || typeof domain.id !== "string") throw Error("Sender domain unavailable.");
  const settings = await providerGet(`/domains/${encodeURIComponent(domain.id)}`, timeout);
  if (settings.status !== "verified" || settings.capabilities?.sending !== "enabled"
    || settings.open_tracking !== false || settings.click_tracking !== false) throw Error("Verified sender with tracking OFF required.");
  return { dailyRemaining: daily.limit - daily.used, monthlyRemaining: monthly.limit - monthly.used, resetAt: daily.resets_at, rateLimit: usage.rate_limit };
}
export function deliveryConfig() {
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "";
  const address = senderAddress(from);
  // Vercel Sensitive sender variables cannot be read back. Bind the exact approved
  // 42+9 roster manifest to the *actual* production sender, never a guessed address.
  // The mandatory providerPreflight separately verifies this sender's domain.
  const raw = process.env.HUSTLE_PHASE2_LAUNCH_MANIFEST;
  let approvedRaw = raw;
  const binding = "__HACKERMATE_PRODUCTION_RESEND_SENDER__";
  if (raw?.includes(binding)) {
    if (process.env.VERCEL_ENV !== "production" || !address.endsWith("@hackermate.in"))
      throw Error("Production sender binding is unavailable.");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
      || (parsed as { sender?: unknown }).sender !== binding) throw Error("Invalid sender binding.");
    approvedRaw = JSON.stringify({ ...parsed, sender: from });
  }
  const manifest = launchManifest(approvedRaw);
  if (from !== manifest.sender) throw Error("Sender differs from the approved manifest.");
  const secret = process.env.HUSTLE_PHASE2_DELIVERY_TOKEN_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) throw Error("Delivery secret unavailable.");
  return { manifest, from, secret };
}
function approved(batches: ApprovedBatch[], id: unknown) {
  const batch = batches.find(b => b.batchId === id);
  if (!batch) throw Error("Batch is not in the approved launch manifest.");
  return batch;
}
export function deliveryEntries(batch: ApprovedBatch, teams: Teams[], secret: string, from: string, scheduledAt: string) {
  const chosen = teams.filter(t => t.batch_id === batch.batchId);
  if (chosen.length !== batch.count) throw Error("Approved team count mismatch.");
  return chosen.map(team => {
    const { token, hash } = deliveryToken(secret, batch, team);
    const message = deliveryMessage(team, token, scheduledAt, from);
    return { team, message, team_id: team.id, token_hash: hash, payload_hash: sha256(JSON.stringify(message)) };
  });
}
/** Invoked only after enabled(), same-origin, verified current admin session, and rate limit. */
export async function launchOperation(action: string, data: Record<string, unknown>, actor: string, teams: Teams[], rpc: Rpc) {
  if (!deliveryEnabled()) throw Error("Delivery approval is OFF.");
  if (process.env.HUSTLE_PHASE2_AUTODISPATCH_ENABLED === "true" && action !== "delivery-status") throw Error("Manual dispatch is locked during unattended mode.");
  const { manifest, from, secret } = deliveryConfig();
  if (action === "delivery-status") return rpc("hustle_phase2_delivery_report", { p_actor: actor });
  if (Object.keys(data).some(k => !["batchId", "confirm"].includes(k))) throw Error("Unknown launch fields.");
  const batch = approved(manifest.batches, data.batchId);
  const rows = deliveryEntries(batch, teams, secret, from, manifest.scheduledAt);
  if (action === "launch") {
    if (data.confirm !== "ACTIVATE AND PREPARE") throw Error("Explicit launch confirmation required.");
    if (Date.parse(manifest.scheduledAt) < Date.now() + 5 * 60_000) throw Error("Schedule must be at least five minutes in the future.");
    const report = await rpc<{ deliveries: Delivery[] }>("hustle_phase2_delivery_report", { p_actor: actor });
    if (report.deliveries.some(d => ["dispatching", "unknown", "rejected", "failed"].includes(d.status))) throw Error("Delivery needs reconciliation; STOP automatic preparation.");
    const approvedTeams = new Set(teams.filter(t => manifest.batches.some(b => b.batchId === t.batch_id)).map(t => t.id));
    const accepted = report.deliveries.filter(d => d.status === "accepted" && approvedTeams.has(d.team_id)).length;
    await providerPreflight(manifest.batches.reduce((sum, b) => sum + b.count, 0) - accepted);
    return rpc("hustle_phase2_delivery_prepare", { p_actor: actor, p_batch: batch.batchId, p_digest: batch.digest, p_count: batch.count,
      p_scheduled: manifest.scheduledAt, p_entries: rows.map(({ team_id, token_hash, payload_hash }) => ({ team_id, token_hash, payload_hash })) });
  }
  if (action !== "dispatch" || data.confirm !== "SCHEDULE LEADER INVITATIONS") throw Error("Explicit dispatch confirmation required.");
  if (Date.now() >= Date.parse(CLOSES) || Date.parse(manifest.scheduledAt) < Date.now() + 60_000) throw Error("Dispatch window closed or schedule too close; STOP.");
  const report = await rpc<{ deliveries: Delivery[] }>("hustle_phase2_delivery_report", { p_actor: actor });
  // Crash between claim and finish remains dispatching = UNKNOWN. No requeue path exists.
  if (report.deliveries.some(d => ["dispatching", "unknown", "rejected", "failed"].includes(d.status))) throw Error("Delivery needs reconciliation; STOP automatic dispatch.");
  if (rows.some(row => !report.deliveries.some(d => d.team_id === row.team_id && ["prepared", "accepted"].includes(d.status)))) throw Error("Batch is not fully prepared; no dispatch completed.");
  const pending = rows.filter(row => report.deliveries.some(d => d.team_id === row.team_id && d.status === "prepared"));
  if (!pending.length) return { remaining: 0, accepted: 0 };
  await providerPreflight(pending.length);
  let accepted = 0;
  // Small requests stay bounded; the authorized admin UI drains the durable queue tonight.
  for (const row of pending.slice(0, 5)) {
    const claimed = await rpc<{ id: string } | false>("hustle_phase2_delivery_claim", { p_actor: actor, p_team: row.team_id, p_hash: row.token_hash, p_payload: row.payload_hash });
    if (!claimed) continue;
    const outcome = await submitInvitation(process.env.RESEND_API_KEY!.trim(), row.message, claimed.id);
    // If persistence is uncertain this throws; a replay cannot claim dispatching again.
    await rpc("hustle_phase2_delivery_finish", { p_actor: actor, p_team: row.team_id, p_status: outcome.status, p_provider: outcome.status === "accepted" ? outcome.providerId : null, p_code: outcome.code });
    if (outcome.status !== "accepted") throw Error("Provider outcome requires reconciliation; STOP automatic dispatch.");
    accepted++;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const after = await rpc<{ deliveries: Delivery[] }>("hustle_phase2_delivery_report", { p_actor: actor });
  if (after.deliveries.some(d => !["prepared", "accepted"].includes(d.status))
    || rows.some(row => !after.deliveries.some(d => d.team_id === row.team_id && ["prepared", "accepted"].includes(d.status)))) throw Error("Dispatch completion is unresolved; STOP and reconcile.");
  return { remaining: after.deliveries.filter(d => d.status === "prepared" && rows.some(r => r.team_id === d.team_id)).length, accepted };
}
