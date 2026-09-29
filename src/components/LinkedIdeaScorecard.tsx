"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  JudgingTrackId,
  TRACK_PROFILES,
} from "@/lib/evaluator/evaluatorTypes";
import {
  Lightbulb,
  TriangleAlert,
  CheckCircle2,
  Cpu,
  Users,
  ExternalLink,
  CornerDownLeft,
} from "lucide-react";
import {
  Button,
  ButtonLink,
  Chip,
  EmptyState,
  ErrorNotice,
  Panel,
  Progress,
  Segmented,
  Select,
  Skeleton,
  Tape,
  type TapeTone,
} from "@/components/system";
import { cn } from "@/lib/utils";

export interface LinkedEvaluationRecord {
  id: string;
  ps_title: string;
  track_id: string;
  total_score: number;
  grade: string;
  used_ai_engine: boolean;
  sub_scores: {
    novelty: number;
    tech: number;
    uiUxOrFeasibility: number;
    impactOrTeam: number;
  };
  evaluation_result: {
    strengths?: string[];
    redFlags?: string[];
    architectureSuggestions?: string[];
    recommendedRoles?: {
      role: string;
      reason: string;
      suggestedSkills: string[];
    }[];
  };
  created_at: string;
}

export interface LinkedIdeaScorecardProps {
  teamId: string;
  className?: string;
  onSelectIdeaTitle?: (title: string) => void;
  onEvaluationLoaded?: (evaluation: LinkedEvaluationRecord | null) => void;
}

