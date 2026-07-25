import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS, only used server-side
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // 1. Counts
    const [{ count: userCount }, { count: hackathonCount }, { count: teamCount }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("hackathons").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("teams").select("id", { count: "exact", head: true }),
      ]);

    // 2. Builders — prefer profiles that have completed onboarding + have a bio
    const { data: builders } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, college, bio, skills, avatar_url")
      .not("full_name", "is", null)
      .eq("onboarding_completed", true)
      .order("created_at", { ascending: false })
      .limit(6);

    // 3. Recent hackathons
    const { data: hackathons } = await supabaseAdmin
      .from("hackathons")
      .select("id, name, mode, location, prize_pool, tags, type, website_url, start_date")
      .order("start_date", { ascending: false })
      .limit(4);

    // 4. Teams with linked hackathon name via junction table
    const { data: teams } = await supabaseAdmin
      .from("teams")
      .select("id, name, description, max_members, team_hackathons(hackathons(name))")
      .order("created_at", { ascending: false })
      .limit(4);

    return NextResponse.json({
      userCount: userCount ?? 0,
      hackathonCount: hackathonCount ?? 0,
      teamCount: teamCount ?? 0,
      builders: builders ?? [],
      hackathons: hackathons ?? [],
      teams: teams ?? [],
    });
  } catch (err) {
    console.error("Public showcase API error:", err);
    return NextResponse.json({ error: "Failed to load showcase data" }, { status: 500 });
  }
}
