import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  extractChallengeTextFromPDF,
  extractChallengePresentationFromUrl,
} from "@/lib/challenges/challengeExtractor";
import { runChallengePitchEvaluation } from "@/lib/challenges/challengeEvaluatorEngine";

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // 1. Authenticate user
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
      return NextResponse.json({ error: "Unauthorized. Please log in to submit." }, { status: 401 });
    }

    const decodedSlug = decodeURIComponent(slug);
    const cleanSlug = decodedSlug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // 2. Fetch challenge
    let challenge: any = null;

    // 1. Clean slug match
    const { data: byClean } = await supabase
      .from("weekly_challenges")
      .select("*")
      .eq("slug", cleanSlug)
      .maybeSingle();
    challenge = byClean;

    // 2. Decoded slug match
    if (!challenge) {
      const { data: byDecoded } = await supabase
        .from("weekly_challenges")
        .select("*")
        .eq("slug", decodedSlug)
        .maybeSingle();
      challenge = byDecoded;
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

    // 4. Memory fallback
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
      return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    }

    // Check if challenge deadline has passed
    const isExpired = challenge.ends_at && new Date(challenge.ends_at).getTime() < Date.now();
    if (challenge.status === "closed" || isExpired) {
      return NextResponse.json(
        { error: "The deadline for this challenge has passed. Submissions are closed." },
        { status: 403 }
      );
    }

    // 3. Rate limiting: Max 5 submissions per user in past 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentSubmissions, error: countErr } = await supabase
      .from("challenge_submissions")
      .select("id, status, created_at")
      .eq("user_id", userId)
      .eq("challenge_id", challenge.id)
      .gte("created_at", twentyFourHoursAgo);

    if (countErr) {
      console.error("[Challenge Evaluate] Rate limit query error:", countErr);
    }

    const hasActiveEval = (recentSubmissions || []).some((s) => s.status === "evaluating");
    if (hasActiveEval) {
      return NextResponse.json(
        { error: "An evaluation is already running. Please wait a moment." },
        { status: 409 }
      );
    }

    if ((recentSubmissions || []).length >= 5) {
      return NextResponse.json(
        { error: "Daily limit reached (Max 5 evaluations per challenge per 24 hours)." },
        { status: 429 }
      );
    }

    // 4. Parse Form Payload
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const externalLinkUrl = (formData.get("external_link_url") as string)?.trim() || null;
    const submissionMode = (formData.get("submission_mode") as string) === "team" ? "team" : "solo";
    const teamId = (formData.get("team_id") as string)?.trim() || null;
    const githubUrl = (formData.get("github_url") as string)?.trim() || null;
    const demoUrl = (formData.get("demo_url") as string)?.trim() || null;

    if (!file && !externalLinkUrl) {
      return NextResponse.json(
        { error: "Please upload a PDF presentation or provide a Google Slides presentation link." },
        { status: 400 }
      );
    }

    let teamName: string | undefined;
    if (submissionMode === "team" && teamId) {
      const { data: memberRecord } = await supabase
        .from("team_members")
        .select("team_id, teams(name)")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!memberRecord) {
        return NextResponse.json(
          { error: "You must be a member of the selected team to submit on its behalf." },
          { status: 403 }
        );
      }
      teamName = (memberRecord as any)?.teams?.name;
    }

    // 5. Version Numbering
    let versionQuery = supabase
      .from("challenge_submissions")
      .select("version")
      .eq("challenge_id", challenge.id);

    if (submissionMode === "team" && teamId) {
      versionQuery = versionQuery.eq("team_id", teamId);
    } else {
      versionQuery = versionQuery.eq("user_id", userId);
    }

    const { data: versionRows } = await versionQuery.order("version", { ascending: false }).limit(1);
    const currentVersion = (versionRows?.[0]?.version || 0) + 1;

    // 6. Extract Text
    let pptStorageUrl = externalLinkUrl || "";
    let fileName = file ? file.name : "Google_Slides_Presentation.gslides";
    let submissionType = file ? "pdf_upload" : "external_link";
    let extractedDocText = "";

    if (file) {
      const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "File size exceeds 15 MB limit." }, { status: 400 });
      }

      const arrBuffer = await file.arrayBuffer();
      const pdfBuffer = Buffer.from(arrBuffer);
      pptStorageUrl = file.name;

      const extraction = await extractChallengeTextFromPDF(pdfBuffer);
      if (!extraction.success || extraction.slides.length === 0) {
        return NextResponse.json(
          { error: extraction.errorMessage || "Failed to extract text from PDF slides." },
          { status: 422 }
        );
      }
      extractedDocText = extraction.rawDocumentText;
    } else if (externalLinkUrl) {
      const extraction = await extractChallengePresentationFromUrl(externalLinkUrl);
      if (!extraction.success || extraction.slides.length === 0) {
        return NextResponse.json(
          { error: extraction.errorMessage || "Failed to extract text from presentation link." },
          { status: 422 }
        );
      }
      extractedDocText = extraction.rawDocumentText;
    }

    // 7. Run AI Evaluation
    const evalResult = await runChallengePitchEvaluation(
      challenge.title,
      challenge.track,
      challenge.problem_statement,
      extractedDocText,
      {
        submissionMode,
        teamName,
        githubUrl,
        demoUrl,
        additionalRules: challenge.additional_rules || null,
      }
    );

    // 8. Insert Submission Record
    const insertPayload = {
      challenge_id: challenge.id,
      user_id: userId,
      team_id: submissionMode === "team" ? teamId : null,
      submission_mode: submissionMode,
      submission_type: submissionType,
      external_link_url: externalLinkUrl,
      ppt_url: pptStorageUrl,
      file_name: fileName,
      github_url: githubUrl,
      demo_url: demoUrl,
      version: currentVersion,
      status: "completed",
      score_problem: evalResult.scoreProblem,
      score_solution: evalResult.scoreSolution,
      score_architecture: evalResult.scoreArchitecture,
      score_feasibility_impact: evalResult.scoreFeasibilityImpact,
      total_score: evalResult.totalScore,
      grade: evalResult.grade,
      strengths: evalResult.strengths,
      growth_areas: evalResult.growthAreas,
      slide_feedback: evalResult.slideFeedback,
      format_violations: evalResult.formatViolations,
      score_deductions: evalResult.scoreDeductions,
      ai_raw_feedback: {
        topActionItem: evalResult.topActionItem,
        evaluatedAt: new Date().toISOString(),
      },
      used_ai_fallback: evalResult.usedAiFallback,
    };

    const { data: savedSubmission, error: insertErr } = await supabase
      .from("challenge_submissions")
      .insert(insertPayload)
      .select("id, challenge_id, user_id, team_id, submission_mode, submission_type, external_link_url, ppt_url, file_name, github_url, demo_url, version, status, score_problem, score_solution, score_architecture, score_feasibility_impact, total_score, grade, strengths, growth_areas, slide_feedback, format_violations, score_deductions, ai_raw_feedback, used_ai_fallback, created_at, updated_at")
      .single();

    if (insertErr) {
      console.error("[Challenge Evaluate] Insert error:", insertErr);
      return NextResponse.json({ error: "Failed to persist evaluation record." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      submission: savedSubmission,
    });
  } catch (err: any) {
    console.error("[Challenge Evaluate] Route Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
