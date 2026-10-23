import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { getTeamFormationReport, parseFormationWindow } from "@/lib/admin/teamFormationReport";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  try {
    const authorization = await requireAdmin(req);
    if (authorization instanceof NextResponse) {
      authorization.headers.set("Cache-Control", headers["Cache-Control"]); return authorization;
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || authorization.supabaseAdmin === authorization.supabaseUserClient) {
      return NextResponse.json({ error: "Global formation data requires privileged read configuration." }, { status: 503, headers });
    }
    let window;
    try { window = parseFormationWindow(req.nextUrl.searchParams); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid report window." }, { status: 400, headers }); }
    const result = await getTeamFormationReport(authorization.supabaseAdmin, window);
    return NextResponse.json(result, { status: result.coverage === "unavailable" ? 503 : 200, headers });
  } catch (error) {
    console.error("[team-formation] admin report unavailable:", error);
    return NextResponse.json({ error: "Team formation data is unavailable. Access, retention or database reads could not be verified." }, { status: 503, headers });
  }
}
