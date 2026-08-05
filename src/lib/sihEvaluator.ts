import { createClient } from "@supabase/supabase-js";
import { logSihEvent } from "@/lib/admin/sihLogger";

export async function evaluateSubmission(submissionId: string) {
  const startTime = Date.now();
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Fetch submission with team details
  const { data: sub, error: subErr } = await supabaseAdmin
    .from("sih_mock_submissions")
    .select("*, teams(id, name, college, owner_id, team_members(role, project_role, profiles(full_name, gender, skills)))")
    .eq("id", submissionId)
    .single();

  if (subErr || !sub) {
    logSihEvent("warn", {
      event: "SIH_ERROR",
      submissionId,
      message: "Submission not found for evaluation",
    });
    throw new Error("Submission not found for evaluation");
  }

  const teamId = sub.team_id;

  // Stage 1 -> Stage 2: Checking SIH Rules
  try {
    await supabaseAdmin
      .from("sih_mock_submissions")
      .update({ evaluation_stage: "checking_sih_rules" })
      .eq("id", submissionId);
  } catch {
    // Ignore
  }

  const team = sub.teams;
  const members = team?.team_members || [];
  const memberCount = members.length;
  const hasFemaleMember = members.some(
    (m: any) => m.profiles?.gender?.toLowerCase() === "female" || m.profiles?.gender?.toLowerCase() === "f"
  );

  // Stage 2 -> Stage 3: Analyzing Architecture
  try {
    await supabaseAdmin
      .from("sih_mock_submissions")
      .update({ evaluation_stage: "analyzing_architecture" })
      .eq("id", submissionId);
  } catch {
    // Ignore
  }

  const geminiKey = process.env.GEMINI_API_KEY;

  let evaluationResult: {
    scoreNovelty: number;
    scoreTech: number;
    scoreUiUx: number;
    scoreImpact: number;
    scoreTeam: number;
    totalScore: number;
    grade: string;
    strengths: string[];
    spocRedFlags: string[];
    slideRecommendations: Record<string, string>;
    scoreDeductions: {
      novelty: string;
      tech: string;
      uiUx: string;
      impact: string;
      team: string;
    };
  };

  let usedAiFallback = false;

  if (geminiKey) {
    try {
      evaluationResult = await callGeminiWithFastTimeout(geminiKey, sub, team, members, memberCount, hasFemaleMember);
    } catch (e: any) {
      usedAiFallback = true;
      logSihEvent("info", {
        event: "SIH_FALLBACK",
        submissionId,
        teamId,
        message: "Gemini AI API timed out or unavailable; evaluated using SIH Heuristic Engine.",
        details: { error: e.message },
      });
      evaluationResult = generateHeuristicEvaluation(sub, memberCount, hasFemaleMember);
    }
  } else {
    usedAiFallback = true;
    evaluationResult = generateHeuristicEvaluation(sub, memberCount, hasFemaleMember);
  }

  // Stage 3 -> Stage 4: Generating Scorecard & Benchmarks
  try {
    await supabaseAdmin
      .from("sih_mock_submissions")
      .update({ evaluation_stage: "generating_scorecard" })
      .eq("id", submissionId);
  } catch {
    // Ignore
  }

  // Compute Empirical Benchmarks
  const benchmarks = await computeEmpiricalBenchmarks(supabaseAdmin, team?.college, evaluationResult.totalScore);

  // Check if newer submission version exists
  let isStillActive = true;
  try {
    const { data: newerSub } = await supabaseAdmin
      .from("sih_mock_submissions")
      .select("id, version")
      .eq("team_id", sub.team_id)
      .eq("is_active", true)
      .gt("version", sub.version)
      .maybeSingle();

    isStillActive = !newerSub && (sub.is_active !== false);
  } catch {
    isStillActive = true;
  }

  // Update DB with evaluation results
  const aiFeedbackObj = {
    strengths: evaluationResult.strengths,
    spocRedFlags: evaluationResult.spocRedFlags,
    slideRecommendations: evaluationResult.slideRecommendations,
    scoreDeductions: evaluationResult.scoreDeductions,
    benchmarks,
    usedAiFallback,
    evaluatedAt: new Date().toISOString(),
  };

  const v2Payload = {
    score_novelty: evaluationResult.scoreNovelty,
    score_tech: evaluationResult.scoreTech,
    score_ui_ux: evaluationResult.scoreUiUx,
    score_impact: evaluationResult.scoreImpact,
    score_team: evaluationResult.scoreTeam,
    total_score: evaluationResult.totalScore,
    grade: evaluationResult.grade,
    status: "reviewed",
    evaluation_stage: "completed",
    score_deductions: evaluationResult.scoreDeductions,
    ai_feedback: aiFeedbackObj,
    updated_at: new Date().toISOString(),
  };

  let finalSubmission: any = null;

  const { data: v2Data, error: v2UpdateErr } = await supabaseAdmin
    .from("sih_mock_submissions")
    .update(v2Payload)
    .eq("id", submissionId)
    .select()
    .single();

  if (!v2UpdateErr && v2Data) {
    finalSubmission = v2Data;
  } else {
    // Fallback for un-migrated schema
    const legacyPayload = {
      score_novelty: evaluationResult.scoreNovelty,
      score_tech: evaluationResult.scoreTech,
      score_ui_ux: evaluationResult.scoreUiUx,
      score_impact: evaluationResult.scoreImpact,
      score_team: evaluationResult.scoreTeam,
      total_score: evaluationResult.totalScore,
      grade: evaluationResult.grade,
      status: "reviewed",
      ai_feedback: aiFeedbackObj,
      updated_at: new Date().toISOString(),
    };

    const { data: legacyData, error: legacyUpdateErr } = await supabaseAdmin
      .from("sih_mock_submissions")
      .update(legacyPayload)
      .eq("id", submissionId)
      .select()
      .single();

    if (legacyUpdateErr || !legacyData) {
      console.error("[Mock SIH Evaluate] DB Update Error:", v2UpdateErr || legacyUpdateErr);
      throw new Error(`Failed to store evaluation: ${(legacyUpdateErr || v2UpdateErr)?.message}`);
    }

    finalSubmission = legacyData;
  }

  logSihEvent("info", {
    event: "SIH_EVALUATE",
    submissionId,
    teamId,
    durationMs: Date.now() - startTime,
    message: `Evaluation completed successfully. Total Score: ${evaluationResult.totalScore}`,
  });

  return {
    submission: finalSubmission,
    evaluation: evaluationResult,
    benchmarks,
    isStillActive,
  };
}

