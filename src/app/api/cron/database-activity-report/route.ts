import { recordEmailBookkeeping, dispatchEmail, dispatchHttpStatus, dispatchResponse } from "@/lib/emailDispatch";
import { claimScheduledDatabaseReport, recordScheduledDatabaseReportOutcome } from "@/lib/admin/dailyReportClaim";
import { recordEmailSendSuccess } from "@/lib/admin/emailBudgetGuard";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import {
  fetchDatabaseActivity,
} from "@/lib/admin/databaseActivityReport";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { pruneExpiredRateLimits, type RateLimitCleanupResult } from "@/lib/evaluator/rateLimitRetention";
import { fetchFounderMetrics, buildFounderBrief, founderBriefEmailHtml } from "@/lib/admin/founderBrief";
import { generateFounderBriefPdf } from "@/lib/admin/founderBriefPdf";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase credentials for Database Activity Report.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function handleDatabaseActivityReport(req: NextRequest) {
  let rateLimitCleanup: RateLimitCleanupResult | undefined;
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization") || "";
    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format");

    // Machine credentials authorize scheduled reporting only. PDF downloads
    // are interactive disclosures and always require human admin authorization.
    const expectedHeader = cronSecret ? Buffer.from(`Bearer ${cronSecret}`) : null;
    const receivedHeader = Buffer.from(authHeader);
    const isAuthorizedCron = Boolean(
      expectedHeader &&
      receivedHeader.length === expectedHeader.length &&
      timingSafeEqual(receivedHeader, expectedHeader)
    );

    if (format === "pdf" || !isAuthorizedCron) {
      const adminCheck = await requireAdmin(req);
      if (adminCheck instanceof NextResponse) {
        console.warn("[Database Activity Report Cron] Unauthorized trigger attempt.");
        return adminCheck;
      }
    }

    const supabaseAdmin = getSupabaseAdmin();
    // Reserve IST day before any scheduled email dispatch; an uncertain outcome
    // retains the claim for human review instead of allowing automatic retries.
    let scheduledClaimKey: string | null = null;
    if (isAuthorizedCron && format !== "pdf") {
      const claim = await claimScheduledDatabaseReport(supabaseAdmin);
      if (claim.status !== "reserved") {
        console.warn("[Database Activity Report] Scheduled email blocked:", claim.status);
        return NextResponse.json({
          success: false,
          error: claim.status === "duplicate"
            ? "This IST day's scheduled report has already been claimed. Review provider outcome before retrying."
            : "Could not reserve the scheduled report. No email was dispatched.",
        }, { status: claim.status === "duplicate" ? 409 : 503 });
      }
      scheduledClaimKey = claim.key;
    }


    // The existing daily Vercel invocation is GET + machine credentials. Human
    // report/PDF requests and POST requests never perform this expiry cleanup.
    if (isAuthorizedCron && req.method === "GET" && format !== "pdf") {
      rateLimitCleanup = await pruneExpiredRateLimits(supabaseAdmin);
    }

    // 0. Maintain daily streaks: Decay/reset lapsed streaks for inactive builders
    try {
      const { data: streakMaintenance, error: streakErr } = await supabaseAdmin.rpc("cleanup_lapsed_streaks");
      if (streakErr) {
        console.warn("[Database Activity Report Cron] Streak maintenance warning:", streakErr);
      } else {
        console.info("[Database Activity Report Cron] Streak maintenance completed:", streakMaintenance);
      }
    } catch (err) {
      console.warn("[Database Activity Report Cron] Streak maintenance non-fatal error:", err);
    }

    // 1. Fetch incremental activity data
    const activityData = await fetchDatabaseActivity(supabaseAdmin);
    const founderMetrics = await fetchFounderMetrics(supabaseAdmin, activityData.timeWindow);
    const founderBrief = buildFounderBrief(activityData, founderMetrics);

    // 2. Generate a privacy-conscious, narrative-first founder report.
    const pdfBuffer = generateFounderBriefPdf(founderBrief);

    const todayStr = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });

    const filename = `HackerMate_Daily_Founder_Brief_${todayStr.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

    // 3. If format=pdf requested, stream directly
    if (format === "pdf") {
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
        },
      });
    }

    // 4. Dispatch Email via Resend
    const targetRecipient =
      process.env.ADMIN_CONTACT_EMAIL ||
      process.env.RESEND_SANDBOX_RECIPIENT ||
      "yashshah7117@gmail.com";

    const subject = `HackerMate Daily Founder Brief — ${todayStr}`;
    const htmlBody = founderBriefEmailHtml(founderBrief);

    const dispatch = await dispatchEmail({ from: process.env.RESEND_FROM_EMAIL || "", to: targetRecipient, subject: subject, html: htmlBody,
      attachments: [{ filename: filename, content: pdfBuffer.toString("base64") }] });
    if (scheduledClaimKey) {
      const recorded = await recordScheduledDatabaseReportOutcome(supabaseAdmin, scheduledClaimKey, dispatch.status);
      if (!recorded) console.error("[Database Activity Report] Claim outcome update failed; no automatic resend is safe.");
    }
    const accounting = dispatch.status === "accepted" ? await recordEmailSendSuccess(supabaseAdmin, "admin_reports", 1) : { status: "not_required" };

    let bookkeeping = "not_required";
    if (dispatch.intendedRecipientAccepted) {
      bookkeeping = await recordEmailBookkeeping(() => supabaseAdmin.from("app_settings").upsert({ key: "last_db_report_run", value: activityData.timeWindow.until }).select("key"));
      if (bookkeeping === "failed") console.error("[Database Activity Report] Acceptance checkpoint unavailable.");
    }
    return NextResponse.json({ ...dispatchResponse(dispatch), accounting, bookkeeping, pdfGenerated: true,
      ...(rateLimitCleanup ? { rateLimitCleanup } : {}),
      metricsEvidence: "Founder insights are based on bounded database counts; incomplete metrics remain unavailable. Email acceptance is not delivery." }, { status: dispatchHttpStatus(dispatch) });

  } catch (err: unknown) {
    console.error("[Database Activity Report Cron Exception]:", err);
    const message = err && typeof err === "object" && "message" in err && typeof err.message === "string" ? err.message : "";
    return NextResponse.json({ error: message || "Internal server error.",
      ...(rateLimitCleanup ? { rateLimitCleanup } : {}) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleDatabaseActivityReport(req);
}

export async function POST(req: NextRequest) {
  return handleDatabaseActivityReport(req);
}
