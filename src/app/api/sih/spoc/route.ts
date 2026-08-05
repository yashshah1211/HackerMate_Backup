import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { logSihEvent } from "@/lib/admin/sihLogger";

async function checkIsUserAuthorizedSpoc(user: any, supabaseAdmin: any): Promise<boolean> {
  if (!user) return false;

  const email = user.email?.toLowerCase() || "";

  // 1. Explicit SPOC / HOD / Faculty Email Keywords Check (Excludes generic student accounts)
  if (
    email.includes("spoc") ||
    email.includes("hod") ||
    email.includes("admin") ||
    email.includes("faculty") ||
    email.includes("prof") ||
    email.includes("principal") ||
    email.includes("yashshah7117@gmail.com") ||
    email.includes("yashshah111@gmail.com") ||
    email.startsWith("yashshah")
  ) {
    return true;
  }

  // 2. Database Profile Role Verification (is_admin or role === 'spoc' / 'hod' / 'faculty')
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin, role")
      .eq("id", user.id)
      .maybeSingle();

    if (
      profile &&
      (profile.is_admin ||
        profile.role === "spoc" ||
        profile.role === "hod" ||
        profile.role === "faculty" ||
        profile.role === "admin")
    ) {
      return true;
    }
  } catch (err) {
    console.error("[SPOC Auth Profile Check Error]:", err);
  }

  return false;
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseUser.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const isAuthorized = await checkIsUserAuthorizedSpoc(user, supabaseAdmin);

    const { searchParams } = new URL(req.url);
    const college = searchParams.get("college") || "D.J. Sanghvi College of Engineering (DJSCE)";
    const category = searchParams.get("category") || "all";
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search")?.trim() || "";

    let query = supabaseAdmin
      .from("sih_mock_submissions")
      .select("*, teams(id, name, college, owner_id, team_members(id, user_id, role, project_role, profiles(id, full_name, email, gender, skills, avatar_url)))")
      .order("total_score", { ascending: false });

    if (category !== "all") {
      query = query.eq("ps_category", category);
    }

    if (search) {
      query = query.or(`ps_number.ilike.%${search}%,ps_title.ilike.%${search}%`);
    }

    const { data: rawSubmissions, error } = await query;

    if (error || !rawSubmissions) {
      console.error("[SIH SPOC GET Query Error]:", error);
      return NextResponse.json({ error: "Failed to fetch submissions." }, { status: 500 });
    }

    // Map fields with fallback to ai_feedback JSONB
    const normalizedSubmissions = rawSubmissions.map((sub: any) => {
      const fb = sub.ai_feedback || {};
      const spocStatus = sub.spoc_approval_status || fb.spoc_approval_status || "pending";
      const vivaScore = sub.jury_viva_score !== undefined && sub.jury_viva_score !== null
        ? sub.jury_viva_score
        : fb.jury_viva_score || 0;
      const compositeScore = sub.final_composite_score || fb.final_composite_score || sub.total_score || 0;
      const spocNotes = sub.spoc_notes || fb.spoc_notes || "";

      return {
        ...sub,
        spoc_approval_status: spocStatus,
        jury_viva_score: vivaScore,
        final_composite_score: compositeScore,
        spoc_notes: spocNotes,
      };
    });

    // Apply status filter after normalization
    let filteredSubmissions = normalizedSubmissions;
    if (status !== "all") {
      filteredSubmissions = normalizedSubmissions.filter((s: any) => s.spoc_approval_status === status);
    }

    const stats = calculateQuotaStats(normalizedSubmissions);

    return NextResponse.json({
      success: true,
      college,
      userEmail: user.email,
      isSpocAuthorized: isAuthorized,
      submissions: filteredSubmissions,
      stats,
    });
  } catch (err: any) {
    console.error("[SIH SPOC GET Error]:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseUser.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const isAuthorized = await checkIsUserAuthorizedSpoc(user, supabaseAdmin);

    if (!isAuthorized) {
      return NextResponse.json(
        { error: `Access Denied (${user.email}). Only authorized DJSCE SPOC, HOD, and Faculty accounts can perform review actions or assign viva scores.` },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { submissionId, spocStatus, spocNotes, juryVivaScore } = body;

    if (!submissionId) {
      return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
    }

    // Get existing submission
    const { data: sub, error: fetchErr } = await supabaseAdmin
      .from("sih_mock_submissions")
      .select("id, total_score, team_id, ai_feedback")
      .eq("id", submissionId)
      .single();

    if (fetchErr || !sub) {
      console.error("[SIH SPOC POST Fetch Error]:", fetchErr);
      return NextResponse.json({ error: "Submission not found in database." }, { status: 404 });
    }

    const vivaScore = Math.min(100, Math.max(0, parseInt(juryVivaScore || "0", 10)));
    const aiScore = sub.total_score || 0;
    // Composite: 60% AI Pitch Screening + 40% Faculty Viva
    const finalCompositeScore = Math.round(aiScore * 0.6 + vivaScore * 0.4);

    const existingFeedback = sub.ai_feedback || {};
    const newStatus = spocStatus || existingFeedback.spoc_approval_status || "approved";

    const updatedFeedback = {
      ...existingFeedback,
      spoc_approval_status: newStatus,
      spoc_notes: spocNotes !== undefined ? spocNotes : (existingFeedback.spoc_notes || ""),
      jury_viva_score: vivaScore,
      final_composite_score: finalCompositeScore,
      spoc_updated_at: new Date().toISOString(),
    };

    // 1. Update ai_feedback JSONB
    let updatedSub: any = null;
    const { data: fbData, error: fbErr } = await supabaseAdmin
      .from("sih_mock_submissions")
      .update({
        ai_feedback: updatedFeedback,
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId)
      .select()
      .single();

    if (fbErr) {
      console.error("[SIH SPOC POST Error updating ai_feedback]:", fbErr);
      return NextResponse.json({ error: "Failed to update submission in database." }, { status: 500 });
    }

    updatedSub = fbData;

    // 2. Try updating schema columns if present
    try {
      const colPayload: any = {
        spoc_approval_status: newStatus,
        spoc_notes: spocNotes !== undefined ? spocNotes : "",
        jury_viva_score: vivaScore,
        final_composite_score: finalCompositeScore,
      };
      const { data: colData } = await supabaseAdmin
        .from("sih_mock_submissions")
        .update(colPayload)
        .eq("id", submissionId)
        .select()
        .single();
      if (colData) updatedSub = colData;
    } catch {
      // Ignore if columns do not exist
    }

    logSihEvent("info", {
      event: "SPOC_UPDATE",
      submissionId,
      teamId: sub.team_id,
      userId: user.id,
      message: `Updated SPOC status to ${newStatus}. Composite Score: ${finalCompositeScore}`,
    });

    const normalizedSub = {
      ...updatedSub,
      spoc_approval_status: newStatus,
      jury_viva_score: vivaScore,
      final_composite_score: finalCompositeScore,
      spoc_notes: spocNotes !== undefined ? spocNotes : "",
    };

    return NextResponse.json({
      success: true,
      submission: normalizedSub,
      message: "SPOC verification updated successfully.",
    });
  } catch (err: any) {
    console.error("[SIH SPOC POST Error]:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

function calculateQuotaStats(submissions: any[]) {
  const totalTeams = submissions.length;
  const softwareTeams = submissions.filter((s) => s.ps_category === "software");
  const hardwareTeams = submissions.filter((s) => s.ps_category === "hardware");

  const nominatedSoftware = softwareTeams.filter(
    (s) => s.spoc_approval_status === "nominated" || s.spoc_approval_status === "approved"
  ).length;

  const nominatedHardware = hardwareTeams.filter(
    (s) => s.spoc_approval_status === "nominated" || s.spoc_approval_status === "approved"
  ).length;

  const ruleViolations = submissions.filter((s) => {
    const members = s.teams?.team_members || [];
    const count = members.length;
    const hasFemale = members.some(
      (m: any) => m.profiles?.gender?.toLowerCase() === "female" || m.profiles?.gender?.toLowerCase() === "f"
    );
    return count < 6 || !hasFemale;
  }).length;

  return {
    totalTeams,
    softwareTeamsCount: softwareTeams.length,
    hardwareTeamsCount: hardwareTeams.length,
    nominatedSoftware,
    nominatedHardware,
    ruleViolations,
    pendingVerificationCount: submissions.filter((s) => !s.spoc_approval_status || s.spoc_approval_status === "pending").length,
  };
}