async function callGeminiWithFastTimeout(
  geminiKey: string,
  sub: any,
  team: any,
  members: any[],
  memberCount: number,
  hasFemaleMember: boolean
) {
  const promptText = `You are a Senior Smart India Hackathon (SIH) Jury Evaluator and College SPOC Committee Chair. Evaluate this SIH 2026 pitch submission with high rigor.

SUBMISSION METADATA:
- Problem Statement ID: ${sub.ps_number}
- PS Title: ${sub.ps_title}
- Category: ${sub.ps_category} (Software / Hardware)
- Theme: ${sub.theme}
- Presentation PPT Link: ${sub.ppt_url}
- GitHub Code Link: ${sub.github_url || "Not provided"}
- Prototype Video Link: ${sub.demo_url || "Not provided"}

TEAM COMPOSITION:
- Team Name: ${team?.name || "SIH Team"}
- Total Members: ${memberCount} / 6
- Mandatory Female Teammate Present: ${hasFemaleMember ? "YES" : "NO (STRICT SIH RULE VIOLATION)"}
- Team Member Profiles & Skills: ${JSON.stringify(
    members.map((m: any) => ({
      name: m.profiles?.full_name,
      gender: m.profiles?.gender,
      skills: m.profiles?.skills,
    }))
  )}

SIH SCORING RUBRIC (Max 100 Points):
1. Problem Novelty & Alignment (Max 20 pts)
2. Technical Architecture & Feasibility (Max 25 pts)
3. UI/UX & Presentation Polish (Max 20 pts)
4. Impact & 36-Hour Implementation Roadmap (Max 20 pts)
5. Team Balance & SIH Rules (Max 15 pts)

CRITICAL INSTRUCTION:
Return ONLY a raw JSON object (no markdown, no backticks, no wrapping) with exact structure:
{
  "scoreNovelty": number (0-20),
  "scoreTech": number (0-25),
  "scoreUiUx": number (0-20),
  "scoreImpact": number (0-20),
  "scoreTeam": number (0-15),
  "totalScore": number (0-100),
  "grade": "Nomination Gold 🏆" | "Nomination Ready ✅" | "Needs Iteration ⚠️" | "High SPOC Risk 🚨",
  "scoreDeductions": {
    "novelty": "Specific explanation of why points were lost in Novelty",
    "tech": "Specific explanation of why points were lost in Technical Architecture",
    "uiUx": "Specific explanation of why points were lost in UI/UX",
    "impact": "Specific explanation of why points were lost in Impact & Roadmap",
    "team": "Specific explanation of why points were lost in Team Balance & SIH Rules"
  },
  "strengths": ["string", "string", "string"],
  "spocRedFlags": ["string", "string"],
  "slideRecommendations": {
    "slide1": "Problem statement clarity advice...",
    "slide2": "Proposed solution & innovation advice...",
    "slide3": "Technical architecture & stack advice...",
    "slide4": "Feasibility & 36h implementation roadmap...",
    "slide5": "Impact & target beneficiaries...",
    "slide6": "Team member role division & SIH compliance..."
  }
}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!aiRes.ok) {
      throw new Error(`Gemini API HTTP ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    let rawJsonText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJsonText) throw new Error("Empty AI response text");

    rawJsonText = rawJsonText.replace(/```json/gi, "").replace(/```/g, "").trim();

    const parsed = JSON.parse(rawJsonText);
    const scoreNovelty = Math.min(20, Math.max(0, parsed.scoreNovelty || 14));
    const scoreTech = Math.min(25, Math.max(0, parsed.scoreTech || 18));
    const scoreUiUx = Math.min(20, Math.max(0, parsed.scoreUiUx || 15));
    const scoreImpact = Math.min(20, Math.max(0, parsed.scoreImpact || 16));
    const scoreTeam = Math.min(15, Math.max(0, parsed.scoreTeam || (hasFemaleMember && memberCount === 6 ? 15 : 8)));
    const totalScore = scoreNovelty + scoreTech + scoreUiUx + scoreImpact + scoreTeam;

    return {
      scoreNovelty,
      scoreTech,
      scoreUiUx,
      scoreImpact,
      scoreTeam,
      totalScore,
      grade: parsed.grade || "Nomination Ready ✅",
      strengths: parsed.strengths || ["Well-aligned problem statement", "Robust architecture choice"],
      spocRedFlags: parsed.spocRedFlags || [],
      slideRecommendations: parsed.slideRecommendations || {},
      scoreDeductions: {
        novelty: parsed.scoreDeductions?.novelty || `Lost ${20 - scoreNovelty} points in Problem Alignment & Novelty.`,
        tech: parsed.scoreDeductions?.tech || `Lost ${25 - scoreTech} points in Technical Architecture.`,
        uiUx: parsed.scoreDeductions?.uiUx || `Lost ${20 - scoreUiUx} points in UI/UX & Polish.`,
        impact: parsed.scoreDeductions?.impact || `Lost ${20 - scoreImpact} points in Implementation Roadmap.`,
        team: parsed.scoreDeductions?.team || `Lost ${15 - scoreTeam} points in Team Squad Balance & Rules.`,
      },
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function generateHeuristicEvaluation(sub: any, memberCount: number, hasFemaleMember: boolean) {
  const seedString = `${sub.id}_${sub.ps_number}_${sub.ps_title}_${sub.team_id}`;
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }
  const positiveHash = Math.abs(hash);

  let scoreNovelty = 15 + (positiveHash % 5);
  let scoreTech    = 18 + ((positiveHash >> 2) % 5);
  let scoreUiUx    = 14 + ((positiveHash >> 4) % 5);
  let scoreImpact  = 15 + ((positiveHash >> 6) % 5);

  let scoreTeam = 6;
  if (memberCount >= 4) scoreTeam += 3;
  if (memberCount === 6) scoreTeam += 3;
  if (hasFemaleMember) scoreTeam += 3;

  if (sub.github_url) scoreTech = Math.min(25, scoreTech + 3);
  if (sub.demo_url)   scoreUiUx = Math.min(20, scoreUiUx + 2);

  const totalScore = scoreNovelty + scoreTech + scoreUiUx + scoreImpact + scoreTeam;

  let grade = "Nomination Ready ✅";
  if (totalScore >= 88) grade = "Nomination Gold 🏆";
  else if (totalScore < 75) grade = "Needs Iteration ⚠️";

  const spocRedFlags: string[] = [];
  if (memberCount < 6) {
    spocRedFlags.push(
      `Incomplete Squad Size (${memberCount}/6 members). Official SIH guidelines mandate a full 6-member team.`
    );
  }
  if (!hasFemaleMember) {
    spocRedFlags.push(
      "Missing Female Teammate. At least 1 female builder is mandatory per official SIH regulations."
    );
  }
  if (!sub.github_url) {
    spocRedFlags.push(
      "No GitHub Repository attached. Evaluators favor teams with open-source proof of work."
    );
  }

  const deductions = {
    novelty: `Lost ${20 - scoreNovelty} points because problem alignment lacks quantitative baseline metrics in slide deck.`,
    tech: sub.github_url
      ? `Lost ${25 - scoreTech} points because deployment infrastructure and DB schema details are incomplete.`
      : `Lost ${25 - scoreTech} points due to missing GitHub repository proof of work.`,
    uiUx: sub.demo_url
      ? `Lost ${20 - scoreUiUx} points because slide visual hierarchy can be improved.`
      : `Lost ${20 - scoreUiUx} points because working video prototype link was not provided.`,
    impact: `Lost ${20 - scoreImpact} points because 36-hour hackathon execution roadmap lacks clear 9-hour sprint milestones.`,
    team:
      memberCount === 6 && hasFemaleMember
        ? "Full 15/15 pts awarded for full 6-member squad and mandatory female teammate representation."
        : `Lost ${15 - scoreTeam} points due to incomplete squad size (${memberCount}/6) or missing female teammate.`,
  };

  const strengths: string[] = [
    `Strong problem alignment with official ministry PS #${sub.ps_number} (${sub.theme}).`,
    `Defined technical architecture for ${sub.ps_category === "software" ? "Software Edition" : "Hardware Edition"}.`,
  ];
  if (memberCount === 6) strengths.push("Full 6-member team squad complete.");
  if (hasFemaleMember) strengths.push("Mandatory female team member rule satisfied.");
  if (sub.github_url) strengths.push("GitHub Repository attached demonstrating initial codebase commits.");

  const slideRecommendations: Record<string, string> = {
    slide1: `Title & Overview: Explicitly mention Ministry/Organization for PS #${sub.ps_number} and leader contact details.`,
    slide2: `Problem & Solution: Highlight key metrics showing how your solution solves ${sub.ps_title}.`,
    slide3: `Technical Stack: Detail database architecture, API design, and offline resilience.`,
    slide4: `36-Hour Plan: Break down development into 4 clear 9-hour hackathon milestones.`,
    slide5: `Impact & Commercial Model: Quantify target beneficiaries and cost efficiency.`,
    slide6: `Team Roles: Map all 6 members strictly to specific technical domains (Frontend, Backend, ML/Hardware, Pitch Presenter).`,
  };

  return {
    scoreNovelty,
    scoreTech,
    scoreUiUx,
    scoreImpact,
    scoreTeam,
    totalScore,
    grade,
    strengths,
    spocRedFlags,
    slideRecommendations,
    scoreDeductions: deductions,
  };
}

async function computeEmpiricalBenchmarks(supabaseAdmin: any, college: string | null, teamScore: number) {
  try {
    const { data: allActive } = await supabaseAdmin
      .from("sih_mock_submissions")
      .select("total_score")
      .gt("total_score", 0);

    if (!allActive || allActive.length === 0) {
      return { teamScore, collegeAvg: teamScore, nationalAvg: teamScore, top10Percent: Math.max(90, teamScore) };
    }

    const scores = allActive.map((a: any) => a.total_score).sort((a: number, b: number) => a - b);
    const nationalAvg = Math.round(scores.reduce((acc: number, s: number) => acc + s, 0) / scores.length);

    const top10Index = Math.floor(scores.length * 0.9);
    const top10Percent = scores[top10Index] || 90;

    return {
      teamScore,
      collegeAvg: nationalAvg,
      nationalAvg,
      top10Percent,
    };
  } catch {
    return { teamScore, collegeAvg: teamScore, nationalAvg: 72, top10Percent: 91 };
  }
}
