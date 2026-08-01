import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

export interface SentEmailLogItem {
  id: string;
  recipientEmail: string;
  recipientName: string;
  category: "Team Notifications" | "Organizer Outreach" | "SIH Broadcast" | "Onboarding Nudge" | "Contact Form" | "Test Dispatches";
  categoryKey: "notifications" | "outreach" | "sih_broadcast" | "nudges" | "contact_submissions" | "test_dispatches";
  subjectOrPurpose: string;
  status: "SUCCESS" | "FAILED";
  errorMessage?: string;
  timestamp: string; // ISO string
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

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const sentEmailLogs: SentEmailLogItem[] = [];

    if (supabaseUrl && serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // A. Fetch Organizer Outreach Leads
      const { data: leads } = await supabaseAdmin
        .from("organizer_leads")
        .select("id, title, organizer_email, last_sent_to, pitch_sent_at, status, created_at")
        .order("pitch_sent_at", { ascending: false });

      if (leads) {
        leads.forEach((lead: any) => {
          if (lead.pitch_sent_at || lead.last_sent_to || ["pitch_sent", "opened", "replied", "failed"].includes(lead.status)) {
            sentEmailLogs.push({
              id: `lead-${lead.id}`,
              recipientEmail: lead.organizer_email || lead.last_sent_to || "N/A",
              recipientName: lead.title || "Organizer Lead",
              category: "Organizer Outreach",
              categoryKey: "outreach",
              subjectOrPurpose: `Outreach Pitch: ${lead.title || 'Event Partnership'}`,
              status: lead.status === "failed" ? "FAILED" : "SUCCESS",
              errorMessage: lead.status === "failed" ? "Mail delivery bounced or rejected" : undefined,
              timestamp: lead.pitch_sent_at || lead.created_at,
            });
          }
        });
      }

      // B. Fetch SIH Broadcast Emails
      const { data: sihProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, sih_broadcast_sent_at")
        .not("sih_broadcast_sent_at", "is", null)
        .order("sih_broadcast_sent_at", { ascending: false });

      if (sihProfiles) {
        sihProfiles.forEach((p: any) => {
          sentEmailLogs.push({
            id: `sih-${p.id}`,
            recipientEmail: p.email,
            recipientName: p.full_name || "SIH Builder",
            category: "SIH Broadcast",
            categoryKey: "sih_broadcast",
            subjectOrPurpose: "SIH 2026 Team Matching & Recruitment Broadcast",
            status: "SUCCESS",
            timestamp: p.sih_broadcast_sent_at,
          });
        });
      }

      // C. Fetch Onboarding Nudge Emails
      const { data: nudgeProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, onboarding_nudge_sent_at")
        .not("onboarding_nudge_sent_at", "is", null)
        .order("onboarding_nudge_sent_at", { ascending: false });

      if (nudgeProfiles) {
        nudgeProfiles.forEach((p: any) => {
          sentEmailLogs.push({
            id: `nudge-${p.id}`,
            recipientEmail: p.email,
            recipientName: p.full_name || "Builder",
            category: "Onboarding Nudge",
            categoryKey: "nudges",
            subjectOrPurpose: "Complete your HackerMate profile to start matching",
            status: "SUCCESS",
            timestamp: p.onboarding_nudge_sent_at,
          });
        });
      }

      // D. Fetch Team Invites Sent
      const { data: teamInvites } = await supabaseAdmin
        .from("team_invites")
        .select("id, created_at, status, team_id, teams(name), profiles!team_invites_invited_user_id_fkey(full_name, email)")
        .order("created_at", { ascending: false });

      if (teamInvites) {
        teamInvites.forEach((inv: any) => {
          const teamName = inv.teams?.name || "Hackathon Team";
          const recipientEmail = inv.profiles?.email || "Unknown User";
          const recipientName = inv.profiles?.full_name || "Teammate";

          sentEmailLogs.push({
            id: `invite-${inv.id}`,
            recipientEmail,
            recipientName,
            category: "Team Notifications",
            categoryKey: "notifications",
            subjectOrPurpose: `Team Invitation: You were invited to join ${teamName}`,
            status: "SUCCESS",
            timestamp: inv.created_at,
          });
        });
      }

      // E. Fetch Connection Request Notifications
      const { data: friendReqs } = await supabaseAdmin
        .from("friend_requests")
        .select("id, created_at, status, sender:profiles!friend_requests_sender_id_fkey(full_name), receiver:profiles!friend_requests_receiver_id_fkey(full_name, email)")
        .order("created_at", { ascending: false });

      if (friendReqs) {
        friendReqs.forEach((req: any) => {
          const senderName = req.sender?.full_name || "A builder";
          const recipientEmail = req.receiver?.email;
          const recipientName = req.receiver?.full_name || "Builder";

          if (recipientEmail) {
            sentEmailLogs.push({
              id: `freq-${req.id}`,
              recipientEmail,
              recipientName,
              category: "Team Notifications",
              categoryKey: "notifications",
              subjectOrPurpose: `Connection Alert: ${senderName} sent you a connection request`,
              status: "SUCCESS",
              timestamp: req.created_at,
            });
          }
        });
      }
    }

    // Sort all email logs by timestamp DESC (newest first)
    sentEmailLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Filter past 24 hours logs
    const logs24h = sentEmailLogs.filter((l) => new Date(l.timestamp) >= twentyFourHoursAgo);
    // Use past 24h logs if available, fallback to recent overall logs if 24h is empty (e.g. testing in dev)
    const activeLogs = logs24h.length > 0 ? logs24h : sentEmailLogs;

    // Calculate Category Breakdown Counts (reusing Admin Panel category definitions)
    const categoryCounts = {
      notifications: activeLogs.filter((l) => l.categoryKey === "notifications").length,
      outreach: activeLogs.filter((l) => l.categoryKey === "outreach").length,
      sih_broadcast: activeLogs.filter((l) => l.categoryKey === "sih_broadcast").length,
      nudges: activeLogs.filter((l) => l.categoryKey === "nudges").length,
      contact_submissions: activeLogs.filter((l) => l.categoryKey === "contact_submissions").length,
      test_dispatches: activeLogs.filter((l) => l.categoryKey === "test_dispatches").length,
    };

    const totalSent24h = activeLogs.length;
    const failedLogs = activeLogs.filter((l) => l.status === "FAILED");
    const totalFailed24h = failedLogs.length;

    const todayStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    // 3. Generate Daily PDF Report via jsPDF
    const doc = new jsPDF({ unit: "pt", format: "letter" });

    // Header Dark Banner (#0A0D12)
    doc.setFillColor(10, 13, 18);
    doc.rect(0, 0, 612, 95, "F");

    // Accent Top Bar (#10B981)
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 0, 612, 6, "F");

    // Title & Subtitle
    doc.setTextColor(16, 185, 129);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("HackerMate Outbound Email Audit", 40, 36);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text("Daily Dispatched Emails Audit Report", 40, 62);

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${todayStr} | Window: Past 24 Hours | Total Emails: ${totalSent24h}`, 40, 80);

    // 4. Prominent Failure Callout Box
    let y = 110;
    if (totalFailed24h > 0) {
      doc.setFillColor(254, 242, 242); // Red background
      doc.setDrawColor(239, 68, 68);   // Red border
      doc.roundedRect(40, y, 532, 45, 6, 6, "FD");

      doc.setTextColor(185, 28, 28);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`⚠️ ATTENTION REQUIRED: ${totalFailed24h} Failed Email Send(s) Detected`, 55, y + 20);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(127, 29, 29);
      const failedRecipients = failedLogs.map((f) => f.recipientEmail).join(", ");
      doc.text(`Failed Recipients: ${failedRecipients.substring(0, 75)}${failedRecipients.length > 75 ? '...' : ''}`, 55, y + 35);
      y += 58;
    } else {
      doc.setFillColor(240, 253, 244); // Green background
      doc.setDrawColor(16, 185, 129);  // Green border
      doc.roundedRect(40, y, 532, 35, 6, 6, "FD");

      doc.setTextColor(4, 120, 87);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("✅ All Email Dispatches Delivered Successfully — 0 Failures Detected", 55, y + 22);
      y += 48;
    }

    // 5. Category Breakdown Summary Cards (6 Cards)
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Category Volume Summary (Past 24 Hours)", 40, y);
    y += 12;

    const cards = [
      { label: "TEAM NOTIFS", count: categoryCounts.notifications },
      { label: "OUTREACH", count: categoryCounts.outreach },
      { label: "SIH BROADCAST", count: categoryCounts.sih_broadcast },
      { label: "NUDGES", count: categoryCounts.nudges },
      { label: "CONTACT FORM", count: categoryCounts.contact_submissions },
      { label: "TOTAL LOGGED", count: totalSent24h },
    ];

    const cardWidth = 82;
    const cardGap = 8;
    cards.forEach((c, idx) => {
      const cx = 40 + idx * (cardWidth + cardGap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(cx, y, cardWidth, 44, 4, 4, "FD");

      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text(c.label, cx + 6, y + 14);

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.text(c.count.toString(), cx + 6, y + 34);
    });

    y += 56;

    // 6. Detailed Individual Email Log Table
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Individual Email Dispatch Log", 40, y);

    y += 10;
    doc.setFillColor(241, 245, 249);
    doc.rect(40, y, 532, 18, "F");

    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("TIME (UTC)", 48, y + 12);
    doc.text("RECIPIENT", 110, y + 12);
    doc.text("CATEGORY", 250, y + 12);
    doc.text("SUBJECT / PURPOSE", 360, y + 12);
    doc.text("STATUS", 520, y + 12);

    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    if (activeLogs.length === 0) {
      y += 16;
      doc.setTextColor(100, 116, 139);
      doc.text("No outbound emails recorded in this window.", 48, y);
    } else {
      activeLogs.forEach((item) => {
        if (y > 720) {
          doc.addPage();
          y = 40;

          // Repeat Table Header on new page
          doc.setFillColor(241, 245, 249);
          doc.rect(40, y, 532, 18, "F");
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(71, 85, 105);
          doc.text("TIME (UTC)", 48, y + 12);
          doc.text("RECIPIENT", 110, y + 12);
          doc.text("CATEGORY", 250, y + 12);
          doc.text("SUBJECT / PURPOSE", 360, y + 12);
          doc.text("STATUS", 520, y + 12);
          y += 18;
          doc.setFont("helvetica", "normal");
        }

        y += 15;

        // Column 1: Time
        const timeStr = item.timestamp
          ? new Date(item.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
          : "N/A";
        doc.setTextColor(100, 116, 139);
        doc.text(timeStr, 48, y);

        // Column 2: Recipient
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        const recStr = item.recipientEmail.length > 24 ? item.recipientEmail.substring(0, 22) + "..." : item.recipientEmail;
        doc.text(recStr, 110, y);

        // Column 3: Category
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(item.category, 250, y);

        // Column 4: Subject/Purpose
        doc.setTextColor(51, 65, 85);
        const subjStr = item.subjectOrPurpose.length > 30 ? item.subjectOrPurpose.substring(0, 28) + "..." : item.subjectOrPurpose;
        doc.text(subjStr, 360, y);

        // Column 5: Status (Bold Red if FAILED, Green if SUCCESS)
        if (item.status === "FAILED") {
          doc.setTextColor(220, 38, 38);
          doc.setFont("helvetica", "bold");
          doc.text("FAILED", 520, y);
        } else {
          doc.setTextColor(16, 185, 129);
          doc.setFont("helvetica", "bold");
          doc.text("SUCCESS", 520, y);
        }

        doc.setDrawColor(241, 245, 249);
        doc.line(40, y + 4, 572, y + 4);
      });
    }

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    // If caller explicitly requested PDF format directly in browser preview
    if (format === "pdf") {
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="HackerMate_Daily_Email_Audit_${todayStr.replace(/[^a-zA-Z0-9]/g, "_")}.pdf"`,
        },
      });
    }

    // 7. Dispatch Email Report via Resend Pipeline (Meta-report, does NOT increment outbound daily_email_stats counters)
    const resendApiKey = process.env.RESEND_API_KEY;
    const adminEmail = process.env.ADMIN_CONTACT_EMAIL || process.env.RESEND_SANDBOX_RECIPIENT || "yashshah7117@gmail.com";

    const subject = totalFailed24h > 0
      ? `⚠️ [ALERT] HackerMate Daily Sent Emails Log: ${totalSent24h} sent, ${totalFailed24h} FAILED`
      : `📋 HackerMate Daily Sent Emails Log: ${totalSent24h} emails sent (${todayStr})`;

    if (!resendApiKey) {
      console.log("==================== [DAILY SENT EMAILS AUDIT PDF LOG] ====================");
      console.log(`To: ${adminEmail}`);
      console.log(`Subject: ${subject}`);
      console.log(`Total 24h Dispatches: ${totalSent24h} | Failed: ${totalFailed24h}`);
      console.log("PDF attachment generated: HackerMate_Daily_Email_Audit.pdf");
      console.log("===========================================================================");
      return NextResponse.json({
        success: true,
        mode: "mock_logged",
        recipient: adminEmail,
        totalSent24h,
        totalFailed24h,
        categoryCounts,
        pdfGenerated: true
      });
    }

    let targetEmail = adminEmail;
    let finalSubject = subject;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "HackerMate <onboarding@resend.dev>";
    const isSandboxMode = fromEmail.includes("onboarding@resend.dev");

    if (isSandboxMode) {
      const sandboxEmail = process.env.RESEND_SANDBOX_RECIPIENT || "yashshah7117@gmail.com";
      if (targetEmail.toLowerCase() !== sandboxEmail.toLowerCase()) {
        finalSubject = `[Sandbox: ${targetEmail}] ${subject}`;
        targetEmail = sandboxEmail;
      }
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; background-color: #0A0D12; color: #E2E8F0; padding: 24px; borderRadius: 8px;">
        <h2 style="color: #10B981; margin-bottom: 4px;">HackerMate Outbound Email Audit</h2>
        <p style="color: #94A3B8; font-size: 14px; margin-top: 0;">Daily Sent Emails Log for ${todayStr}</p>
        
        ${totalFailed24h > 0 ? `
          <div style="background-color: #7F1D1D; border: 1px solid #EF4444; color: #FECACA; padding: 12px 16px; border-radius: 6px; margin: 16px 0; font-weight: bold;">
            ⚠️ ATTENTION: ${totalFailed24h} email dispatch(es) failed in the last 24 hours. Please review the attached PDF report.
          </div>
        ` : `
          <div style="background-color: #064E3B; border: 1px solid #10B981; color: #D1FAE5; padding: 12px 16px; border-radius: 6px; margin: 16px 0;">
            ✅ All ${totalSent24h} email dispatches delivered successfully with 0 failures.
          </div>
        `}

        <h3 style="color: #FFFFFF; font-size: 15px; margin-top: 20px;">Category Summary</h3>
        <ul style="color: #CBD5E1; font-size: 13px; line-height: 1.6;">
          <li><strong>Team Notifications:</strong> ${categoryCounts.notifications}</li>
          <li><strong>Organizer Outreach:</strong> ${categoryCounts.outreach}</li>
          <li><strong>SIH Broadcasts:</strong> ${categoryCounts.sih_broadcast}</li>
          <li><strong>Onboarding Nudges:</strong> ${categoryCounts.nudges}</li>
          <li><strong>Contact Form Replies:</strong> ${categoryCounts.contact_submissions}</li>
        </ul>

        <p style="font-size: 12px; color: #64748B; margin-top: 24px;">The full itemized log (recipient, category, subject line, status) is attached as a PDF report.</p>
      </div>
    `;

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
            filename: `HackerMate_Daily_Email_Audit_${todayStr.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
            content: pdfBuffer.toString("base64"),
          },
        ],
      }),
    });

    if (!resendRes.ok) {
      const errData = await resendRes.json();
      console.error("Resend API error sending daily email audit report PDF:", errData);
      return NextResponse.json({ error: "Failed to send email via Resend", details: errData }, { status: 500 });
    }

    const resendResult = await resendRes.json();

    return NextResponse.json({
      success: true,
      emailId: resendResult.id,
      recipient: targetEmail,
      subject: finalSubject,
      totalSent24h,
      totalFailed24h,
      categoryCounts,
      pdfAttached: true
    });

  } catch (err: any) {
    console.error("Error in daily-email-report route:", err);
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handleDailyEmailReport(req);
}

export async function GET(req: NextRequest) {
  return handleDailyEmailReport(req);
}
