import { createClient } from "@supabase/supabase-js";
import { logSihEvent } from "@/lib/admin/sihLogger";
import { extractPresentationText } from "@/lib/sihPresentationExtractor";

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

  let slideText = "";
  try {
    slideText = await extractPresentationText(sub.ppt_url);
  } catch (err: any) {
    console.warn("[SIH Evaluator] Slide extraction failed:", err.message);
    slideText = "(Slide text extraction unavailable)";
  }

  console.log("==================== [SIH EVALUATOR EXTRACTED SLIDE TEXT] ====================");
  console.log(`[Submission ID: ${submissionId}] Length: ${slideText.length} characters`);
  console.log(`[Extracted Content Snippet]:\n${slideText.slice(0, 800)}`);
  console.log("=============================================================================");

  let evaluationResult: {
    scoreNovelty: number;
    scoreTech: number;
    scoreUiUx: number;
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
      team: string;
    };
  };

  let usedAiFallback = false;

  if (geminiKey) {
    try {
      evaluationResult = await callGeminiWithFastTimeout(
        geminiKey,
        sub,
        team,
        members,
        memberCount,
        hasFemaleMember,
        slideText
      );
    } catch (e: any) {
      usedAiFallback = true;
      console.warn(`[SIH Evaluator] Gemini AI unavailable or failed (${e.message}). Triggering Content-Aware Heuristic Fallback Engine.`);
      logSihEvent("info", {
        event: "SIH_FALLBACK",
        submissionId,
        teamId,
        message: "Gemini AI API timed out or unavailable; evaluated using SIH Content-Aware Heuristic Engine.",
        details: { error: e.message },
      });
      evaluationResult = generateHeuristicEvaluation(sub, memberCount, hasFemaleMember, slideText);
    }
  } else {
    usedAiFallback = true;
    console.warn("[SIH Evaluator] GEMINI_API_KEY missing. Evaluating using Content-Aware Heuristic Engine.");
    evaluationResult = generateHeuristicEvaluation(sub, memberCount, hasFemaleMember, slideText);
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
    score_impact: 0,
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
      score_impact: 0,
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

export async function callGeminiWithFastTimeout(
  geminiKey: string,
  sub: any,
  team: any,
  members: any[],
  memberCount: number,
  hasFemaleMember: boolean,
  slideText: string
) {
  const promptText = `You are a Senior Smart India Hackathon (SIH) Jury Evaluator and College SPOC Committee Chair. Evaluate this SIH 2026 pitch submission with high rigor.

CRITICAL SIH FORMAT NOTICE:
- This is an SIH 2026 internal-round pitch deck evaluation.
- Read the EXTRACTED PRESENTATION SLIDE CONTENT below carefully. If quantitative baseline metrics (such as percentages, cost figures, or time savings) are present in the text, DO NOT state or deduct points for lacking quantitative metrics.

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

EXTRACTED PRESENTATION SLIDE CONTENT:
---
${slideText}
---

SIH SCORING RUBRIC (Max 100 Points):
1. Problem Novelty & Alignment (Max 25 pts)
2. Technical Architecture & Feasibility (Max 35 pts)
3. UI/UX & Presentation Polish (Max 25 pts)
4. Team Balance & SIH Rules (Max 15 pts)

CRITICAL INSTRUCTION:
Return ONLY a raw JSON object (no markdown, no backticks, no wrapping) with exact structure:
{
  "scoreNovelty": number (0-25),
  "scoreTech": number (0-35),
  "scoreUiUx": number (0-25),
  "scoreTeam": number (0-15),
  "totalScore": number (0-100),
  "grade": "Nomination Gold 🏆" | "Nomination Ready ✅" | "Needs Iteration ⚠️" | "High SPOC Risk 🚨",
  "scoreDeductions": {
    "novelty": "Specific explanation of why points were lost in Novelty",
    "tech": "Specific explanation of why points were lost in Technical Architecture",
    "uiUx": "Specific explanation of why points were lost in UI/UX",
    "team": "Specific explanation of why points were lost in Team Balance & SIH Rules"
  },
  "strengths": ["string", "string", "string"],
  "spocRedFlags": ["string", "string"],
  "slideRecommendations": {
    "slide1": "Problem statement clarity advice...",
    "slide2": "Proposed solution & innovation advice...",
    "slide3": "Technical architecture & stack advice...",
    "slide4": "Feasibility & key use-cases advice...",
    "slide5": "Target beneficiaries & value proposition advice...",
    "slide6": "Team member role division & SIH compliance advice..."
  }
}`;

  console.log("==================== [SIH EVALUATOR GEMINI PROMPT START] ====================");
  console.log(`[Prompt Length]: ${promptText.length} chars`);
  console.log("==================== [SIH EVALUATOR GEMINI PROMPT END] ====================");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  const modelsToTry = [
    "gemini-flash-latest",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
  ];

  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`[SIH Evaluator] Attempting Gemini model: ${modelName}...`);
      const aiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
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

      if (!aiRes.ok) {
        console.warn(`[SIH Evaluator] Model ${modelName} returned HTTP ${aiRes.status}`);
        lastError = new Error(`Gemini API HTTP ${aiRes.status} (${modelName})`);
        continue;
      }

      const aiData = await aiRes.json();
      let rawJsonText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJsonText) {
        console.warn(`[SIH Evaluator] Empty text response from ${modelName}`);
        continue;
      }

      clearTimeout(timeoutId);

      rawJsonText = rawJsonText.replace(/```json/gi, "").replace(/```/g, "").trim();

      const parsed = JSON.parse(rawJsonText);
      const scoreNovelty = Math.min(25, Math.max(0, parsed.scoreNovelty || 18));
      const scoreTech = Math.min(35, Math.max(0, parsed.scoreTech || 25));
      const scoreUiUx = Math.min(25, Math.max(0, parsed.scoreUiUx || 18));
      const scoreTeam = Math.min(15, Math.max(0, parsed.scoreTeam || (hasFemaleMember && memberCount === 6 ? 15 : 8)));
      const totalScore = scoreNovelty + scoreTech + scoreUiUx + scoreTeam;

      console.log(`[SIH Evaluator] Gemini API (${modelName}) evaluation successful! Total score: ${totalScore}`);

      return {
        scoreNovelty,
        scoreTech,
        scoreUiUx,
        scoreTeam,
        totalScore,
        grade: parsed.grade || "Nomination Ready ✅",
        strengths: parsed.strengths || ["Well-aligned problem statement", "Robust architecture choice"],
        spocRedFlags: parsed.spocRedFlags || [],
        slideRecommendations: parsed.slideRecommendations || {},
        scoreDeductions: {
          novelty: parsed.scoreDeductions?.novelty || `Lost ${25 - scoreNovelty} points in Problem Alignment & Novelty.`,
          tech: parsed.scoreDeductions?.tech || `Lost ${35 - scoreTech} points in Technical Architecture.`,
          uiUx: parsed.scoreDeductions?.uiUx || `Lost ${25 - scoreUiUx} points in UI/UX & Polish.`,
          team: parsed.scoreDeductions?.team || `Lost ${15 - scoreTeam} points in Team Squad Balance & Rules.`,
        },
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        clearTimeout(timeoutId);
        throw err;
      }
      lastError = err;
    }
  }

  clearTimeout(timeoutId);
  throw lastError || new Error("All Gemini AI model attempts failed");
}

