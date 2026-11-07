import { NextRequest, NextResponse } from "next/server";
import { fetchPlatformAnalytics, generateAnalyticsPdfBuffer, generateEmailHtml } from "@/lib/admin/analyticsSummary";
import { createHash } from "node:crypto";
import { analyticsDigestClaimClient, claimAnalyticsDigest, transitionAnalyticsDigest, logAnalyticsClaimError } from "@/lib/admin/analyticsDigestClaim";

async function handleAnalyticsSummary(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const format = req.nextUrl.searchParams.get("format");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const isLocalDev = process.env.NODE_ENV !== "production";

    if (!isCronAuthorized && !(isLocalDev && format === "pdf")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["GET", "POST"].includes(req.method)) {
      return NextResponse.json({ success: false, error: "Method not allowed." }, { status: 405, headers: { Allow: "GET, POST" } });
    }
    const parameters = [...req.nextUrl.searchParams];
    // Next's Node adapter provides a stream even for a bodyless POST.
    const contentLength = req.headers.get("content-length");
    const hasPayload = req.headers.has("transfer-encoding") || (contentLength !== null && !/^0+$/.test(contentLength));
    if (hasPayload || parameters.length > 1 || parameters.some(([key, value]) => key !== "format" || value !== "pdf")) {
      return NextResponse.json({ success: false, error: "Only an optional format=pdf query and no request body are supported." }, { status: 400 });
    }

    const analytics = await fetchPlatformAnalytics();
    const todayStr = new Date(analytics.generatedAt).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata",
    });
    const pdfBuffer = generateAnalyticsPdfBuffer(analytics, todayStr);
    const filename = `HackerMate_Daily_Platform_Digest_${todayStr.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    const headers = { "Cache-Control": "private, no-store", "X-Analytics-Database-Status": analytics.databaseStatus };

    if (format === "pdf") {
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"` },
      });
    }

    const recipient = process.env.ADMIN_CONTACT_EMAIL || process.env.RESEND_SANDBOX_RECIPIENT || "yashshah7117@gmail.com";
    const result = { recipient, pdfGenerated: true, analyticsSummary: analytics };
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json({
        ...result, success: false,
        dispatch: { status: "failed", reason: "Email dispatch is not configured; no request was sent." },
      }, { status: 503, headers });
    }

    const emailPayload = {
      from: process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>",
      to: [recipient],
      subject: `📊 HackerMate Daily Platform Digest — ${todayStr} (database counts: ${analytics.databaseStatus})`,
      html: generateEmailHtml(analytics, todayStr),
      attachments: [{ filename, content: pdfBuffer.toString("base64") }],
    };

    const db = analyticsDigestClaimClient();
    const reservation = db ? await claimAnalyticsDigest(db, new Date(analytics.generatedAt),
      createHash("sha256").update(JSON.stringify(emailPayload)).digest("hex")) : { status: "unavailable" as const };
    if (reservation.status !== "acquired" || !db) {
      return NextResponse.json({ success: false, retrySafe: false, claim: { status: reservation.status },
        dispatch: { status: "not_dispatched", reason: reservation.status === "duplicate"
          ? "Today's analytics digest is already claimed or held. Review provider history; do not resend."
          : "Analytics claim unavailable or unconfirmed; no provider request from this call. Review durable state." },
      }, { status: reservation.status === "duplicate" ? 409 : 503, headers });
    }
    const started = await transitionAnalyticsDigest(db, reservation.claim, "dispatching");
    if (!started) {
      return NextResponse.json({ success: false, retrySafe: false, claim: { status: "held" }, bookkeeping: "failed",
        dispatch: { status: "not_dispatched", reason: "Dispatch transition unconfirmed; no provider request from this call. Claim remains held." },
      }, { status: 503, headers });
    }
    const finish = async (state: "accepted" | "rejected" | "unknown", providerStatus?: number, providerId?: string) =>
      await transitionAnalyticsDigest(db, started, state, { providerStatus, providerId }) ? "recorded" : "failed";

    let resendRes: Response;
    try {
      resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json",
          "Idempotency-Key": "hm-analytics-summary/v1/" + started.evidence.reportingDate },
        body: JSON.stringify(emailPayload),
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      });
    } catch {
      // The provider may have accepted the request before the connection failed.
      // Do not claim rejection or retry automatically when the outcome is unknown.
      return NextResponse.json({
        ...result, success: false, retrySafe: false, bookkeeping: await finish("unknown"),
        dispatch: { status: "unknown", reason: "No provider response received; acceptance could not be confirmed." },
      }, { status: 502, headers });
    }

    if (!resendRes.ok) {
      const rejected = resendRes.status >= 400 && resendRes.status < 500 && ![408, 409, 429].includes(resendRes.status);
      return NextResponse.json({
        ...result, success: false, retrySafe: false, bookkeeping: await finish(rejected ? "rejected" : "unknown", resendRes.status),
        dispatch: { status: rejected ? "failed" : "unknown", providerStatus: resendRes.status,
          reason: rejected ? "Email provider rejected the request; daily claim retained." : "Provider acceptance is unknown; daily claim retained. Do not resend." },
      }, { status: 502, headers });
    }

    const acknowledgement: unknown = await resendRes.json().catch(() => null);
    if (!acknowledgement || typeof acknowledgement !== "object" || Array.isArray(acknowledgement) ||
      !("id" in acknowledgement) || typeof acknowledgement.id !== "string" ||
      !acknowledgement.id.trim() || "error" in acknowledgement ||
      ("mock" in acknowledgement && acknowledgement.mock) || ("sandbox" in acknowledgement && acknowledgement.sandbox)) {
      return NextResponse.json({
        ...result, success: false, retrySafe: false, bookkeeping: await finish("unknown", resendRes.status),
        dispatch: { status: "unknown", providerStatus: resendRes.status, reason: "Provider response lacked a valid acceptance acknowledgement." },
      }, { status: 502, headers });
    }

    return NextResponse.json({
      ...result, success: true, resendId: acknowledgement.id, retrySafe: false,
      bookkeeping: await finish("accepted", resendRes.status, acknowledgement.id),
      dispatch: { status: "accepted", providerStatus: resendRes.status, reason: "Provider accepted the request; delivery is not confirmed." },
    }, { headers });
  } catch (err: unknown) {
    logAnalyticsClaimError(err);
    return NextResponse.json({ success: false, retrySafe: false, error: "Analytics outcome unavailable. Review durable state and provider history before another attempt." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleAnalyticsSummary(req);
}

export async function POST(req: NextRequest) {
  return handleAnalyticsSummary(req);
}
