import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SIH_HACKATHON_ID } from "@/lib/constants";
import { recordEmailSendSuccess } from "@/lib/admin/emailBudgetGuard";
import { generateSIHPdfReport, SIHReportData } from "@/lib/admin/sihPdfReport";
import { requireAdmin } from "@/lib/admin/requireAdmin";

function isSameCollege(collegeA: string | null | undefined, collegeB: string | null | undefined): boolean {
  if (!collegeA || !collegeB) return false;
  const a = collegeA.toLowerCase().trim();
  const b = collegeB.toLowerCase().trim();
  if (a === b) return true;

  const isDJSCEA = a.includes("djsce") || a.includes("dwarkadas");
  const isDJSCEB = b.includes("djsce") || b.includes("dwarkadas");
  if (isDJSCEA && isDJSCEB) return true;

  const getFirstWord = (s: string) => s.split(/[\s,()]+/)[0];
  const w1 = getFirstWord(a);
  const w2 = getFirstWord(b);

  const acronyms = ["djsce", "spit", "vjti", "tsec", "vesit", "coep", "pict", "vit", "mit", "vnit", "iit", "nit", "iiit"];
  if (acronyms.includes(w1) && w1 === w2) return true;

  return a.includes(b) || b.includes(a);
}

export async function GET(req: NextRequest) {
  return handleSihDailyPdfReport(req);
}

export async function POST(req: NextRequest) {
  return handleSihDailyPdfReport(req);
}

