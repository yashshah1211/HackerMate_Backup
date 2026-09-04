import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase credentials.");
  }
  return createClient(url, serviceRoleKey);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");

    let query = supabase
      .from("weekly_challenges")
      .select("id, challenge_number, title, slug, track, difficulty, summary, problem_pdf_url, additional_rules, status, starts_at, ends_at, created_at")
      .order("challenge_number", { ascending: false });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    } else {
      query = query.in("status", ["active", "closed"]);
    }

    let challenges: any[] = [];
    let { data: primaryData, error } = await query;

    if (error) {
      // Fallback query if optional columns do not exist yet
      let fallbackQuery = supabase
        .from("weekly_challenges")
        .select("id, challenge_number, title, slug, track, difficulty, summary, status, starts_at, ends_at, created_at")
        .order("challenge_number", { ascending: false });

      if (statusFilter) {
        fallbackQuery = fallbackQuery.eq("status", statusFilter);
      } else {
        fallbackQuery = fallbackQuery.in("status", ["active", "closed"]);
      }

      const fallbackRes = await fallbackQuery;
      if (fallbackRes.error) {
        console.error("[Challenges GET] Error fetching challenges:", fallbackRes.error);
        return NextResponse.json({ error: fallbackRes.error.message }, { status: 500 });
      }
      challenges = fallbackRes.data || [];
    } else {
      challenges = primaryData || [];
    }

    return NextResponse.json({ success: true, challenges: challenges || [] });
  } catch (err: any) {
    console.error("[Challenges GET] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
