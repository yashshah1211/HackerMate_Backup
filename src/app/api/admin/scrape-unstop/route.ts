import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";
import { synchronizeCatalog } from "@/lib/hackathons/synchronize";

export const maxDuration = 300;

/** Catalog preview by default; an explicit sync refreshes adopted sources and discovers new ones.
 * Legacy field adoption/backfill is deliberately unavailable through this endpoint. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireOutreachAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.text();
    if (body.length > 1024) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    let mode = "preview";
    if (body) {
      let input: unknown;
      try { input = JSON.parse(body); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
      if (!input || typeof input !== "object" || !("mode" in input) || !["preview", "sync"].includes(String(input.mode))) {
        return NextResponse.json({ error: "Specify mode preview or sync" }, { status: 400 });
      }
      mode = String(input.mode);
    }
    return NextResponse.json(await synchronizeCatalog(auth.supabaseAdmin, { dryRun: mode !== "sync" }));
  } catch (error) {
    console.error("[Catalog] Synchronization unavailable:", error);
    return NextResponse.json({ error: "Catalog synchronization unavailable. No direct-write fallback was attempted." }, { status: 503 });
  }
}
