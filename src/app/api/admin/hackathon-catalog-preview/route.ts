import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";


export const maxDuration = 20;
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * Instant, read-only stored catalog snapshot. The legacy /api/admin/scrape-unstop
 * writer stays blocked by Vercel WAF. Live source checking belongs to the
 * existing scheduled catalog aggregator, never a dashboard button.
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

  // A dashboard preview must never start the costly network/provider sync.
  // Use three bounded aggregate queries of the stored catalog instead.
  const signal = AbortSignal.timeout(9000);
  try {
    const table = auth.supabaseAdmin.from("hackathons");
    const [all, withSourceMetadata, archived] = await Promise.all([
      table.select("id", { count: "exact", head: true }).abortSignal(signal),
      auth.supabaseAdmin.from("hackathons")
        .select("id", { count: "exact", head: true })
        .not("source_metadata", "is", null).abortSignal(signal),
      auth.supabaseAdmin.from("hackathons")
        .select("id", { count: "exact", head: true })
        .eq("archived", true).abortSignal(signal),
    ]);
    if (all.error || withSourceMetadata.error || archived.error
      || !Number.isSafeInteger(all.count) || !Number.isSafeInteger(withSourceMetadata.count)
      || !Number.isSafeInteger(archived.count)) {
      throw new Error("Catalog snapshot count unavailable.");
    }

    const total = all.count as number;
    const evidenced = withSourceMetadata.count as number;
    const hidden = archived.count as number;
    return NextResponse.json({
      success: true,
      dryRun: true,
      snapshotOnly: true,
      total,
      withSourceMetadata: evidenced,
      archived: hidden,
      message: `Catalog snapshot: ${total} saved listings, ${evidenced} with source metadata, ${hidden} archived. No live source checks, changes or emails.`,
    }, { headers: noStore });
  } catch (error) {
    console.error("[Catalog preview] Saved catalog summary unavailable:", error);
    return NextResponse.json(
      { error: "Catalog snapshot is temporarily unavailable. No catalog records or organizer emails were changed." },
      { status: 503, headers: noStore }
    );
  }
}
