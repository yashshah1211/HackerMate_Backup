import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchEmail, type EmailDispatch } from "@/lib/emailDispatch";
import { checkEmailBudget, recordEmailSendSuccess } from "@/lib/admin/emailBudgetGuard";

// A deliberately narrow replacement for the retired scraper -> bulk-mail coupling.
// The CRM must already have a manually verified, new organizer contact.
// Do not infer email addresses from unrelated page text or resurrect removed leads.
export const SCHEDULED_ORGANIZER_DAILY_LIMIT = 5;
export const ORGANIZER_CONTACT_APPROVAL_MARKER = "[HACKERMATE_OUTREACH_APPROVED_V1]";
const CLAIM_PREFIX = "cron:organizer-outreach:v1:";
const MAX_SCAN = 20000;

type Lead = {
  id: string;
  title: string | null;
  organizer_email: string | null;
  last_sent_to: string | null;
  pitch_sent_at: string | null;
  status: string | null;
  unstop_url: string | null;
  notes: string | null;
};

type ClaimStatus = "reserved" | "duplicate" | "unavailable";
export type OutreachRunResult = {
  status: "sent" | "no_eligible" | "duplicate" | "blocked" | "partial";
  eligible: number;
  attempted: number;
  accepted: number;
  unknown: number;
  rejected: number;
  deferred: number;
  held: number;
  error?: string;
};

// No comma-separated recipients, display names, controls, or invented contacts.
export function normalizedOrganizerEmail(input: string | null | undefined): string | null {
  if (typeof input !== "string" || input.length > 254) return null;
  const s = input.trim().toLowerCase();
  if (s.includes(",") || s.includes("\n") || s.includes("\r")) return null;
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : null;
}

function providerEventUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    if (host !== "unstop.com" && host !== "www.unstop.com" &&
        host !== "devfolio.co" && !host.endsWith(".devfolio.co") &&
        host !== "hack2skill.com" && host !== "www.hack2skill.com") return null;
    return host.replace(/^www\./, "") + (u.pathname.replace(/\/+$/, "") || "/");
  } catch { return null; }
}

function contactApproved(notes: string | null): boolean {
  return typeof notes === "string" && notes.split(/\r?\n/).some(s => s.trim() === ORGANIZER_CONTACT_APPROVAL_MARKER);
}

