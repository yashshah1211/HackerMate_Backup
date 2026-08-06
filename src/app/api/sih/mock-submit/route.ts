import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { validateGoogleDriveLink, validateGithubLink, validateDemoLink } from "@/lib/sihUrlValidator";
import { logSihEvent } from "@/lib/admin/sihLogger";
import { evaluateSubmission } from "@/lib/sihEvaluator";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
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
      error: authErr,
    } = await supabaseUser.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const {
      teamId,
      psNumber,
      psTitle,
      psCategory,
      theme,
      pptUrl,
      githubUrl,
      demoUrl,
      idempotencyKey,
    } = body;

    if (!teamId || !psNumber || !psTitle || !pptUrl) {
      return NextResponse.json(
        { error: "Missing required fields: teamId, psNumber, psTitle, and pptUrl are required." },
        { status: 400 }
      );
    }

    // 1. Verify caller is owner or member of team
    const { data: teamData, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id, name, owner_id, team_members(user_id, role)")
      .eq("id", teamId)
      .single();

    if (teamErr || !teamData) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    const isOwner = teamData.owner_id === user.id;
    const isMember = teamData.team_members?.some((m: any) => m.user_id === user.id);

    if (!isOwner && !isMember) {
      return NextResponse.json({ error: "Forbidden: Only team members can submit pitches." }, { status: 403 });
    }

    // 2. Accessibility Link Validation (Req 5 & Security)
    const pptVal = await validateGoogleDriveLink(pptUrl);
    if (!pptVal.isValid) {
      return NextResponse.json({ error: pptVal.error || "Invalid PPT URL." }, { status: 400 });
    }

    if (githubUrl && githubUrl.trim()) {
      const ghVal = await validateGithubLink(githubUrl);
      if (!ghVal.isValid) {
        return NextResponse.json({ error: ghVal.error || "Invalid GitHub URL." }, { status: 400 });
      }
    }

    if (demoUrl && demoUrl.trim()) {
      const demoVal = validateDemoLink(demoUrl);
      if (!demoVal.isValid) {
        return NextResponse.json({ error: demoVal.error || "Invalid Demo URL." }, { status: 400 });
      }
    }

    // 3. Request Locking & Existing Submission Check
    let currentActive: any = null;
    const { data: activeData, error: activeErr } = await supabaseAdmin
      .from("sih_mock_submissions")
      .select("id, version, status, idempotency_key, updated_at")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .maybeSingle();

    if (activeErr) {
      const { data: fallbackData } = await supabaseAdmin
        .from("sih_mock_submissions")
        .select("id, status, updated_at")
        .eq("team_id", teamId)
        .maybeSingle();
      currentActive = fallbackData;
    } else {
      currentActive = activeData;
    }

    if (currentActive) {
      if (currentActive.status === "evaluating") {
        const timeSinceUpdate = Date.now() - new Date(currentActive.updated_at).getTime();
        if (idempotencyKey && currentActive.idempotency_key === idempotencyKey) {
          logSihEvent("info", {
            event: "SIH_SUBMIT",
            submissionId: currentActive.id,
            teamId,
            userId: user.id,
            message: "Idempotent duplicate submission request ignored.",
          });
          return NextResponse.json({
            success: true,
            submission: currentActive,
            message: "Evaluation already in progress for this submission.",
          });
        }
        if (timeSinceUpdate < 15000) {
          return NextResponse.json(
            { error: "An evaluation is currently running for this team. Please wait a moment." },
            { status: 409 }
          );
        }
      }

      try {
        await supabaseAdmin
          .from("sih_mock_submissions")
          .update({ is_active: false })
          .eq("id", currentActive.id);
      } catch {
        // Ignore if is_active column does not exist
      }
    }

    const nextVersion = currentActive ? (currentActive.version || 1) + 1 : 1;
    const parentId = currentActive ? currentActive.id : null;

    // 4. Try V2 Versioned Payload Insert
    const v2Payload = {
      team_id: teamId,
      submitted_by: user.id,
      ps_number: psNumber.trim(),
      ps_title: psTitle.trim(),
      ps_category: psCategory || "software",
      theme: theme || "General",
      ppt_url: pptUrl.trim(),
      github_url: githubUrl?.trim() || null,
      demo_url: demoUrl?.trim() || null,
      status: "evaluating",
      evaluation_stage: "checking_sih_rules",
      version: nextVersion,
      is_active: true,
      parent_id: parentId,
      idempotency_key: idempotencyKey || null,
      is_stale: false,
      updated_at: new Date().toISOString(),
    };

    let submission: any = null;
    const { data: v2Data, error: v2Err } = await supabaseAdmin
      .from("sih_mock_submissions")
      .insert(v2Payload)
      .select()
      .single();

    if (!v2Err && v2Data) {
      submission = v2Data;
    } else {
      const legacyPayload = {
        team_id: teamId,
        submitted_by: user.id,
        ps_number: psNumber.trim(),
        ps_title: psTitle.trim(),
        ps_category: psCategory || "software",
        theme: theme || "General",
        ppt_url: pptUrl.trim(),
        github_url: githubUrl?.trim() || null,
        demo_url: demoUrl?.trim() || null,
        status: "evaluating",
        updated_at: new Date().toISOString(),
      };

      const { data: legacyData, error: legacyErr } = await supabaseAdmin
        .from("sih_mock_submissions")
        .upsert(legacyPayload, { onConflict: "team_id" })
        .select()
        .single();

      if (legacyErr || !legacyData) {
        console.error("[Mock SIH Submit] DB Write Error:", v2Err || legacyErr);
        return NextResponse.json(
          {
            error: "Failed to save submission.",
            details: (legacyErr || v2Err)?.message,
          },
          { status: 500 }
        );
      }

      submission = legacyData;
    }

    // 5. Run Evaluation Synchronously Inline
    let evaluatedSubmission = submission;
    try {
      const evalRes = await evaluateSubmission(submission.id);
      if (evalRes?.submission) {
        evaluatedSubmission = evalRes.submission;
      }
    } catch (e: any) {
      logSihEvent("warn", {
        event: "SIH_ERROR",
        submissionId: submission.id,
        teamId,
        message: "Inline evaluation warning",
        details: { error: e.message },
      });
    }

    logSihEvent("info", {
      event: "SIH_SUBMIT",
      submissionId: evaluatedSubmission.id,
      teamId,
      userId: user.id,
      durationMs: Date.now() - startTime,
      message: `Submitted pitch & evaluated successfully. Total Score: ${evaluatedSubmission.total_score}`,
    });

    return NextResponse.json({
      success: true,
      submission: evaluatedSubmission,
      message: `Mock SIH Pitch evaluated! Total score: ${evaluatedSubmission.total_score || 0}/100.`,
    });
  } catch (err: any) {
    logSihEvent("error", {
      event: "SIH_ERROR",
      message: "Unhandled exception in mock-submit POST",
      details: { error: err.message },
    });
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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
      error: authErr,
    } = await supabaseUser.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const submissionId = searchParams.get("submissionId");
    const teamIdParam = searchParams.get("teamId");

    if (!submissionId && !teamIdParam) {
      return NextResponse.json({ error: "Missing submissionId or teamId parameter." }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let targetTeamId = teamIdParam;
    if (submissionId) {
      const { data: subData } = await supabaseAdmin
        .from("sih_mock_submissions")
        .select("team_id")
        .eq("id", submissionId)
        .maybeSingle();
      if (subData) {
        targetTeamId = subData.team_id;
      }
    }

    if (!targetTeamId) {
      return NextResponse.json({ error: "Submission or team not found." }, { status: 404 });
    }

    // Authorization check: User MUST be team owner or member
    const { data: teamData, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id, owner_id, team_members(user_id)")
      .eq("id", targetTeamId)
      .single();

    if (teamErr || !teamData) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    const isOwner = teamData.owner_id === user.id;
    const isMember = teamData.team_members?.some((m: any) => m.user_id === user.id);

    if (!isOwner && !isMember) {
      return NextResponse.json(
        { error: "Forbidden: Only team members can delete or remove pitch submissions." },
        { status: 403 }
      );
    }

    // Delete submission(s) for the team
    if (submissionId) {
      await supabaseAdmin.from("sih_mock_submissions").delete().eq("id", submissionId);
    }
    await supabaseAdmin.from("sih_mock_submissions").delete().eq("team_id", targetTeamId);

    logSihEvent("info", {
      event: "SIH_SUBMIT",
      submissionId: submissionId || undefined,
      teamId: targetTeamId,
      userId: user.id,
      message: "Pitch submission removed successfully.",
    });

    return NextResponse.json({
      success: true,
      message: "Pitch presentation removed successfully.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to remove pitch deck." }, { status: 500 });
  }
}
