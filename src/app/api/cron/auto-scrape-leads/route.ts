import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runMultiPlatformScraper } from "@/app/api/admin/scrape-unstop/route";
import { autoSendPitchEmailsForLeads, autoRemoveUnopenedPitchedLeads } from "@/lib/admin/autoSendPitches";
import { executeGmailInboxSync } from "@/app/api/admin/organizer-leads/sync-gmail-replies/route";

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate Cron Request (Standard CRON_SECRET or Local Dev)
    const authHeader = req.headers.get("Authorization");
    const cronSecret = process.env.CRON_SECRET;

    const isCronAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const isLocalDev = process.env.NODE_ENV !== "production";

    if (!isCronAuthorized && !isLocalDev) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Initialize Service Role Supabase Client for background execution
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Missing Supabase service key" }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 3. Scan Gmail Inbox for new organizer replies & auto-update CRM status
    const gmailSyncResult = await executeGmailInboxSync(supabaseAdmin);

    // 4. Auto-remove any organizers pitched >= 5 days ago with status = pitch_sent (no open / response)
    const autoRemoveResult = await autoRemoveUnopenedPitchedLeads(supabaseAdmin);

    // 5. Execute Multi-Platform Scraper Pipeline
    const scrapeResult = await runMultiPlatformScraper(supabaseAdmin);

    // 6. Ensure any remaining un-pitched leads are automatically sent pitch emails
    const pitchResult = await autoSendPitchEmailsForLeads(supabaseAdmin);

    return NextResponse.json({
      cronExecuted: true,
      timestamp: new Date().toISOString(),
      gmailSyncResult,
      autoRemoveResult,
      scrapeResult,
      autoPitchResult: {
        sent: pitchResult.sent,
        failed: pitchResult.failed,
        attempted: pitchResult.attempted,
      },
    });
  } catch (err: any) {
    console.error("[Cron Auto Scrape] Execution Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
