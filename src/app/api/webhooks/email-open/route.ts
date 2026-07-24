import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 1x1 Transparent GIF base64 string
const TRANSPARENT_GIF_BUFFER = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(req: NextRequest) {
  try {
    const leadId = req.nextUrl.searchParams.get("id");

    if (leadId) {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Fetch current lead record
      const { data: lead } = await supabaseAdmin
        .from("organizer_leads")
        .select("id, status, open_count, opened_at")
        .eq("id", leadId)
        .single();

      if (lead) {
        const currentCount = lead.open_count || 0;
        const updates: any = {
          open_count: currentCount + 1,
          opened_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (lead.status === "pitch_sent" || lead.status === "new") {
          updates.status = "opened";
        }

        await supabaseAdmin
          .from("organizer_leads")
          .update(updates)
          .eq("id", leadId);
      }
    }
  } catch (err) {
    console.error("[Email Open Webhook] Error tracking open event:", err);
  }

  // Always return 1x1 transparent GIF without caching
  return new NextResponse(TRANSPARENT_GIF_BUFFER, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
