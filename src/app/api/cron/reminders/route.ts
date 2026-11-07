import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dispatchEmail, type EmailDispatch, type EmailPayload } from "@/lib/emailDispatch";
import { renderHackerMateEmail } from "@/lib/emailTemplate";
import { recordEmailSendSuccess } from "@/lib/admin/emailBudgetGuard";
import {
  claimDeadlineReminder, isReminderUuid, logReminderError, normalizeReminderDeadline, reminderIdentity,
  transitionDeadlineReminder, type ReminderIdentity,
} from "@/lib/admin/deadlineReminderClaims";
import { isPublicEvent } from "@/lib/hackathons/publicBrowsing";

const oneDay = 24 * 60 * 60 * 1000;
const noCache = { "Cache-Control": "no-store" };
const discoveryPageSize = 100;

async function* discoverReminders(db: SupabaseClient): AsyncGenerator<unknown> {
  let after: string | undefined;
  while (true) {
    const query = db.rpc("get_pending_deadline_reminders").order("saved_id", { ascending: true }).limit(discoveryPageSize);
    if (after) query.gt("saved_id", after);
    const { data, error } = await query.abortSignal(AbortSignal.timeout(10_000));
    if (error) throw error;
    if (!Array.isArray(data) || data.length > discoveryPageSize) throw new Error("Invalid discovery receipt");
    if (data.length === 0) return;
    // Validate the cursor before using it. Even a short page can have a successor
    // when the API applies a stricter row cap.
    for (const row of data) {
      const id = row?.saved_id;
      if (!isReminderUuid(id) || (after && id.toLowerCase() <= after)) throw new Error("Invalid discovery cursor");
      after = id.toLowerCase();
    }
    yield* data;
  }
}

function emailAddress(value: unknown): string | null {
  if (typeof value !== "string" || /[\r\n]/.test(value)) return null;
  const address = value.trim();
  return address.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(address) ? address : null;
}

function withinReminderWindow(deadline: string): boolean {
  const remaining = Date.parse(deadline) - Date.now();
  return remaining > 0 && remaining <= oneDay;
}

function reminderOrigin(): string {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || "");
    if (url.protocol === "https:" && !url.username && !url.password &&
        url.pathname === "/" && !url.search && !url.hash) return url.origin;
  } catch { /* Use the canonical site when server configuration is absent or malformed. */ }
  return "https://www.hackermate.in";
}

async function prepareReminder(db: SupabaseClient, reminder: ReminderIdentity, from: string): Promise<
  { status: "ready"; payload: EmailPayload; name: string; recipientName: string } | { status: "changed" | "unavailable" }
> {
  try {
    const [profile, event] = await Promise.all([
      db.from("profiles").select("id,email,full_name,is_banned").eq("id", reminder.userId)
        .abortSignal(AbortSignal.timeout(10_000)).maybeSingle(),
      db.from("hackathons").select("id,name,status,archived,registration_start,registration_end,registration_status")
        .eq("id", reminder.hackathonId).abortSignal(AbortSignal.timeout(10_000)).maybeSingle(),
    ]);
    if (profile.error || event.error) {
      logReminderError("[Deadline reminders] Profile or event unavailable", profile.error || event.error);
      return { status: "unavailable" };
    }
    const builder = profile.data;
    const hackathon = event.data;
    const recipient = emailAddress(builder?.email);
    const opensAt = hackathon?.registration_start == null ? null : normalizeReminderDeadline(hackathon.registration_start);
    const registration = typeof hackathon?.registration_status === "string"
      ? hackathon.registration_status.trim().toLowerCase() : hackathon?.registration_status;
    const openByTime = opensAt !== null && Date.parse(opensAt) <= Date.now();
    // A saved not-yet-open snapshot can legitimately become open at its stated start.
    const statusAllows = registration == null || registration === "open" || (registration === "not-yet-open" && openByTime);
    if (!recipient || builder?.id !== reminder.userId || builder.is_banned !== false ||
        hackathon?.id !== reminder.hackathonId || !isPublicEvent(hackathon) ||
        typeof hackathon.name !== "string" || !hackathon.name.trim() ||
        !statusAllows || (hackathon.registration_start != null && !openByTime) ||
        normalizeReminderDeadline(hackathon.registration_end) !== reminder.deadline ||
        !withinReminderWindow(reminder.deadline)) return { status: "changed" };

    const name = hackathon.name;
    const recipientName = typeof builder.full_name === "string" && builder.full_name ? builder.full_name : "Builder";
    return { status: "ready", name, recipientName, payload: {
      from, to: recipient,
      subject: `⏰ [HackerMate] Registration closes in 24 hours for ${name.replace(/[\r\n]+/g, " ")}`,
      html: renderHackerMateEmail({
        title: "Registration Closing Soon!",
        recipientName,
        introText: `The registration deadline for "${name}" is approaching. You saved this hackathon to your wishlist but have not registered yet. Complete your registration now before it closes!`,
        actionLabel: "Register Now",
        actionUrl: `${reminderOrigin()}/hackathons/${reminder.hackathonId}`,
        badgeText: "Deadline Alert",
        footerNote: "You are receiving this alert because you bookmarked this hackathon on HackerMate. To adjust notification alerts, edit your builder profile.",
      }),
    } };
  } catch (error) {
    logReminderError("[Deadline reminders] Eligibility unavailable", error);
    return { status: "unavailable" };
  }
}

