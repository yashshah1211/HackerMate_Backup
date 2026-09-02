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

    return NextResponse.json({
      success: true,
      result,
      mode: result.usedAiEngine ? "gemini_ai" : "heuristic_fallback",
    });
  } catch (err: any) {
    console.error("[API Evaluator Error]:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error during pitch evaluation." },
      { status: 500 }
    );
  }
}
