import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

interface EmailLeadRecord {
  id: string;
  title: string;
  organizer_email: string | null;
  last_sent_to: string | null;
  pitch_sent_at: string | null;
  opened_at: string | null;
  open_count: number | null;
  status: string;
  created_at: string;
}

interface NudgeProfileRecord {
  id: string;
  full_name: string | null;
  email: string;
  created_at: string | null;
  onboarding_completed: boolean;
  onboarding_nudge_sent_at: string | null;
  last_seen_at: string | null;
}

async function handleDailyEmailReport(req: NextRequest) {
  try {
    // 1. Authenticate Cron Request
    const authHeader = req.headers.get("Authorization");
    const format = req.nextUrl.searchParams.get("format");
    const cronSecret = process.env.CRON_SECRET;

    const isCronAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const isLocalDev = process.env.NODE_ENV !== "production";

    if (!isCronAuthorized && !isLocalDev) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Initialize Supabase Admin Client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let pitchedLeads: EmailLeadRecord[] = [];
    let nudgedProfiles: NudgeProfileRecord[] = [];
    let totalPitchesSent = 0;
    let totalOpened = 0;
    let openRate = 0;
    let pitches24hCount = 0;
    let opens24hCount = 0;

    let nudgedTotalCount = 0;
    let nudged24hCount = 0;
    let visitedPostNudgeCount = 0;
    let completedPostNudgeCount = 0;
    let nudgeConversionRate = 0;

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    if (supabaseUrl && serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // A. Fetch Organizer Outreach Leads
      const { data: leads, error: leadsErr } = await supabaseAdmin
        .from("organizer_leads")
        .select("id, title, organizer_email, last_sent_to, pitch_sent_at, opened_at, open_count, status, created_at")
        .order("pitch_sent_at", { ascending: false });

      if (leadsErr) {
        console.error("[Daily Email Report] Supabase Outreach Fetch Error:", leadsErr);
      } else if (leads) {
        pitchedLeads = (leads as EmailLeadRecord[]).filter(
          (l) => l.pitch_sent_at || l.last_sent_to || ["pitch_sent", "opened", "replied"].includes(l.status)
        );

        totalPitchesSent = pitchedLeads.length;
        totalOpened = pitchedLeads.filter(
          (l) => l.opened_at || (l.open_count && l.open_count > 0) || l.status === "opened"
        ).length;
        openRate = totalPitchesSent > 0 ? Math.round((totalOpened / totalPitchesSent) * 100) : 0;

        pitches24hCount = pitchedLeads.filter((l) => l.pitch_sent_at && new Date(l.pitch_sent_at) >= twentyFourHoursAgo).length;
        opens24hCount = pitchedLeads.filter((l) => l.opened_at && new Date(l.opened_at) >= twentyFourHoursAgo).length;
      }

      // B. Fetch Onboarding Nudge User Profiles
      const { data: profiles, error: profilesErr } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, created_at, onboarding_completed, onboarding_nudge_sent_at, last_seen_at")
        .not("onboarding_nudge_sent_at", "is", null)
        .order("onboarding_nudge_sent_at", { ascending: false });

      if (profilesErr) {
        console.error("[Daily Email Report] Supabase Profiles Fetch Error:", profilesErr);
      } else if (profiles) {
        nudgedProfiles = profiles as NudgeProfileRecord[];
        nudgedTotalCount = nudgedProfiles.length;

        nudged24hCount = nudgedProfiles.filter((p) => p.onboarding_nudge_sent_at && new Date(p.onboarding_nudge_sent_at) >= twentyFourHoursAgo).length;

        // User returned/visited site after nudge if last_seen_at > onboarding_nudge_sent_at
        visitedPostNudgeCount = nudgedProfiles.filter((p) => {
          if (!p.onboarding_nudge_sent_at || !p.last_seen_at) return false;
          return new Date(p.last_seen_at).getTime() >= new Date(p.onboarding_nudge_sent_at).getTime() - 60000;
        }).length;

        // Users who completed onboarding post nudge
        completedPostNudgeCount = nudgedProfiles.filter((p) => p.onboarding_completed).length;
        nudgeConversionRate = nudgedTotalCount > 0 ? Math.round((completedPostNudgeCount / nudgedTotalCount) * 100) : 0;
      }
    }

    const todayStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    // 3. Generate PDF Report via jsPDF
    const doc = new jsPDF({ unit: "pt", format: "letter" });

    // Header Dark Banner (#0A0D12)
    doc.setFillColor(10, 13, 18);
    doc.rect(0, 0, 612, 95, "F");

    // Emerald accent stripe (#10B981)
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 0, 612, 6, "F");

    // Title & Subtitle in Header
    doc.setTextColor(16, 185, 129);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("HackerMate Growth & Dispatch Intelligence", 40, 38);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(19);
    doc.text("Daily Onboarding Nudges & Outreach Digest", 40, 66);

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Daily Analytics & User Activity Report Generated on ${todayStr}`, 40, 84);

    // KPI Metric Cards Grid (4 Cards)
    // Card 1: Onboarding Nudges Sent
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(40, 110, 120, 60, 4, 4, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("USERS NUDGED", 50, 128);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(20);
    doc.text(nudgedTotalCount.toString(), 50, 154);

    // Card 2: Returned / Visited Site
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(175, 110, 120, 60, 4, 4, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("VISITED SITE POST-NUDGE", 185, 128);
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(20);
    doc.text(visitedPostNudgeCount.toString(), 185, 154);

    // Card 3: Onboarding Completed %
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(310, 110, 120, 60, 4, 4, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("ONBOARDING CONV.", 320, 128);
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(20);
    doc.text(`${nudgeConversionRate}%`, 320, 154);

    // Card 4: Outreach Pitches Sent
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(445, 110, 115, 60, 4, 4, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("PITCHES SENT", 455, 128);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(20);
    doc.text(totalPitchesSent.toString(), 455, 154);

    // SECTION 1: Onboarding Nudges & User Site Visit Tracking
    let y = 195;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("1. User Onboarding Nudges & Site Visit Activity", 40, y);

    y += 12;
    doc.setFillColor(241, 245, 249);
    doc.rect(40, y, 520, 18, "F");

    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("USER / NAME", 48, y + 12);
    doc.text("EMAIL ADDRESS", 210, y + 12);
    doc.text("NUDGED AT", 350, y + 12);
    doc.text("LAST SEEN / VISITED", 440, y + 12);
    doc.text("ONBOARDING", 520, y + 12);

    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    if (nudgedProfiles.length === 0) {
      y += 18;
      doc.setTextColor(100, 116, 139);
      doc.text("No onboarding nudge emails sent yet.", 48, y);
    } else {
      nudgedProfiles.forEach((profile) => {
        if (y > 710) {
          doc.addPage();
          y = 40;
        }

        y += 16;
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        const nameStr = (profile.full_name || "Builder").length > 25 ? (profile.full_name || "Builder").substring(0, 23) + "..." : (profile.full_name || "Builder");
        doc.text(nameStr, 48, y);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        const emailStr = profile.email.length > 24 ? profile.email.substring(0, 22) + "..." : profile.email;
        doc.text(emailStr, 210, y);

        const nudgedDateStr = profile.onboarding_nudge_sent_at
          ? new Date(profile.onboarding_nudge_sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "N/A";
        doc.text(nudgedDateStr, 350, y);

        const hasVisited = profile.last_seen_at && profile.onboarding_nudge_sent_at && new Date(profile.last_seen_at).getTime() >= new Date(profile.onboarding_nudge_sent_at).getTime() - 60000;
        if (hasVisited && profile.last_seen_at) {
          const visitDateStr = new Date(profile.last_seen_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          doc.setTextColor(16, 185, 129);
          doc.setFont("helvetica", "bold");
          doc.text(`Visited (${visitDateStr})`, 440, y);
        } else {
          doc.setTextColor(148, 163, 184);
          doc.setFont("helvetica", "normal");
          doc.text("No Visit Yet", 440, y);
        }

        if (profile.onboarding_completed) {
          doc.setTextColor(16, 185, 129);
          doc.setFont("helvetica", "bold");
          doc.text("Completed", 520, y);
        } else {
          doc.setTextColor(245, 158, 11);
          doc.setFont("helvetica", "normal");
          doc.text("Pending", 520, y);
        }

        doc.setDrawColor(241, 245, 249);
        doc.line(40, y + 4, 560, y + 4);
      });
    }

    // SECTION 2: Organizer Outreach Pitches
    y += 30;
    if (y > 670) {
      doc.addPage();
      y = 40;
    }

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`2. Organizer Outreach Pitches (${totalPitchesSent} Total, ${openRate}% Open Rate)`, 40, y);

    y += 12;
    doc.setFillColor(241, 245, 249);
    doc.rect(40, y, 520, 18, "F");

    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("TARGET / HACKATHON", 48, y + 12);
    doc.text("RECIPIENT EMAIL", 230, y + 12);
    doc.text("DISPATCH DATE", 390, y + 12);
    doc.text("STATUS / OPENS", 480, y + 12);

    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    if (pitchedLeads.length === 0) {
      y += 18;
      doc.setTextColor(100, 116, 139);
      doc.text("No outreach pitches sent yet.", 48, y);
    } else {
      pitchedLeads.forEach((lead) => {
        if (y > 710) {
          doc.addPage();
          y = 40;
        }

        y += 16;
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        const titleStr = lead.title.length > 32 ? lead.title.substring(0, 30) + "..." : lead.title;
        doc.text(titleStr, 48, y);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        const contactEmail = lead.last_sent_to || lead.organizer_email || "N/A";
        const contactStr = contactEmail.split(",")[0];
        const contactDisplay = contactStr.length > 28 ? contactStr.substring(0, 26) + "..." : contactStr;
        doc.text(contactDisplay, 230, y);

        const sentDateStr = lead.pitch_sent_at
          ? new Date(lead.pitch_sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "Sent";
        doc.text(sentDateStr, 390, y);

        const isOpened = lead.opened_at || (lead.open_count && lead.open_count > 0) || lead.status === "opened";
        if (lead.status === "replied") {
          doc.setTextColor(139, 92, 246);
          doc.setFont("helvetica", "bold");
          doc.text("[REPLIED]", 480, y);
        } else if (isOpened) {
          doc.setTextColor(16, 185, 129);
          doc.setFont("helvetica", "bold");
          const opensText = lead.open_count && lead.open_count > 1 ? `Opened (${lead.open_count}x)` : "Opened";
          doc.text(`[YES] ${opensText}`, 480, y);
        } else {
          doc.setTextColor(148, 163, 184);
          doc.setFont("helvetica", "normal");
          doc.text("[NO] Unopened", 480, y);
        }

        doc.setDrawColor(241, 245, 249);
        doc.line(40, y + 4, 560, y + 4);
      });
    }

    // Dynamic Footer Stamp across all generated pages
    const totalPages = doc.getNumberOfPages();
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      doc.setPage(pageNum);
      doc.setDrawColor(226, 232, 240);
      doc.line(40, 740, 560, 740);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text("HackerMate Growth & Email Intelligence • Delivered Daily", 40, 752);
      doc.text(`Page ${pageNum} of ${totalPages}`, 480, 752);
    }

    const arrayBuffer = doc.output("arraybuffer");
    const pdfBuffer = Buffer.from(arrayBuffer);

    // If caller requested PDF inline display in browser (for testing)
    if (format === "pdf") {
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="HackerMate_Daily_Growth_Report_${todayStr.replace(/[^a-zA-Z0-9]/g, "_")}.pdf"`,
        },
      });
    }

    // 4. Construct Email Payload
    const recipientEmail =
      process.env.OUTREACH_ADMIN_EMAIL ||
      process.env.ADMIN_CONTACT_EMAIL ||
      process.env.RESEND_SANDBOX_RECIPIENT ||
      "yashshah7117@gmail.com";

    const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate Engine <onboarding@resend.dev>";
    const subject = `📊 Daily Email & Growth Digest: ${nudgedTotalCount} Nudged (${visitedPostNudgeCount} Visited Site), ${totalPitchesSent} Outreach Pitches`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0A0D12; color: #EDEFF3; padding: 32px 16px;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #10141B; border: 1px solid #1E242E; border-radius: 12px; padding: 32px;">
          <div style="font-size: 15px; font-weight: 800; color: #10B981; font-family: monospace; margin-bottom: 16px;">HackerMate Growth Intelligence</div>
          <h1 style="font-size: 22px; font-weight: 700; color: #FFFFFF; margin: 0 0 8px 0;">🚀 Daily Onboarding & Outreach Report</h1>
          <p style="font-size: 13px; color: #8B93A3; margin: 0 0 24px 0;">Comprehensive user conversion & email activity summary for <strong>${todayStr}</strong>. PDF attached.</p>
          
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #10B981; margin-bottom: 8px;">1. User Onboarding Nudges & Conversions</div>
          <table style="width: 100%; margin-bottom: 24px; border-spacing: 6px 0; border-collapse: separate;">
            <tr>
              <td style="width: 33%; background-color: #161B23; border: 1px solid #232A36; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 9px; text-transform: uppercase; color: #8B93A3; margin-bottom: 4px;">Users Nudged</div>
                <div style="font-size: 18px; font-weight: 800; color: #FFFFFF;">${nudgedTotalCount}</div>
              </td>
              <td style="width: 33%; background-color: #161B23; border: 1px solid #232A36; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 9px; text-transform: uppercase; color: #8B93A3; margin-bottom: 4px;">Visited Site</div>
                <div style="font-size: 18px; font-weight: 800; color: #10B981;">${visitedPostNudgeCount}</div>
              </td>
              <td style="width: 33%; background-color: #161B23; border: 1px solid #232A36; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 9px; text-transform: uppercase; color: #8B93A3; margin-bottom: 4px;">Completed Onboarding</div>
                <div style="font-size: 18px; font-weight: 800; color: #10B981;">${completedPostNudgeCount} (${nudgeConversionRate}%)</div>
              </td>
            </tr>
          </table>

          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #3B82F6; margin-bottom: 8px;">2. Organizer Outreach Performance</div>
          <table style="width: 100%; margin-bottom: 24px; border-spacing: 6px 0; border-collapse: separate;">
            <tr>
              <td style="width: 33%; background-color: #161B23; border: 1px solid #232A36; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 9px; text-transform: uppercase; color: #8B93A3; margin-bottom: 4px;">Pitches Sent</div>
                <div style="font-size: 18px; font-weight: 800; color: #FFFFFF;">${totalPitchesSent}</div>
              </td>
              <td style="width: 33%; background-color: #161B23; border: 1px solid #232A36; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 9px; text-transform: uppercase; color: #8B93A3; margin-bottom: 4px;">Emails Opened</div>
                <div style="font-size: 18px; font-weight: 800; color: #10B981;">${totalOpened}</div>
              </td>
              <td style="width: 33%; background-color: #161B23; border: 1px solid #232A36; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 9px; text-transform: uppercase; color: #8B93A3; margin-bottom: 4px;">Open Rate</div>
                <div style="font-size: 18px; font-weight: 800; color: #10B981;">${openRate}%</div>
              </td>
            </tr>
          </table>

          <div style="font-size: 11px; color: #565E6D; border-top: 1px solid #171B23; padding-top: 16px; text-align: center;">
            Attached PDF Report: <code>HackerMate_Daily_Growth_Report_${todayStr.replace(/[^a-zA-Z0-9]/g, "_")}.pdf</code>
          </div>
        </div>
      </div>
    `;

    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      console.log("[Daily Email Report] Mock execution — Resend API Key not present.");
      return NextResponse.json({
        success: true,
        mode: "mock_logged",
        recipient: recipientEmail,
        metrics: { nudgedTotalCount, visitedPostNudgeCount, completedPostNudgeCount, nudgeConversionRate, totalPitchesSent, totalOpened, openRate },
      });
    }

    let targetEmail = recipientEmail;
    let finalSubject = subject;
    const isSandboxMode = fromEmail.includes("onboarding@resend.dev");

    if (isSandboxMode) {
      const sandboxEmail = process.env.RESEND_SANDBOX_RECIPIENT || "yashshah7117@gmail.com";
      if (targetEmail.toLowerCase() !== sandboxEmail.toLowerCase()) {
        finalSubject = `[Sandbox: ${targetEmail}] ${subject}`;
        targetEmail = sandboxEmail;
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
        to: targetEmail,
        subject: finalSubject,
        html: htmlBody,
        attachments: [
          {
            filename: `HackerMate_Daily_Growth_Report_${todayStr.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
            content: pdfBuffer.toString("base64"),
          },
        ],
      }),
    });

    if (!resendRes.ok) {
      const errData = await resendRes.json();
      console.error("[Daily Email Report] Resend API Error:", errData);
      return NextResponse.json({ error: "Failed to dispatch daily report", details: errData }, { status: 500 });
    }

    const resendResult = await resendRes.json();

    return NextResponse.json({
      success: true,
      emailId: resendResult.id,
      recipient: targetEmail,
      metrics: { nudgedTotalCount, visitedPostNudgeCount, completedPostNudgeCount, nudgeConversionRate, totalPitchesSent, totalOpened, openRate },
    });
  } catch (err: any) {
    console.error("[Daily Email Report] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleDailyEmailReport(req);
}

export async function POST(req: NextRequest) {
  return handleDailyEmailReport(req);
}
