import { dispatchEmail, dispatchHttpStatus, dispatchResponse } from "@/lib/emailDispatch";
import { recordEmailSendSuccess } from "@/lib/admin/emailBudgetGuard";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

export interface SentEmailLogItem {
  id: string;
  recipientEmail: string;
  recipientName: string;
  category: "Team Notifications" | "Organizer Outreach" | "Onboarding Nudge" | "Contact Form" | "Test Dispatches";
  categoryKey: "notifications" | "outreach" | "nudges" | "contact_submissions" | "test_dispatches";
  subjectOrPurpose: string;
  status: "UNVERIFIED";
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
    let incompleteEvidence = !supabaseUrl || !serviceRoleKey;
    const sources = { outreach: false, nudges: false, invites: false, connections: false };

    if (supabaseUrl && serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // A. Fetch Organizer Outreach Leads
      const { data: leads, error: leadsError } = await supabaseAdmin
        .from("organizer_leads")
        .select("id, title, organizer_email, last_sent_to, pitch_sent_at, status, created_at")
        .order("pitch_sent_at", { ascending: false });

      if (leadsError) { incompleteEvidence = true; console.error("[Daily Email Report] Business evidence unavailable:", leadsError); }
      sources.outreach = !leadsError && Array.isArray(leads);
      if (Array.isArray(leads)) {
        leads.forEach((lead: any) => {
          if (lead.pitch_sent_at || lead.last_sent_to || ["pitch_sent", "opened", "replied", "failed"].includes(lead.status)) {
            sentEmailLogs.push({
              id: `lead-${lead.id}`,
              recipientEmail: lead.organizer_email || lead.last_sent_to || "N/A",
              recipientName: lead.title || "Organizer Lead",
              category: "Organizer Outreach",
              categoryKey: "outreach",
              subjectOrPurpose: `Outreach Pitch: ${lead.title || 'Event Partnership'}`,
              status: "UNVERIFIED",
              errorMessage: "Business record only; email outcome is unverified.",
              timestamp: lead.pitch_sent_at || lead.created_at,
            });
          }
        });
      }

      // B. Fetch Onboarding Nudge Emails
      const { data: nudgeProfiles, error: nudgeProfilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, last_onboarding_nudge_sent_at")
        .not("last_onboarding_nudge_sent_at", "is", null)
        .order("last_onboarding_nudge_sent_at", { ascending: false });

      if (nudgeProfilesError) { incompleteEvidence = true; console.error("[Daily Email Report] Business evidence unavailable:", nudgeProfilesError); }
      sources.nudges = !nudgeProfilesError && Array.isArray(nudgeProfiles);
      if (Array.isArray(nudgeProfiles)) {
        nudgeProfiles.forEach((p: any) => {
          sentEmailLogs.push({
            id: `nudge-${p.id}`,
            recipientEmail: p.email,
            recipientName: p.full_name || "Builder",
            category: "Onboarding Nudge",
            categoryKey: "nudges",
            subjectOrPurpose: "Complete your HackerMate profile to start matching",
            status: "UNVERIFIED",
            timestamp: p.last_onboarding_nudge_sent_at,
          });
        });
      }

      // C. Fetch Team Invites Sent
      const { data: teamInvites, error: teamInvitesError } = await supabaseAdmin
        .from("team_invites")
        .select("id, created_at, status, team_id, teams(name), profiles!team_invites_invited_user_id_fkey(full_name, email)")
        .order("created_at", { ascending: false });

      if (teamInvitesError) { incompleteEvidence = true; console.error("[Daily Email Report] Business evidence unavailable:", teamInvitesError); }
      sources.invites = !teamInvitesError && Array.isArray(teamInvites);
      if (Array.isArray(teamInvites)) {
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
            status: "UNVERIFIED",
            timestamp: inv.created_at,
          });
        });
      }

      // D. Fetch Connection Request Notifications
      const { data: friendReqs, error: friendReqsError } = await supabaseAdmin
        .from("friend_requests")
        .select("id, created_at, status, sender:profiles!friend_requests_sender_id_fkey(full_name), receiver:profiles!friend_requests_receiver_id_fkey(full_name, email)")
        .order("created_at", { ascending: false });

      if (friendReqsError) { incompleteEvidence = true; console.error("[Daily Email Report] Business evidence unavailable:", friendReqsError); }
      sources.connections = !friendReqsError && Array.isArray(friendReqs);
      if (Array.isArray(friendReqs)) {
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
              status: "UNVERIFIED",
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
    // Keep the requested window even when it contains no business records.
    const activeLogs = logs24h;

    // Calculate Category Breakdown Counts (reusing Admin Panel category definitions)
    const categoryCounts = {
      notifications: sources.invites && sources.connections ? activeLogs.filter((l) => l.categoryKey === "notifications").length : null,
      outreach: sources.outreach ? activeLogs.filter((l) => l.categoryKey === "outreach").length : null,
      nudges: sources.nudges ? activeLogs.filter((l) => l.categoryKey === "nudges").length : null,
      contact_submissions: null,
      test_dispatches: null,
    };

    const totalSent24h = activeLogs.length;

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
    doc.text("Daily Email Evidence Report", 40, 62);

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${todayStr} | Window: Past 24 Hours | Business Records: ${totalSent24h}`, 40, 80);

    // Business records cannot establish attempted/accepted/delivered or failed email totals.
    let y = 110;
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    doc.text(incompleteEvidence ? "Some source queries failed. Email totals are unavailable."
      : "Partial business evidence only. Email acceptance and delivery are unverified.", 40, y);
    y += 30;

    // 5. Category Breakdown Summary Cards (6 Cards)
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Category Volume Summary (Past 24 Hours)", 40, y);
    y += 12;

    const cards = [
      { label: "TEAM NOTIFS", count: categoryCounts.notifications ?? "Unavailable" },
      { label: "OUTREACH", count: categoryCounts.outreach ?? "Unavailable" },
      { label: "NUDGES", count: categoryCounts.nudges ?? "Unavailable" },
      { label: "CONTACT FORM", count: "Unavailable" },
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
    doc.text("Business Records - Email Outcomes Unverified", 40, y);

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
      doc.text("No business evidence found in this window; email totals unavailable.", 48, y);
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

        // Business state is never presented as provider acceptance or delivery.
        doc.setTextColor(100, 116, 139);
        doc.setFont("helvetica", "bold");
        doc.text("UNVERIFIED", 510, y);

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

    // 7. Dispatch the evidence report; provider acceptance is accounted independently of report metrics.
    const adminEmail = process.env.ADMIN_CONTACT_EMAIL || process.env.RESEND_SANDBOX_RECIPIENT || "yashshah7117@gmail.com";

    const subject = `HackerMate Daily Email Evidence: ${totalSent24h} business records (${todayStr})`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; background-color: #0A0D12; color: #E2E8F0; padding: 24px; borderRadius: 8px;">
        <h2 style="color: #10B981; margin-bottom: 4px;">HackerMate Outbound Email Audit</h2>
        <p style="color: #94A3B8; font-size: 14px; margin-top: 0;">Partial Business Evidence for ${todayStr}</p>
        
        <p style="color: #CBD5E1">Email acceptance, delivery and failure totals are unavailable. ${totalSent24h} business records were found; source evidence is ${incompleteEvidence ? "incomplete" : "partial"}.</p>

        <h3 style="color: #FFFFFF; font-size: 15px; margin-top: 20px;">Category Summary</h3>
        <ul style="color: #CBD5E1; font-size: 13px; line-height: 1.6;">
          <li><strong>Team Notifications:</strong> ${categoryCounts.notifications ?? "Unavailable"}</li>
          <li><strong>Organizer Outreach:</strong> ${categoryCounts.outreach ?? "Unavailable"}</li>
          <li><strong>Onboarding Nudges:</strong> ${categoryCounts.nudges ?? "Unavailable"}</li>
          <li><strong>Contact Form Replies:</strong> Unavailable</li>
        </ul>

        <p style="font-size: 12px; color: #64748B; margin-top: 24px;">The attached business-record sample is not a complete email ledger. Historical mocks, duplicate records and missing evidence may affect counts.</p>
      </div>
    `;

    const dispatch = await dispatchEmail({ from: process.env.RESEND_FROM_EMAIL || "", to: adminEmail, subject, html: htmlBody,
      attachments: [{ filename: `HackerMate_Daily_Email_Evidence.pdf`, content: pdfBuffer.toString("base64") }] });
    const accounting = dispatch.status === "accepted" && supabaseUrl && serviceRoleKey
      ? await recordEmailSendSuccess(createClient(supabaseUrl, serviceRoleKey), "admin_reports", 1) : { status: "not_required" };
    return NextResponse.json({ ...dispatchResponse(dispatch), accounting, pdfGenerated: true,
      metricsStatus: incompleteEvidence ? "unavailable" : "partial", businessRecordCount: totalSent24h,
      totalSent24h: null, totalFailed24h: null, categoryCounts,
      metricsNote: "Business records do not establish email dispatch or delivery. Complete totals are unavailable.",
    }, { status: dispatchHttpStatus(dispatch) });
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
