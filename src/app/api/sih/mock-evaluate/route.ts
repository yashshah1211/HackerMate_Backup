import { NextRequest, NextResponse } from "next/server";
import { evaluateSubmission } from "@/lib/sihEvaluator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { submissionId } = body;

    if (!submissionId) {
      return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
    }

    const evalResult = await evaluateSubmission(submissionId);

    return NextResponse.json({
      success: true,
      evaluation: evalResult.evaluation,
      benchmarks: evalResult.benchmarks,
      isStillActive: evalResult.isStillActive,
      submission: evalResult.submission,
    });
  } catch (err: any) {
    console.error("[Mock SIH Evaluate] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
