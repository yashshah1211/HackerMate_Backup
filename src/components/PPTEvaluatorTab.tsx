"use client";

import { useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import LinkedIdeaScorecard, { LinkedEvaluationRecord } from "@/components/LinkedIdeaScorecard";
import PresentationErrorAlert from "@/components/ui/PresentationErrorAlert";
import {
  JudgingTrackId,
  TRACK_PROFILES,
} from "@/lib/evaluator/evaluatorTypes";
import { detectJudgingTrack } from "@/lib/evaluator/trackDetection";
import {
  TriangleAlert,
  CheckCircle2,
  Link as LinkIcon,
  Trash2,
  GitCompare,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  Building2,
  Bot,
  Globe,
  Cpu,
  Presentation,
} from "lucide-react";
import {
  Button,
  FieldLabel,
  IconButton,
  Input,
  List,
  Panel,
  Progress,
  Segmented,
  Select,
  Spinner,
  Tape,
  type TapeTone,
} from "@/components/system";
import { cn } from "@/lib/utils";

interface PPTEvaluation {
  id: string;
  team_id: string;
  track_id?: string;
  ps_title: string;
  ps_category: string;
  submission_type: "pdf_upload" | "external_link";
  external_link_url?: string | null;
  file_name: string;
  version: number;
  status: "evaluating" | "completed" | "failed";
  score_novelty: number;
  score_tech: number;
  score_ui_ux: number;
  score_team: number;
  total_score: number;
  grade: string;
  slide_breakdown?: any[];
  ai_feedback?: {
    strengths?: string[];
    criticalRisks?: string[];
    spocRedFlags?: string[];
    formatViolations?: string[];
    slideRecommendations?: Record<string, string>;
    scoreDeductions?: Record<string, string>;
    usedAiFallback?: boolean;
    evaluatedAt?: string;
    track_id?: string;
    isFallbackTrack?: boolean;
    trackWarning?: string | null;
  };
  error_message?: string | null;
  created_at: string;
}

const ORDERED_SLIDES = [
  { key: "titlePage", label: "Slide 1: Title Page & Team Setup", slideNum: 1 },
  { key: "proposedSolution", label: "Slide 2: Idea & Proposed Solution", slideNum: 2 },
  { key: "technicalApproach", label: "Slide 3: Technical Approach & Architecture", slideNum: 3 },
  { key: "feasibilityAndRisks", label: "Slide 4: Feasibility & Risk Mitigation", slideNum: 4 },
  { key: "impactAndBenefits", label: "Slide 5: Impact, Benefits & Commercial ROI", slideNum: 5 },
  { key: "researchAndReferences", label: "Slide 6: Research Papers & References", slideNum: 6 },
] as const;

const TRACK_OPTIONS: { id: JudgingTrackId; label: string; sub: string }[] = [
  { id: "ai_genai", label: "AI & GenAI", sub: "Agents, retrieval, latency and hallucination control" },
  { id: "web_dev", label: "Web dev", sub: "APIs, data model, SSR and security" },
];

/** Engine grades end with emojis; show the words only. */
function cleanGrade(grade: string = "") {
  return grade.replace(/[^\p{L}\p{N}\s/&().,'-]/gu, "").replace(/\s+/g, " ").trim();
}

/** Panel header row: icon + title (+ mono count) and an optional action. */
function PanelHead({ icon, title, meta, action }: { icon?: ReactNode; title: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3">
      <h3 className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-ink [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        <span className="min-w-0 truncate">{title}</span>
        {meta !== undefined && <span className="font-mono text-[12.5px] font-normal text-ink-3 tabular">{meta}</span>}
      </h3>
      {action}
    </div>
  );
}

export default function PPTEvaluatorTab({ teamId }: { teamId: string }) {
  const [evaluations, setEvaluations] = useState<PPTEvaluation[]>([]);
  const [selectedEval, setSelectedEval] = useState<PPTEvaluation | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Track Auto-Detection & Fallback States
  const [selectedTrack, setSelectedTrack] = useState<JudgingTrackId>("web_dev");
  const [isAmbiguousFallback, setIsAmbiguousFallback] = useState(false);
  const [userExplicitlySelected, setUserExplicitlySelected] = useState(false);
  const [autoDetectedSource, setAutoDetectedSource] = useState<string | null>(null);

  // Form State
  const [externalLink, setExternalLink] = useState("");
  const [psTitle, setPsTitle] = useState("");
  const [psCategory, setPsCategory] = useState("software");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadEvaluations();
    loadTeamTrackContext();
  }, [teamId]);

  async function loadTeamTrackContext() {
    try {
      // `teams.track` and `hackathons.tag` are not present in the live schema;
      // requesting them made PostgREST reject the whole query (400), which
      // silently disabled track auto-detection. Only request real columns.
      const { data: teamData, error: teamErr } = await supabase
        .from("teams")
        .select("id, name, hackathon_name, team_hackathons(hackathons(id, name, description))")
        .eq("id", teamId)
        .maybeSingle();

      if (teamErr) console.error("[PPTEvaluatorTab] Team track context query failed:", teamErr);

      if (teamData) {
        const hackathonObj = (teamData.team_hackathons as any)?.[0]?.hackathons;
        const detection = detectJudgingTrack({
          name: teamData.hackathon_name || hackathonObj?.name,
          tag: hackathonObj?.tag,
          description: hackathonObj?.description,
          track: (teamData as { track?: string | null }).track ?? undefined,
        });

        if (detection.isConfident) {
          setSelectedTrack(detection.detectedTrack);
          setIsAmbiguousFallback(false);
          setAutoDetectedSource(detection.sourceHint || "Team hackathon context");
        } else {
          // Track not confidently detected — fail loud on fallback!
          setSelectedTrack("web_dev");
          setIsAmbiguousFallback(true);
          setAutoDetectedSource(null);
        }
      }
    } catch (err) {
      console.error("[PPTEvaluatorTab] Load team track context error:", err);
    }
  }

  async function loadEvaluations() {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/teams/${teamId}/ppt-evaluations`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("application/json")) {
        const data = await res.json();
        const list = data.evaluations || [];
        setEvaluations(list);
        if (list.length > 0) {
          setSelectedEval((prev) => (prev ? list.find((e: any) => e.id === prev.id) || list[0] : list[0]));
        } else {
          setSelectedEval(null);
        }
      } else {
        // Keep the real reason visible instead of silently showing an empty history.
        console.error("[PPTEvaluatorTab] Evaluations request failed:", res.status, contentType);
      }
    } catch (err) {
      console.error("[PPTEvaluatorTab] Load error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleEvaluate(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!externalLink.trim()) {
      setErrorMsg("Please paste your Google Slides or Google Drive presentation link.");
      return;
    }

    setIsSubmitting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setErrorMsg("Session expired. Please log in again.");
        setIsSubmitting(false);
        return;
      }

      const res = await fetch(`/api/teams/${teamId}/ppt-evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          track_id: selectedTrack,
          external_link_url: externalLink.trim(),
          ps_title: psTitle.trim() || "Project Pitch",
          ps_category: psCategory,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      let data: any = null;

      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const rawText = await res.text();
        console.error("[PPTEvaluatorTab] Server error response:", res.status, rawText.slice(0, 300));
        setErrorMsg(
          `Server returned status ${res.status} (${res.statusText || "Error"}). Please verify your presentation link sharing permissions and try again.`
        );
        setIsSubmitting(false);
        return;
      }

      if (!res.ok || data?.error) {
        setErrorMsg(data?.error || "Evaluation failed. Please try again.");
      } else if (data?.evaluation) {
        setEvaluations((prev) => [data.evaluation, ...prev]);
        setSelectedEval(data.evaluation);
        setExternalLink("");
      }
    } catch (err: any) {
      console.error("[PPTEvaluatorTab] Network/Evaluation exception:", err);
      setErrorMsg(err.message || "Network exception occurred during evaluation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteEvaluation(evalId: string) {
    setDeletingId(evalId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setErrorMsg("Session expired. Please log in again.");
        setDeletingId(null);
        setConfirmDeleteId(null);
        return;
      }

      const res = await fetch(`/api/teams/${teamId}/ppt-evaluations?evalId=${evalId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const contentType = res.headers.get("content-type") || "";
      let data: any = null;
      if (contentType.includes("application/json")) {
        data = await res.json();
      }

      if (!res.ok || data?.error) {
        setErrorMsg(data?.error || "Failed to delete evaluation record.");
      } else {
        const remaining = evaluations.filter((e) => e.id !== evalId);
        setEvaluations(remaining);
        if (selectedEval?.id === evalId) {
          setSelectedEval(remaining.length > 0 ? remaining[0] : null);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error deleting evaluation.");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  // Grade → status tone. Same matching order as before; colour only encodes quality.
  const getGradeTone = (grade: string = ""): TapeTone => {
    if (grade.includes("Gold")) return "ok";
    if (grade.includes("Ready") || grade.includes("Candidate") || grade.includes("A")) return "ok";
    if (grade.includes("Risk") || grade.includes("Poor") || grade.includes("F")) return "bad";
    return "warn";
  };

  const getScoreColor = (score: number) => {
    if (score >= 72) return "text-ok";
    if (score >= 50) return "text-warn";
    return "text-bad";
  };

  const getTrackBadge = (trackId: string = "web_dev") => {
    if (trackId === "ai_genai") {
      return {
        label: "AI & GenAI",
        short: "AI/GenAI",
        tone: "neutral" as TapeTone,
        icon: <Bot />,
      };
    }
    return {
      label: "Web dev",
      short: "Web dev",
      tone: "neutral" as TapeTone,
      icon: <Globe />,
    };
  };

  // Version-over-Version Diff Calculations
  const otherCompletedEvals = evaluations.filter(
    (e) => e.id !== selectedEval?.id && e.status === "completed"
  );

  const compareEval = compareVersionId
    ? otherCompletedEvals.find((e) => e.id === compareVersionId) || null
    : otherCompletedEvals.find((e) => e.version < (selectedEval?.version || 0)) ||
      (otherCompletedEvals.length > 0 ? otherCompletedEvals[0] : null);

  const scoreDiff =
    selectedEval && compareEval ? selectedEval.total_score - compareEval.total_score : null;
  const noveltyDiff =
    selectedEval && compareEval ? selectedEval.score_novelty - compareEval.score_novelty : null;
  const techDiff =
    selectedEval && compareEval ? selectedEval.score_tech - compareEval.score_tech : null;
  const uiUxDiff =
    selectedEval && compareEval ? selectedEval.score_ui_ux - compareEval.score_ui_ux : null;
  const teamDiff =
    selectedEval && compareEval ? selectedEval.score_team - compareEval.score_team : null;

  const prevFlags = compareEval?.ai_feedback?.criticalRisks || compareEval?.ai_feedback?.spocRedFlags || [];
  const currFlags = selectedEval?.ai_feedback?.criticalRisks || selectedEval?.ai_feedback?.spocRedFlags || [];
  const resolvedRedFlags = prevFlags.filter((rf) => !currFlags.includes(rf));

  const renderDiffBadge = (diff: number | null, prefix: string = "") => {
    if (diff === null) return null;
    const tone = diff > 0 ? "text-ok" : diff < 0 ? "text-bad" : "text-ink-3";
    return (
      <span className={cn("inline-flex shrink-0 items-center gap-0.5 font-mono text-[12.5px] font-medium tabular", tone)}>
        {diff > 0 ? <TrendingUp className="size-3" aria-hidden /> : diff < 0 ? <TrendingDown className="size-3" aria-hidden /> : <Minus className="size-3" aria-hidden />}
        <span>{diff > 0 ? `+${diff}` : diff}</span>
        {prefix && <span className="font-normal text-ink-3">{prefix}</span>}
      </span>
    );
  };

  const trackDescription =
    selectedTrack === "ai_genai"
      ? "Paste a Google Slides or Drive link. Scored 0–100 on AI hackathon criteria: agent design, retrieval, latency, hallucination control and team roles."
      : "Paste a Google Slides or Drive link. Scored 0–100 on full-stack criteria: API design, data model, caching, security, responsive UI and team roles.";

  if (loading) {
    return (
      <Panel className="flex h-40 items-center justify-center gap-2">
        <Spinner label="Loading pitch reviews" />
        <span className="text-[12.5px] text-ink-3">Loading pitch reviews</span>
      </Panel>
    );
  }

  const selectedTrackInfo = selectedEval
    ? getTrackBadge(selectedEval.track_id || selectedEval.ai_feedback?.track_id || "web_dev")
    : null;

  const rubric = selectedEval
    ? [
        { key: "novelty", label: "Novelty & alignment", value: selectedEval.score_novelty, max: 25, note: selectedEval.ai_feedback?.scoreDeductions?.novelty || "Evaluates uniqueness against existing alternatives." },
        { key: "tech", label: "Tech architecture", value: selectedEval.score_tech, max: 35, note: selectedEval.ai_feedback?.scoreDeductions?.tech || "Evaluates concrete data flow, frameworks, and fail-safes." },
        { key: "uiux", label: "UI/UX & polish", value: selectedEval.score_ui_ux, max: 25, note: selectedEval.ai_feedback?.scoreDeductions?.uiUx || "Evaluates mockups, visual flowcharts, and slide clarity." },
        { key: "team", label: "Team & squad balance", value: selectedEval.score_team, max: 15, note: selectedEval.ai_feedback?.scoreDeductions?.team || "Evaluates squad completeness and rules." },
      ]
    : [];

  const compareRows =
    selectedEval && compareEval
      ? [
          { label: "Overall", from: compareEval.total_score, to: selectedEval.total_score, diff: scoreDiff },
          { label: "Novelty", from: compareEval.score_novelty, to: selectedEval.score_novelty, diff: noveltyDiff },
          { label: "Tech", from: compareEval.score_tech, to: selectedEval.score_tech, diff: techDiff },
          { label: "UI/UX", from: compareEval.score_ui_ux, to: selectedEval.score_ui_ux, diff: uiUxDiff },
          { label: "Team", from: compareEval.score_team, to: selectedEval.score_team, diff: teamDiff },
        ]
      : [];

  const hasPushback =
    (selectedEval?.ai_feedback?.criticalRisks && selectedEval.ai_feedback.criticalRisks.length > 0) ||
    (selectedEval?.ai_feedback?.spocRedFlags && selectedEval.ai_feedback.spocRedFlags.length > 0) ||
    (selectedEval?.ai_feedback?.formatViolations && selectedEval.ai_feedback.formatViolations.length > 0);

  return (
    <div className="space-y-5 text-left">
      {/* Description + rubric in use */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 max-w-3xl text-[13px] leading-relaxed text-ink-3">{trackDescription}</p>
        <Tape tone={getTrackBadge(selectedTrack).tone} icon={getTrackBadge(selectedTrack).icon}>
          {getTrackBadge(selectedTrack).label} rubric
        </Tape>
      </div>

      {/* FAIL-LOUD FALLBACK WARNING (When track auto-detection was ambiguous) */}
      {isAmbiguousFallback && !userExplicitlySelected && (
        <div role="alert" className="flex items-start gap-3 rounded-lg bg-warn-soft p-4 ring-1 ring-inset ring-warn/30">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-ink">
              Track not detected — defaulting to Web Dev rubric. Select the correct track if this is a specialized submission.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Bot />}
                className="h-9 md:h-7"
                onClick={() => {
                  setSelectedTrack("ai_genai");
                  setUserExplicitlySelected(true);
                  setIsAmbiguousFallback(false);
                }}
              >
                Use AI / GenAI
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 md:h-7"
                onClick={() => {
                  setUserExplicitlySelected(true);
                  setIsAmbiguousFallback(false);
                }}
              >
                Keep Web Dev
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Linked Idea Pitch Benchmark from Idea Evaluator */}
      <LinkedIdeaScorecard
        teamId={teamId}
        onSelectIdeaTitle={(title) => {
          if (!psTitle) {
            setPsTitle(title);
          }
        }}
        onEvaluationLoaded={(evaluation: LinkedEvaluationRecord | null) => {
          if (evaluation?.track_id && !userExplicitlySelected) {
            const tr = evaluation.track_id as JudgingTrackId;
            if (["ai_genai", "web_dev"].includes(tr)) {
              setSelectedTrack(tr);
              setIsAmbiguousFallback(false);
              setAutoDetectedSource(`Linked Idea Scorecard (${TRACK_PROFILES[tr]?.name || tr})`);
            }
          }
        }}
      />

      {/* Submission form */}
      <Panel as="section" className="min-w-0">
        <PanelHead icon={<Presentation className="text-ink-3" />} title="Review a new version" />

        <form onSubmit={handleEvaluate} className="space-y-4 p-4">
          {/* Track selector */}
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span id={`ppt-track-${teamId}`} className="caps-label text-ink-3">
                Track
              </span>
              {isAmbiguousFallback && !userExplicitlySelected ? (
                <Tape tone="warn" icon={<TriangleAlert />}>
                  Defaulted · review
                </Tape>
              ) : autoDetectedSource ? (
                <span className="inline-flex min-w-0 items-center gap-1 text-[12px] text-ink-3">
                  <CheckCircle2 className="size-3.5 shrink-0 text-ok" aria-hidden />
                  <span className="min-w-0 truncate">{autoDetectedSource}</span>
                </span>
              ) : null}
            </div>
            <Segmented
              label="Evaluation track"
              value={selectedTrack}
              onChange={(v) => {
                setSelectedTrack(v);
                setUserExplicitlySelected(true);
                setIsAmbiguousFallback(false);
              }}
              options={TRACK_OPTIONS.map((t) => ({ value: t.id, label: t.label }))}
            />
            <p className="mt-1.5 text-[12px] text-ink-3">{TRACK_OPTIONS.find((t) => t.id === selectedTrack)?.sub}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0">
              <FieldLabel htmlFor={`ppt-title-${teamId}`}>Problem statement or idea</FieldLabel>
              <Input
                id={`ppt-title-${teamId}`}
                type="text"
                value={psTitle}
                onChange={(e) => setPsTitle(e.target.value)}
                placeholder="e.g. Multilingual audio guide for monuments"
                className="h-10 md:h-[34px]"
                required
              />
            </div>

            <div className="min-w-0">
              <FieldLabel htmlFor={`ppt-category-${teamId}`}>Category</FieldLabel>
              <Select
                id={`ppt-category-${teamId}`}
                value={psCategory}
                onChange={(e) => setPsCategory(e.target.value)}
                className="h-10 md:h-[34px]"
              >
                <option value="software">Software Edition</option>
                <option value="hardware">Hardware Edition</option>
                <option value="open_innovation">Open Innovation Track</option>
              </Select>
            </div>
          </div>

          {/* Google Slides presentation link */}
          <div className="min-w-0">
            <FieldLabel htmlFor={`ppt-link-${teamId}`}>Google Slides or Drive link</FieldLabel>
            <Input
              id={`ppt-link-${teamId}`}
              type="url"
              value={externalLink}
              onChange={(e) => setExternalLink(e.target.value)}
              placeholder="https://docs.google.com/presentation/…"
              leading={<LinkIcon />}
              className="h-10 font-mono text-[13px] md:h-[34px]"
              required
            />
            <p className="mt-1.5 text-[12px] text-ink-3">
              Set sharing to &ldquo;Anyone with the link can view&rdquo; first.
            </p>
          </div>

          <PresentationErrorAlert
            error={errorMsg}
            onDismiss={() => setErrorMsg(null)}
            targetUrl={externalLink}
          />

          <div className="flex justify-end border-t border-line pt-4">
            <Button type="submit" variant="primary" loading={isSubmitting} className="h-10 w-full sm:h-[34px] sm:w-auto">
              {isSubmitting ? "Reviewing deck…" : "Run review"}
            </Button>
          </div>
        </form>
      </Panel>

      {/* Selected evaluation scorecard */}
      {selectedEval && selectedEval.status === "completed" && selectedTrackInfo && (
        <div className="space-y-4">
          {/* Title + state */}
          <div className="min-w-0 border-b border-line pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Tape>v{selectedEval.version}</Tape>
              <Tape tone={selectedTrackInfo.tone} icon={selectedTrackInfo.icon}>
                {selectedTrackInfo.label}
              </Tape>
              {selectedEval.ai_feedback?.usedAiFallback ? (
                <Tape tone="warn" icon={<TriangleAlert />} title="The AI reviewer was unavailable; scored with heuristics">
                  Heuristic fallback
                </Tape>
              ) : (
                <Tape icon={<Cpu />}>Gemini review</Tape>
              )}
            </div>
            <h3 className="mt-2 break-words text-[16px] font-semibold text-ink">{selectedEval.ps_title}</h3>
            <p className="mt-0.5 break-words text-[12.5px] text-ink-3">
              {new Date(selectedEval.created_at).toLocaleDateString()} at {new Date(selectedEval.created_at).toLocaleTimeString()} ·{" "}
              <span className="font-mono text-[12px]">{selectedEval.file_name}</span>
            </p>
          </div>

          {/* PERSISTENT LOUD WARNING ON SCORECARD (If evaluated under fallback) */}
          {(selectedEval.ai_feedback?.isFallbackTrack || selectedEval.ai_feedback?.trackWarning) && (
            <div role="alert" className="flex items-start gap-3 rounded-lg bg-warn-soft p-4 ring-1 ring-inset ring-warn/30">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink">Scored with the Web Dev fallback rubric</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
                  {selectedEval.ai_feedback.trackWarning || "Track was not detected at evaluation time. Re-evaluate with the correct track if needed."}
                </p>
              </div>
            </div>
          )}

          {/* Score + rubric */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <Panel className="p-4">
              <p className="caps-label text-ink-3">
                Deck v{selectedEval.version} · {selectedTrackInfo.short}
              </p>
              <p className="mt-2 font-display text-[40px] font-semibold leading-none tracking-[-0.03em] text-ink tabular">
                {selectedEval.total_score}
                <span className="text-[18px] text-ink-3">/100</span>
              </p>
              {compareEval && scoreDiff !== null && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                  {renderDiffBadge(scoreDiff)}
                  <span>vs v{compareEval.version}</span>
                </p>
              )}
              <Tape tone={getGradeTone(selectedEval.grade)} className="mt-3 max-w-full">
                <span className="min-w-0 truncate">{cleanGrade(selectedEval.grade)}</span>
              </Tape>
            </Panel>

            <Panel className="min-w-0 p-4">
              <ul className="space-y-3.5">
                {rubric.map((r) => (
                  <li key={r.key} className="min-w-0">
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="min-w-0 truncate font-medium text-ink-2">{r.label}</span>
                      <span className="shrink-0 font-mono text-[12px] text-ink-3 tabular">
                        {r.value}/{r.max}
                      </span>
                    </div>
                    <Progress value={(r.value / r.max) * 100} tone={r.value / r.max >= 0.7 ? "ok" : "warn"} />
                    <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">{r.note}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          {/* Change since last version (When multiple versions exist) */}
          {compareEval && (
            <Panel as="section" className="min-w-0">
              <PanelHead
                icon={<GitCompare className="text-ink-3" />}
                title={`Change since v${compareEval.version}`}
                action={
                  otherCompletedEvals.length > 1 ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <label htmlFor={`ppt-compare-${teamId}`} className="caps-label shrink-0 text-ink-3">
                        Compare with
                      </label>
                      <Select
                        id={`ppt-compare-${teamId}`}
                        value={compareEval.id}
                        onChange={(e) => setCompareVersionId(e.target.value)}
                        className="h-9 w-auto min-w-0 max-w-full font-mono text-[12.5px] md:h-[30px]"
                      >
                        {otherCompletedEvals.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            v{ev.version} · {ev.total_score}/100 · {new Date(ev.created_at).toLocaleDateString()}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : undefined
                }
              />
              <p className="px-4 pt-3 text-[12.5px] text-ink-3">
                <span className="font-mono text-[12px]">{selectedEval.file_name}</span> against{" "}
                <span className="font-mono text-[12px]">{compareEval.file_name}</span>
              </p>
              <List className="px-4 pb-1">
                {compareRows.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                    <span className={cn("min-w-0 truncate", row.label === "Overall" ? "font-semibold text-ink" : "text-ink-2")}>{row.label}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-[12.5px] text-ink-2 tabular">
                        {row.from} → {row.to}
                      </span>
                      <span className="w-12 text-right">{renderDiffBadge(row.diff)}</span>
                    </span>
                  </li>
                ))}
              </List>

              {/* Resolved red flags */}
              {resolvedRedFlags.length > 0 && (
                <div className="border-t border-line px-4 py-3">
                  <p className="caps-label text-ink-3">Resolved since v{compareEval.version}</p>
                  <ul className="mt-2 space-y-1.5">
                    {resolvedRedFlags.map((rf, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
                        <CheckCircle2 className="mt-[3px] size-3.5 shrink-0 text-ok" aria-hidden />
                        <span className="min-w-0">{rf}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          )}

          {/* Critical Risks & Format Violations */}
          {hasPushback ? (
            <Panel as="section" className="min-w-0">
              <PanelHead icon={<TriangleAlert className="text-warn" />} title="What judges will push back on" />
              <ul className="space-y-2 p-4">
                {(selectedEval.ai_feedback?.criticalRisks || selectedEval.ai_feedback?.spocRedFlags)?.map((flag, idx) => (
                  <li key={`rf-${idx}`} className="flex items-start gap-2 text-[13px] font-medium leading-relaxed text-ink">
                    <TriangleAlert className="mt-[3px] size-3.5 shrink-0 text-warn" aria-hidden />
                    <span className="min-w-0">{flag}</span>
                  </li>
                ))}
                {selectedEval.ai_feedback?.formatViolations?.map((violation, idx) => (
                  <li key={`fv-${idx}`} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
                    <TriangleAlert className="mt-[3px] size-3.5 shrink-0 text-warn" aria-hidden />
                    <span className="min-w-0">{violation}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {/* Strengths */}
          {selectedEval.ai_feedback?.strengths && selectedEval.ai_feedback.strengths.length > 0 && (
            <Panel as="section" className="min-w-0">
              <PanelHead icon={<CheckCircle2 className="text-ok" />} title="What's already working" />
              <ul className="space-y-2 p-4">
                {selectedEval.ai_feedback.strengths.map((str, idx) => (
                  <li key={`str-${idx}`} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
                    <CheckCircle2 className="mt-[3px] size-3.5 shrink-0 text-ok" aria-hidden />
                    <span className="min-w-0">{str}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {/* Slide-by-slide recommendations */}
          <Panel as="section" className="min-w-0">
            <PanelHead icon={<Lightbulb className="text-ink-3" />} title="Slide by slide" />
            <List className="px-4">
              {ORDERED_SLIDES.map((slide) => {
                const rec = selectedEval.ai_feedback?.slideRecommendations?.[slide.key];
                return (
                  <li key={slide.key} className="flex items-start gap-3 py-3">
                    <span className="mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-[5px] bg-selected font-mono text-[12.5px] text-ink-2 tabular">
                      {slide.slideNum}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink">{slide.label.replace(/^Slide \d+:\s*/, "")}</p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
                        {rec || "Ensure standard template format is maintained."}
                      </p>
                    </div>
                  </li>
                );
              })}
            </List>
          </Panel>
        </div>
      )}

      {/* Version history */}
      {evaluations.length > 0 && (
        <Panel as="section" className="min-w-0">
          <PanelHead title="Versions" meta={evaluations.length} />
          <List>
            {evaluations.map((ev) => {
              const isCurrentSelected = selectedEval?.id === ev.id;
              const isConfirming = confirmDeleteId === ev.id;
              const isDeleting = deletingId === ev.id;
              const evTrackInfo = getTrackBadge(ev.track_id || ev.ai_feedback?.track_id || "web_dev");

              return (
                <li
                  key={ev.id}
                  className={cn(
                    "flex flex-wrap items-center gap-x-2 gap-y-2 px-2 py-1.5 transition-colors",
                    isCurrentSelected && "bg-selected",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedEval(ev)}
                    aria-current={isCurrentSelected ? "true" : undefined}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-hover"
                  >
                    <span className="w-7 shrink-0 font-mono text-[12.5px] font-semibold text-ink tabular">v{ev.version}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{ev.ps_title}</span>
                      <span className="block truncate text-[12px] text-ink-3">
                        {new Date(ev.created_at).toLocaleDateString()} · {evTrackInfo.short}
                        {ev.status !== "completed" && ` · ${ev.status}`}
                        <span className="hidden sm:inline"> · {ev.file_name}</span>
                      </span>
                    </span>
                    <Tape tone={getGradeTone(ev.grade)} className="hidden max-w-[150px] md:inline-flex">
                      <span className="min-w-0 truncate">{cleanGrade(ev.grade).split(" / ")[0]}</span>
                    </Tape>
                    <span className={cn("shrink-0 font-mono text-[13px] font-semibold tabular", getScoreColor(ev.total_score))}>
                      {ev.total_score}
                      <span className="text-[12px] font-normal text-ink-3">/100</span>
                    </span>
                  </button>

                  {isConfirming ? (
                    <div className="ml-auto flex shrink-0 items-center gap-1.5 pr-1">
                      <Button
                        variant="danger"
                        size="sm"
                        loading={isDeleting}
                        onClick={() => handleDeleteEvaluation(ev.id)}
                        className="h-9 md:h-7"
                      >
                        {isDeleting ? "Deleting…" : "Delete"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)} className="h-9 md:h-7">
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <IconButton label="Delete this review" onClick={() => setConfirmDeleteId(ev.id)} className="hover:text-bad">
                      <Trash2 />
                    </IconButton>
                  )}
                </li>
              );
            })}
          </List>
        </Panel>
      )}
    </div>
  );
}