async function handleSihDailyPdfReport(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;

    // 1. Verify Authorization: Either valid CRON_SECRET (Vercel Cron) OR logged-in Admin Session (Admin Dashboard UI)
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get("secret");

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

    if (!isAuthorizedCron && !isAuthorizedAdmin) {
      console.warn("[SIH Daily PDF Cron] Unauthorized trigger attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targetRecipient = "yashshah7117@gmail.com";

    // 2. Fetch SIH Telemetry Data from Supabase
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: registrations } = await supabaseAdmin
      .from("hackathon_registrations")
      .select(`
        id,
        user_id,
        looking_for_team,
        status,
        created_at,
        profiles (
          id,
          full_name,
          email,
          college,
          avatar_url,
          skills
        )
      `)
      .eq("hackathon_id", SIH_HACKATHON_ID);

    const { data: teamHackathons } = await supabaseAdmin
      .from("team_hackathons")
      .select(`
        team_id,
        created_at,
        teams (
          id,
          name,
          description,
          college,
          owner_id,
          max_members,
          team_members (
            id,
            user_id,
            profiles (
              id,
              full_name,
              email,
              college
            )
          )
        )
      `)
      .eq("hackathon_id", SIH_HACKATHON_ID);

    const rawTeams = (teamHackathons || []).map((th: any) => th.teams).filter(Boolean);

    // Grouping by College
    const collegeMap: Record<string, {
      canonicalName: string;
      builders: any[];
      teams: any[];
    }> = {};

    function getOrCreateCollegeGroup(rawCollegeName: string | null | undefined): string {
      if (!rawCollegeName || !rawCollegeName.trim()) return "Unspecified / Independent";
      const trimmed = rawCollegeName.trim();

      const existingKeys = Object.keys(collegeMap);
      for (const key of existingKeys) {
        if (isSameCollege(key, trimmed)) {
          return key;
        }
      }

      collegeMap[trimmed] = {
        canonicalName: trimmed,
        builders: [],
        teams: [],
      };
      return trimmed;
    }

    (registrations || []).forEach((reg: any) => {
      const p = reg.profiles;
      if (p) {
        const key = getOrCreateCollegeGroup(p.college);
        collegeMap[key].builders.push({
          ...p,
          looking_for_team: reg.looking_for_team,
          registered_at: reg.created_at,
        });
      }
    });

    rawTeams.forEach((t: any) => {
      let teamCollege = t.college;
      if (!teamCollege && t.team_members && t.team_members.length > 0) {
        const ownerMember = t.team_members.find((m: any) => m.user_id === t.owner_id) || t.team_members[0];
        teamCollege = ownerMember?.profiles?.college;
      }

      const key = getOrCreateCollegeGroup(teamCollege);
      collegeMap[key].teams.push(t);
    });

    const collegeStats = Object.values(collegeMap).map((group) => {
      const builderCount = group.builders.length;
      const lookingForTeamCount = group.builders.filter((b) => b.looking_for_team).length;
      const teamCount = group.teams.length;
      
      let totalTeamMembers = 0;
      group.teams.forEach((t) => {
        totalTeamMembers += (t.team_members || []).length;
      });

      const avgTeamSize = teamCount > 0 ? (totalTeamMembers / teamCount).toFixed(1) : "0";
      const isHighPotentialZeroTeams = builderCount >= 2 && teamCount === 0;

      return {
        collegeName: group.canonicalName,
        builderCount,
        lookingForTeamCount,
        teamCount,
        totalTeamMembers,
        avgTeamSize,
        isHighPotentialZeroTeams,
        builders: group.builders,
        teams: group.teams,
      };
    });

    collegeStats.sort((a, b) => {
      if (b.builderCount !== a.builderCount) return b.builderCount - a.builderCount;
      return b.teamCount - a.teamCount;
    });

    const totalBuilders = registrations?.length || 0;
    const totalLookingForTeam = (registrations || []).filter((r: any) => r.looking_for_team).length;
    const totalTeams = rawTeams.length;
    const totalColleges = collegeStats.length;
    const highPotentialZeroTeamColleges = collegeStats.filter((c) => c.isHighPotentialZeroTeams).length;

    const reportData: SIHReportData = {
      summary: {
        totalBuilders,
        totalLookingForTeam,
        totalTeams,
        totalColleges,
        highPotentialZeroTeamColleges,
      },
      collegeStats,
    };

    // 3. Generate PDF Report Buffer
    const pdfBuffer = generateSIHPdfReport(reportData);

    const dateStr = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });

    // 4. Construct Email Payload
    const subject = `📊 HackerMate SIH 2026 Daily Telemetry Report — ${dateStr}`;
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://hackermate.in";
    const adminLink = `${baseUrl}/admin`;

    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${subject}</title>
  <style>
    body { background-color: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; }
    .container { max-width: 580px; margin: 0 auto; background-color: #18181b; border: 1px solid #27272a; border-radius: 14px; padding: 28px; }
    .header { font-family: monospace; color: #a3e635; font-weight: 800; font-size: 16px; margin-bottom: 6px; }
    .title { font-size: 20px; font-weight: 800; color: #ffffff; margin-top: 0; margin-bottom: 8px; }
    .subtitle { font-size: 12px; color: #a1a1aa; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 24px; }
    .card { background-color: #09090b; border: 1px solid #27272a; border-radius: 10px; padding: 14px; }
    .card-label { font-size: 10px; font-weight: 700; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.5px; }
    .card-val { font-size: 22px; font-weight: 900; color: #ffffff; margin-top: 4px; }
    .btn { display: inline-block; background-color: #a3e635; color: #09090b !important; font-weight: 800; font-size: 12px; padding: 12px 24px; border-radius: 8px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.5px; }
    .footer { border-top: 1px solid #27272a; margin-top: 24px; padding-top: 16px; font-size: 11px; color: #71717a; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">HACKERMATE TELEMETRY DIGEST</div>
    <h1 class="title">🇮🇳 SIH 2026 Daily Report</h1>
    <div class="subtitle">Here is your automated morning telemetry update for Smart India Hackathon 2026. The full college breakdown PDF is attached to this email.</div>

    <table width="100%" cellpadding="0" cellspacing="8" style="margin-bottom: 20px;">
      <tr>
        <td width="50%" style="background-color: #09090b; border: 1px solid #27272a; border-radius: 10px; padding: 14px;">
          <div style="font-size: 10px; font-weight: 700; color: #a1a1aa; text-transform: uppercase;">Total SIH Builders</div>
          <div style="font-size: 24px; font-weight: 900; color: #ffffff; margin-top: 4px;">${totalBuilders}</div>
        </td>
        <td width="50%" style="background-color: #09090b; border: 1px solid #27272a; border-radius: 10px; padding: 14px;">
          <div style="font-size: 10px; font-weight: 700; color: #fbbf24; text-transform: uppercase;">Looking For Team</div>
          <div style="font-size: 24px; font-weight: 900; color: #fef08a; margin-top: 4px;">${totalLookingForTeam}</div>
        </td>
      </tr>
      <tr>
        <td width="50%" style="background-color: #09090b; border: 1px solid #27272a; border-radius: 10px; padding: 14px;">
          <div style="font-size: 10px; font-weight: 700; color: #34d399; text-transform: uppercase;">SIH Teams Formed</div>
          <div style="font-size: 24px; font-weight: 900; color: #a7f3d0; margin-top: 4px;">${totalTeams}</div>
        </td>
        <td width="50%" style="background-color: #09090b; border: 1px solid #27272a; border-radius: 10px; padding: 14px;">
          <div style="font-size: 10px; font-weight: 700; color: #f43f5e; text-transform: uppercase;">Bottleneck Colleges</div>
          <div style="font-size: 24px; font-weight: 900; color: #fecdd3; margin-top: 4px;">${highPotentialZeroTeamColleges}</div>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin-top: 24px; margin-bottom: 24px;">
      <a href="${adminLink}" class="btn" target="_blank">Open Admin Live Telemetry →</a>
    </div>

    <div class="footer">
      📎 <b>Attachment:</b> <code style="color: #a3e635;">SIH_Stats_Report_${dateStr.replace(/\s+/g, "_")}.pdf</code> (${Math.round(pdfBuffer.length / 1024)} KB)
      <br><br>
      Automated daily report generated by HackerMate Operating System for ${targetRecipient}.
    </div>
  </div>
</body>
</html>
`;

    // 5. Send via Resend REST API
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.log("\n==================== [OFFLINE SIH DAILY PDF REPORT] ====================");
      console.log(`To: ${targetRecipient}`);
      console.log(`Subject: ${subject}`);
      console.log(`PDF Size: ${pdfBuffer.length} bytes`);
      console.log("========================================================================\n");

      return NextResponse.json({
        success: true,
        mock: true,
        recipient: targetRecipient,
        pdfSizeBytes: pdfBuffer.length,
        message: "PDF generated and logged to terminal. Set RESEND_API_KEY to send live emails.",
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
            filename: `HackerMate_SIH_Daily_Report_${dateStr.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
            content: pdfBuffer.toString("base64"),
          },
        ],
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok || !resendData?.id) {
      console.error("[SIH Daily PDF Cron] Resend API Error:", resendData);
      return NextResponse.json(
        { success: false, error: "Failed to dispatch PDF email via Resend API", details: resendData },
        { status: 500 }
      );
    }

    try {
      await recordEmailSendSuccess(supabaseAdmin, "admin_reports", 1);
    } catch (dbErr) {
      console.warn("[SIH Daily PDF Cron] Failed to record email stats:", dbErr);
    }

    return NextResponse.json({
      success: true,
      recipient: targetRecipient,
      deliveredTo: finalRecipient,
      resendId: resendData.id,
      pdfSizeBytes: pdfBuffer.length,
      message: `SIH Daily PDF Report successfully emailed to ${targetRecipient}!`,
    });
  } catch (err: any) {
    console.error("[SIH Daily PDF Cron Catch Error]:", err);
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}
