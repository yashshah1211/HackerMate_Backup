"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, ArrowRight, CheckCircle2, Share2, Target, Trash2, TriangleAlert } from "lucide-react";
import PitchAnalysisBadge from "@/components/PitchAnalysisBadge";
import { getAnalysisDisplay, type AnalysisMetadata } from "@/lib/ppt/analysisMetadata";
import { logDatabaseFailure } from "@/lib/evaluator/evaluationContract";
import { useNotification } from "@/context/NotificationContext";
import {
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  Page,
  PageHeader,
  PageLoader,
  Panel,
  Progress,
  Section,
  Tape,
  type TapeTone,
} from "@/components/system";
import { cn } from "@/lib/utils";

interface SubmissionDetail {
  id: string;
  challenge_id: string;
  submission_mode: "solo" | "team";
  submission_type: string;
  file_name: string;
  version: number;
  score_problem: number;
  score_solution: number;
  score_architecture: number;
  score_feasibility_impact: number;
  total_score: number;
  grade: string;
  status?: string;
  strengths: string[];
  growth_areas: string[];
  slide_feedback: Record<string, string>;
  format_violations: string[];
  score_deductions: Record<string, string>;
  ai_raw_feedback?: {
    topActionItem?: string;
    evaluatedAt?: string;
    analysis?: AnalysisMetadata;
  };
  used_ai_fallback: boolean;
  created_at: string;
}

interface ChallengeMeta {
  id: string;
  challenge_number: number;
  title: string;
  slug: string;
  track: string;
  difficulty: string;
}