export function generateHeuristicEvaluation(
  sub: any,
  memberCount: number,
  hasFemaleMember: boolean,
  slideText: string = ""
) {
  console.log("[SIH Heuristic Engine] Executing Content-Aware Deterministic Evaluation...");
  const lowerText = slideText.toLowerCase();
  const textLength = slideText.length;
  const words = slideText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // 1. Technical Architecture & Component Analysis
  const dbKeywords = ["postgres", "supabase", "mongodb", "sql", "redis", "timescale", "dynamodb", "database", "schema"];
  const archKeywords = ["microservice", "api", "rest", "mqtt", "grpc", "edge", "cloud", "aws", "docker", "jetson", "yolo", "architecture", "pipeline", "realtime", "rtsp"];
  const frameworkKeywords = ["react", "next", "node", "python", "fastapi", "go", "java", "c++", "express", "tailwind", "flutter"];
  const mlKeywords = ["model", "training", "map", "yolov8", "reinforcement", "dqn", "deep learning", "neural", "opencv", "computer vision", "dataset"];

  const hasDb = dbKeywords.some(k => lowerText.includes(k));
  const hasArch = archKeywords.some(k => lowerText.includes(k));
  const hasFramework = frameworkKeywords.some(k => lowerText.includes(k));
  const hasMl = mlKeywords.some(k => lowerText.includes(k));

  const techKeywordCount = [...dbKeywords, ...archKeywords, ...frameworkKeywords, ...mlKeywords]
    .filter(k => lowerText.includes(k)).length;

  // 2. Quantitative Baseline Metrics Analysis (%, costs, response times, numbers)
  const hasPercent = /%\s|percent|reduction|increase|\d+%/i.test(slideText);
  const hasCost = /₹|\$|cost|rupees|budget|rs\.|inr/i.test(slideText);
  const hasTimeMetrics = /min|sec|hour|delay|latency|ms\b|speed/i.test(slideText);
  const hasNumbers = (slideText.match(/\d+/g) || []).length > 5;
  const quantitativeScore = (hasPercent ? 1 : 0) + (hasCost ? 1 : 0) + (hasTimeMetrics ? 1 : 0) + (hasNumbers ? 1 : 0);

  const hasBeneficiaries = /beneficiar|user|market|saas|municipal|revenue|business/i.test(slideText);

  // 3. Content-Driven Rubric Scoring (4 Criteria = 100 Pts Total)
  // Problem Novelty & Alignment (0-25)
  let scoreNovelty = 5;
  if (wordCount > 30) scoreNovelty += 5;
  if (wordCount > 100) scoreNovelty += 5;
  if (quantitativeScore >= 1) scoreNovelty += 5;
  if (hasBeneficiaries || (sub.ps_number && lowerText.includes(sub.ps_number.toLowerCase()))) scoreNovelty += 5;
  scoreNovelty = Math.min(25, Math.max(2, scoreNovelty));

  // Technical Architecture & Feasibility (0-35)
  let scoreTech = 5;
  if (wordCount > 50) scoreTech += 5;
  if (hasArch) scoreTech += 6;
  if (hasDb) scoreTech += 6;
  if (hasFramework || hasMl) scoreTech += 6;
  if (techKeywordCount >= 5) scoreTech += 4;
  if (sub.github_url) scoreTech += 3;
  scoreTech = Math.min(35, Math.max(3, scoreTech));

  // UI/UX & Presentation Polish (0-25)
  let scoreUiUx = 4;
  if (wordCount > 40) scoreUiUx += 5;
  if (lowerText.includes("dashboard") || lowerText.includes("ui") || lowerText.includes("mockup") || lowerText.includes("wireframe") || lowerText.includes("interface")) scoreUiUx += 6;
  if (sub.demo_url) scoreUiUx += 5;
  if (textLength > 300) scoreUiUx += 5;
  scoreUiUx = Math.min(25, Math.max(2, scoreUiUx));

  // Team Squad Balance & SIH Rules (0-15)
  let scoreTeam = 0;
  if (memberCount >= 1) scoreTeam += 2;
  if (memberCount >= 4) scoreTeam += 3;
  if (memberCount === 6) scoreTeam += 4;
  if (hasFemaleMember) scoreTeam += 6;
  scoreTeam = Math.min(15, Math.max(0, scoreTeam));

  const totalScore = scoreNovelty + scoreTech + scoreUiUx + scoreTeam;

  let grade = "Nomination Ready ✅";
  if (totalScore >= 88) grade = "Nomination Gold 🏆";
  else if (totalScore < 70) grade = "Needs Iteration ⚠️";
  if (totalScore < 50 || !hasFemaleMember || memberCount < 6) grade = "High SPOC Risk 🚨";

  // Dynamic Content-Aware Red Flags
  const spocRedFlags: string[] = [];
  if (memberCount < 6) {
    spocRedFlags.push(`Incomplete Squad Size (${memberCount}/6 members). Official SIH guidelines mandate a full 6-member team.`);
  }
  if (!hasFemaleMember) {
    spocRedFlags.push("Missing Female Teammate. At least 1 female builder is mandatory per official SIH regulations.");
  }
  if (!sub.github_url) {
    spocRedFlags.push("No GitHub Repository attached. Evaluators favor teams with open-source proof of work.");
  }
  if (wordCount < 40) {
    spocRedFlags.push("Extremely sparse slide content. Presentation lacks technical specifications.");
  }

  // Dynamic Content-Aware Score Deductions
  const deductions = {
    novelty: wordCount < 40
      ? `Lost ${25 - scoreNovelty} points due to extremely minimal slide text and missing problem context.`
      : `Lost ${25 - scoreNovelty} points due to missing quantitative baseline metrics or competitive differentiation.`,
    tech: !hasArch && !hasDb
      ? `Lost ${35 - scoreTech} points due to lack of defined technical architecture, database design, and framework specifications.`
      : `Lost ${35 - scoreTech} points because deployment infrastructure or fail-safe specifications can be expanded.`,
    uiUx: sub.demo_url
      ? `Lost ${25 - scoreUiUx} points because slide visual mockups and user flow diagrams need improvement.`
      : `Lost ${25 - scoreUiUx} points due to missing working prototype video demonstration link.`,
    team: memberCount === 6 && hasFemaleMember
      ? "Full 15/15 pts awarded for full 6-member squad and mandatory female teammate representation."
      : `Lost ${15 - scoreTeam} points due to incomplete squad size (${memberCount}/6) or missing mandatory female teammate.`,
  };

  const strengths: string[] = [
    `Problem alignment registered for official ministry PS #${sub.ps_number} (${sub.theme}).`,
  ];
  if (hasArch || hasDb) strengths.push("Technical stack components (databases/architecture) defined in pitch text.");
  if (hasPercent || hasCost) strengths.push("Quantitative baseline metrics or cost efficiency figures included.");
  if (memberCount === 6) strengths.push("Full 6-member team squad complete.");
  if (hasFemaleMember) strengths.push("Mandatory female team member rule satisfied.");
  if (sub.github_url) strengths.push("GitHub Repository attached demonstrating codebase proof of work.");

  const slideRecommendations: Record<string, string> = {
    slide1: wordCount < 40
      ? `Title & Overview: Slide text is minimal. Replace placeholder text with team name, PS ID #${sub.ps_number}, and college affiliation.`
      : `Title & Overview: Explicitly mention Ministry/Organization for PS #${sub.ps_number} and leader contact details.`,
    slide2: hasPercent
      ? `Problem & Solution: Good baseline metrics. Add visual infographics contrasting before vs after solution implementation.`
      : `Problem & Solution: Highlight quantitative baseline metrics showing current delays or costs before your solution.`,
    slide3: hasArch || hasDb
      ? `Technical Stack: System components detected. Add a high-level block diagram showing data flow and fail-safe behavior.`
      : `Technical Stack: Insert detailed backend DB architecture, API frameworks, and hardware schematics instead of basic descriptions.`,
    slide4: `Feasibility & Use Cases: Specify target deployment environments and primary user workflows.`,
    slide5: hasCost
      ? `Value Proposition: Cost efficiency figures noted. Detail target municipal/enterprise beneficiaries.`
      : `Value Proposition: Quantify target beneficiaries and cost efficiency vs existing legacy solutions.`,
    slide6: `Team Roles: Map all 6 members strictly to specific technical domains (Frontend, Backend, ML/Hardware, Pitch Presenter).`,
  };

  return {
    scoreNovelty,
    scoreTech,
    scoreUiUx,
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
      .select("total_score, teams(college)")
      .gt("total_score", 0);

    const nationalScores: number[] = (allActive || [])
      .map((a: any) => a.total_score)
      .filter((s: any) => typeof s === "number" && s > 0);

    const collegeScores: number[] = college
      ? (allActive || [])
          .filter(
            (a: any) =>
              a.teams?.college &&
              a.teams.college.toLowerCase().trim() === college.toLowerCase().trim()
          )
          .map((a: any) => a.total_score)
          .filter((s: any) => typeof s === "number" && s > 0)
      : [];

    const hasEnoughNational = nationalScores.length >= 5;
    const hasEnoughCollege = collegeScores.length >= 3;

    const nationalAvg = hasEnoughNational
      ? Math.round(nationalScores.reduce((acc, s) => acc + s, 0) / nationalScores.length)
      : null;

    const collegeAvg = hasEnoughCollege
      ? Math.round(collegeScores.reduce((acc, s) => acc + s, 0) / collegeScores.length)
      : null;

    const top10Percent = hasEnoughNational
      ? nationalScores.sort((a, b) => a - b)[Math.floor(nationalScores.length * 0.9)] || null
      : null;

    return {
      teamScore,
      collegeAvg,
      nationalAvg,
      top10Percent,
      hasEnoughNationalData: hasEnoughNational,
      hasEnoughCollegeData: hasEnoughCollege,
      totalSubmissionsCount: nationalScores.length,
      collegeSubmissionsCount: collegeScores.length,
    };
  } catch {
    return {
      teamScore,
      collegeAvg: null,
      nationalAvg: null,
      top10Percent: null,
      hasEnoughNationalData: false,
      hasEnoughCollegeData: false,
      totalSubmissionsCount: 0,
      collegeSubmissionsCount: 0,
    };
  }
}
