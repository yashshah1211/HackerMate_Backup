import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { getTodayEmailUsageSummary } from "@/lib/admin/emailBudgetGuard";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;

    // 1. Fetch profiles safely with optional referrer_source
    let profilesData = null;
    let profilesErr = null;

    const { data: pData, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, is_banned, role, created_at, onboarding_completed, referrer_source")
      .order("created_at", { ascending: false });

    if (pErr) {
      // Fallback if referrer_source column does not exist on remote DB yet
      console.warn("[Admin Dashboard API] Retrying profiles select without referrer_source:", pErr.message);
      const { data: fallbackData, error: fallbackErr } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, is_banned, role, created_at, onboarding_completed")
        .order("created_at", { ascending: false });

      profilesData = fallbackData || [];
      profilesErr = fallbackErr;
    } else {
      profilesData = pData || [];
    }

    // 2. Fetch user reports
    const { data: reportsData } = await supabaseAdmin
      .from("user_reports")
      .select("*")
      .order("created_at", { ascending: false });

    // 3. Fetch teams safely
    let teamsData = null;
    const { data: tData, error: tErr } = await supabaseAdmin
      .from("teams")
      .select("*, team_members(id)")
      .order("created_at", { ascending: false });

    if (tErr) {
      console.warn("[Admin Dashboard API] Teams fetch warning:", tErr.message);
      const { data: fallbackTeams } = await supabaseAdmin
        .from("teams")
        .select("*")
        .order("created_at", { ascending: false });
      teamsData = fallbackTeams || [];
    } else {
      teamsData = tData || [];
    }

    // 4. Fetch daily email usage summary
    const emailUsage = await getTodayEmailUsageSummary(supabaseAdmin);

    return NextResponse.json({
      success: true,
      users: profilesData || [],
      reports: reportsData || [],
      teams: teamsData || [],
      emailUsage,
    });
  } catch (err: any) {
    console.error("[Admin Dashboard API] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load admin dashboard data" },
      { status: 500 }
    );
  }
}
