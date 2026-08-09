import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { logSihEvent } from "@/lib/admin/sihLogger";

import { verifySpocAuthorization, SpocAuthResult, isSameCollege } from "@/lib/sihSpocAuth";
export { verifySpocAuthorization };
export type { SpocAuthResult };

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

    const authResult = await verifySpocAuthorization(user, supabaseAdmin);

    if (!authResult.isAuthorized) {
      return NextResponse.json(
        {
          success: false,
          isSpocAuthorized: false,
          userEmail: user.email,
          error: "Access Denied. Your account is not on the authorized SPOC allowlist.",
          submissions: [],
          stats: null,
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || "all";
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search")?.trim() || "";

    // Determine target college for query:
    // Platform admins can pass ?college= parameter; SPOC accounts are strictly locked to their assigned college.
    const targetCollege = authResult.isAdminOverride
      ? searchParams.get("college") || authResult.collegeName || "D.J. Sanghvi College of Engineering (DJSCE)"
      : authResult.collegeName!;

    let query = supabaseAdmin
      .from("sih_mock_submissions")
      .select("*, teams!inner(id, name, college, owner_id, team_members(id, user_id, role, project_role, profiles(id, full_name, email, gender, skills, avatar_url)))")
      .order("total_score", { ascending: false });

    // ENFORCE COLLEGE ISOLATION WITH SYNONYM MATCHING
    if (targetCollege) {
      const lower = targetCollege.toLowerCase();
      if (lower.includes("djsce") || lower.includes("dwarkadas")) {
        query = query.or("college.ilike.%djsce%,college.ilike.%dwarkadas%", { foreignTable: "teams" });
      } else {
        const firstWord = targetCollege.split(/[\s,()]+/)[0];
        if (firstWord && firstWord.length > 2) {
          query = query.or(`college.ilike.%${firstWord}%,college.eq.${targetCollege}`, { foreignTable: "teams" });
        }
      }
    }

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

    // Filter using isSameCollege helper for absolute accuracy across synonyms
    const filteredByCollege = targetCollege
      ? rawSubmissions.filter((sub: any) => isSameCollege(targetCollege, sub.teams?.college))
      : rawSubmissions;

    // Map fields with fallback to ai_feedback JSONB
    const normalizedSubmissions = filteredByCollege.map((sub: any) => {
      const fb = sub.ai_feedback || {};
      const spocStatus = sub.spoc_approval_status || fb.spoc_approval_status || "pending";
      const vivaScore = sub.jury_viva_score !== undefined && sub.jury_viva_score !== null
        ? sub.jury_viva_score
        : fb.jury_viva_score || 0;
      const compositeScore = sub.final_composite_score || fb.final_composite_score || sub.total_score || 0;
      const spocNotes = sub.spoc_notes || fb.spoc_notes || "";

      let roundStage = sub.round_stage || fb.round_stage;
      if (spocStatus === "rejected") {
        roundStage = "round1_rejected";
      } else if (spocStatus === "revision_requested") {
        roundStage = "round1_submitted";
      } else if (!roundStage) {
        roundStage = (spocStatus === "approved" || spocStatus === "nominated") ? "shortlisted_round2" : "round1_submitted";
      }

      return {
        ...sub,
        spoc_approval_status: spocStatus,
        jury_viva_score: vivaScore,
        final_composite_score: compositeScore,
        spoc_notes: spocNotes,
        round_stage: roundStage,
      };
    });

    const stageParam = searchParams.get("stage") || "all";

    // Apply status and stage filters after normalization
    let filteredSubmissions = normalizedSubmissions;
    if (status !== "all") {
      filteredSubmissions = filteredSubmissions.filter((s: any) => s.spoc_approval_status === status);
    }
    if (stageParam !== "all") {
      if (stageParam === "shortlisted_round2") {
        // STRICT RULE: Never show pitches rejected or revision_requested in Round 2 shortlist
        filteredSubmissions = filteredSubmissions.filter(
          (s: any) =>
            s.round_stage === "shortlisted_round2" &&
            s.spoc_approval_status !== "rejected" &&
            s.spoc_approval_status !== "revision_requested" &&
            s.round_stage !== "round1_rejected"
        );
      } else {
        filteredSubmissions = filteredSubmissions.filter((s: any) => s.round_stage === stageParam);
      }
    }

    const stats = calculateQuotaStats(normalizedSubmissions);

    return NextResponse.json({
      success: true,
      college: targetCollege,
      userEmail: user.email,
      isSpocAuthorized: authResult.isAuthorized,
      spocRole: authResult.role,
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

    const authResult = await verifySpocAuthorization(user, supabaseAdmin);

    if (!authResult.isAuthorized) {
      return NextResponse.json(
        { error: `Access Denied (${user.email}). Only authorized SPOC allowlist accounts can perform review actions or assign viva scores.` },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { submissionId, submissionIds, spocStatus, roundStage, spocNotes, juryVivaScore } = body;

    // BULK SHORTLIST ACTION
    if (Array.isArray(submissionIds) && submissionIds.length > 0) {
      if (!roundStage && !spocStatus) {
        return NextResponse.json({ error: "Missing roundStage or spocStatus for bulk update." }, { status: 400 });
      }

      // Fetch all target submissions
      const { data: targetSubs, error: targetErr } = await supabaseAdmin
        .from("sih_mock_submissions")
        .select("id, ai_feedback, spoc_approval_status, round_stage, teams(college)")
        .in("id", submissionIds);

      if (targetErr || !targetSubs) {
        return NextResponse.json({ error: "Failed to fetch target submissions." }, { status: 500 });
      }

      // Check college isolation on all target submissions
      if (!authResult.isAdminOverride) {
        const hasForeignSub = targetSubs.some(
          (s: any) => s.teams?.college && s.teams.college !== authResult.collegeName
        );
        if (hasForeignSub) {
          return NextResponse.json(
            { error: `Access Denied. One or more selected submissions do not belong to ${authResult.collegeName}.` },
            { status: 403 }
          );
        }
      }

      let updatedCount = 0;

      for (const sub of targetSubs) {
        const existingFb = sub.ai_feedback || {};
        const newStage = roundStage || sub.round_stage || existingFb.round_stage || "round1_submitted";
        const newStatus = spocStatus || sub.spoc_approval_status || existingFb.spoc_approval_status || "approved";

        const updatedFb = {
          ...existingFb,
          round_stage: newStage,
          spoc_approval_status: newStatus,
          spoc_updated_at: new Date().toISOString(),
        };

        // Update JSONB
        await supabaseAdmin
          .from("sih_mock_submissions")
          .update({
            ai_feedback: updatedFb,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sub.id);

        // Try updating schema columns if available
        try {
          await supabaseAdmin
            .from("sih_mock_submissions")
            .update({
              round_stage: newStage,
              spoc_approval_status: newStatus,
              round1_decided_at: newStage === "shortlisted_round2" ? new Date().toISOString() : undefined,
              round2_decided_at: newStage === "final_nominated" ? new Date().toISOString() : undefined,
            })
            .eq("id", sub.id);
        } catch {
          // Ignore column missing
        }

        updatedCount++;
      }

      logSihEvent("info", {
        event: "SPOC_UPDATE",
        userId: user.id,
        message: `Bulk updated ${updatedCount} teams to stage '${roundStage || spocStatus}'.`,
      });

      return NextResponse.json({
        success: true,
        count: updatedCount,
        message: `Successfully updated ${updatedCount} teams to ${roundStage || spocStatus}.`,
      });
    }

    // SINGLE SUBMISSION UPDATE
    if (!submissionId) {
      return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
    }

    // Get existing submission
    const { data: sub, error: fetchErr } = await supabaseAdmin
      .from("sih_mock_submissions")
      .select("id, total_score, team_id, ai_feedback, teams(college)")
      .eq("id", submissionId)
      .single();

    if (fetchErr || !sub) {
      console.error("[SIH SPOC POST Fetch Error]:", fetchErr);
      return NextResponse.json({ error: "Submission not found in database." }, { status: 404 });
    }

    // ENFORCE STRICT COLLEGE ISOLATION FOR SPOC ACTIONS
    const subCollege = (sub as any).teams?.college;
    if (!authResult.isAdminOverride && subCollege && subCollege !== authResult.collegeName) {
      return NextResponse.json(
        { error: `Access Denied. You are only authorized to review submissions for ${authResult.collegeName}.` },
        { status: 403 }
      );
    }

    const vivaScore = Math.min(100, Math.max(0, parseInt(juryVivaScore || "0", 10)));
    const aiScore = sub.total_score || 0;
    const finalCompositeScore = Math.round(aiScore * 0.6 + vivaScore * 0.4);

    const existingFeedback = sub.ai_feedback || {};
    const newStatus = spocStatus || existingFeedback.spoc_approval_status || "approved";
    let newStage = roundStage;
    if (newStatus === "rejected") {
      newStage = "round1_rejected";
    } else if (newStatus === "revision_requested") {
      newStage = "round1_submitted";
    } else if (newStatus === "approved" || newStatus === "nominated") {
      newStage = "shortlisted_round2";
    } else if (!newStage) {
      newStage = existingFeedback.round_stage || "round1_submitted";
    }

    const updatedFeedback = {
      ...existingFeedback,
      spoc_approval_status: newStatus,
      round_stage: newStage,
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
        round_stage: newStage,
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
      message: `Updated SPOC status to ${newStatus}, Stage to ${newStage}. Composite Score: ${finalCompositeScore}`,
    });

    const normalizedSub = {
      ...updatedSub,
      spoc_approval_status: newStatus,
      round_stage: newStage,
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
