import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";
import { isLeadId, REMOVED_LEADS_PAGE_SIZE, restorationErrorCode } from "@/lib/admin/organizerLeadRestore";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  try {
    const auth = await requireOutreachAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const params = req.nextUrl.searchParams;
    const cursor = params.get("cursor");
    if ([...params.keys()].some(key => key !== "cursor") || params.getAll("cursor").length > 1 ||
        (cursor !== null && !isLeadId(cursor))) {
      return NextResponse.json({ error: "Invalid removed-lead cursor." }, { status: 400, headers });
    }
    let query = auth.supabaseAdmin.from("organizer_leads")
      .select("id,title,pitch_sent_at,last_sent_to,open_count")
      .eq("status", "removed").order("id", { ascending: true }).limit(REMOVED_LEADS_PAGE_SIZE + 1);
    if (cursor) query = query.gt("id", cursor.toLowerCase());
    const { data, error } = await query;
    if (error || !Array.isArray(data)) {
      console.error("[Removed Leads] Database read failed:", restorationErrorCode(error));
      return NextResponse.json({ error: "Removed leads unavailable. Try refreshing." }, { status: 500, headers });
    }
    const page = data.slice(0, REMOVED_LEADS_PAGE_SIZE);
    return NextResponse.json({ leads: page.map(row => ({
      id: row.id, title: row.title, pitchSentAt: row.pitch_sent_at,
      hasLastRecipient: Boolean(row.last_sent_to?.trim()), imageRequests: row.open_count ?? 0,
    })), nextCursor: data.length > REMOVED_LEADS_PAGE_SIZE ? page.at(-1)!.id : null }, { headers });
  } catch (error) {
    console.error("[Removed Leads] Request failed:", restorationErrorCode(error));
    return NextResponse.json({ error: "Removed leads unavailable. Try refreshing." }, { status: 500, headers });
  }
}