/** Grade strings from the engine carry trailing emojis; show the words only. */
function cleanGrade(grade: string = "") {
  return grade.replace(/[^\p{L}\p{N}\s/&().,'-]/gu, "").replace(/\s+/g, " ").trim();
}

export default function LinkedIdeaScorecard({
  teamId,
  className = "",
  onSelectIdeaTitle,
  onEvaluationLoaded,
}: LinkedIdeaScorecardProps) {
  const [evaluations, setEvaluations] = useState<LinkedEvaluationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"redFlags" | "strengths" | "architecture" | "roles">("redFlags");

  useEffect(() => {
    let isMounted = true;

    async function loadAttachedEvaluations() {
      if (!teamId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Explicit column projections (Rule 2 Compliance: no wildcard selects)
        const { data, error: fetchErr } = await supabase
          .from("user_pitch_evaluations")
          .select("id, ps_title, track_id, total_score, grade, used_ai_engine, sub_scores, evaluation_result, created_at")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false });

        if (fetchErr) {
          console.error("[LinkedIdeaScorecard] Query error:", fetchErr);
          if (isMounted) setError(fetchErr.message);
          return;
        }

        const validList = (data as LinkedEvaluationRecord[]) || [];
        if (isMounted) {
          setEvaluations(validList);
          if (validList.length > 0) {
            setSelectedId(validList[0].id);
            onEvaluationLoaded?.(validList[0]);
            if (onSelectIdeaTitle && validList[0].ps_title) {
              onSelectIdeaTitle(validList[0].ps_title);
            }
          } else {
            setSelectedId(null);
            onEvaluationLoaded?.(null);
          }
        }
      } catch (err: any) {
        console.error("[LinkedIdeaScorecard] Unexpected exception:", err);
        if (isMounted) setError(err.message || "Failed to load linked idea evaluations.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAttachedEvaluations();

    return () => {
      isMounted = false;
    };
  }, [teamId]);

  const currentEval = evaluations.find((e) => e.id === selectedId) || evaluations[0] || null;

  const getGradeTone = (grade: string = ""): TapeTone => {
    if (grade.includes("Top Tier") || grade.includes("Gold") || grade.includes("🏆")) return "ok";
    if (grade.includes("Strong") || grade.includes("✅")) return "ok";
    if (grade.includes("Risk") || grade.includes("High Risk") || grade.includes("🚨")) return "bad";
    return "warn";
  };

  if (loading) {
    return (
      <Panel className={cn("p-4", className)}>
        <div aria-busy="true" aria-label="Loading idea score" className="space-y-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <ErrorNotice
        className={className}
        title="Couldn't load the team's idea score"
        detail={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  // Zero State: No evaluation linked to this team yet
  if (!currentEval || evaluations.length === 0) {
    return (
      <EmptyState
        compact
        className={className}
        icon={<Lightbulb />}
        title="No idea score linked"
        body="Score the idea in the Idea Evaluator to get a 0–100 baseline and the red flags judges are likely to raise, then attach it to this team."
        action={
          <ButtonLink href="/evaluator" variant="secondary" size="sm" iconRight={<ExternalLink />} className="h-9 md:h-7">
            Open Idea Evaluator
          </ButtonLink>
        }
      />
    );
  }

  const trackInfo = TRACK_PROFILES[currentEval.track_id as JudgingTrackId] || TRACK_PROFILES.web_dev;
  const result = currentEval.evaluation_result || {};
  const redFlags = result.redFlags || [];
  const strengths = result.strengths || [];
  const archSuggestions = result.architectureSuggestions || [];
  const roles = result.recommendedRoles || [];

  const formattedDate = new Date(currentEval.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const rubric = [
    { key: "novelty", cat: trackInfo.categories.novelty, value: currentEval.sub_scores?.novelty || 0 },
    { key: "tech", cat: trackInfo.categories.tech, value: currentEval.sub_scores?.tech || 0 },
    { key: "ux", cat: trackInfo.categories.uiUxOrFeasibility, value: currentEval.sub_scores?.uiUxOrFeasibility || 0 },
    { key: "impact", cat: trackInfo.categories.impactOrTeam, value: currentEval.sub_scores?.impactOrTeam || 0 },
  ];

  const grade = cleanGrade(currentEval.grade).split(" / ")[0];

  const bulletList = (items: string[], empty: string, icon: React.ReactNode) =>
    items.length > 0 ? (
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
            <span className="mt-[3px] shrink-0 [&_svg]:size-3.5">{icon}</span>
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-[12.5px] text-ink-3">{empty}</p>
    );

  return (
    <Panel className={cn("min-w-0", className)}>
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="caps-label text-ink-3">Idea score</p>
            <Tape>{trackInfo.badge}</Tape>
            <span className="font-mono text-[11.5px] text-ink-3">{formattedDate}</span>
          </div>
          <h3 className="mt-1.5 break-words text-[15px] font-semibold text-ink">{currentEval.ps_title}</h3>
        </div>

        <div className="flex shrink-0 items-end gap-3">
          <p className="font-display text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink tabular">
            {currentEval.total_score}
            <span className="text-[15px] text-ink-3">/100</span>
          </p>
          <Tape tone={getGradeTone(currentEval.grade)} className="mb-1 max-w-[140px]">
            <span className="min-w-0 truncate">{grade}</span>
          </Tape>
        </div>
      </div>

      {/* Multiple attached versions */}
      {evaluations.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <label htmlFor={`idea-version-${teamId}`} className="caps-label text-ink-3">
            Version
          </label>
          <Select
            id={`idea-version-${teamId}`}
            value={selectedId || ""}
            onChange={(e) => {
              setSelectedId(e.target.value);
              const selected = evaluations.find((ev) => ev.id === e.target.value);
              if (selected) {
                onEvaluationLoaded?.(selected);
                onSelectIdeaTitle?.(selected.ps_title);
              }
            }}
            className="h-9 w-auto min-w-0 max-w-full font-mono text-[12.5px] md:h-[30px]"
          >
            {evaluations.map((ev, idx) => (
              <option key={ev.id} value={ev.id}>
                v{evaluations.length - idx} · {ev.total_score} pts · {new Date(ev.created_at).toLocaleDateString()}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* Rubric */}
      <ul className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
        {rubric.map((r) => (
          <li key={r.key} className="min-w-0">
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px]">
              <span className="min-w-0 truncate text-ink-2" title={r.cat.label}>
                {r.cat.label}
              </span>
              <span className="shrink-0 font-mono text-[11.5px] text-ink-3 tabular">
                {r.value}/{r.cat.maxPts}
              </span>
            </div>
            <Progress value={(r.value / r.cat.maxPts) * 100} tone={r.value / r.cat.maxPts >= 0.7 ? "ok" : "warn"} />
          </li>
        ))}
      </ul>

      {/* Jury checklist */}
      <div className="border-t border-line p-4">
        <div className="-mx-1 overflow-x-auto px-1 scrollbar-none">
          <Segmented
            size="sm"
            label="Idea feedback"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: "redFlags", label: "Red flags", count: redFlags.length },
              { value: "strengths", label: "Strengths", count: strengths.length },
              { value: "architecture", label: "Architecture", count: archSuggestions.length },
              { value: "roles", label: "Roles", count: roles.length },
            ]}
          />
        </div>

        <div className="mt-3">
          {activeTab === "redFlags" && (
            <div className="space-y-2.5">
              <p className="text-[12.5px] text-ink-3">
                Raised when the idea was screened. Make sure the deck answers each one.
              </p>
              {bulletList(redFlags, "No red flags for this evaluation.", <TriangleAlert className="text-warn" />)}
            </div>
          )}

          {activeTab === "strengths" && (
            <div className="space-y-2.5">
              <p className="text-[12.5px] text-ink-3">Advantages worth putting front and centre in the pitch.</p>
              {bulletList(strengths, "No strengths listed.", <CheckCircle2 className="text-ok" />)}
            </div>
          )}

          {activeTab === "architecture" && (
            <div className="space-y-2.5">
              <p className="text-[12.5px] text-ink-3">Suggested architecture and engineering improvements.</p>
              {bulletList(archSuggestions, "No architecture suggestions.", <Cpu className="text-ink-3" />)}
            </div>
          )}

          {activeTab === "roles" && (
            <div className="space-y-2.5">
              <p className="text-[12.5px] text-ink-3">Role and skill gaps for this track.</p>
              {roles.length > 0 ? (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {roles.map((r, i) => (
                    <li key={i} className="min-w-0 rounded-md bg-sunken p-3 ring-1 ring-inset ring-line">
                      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                        <Users className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                        <span className="min-w-0 truncate">{r.role}</span>
                      </p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{r.reason}</p>
                      {r.suggestedSkills && r.suggestedSkills.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {r.suggestedSkills.map((sk) => (
                            <Chip key={sk}>{sk}</Chip>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] text-ink-3">All essential roles covered.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5">
        <span className="text-[12px] text-ink-3">From the Idea Evaluator</span>
        <div className="flex flex-wrap items-center gap-1">
          {onSelectIdeaTitle && (
            <Button
              variant="ghost"
              size="sm"
              icon={<CornerDownLeft />}
              onClick={() => onSelectIdeaTitle(currentEval.ps_title)}
              className="h-9 md:h-7"
            >
              Use title in form
            </Button>
          )}
          <ButtonLink href="/evaluator" variant="ghost" size="sm" iconRight={<ExternalLink />} className="h-9 md:h-7">
            Open evaluator
          </ButtonLink>
        </div>
      </div>
    </Panel>
  );
}
