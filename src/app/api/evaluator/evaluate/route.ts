import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  checkEvaluatorBudgetAndRateLimit,
  recordSuccessfulEvaluation,
} from "@/lib/evaluator/evaluatorBudgetGuard";
import { runTrackAwareEvaluation } from "@/lib/evaluator/trackEvaluatorEngine";
import { EvaluationInput, JudgingTrackId } from "@/lib/evaluator/evaluatorTypes";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase credentials.");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      psTitle,
      solutionDescription,
      techStack,
      architectureDetails,
      repoUrl,
      demoUrl,
      slidesText,
      trackId = "web_dev",
      hackathonId,
      userId,
      forceFallback = false,
    } = body;

    if (!psTitle || !solutionDescription) {
      return NextResponse.json(
        { error: "Please provide both a project title and a description/problem statement." },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(req);
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Check Rate Limits and Daily Gemini AI Budget
    const budgetDecision = await checkEvaluatorBudgetAndRateLimit(
      supabaseAdmin,
      clientIp,
      userId
    );

    if (budgetDecision.isRateLimited) {
      return NextResponse.json(
        {
          error: budgetDecision.rateLimitMessage || "Rate limit exceeded. Please try again later.",
          isRateLimited: true,
        },
        { status: 429 }
      );
    }

    const validTracks: JudgingTrackId[] = ["web_dev", "ai_genai", "sih"];
    const activeTrack: JudgingTrackId = validTracks.includes(trackId) ? trackId : "web_dev";

    const input: EvaluationInput = {
      psTitle: psTitle.trim(),
      solutionDescription: solutionDescription.trim(),
      techStack: techStack ? techStack.trim() : undefined,
      architectureDetails: architectureDetails ? architectureDetails.trim() : undefined,
      repoUrl: repoUrl ? repoUrl.trim() : undefined,
      demoUrl: demoUrl ? demoUrl.trim() : undefined,
      slidesText: slidesText ? slidesText.trim() : undefined,
      trackId: activeTrack,
      hackathonId,
    };

    // 2. Execute Evaluation Engine (Gemini AI or Heuristic Fallback based on budget / forceFallback)
    const allowAiCall = forceFallback ? false : budgetDecision.allowAiCall;
    const result = await runTrackAwareEvaluation(input, allowAiCall);

    // 3. Record Successful Evaluation & Increment Budget
    await recordSuccessfulEvaluation(
      supabaseAdmin,
      clientIp,
      result.usedAiEngine,
      userId
    );

    // 4. Persist to User Pitch Evaluations History if signed in
    let savedEvaluationId: string | null = null;
    if (userId) {
      try {
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from("user_pitch_evaluations")
          .insert({
            user_id: userId,
            ps_title: input.psTitle,
            track_id: input.trackId || "web_dev",
            total_score: result.totalScore,
            grade: result.grade,
            used_ai_engine: result.usedAiEngine,
            sub_scores: result.subScores,
            evaluation_result: result,
          })
          .select("id")
          .single();

        if (insertErr) {
          console.error("[API Evaluator] Error saving evaluation history:", insertErr);
        } else if (inserted) {
          savedEvaluationId = inserted.id;
        }
      } catch (saveErr) {
        console.error("[API Evaluator] Exception saving evaluation history:", saveErr);
      }
    }

    return NextResponse.json({
      success: true,
      result,
      savedEvaluationId,
      mode: result.usedAiEngine ? "gemini_ai" : "heuristic_fallback",
      fallbackReason: result.fallbackReason || null,
      fallbackDetails: result.fallbackDetails || null,
    });
  } catch (err: any) {
    console.error("[API Evaluator Error]:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error during pitch evaluation." },
      { status: 500 }
    );
  }
}
