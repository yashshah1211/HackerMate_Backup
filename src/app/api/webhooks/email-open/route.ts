import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifiedOrganizerTrackingId } from "@/lib/emailOpenTracking";

export const runtime = "nodejs";

// 1x1 Transparent GIF base64 string
const TRANSPARENT_GIF_BUFFER = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(req: NextRequest) {
  try {
    const leadId = verifiedOrganizerTrackingId(req.nextUrl.searchParams);

    if (leadId) {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

      const { error } = await supabaseAdmin.rpc("record_organizer_email_open", { p_lead_id: leadId });
      if (error) console.error("[Email Open Webhook] Atomic tracking update failed:", error);
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
