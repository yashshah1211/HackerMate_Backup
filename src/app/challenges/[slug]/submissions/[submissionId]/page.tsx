"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, ArrowRight, CheckCircle2, Share2, Target, Trash2, TriangleAlert } from "lucide-react";
import { ShareScoreCardModal } from "@/components/challenges/ShareScoreCardModal";
import { useNotification } from "@/context/NotificationContext";
import {
  Button,
  ButtonLink,
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
  strengths: string[];
  growth_areas: string[];
  slide_feedback: Record<string, string>;
  format_violations: string[];
  score_deductions: Record<string, string>;
  ai_raw_feedback?: {
    topActionItem?: string;
    evaluatedAt?: string;
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
        } catch (err: any) {
          showToast(err.message || "Failed to delete submission.", "error");
          setIsDeleting(false);
        }
      },
    });
  }

  useEffect(() => {
    async function loadSubmission() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setErrorMsg("Please sign in to view this evaluation.");
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/challenges/${slug}/submissions/${submissionId}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setSubmission(data.submission);
          setChallenge(data.challenge);
        } else {
          const data = await res.json();
          console.error("Failed to load submission: HTTP", res.status, data?.error);
          setErrorMsg(data.error || "Failed to load submission.");
        }
      } catch (err: any) {
        console.error("Failed to load submission:", err);
        setErrorMsg(err.message || "Network error loading diagnostic.");
      } finally {
        setLoading(false);
      }
    }

    loadSubmission();
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
            <Button icon={<Share2 />} onClick={() => setShowShareModal(true)}>
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
                <li className="py-2.5 text-[13px] text-ink-3">Clear structure and foundational approach.</li>
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
                <li className="py-2.5 text-[13px] text-ink-3">Expand quantitative impact metrics and roadmap.</li>
              )}
            </ul>
          </Section>
        </div>

        {/* Slide-by-slide notes */}
        <Section title="Slide-by-slide notes" count="6 slides">
          <div role="tablist" aria-label="Slides" className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:px-0">
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
                  Slide {meta?.num || 1}
                </button>
              );
            })}
          </div>

          {activeSlideTab && (
            <Panel className="mt-3 p-4 md:p-5">
              <h3 className="text-[14px] font-semibold text-ink">
                <span className="font-mono text-[12.5px] text-ink-3">Slide {slideLabels[activeSlideTab]?.num}</span> ·{" "}
                {slideLabels[activeSlideTab]?.title}
              </h3>
              <p className="mt-2 whitespace-pre-line break-words text-[14px] leading-relaxed text-ink-2">
                {submission.slide_feedback?.[activeSlideTab] || "No specific note for this slide."}
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

      {/* 1-Click Social Share Card Modal */}
      {submission && challenge && (
        <ShareScoreCardModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          challengeTitle={challenge.title}
          challengeNumber={challenge.challenge_number}
          totalScore={submission.total_score}
          grade={submission.grade}
          scores={{
            problem: submission.score_problem,
            solution: submission.score_solution,
            architecture: submission.score_architecture,
            feasibility: submission.score_feasibility_impact,
          }}
          participantName={submission.submission_mode === "team" ? "Team Squad" : "Builder"}
          submissionMode={submission.submission_mode}
          shareUrl={typeof window !== "undefined" ? window.location.href : `https://hackermate.in/challenges/${slug}`}
        />
      )}
    </Page>
  );
}
