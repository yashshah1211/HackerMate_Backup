import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { evaluateSubmission } from "@/lib/sihEvaluator";
import { verifySpocAuthorization, isSameCollege } from "@/lib/sihSpocAuth";
import { logSihEvent } from "@/lib/admin/sihLogger";

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user session via Supabase server client
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
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
      return NextResponse.json({ error: "Unauthorized. Please sign in to evaluate pitches." }, { status: 401 });
    }

    const body = await req.json();
    const { submissionId } = body;

    if (!submissionId) {
      return NextResponse.json({ error: "Missing submissionId parameter." }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Fetch submission & team metadata
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("sih_mock_submissions")
      .select("id, team_id, teams(id, owner_id, college, team_members(user_id))")
      .eq("id", submissionId)
      .single();

    if (subErr || !sub) {
      return NextResponse.json({ error: "Submission not found for evaluation." }, { status: 404 });
    }

    const team = sub.teams as any;
    const isOwner = team?.owner_id === user.id;
    const isMember = team?.team_members?.some((m: any) => m.user_id === user.id);

    // 3. Check if caller is an authorized SPOC for the team's college
    let isAuthorizedSpoc = false;
    const spocAuth = await verifySpocAuthorization(user, supabaseAdmin);
    if (spocAuth.isAuthorized) {
      if (spocAuth.isAdminOverride) {
        isAuthorizedSpoc = true;
      } else if (spocAuth.collegeName && team?.college && isSameCollege(spocAuth.collegeName, team.college)) {
        isAuthorizedSpoc = true;
      }
    }

    // 4. Strict Server-Side Membership & Authorization Gate
    if (!isOwner && !isMember && !isAuthorizedSpoc) {
      logSihEvent("warn", {
        event: "SIH_ERROR",
        submissionId,
        userId: user.id,
        teamId: sub.team_id,
        message: `Unauthorized attempt to trigger AI evaluation for team ${sub.team_id} by user ${user.id}`,
      });
      return NextResponse.json(
        { error: "Forbidden: Only team members or authorized college SPOCs can trigger re-evaluation." },
        { status: 403 }
      );
    }

    // 5. Execute Evaluation
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
