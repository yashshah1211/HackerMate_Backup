import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const category = searchParams.get("category") || "all";
    const theme = searchParams.get("theme") || "all";
    const search = searchParams.get("search")?.trim() || "";
    const sort = searchParams.get("sort") === "created_at" ? "created_at" : "total_score";

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let query = supabaseAdmin
      .from("sih_mock_submissions_public")
      .select("*, teams(id, name, college, team_members(id, user_id, role, profiles(gender, full_name, avatar_url)))", { count: "exact" });

    if (category !== "all") {
      query = query.eq("ps_category", category);
    }

    if (theme !== "all") {
      query = query.ilike("theme", `%${theme}%`);
    }

    if (search) {
      query = query.or(`ps_number.ilike.%${search}%,ps_title.ilike.%${search}%`);
    }

    query = query
      .order(sort, { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    const { data: submissions, count, error } = await query;

    if (error) {
      console.error("[Mock SIH Leaderboard] Query Error:", error);
      return NextResponse.json({ error: "Failed to fetch leaderboard." }, { status: 500 });
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      submissions: submissions || [],
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err: any) {
    console.error("[Mock SIH Leaderboard] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
