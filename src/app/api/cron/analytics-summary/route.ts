import { NextRequest, NextResponse } from "next/server";
import { fetchPlatformAnalytics, generateAnalyticsPdfBuffer, generateEmailHtml } from "@/lib/admin/analyticsSummary";

async function handleAnalyticsSummary(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const format = req.nextUrl.searchParams.get("format");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const isLocalDev = process.env.NODE_ENV !== "production";

    if (!isCronAuthorized && !isLocalDev) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    let resendRes: Response;
    try {
      resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(emailPayload),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // The provider may have accepted the request before the connection failed.
      // Do not claim rejection or retry automatically when the outcome is unknown.
      return NextResponse.json({
        ...result, success: false,
        dispatch: { status: "unknown", reason: "No provider response received; acceptance could not be confirmed." },
      }, { status: 502, headers });
    }

    if (!resendRes.ok) {
      return NextResponse.json({
        ...result, success: false,
        dispatch: { status: "failed", providerStatus: resendRes.status, reason: "Email provider rejected the request." },
      }, { status: 502, headers });
    }

    const acknowledgement: unknown = await resendRes.json().catch(() => null);
    if (!acknowledgement || typeof acknowledgement !== "object" ||
      !("id" in acknowledgement) || typeof acknowledgement.id !== "string" ||
      !acknowledgement.id.trim() || "error" in acknowledgement) {
      return NextResponse.json({
        ...result, success: false,
        dispatch: { status: "unknown", providerStatus: resendRes.status, reason: "Provider response lacked a valid acceptance acknowledgement." },
      }, { status: 502, headers });
    }

    return NextResponse.json({
      ...result, success: true, resendId: acknowledgement.id,
      dispatch: { status: "accepted", providerStatus: resendRes.status, reason: "Provider accepted the request; delivery is not confirmed." },
    }, { headers });
  } catch (err: unknown) {
    console.error("[Platform Analytics Digest] Exception:", err);
    return NextResponse.json({ success: false, error: "Could not generate analytics report." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleAnalyticsSummary(req);
}

export async function POST(req: NextRequest) {
  return handleAnalyticsSummary(req);
}