/** Final database read. The RPC checks the saved relationship, completion marker and registration together. */
async function verifyPending(db: SupabaseClient, reminder: ReminderIdentity,
  prepared: Extract<Awaited<ReturnType<typeof prepareReminder>>, { status: "ready" }>): Promise<"ready" | "changed" | "unavailable"> {
  try {
    const { data, error } = await db.rpc("get_pending_deadline_reminders").eq("saved_id", reminder.savedId)
      .limit(2).abortSignal(AbortSignal.timeout(10_000));
    if (error || !Array.isArray(data) || data.length > 1) {
      logReminderError("[Deadline reminders] Final eligibility unavailable", error);
      return "unavailable";
    }
    if (data.length === 0) return "changed";
    const row = data[0];
    const current = reminderIdentity(row);
    if (!current || current.savedId !== reminder.savedId || current.digest !== reminder.digest ||
        emailAddress(row.user_email) !== prepared.payload.to || row.hackathon_name !== prepared.name ||
        (row.user_name || "Builder") !== prepared.recipientName || !withinReminderWindow(reminder.deadline)) return "changed";
    return "ready";
  } catch (error) {
    logReminderError("[Deadline reminders] Final eligibility unavailable", error);
    return "unavailable";
  }
}

async function markReminderCompleted(db: SupabaseClient, reminder: ReminderIdentity): Promise<boolean> {
  try {
    const at = new Date().toISOString();
    const { data, error } = await db.from("saved_hackathons").update({ reminder_sent_at: at })
      .eq("id", reminder.savedId).eq("user_id", reminder.userId).eq("hackathon_id", reminder.hackathonId)
      .is("reminder_sent_at", null).select("id,reminder_sent_at").abortSignal(AbortSignal.timeout(10_000));
    if (!error && Array.isArray(data) && data.length === 1 && data[0]?.id === reminder.savedId &&
        normalizeReminderDeadline(data[0].reminder_sent_at) === normalizeReminderDeadline(at)) return true;
    logReminderError("[Deadline reminders] Completion receipt unavailable", error);
  } catch (error) {
    logReminderError("[Deadline reminders] Completion write failed", error);
  }
  return false;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Reminders service unavailable" }, { status: 503, headers: noCache });
  const expected = Buffer.from("Bearer " + secret);
  const actual = Buffer.from(req.headers.get("authorization") || "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !key?.trim()) {
    return NextResponse.json({ error: "Reminders service unavailable", retrySafe: false }, { status: 503, headers: noCache });
  }

  const counts = {
    discovered: 0, claimed: 0, attempted: 0, accepted: 0, sentCount: 0, sandboxAccepted: 0,
    rejected: 0, unknownCount: 0, duplicates: 0, deferred: 0, suppressed: 0, invalid: 0, configurationUnavailable: 0,
    infrastructureFailures: 0, journalFailures: 0, completionFailures: 0, completed: 0,
  };
  let accounting: { status: "recorded" | "failed" | "not_required" } = { status: "not_required" };
  let db: SupabaseClient | undefined;
  try {
    db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const client = db;
    const from = process.env.RESEND_FROM_EMAIL || "";
    const sandbox = from.toLowerCase().includes("onboarding@resend.dev");
    const sandboxTarget = sandbox ? process.env.RESEND_SANDBOX_RECIPIENT?.trim() : undefined;
    const configured = Boolean(process.env.RESEND_API_KEY?.trim() && from.trim() && (!sandbox || emailAddress(sandboxTarget)));
    const fingerprint = (payload: EmailPayload) =>
      createHash("sha256").update(JSON.stringify([payload, sandboxTarget ?? null])).digest("hex");
    for await (const candidate of discoverReminders(client)) {
      counts.discovered++;
      if (!configured) {
        counts.configurationUnavailable++;
        continue;
      }
      const reminder = reminderIdentity(candidate);
      if (!reminder) {
        counts.invalid++;
        continue;
      }
      const preflight = await prepareReminder(client, reminder, from);
      if (preflight.status !== "ready") {
        if (preflight.status === "unavailable") counts.infrastructureFailures++;
        else counts.deferred++;
        continue;
      }
      const reservation = await claimDeadlineReminder(client, reminder);
      if (reservation.status === "duplicate") {
        counts.duplicates++;
        continue;
      }
      if (reservation.status === "unavailable") {
        counts.infrastructureFailures++;
        continue;
      }
      counts.claimed++;
      const claim = reservation.claim;
      const suppress = async (owner: typeof claim, reason: "changed" | "unavailable") => {
        counts.suppressed++;
        if (reason === "unavailable") counts.infrastructureFailures++;
        const saved = await transitionDeadlineReminder(client, owner, {
          status: "suppressed", category: reason === "changed" ? "eligibility_changed" : "eligibility_unavailable",
        });
        if (!saved) counts.journalFailures++;
      };
      const payloadHash = fingerprint(preflight.payload);
      const armed = await transitionDeadlineReminder(client, claim, { status: "dispatching", payloadHash });
      if (!armed) {
        counts.journalFailures++;
        counts.infrastructureFailures++;
        continue;
      }
      const prepared = await prepareReminder(client, reminder, from);
      if (prepared.status !== "ready" || fingerprint(prepared.payload) !== payloadHash) {
        await suppress(armed, prepared.status === "unavailable" ? "unavailable" : "changed");
        continue;
      }
      const eligibility = await verifyPending(client, reminder, prepared);
      if (eligibility !== "ready") {
        await suppress(armed, eligibility);
        continue;
      }

      let dispatch: EmailDispatch;
      try {
        dispatch = await dispatchEmail(prepared.payload, { idempotencyKey: "hm-deadline-reminder/v1/" + reminder.digest, redirect: "error" });
      } catch {
        dispatch = { status: "unknown", attempted: true, intendedRecipientAccepted: false, sandbox,
          reason: "Provider response unavailable.", retrySafe: false };
      }
      if (dispatch.attempted) counts.attempted++;
      const status = dispatch.status === "accepted" ? "accepted" : dispatch.status === "not_dispatched" ? "not_dispatched"
        : dispatch.status === "failed" && dispatch.providerStatus !== 429 ? "rejected" : "unknown";
      if (status === "accepted") {
        counts.accepted++;
        if (dispatch.intendedRecipientAccepted) counts.sentCount++;
        else counts.sandboxAccepted++;
      } else if (status === "unknown") counts.unknownCount++;
      else if (status === "rejected") counts.rejected++;
      else counts.configurationUnavailable++;

      const category = status === "accepted" ? (dispatch.sandbox ? "sandbox" : undefined)
        : status === "rejected" ? "provider_rejection"
          : status === "unknown" ? "ambiguous_provider" : "provider_configuration";
      const providerId = dispatch.providerId && /^[a-z0-9_-]{1,128}$/i.test(dispatch.providerId) ? dispatch.providerId : undefined;
      if (!await transitionDeadlineReminder(client, armed, { status, category, providerId, providerStatus: dispatch.providerStatus })) {
        counts.journalFailures++;
      }
      if (dispatch.intendedRecipientAccepted) {
        if (await markReminderCompleted(client, reminder)) counts.completed++;
        else counts.completionFailures++;
      }
    }
  } catch (error) {
    logReminderError("[Deadline reminders] Batch interrupted", error);
    counts.infrastructureFailures++;
  }
  if (db && counts.accepted > 0) {
    try {
      accounting = await recordEmailSendSuccess(db, "notifications", counts.accepted, logReminderError);
    } catch (error) {
      logReminderError("[Deadline reminders] Acceptance accounting unavailable", error);
      accounting = { status: "failed" };
    }
  }
  const success = counts.sentCount === counts.discovered && !counts.infrastructureFailures &&
    !counts.journalFailures && !counts.completionFailures && accounting.status !== "failed";
  const blocked = counts.attempted === 0 && (counts.infrastructureFailures > 0 || counts.configurationUnavailable > 0);
  const status = blocked ? "blocked" : success ? "complete" : "partial";
  return NextResponse.json({
    success, status, ...counts, failedCount: counts.rejected + counts.configurationUnavailable,
    heldCount: counts.duplicates + counts.claimed - counts.sentCount,
    bookkeeping: counts.completionFailures ? "failed" : counts.completed ? "recorded" : "not_required",
    accounting, retrySafe: false,
    message: "Counts represent provider acceptance only. Review held attempts and persistence failures before resending.",
  }, { status: blocked ? 503 : 200, headers: noCache });
}
