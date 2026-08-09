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
    formatViolations: string[];
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
    formatViolations: evaluationResult.formatViolations || [],
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
  const promptText = `You are a Senior Smart India Hackathon (SIH) Jury Evaluator and College SPOC Committee Chair. Evaluate this SIH 2026 pitch submission against the OFFICIAL SIH 2026 MANDATORY 6-SLIDE TEMPLATE FORMAT.

OFFICIAL SIH 2026 PRESENTATION TEMPLATE STRUCTURE (MANDATORY 6 SLIDES MAX):
1. SLIDE 1 - TITLE PAGE: PS ID, PS Title, Theme, PS Category (Software/Hardware), Team ID, Team Name, College Name.
2. SLIDE 2 - IDEA TITLE & PROPOSED SOLUTION: Detailed explanation, how it addresses the problem, innovation & uniqueness/novelty.
3. SLIDE 3 - TECHNICAL APPROACH: Technologies to be used (languages, frameworks, DBs, models/hardware), methodology/implementation process (flowcharts/architecture/prototype link).
4. SLIDE 4 - FEASIBILITY AND VIABILITY: Feasibility analysis, potential challenges & technical risks, clear mitigation strategies.
5. SLIDE 5 - IMPACT AND BENEFITS: Impact on target audience, social/economic/environmental benefits, quantified metrics.
6. SLIDE 6 - RESEARCH AND REFERENCES: Supporting research papers, dataset sources, citations, reference links.

OFFICIAL SIH FORMAT RULES & CONSTRAINTS:
- Maximum 6 slides total (including title slide).
- Template structure must NOT be altered or re-ordered.
- Paragraphs must be avoided; bullet points, flowcharts, architecture diagrams, and infographics are strongly preferred.
- Idea must demonstrate novelty/uniqueness over generic existing solutions.

FEW-SHOT EVALUATION EXAMPLES:

Example 1 (Strong Technical Approach - Slide 3):
Text: "Slide 3: Technical Approach. Stack: Next.js 16, Supabase PostgreSQL, FastAPI, YOLOv8 edge model on Jetson Nano. Flow: RTSP Stream -> OpenCV Sampling (15fps) -> Edge YOLO -> MQTT -> Supabase -> Dashboard. Prototype: https://demo.hackermate.in"
Evaluation: scoreTech=34/35. FormatViolations=[]. Reason: "Explicit tech stack, data pipeline, edge target, and working prototype provided."

Example 2 (Weak Feasibility - Slide 4):
Text: "Slide 4: Feasibility. Our project is very feasible because we will work hard to build it. We will use cloud servers to solve all problems automatically."
Evaluation: scoreTech=14/35. FormatViolations=["Format Warning: Slide 4 is paragraph-heavy and lacks specific technical risks, latency constraints, or mitigation protocols."].

Example 3 (Format Violation - Over Slide Limit & Missing References):
Text: 8 slides total; missing Slide 6 Research/References; Slide 1 missing PS ID.
Evaluation: scoreNovelty=10/25. FormatViolations=["Format Violation: Exceeds mandatory 6-slide limit (8 slides detected).", "Format Violation: Missing Slide 6 (Research and References).", "Format Violation: Slide 1 missing mandatory PS ID."].

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
1. Problem Novelty & Alignment (Max 25 pts) -> Evaluated via Slide 1 & Slide 2.
2. Technical Architecture & Feasibility (Max 35 pts) -> Evaluated via Slide 3 & Slide 4.
3. UI/UX, Impact & Research Polish (Max 25 pts) -> Evaluated via Slide 5 & Slide 6 + Prototype Link.
4. Team Squad Balance & Rule Compliance (Max 15 pts) -> 6-member squad, female teammate, 6-slide max rule.

CRITICAL INSTRUCTION:
Return ONLY a raw JSON object (no markdown, no backticks, no wrapping) with exact structure:
{
  "scoreNovelty": number (0-25),
  "scoreTech": number (0-35),
  "scoreUiUx": number (0-25),
  "scoreTeam": number (0-15),
  "totalScore": number (0-100),
  "grade": "Nomination Gold 🏆" | "Nomination Ready ✅" | "Needs Iteration ⚠️" | "High SPOC Risk 🚨",
  "formatViolations": ["Format Violation: ..."],
  "scoreDeductions": {
    "novelty": "Specific explanation of why points were lost in Novelty",
    "tech": "Specific explanation of why points were lost in Technical Architecture",
    "uiUx": "Specific explanation of why points were lost in UI/UX",
    "team": "Specific explanation of why points were lost in Team Balance & SIH Rules"
  },
  "strengths": ["string", "string", "string"],
  "spocRedFlags": ["string", "string"],
  "slideRecommendations": {
    "titlePage": "Slide 1 Title Page guidance...",
    "proposedSolution": "Slide 2 Idea guidance...",
    "technicalApproach": "Slide 3 Tech Approach guidance...",
    "feasibilityAndRisks": "Slide 4 Feasibility & Risk guidance...",
    "impactAndBenefits": "Slide 5 Impact guidance...",
    "researchAndReferences": "Slide 6 References guidance..."
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
        formatViolations: Array.isArray(parsed.formatViolations) ? parsed.formatViolations : [],
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

  // 1. Broad & Extensible Technology Category Registry
  const databases = ["postgres", "postgresql", "supabase", "mongodb", "redis", "mysql", "sqlite", "timescale", "dynamodb", "firebase", "firestore", "cassandra", "neo4j", "cockroachdb"];
  const cloudPlatforms = ["aws", "gcp", "azure", "vercel", "render", "docker", "kubernetes", "k8s", "serverless", "lambda", "cloudflare", "edge"];
  const frameworks = ["react", "next", "vue", "angular", "svelte", "node", "express", "fastapi", "flask", "django", "spring", "nestjs", "rails", "laravel", "flutter"];
  const mlAi = ["yolo", "yolov8", "opencv", "pytorch", "tensorflow", "keras", "scikit-learn", "huggingface", "llm", "gemini", "openai", "rag", "bert", "neural", "computer vision"];
  const protocols = ["rest", "api", "mqtt", "grpc", "websocket", "rtsp", "graphql", "microservice"];
  const hardware = ["jetson", "raspberry pi", "esp32", "arduino", "nvidia", "sensor", "iot"];

  const foundDb = databases.filter(k => lowerText.includes(k));
  const foundCloud = cloudPlatforms.filter(k => lowerText.includes(k));
  const foundFramework = frameworks.filter(k => lowerText.includes(k));
  const foundMl = mlAi.filter(k => lowerText.includes(k));
  const foundProtocol = protocols.filter(k => lowerText.includes(k));
  const foundHw = hardware.filter(k => lowerText.includes(k));

  const techDomainCount = [
    foundDb.length > 0,
    foundCloud.length > 0,
    foundFramework.length > 0,
    foundMl.length > 0,
    foundProtocol.length > 0,
    foundHw.length > 0,
  ].filter(Boolean).length;

  // 2. Specificity & Technical Pipeline Analysis (vs Generic Buzzwords)
  const hasDataFlowPipeline = /->|-->|=>|pipeline|architecture|data flow|flowchart|ingests|streams|serializes|publishes/i.test(slideText);
  const hasRiskMitigation = /mitigation|technical risk|fail-safe|offline|fallback|occlusion|latency mitigation|redundancy/i.test(slideText);
  const hasBullets = /[•\-\*]\s|\d+\.\s/.test(slideText);

  // Quantitative Baseline Metrics Analysis (%, costs, response times, numbers)
  const hasPercent = /%\s|percent|reduction|increase|\d+%/i.test(slideText);
  const hasCost = /₹|\$|cost|rupees|budget|rs\.|inr/i.test(slideText);
  const hasTimeMetrics = /min|sec|hour|delay|latency|ms\b|speed|fps/i.test(slideText);
  const hasNumbers = (slideText.match(/\d+/g) || []).length > 3;
  const quantitativeScore = (hasPercent ? 1 : 0) + (hasCost ? 1 : 0) + (hasTimeMetrics ? 1 : 0) + (hasNumbers ? 1 : 0);
  const hasBeneficiaries = /beneficiar|user|market|saas|municipal|revenue|business|citizen/i.test(slideText);

  // 3. Robust Format Infractions Detection
  const formatViolations: string[] = [];

  // Detect total slide count: check [Slide N] markers from segmenter
  const bracketSlideMatches = slideText.match(/\[Slide\s*\d+\]/gi);
  let detectedMaxSlide = 0;
  if (bracketSlideMatches) {
    detectedMaxSlide = bracketSlideMatches.length;
  } else {
    const literalSlideMatches = slideText.match(/slide\s*(\d+)/gi);
    if (literalSlideMatches) {
      literalSlideMatches.forEach((m) => {
        const num = parseInt(m.replace(/slide\s*/i, ""), 10);
        if (!isNaN(num) && num > detectedMaxSlide) detectedMaxSlide = num;
      });
    }
  }

  // Check for leftover instructions slide
  const hasLeftoverInstructions = /maximum slides limit up to six|IMPORTANT INSTRUCTIONS|You can delete this slide/i.test(slideText);
  if (hasLeftoverInstructions) {
    if (detectedMaxSlide < 7) detectedMaxSlide = 8;
    formatViolations.push("Format Violation: Leftover SIH template instructions slide (Slide 8) was not deleted prior to submission.");
  }

  if (detectedMaxSlide > 6) {
    formatViolations.push(`Format Violation: Exceeds mandatory 6-slide limit (${detectedMaxSlide} slides detected).`);
  }

  // Detect mandatory 6 sections across slide text
  const hasSlide1Title = /title page|problem statement id|team name|category/i.test(slideText);
  const hasSlide2Solution = /proposed solution|idea title|innovation|novelty/i.test(slideText);
  const hasSlide3Tech = /technical approach|tech stack|methodology|architecture/i.test(slideText);
  const hasSlide4Feasibility = /feasibility|viability|risk|mitigation|challenges/i.test(slideText);
  const hasSlide5Impact = /impact|benefits|beneficiar/i.test(slideText);
  const hasSlide6Research = /research|reference|citation|dataset/i.test(slideText);

  let missingSectionCount = 0;
  if (!hasSlide1Title) { formatViolations.push("Format Violation: Missing Slide 1 Title Page metadata (PS ID, Category, Team Name)."); missingSectionCount++; }
  if (!hasSlide2Solution) { formatViolations.push("Format Violation: Missing Slide 2 (Proposed Solution & Innovation)."); missingSectionCount++; }
  if (!hasSlide3Tech) { formatViolations.push("Format Violation: Missing Slide 3 (Technical Approach & Architecture)."); missingSectionCount++; }
  if (!hasSlide4Feasibility) { formatViolations.push("Format Violation: Missing Slide 4 (Feasibility & Technical Risk Mitigation)."); missingSectionCount++; }
  if (!hasSlide5Impact) { formatViolations.push("Format Violation: Missing Slide 5 (Impact & Beneficiaries)."); missingSectionCount++; }
  if (!hasSlide6Research) { formatViolations.push("Format Violation: Missing Slide 6 (Research and References)."); missingSectionCount++; }

  // Detect duplicate section headers (e.g. TECHNICAL APPROACH appearing > 1 time across separate slides)
  const techApproachMatches = (slideText.match(/TECHNICAL APPROACH/gi) || []).length;
  if (techApproachMatches > 1) {
    formatViolations.push(`Format Violation: Technical Approach section is duplicated ${techApproachMatches}x across slides instead of following the single 6-slide template structure.`);
  }

  // Detect unfilled template placeholders
  const hasUnfilledPlaceholders = /Potential impact on the target audience|Benefits of the solution \(social, economic|Team Name \(Registered on portal\) - CodeSquad|Your Team Name/i.test(slideText);
  if (hasUnfilledPlaceholders) {
    formatViolations.push("Format Violation: Presentation contains unfilled template guidance placeholders on Impact & Title slides.");
  }

  if (wordCount > 100 && !hasBullets) {
    formatViolations.push("Format Notice: Presentation contains dense text blocks. SIH guidelines strongly prefer bullet points, flowcharts, and architecture block diagrams over paragraphs.");
  }

  // 4. Content-Driven Rubric Scoring (4 Criteria = 100 Pts Max)

  // Problem Novelty & Alignment (0-25)
  let scoreNovelty = 5;
  if (wordCount > 30) scoreNovelty += 4;
  if (wordCount > 100) scoreNovelty += 3;
  if (quantitativeScore >= 1) scoreNovelty += 5;
  if (hasBeneficiaries || (sub.ps_number && lowerText.includes(sub.ps_number.toLowerCase()))) scoreNovelty += 4;
  if (hasRiskMitigation) scoreNovelty += 4;
  if (!hasRiskMitigation && quantitativeScore === 0) {
    scoreNovelty = Math.min(12, scoreNovelty); // Vague deck cap
  }
  scoreNovelty = Math.min(25, Math.max(2, scoreNovelty));

  // Technical Architecture & Feasibility (0-35)
  let scoreTech = 5;
  if (wordCount > 40) scoreTech += 4;
  if (hasDataFlowPipeline) scoreTech += 8;
  if (techDomainCount >= 2) scoreTech += 8;
  if (foundMl.length > 0 || foundHw.length > 0 || foundProtocol.length > 0) scoreTech += 5;
  if (sub.github_url) scoreTech += 5;
  if (!hasDataFlowPipeline && techDomainCount < 2) {
    scoreTech = Math.min(14, scoreTech); // Vague deck cap: no concrete pipeline or tech stack
  }
  scoreTech = Math.min(35, Math.max(3, scoreTech));

  // UI/UX & Presentation Polish (0-25)
  let scoreUiUx = 4;
  if (wordCount > 40) scoreUiUx += 4;
  if (hasBullets) scoreUiUx += 6;
  if (lowerText.includes("dashboard") || lowerText.includes("mockup") || lowerText.includes("flowchart") || lowerText.includes("wireframe") || lowerText.includes("interface")) scoreUiUx += 6;
  if (sub.demo_url) scoreUiUx += 5;
  if (!hasBullets && wordCount > 60) {
    scoreUiUx = Math.max(2, scoreUiUx - 5); // Dense paragraph penalty
  }
  scoreUiUx = Math.min(25, Math.max(2, scoreUiUx));

  // Team Squad Balance & SIH Rules (0-15)
  let scoreTeam = 0;
  if (memberCount >= 1) scoreTeam += 2;
  if (memberCount >= 4) scoreTeam += 3;
  if (memberCount === 6) scoreTeam += 4;
  if (hasFemaleMember) scoreTeam += 6;
  if (detectedMaxSlide > 6) scoreTeam = Math.max(0, scoreTeam - 5);
  scoreTeam = Math.min(15, Math.max(0, scoreTeam));

  // Calculate Raw Score
  let rawTotalScore = scoreNovelty + scoreTech + scoreUiUx + scoreTeam;

  // Apply Hard Score Caps & Grade Assignment
  let totalScore = rawTotalScore;

  if (detectedMaxSlide > 6) {
    totalScore = Math.min(48, totalScore); // Cap format-violating 8-slide decks at 48 max
  } else if (missingSectionCount >= 2) {
    totalScore = Math.min(45, totalScore); // Cap sparse decks missing multiple sections at 45 max
  } else if (!hasDataFlowPipeline && !hasRiskMitigation) {
    totalScore = Math.min(48, totalScore); // Cap vague decks lacking architecture flow & risk mitigation at 48 max (High SPOC Risk 🚨)
  }

  let grade = "Nomination Ready ✅";
  if (totalScore >= 85 && formatViolations.length === 0) grade = "Nomination Gold 🏆";
  else if (totalScore < 70) grade = "Needs Iteration ⚠️";
  if (totalScore < 50 || !hasFemaleMember || memberCount < 6 || formatViolations.some((f) => f.includes("Exceeds mandatory"))) {
    grade = "High SPOC Risk 🚨";
  }

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
  if (formatViolations.length > 0) {
    spocRedFlags.push(`Template Format Non-Compliance: ${formatViolations.length} slide format infractions detected.`);
  }

  // Dynamic Content-Aware Score Deductions
  const deductions = {
    novelty: wordCount < 40
      ? `Lost ${25 - scoreNovelty} points due to extremely minimal slide text and missing problem context.`
      : `Lost ${25 - scoreNovelty} points due to missing quantitative baseline metrics or competitive differentiation.`,
    tech: !hasDataFlowPipeline && techDomainCount === 0
      ? `Lost ${35 - scoreTech} points due to lack of defined technical architecture data flow, database design, and framework specifications.`
      : `Lost ${35 - scoreTech} points because deployment infrastructure, data pipeline flowcharts, or fail-safe specifications can be expanded.`,
    uiUx: sub.demo_url
      ? `Lost ${25 - scoreUiUx} points because slide visual mockups and user flow diagrams need improvement.`
      : `Lost ${25 - scoreUiUx} points due to missing working prototype video demonstration link.`,
    team: memberCount === 6 && hasFemaleMember && detectedMaxSlide <= 6
      ? "Full 15/15 pts awarded for full 6-member squad, mandatory female teammate, and 6-slide template compliance."
      : `Lost ${15 - scoreTeam} points due to incomplete squad size (${memberCount}/6), missing female teammate, or exceeding 6-slide max limit.`,
  };

  const strengths: string[] = [
    `Problem alignment registered for official ministry PS #${sub.ps_number} (${sub.theme}).`,
  ];
  if (hasDataFlowPipeline || techDomainCount > 0) strengths.push("Technical stack components (databases/architecture/pipeline) defined in pitch text.");
  if (hasPercent || hasCost) strengths.push("Quantitative baseline metrics or cost efficiency figures included.");
  if (memberCount === 6) strengths.push("Full 6-member team squad complete.");
  if (hasFemaleMember) strengths.push("Mandatory female team member rule satisfied.");
  if (sub.github_url) strengths.push("GitHub Repository attached demonstrating codebase proof of work.");

  const slideRecommendations: Record<string, string> = {
    titlePage: hasSlide1Title
      ? `Slide 1 (Title Page): Ensure PS Category (${sub.ps_category}), Ministry ID, and Leader contact details are clearly formatted.`
      : `Slide 1 (Title Page): 🚨 SECTION MISSING/UNFILLED — Ensure team name, PS ID #${sub.ps_number}, theme, and college affiliation are explicitly filled out.`,
    proposedSolution: hasSlide2Solution
      ? (hasPercent ? `Slide 2 (Proposed Solution): Good baseline metrics. Contrast existing solution drawbacks vs your proposed innovation using visual infographics.` : `Slide 2 (Proposed Solution): Clearly articulate why your solution is unique and novel compared to standard existing web/mobile apps.`)
      : `Slide 2 (Proposed Solution): 🚨 SECTION MISSING — Official SIH guidelines mandate Slide 2 dedicated to your idea title, proposed solution, and core innovation.`,
    technicalApproach: techApproachMatches > 1
      ? `Slide 3 (Technical Approach): ⚠️ DUPLICATED SECTION — Technical Approach is duplicated across ${techApproachMatches} slides. Consolidate into Slide 3 with a block architecture diagram.`
      : (hasSlide3Tech ? `Slide 3 (Technical Approach): Good technical stack. Include a high-level block architecture diagram and data pipeline flowchart.` : `Slide 3 (Technical Approach): 🚨 SECTION MISSING — Official SIH guidelines mandate Slide 3 dedicated to technical methodology and data flow.`),
    feasibilityAndRisks: hasSlide4Feasibility
      ? `Slide 4 (Feasibility & Risks): List 2-3 specific technical risks (e.g. latency, offline edge fallback) and exact mitigation strategies.`
      : `Slide 4 (Feasibility & Risks): 🚨 SECTION MISSING — Official SIH guidelines mandate Slide 4 dedicated to feasibility analysis and technical risk mitigation.`,
    impactAndBenefits: hasSlide5Impact
      ? (hasCost ? `Slide 5 (Impact & Benefits): Cost metrics noted. Quantify specific target audience beneficiaries.` : `Slide 5 (Impact & Benefits): Quantify target beneficiaries and cost efficiency figures vs legacy manual processes.`)
      : `Slide 5 (Impact & Benefits): 🚨 SECTION MISSING — Official SIH guidelines mandate Slide 5 dedicated to target beneficiaries and impact metrics.`,
    researchAndReferences: hasSlide6Research
      ? `Slide 6 (Research & References): Cite official research papers, open datasets, and external technical documentation links.`
      : `Slide 6 (Research & References): 🚨 SECTION MISSING — Official SIH guidelines mandate Slide 6 dedicated to research papers, open datasets, and reference citations.`,
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
    formatViolations,
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
