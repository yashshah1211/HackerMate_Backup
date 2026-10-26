import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { challengeIdentity } from "@/lib/challenges/challengeEvaluationContract";

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

    let identity: ReturnType<typeof challengeIdentity>;
    try { identity = challengeIdentity(slug); }
    catch { return NextResponse.json({ error: "Invalid challenge reference" }, { status: 400 }); }
    const readChallenge = async (column: "slug" | "id", value: string) => {
      const { data, error } = await supabase.from("weekly_challenges").select("*").eq(column, value).maybeSingle();
      if (error) throw error;
      return data;
    };
    let challenge = await readChallenge("slug", identity.slug);
    if (!challenge && identity.normalized && identity.normalized !== identity.slug) challenge = await readChallenge("slug", identity.normalized);
    if (!challenge && identity.id) challenge = await readChallenge("id", identity.id);
    if (!challenge) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

    // Optional user teams lookup
    const authHeader = req.headers.get("Authorization");
    let userTeams: Array<{ id: string; name: string }> = [];

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabase.auth.getUser(token);
      const userId = userData?.user?.id;

      if (userId) {
        const { data: memberRows, error: memberError } = await supabase
          .from("team_members")
          .select("team_id, teams(id, name)")
          .eq("user_id", userId);

        if (memberError) throw memberError;
        if (memberRows && memberRows.length > 0) {
          userTeams = memberRows
            .flatMap((r) => Array.isArray(r.teams) ? r.teams : [r.teams])
            .filter(Boolean) as Array<{ id: string; name: string }>;
        }
      }
    }

    return NextResponse.json({
      success: true,
      challenge,
      userTeams,
    });
  } catch (err: unknown) {
    console.error("[Challenge By Slug GET] Exception:", err);
    return NextResponse.json({ error: "Challenge data is temporarily unavailable. Please retry." }, { status: 503 });
  }
}
