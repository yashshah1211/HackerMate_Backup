"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  Share2,
  Trophy,
} from "lucide-react";
import { ShareScoreCardModal } from "@/components/challenges/ShareScoreCardModal";

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

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [challenge, setChallenge] = useState<ChallengeMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [activeSlideTab, setActiveSlideTab] = useState<string>("slide1");

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
          setErrorMsg(data.error || "Failed to load submission.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Network error loading diagnostic.");
      } finally {
        setLoading(false);
      }
    }

    loadSubmission();
  }, [slug, submissionId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 text-lime-600 dark:text-lime-400 animate-spin mb-4" />
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading AI Jury Diagnostic...</p>
      </div>
    );
  }

  if (errorMsg || !submission) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Could Not Load Evaluation</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-6">{errorMsg || "Submission record not found."}</p>
        <Link href={`/challenges/${slug}`} className="btn btn-secondary inline-flex items-center gap-2 px-4 py-2 text-xs">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Challenge</span>
        </Link>
      </div>
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

  const getGradeColor = (grade: string) => {
    if (grade.includes("Mastery") || grade.includes("Gold")) return "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/30";
    if (grade.includes("Strong") || grade.includes("Ready")) return "text-lime-700 dark:text-lime-400 bg-lime-500/10 border-lime-500/30";
    if (grade.includes("Developing")) return "text-sky-700 dark:text-sky-400 bg-sky-500/10 border-sky-500/30";
    return "text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/30";
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in space-y-8">
      {/* Top Bar Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <Link href="/challenges" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
            Practice Hub
          </Link>
          <span>/</span>
          <Link href={`/challenges/${slug}`} className="hover:text-zinc-900 dark:hover:text-white transition-colors">
            Challenge #{challenge?.challenge_number || 1}
          </Link>
          <span>/</span>
          <span className="text-zinc-900 dark:text-zinc-200 font-semibold">Version {submission.version} Diagnostic</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 border border-amber-500/30 transition-colors cursor-pointer shadow-xs"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Share Achievement ↗</span>
          </button>
          <Link
            href={`/challenges/${slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-lime-600 dark:text-lime-400 hover:text-lime-700 dark:hover:text-lime-300 transition-colors"
          >
            <span>Revise & Resubmit Deck (v{submission.version + 1})</span>
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Main Score Hero Card */}
      <div className="card p-6 sm:p-8 border-lime-500/40 dark:border-lime-500/30 bg-gradient-to-b from-zinc-50 via-white to-zinc-100/40 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900/60 relative overflow-hidden shadow-xs">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-lime-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getGradeColor(submission.grade)}`}>
                {submission.grade}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
                Version {submission.version}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs capitalize bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
                {submission.submission_mode} Deck
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
              {challenge?.title || "Practice Challenge Evaluation"}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Evaluated on {new Date(submission.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>

          {/* Big Score Radial Display */}
          <div className="flex items-center gap-4 shrink-0 bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-xs">
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-extrabold text-lime-600 dark:text-lime-400 tracking-tight">
                {submission.total_score}
                <span className="text-base sm:text-lg text-zinc-400 font-normal">/100</span>
              </div>
              <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mt-1">Jury Score</div>
            </div>
          </div>
        </div>

        {/* Top Action Item Banner */}
        {submission.ai_raw_feedback?.topActionItem && (
          <div className="mt-6 p-4 rounded-xl bg-lime-500/10 border border-lime-500/30 text-xs text-lime-800 dark:text-lime-200 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-lime-600 dark:text-lime-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-lime-700 dark:text-lime-400 uppercase tracking-wide text-[10px] block mb-0.5">Top Priority Action Item:</span>
              <span>{submission.ai_raw_feedback.topActionItem}</span>
            </div>
          </div>
        )}
      </div>

      {/* 4 Category Score Breakdown Progress Bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Problem & Opportunity", score: submission.score_problem, max: 25, color: "bg-violet-500" },
          { label: "Solution & Innovation", score: submission.score_solution, max: 25, color: "bg-sky-500" },
          { label: "Technical Architecture", score: submission.score_architecture, max: 30, color: "bg-lime-500" },
          { label: "Feasibility & Roadmap", score: submission.score_feasibility_impact, max: 20, color: "bg-amber-500" },
        ].map((cat, i) => (
          <div key={i} className="card p-4 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">{cat.label}</span>
              <span className="font-mono font-bold text-zinc-900 dark:text-white">
                {cat.score}/{cat.max}
              </span>
            </div>
            <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full ${cat.color} transition-all duration-500`}
                style={{ width: `${(cat.score / cat.max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Strengths & Growth Areas Side-by-Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Strengths */}
        <div className="card p-6 border-emerald-500/25 dark:border-emerald-500/20 bg-white dark:bg-zinc-950/60 space-y-3 shadow-xs">
          <h2 className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Identified Strengths</span>
          </h2>
          <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
            {submission.strengths && submission.strengths.length > 0 ? (
              submission.strengths.map((str, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                  <span className="leading-relaxed">{str}</span>
                </li>
              ))
            ) : (
              <li className="text-zinc-500 italic">Clear structure and foundational approach.</li>
            )}
          </ul>
        </div>

        {/* Growth Areas */}
        <div className="card p-6 border-amber-500/25 dark:border-amber-500/20 bg-white dark:bg-zinc-950/60 space-y-3 shadow-xs">
          <h2 className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Opportunities for Improvement</span>
          </h2>
          <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
            {submission.growth_areas && submission.growth_areas.length > 0 ? (
              submission.growth_areas.map((ga, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 font-bold">•</span>
                  <span className="leading-relaxed">{ga}</span>
                </li>
              ))
            ) : (
              <li className="text-zinc-500 italic">Expand quantitative impact metrics and roadmap.</li>
            )}
          </ul>
        </div>
      </div>

      {/* Slide-by-Slide AI Jury Recommendations (6 Slides) */}
      <div className="card p-6 sm:p-8 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 space-y-6 shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-lime-600 dark:text-lime-400" />
            <span>Slide-by-Slide Jury Notes</span>
          </h2>
          <span className="text-xs text-zinc-500 font-mono">6-Slide Blueprint</span>
        </div>

        {/* Slide Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-zinc-200 dark:border-zinc-800">
          {["slide1", "slide2", "slide3", "slide4", "slide5", "slide6"].map((slideKey) => {
            const meta = slideLabels[slideKey];
            const isActive = activeSlideTab === slideKey;
            return (
              <button
                key={slideKey}
                onClick={() => setActiveSlideTab(slideKey)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? "bg-lime-500/15 border border-lime-500/50 text-lime-700 dark:text-lime-400"
                    : "bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-900"
                }`}
              >
                <span className="font-mono">Slide {meta?.num || 1}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Slide Detail Card */}
        {activeSlideTab && (
          <div className="p-5 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Slide {slideLabels[activeSlideTab]?.num}: {slideLabels[activeSlideTab]?.title}
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
              {submission.slide_feedback?.[activeSlideTab] || "No specific note for this slide."}
            </p>
          </div>
        )}
      </div>

      {/* Resubmit CTA Card */}
      <div className="card p-6 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-center sm:text-left shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Ready to improve your score?</h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            Apply the recommendations above to your 6-slide deck and submit Version {submission.version + 1}.
          </p>
        </div>

        <Link
          href={`/challenges/${slug}`}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-lime-500 hover:bg-lime-400 text-black font-bold text-xs shadow-lg shadow-lime-500/20 transition-all hover:scale-[1.02]"
        >
          <span>Submit Revised Deck →</span>
        </Link>
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
    </main>
  );
}
