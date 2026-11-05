import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { synchronizeCatalog } from "@/lib/hackathons/synchronize";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * Read-only admin catalog preview. The legacy /api/admin/scrape-unstop route
 * supports a write mode and intentionally remains blocked at Vercel's WAF.
 * NEVER accept a sync mode or forward a caller-controlled dryRun flag here.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  // Preserve the original outreach-operator allowlist as well as the current
  // protected-profile administrator/ban check. Do not widen this to all users.
  const approved = (
    process.env.OUTREACH_ADMIN_EMAIL ||
    process.env.NEXT_PUBLIC_OUTREACH_ADMIN_EMAIL ||
    process.env.ADMIN_CONTACT_EMAIL ||
    process.env.RESEND_SANDBOX_RECIPIENT ||
    "yashshah7117@gmail.com"
  ).split(",").map(email => email.trim().toLowerCase()).filter(Boolean);

  const email = auth.user.email?.trim().toLowerCase();
  if (!email || (email !== "yashshah7117@gmail.com" && !approved.includes(email))) {
    return NextResponse.json({ error: "Catalog preview is restricted to approved outreach administrators." },
      { status: 403, headers: noStore });
  }

  try {
    const result = await synchronizeCatalog(auth.supabaseAdmin, { dryRun: true });
    if (result.success !== true || result.dryRun !== true) {
      throw new Error("Unexpected catalog preview result");
    }
    // The button needs only aggregate information, not the full evidence
    // snapshots or organizer contacts from source providers.
    return NextResponse.json({
      success: true,
      dryRun: true,
      checked: result.checked,
      discovered: result.discovered,
      remaining: result.remaining,
      message: result.message,
    }, { headers: noStore });
  } catch (error) {
    console.error("[Catalog preview] Read-only source check unavailable:", error);
    return NextResponse.json(
      { error: "Catalog preview is temporarily unavailable. No catalog records or organizer emails were changed." },
      { status: 503, headers: noStore }
    );
  }
}
