import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";
import { fetchRecentGmailMessages } from "@/lib/admin/gmailClient";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireOutreachAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;

    // Check if Gmail credentials exist in env
    const hasGmailConfig =
      !!process.env.GMAIL_CLIENT_ID &&
      !!process.env.GMAIL_CLIENT_SECRET &&
      !!process.env.GMAIL_REFRESH_TOKEN;

    if (!hasGmailConfig) {
      return NextResponse.json({
        configured: false,
        message: "Gmail OAuth 2.0 credentials (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN) are not set in .env.local.",
        syncedCount: 0,
      });
    }

    // 1. Fetch recent Gmail messages from inbox
    const messages = await fetchRecentGmailMessages("label:INBOX", 50);

    if (messages.length === 0) {
      return NextResponse.json({
        configured: true,
        message: "No recent incoming messages found in Gmail inbox.",
        syncedCount: 0,
      });
    }

    // 2. Fetch active leads that are waiting for response or pitch
    const { data: activeLeads, error: leadsErr } = await supabaseAdmin
      .from("organizer_leads")
      .select("*")
      .not("organizer_email", "is", null);

    if (leadsErr || !activeLeads || activeLeads.length === 0) {
      return NextResponse.json({
        configured: true,
        message: "No active organizer leads found in database.",
        syncedCount: 0,
      });
    }

    // Index active leads by organizer email
    const leadMap = new Map<string, any>();
    activeLeads.forEach((l) => {
      if (l.organizer_email) {
        // Split multiple comma-separated emails if present
        const emails = l.organizer_email.split(",").map((e: string) => e.trim().toLowerCase());
        emails.forEach((e: string) => leadMap.set(e, l));
      }
      if (l.last_sent_to) {
        leadMap.set(l.last_sent_to.trim().toLowerCase(), l);
      }
    });

    let syncedCount = 0;
    const updatedLeadDetails: any[] = [];

    // Negotiation keywords to auto-detect stage
    const negotiationKeywords = ["partner", "call", "telegram", "sponsor", "deal", "meeting", "pricing", "banner", "co-brand"];

    // 3. Match messages against leads
    for (const msg of messages) {
      const lead = leadMap.get(msg.fromEmail);

      if (lead) {
        // Build formatted reply note entry
        const formattedDate = new Date(msg.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        const newNoteSnippet = `💬 Gmail Reply (${formattedDate}): "${msg.snippet}"`;

        // Don't duplicate if exact snippet already in notes
        const existingNotes = lead.notes || "";
        if (existingNotes.includes(msg.snippet) || existingNotes.includes(msg.messageId)) {
          continue; // Already logged
        }

        const combinedNotes = existingNotes
          ? `${existingNotes}\n\n${newNoteSnippet}`
          : newNoteSnippet;

        // Auto-detect stage: if keywords match, promote to 'negotiating', else 'replied'
        const lowerSnippet = (msg.snippet + " " + msg.subject).toLowerCase();
        const isNegotiating = negotiationKeywords.some((kw) => lowerSnippet.includes(kw));
        const targetStatus = lead.status === "partner_live" ? "partner_live" : isNegotiating ? "negotiating" : "replied";

        const nowIso = new Date().toISOString();
        const { error: updateErr } = await supabaseAdmin
          .from("organizer_leads")
          .update({
            status: targetStatus,
            notes: combinedNotes,
            updated_at: nowIso,
          })
          .eq("id", lead.id);

        if (!updateErr) {
          syncedCount++;
          updatedLeadDetails.push({
            id: lead.id,
            title: lead.title,
            from: msg.fromEmail,
            status: targetStatus,
            snippet: msg.snippet,
          });

          // Update local memory map to prevent duplicate updates in same run
          lead.notes = combinedNotes;
          lead.status = targetStatus;
        }
      }
    }

    return NextResponse.json({
      configured: true,
      success: true,
      syncedCount,
      matchedLeads: updatedLeadDetails,
      message: syncedCount > 0
        ? `Successfully synced ${syncedCount} new organizer reply email(s) into CRM!`
        : "Gmail scan complete — no new organizer replies detected.",
    });
  } catch (err: any) {
    console.error("[Sync Gmail Replies API] Exception:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
