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
    let recentPitches24h: EmailLeadRecord[] = [];
    let totalPitchesSent = 0;
    let totalOpened = 0;
    let openRate = 0;
    let pitches24hCount = 0;
    let opens24hCount = 0;

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    if (supabaseUrl && serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: leads, error: fetchErr } = await supabaseAdmin
        .from("organizer_leads")
        .select("id, title, organizer_email, last_sent_to, pitch_sent_at, opened_at, open_count, status, created_at")
        .order("pitch_sent_at", { ascending: false });

      if (fetchErr) {
        console.error("[Daily Email Report] Supabase Fetch Error:", fetchErr);
      } else if (leads) {
        pitchedLeads = (leads as EmailLeadRecord[]).filter(
          (l) => l.pitch_sent_at || l.last_sent_to || ["pitch_sent", "opened", "replied"].includes(l.status)
        );

        totalPitchesSent = pitchedLeads.length;
        totalOpened = pitchedLeads.filter(
          (l) => l.opened_at || (l.open_count && l.open_count > 0) || l.status === "opened"
        ).length;
        openRate = totalPitchesSent > 0 ? Math.round((totalOpened / totalPitchesSent) * 100) : 0;

        recentPitches24h = pitchedLeads.filter((l) => {
          if (!l.pitch_sent_at) return false;
          const sentDate = new Date(l.pitch_sent_at);
          return sentDate >= twentyFourHoursAgo;
        });

        pitches24hCount = recentPitches24h.length;
        opens24hCount = pitchedLeads.filter((l) => {
          if (!l.opened_at) return false;
          return new Date(l.opened_at) >= twentyFourHoursAgo;
        }).length;
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
    doc.text("HackerMate Resend Dispatch Engine", 40, 38);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text("Daily Resend Email Activity Digest", 40, 66);

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Daily Report Generated on ${todayStr}`, 40, 84);

    // KPI Metric Cards Grid
    // Card 1: 24H Pitches Sent
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(40, 110, 120, 60, 4, 4, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("PAST 24H SENT", 50, 128);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(20);
    doc.text(pitches24hCount.toString(), 50, 154);

    // Card 2: 24H Opens
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(175, 110, 120, 60, 4, 4, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("PAST 24H OPENS", 185, 128);
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(20);
    doc.text(opens24hCount.toString(), 185, 154);

    // Card 3: All-Time Open Rate
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(310, 110, 120, 60, 4, 4, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("ALL-TIME OPEN RATE", 320, 128);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(20);
    doc.text(`${openRate}%`, 320, 154);

    // Card 4: Total Sent All-Time
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(445, 110, 115, 60, 4, 4, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL ALL-TIME SENT", 455, 128);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(20);
    doc.text(totalPitchesSent.toString(), 455, 154);

    // Table Header
    let y = 195;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Recent Resend Email Dispatches & Open Status", 40, y);

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
      y += 20;
      doc.setTextColor(100, 116, 139);
      doc.text("No emails dispatched yet. Send outreach emails via HackerMate to track activity here!", 48, y);
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
          ? new Date(lead.pitch_sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
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
      doc.text("HackerMate Resend Automated Digest • Delivered Daily", 40, 752);
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
          "Content-Disposition": `inline; filename="HackerMate_Daily_Resend_Report_${todayStr.replace(/[^a-zA-Z0-9]/g, "_")}.pdf"`,
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
    const subject = `📧 HackerMate Daily Email Activity Digest: ${pitches24hCount} Sent (24h), ${openRate}% Open Rate`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0A0D12; color: #EDEFF3; padding: 32px 16px;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #10141B; border: 1px solid #1E242E; border-radius: 12px; padding: 32px;">
          <div style="font-size: 15px; font-weight: 800; color: #10B981; font-family: monospace; margin-bottom: 16px;">HackerMate Resend Engine</div>
          <h1 style="font-size: 22px; font-weight: 700; color: #FFFFFF; margin: 0 0 8px 0;">📊 Daily Resend Email Activity Report</h1>
          <p style="font-size: 13px; color: #8B93A3; margin: 0 0 24px 0;">Automated daily summary generated for <strong>${todayStr}</strong>. PDF report attached below.</p>
          
          <table style="width: 100%; margin-bottom: 24px; border-spacing: 8px 0; border-collapse: separate;">
            <tr>
              <td style="width: 25%; background-color: #161B23; border: 1px solid #232A36; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 9px; text-transform: uppercase; color: #8B93A3; margin-bottom: 4px;">24h Sent</div>
                <div style="font-size: 20px; font-weight: 800; color: #FFFFFF;">${pitches24hCount}</div>
              </td>
              <td style="width: 25%; background-color: #161B23; border: 1px solid #232A36; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 9px; text-transform: uppercase; color: #8B93A3; margin-bottom: 4px;">24h Opens</div>
                <div style="font-size: 20px; font-weight: 800; color: #10B981;">${opens24hCount}</div>
              </td>
              <td style="width: 25%; background-color: #161B23; border: 1px solid #232A36; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 9px; text-transform: uppercase; color: #8B93A3; margin-bottom: 4px;">Open Rate</div>
                <div style="font-size: 20px; font-weight: 800; color: #10B981;">${openRate}%</div>
              </td>
              <td style="width: 25%; background-color: #161B23; border: 1px solid #232A36; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 9px; text-transform: uppercase; color: #8B93A3; margin-bottom: 4px;">Total Sent</div>
                <div style="font-size: 20px; font-weight: 800; color: #FFFFFF;">${totalPitchesSent}</div>
              </td>
            </tr>
          </table>

          <div style="font-size: 11px; color: #565E6D; border-top: 1px solid #171B23; padding-top: 16px; text-align: center;">
            Attached PDF: <code>HackerMate_Daily_Resend_Report_${todayStr.replace(/[^a-zA-Z0-9]/g, "_")}.pdf</code>
          </div>
        </div>
      </div>
    `;

    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      console.log("[Daily Email Report] Mock execution — Resend API Key not present in environment.");
      return NextResponse.json({
        success: true,
        mode: "mock_logged",
        recipient: recipientEmail,
        metrics: { pitches24hCount, opens24hCount, totalPitchesSent, totalOpened, openRate },
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
            filename: `HackerMate_Daily_Resend_Report_${todayStr.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
            content: pdfBuffer.toString("base64"),
          },
        ],
      }),
    });

    if (!resendRes.ok) {
      const errData = await resendRes.json();
      console.error("[Daily Email Report] Resend API Error:", errData);
      return NextResponse.json({ error: "Failed to dispatch daily email report", details: errData }, { status: 500 });
    }

    const resendResult = await resendRes.json();

    return NextResponse.json({
      success: true,
      emailId: resendResult.id,
      recipient: targetEmail,
      metrics: { pitches24hCount, opens24hCount, totalPitchesSent, totalOpened, openRate },
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
