import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractTextFromPDF, extractPresentationFromUrl } from "@/lib/ppt/presentationExtractor";
import { runPitchDeckEvaluation } from "@/lib/ppt/evaluatorEngine";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase admin credentials.");
  }
  return createClient(url, serviceRoleKey);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Authenticate user from Bearer Token or Cookie
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      userId = userData?.user?.id || null;
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized: Please log in." }, { status: 401 });
    }

    // 2. Authorization Check: User must be a member or owner of the team
    const [{ data: teamData }, { data: memberData }, { data: profileData }] = await Promise.all([
      supabaseAdmin
        .from("teams")
        .select("id, name, owner_id, team_members(id, role, project_role, profiles(id, full_name, gender, skills))")
        .eq("id", teamId)
        .maybeSingle(),
      supabaseAdmin.from("team_members").select("id").eq("team_id", teamId).eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("profiles").select("id, role").eq("id", userId).maybeSingle(),
    ]);

    const isOwner = teamData?.owner_id === userId;
    const isMember = !!memberData;
    const isAdmin = profileData?.role === "admin";

    if (!isOwner && !isMember && !isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Only active team members or owners can perform PPT evaluations." },
        { status: 403 }
      );
    }

    // 3. Concurrency Lock & Rate Limit Check
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentEvals, error: countErr } = await supabaseAdmin
      .from("team_ppt_evaluations")
      .select("id, status, created_at")
      .eq("team_id", teamId)
      .gte("created_at", twentyFourHoursAgo);

    if (countErr) {
      console.error("[PPT Evaluate API] Rate limit count query error:", countErr);
    }

    const hasActiveEval = (recentEvals || []).some((e) => e.status === "evaluating");
    if (hasActiveEval) {
      return NextResponse.json(
        { error: "An AI evaluation is already in progress for this team. Please wait a few moments." },
        { status: 409 }
      );
    }

    const count24h = recentEvals?.length || 0;
    if (count24h >= 15) {
      return NextResponse.json(
        { error: "Daily limit reached (Max 15 evaluations per team per 24 hours). Please try again tomorrow." },
        { status: 429 }
      );
    }

    // 4. Parse Form Payload
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const externalLinkUrl = (formData.get("external_link_url") as string)?.trim() || null;
    const psTitle = (formData.get("ps_title") as string)?.trim() || "SIH 2026 Problem Statement";
    const psCategory = (formData.get("ps_category") as string)?.trim() || "software";

    if (!file && !externalLinkUrl) {
      return NextResponse.json(
        { error: "Please upload a PDF presentation file or provide a Google Slides presentation link." },
        { status: 400 }
      );
    }

    // 5. Version numbering
    const { data: versionRows } = await supabaseAdmin
      .from("team_ppt_evaluations")
      .select("version")
      .eq("team_id", teamId)
      .order("version", { ascending: false })
      .limit(1);

    const currentVersion = (versionRows?.[0]?.version || 0) + 1;

    let pptStorageUrl = externalLinkUrl || "";
    let fileName = file ? file.name : "Google_Slides_Presentation.gslides";
    let submissionType = file ? "pdf_upload" : "external_link";
    let extractedDocText = "";
    let extractedSlidesList: any[] = [];

    // 6. Extract Text & Upload
    if (file) {
      const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "File size exceeds 15 MB limit." }, { status: 400 });
      }

      const arrBuffer = await file.arrayBuffer();
      const pdfBuffer = Buffer.from(arrBuffer);
      pptStorageUrl = file.name; // In-memory reference for file metadata

      // Extract text directly in-memory via pdf-parse v2 (0 storage used)
      const extraction = await extractTextFromPDF(pdfBuffer);
      if (!extraction.success || extraction.slides.length === 0) {
        return NextResponse.json(
          { error: extraction.errorMessage || "Failed to extract text from PDF slides." },
          { status: 422 }
        );
      }

      extractedDocText = extraction.rawDocumentText;
      extractedSlidesList = extraction.slides;
    } else if (externalLinkUrl) {
      const extraction = await extractPresentationFromUrl(externalLinkUrl);
      if (!extraction.success || extraction.slides.length === 0) {
        return NextResponse.json(
          { error: extraction.errorMessage || "Failed to extract text from presentation link." },
          { status: 422 }
        );
      }

      extractedDocText = extraction.rawDocumentText;
      extractedSlidesList = extraction.slides;
    }

    // 7. Team Composition Metadata
    const members = teamData?.team_members || [];
    const memberCount = members.length;
    const hasFemaleMember = members.some(
      (m: any) =>
        m.profiles?.gender?.toLowerCase() === "female" ||
        m.profiles?.gender?.toLowerCase() === "f"
    );

    // 8. Insert initial record
    const { data: initialRecord, error: insertErr } = await supabaseAdmin
      .from("team_ppt_evaluations")
      .insert({
        team_id: teamId,
        submitted_by: userId,
        ps_title: psTitle,
        ps_category: psCategory,
        submission_type: submissionType,
        external_link_url: externalLinkUrl,
        ppt_url: pptStorageUrl,
        file_name: fileName,
        version: currentVersion,
        status: "evaluating",
      })
      .select("id")
      .single();

    if (insertErr || !initialRecord) {
      console.error("[PPT Evaluate] DB initial record insert error:", insertErr);
      return NextResponse.json({ error: "Failed to initialize evaluation record." }, { status: 500 });
    }

    const evalRecordId = initialRecord.id;

    // 9. Run Pitch Deck Evaluation Engine
    const evalResult = await runPitchDeckEvaluation(
      psTitle,
      psCategory,
      extractedDocText,
      {
        name: teamData?.name,
        memberCount,
        hasFemaleMember,
        members: members.map((m: any) => ({
          name: m.profiles?.full_name,
          skills: m.profiles?.skills,
        })),
      }
    );

    // 10. Persist Completed Evaluation
    const { data: finalRecord, error: updateErr } = await supabaseAdmin
      .from("team_ppt_evaluations")
      .update({
        status: "completed",
        score_novelty: evalResult.scoreNovelty,
        score_tech: evalResult.scoreTech,
        score_ui_ux: evalResult.scoreUiUx,
        score_team: evalResult.scoreTeam,
        total_score: evalResult.totalScore,
        grade: evalResult.grade,
        slide_breakdown: extractedSlidesList,
        ai_feedback: {
          strengths: evalResult.strengths,
          spocRedFlags: evalResult.spocRedFlags,
          formatViolations: evalResult.formatViolations,
          slideRecommendations: evalResult.slideRecommendations,
          scoreDeductions: evalResult.scoreDeductions,
          usedAiFallback: evalResult.usedAiFallback,
          evaluatedAt: new Date().toISOString(),
        },
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", evalRecordId)
      .select()
      .single();

    if (updateErr || !finalRecord) {
      console.error("[PPT Evaluate] DB persist error:", updateErr);
      return NextResponse.json({ error: updateErr?.message || "Failed to persist evaluation results." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      evaluation: finalRecord,
    });
  } catch (err: any) {
    console.error("[PPT Evaluate API] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
