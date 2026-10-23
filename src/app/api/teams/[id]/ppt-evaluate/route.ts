import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { extractPresentationFromUrl, validatePresentationUrl } from "@/lib/ppt/presentationExtractor";
import { runPitchDeckEvaluation } from "@/lib/ppt/evaluatorEngine";
import { TRACK_PROFILES, type JudgingTrackId } from "@/lib/evaluator/evaluatorTypes";
import { detectJudgingTrack } from "@/lib/evaluator/trackDetection";
import { reserveEvaluation } from "@/lib/evaluator/evaluatorBudgetGuard";
import { EvaluationFailure, evaluationFailure, evaluationRead, evaluationSignal, verifiedEvaluationActor, inputString, isUuid, readEvaluationJson, readEvaluationForm, rubricFor, assertExecution, withinDeadline, logDatabaseFailure, type EvaluationExecution } from "@/lib/evaluator/evaluationContract";

export const maxDuration = 60;
export const runtime = "nodejs";
const COLUMNS = "id, team_id, submitted_by, ps_title, ps_category, submission_type, external_link_url, ppt_url, file_name, version, status, score_novelty, score_tech, score_ui_ux, score_team, total_score, grade, slide_breakdown, ai_feedback, error_message, created_at, updated_at";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now(), requestId = randomUUID();
  const execution: EvaluationExecution = { deadlineAt: started + 50_000, signal: AbortSignal.any([req.signal, AbortSignal.timeout(50_000)]), requestId, attempts: 0 };
  const preflight = { ...execution, deadlineAt: started + 5_000 };
  let admin: SupabaseClient | undefined, recordId: string | undefined, teamId: string | undefined;
  let cleanupBudget: EvaluationExecution | undefined;
  const persistenceBudget = () => cleanupBudget ??= { deadlineAt: Math.min(started + 55_000, Date.now() + 5_000), attempts: 0, requestId };
  try {
    teamId = (await params).id;
    if (!isUuid(teamId)) throw new EvaluationFailure("invalid_input");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new EvaluationFailure("limiter_unavailable");
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
      fetch: (target, init) => fetch(target, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000) }),
    } });
    const userId = await verifiedEvaluationActor(admin, req, preflight);
    const body = req.headers.get("content-type")?.includes("application/json") ? await readEvaluationJson(req, preflight) : Object.fromEntries(await readEvaluationForm(req, preflight, 65_536));
    const externalLink = inputString(body.external_link_url, 2048), title = inputString(body.ps_title, 200, "Project Pitch"), category = inputString(body.ps_category, 50, "software");
    const custom = body.customRubric == null || body.customRubric === "" ? undefined : inputString(body.customRubric, 6000);
    if (!validatePresentationUrl(externalLink).valid) throw new EvaluationFailure("invalid_input");
    if (body.track_id != null && (typeof body.track_id !== "string" || !Object.hasOwn(TRACK_PROFILES, body.track_id))) throw new EvaluationFailure("invalid_input");
    const [team, member, profile] = await Promise.all([
      evaluationRead(admin.from("teams").select("id, owner_id, hackathon_name, team_hackathons(hackathons(name, description)), team_members(profiles(skills))").eq("id", teamId).abortSignal(evaluationSignal(preflight)).maybeSingle(), preflight, "read_ppt_team"),
      evaluationRead(admin.from("team_members").select("id").eq("team_id", teamId).eq("user_id", userId).abortSignal(evaluationSignal(preflight)).maybeSingle(), preflight, "read_ppt_membership"),
      evaluationRead(admin.from("profiles").select("id, role").eq("id", userId).abortSignal(evaluationSignal(preflight)).maybeSingle(), preflight, "read_ppt_role"),
    ]);
    if (!team) throw new EvaluationFailure("not_found");
    if (team.owner_id !== userId && !member && profile?.role !== "admin") throw new EvaluationFailure("forbidden");
    const event = team.team_hackathons?.[0]?.hackathons as unknown as { name?: string; description?: string } | Array<{ name?: string; description?: string }> | undefined;
    const detection = detectJudgingTrack({ name: team.hackathon_name || (Array.isArray(event) ? event[0]?.name : event?.name), description: Array.isArray(event) ? event[0]?.description : event?.description });
    const track = (body.track_id || (detection.isConfident ? detection.detectedTrack : "generic")) as JudgingTrackId;
    const isFallbackTrack = !body.track_id && !detection.isConfident;
    const trackWarning = isFallbackTrack ? "Track not detected — General Hackathon rubric selected. Choose a specialized track if appropriate." : null;
    rubricFor(track, custom);
    await reserveEvaluation(admin, preflight, { pipeline: "ppt", actor: `user:${userId}`, target: teamId, idempotencyKey: req.headers.get("idempotency-key") || "" });
    // Explicit authorized POST only. A bounded CAS never overwrites a completed row.
    const staleCutoff = new Date(Date.now() - 120_000).toISOString();
    const active = await evaluationRead(admin.from("team_ppt_evaluations").select("id, updated_at").eq("team_id", teamId).eq("status", "evaluating").order("updated_at", { ascending: true }).limit(4).abortSignal(evaluationSignal(execution)), execution, "read_ppt_active");
    if (!Array.isArray(active)) throw new EvaluationFailure("database_unavailable");
    for (const row of active.slice(0, 3)) {
      if (!isUuid(row.id) || !Number.isFinite(Date.parse(row.updated_at))) throw new EvaluationFailure("database_unavailable");
      if (Date.parse(row.updated_at) >= Date.parse(staleCutoff)) throw new EvaluationFailure("cooldown");
      const repaired = await evaluationRead(admin.from("team_ppt_evaluations").update({ status: "failed", error_message: "processing_interrupted", updated_at: new Date().toISOString() }).eq("team_id", teamId).eq("id", row.id).eq("status", "evaluating").eq("updated_at", row.updated_at).lt("updated_at", staleCutoff).select("id").abortSignal(evaluationSignal(execution)), execution, "recover_stale_ppt");
      if (!Array.isArray(repaired) || repaired.length !== 1 || repaired[0].id !== row.id) throw new EvaluationFailure("processing_interrupted");
    }
    const stillActive = await evaluationRead(admin.from("team_ppt_evaluations").select("id").eq("team_id", teamId).eq("status", "evaluating").limit(1).abortSignal(evaluationSignal(execution)), execution, "verify_ppt_recovery");
    if (!Array.isArray(stillActive) || stillActive.length) throw new EvaluationFailure("processing_interrupted");
    const recent = await evaluationRead(admin.from("team_ppt_evaluations").select("id").eq("team_id", teamId).gte("created_at", new Date(Date.now() - 86_400_000).toISOString()).limit(15).abortSignal(evaluationSignal(execution)), execution, "read_ppt_rolling_limit");
    if (!Array.isArray(recent)) throw new EvaluationFailure("database_unavailable");
    if (recent.length >= 15) throw new EvaluationFailure("admission_limit");
    const versions = await evaluationRead(admin.from("team_ppt_evaluations").select("version").eq("team_id", teamId).order("version", { ascending: false }).limit(1).abortSignal(evaluationSignal(execution)), execution, "read_ppt_version");
    if (!Array.isArray(versions) || versions.length > 1 || (versions.length && (!Number.isInteger(versions[0].version) || versions[0].version < 1))) throw new EvaluationFailure("database_unavailable");
    const extraction = await withinDeadline(extractPresentationFromUrl(externalLink, Math.min(15_000, execution.deadlineAt - Date.now()), execution.signal), execution, 15_000);
    assertExecution(execution, 1000);
    if (!extraction.success || !extraction.slides.length) throw new EvaluationFailure("unusable_text");
    recordId = randomUUID();
    const rubric = rubricFor(track, custom);
    const analysis = { schemaVersion: "evaluator-v1", rubricVersion: "ppt-v1", trackId: track, requestId, mode: "unknown", pdfReceived: false,
      categoryCaps: Object.fromEntries(Object.entries(rubric.categories).map(([name, c]) => [name, c.maxPts])), categoryLabels: Object.fromEntries(Object.entries(rubric.categories).map(([name, c]) => [name, c.label])) };
    const initial = { id: recordId, team_id: teamId, submitted_by: userId, ps_title: title, ps_category: category, submission_type: "external_link", external_link_url: externalLink, ppt_url: externalLink,
      file_name: extraction.pdf ? "Pitch_Deck.pdf" : "Linked_Presentation", version: (versions[0]?.version || 0) + 1, status: "evaluating", ai_feedback: { analysis, track_id: track, isFallbackTrack, trackWarning } };
    let inserted = await withinDeadline(admin.from("team_ppt_evaluations").insert({ ...initial, track_id: track }).select("id").abortSignal(evaluationSignal(execution)).single(), execution, 5_000);
    if (inserted.error && ["42703", "PGRST204"].includes(inserted.error.code) && inserted.error.message?.includes("track_id")) {
      logDatabaseFailure("ppt_track_column_compatibility", inserted.error);
      inserted = await withinDeadline(admin.from("team_ppt_evaluations").insert(initial).select("id").abortSignal(evaluationSignal(execution)).single(), execution, 5_000);
    }
    if (inserted.error || inserted.data?.id !== recordId) { logDatabaseFailure("initialize_ppt", inserted.error); throw new EvaluationFailure("persistence_uncertain"); }
    const members = team.team_members as unknown as Array<{ profiles: { skills?: string[] } | null }>;
    const result = await runPitchDeckEvaluation(title, category, extraction.rawDocumentText, { memberCount: members?.length || 0, members: members?.map(m => ({ skills: m.profiles?.skills })) }, track, custom, extraction.pdf, Math.min(30_000, execution.deadlineAt - Date.now()), execution);
    const budget = persistenceBudget();
    const payload = { status: "completed", score_novelty: result.scoreNovelty, score_tech: result.scoreTech, score_ui_ux: result.scoreUiUx, score_team: result.scoreTeam,
      total_score: result.totalScore, grade: result.grade, slide_breakdown: extraction.slides, error_message: null, updated_at: new Date().toISOString(),
      ai_feedback: { strengths: result.strengths, criticalRisks: result.criticalRisks, formatViolations: result.formatViolations, slideRecommendations: result.slideRecommendations,
        scoreDeductions: result.scoreDeductions, usedAiFallback: false, analysis: result.analysis, slideFeedback: result.slideFeedback, track_id: track,
        ...(custom ? { customRubric: custom } : {}), isFallbackTrack, trackWarning, evaluatedAt: new Date().toISOString() } };
    let final: { data: unknown; error: unknown } | undefined;
    try {
      final = await withinDeadline(admin.from("team_ppt_evaluations").update(payload).eq("id", recordId).eq("team_id", teamId).eq("status", "evaluating").select(COLUMNS).abortSignal(evaluationSignal(budget)).single(), budget, 5_000);
      if (final.error) logDatabaseFailure("complete_ppt", final.error);
    } catch (error) { logDatabaseFailure("complete_ppt", error); }
    const confirms = (value: unknown) => {
      const row = value as (Record<string, unknown> & { ai_feedback?: { usedAiFallback?: boolean; analysis?: { requestId?: string; mode?: string } } }) | null;
      if (!row || typeof row !== "object" || Array.isArray(row)) return false;
      return row?.id === recordId && row.team_id === teamId && row.submitted_by === userId && row.status === "completed" && row.version === initial.version &&
        row.ai_feedback?.analysis?.requestId === requestId && row.ai_feedback.analysis.mode === result.analysis.mode && row.ai_feedback.usedAiFallback === false &&
        row.score_novelty === result.scoreNovelty && row.score_tech === result.scoreTech && row.score_ui_ux === result.scoreUiUx && row.score_team === result.scoreTeam && row.total_score === result.totalScore && row.grade === result.grade;
    };
    if (!final || final.error || !confirms(final.data)) {
      const reconciled = await evaluationRead(admin.from("team_ppt_evaluations").select(COLUMNS).eq("id", recordId).eq("team_id", teamId).abortSignal(evaluationSignal(budget)).maybeSingle(), budget, "reconcile_ppt_completion");
      if (!confirms(reconciled)) throw new EvaluationFailure("persistence_uncertain");
      return NextResponse.json({ success: true, evaluation: reconciled, requestId, isFallbackTrack, trackWarning });
    }
    return NextResponse.json({ success: true, evaluation: final.data, requestId, isFallbackTrack, trackWarning });
  } catch (error) {
    let uncertain = error instanceof EvaluationFailure && error.code === "persistence_uncertain";
    if (admin && recordId && teamId) {
      try {
        const budget = persistenceBudget();
        const failed = await withinDeadline(admin.from("team_ppt_evaluations").update({ status: "failed", error_message: error instanceof EvaluationFailure ? error.code : "provider_unavailable", updated_at: new Date().toISOString() })
          .eq("id", recordId).eq("team_id", teamId).eq("status", "evaluating").select("id").abortSignal(evaluationSignal(budget)), budget, 5_000);
        if (failed.error || !Array.isArray(failed.data) || failed.data.length !== 1 || failed.data[0]?.id !== recordId) { logDatabaseFailure("fail_ppt_processing", failed.error); uncertain = true; }
      } catch (cleanupError) { logDatabaseFailure("fail_ppt_processing", cleanupError); uncertain = true; }
    }
    console.error("[PPT evaluation outcome]", { requestId, attempts: execution.attempts, providerAttempts: execution.trace, latencyMs: Date.now() - started });
    const failure = evaluationFailure(uncertain ? new EvaluationFailure("persistence_uncertain") : error, requestId);
    return NextResponse.json({ ...failure.body, ...(recordId ? { evaluationId: recordId } : {}) }, { status: failure.status });
  }
}
