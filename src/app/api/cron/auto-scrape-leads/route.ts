import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { synchronizeCatalog } from "@/lib/hackathons/synchronize";

export const maxDuration = 300;

/** Existing daily Hobby cron, catalog only. Manual outreach remains a separate authorized action. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Catalog service unavailable" }, { status: 503 });
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await synchronizeCatalog(client, { dryRun: false });
    return NextResponse.json({ cronExecuted: true, timestamp: new Date().toISOString(), ...result });
  } catch (error) {
    console.error("[Catalog cron] Synchronization unavailable:", error);
    return NextResponse.json({ error: "Catalog synchronization unavailable; no direct-write fallback." }, { status: 503 });
  }
}
