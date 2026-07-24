import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

export async function POST(req: NextRequest) {
  try {
    // 1. Strict Auth Gate - Restricted Exclusively to yashshah7117@gmail.com
    const supabaseUserClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: () => {},
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUserClient.auth.getUser();

    if (authError || !user || user.email !== "yashshah7117@gmail.com") {
      return NextResponse.json(
        { error: "Forbidden: Exclusive access for yashshah7117@gmail.com" },
        { status: 403 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Fetch ALL historical organizer leads from Day 1
    const { data: allLeads, error: fetchErr } = await supabaseAdmin
      .from("organizer_leads")
      .select("*")
      .neq("status", "removed")
      .order("created_at", { ascending: false });

    if (fetchErr) {
      console.error("[Outreach Summary PDF] DB Fetch Error:", fetchErr);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const leadsList = allLeads || [];
    const pitchedLeads = leadsList.filter(
      (l) => l.pitch_sent_at || l.status === "pitch_sent" || l.status === "opened" || l.status === "replied"
    );

    const totalLeads = leadsList.length;
    const totalPitchesSent = pitchedLeads.length;
    const totalOpened = pitchedLeads.filter(
      (l) => l.opened_at || (l.open_count && l.open_count > 0) || l.status === "opened"
    ).length;

    const openRate = totalPitchesSent > 0 ? Math.round((totalOpened / totalPitchesSent) * 100) : 0;
    const todayStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    // 3. Generate PDF Report using jsPDF
    const doc = new jsPDF({ unit: "pt", format: "letter" });

    // Header Dark Banner (#0A0D12)
    doc.setFillColor(10, 13, 18);
    doc.rect(0, 0, 612, 95, "F");

    // Emerald accent stripe (#10B981)
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 0, 612, 6, "F");

    // Title & Subtitle in header
    doc.setTextColor(16, 185, 129);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("HackerMate Organizer Outreach Engine", 40, 38);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text("Organizer Pitch & Open Tracking Digest", 40, 66);

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`All-Time Historical Digest (From Day 1 to ${todayStr})`, 40, 84);

    // KPI Metric Cards Grid
    // Card 1: Total Pitches Sent
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(40, 110, 120, 60, 4, 4, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("PITCHES SENT", 50, 128);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(20);
    doc.text(totalPitchesSent.toString(), 50, 154);

    // Card 2: Emails Opened
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(175, 110, 120, 60, 4, 4, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("EMAILS OPENED", 185, 128);
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(20);
    doc.text(totalOpened.toString(), 185, 154);

    // Card 3: Open Rate
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(310, 110, 120, 60, 4, 4, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("OPEN RATE", 320, 128);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(20);
    doc.text(`${openRate}%`, 320, 154);

    // Card 4: Total Scraped Leads
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(445, 110, 115, 60, 4, 4, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL LEADS", 455, 128);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(20);
    doc.text(totalLeads.toString(), 455, 154);

    // Table Header
    let y = 195;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Chronological History of Pitched Hackathons (From Day 1)", 40, y);

    y += 12;
    doc.setFillColor(241, 245, 249);
    doc.rect(40, y, 520, 18, "F");

    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("HACKATHON & HOST", 48, y + 12);
    doc.text("ORGANIZER CONTACT", 230, y + 12);
    doc.text("PITCH SENT", 390, y + 12);
    doc.text("STATUS / OPENS", 480, y + 12);

    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    if (pitchedLeads.length === 0) {
      y += 20;
      doc.setTextColor(100, 116, 139);
      doc.text("No pitches sent yet. Start sending pitches from the Organizer Outreach portal!", 48, y);
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
        const contactStr = (lead.organizer_email || "N/A").split(",")[0];
        const contactDisplay = contactStr.length > 28 ? contactStr.substring(0, 26) + "..." : contactStr;
        doc.text(contactDisplay, 230, y);

        const sentDateStr = lead.pitch_sent_at
          ? new Date(lead.pitch_sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "Sent";
        doc.text(sentDateStr, 390, y);

        const isOpened = lead.opened_at || (lead.open_count && lead.open_count > 0) || lead.status === "opened";
        if (isOpened) {
          doc.setTextColor(16, 185, 129);
          doc.setFont("helvetica", "bold");
          const opensText = lead.open_count > 1 ? `Opened (${lead.open_count}x)` : "Opened";
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

    // Footer
    doc.setDrawColor(226, 232, 240);
    doc.line(40, 740, 560, 740);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("HackerMate Organizer Outreach Digest • Generated automatically", 40, 752);
    doc.text(`Page 1`, 525, 752);

    const arrayBuffer = doc.output("arraybuffer");
    const pdfBuffer = Buffer.from(arrayBuffer);

    // 4. Send Email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    const recipientEmail = "yashshah7117@gmail.com";
    const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>";
    const subject = `📊 Organizer Outreach Summary (From Day 1): ${totalPitchesSent} Pitches, ${totalOpened} Opened (${openRate}%)`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0A0D12; color: #EDEFF3; padding: 32px 16px;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #10141B; border: 1px solid #1E242E; border-radius: 12px; padding: 32px;">
          <div style="font-size: 15px; font-weight: 800; color: #10B981; font-family: monospace; margin-bottom: 16px;">HackerMate Outreach Engine</div>
          <h1 style="font-size: 22px; font-weight: 700; color: #FFFFFF; margin: 0 0 8px 0;">🎯 Organizer Outreach Summary (From Day 1)</h1>
          <p style="font-size: 13px; color: #8B93A3; margin: 0 0 24px 0;">All-time historical digest generated on <strong>${todayStr}</strong>. PDF report attached below.</p>
          
          <table style="width: 100%; margin-bottom: 24px; border-spacing: 8px 0; border-collapse: separate;">
            <tr>
              <td style="width: 33%; background-color: #161B23; border: 1px solid #232A36; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="font-size: 10px; text-transform: uppercase; color: #8B93A3; margin-bottom: 4px;">Pitches Sent</div>
                <div style="font-size: 24px; font-weight: 800; color: #FFFFFF;">${totalPitchesSent}</div>
              </td>
              <td style="width: 33%; background-color: #161B23; border: 1px solid #232A36; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="font-size: 10px; text-transform: uppercase; color: #8B93A3; margin-bottom: 4px;">Emails Opened</div>
                <div style="font-size: 24px; font-weight: 800; color: #10B981;">${totalOpened}</div>
              </td>
              <td style="width: 33%; background-color: #161B23; border: 1px solid #232A36; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="font-size: 10px; text-transform: uppercase; color: #8B93A3; margin-bottom: 4px;">Open Rate</div>
                <div style="font-size: 24px; font-weight: 800; color: #10B981;">${openRate}%</div>
              </td>
            </tr>
          </table>

          <div style="font-size: 11px; color: #565E6D; border-top: 1px solid #171B23; padding-top: 16px; text-align: center;">
            Attached: <code>HackerMate_Outreach_Summary_From_Day_1.pdf</code>
          </div>
        </div>
      </div>
    `;

    if (!resendApiKey) {
      console.log("[Outreach Summary PDF] Mock dispatch - Resend API key missing");
      return NextResponse.json({
        success: true,
        mode: "mock_logged",
        metrics: { totalLeads, totalPitchesSent, totalOpened, openRate },
      });
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipientEmail,
        subject: subject,
        html: htmlBody,
        attachments: [
          {
            filename: `HackerMate_Outreach_Summary_From_Day_1_${todayStr.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
            content: pdfBuffer.toString("base64"),
          },
        ],
      }),
    });

    if (!resendRes.ok) {
      const errData = await resendRes.json();
      console.error("[Outreach Summary PDF] Resend API Error:", errData);
      return NextResponse.json({ error: "Failed to send email via Resend", details: errData }, { status: 500 });
    }

    const resendResult = await resendRes.json();

    return NextResponse.json({
      success: true,
      emailId: resendResult.id,
      recipient: recipientEmail,
      metrics: { totalLeads, totalPitchesSent, totalOpened, openRate },
    });
  } catch (err: any) {
    console.error("[Outreach Summary PDF] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
