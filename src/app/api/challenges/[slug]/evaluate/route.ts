import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { extractChallengeTextFromPDF, extractChallengePresentationFromUrl } from "@/lib/challenges/challengeExtractor";
import { runChallengePitchEvaluation } from "@/lib/challenges/challengeEvaluatorEngine";
import { validatePresentationUrl } from "@/lib/ppt/presentationExtractor";
import { PRESENTATION_LIMITS } from "@/lib/ppt/analysisMetadata";
import { reserveEvaluation } from "@/lib/evaluator/evaluatorBudgetGuard";
import { EvaluationFailure, evaluationFailure, evaluationRead, evaluationSignal, verifiedEvaluationActor, inputString, isUuid, readEvaluationForm, assertExecution, withinDeadline, logDatabaseFailure, type EvaluationExecution } from "@/lib/evaluator/evaluationContract";

export const maxDuration = 60;
export const runtime = "nodejs";
const COLUMNS = "id, challenge_id, user_id, team_id, submission_mode, submission_type, external_link_url, ppt_url, file_name, github_url, demo_url, version, status, score_problem, score_solution, score_architecture, score_feasibility_impact, total_score, grade, strengths, growth_areas, slide_feedback, format_violations, score_deductions, ai_raw_feedback, used_ai_fallback, created_at, updated_at";
const CHALLENGE_COLUMNS = "id, slug, title, track, problem_statement, additional_rules, status, starts_at, ends_at";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const started = Date.now(), requestId = randomUUID();
  const execution: EvaluationExecution = { deadlineAt: started + 50_000, signal: AbortSignal.any([req.signal, AbortSignal.timeout(50_000)]), requestId, attempts: 0 };
  const preflight = { ...execution, deadlineAt: started + 5_000 };
  let submissionId: string | undefined;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new EvaluationFailure("limiter_unavailable");
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
      fetch: (target, init) => fetch(target, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000) }),
    } });
    const userId = await verifiedEvaluationActor(admin, req, preflight);
    let slug: string;
    try { slug = inputString(decodeURIComponent((await params).slug), 200); } catch { throw new EvaluationFailure("invalid_input"); }
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    let challenge = await evaluationRead(admin.from("weekly_challenges").select(CHALLENGE_COLUMNS).eq("slug", slug).abortSignal(evaluationSignal(preflight)).maybeSingle(), preflight, "read_exact_challenge");
    if (!challenge && cleanSlug && cleanSlug !== slug) challenge = await evaluationRead(admin.from("weekly_challenges").select(CHALLENGE_COLUMNS).eq("slug", cleanSlug).abortSignal(evaluationSignal(preflight)).maybeSingle(), preflight, "read_canonical_challenge");
    if (!challenge && isUuid(slug)) challenge = await evaluationRead(admin.from("weekly_challenges").select(CHALLENGE_COLUMNS).eq("id", slug).abortSignal(evaluationSignal(preflight)).maybeSingle(), preflight, "read_challenge_id");
    if (!challenge) throw new EvaluationFailure("not_found");
    if (!isUuid(challenge.id) || !Number.isFinite(Date.parse(challenge.starts_at)) || !Number.isFinite(Date.parse(challenge.ends_at))) throw new EvaluationFailure("database_unavailable");
    if (challenge.status !== "active" || Date.parse(challenge.starts_at) > Date.now() || Date.parse(challenge.ends_at) <= Date.now()) throw new EvaluationFailure("forbidden");
    const form = await readEvaluationForm(req, preflight);
    const file = form.get("file"), linkValue = form.get("external_link_url");
    const externalLink = linkValue == null || linkValue === "" ? null : inputString(linkValue, 2048);
    if ((file !== null && typeof file === "string") || (!!file === !!externalLink)) throw new EvaluationFailure("invalid_input");
    if (externalLink && !validatePresentationUrl(externalLink).valid) throw new EvaluationFailure("invalid_input");
    if (file && (file.size > PRESENTATION_LIMITS.pdfBytes || !file.size || file.type !== "application/pdf")) throw new EvaluationFailure("invalid_input");
    const mode = inputString(form.get("submission_mode"), 8);
    const teamValue = form.get("team_id"), teamId = teamValue == null || teamValue === "" ? null : inputString(teamValue, 36);
    if (!["solo", "team"].includes(mode) || (mode === "team" && !isUuid(teamId)) || (mode === "solo" && teamId !== null)) throw new EvaluationFailure("invalid_input");
    const optionalUrl = (value: FormDataEntryValue | null) => {
      if (value == null || value === "") return null;
      const text = inputString(value, 2048);
      let link: URL; try { link = new URL(text); } catch { throw new EvaluationFailure("invalid_input"); }
      if (!["http:", "https:"].includes(link.protocol) || link.username || link.password) throw new EvaluationFailure("invalid_input");
      return text;
    };
    const githubUrl = optionalUrl(form.get("github_url")), demoUrl = optionalUrl(form.get("demo_url"));
    if (mode === "team") {
      const member = await evaluationRead(admin.from("team_members").select("team_id").eq("team_id", teamId!).eq("user_id", userId).abortSignal(evaluationSignal(preflight)).maybeSingle(), preflight, "verify_challenge_team");
      if (!member || member.team_id !== teamId) throw new EvaluationFailure("forbidden");
    }
    await reserveEvaluation(admin, preflight, { pipeline: "challenge", actor: `user:${userId}`, target: `${challenge.id}:${teamId || userId}`,
      quotaScope: challenge.id, idempotencyKey: req.headers.get("idempotency-key") || "" });
    const recent = await evaluationRead(admin.from("challenge_submissions").select("id, status").eq("user_id", userId).eq("challenge_id", challenge.id).gte("created_at", new Date(Date.now() - 86_400_000).toISOString()).limit(5).abortSignal(evaluationSignal(execution)), execution, "read_challenge_rolling_limit");
    if (!Array.isArray(recent)) throw new EvaluationFailure("database_unavailable");
    if (recent.length >= 5) throw new EvaluationFailure("admission_limit");
    if (recent.some(row => row.status === "evaluating")) throw new EvaluationFailure("processing_interrupted");
    const versions = await evaluationRead(admin.from("challenge_submissions").select("version").eq("challenge_id", challenge.id).eq(teamId ? "team_id" : "user_id", teamId || userId).order("version", { ascending: false }).limit(1).abortSignal(evaluationSignal(execution)), execution, "read_challenge_version");
    if (!Array.isArray(versions) || versions.length > 1 || (versions.length && (!Number.isInteger(versions[0].version) || versions[0].version < 1))) throw new EvaluationFailure("database_unavailable");
    const extraction = await withinDeadline(file ? extractChallengeTextFromPDF(Buffer.from(await withinDeadline(file.arrayBuffer(), execution, 5_000)), Math.min(PRESENTATION_LIMITS.parseMs, execution.deadlineAt - Date.now()), execution.signal)
      : extractChallengePresentationFromUrl(externalLink!, Math.min(PRESENTATION_LIMITS.ingestionMs, execution.deadlineAt - Date.now()), execution.signal), execution, PRESENTATION_LIMITS.ingestionMs);
    assertExecution(execution, 1000);
    if (!extraction.success) throw new EvaluationFailure("unusable_text");
    const result = await runChallengePitchEvaluation(challenge.title, challenge.track, challenge.problem_statement, extraction.rawDocumentText, {
      submissionMode: mode as "solo" | "team", githubUrl, demoUrl, additionalRules: challenge.additional_rules || null,
    }, execution);
    submissionId = randomUUID();
    const payload = { id: submissionId, challenge_id: challenge.id, user_id: userId, team_id: teamId, submission_mode: mode, submission_type: file ? "pdf_upload" : "external_link",
      external_link_url: externalLink, ppt_url: externalLink || "Uploaded_Presentation.pdf", file_name: file ? "Uploaded_Presentation.pdf" : "Linked_Presentation",
      github_url: githubUrl, demo_url: demoUrl, version: (versions[0]?.version || 0) + 1, status: "completed",
      score_problem: result.scoreProblem, score_solution: result.scoreSolution, score_architecture: result.scoreArchitecture, score_feasibility_impact: result.scoreFeasibilityImpact,
      total_score: result.totalScore, grade: result.grade, strengths: result.strengths, growth_areas: result.growthAreas, slide_feedback: result.slideFeedback,
      format_violations: result.formatViolations, score_deductions: result.scoreDeductions, used_ai_fallback: false,
      ai_raw_feedback: { topActionItem: result.topActionItem, evaluatedAt: new Date().toISOString(), analysis: result.analysis },
    };
    const budget: EvaluationExecution = { deadlineAt: Math.min(started + 55_000, Date.now() + 5_000), attempts: 0, requestId };
    let saved: { data: unknown; error: unknown } | undefined;
    try {
      saved = await withinDeadline(admin.from("challenge_submissions").insert(payload).select(COLUMNS).abortSignal(evaluationSignal(budget)).single(), budget, 5_000);
      if (saved.error) logDatabaseFailure("save_challenge", saved.error);
    } catch (error) { logDatabaseFailure("save_challenge", error); }
    const confirms = (value: unknown) => {
      const row = value as (Record<string, unknown> & { ai_raw_feedback?: { analysis?: { requestId?: string; mode?: string } } }) | null;
      if (!row || typeof row !== "object" || Array.isArray(row)) return false;
      return row?.id === submissionId && row.user_id === userId && row.challenge_id === challenge.id && row.team_id === teamId && row.submission_mode === mode && row.version === payload.version && row.status === "completed" &&
        row.ai_raw_feedback?.analysis?.requestId === requestId && row.ai_raw_feedback.analysis.mode === "text_only" && row.used_ai_fallback === false &&
        row.score_problem === result.scoreProblem && row.score_solution === result.scoreSolution && row.score_architecture === result.scoreArchitecture && row.score_feasibility_impact === result.scoreFeasibilityImpact && row.total_score === result.totalScore && row.grade === result.grade;
    };
    if (!saved || saved.error || !confirms(saved.data)) {
      const reconciled = await evaluationRead(admin.from("challenge_submissions").select(COLUMNS).eq("id", submissionId).eq("user_id", userId).eq("challenge_id", challenge.id).abortSignal(evaluationSignal(budget)).maybeSingle(), budget, "reconcile_challenge_save");
      if (!confirms(reconciled)) throw new EvaluationFailure("persistence_uncertain");
      return NextResponse.json({ success: true, submission: reconciled, requestId });
    }
    return NextResponse.json({ success: true, submission: saved.data, requestId });
  } catch (error) {
    console.error("[Challenge evaluation outcome]", { requestId, attempts: execution.attempts, providerAttempts: execution.trace, latencyMs: Date.now() - started });
    const failure = evaluationFailure(submissionId ? new EvaluationFailure("persistence_uncertain") : error, requestId);
    return NextResponse.json({ ...failure.body, ...(submissionId ? { submissionId } : {}) }, { status: failure.status });
  }
}