export default function SubmissionResultPage() {
  const { slug, submissionId } = useParams() as { slug: string; submissionId: string };
  const router = useRouter();
  const { showToast, confirm } = useNotification();

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [challenge, setChallenge] = useState<ChallengeMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [activeSlideTab, setActiveSlideTab] = useState<string>("slide1");
  const [isDeleting, setIsDeleting] = useState(false);
  const generation = useRef(0);

  function handleDeleteSubmission() {
    if (!submission) return;

    confirm({
      title: "DELETE SUBMISSION",
      message: `Are you sure you want to delete Version ${submission.version}? This will permanently remove its evaluation score, feedback, and diagnostic history.`,
      confirmText: "Delete Submission",
      onConfirm: async () => {
        setIsDeleting(true);
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          const headers: Record<string, string> = {};
          if (session?.access_token) {
            headers["Authorization"] = `Bearer ${session.access_token}`;
          }

          const res = await fetch(`/api/challenges/${slug}/submissions/${submissionId}`, {
            method: "DELETE",
            headers,
          });

          const data = await res.json();
          if (res.ok && data.success) {
            showToast(`Version ${submission.version} deleted successfully.`, "success");
            router.push(`/challenges/${slug}`);
          } else {
            showToast(data.error || "Failed to delete submission.", "error");
            setIsDeleting(false);
          }
        } catch (err: unknown) {
          logDatabaseFailure("challenge_delete", err); showToast("Delete outcome unconfirmed. Reload history.", "error");
          setIsDeleting(false);
        }
      },
    });
  }

  useEffect(() => {
    const epoch = ++generation.current;
    const controller = new AbortController();
    let actorId: string | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (actorId !== null && session?.user?.id !== actorId) {
        generation.current++; controller.abort(); setSubmission(null); setChallenge(null); setShowShareModal(false); setLoading(false);
        setErrorMsg("Account changed. Reload to view authorized evaluation history.");
      }
    });
    async function loadSubmission() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (epoch !== generation.current) return;
        actorId = session?.user?.id || null;
        setLoading(true); setSubmission(null); setChallenge(null); setErrorMsg(null); setShowShareModal(false);

        if (!session) {
          setErrorMsg("Please sign in to view this evaluation.");
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/challenges/${slug}/submissions/${submissionId}`, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (epoch !== generation.current) return;
          setSubmission(data.submission);
          setActiveSlideTab(Object.keys(data.submission?.slide_feedback || {}).find(key => data.submission.slide_feedback[key]) || "slide1");
          setChallenge(data.challenge);
        } else {
          const data = await res.json();
          console.error("Failed to load submission: HTTP", res.status);
          setErrorMsg(data.error || "Failed to load submission.");
        }
      } catch (err: unknown) {
        logDatabaseFailure("challenge_result_load", err);
        if (epoch === generation.current) setErrorMsg("The evaluation could not be verified. Reload to check history.");
      } finally {
        if (epoch === generation.current) setLoading(false);
      }
    }

    loadSubmission();
    const dispose = () => { generation.current++; controller.abort(); };
    return () => { dispose(); subscription.unsubscribe(); };
  }, [slug, submissionId]);


  if (loading) {
    return (
      <Page>
        <PageLoader label="Loading feedback" />
      </Page>
    );
  }

  if (errorMsg || !submission) {
    return (
      <Page width="narrow">
        <div className="pt-10">
          <EmptyState
            icon={<TriangleAlert />}
            title="Couldn't load this evaluation"
            body={errorMsg || "Submission record not found."}
            action={
              <ButtonLink href={`/challenges/${slug}`} icon={<ArrowLeft />}>
                Back to challenge
              </ButtonLink>
            }
          />
        </div>
      </Page>
    );
  }

  if (submission.status && submission.status !== "completed") return <Page width="narrow"><EmptyState title="No completed scorecard" body="Processing is unconfirmed or failed. Check submission history before starting another evaluation." action={<ButtonLink href={`/challenges/${slug}`}>Back to history</ButtonLink>} /></Page>;

  const slideLabels: Record<string, { title: string; num: number }> = {
    slide1: { title: "Problem Framing & Target Personas", num: 1 },
    slide2: { title: "Proposed Solution & Value Moat", num: 2 },
    slide3: { title: "Technical Architecture & Pipeline", num: 3 },
    slide4: { title: "Feasibility, Edge Cases & Risks", num: 4 },
    slide5: { title: "Impact Metrics & Beneficiary ROI", num: 5 },
    slide6: { title: "Execution Roadmap & Team Roles", num: 6 },
  };

  const getGradeTone = (grade: string): TapeTone => {
    if (grade.includes("Mastery") || grade.includes("Gold")) return "accent";
    if (grade.includes("Strong") || grade.includes("Ready")) return "ok";
    if (grade.includes("Developing")) return "info";
    return "bad";
  };

  const rubric = [
    { label: "Problem & opportunity", score: submission.score_problem, max: 25 },
    { label: "Solution & innovation", score: submission.score_solution, max: 25 },
    { label: "Technical architecture", score: submission.score_architecture, max: 30 },
    { label: "Feasibility & roadmap", score: submission.score_feasibility_impact, max: 20 },
  ];
  const analysis = getAnalysisDisplay({ analysis: submission.ai_raw_feedback?.analysis, usedAiFallback: submission.used_ai_fallback });
  // This only preserves the existing share control; copied text never authenticates stored metadata.
  const shareEligible = submission.status === "completed" && !submission.used_ai_fallback && submission.ai_raw_feedback?.analysis?.rubricVersion === "challenge-v1" && submission.ai_raw_feedback.analysis.mode === "text_only";

  return (
    <Page>
      <PageHeader
        eyebrow={
          <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
            <Link href="/challenges" className="hover:text-ink">
              Practice
            </Link>
            <span aria-hidden>/</span>
            <Link href={`/challenges/${slug}`} className="tabular hover:text-ink">
              #{challenge?.challenge_number || 1}
            </Link>
            <span aria-hidden>/</span>
            <span className="tabular">v{submission.version}</span>
          </span>
        }
        title={challenge?.title || "Practice challenge evaluation"}
        meta={
          <span className="flex flex-wrap items-center gap-1.5">
            <Tape tone={getGradeTone(submission.grade)}>{submission.grade}</Tape>
            <Tape tone={submission.submission_mode === "team" ? "info" : "neutral"}>{submission.submission_mode}</Tape>
            <span className="ml-1 font-mono text-[12px] text-ink-3">
              Scored {new Date(submission.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </span>
        }
        actions={
          <>
            <Button icon={<Share2 />} onClick={() => setShowShareModal(true)} disabled={!shareEligible}>
              Share
            </Button>
            <Button variant="danger" icon={<Trash2 />} loading={isDeleting} onClick={handleDeleteSubmission} title="Delete this submission">
              Delete
            </Button>
            <ButtonLink href={`/challenges/${slug}`} variant="primary" iconRight={<ArrowRight />}>
              Resubmit as v{submission.version + 1}
            </ButtonLink>
          </>
        }
      />

      <div className="mt-2 space-y-8">
        <div className="space-y-2"><PitchAnalysisBadge feedback={{ analysis: submission.ai_raw_feedback?.analysis, usedAiFallback: submission.used_ai_fallback }} /><p className="text-[13px] text-ink-3">{analysis.description}</p></div>
        {/* Score + rubric */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          <Panel className="p-4">
            <p className="caps-label text-ink-3">Total score</p>
            <p className="mt-2 font-display text-[44px] font-semibold leading-none tracking-[-0.03em] text-ink tabular">
              {submission.total_score}
              <span className="text-[18px] text-ink-3">/100</span>
            </p>
            <p className="mt-2 text-[12.5px] text-ink-3">
              Version {submission.version} · {submission.submission_mode} deck
            </p>
          </Panel>
          <Panel className="min-w-0 p-4">
            <p className="caps-label text-ink-3">Rubric</p>
            <ul className="mt-3 space-y-3">
              {rubric.map((cat) => {
                const pct = cat.max > 0 ? (cat.score / cat.max) * 100 : 0;
                return (
                  <li
                    key={cat.label}
                    className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-2 sm:grid-cols-[170px_minmax(0,1fr)_48px]"
                  >
                    <span className="truncate">{cat.label}</span>
                    <span className="text-right font-mono text-[12px] text-ink-2 tabular sm:order-last">
                      {cat.score}/{cat.max}
                    </span>
                    <Progress value={pct} tone={pct >= 70 ? "ok" : "warn"} className="col-span-2 sm:col-span-1" />
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        {/* Top action item */}
        {submission.ai_raw_feedback?.topActionItem && (
          <div className="flex items-start gap-3 rounded-lg bg-accent-soft px-4 py-3 ring-1 ring-inset ring-accent/35">
            <Target className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
            <div className="min-w-0">
              <p className="caps-label text-accent-ink">Fix this first</p>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink">{submission.ai_raw_feedback.topActionItem}</p>
            </div>
          </div>
        )}

        {/* Strengths & growth areas */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <Section title="Strengths">
            <ul className="divide-y divide-line border-y border-line">
              {submission.strengths && submission.strengths.length > 0 ? (
                submission.strengths.map((str, idx) => (
                  <li key={idx} className="flex gap-2.5 py-2.5 text-[13.5px] leading-relaxed text-ink-2">
                    <CheckCircle2 className="mt-[3px] size-4 shrink-0 text-ok" aria-hidden />
                    <span className="min-w-0">{str}</span>
                  </li>
                ))
              ) : (
                <li className="py-2.5 text-[13px] text-ink-3">No strengths recorded.</li>
              )}
            </ul>
          </Section>

          <Section title="What to improve">
            <ul className="divide-y divide-line border-y border-line">
              {submission.growth_areas && submission.growth_areas.length > 0 ? (
                submission.growth_areas.map((ga, idx) => (
                  <li key={idx} className="flex gap-2.5 py-2.5 text-[13.5px] leading-relaxed text-ink-2">
                    <TriangleAlert className="mt-[3px] size-4 shrink-0 text-warn" aria-hidden />
                    <span className="min-w-0">{ga}</span>
                  </li>
                ))
              ) : (
                <li className="py-2.5 text-[13px] text-ink-3">No additional feedback recorded.</li>
              )}
            </ul>
          </Section>
        </div>

        {/* Slide-by-slide notes */}
        <Section title="Topic feedback" count="Not physical page numbers">
          <div role="tablist" aria-label="Feedback topics" className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:px-0">
            {["slide1", "slide2", "slide3", "slide4", "slide5", "slide6"].map((slideKey) => {
              const meta = slideLabels[slideKey];
              const isActive = activeSlideTab === slideKey;
              return (
                <button
                  key={slideKey}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveSlideTab(slideKey)}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center rounded-md px-3 font-mono text-[12.5px] transition-colors md:h-8",
                    isActive
                      ? "bg-ink text-canvas"
                      : "bg-raised text-ink-2 ring-1 ring-inset ring-line-strong hover:text-ink hover:ring-ink-4",
                  )}
                >
                  Topic {meta?.num || 1}
                </button>
              );
            })}
          </div>

          {activeSlideTab && (
            <Panel className="mt-3 p-4 md:p-5">
              <h3 className="text-[14px] font-semibold text-ink">
                <span className="font-mono text-[12.5px] text-ink-3">Topic {slideLabels[activeSlideTab]?.num}</span> ·{" "}
                {slideLabels[activeSlideTab]?.title}
              </h3>
              <p className="mt-2 whitespace-pre-line break-words text-[14px] leading-relaxed text-ink-2">
                {submission.slide_feedback?.[activeSlideTab] || "No feedback recorded for this topic."}
              </p>
            </Panel>
          )}
        </Section>

        {/* Resubmit */}
        <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-ink">Ready to improve your score?</h3>
            <p className="mt-0.5 text-[13px] text-ink-3">
              Apply the notes above to your deck and submit version {submission.version + 1}.
            </p>
          </div>
          <ButtonLink href={`/challenges/${slug}`} iconRight={<ArrowRight />} className="shrink-0">
            Submit revised deck
          </ButtonLink>
        </div>
      </div>

      {shareEligible && <Dialog open={showShareModal} onClose={() => setShowShareModal(false)} title="Share historical result" description="Historical provenance unverified. Stored metadata does not establish generation or processing mode.">
        <div className="space-y-3">
          <p className="text-[14px] text-ink">{submission.total_score}/100 · {submission.grade} · Historical provenance unverified</p>
          <Button onClick={async () => {
            try {
              await navigator.clipboard.writeText(`HackerMate Challenge: ${submission.total_score}/100 (${submission.grade}). Historical provenance unverified; stored generation and processing claims are unverified. ${window.location.href}`);
              showToast("Qualified result copied.", "success");
            } catch { showToast("Could not copy. Please copy the page link manually.", "error"); }
          }}>Copy historical result</Button>
        </div>
      </Dialog>}    </Page>
  );
}
