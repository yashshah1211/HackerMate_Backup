import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchDatabaseActivity,
  generateDatabaseActivityPdf,
  DatabaseActivityData,
} from "@/lib/admin/databaseActivityReport";
import { requireAdmin } from "@/lib/admin/requireAdmin";

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

function generateEmailHtml(data: DatabaseActivityData, dateStr: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://hackermate.in";
  const adminLink = `${baseUrl}/admin`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>HackerMate Daily Database Activity Digest</title>
</head>
<body style="background-color: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 28px;">
    
    <div style="border-bottom: 1px solid #27272a; padding-bottom: 16px; margin-bottom: 20px;">
      <span style="color: #B4F461; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; font-family: monospace;">SYSTEM DATABASE AUDIT</span>
      <h1 style="color: #ffffff; font-size: 22px; margin: 6px 0 4px 0;">HackerMate Database Activity Log</h1>
      <p style="color: #a1a1aa; font-size: 12px; margin: 0;">Date: ${dateStr} • Window: Past 24 Hours • Total New Records: <strong>${data.summary.totalNewItems}</strong></p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="6" style="margin-bottom: 20px;">
      <tr>
        <td width="50%" style="background-color: #09090b; border: 1px solid #27272a; border-radius: 8px; padding: 12px;">
          <div style="font-size: 10px; font-weight: 700; color: #a1a1aa; text-transform: uppercase;">New Builders</div>
          <div style="font-size: 22px; font-weight: 900; color: #ffffff; margin-top: 2px;">+${data.summary.newBuilders}</div>
        </td>
        <td width="50%" style="background-color: #09090b; border: 1px solid #27272a; border-radius: 8px; padding: 12px;">
          <div style="font-size: 10px; font-weight: 700; color: #a1a1aa; text-transform: uppercase;">New Teams Formed</div>
          <div style="font-size: 22px; font-weight: 900; color: #B4F461; margin-top: 2px;">+${data.summary.newTeams}</div>
        </td>
      </tr>
      <tr>
        <td width="50%" style="background-color: #09090b; border: 1px solid #27272a; border-radius: 8px; padding: 12px;">
          <div style="font-size: 10px; font-weight: 700; color: #a1a1aa; text-transform: uppercase;">Team Members Added</div>
          <div style="font-size: 22px; font-weight: 900; color: #a5b4fc; margin-top: 2px;">+${data.summary.newMembers}</div>
        </td>
        <td width="50%" style="background-color: #09090b; border: 1px solid #27272a; border-radius: 8px; padding: 12px;">
          <div style="font-size: 10px; font-weight: 700; color: #a1a1aa; text-transform: uppercase;">Invites & Connections</div>
          <div style="font-size: 22px; font-weight: 900; color: #fbbf24; margin-top: 2px;">+${data.summary.newInvites + data.summary.newRequests}</div>
        </td>
      </tr>
    </table>

    <div style="background-color: #09090b; border: 1px solid #27272a; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <h3 style="color: #ffffff; font-size: 13px; margin: 0 0 10px 0; text-transform: uppercase;">Detailed Record Breakdown</h3>
      <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #1f242d; font-size: 12px;">
        <span style="color: #d4d4d8;">New Builders (profiles):</span>
        <span style="color: #B4F461; font-weight: bold;">${data.summary.newBuilders}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #1f242d; font-size: 12px;">
        <span style="color: #d4d4d8;">New Teams (teams):</span>
        <span style="color: #B4F461; font-weight: bold;">${data.summary.newTeams}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #1f242d; font-size: 12px;">
        <span style="color: #d4d4d8;">Team Member Additions (team_members):</span>
        <span style="color: #a5b4fc; font-weight: bold;">${data.summary.newMembers}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #1f242d; font-size: 12px;">
        <span style="color: #d4d4d8;">Hackathon Registrations (team_hackathons):</span>
        <span style="color: #a5b4fc; font-weight: bold;">${data.team_hackathons.length}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #1f242d; font-size: 12px;">
        <span style="color: #d4d4d8;">Team Invites Sent (team_invites):</span>
        <span style="color: #fbbf24; font-weight: bold;">${data.summary.newInvites}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #1f242d; font-size: 12px;">
        <span style="color: #d4d4d8;">Connection Requests (friend_requests):</span>
        <span style="color: #fbbf24; font-weight: bold;">${data.summary.newRequests}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px;">
        <span style="color: #d4d4d8;">Chat Messages Volume (messages):</span>
        <span style="color: #38bdf8; font-weight: bold;">${data.messages_count_24h}</span>
      </div>
    </div>

    <div style="text-align: center; margin: 20px 0;">
      <a href="${adminLink}" style="display: inline-block; background-color: #B4F461; color: #09090b; font-weight: 800; font-size: 12px; padding: 10px 20px; border-radius: 6px; text-decoration: none; text-transform: uppercase;">Open Admin Dashboard →</a>
    </div>

    <div style="border-top: 1px solid #27272a; padding-top: 14px; font-size: 11px; color: #71717a; text-align: center;">
      📎 <b>Attached Document:</b> <code>HackerMate_Database_Activity_Report_${dateStr.replace(/\s+/g, "_")}.pdf</code>
      <br><br>
      Automated daily system report generated by HackerMate Operating System.
    </div>
  </div>
</body>
</html>
  `;
}

async function handleDatabaseActivityReport(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get("secret");
    const format = searchParams.get("format");
    const forceAll = searchParams.get("force") === "true";

    const isAuthorizedCron =
      (Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`) ||
      (Boolean(cronSecret) && secret === cronSecret);

    let isAuthorizedAdmin = false;
    if (!isAuthorizedCron) {
      const adminCheck = await requireAdmin(req);
      if (!(adminCheck instanceof NextResponse)) {
        isAuthorizedAdmin = true;
      }
    }

    const isLocalDev = process.env.NODE_ENV !== "production";

    if (!isAuthorizedCron && !isAuthorizedAdmin && !isLocalDev) {
      console.warn("[Database Activity Report Cron] Unauthorized trigger attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Fetch incremental activity data
    const activityData = await fetchDatabaseActivity(
      supabaseAdmin,
      forceAll ? undefined : undefined
    );

    // 2. Generate PDF Report Buffer
    const pdfBuffer = generateDatabaseActivityPdf(activityData);

    const todayStr = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });

    const filename = `HackerMate_Database_Activity_Report_${todayStr.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

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
    const resendApiKey = process.env.RESEND_API_KEY;
    const targetRecipient =
      process.env.ADMIN_CONTACT_EMAIL ||
      process.env.RESEND_SANDBOX_RECIPIENT ||
      "yashshah7117@gmail.com";

    const subject = `📊 HackerMate Daily Database Activity Report — ${todayStr} (+${activityData.summary.totalNewItems} new records)`;
    const htmlBody = generateEmailHtml(activityData, todayStr);

    if (!resendApiKey) {
      console.log("\n==================== [OFFLINE DATABASE ACTIVITY PDF REPORT] ====================");
      console.log(`To: ${targetRecipient}`);
      console.log(`Subject: ${subject}`);
      console.log(`PDF Size: ${pdfBuffer.length} bytes`);
      console.log(`New Records: ${activityData.summary.totalNewItems}`);
      console.log("=================================================================================\n");

      return NextResponse.json({
        success: true,
        mode: "mock_logged",
        recipient: targetRecipient,
        pdfSizeBytes: pdfBuffer.length,
        summary: activityData.summary,
        message: "PDF generated and logged. Set RESEND_API_KEY to dispatch live emails.",
      });
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>";
    const isSandbox = fromEmail.includes("onboarding@resend.dev");
    let finalRecipient = targetRecipient;
    let finalSubject = subject;

    if (isSandbox) {
      const sandboxEmail = process.env.RESEND_SANDBOX_RECIPIENT || targetRecipient;
      if (finalRecipient.toLowerCase() !== sandboxEmail.toLowerCase()) {
        finalSubject = `[Sandbox: ${targetRecipient}] ${subject}`;
        finalRecipient = sandboxEmail;
      }
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: finalRecipient,
        subject: finalSubject,
        html: htmlBody,
        attachments: [
          {
            filename,
            content: pdfBuffer.toString("base64"),
          },
        ],
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok || !resendData?.id) {
      console.error("[Database Activity Report] Resend API Error:", resendData);
      return NextResponse.json(
        { error: "Failed to dispatch PDF email via Resend API", details: resendData },
        { status: 500 }
      );
    }

    // 5. Update last_db_report_run in app_settings upon successful dispatch
    try {
      await supabaseAdmin.from("app_settings").upsert({
        key: "last_db_report_run",
        value: activityData.timeWindow.until,
      });
    } catch (saveErr) {
      console.warn("[Database Activity Report] Could not update last_db_report_run setting:", saveErr);
    }

    return NextResponse.json({
      success: true,
      deliveredTo: finalRecipient,
      resendId: resendData.id,
      pdfSizeBytes: pdfBuffer.length,
      summary: activityData.summary,
      message: `Daily Database Activity Report PDF successfully delivered to ${finalRecipient}!`,
    });
  } catch (err: any) {
    console.error("[Database Activity Report Cron Exception]:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleDatabaseActivityReport(req);
}

export async function POST(req: NextRequest) {
  return handleDatabaseActivityReport(req);
}
