import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { getAttentionQueue, parseAttentionOptions } from "@/lib/admin/attentionQueue";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  try {
    const authorization = await requireAdmin(req);
    if (authorization instanceof NextResponse) {
      authorization.headers.set("Cache-Control", headers["Cache-Control"]);
      return authorization;
    }
    // requireAdmin can fall back to the caller's RLS-limited client. That would
    // return ownership-filtered subsets, not verified global queue totals.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || authorization.supabaseAdmin === authorization.supabaseUserClient) {
      return NextResponse.json({ error: "Global attention data is unavailable: privileged read configuration is required." }, { status: 503, headers });
    }
    let options;
    try { options = parseAttentionOptions(req.nextUrl.searchParams); }
    catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid queue parameters." }, { status: 400, headers });
    }
    const result = await getAttentionQueue(authorization.supabaseAdmin, authorization.user.id, options);
    return NextResponse.json(result, { status: result.coverage === "unavailable" ? 503 : 200, headers });
  } catch {
    return NextResponse.json({ error: "Attention data is unavailable. Access or database reads could not be verified." }, { status: 503, headers });
  }
}
