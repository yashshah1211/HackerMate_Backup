import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";
import { synchronizeCatalog } from "@/lib/hackathons/synchronize";
import { reviewLegacyEvidenceBatch } from "@/lib/hackathons/legacyEvidence";

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
    let afterId: string | undefined, limit: number | undefined;
    if (body) {
      let input: unknown;
      try { input = JSON.parse(body); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
      if (!input || typeof input !== "object" || Array.isArray(input) || !("mode" in input) || typeof input.mode !== "string" || !["preview", "sync", "preview-legacy"].includes(input.mode)) {
        return NextResponse.json({ error: "Specify mode preview, preview-legacy or sync" }, { status: 400 });
      }
      mode = input.mode;
      if ("afterId" in input) { if (typeof input.afterId !== "string" || input.afterId && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.afterId)) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 }); afterId = input.afterId; }
      if ("limit" in input) { if (typeof input.limit !== "number" || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50) return NextResponse.json({ error: "Limit must be 1–50" }, { status: 400 }); limit = input.limit; }
    }
    if (mode === "preview-legacy") return NextResponse.json(await reviewLegacyEvidenceBatch(auth.supabaseAdmin, { afterId, limit }));
    return NextResponse.json(await synchronizeCatalog(auth.supabaseAdmin, { dryRun: mode !== "sync" }));
  } catch (error) {
    console.error("[Catalog] Synchronization unavailable:", error);
    return NextResponse.json({ error: "Catalog synchronization unavailable. No direct-write fallback was attempted." }, { status: 503 });
  }
}
