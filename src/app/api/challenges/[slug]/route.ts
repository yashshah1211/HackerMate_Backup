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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = getSupabaseClient();

    const decodedSlug = decodeURIComponent(slug);
    const cleanSlug = decodedSlug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    let challenge: any = null;

    // 1. Exact cleanSlug match
    const { data: byCleanSlug } = await supabase
      .from("weekly_challenges")
      .select("*")
      .eq("slug", cleanSlug)
      .maybeSingle();
    challenge = byCleanSlug;

    // 2. Exact decodedSlug match
    if (!challenge) {
      const { data: byDecodedSlug } = await supabase
        .from("weekly_challenges")
        .select("*")
        .eq("slug", decodedSlug)
        .maybeSingle();
      challenge = byDecodedSlug;
    }

    // 3. UUID match
    if (!challenge && /^[0-9a-f-]{36}$/i.test(decodedSlug)) {
      const { data: byId } = await supabase
        .from("weekly_challenges")
        .select("*")
        .eq("id", decodedSlug)
        .maybeSingle();
      challenge = byId;
    }

    // 4. Fallback: fetch all challenges and match in JS memory or default to latest
    if (!challenge) {
      const { data: allChallenges } = await supabase
        .from("weekly_challenges")
        .select("*")
        .order("created_at", { ascending: false });

      if (allChallenges && allChallenges.length > 0) {
        challenge = allChallenges.find((c) => {
          const cSlug = (c.slug || "").toLowerCase();
          const cTitle = (c.title || "").toLowerCase();
          const searchKey = cleanSlug.replace(/-/g, " ");
          return (
            cSlug === cleanSlug ||
            cSlug === decodedSlug.toLowerCase() ||
            cSlug.includes(cleanSlug) ||
            cleanSlug.includes(cSlug) ||
            cTitle.includes(searchKey) ||
            searchKey.includes(cTitle)
          );
        }) || allChallenges[0];
      }
    }

    if (!challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    // Optional user teams lookup
    const authHeader = req.headers.get("Authorization");
    let userTeams: Array<{ id: string; name: string }> = [];

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabase.auth.getUser(token);
      const userId = userData?.user?.id;

      if (userId) {
        const { data: memberRows } = await supabase
          .from("team_members")
          .select("team_id, teams(id, name)")
          .eq("user_id", userId);

        if (memberRows && memberRows.length > 0) {
          userTeams = memberRows
            .map((r: any) => r.teams)
            .filter(Boolean) as Array<{ id: string; name: string }>;
        }
      }
    }

    return NextResponse.json({
      success: true,
      challenge,
      userTeams,
    });
  } catch (err: any) {
    console.error("[Challenge By Slug GET] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
