import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseClient(token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey);
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (token) {
    return createClient(url, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
  }
  return createClient(url, anonKey);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id: submissionId } = await params;

    const authHeader = req.headers.get("Authorization");
    let token: string | undefined;
    let userId: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
    }

    const supabase = getSupabaseClient(token);

    if (token) {
      const { data: userData } = await supabase.auth.getUser(token);
      userId = userData?.user?.id || null;
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: submission, error } = await supabase
      .from("challenge_submissions")
      .select("id, challenge_id, user_id, team_id, submission_mode, submission_type, external_link_url, ppt_url, file_name, github_url, demo_url, version, status, score_problem, score_solution, score_architecture, score_feasibility_impact, total_score, grade, strengths, growth_areas, slide_feedback, format_violations, score_deductions, ai_raw_feedback, used_ai_fallback, created_at, updated_at")
      .eq("id", submissionId)
      .maybeSingle();

    if (error || !submission) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    // Access check: User must be author, teammate, or admin
    let hasAccess = submission.user_id === userId;
    if (!hasAccess && submission.team_id) {
      const { data: member } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", submission.team_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (member) hasAccess = true;
    }

    if (!hasAccess) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.role === "admin") hasAccess = true;
    }

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden: You do not have permission to view this submission." }, { status: 403 });
    }

    // Fetch challenge basic info
    const { data: challenge } = await supabase
      .from("weekly_challenges")
      .select("id, challenge_number, title, slug, track, difficulty")
      .eq("id", submission.challenge_id)
      .maybeSingle();

    return NextResponse.json({ submission, challenge });
  } catch (err: any) {
    console.error("[Challenge Submission By ID] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id: submissionId } = await params;

    const authHeader = req.headers.get("Authorization");
    let token: string | undefined;
    let userId: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
    }

    const supabase = getSupabaseClient(token);

    if (token) {
      const { data: userData } = await supabase.auth.getUser(token);
      userId = userData?.user?.id || null;
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch existing submission
    const { data: submission, error: fetchErr } = await supabase
      .from("challenge_submissions")
      .select("id, challenge_id, user_id, team_id, ppt_url")
      .eq("id", submissionId)
      .maybeSingle();

    if (fetchErr || !submission) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    // Access check: User must be submission author, team owner, or admin
    let canDelete = submission.user_id === userId;

    if (!canDelete && submission.team_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("owner_id")
        .eq("id", submission.team_id)
        .maybeSingle();
      if (team?.owner_id === userId) {
        canDelete = true;
      }
    }

    if (!canDelete) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.role === "admin") {
        canDelete = true;
      }
    }

    if (!canDelete) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to delete this submission." },
        { status: 403 }
      );
    }

    // Clean up uploaded file in storage if it exists
    if (submission.ppt_url && !submission.ppt_url.startsWith("http")) {
      try {
        await supabase.storage
          .from("challenge_submissions_bucket")
          .remove([submission.ppt_url]);
      } catch (storageErr) {
        console.warn("[Challenge Submission DELETE] Failed to remove storage file:", storageErr);
      }
    }

    // Delete submission record
    const { error: deleteErr } = await supabase
      .from("challenge_submissions")
      .delete()
      .eq("id", submissionId);

    if (deleteErr) {
      console.error("[Challenge Submission DELETE] DB error:", deleteErr);
      return NextResponse.json({ error: "Failed to delete submission." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Submission deleted successfully." });
  } catch (err: any) {
    console.error("[Challenge Submission DELETE] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
