import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { runScheduledOrganizerOutreach } from "@/lib/admin/scheduledOrganizerOutreach";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from("Bearer " + secret);
  const actual = Buffer.from(req.headers.get("authorization") || "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Outreach service unavailable" }, { status: 503 });
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await runScheduledOrganizerOutreach(db);
    const status = result.status === "blocked" || result.status === "partial" ? 503 : 200;
    return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[Scheduled organizer outreach] Eligibility or execution unavailable; no automatic retry.");
    return NextResponse.json({ status: "blocked", error: "Organizer outreach unavailable; inspect before retry." },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