function hashedEmail(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

export function outreachDateIST(date: Date): string {
  return new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

async function readAllLeads(db: SupabaseClient): Promise<Lead[]> {
  const all: Lead[] = [];
  for (let offset = 0; offset < MAX_SCAN; offset += 100) {
    const { data, error } = await db.from("organizer_leads")
      .select("id,title,organizer_email,last_sent_to,pitch_sent_at,status,unstop_url,notes")
      .order("id").range(offset, offset + 99);
    if (error || !Array.isArray(data)) throw new Error("Organizer outreach CRM read unavailable; no email attempted.");
    all.push(...(data as Lead[]));
    if (data.length < 100) return all;
  }
  throw new Error("Organizer outreach CRM scan limit reached; no email attempted.");
}

async function reserve(db: SupabaseClient, key: string, detail: Record<string, string>): Promise<ClaimStatus> {
  try {
    const { error } = await db.from("app_settings").insert({
      key, value: JSON.stringify(detail),
    });
    if (!error) return "reserved";
    if (error.code === "23505") return "duplicate";
    return "unavailable";
  } catch { return "unavailable"; }
}

async function markClaim(db: SupabaseClient, key: string, status: string, at: Date, leadId: string, providerId?: string): Promise<boolean> {
  try {
    const { data, error } = await db.from("app_settings")
      .update({ value: JSON.stringify({ status, lead_id: leadId, provider_id: providerId || null, updated_at: at.toISOString() }) })
      .eq("key", key).select("key");
    return !error && Array.isArray(data) && data.length === 1;
  } catch { return false; }
}

function escaped(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function partnershipHtml(title: string): string {
  const event = escaped(title.slice(0, 160) || "your upcoming hackathon");
  return "<p>Hello Hackathon Organizing Team,</p>" +
    "<p>I'm reaching out from HackerMate about <strong>" + event + "</strong>. " +
    "We help hackathon organizers give participants a dedicated co-branded partner page, " +
    "team discovery and matching, collaboration workspaces, and verified winner/finalist recognition.</p>" +
    "<p>Would you be open to a brief conversation about offering these tools for your event?</p>" +
    "<p>You can explore HackerMate at <a href=\"https://www.hackermate.in\">hackermate.in</a>.</p>" +
    "<p>If this is not relevant, reply and we will not follow up.</p>" +
    "<p>Regards,<br>HackerMate Partnership Team</p>";
}

function baseResult(status: OutreachRunResult["status"], eligible = 0): OutreachRunResult {
  return { status, eligible, attempted: 0, accepted: 0, unknown: 0,
    rejected: 0, deferred: 0, held: 0 };
}

// Public scheduler entry point. Only existing CRM rows explicitly in the "new"
// state are considered. Every recipient is claimed before a single provider
// attempt. Claims are never automatically cleared, even after a failure.
export async function runScheduledOrganizerOutreach(db: SupabaseClient, now = new Date()): Promise<OutreachRunResult> {
  const rows = await readAllLeads(db);
  const suppressed = new Set<string>();
  const historicalEventUrls = new Set<string>();
  for (const lead of rows) {
    const historicallyHeld = lead.status !== "new" || Boolean(lead.pitch_sent_at) || Boolean(lead.last_sent_to);
    if (!historicallyHeld) continue;
    for (const part of [lead.organizer_email || "", lead.last_sent_to || ""]) {
      for (const email of part.split(",")) {
        const normalized = normalizedOrganizerEmail(email);
        if (normalized) suppressed.add(normalized);
      }
    }
    const url = providerEventUrl(lead.unstop_url);
    if (url) historicalEventUrls.add(url);
  }

  const seen = new Set<string>();
  const seenEventUrls = new Set<string>();
  const eligible = rows.filter(lead => {
    if (lead.status !== "new" || lead.pitch_sent_at || lead.last_sent_to || !contactApproved(lead.notes)) return false;
    const email = normalizedOrganizerEmail(lead.organizer_email);
    const source = providerEventUrl(lead.unstop_url);
    if (!email || !source || suppressed.has(email) || historicalEventUrls.has(source) || seen.has(email) || seenEventUrls.has(source)) return false;
    seen.add(email);
    seenEventUrls.add(source);
    return true;
  });
  const result = baseResult("no_eligible", eligible.length);

  // The schedule is harmless until contacts are explicitly verified in the CRM.
  if (!eligible.length) return result;
  if (!process.env.RESEND_API_KEY?.trim() || !process.env.RESEND_FROM_EMAIL?.trim() ||
      process.env.RESEND_FROM_EMAIL.toLowerCase().includes("onboarding@resend.dev")) {
    return { ...result, status: "blocked", error: "Live provider configuration unavailable." };
  }

  // The historical budget is an advisory cap, not a cross-process lock.
  // This worker has an independent atomic once-per-IST-day admission.
  let budget;
  try { budget = await checkEmailBudget(db, "outreach", SCHEDULED_ORGANIZER_DAILY_LIMIT); }
  catch { return { ...result, status: "blocked", error: "Daily email budget could not be checked." }; }
  const permitted = Math.min(SCHEDULED_ORGANIZER_DAILY_LIMIT, budget.allowedCount, eligible.length);
  if (!permitted) return { ...result, status: "blocked", deferred: eligible.length, error: "Daily email budget exhausted." };

  const dayKey = CLAIM_PREFIX + "day:" + outreachDateIST(now);
  const daily = await reserve(db, dayKey, { status: "claimed", date: outreachDateIST(now), at: now.toISOString() });
  if (daily !== "reserved") return { ...result, status: daily === "duplicate" ? "duplicate" : "blocked",
    error: daily === "duplicate" ? undefined : "Daily dispatch claim unavailable." };

  for (const lead of eligible.slice(0, permitted)) {
    const email = normalizedOrganizerEmail(lead.organizer_email);
    if (!email) continue;
    // Re-read eligibility after the initial snapshot; never rely on a stale lead.
    const current = await db.from("organizer_leads")
      .select("id,title,organizer_email,last_sent_to,pitch_sent_at,status,unstop_url,notes")
      .eq("id", lead.id).maybeSingle();
    if (current.error || !current.data) {
      result.status = "partial"; result.error = "Lead revalidation unavailable.";
      break;
    }
    const live = current.data as Lead;
    if (live.status !== "new" || live.pitch_sent_at || live.last_sent_to || !contactApproved(live.notes) ||
        normalizedOrganizerEmail(live.organizer_email) !== email ||
        providerEventUrl(live.unstop_url) !== providerEventUrl(lead.unstop_url)) {
      result.held++;
      continue;
    }

    const key = CLAIM_PREFIX + "recipient:" + hashedEmail(email);
    const claim = await reserve(db, key, {
      status: "claimed_before_provider_attempt", lead_id: lead.id, at: now.toISOString(),
    });
    if (claim === "duplicate") {
      result.held++; result.status = "partial";
      result.error = "Recipient previously claimed; manual outcome reconciliation required.";
      break;
    }
    if (claim !== "reserved") {
      result.status = "partial"; result.error = "Recipient claim unavailable.";
      break;
    }

    let dispatch: EmailDispatch;
    try {
      dispatch = await dispatchEmail({
        from: process.env.RESEND_FROM_EMAIL || "",
        to: email,
        subject: "HackerMate partnership for " + String(live.title || "your hackathon").slice(0, 150),
        html: partnershipHtml(String(live.title || "your hackathon")),
        reply_to: process.env.OUTREACH_REPLY_TO_EMAIL?.split(",").map(s => s.trim()).filter(Boolean)
          || "contacthackermate@gmail.com",
      });
    } catch {
      // Ambiguous transport: never release the claim or retry this recipient.
      dispatch = { status: "unknown", attempted: true, intendedRecipientAccepted: false,
        sandbox: false, reason: "Provider outcome unavailable.", retrySafe: false };
    }

    result.attempted += Number(dispatch.attempted);
    result.accepted += Number(dispatch.intendedRecipientAccepted);
    result.unknown += Number(dispatch.status === "unknown");
    result.rejected += Number(dispatch.status === "failed");
    const outcomeRecorded = await markClaim(db, key, dispatch.status, new Date(), lead.id, dispatch.providerId);
    if (!outcomeRecorded) { result.status = "partial"; result.error = "Recipient claim outcome unavailable."; break; }

    if (dispatch.intendedRecipientAccepted || dispatch.status === "unknown") {
      const payload = dispatch.intendedRecipientAccepted
        ? { status: "pitch_sent", last_sent_to: email, pitch_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        : { status: "email_outcome_unknown", updated_at: new Date().toISOString() };
      const { data, error } = await db.from("organizer_leads").update(payload)
        .eq("id", lead.id).eq("status", "new").is("pitch_sent_at", null)
        .eq("organizer_email", live.organizer_email).select("id");
      if (error || !Array.isArray(data) || data.length !== 1) {
        result.status = "partial"; result.error = "CRM dispatch bookkeeping unavailable; manual investigation required.";
        break;
      }
    }

    if (dispatch.intendedRecipientAccepted) {
      const accounting = await recordEmailSendSuccess(db, "outreach", 1);
      if (accounting.status !== "recorded") {
        result.status = "partial"; result.error = "Provider acceptance counter unavailable.";
        break;
      }
    }
    if (dispatch.status === "unknown" || dispatch.status === "not_dispatched" || dispatch.status === "failed") {
      result.status = "partial"; result.error = "Provider did not confirm intended acceptance; manual investigation required.";
      break;
    }
  }

  result.deferred = Math.max(0, eligible.length - result.accepted - result.unknown - result.rejected - result.held);
  if (result.status !== "partial") result.status = result.attempted ? "sent" : "no_eligible";
  return result;
}
