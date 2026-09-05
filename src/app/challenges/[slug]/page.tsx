"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  Upload,
  Link as LinkIcon,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  Users,
  User,
  History,
  ArrowRight,
  RefreshCw,
  Code2,
  PlayCircle,
  FileText,
  Trophy,
  ShieldAlert,
  HelpCircle,
  Target,
  Check,
  X,
  Share2,
  Copy,
  ExternalLink,
  MessageCircle,
} from "lucide-react";
import { TeamsEmojiCelebration } from "@/components/challenges/TeamsEmojiCelebration";

interface Challenge {
  id: string;
  challenge_number: number;
  title: string;
  slug: string;
  track: string;
  difficulty: string;
  summary: string;
  problem_statement: string;
  problem_pdf_url?: string;
  additional_rules?: string;
  constraints: string[];
  slide_template: Array<{ slideNumber: number; title: string; category: string }>;
  starter_template_url?: string;
  status: string;
  starts_at: string;
  ends_at: string;
}

interface SubmissionSummary {
  id: string;
  version: number;
  submission_mode: string;
  file_name: string;
  total_score: number;
  grade: string;
  created_at: string;
}

export default function ChallengeDetailPage() {
  const { slug } = useParams() as { slug: string };
  const router = useRouter();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [userTeams, setUserTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [previousSubmissions, setPreviousSubmissions] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [evaluatingStep, setEvaluatingStep] = useState<string>("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [pendingSubmissionId, setPendingSubmissionId] = useState<string | null>(null);

  // Scoring Guide Modal State
  const [showScoringGuideModal, setShowScoringGuideModal] = useState(false);
  const [showInviteTeammatesModal, setShowInviteTeammatesModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [scoringTab, setScoringTab] = useState<"rubric" | "checklist" | "deductions">("rubric");

  // Form State
  const [submissionMode, setSubmissionMode] = useState<"solo" | "team">("solo");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [inputMode, setInputMode] = useState<"upload" | "link">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [externalLink, setExternalLink] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadChallengeData() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }

        const res = await fetch(`/api/challenges/${encodeURIComponent(slug)}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setChallenge(data.challenge);
          setUserTeams(data.userTeams || []);
          if (data.userTeams?.length > 0) {
            setSelectedTeamId(data.userTeams[0].id);
          }
        }

        if (session?.access_token) {
          const subRes = await fetch(`/api/challenges/${encodeURIComponent(slug)}/submissions`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (subRes.ok) {
            const subData = await subRes.json();
            setPreviousSubmissions(subData.submissions || []);
          }
        }
      } catch (err) {
        console.error("Failed to load challenge details:", err);
      } finally {
        setLoading(false);
      }
    }

    loadChallengeData();
  }, [slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setErrorMsg("Please sign in to submit your practice pitch deck.");
      return;
    }

    if (!externalLink.trim()) {
      setErrorMsg("Please provide your Google Slides or Google Drive presentation link.");
      return;
    }

    if (submissionMode === "team" && !selectedTeamId) {
      setErrorMsg("Please select a team or switch to Solo submission.");
      return;
    }

    setIsSubmitting(true);
    setEvaluatingStep("Connecting to presentation deck and running AI evaluation cascade...");

    try {
      const formData = new FormData();
      formData.append("external_link_url", externalLink.trim());
      formData.append("submission_mode", submissionMode);
      if (submissionMode === "team" && selectedTeamId) {
        formData.append("team_id", selectedTeamId);
      }
      if (githubUrl.trim()) {
        formData.append("github_url", githubUrl.trim());
      }
      if (demoUrl.trim()) {
        formData.append("demo_url", demoUrl.trim());
      }

      const timer = setTimeout(() => {
        setEvaluatingStep("Running multi-model AI evaluation cascade & generating jury diagnostic...");
      }, 2500);

      const res = await fetch(`/api/challenges/${encodeURIComponent(slug)}/evaluate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      clearTimeout(timer);

      const data = await res.json();

      if (!res.ok || data.error) {
        setErrorMsg(data.error || "Evaluation failed. Please verify your file and try again.");
        setIsSubmitting(false);
      } else if (data.submission) {
        setPendingSubmissionId(data.submission.id);
        setShowCelebration(true);
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error occurred during evaluation.");
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 text-lime-600 dark:text-lime-400 animate-spin mb-4" />
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading Challenge Briefing...</p>
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Challenge Not Found</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-6">The requested challenge may have been archived or does not exist.</p>
        <Link href="/challenges" className="btn btn-secondary inline-flex items-center gap-2 px-4 py-2 text-xs">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Practice Hub</span>
        </Link>
      </div>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 mb-6">
        <Link href="/challenges" className="hover:text-zinc-900 dark:hover:text-white transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Practice Challenges</span>
        </Link>
        <span>/</span>
        <span className="text-zinc-900 dark:text-zinc-200 font-semibold">Challenge #{challenge.challenge_number}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Briefing & Blueprint (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Header Card */}
          <div className="card p-6 sm:p-8 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 shadow-xs">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-lime-500/15 text-lime-700 dark:text-lime-400 border border-lime-500/30">
                Challenge #{challenge.challenge_number}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800">
                {challenge.track}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800">
                {challenge.difficulty}
              </span>
              {(() => {
                const isPassed = new Date(challenge.ends_at).getTime() <= Date.now() || challenge.status === "closed";
                return isPassed ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>Submissions Closed</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>Active Challenge</span>
                  </span>
                );
              })()}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              {challenge.title}
            </h1>

            {challenge.summary && (
              <p className="mt-3 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed border-l-2 border-lime-500/50 pl-3 italic">
                {challenge.summary}
              </p>
            )}
          </div>

          {/* Problem Statement Markdown */}
          <div className="card p-6 sm:p-8 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-200 dark:border-zinc-800/80">
              <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                <span>Problem Briefing & Requirements</span>
              </h2>
              {challenge.problem_pdf_url && (
                <a
                  href={challenge.problem_pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-500/10 hover:bg-lime-500/20 border border-lime-500/30 text-lime-700 dark:text-lime-400 text-xs font-semibold transition"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Problem PDF Briefing ↗</span>
                </a>
              )}
            </div>

            <div className="prose prose-zinc dark:prose-invert prose-sm max-w-none text-zinc-700 dark:text-zinc-300 text-xs sm:text-sm leading-relaxed whitespace-pre-line space-y-4">
              {challenge.problem_statement}
            </div>

            {challenge.additional_rules && (
              <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
                <div className="p-4 rounded-xl bg-lime-500/10 border border-lime-500/30 text-xs">
                  <h3 className="font-bold text-lime-700 dark:text-lime-400 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>Additional Challenge Rules & Specific Criteria</span>
                  </h3>
                  <div className="text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed">
                    {challenge.additional_rules}
                  </div>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-2 italic font-mono">
                    * The AI evaluator will directly test and grade your pitch against these custom rules.
                  </p>
                </div>
              </div>
            )}

            {challenge.constraints && challenge.constraints.length > 0 && (
              <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-400 mb-2.5">Key Constraints</h3>
                <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {challenge.constraints.map((c, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-lime-600 dark:text-lime-400 font-bold">•</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 6-Slide Blueprint Format */}
          <div className="card p-6 sm:p-8 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                <span>Standard 6-Slide Structure</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowScoringGuideModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-lime-500/10 hover:bg-lime-500/20 border border-lime-500/30 text-lime-700 dark:text-lime-400 text-xs font-semibold transition cursor-pointer"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>How to Score 100/100 ↗</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {[
                { num: 1, title: "Problem Framing & Target Personas", pts: "20 pts", desc: "Pain points, personas, baseline data" },
                { num: 2, title: "Proposed Solution & Value Moat", pts: "20 pts", desc: "Core innovation, moat vs existing tools" },
                { num: 3, title: "Technical Architecture & Pipeline", pts: "25 pts", desc: "Data flow diagram, DB, frameworks, APIs" },
                { num: 4, title: "Feasibility, Edge Cases & Risks", pts: "15 pts", desc: "Fail-safes, offline mode, rate limits" },
                { num: 5, title: "Impact Metrics & Beneficiary ROI", pts: "10 pts", desc: "Measurable KPIs, baseline comparisons" },
                { num: 6, title: "Execution Roadmap & Team Roles", pts: "10 pts", desc: "Sprint roadmap, deliverables, role breakdown" },
              ].map((slide) => (
                <div key={slide.num} className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                      {slide.num}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-900 dark:text-white">{slide.title}</div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{slide.desc}</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-semibold text-lime-600 dark:text-lime-400 shrink-0">{slide.pts}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
              <span className="text-zinc-500 font-mono">100 Pts Maximum</span>
              <button
                type="button"
                onClick={() => setShowScoringGuideModal(true)}
                className="text-lime-600 dark:text-lime-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Read AI Jury Grading Rules</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Submission Form & Previous Versions (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Submission Form Card */}
          <div className="card p-6 border-lime-500/40 dark:border-lime-500/30 bg-white dark:bg-zinc-950/90 shadow-lg shadow-lime-500/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                <span>Submit Presentation</span>
              </h2>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-lime-500/10 text-lime-700 dark:text-lime-400 border border-lime-500/30 font-semibold">
                6 Slides Max
              </span>
            </div>

            {/* Rules quick banner */}
            <button
              type="button"
              onClick={() => setShowScoringGuideModal(true)}
              className="w-full mb-4 p-2.5 rounded-lg bg-lime-500/10 hover:bg-lime-500/15 border border-lime-500/30 text-lime-700 dark:text-lime-400 text-xs flex items-center justify-between transition cursor-pointer text-left"
            >
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-lime-600 dark:text-lime-400 shrink-0" />
                <span className="font-semibold">How to Score Full 100/100 (AI Rules)</span>
              </div>
              <span className="text-[11px] font-bold">View Rubric →</span>
            </button>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs mb-4 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {(() => {
              const isDeadlinePassed = new Date(challenge.ends_at).getTime() <= Date.now() || challenge.status === "closed";
              
              if (isDeadlinePassed) {
                return (
                  <div className="py-8 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
                      <Clock className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Submission Window Closed</h3>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-xs mx-auto leading-relaxed">
                      The official deadline for Challenge #{challenge.challenge_number} ended on{" "}
                      <strong className="text-zinc-800 dark:text-zinc-200">
                        {new Date(challenge.ends_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </strong>
                      . New submissions and evaluations are no longer accepted for this round.
                    </p>
                    <div className="pt-2">
                      <Link
                        href="/challenges"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white text-xs font-semibold transition shadow-xs"
                      >
                        <span>Explore Active Challenges →</span>
                      </Link>
                    </div>
                  </div>
                );
              }

              if (isSubmitting) {
                return (
                  <div className="py-12 text-center space-y-4">
                    <div className="inline-block animate-spin w-10 h-10 border-3 border-lime-500 border-t-transparent rounded-full" />
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Analyzing Deck Architecture...</h3>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-xs mx-auto leading-relaxed">{evaluatingStep}</p>
                  </div>
                );
              }

              return (
                <form onSubmit={handleSubmit} className="space-y-4">
                {/* Mode: Solo vs Team */}
                <div>
                  <label className="block text-[11px] uppercase font-mono text-zinc-600 dark:text-zinc-400 mb-2 font-semibold">Submission Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSubmissionMode("solo")}
                      className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        submissionMode === "solo"
                          ? "bg-lime-500/15 border-lime-500 text-lime-700 dark:text-lime-400"
                          : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>Solo Builder</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubmissionMode("team")}
                      className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        submissionMode === "team"
                          ? "bg-lime-500/15 border-lime-500 text-lime-700 dark:text-lime-400"
                          : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Team Deck</span>
                    </button>
                  </div>
                </div>

                {/* Team Dropdown if Team Mode */}
                {submissionMode === "team" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] uppercase font-mono text-zinc-600 dark:text-zinc-400 font-semibold">Select Team</label>
                      <button
                        type="button"
                        onClick={() => setShowInviteTeammatesModal(true)}
                        className="text-[11px] font-semibold text-lime-600 dark:text-lime-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Users className="w-3 h-3" />
                        <span>Invite Teammates ↗</span>
                      </button>
                    </div>
                    {userTeams.length > 0 ? (
                      <select
                        value={selectedTeamId}
                        onChange={(e) => setSelectedTeamId(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-lime-500"
                      >
                        {userTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs space-y-2">
                        <p className="text-zinc-600 dark:text-zinc-400 text-[11px]">
                          You don't have an active team selected yet.
                        </p>
                        <div className="flex items-center gap-2">
                          <Link href="/teams" className="px-2.5 py-1 rounded bg-lime-500 hover:bg-lime-400 text-black font-bold text-[10px]">
                            Create Team →
                          </Link>
                          <button
                            type="button"
                            onClick={() => setShowInviteTeammatesModal(true)}
                            className="px-2.5 py-1 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Share2 className="w-3 h-3" />
                            <span>Invite via WhatsApp</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Presentation Link (Google Slides / Google Drive) */}
                  <div>
                    <label className="block text-[11px] uppercase font-mono text-zinc-600 dark:text-zinc-400 mb-1.5 font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <LinkIcon className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
                        <span>Google Slides / Drive Link *</span>
                      </span>
                      <span className="text-[10px] text-zinc-500 font-normal lowercase">public link</span>
                    </label>
                    <input
                      type="url"
                      required
                      placeholder="https://docs.google.com/presentation/d/... or https://drive.google.com/..."
                      value={externalLink}
                      onChange={(e) => setExternalLink(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-lime-500 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-mono"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">Make sure sharing is set to &ldquo;Anyone with link can view&rdquo;.</p>
                  </div>

                  {/* GitHub Repository */}
                  <div>
                    <label className="block text-[11px] uppercase font-mono text-zinc-600 dark:text-zinc-400 mb-1.5 font-semibold flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
                      <span>GitHub Repository URL (Optional)</span>
                    </label>
                    <input
                      type="url"
                      placeholder="https://github.com/username/project"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-lime-500 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-mono"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">Share your source code or deck repository for architectural validation.</p>
                  </div>

                  {/* Prototype Demo URL (Optional) */}
                  <div>
                    <label className="block text-[11px] uppercase font-mono text-zinc-600 dark:text-zinc-400 mb-1.5 font-semibold flex items-center gap-1.5">
                      <PlayCircle className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Live Demo / Prototype URL (Optional)</span>
                    </label>
                    <input
                      type="url"
                      placeholder="https://demo.app or Loom video walkthrough"
                      value={demoUrl}
                      onChange={(e) => setDemoUrl(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-lime-500 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-mono"
                    />
                  </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl bg-lime-500 hover:bg-lime-400 text-black font-bold text-xs shadow-lg shadow-lime-500/20 transition-all cursor-pointer hover:scale-[1.01]"
                >
                  <Zap className="w-4 h-4" />
                  <span>Submit Solution & Run AI Evaluation</span>
                </button>
              </form>
              );
            })()}
          </div>

          {/* Previous Submissions / Version History */}
          {previousSubmissions.length > 0 && (
            <div className="card p-6 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 shadow-xs">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-400 mb-3 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
                <span>Your Submission Versions ({previousSubmissions.length})</span>
              </h3>

              <div className="space-y-2">
                {previousSubmissions.map((sub) => (
                  <Link
                    key={sub.id}
                    href={`/challenges/${slug}/submissions/${sub.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-900 dark:text-white">v{sub.version}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 capitalize">
                          {sub.submission_mode}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        {new Date(sub.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-xs font-bold text-lime-600 dark:text-lime-400">{sub.total_score}/100</div>
                        <div className="text-[10px] text-zinc-600 dark:text-zinc-400">{sub.grade}</div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Scoring Guide & 100/100 Rules Modal */}
      {showScoringGuideModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm p-4 sm:p-6 flex min-h-screen items-center justify-center animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl my-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 shadow-2xl max-h-[88vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-900 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-lime-500/10 border border-lime-500/30 flex items-center justify-center text-lime-400">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>AI Jury Scoring Guide & Rules</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-lime-500/20 text-lime-400 font-mono">100 Pts</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Master these criteria to achieve a 100/100 (Mastery 🏆) rating from the AI evaluator.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScoringGuideModal(false)}
                className="text-zinc-500 hover:text-white transition p-1 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-zinc-900 pt-3 pb-2 shrink-0">
              <button
                type="button"
                onClick={() => setScoringTab("rubric")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  scoringTab === "rubric"
                    ? "bg-lime-500/20 text-lime-400 border border-lime-500/30"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                🎯 4 Core Rubric Pillars
              </button>
              <button
                type="button"
                onClick={() => setScoringTab("checklist")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  scoringTab === "checklist"
                    ? "bg-lime-500/20 text-lime-400 border border-lime-500/30"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                📋 6-Slide Pre-Flight Checklist
              </button>
              <button
                type="button"
                onClick={() => setScoringTab("deductions")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  scoringTab === "deductions"
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                ⚠️ Deduction Triggers
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto pr-1 py-4 space-y-4 text-xs">
              {scoringTab === "rubric" && (
                <div className="space-y-4">
                  {/* Pillar 1 */}
                  <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-lime-500/20 text-lime-400 text-[11px] font-mono flex items-center justify-center">1</span>
                        <span>Problem Framing & Target Personas (Slide 1)</span>
                      </h4>
                      <span className="text-lime-400 font-mono font-bold text-xs">25 Pts Max</span>
                    </div>
                    <p className="text-zinc-300 text-[11px] leading-relaxed">
                      The AI checks whether you understand the root pain point beyond surface symptoms.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                        <span className="font-bold block mb-1">✅ How to Score Full 25/25:</span>
                        <ul className="list-disc pl-4 space-y-1 text-[11px]">
                          <li>Name 2+ specific user personas (e.g. Triage Nurse, Dispatch Officer).</li>
                          <li>Include quantified baseline friction (e.g. "45 min triage delay").</li>
                          <li>Articulate the cost of inaction clearly.</li>
                        </ul>
                      </div>
                      <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
                        <span className="font-bold block mb-1">❌ Common Deduction (-5 to -8 pts):</span>
                        <p className="text-[11px]">Generic problem statements with zero target persona definition or no measurable baseline numbers.</p>
                      </div>
                    </div>
                  </div>

                  {/* Pillar 2 */}
                  <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-lime-500/20 text-lime-400 text-[11px] font-mono flex items-center justify-center">2</span>
                        <span>Solution Design & Innovation Moat (Slide 2)</span>
                      </h4>
                      <span className="text-lime-400 font-mono font-bold text-xs">25 Pts Max</span>
                    </div>
                    <p className="text-zinc-300 text-[11px] leading-relaxed">
                      The AI verifies that your solution offers genuine novelty rather than an off-the-shelf wrapper.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                        <span className="font-bold block mb-1">✅ How to Score Full 25/25:</span>
                        <ul className="list-disc pl-4 space-y-1 text-[11px]">
                          <li>Detail a unique architectural moat (custom rule engine, local-first cache).</li>
                          <li>Show why competitor solutions fail where yours succeeds.</li>
                          <li>Include user workflow / step-by-step resolution.</li>
                        </ul>
                      </div>
                      <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
                        <span className="font-bold block mb-1">❌ Common Deduction (-5 to -8 pts):</span>
                        <p className="text-[11px]">Superficial ChatGPT/OpenAI API wrappers lacking competitive technical differentiation.</p>
                      </div>
                    </div>
                  </div>

                  {/* Pillar 3 */}
                  <div className="p-4 rounded-xl bg-zinc-900/70 border border-lime-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-lime-500/20 text-lime-400 text-[11px] font-mono flex items-center justify-center">3</span>
                        <span>Technical Architecture & Data Pipeline (Slide 3 - Highest Weight!)</span>
                      </h4>
                      <span className="text-lime-400 font-mono font-bold text-xs">30 Pts Max</span>
                    </div>
                    <p className="text-zinc-300 text-[11px] leading-relaxed">
                      This is the heaviest graded slide. The AI looks for a complete, unbroken data flow diagram and stack.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                        <span className="font-bold block mb-1">✅ How to Score Full 30/30:</span>
                        <ul className="list-disc pl-4 space-y-1 text-[11px]">
                          <li>Detail data pipeline: Ingestion → Worker/Queue → Storage → Edge Client.</li>
                          <li>Specify database choices, latency budgets, and security/auth layers.</li>
                          <li>Provide a clear architecture block diagram.</li>
                        </ul>
                      </div>
                      <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
                        <span className="font-bold block mb-1">❌ Common Deduction (-7 to -12 pts):</span>
                        <p className="text-[11px]">Listing logo buzzwords ("React, Node, Mongo, AI") without an actual data flow pipeline.</p>
                      </div>
                    </div>
                  </div>

                  {/* Pillar 4 */}
                  <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-lime-500/20 text-lime-400 text-[11px] font-mono flex items-center justify-center">4</span>
                        <span>Feasibility, Edge Cases & Roadmap (Slides 4, 5, 6)</span>
                      </h4>
                      <span className="text-lime-400 font-mono font-bold text-xs">20 Pts Max</span>
                    </div>
                    <p className="text-zinc-300 text-[11px] leading-relaxed">
                      The AI checks real-world resilience, ROI quantification, and team execution readiness.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                        <span className="font-bold block mb-1">✅ How to Score Full 20/20:</span>
                        <ul className="list-disc pl-4 space-y-1 text-[11px]">
                          <li>Detail 3+ concrete edge cases with mitigation in Slide 4.</li>
                          <li>Include baseline vs projected ROI metrics in Slide 5.</li>
                          <li>Provide sprint-by-sprint milestones and team roles in Slide 6.</li>
                        </ul>
                      </div>
                      <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
                        <span className="font-bold block mb-1">❌ Common Deduction (-4 to -7 pts):</span>
                        <p className="text-[11px]">Ignoring system fail-safes (e.g. network dropout) or vague "launch soon" roadmaps.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {scoringTab === "checklist" && (
                <div className="space-y-3">
                  <p className="text-zinc-400 text-xs">Verify your 6-slide deck against this checklist before submitting to maximize your score:</p>
                  
                  <div className="space-y-2 font-mono">
                    {[
                      { slide: "Slide 1", title: "Problem Framing", check: "2+ Target Personas defined with quantified baseline friction metrics." },
                      { slide: "Slide 2", title: "Solution & Moat", check: "Clear architectural value moat beyond existing commercial tools." },
                      { slide: "Slide 3", title: "Architecture & Data Pipeline", check: "End-to-end data flow: Client Ingestion → Backend Worker → DB → Client." },
                      { slide: "Slide 4", title: "Feasibility & Risks", check: "3+ Edge cases addressed (rate limits, offline mode, fallback behaviors)." },
                      { slide: "Slide 5", title: "Impact & ROI", check: "Quantified baseline vs post-implementation target metrics." },
                      { slide: "Slide 6", title: "Roadmap & Roles", check: "Sprint milestones with explicit owner roles and deliverables." },
                    ].map((item, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 flex items-start gap-3">
                        <div className="w-5 h-5 rounded bg-lime-500/20 text-lime-400 flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold">
                          ✓
                        </div>
                        <div>
                          <span className="text-white font-bold text-xs">{item.slide}: {item.title}</span>
                          <p className="text-zinc-400 text-[11px] font-sans mt-0.5">{item.check}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {scoringTab === "deductions" && (
                <div className="space-y-3">
                  <p className="text-zinc-400 text-xs">The AI evaluator applies these exact point deductions when critical elements are missing:</p>

                  <div className="space-y-2.5">
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                      <div className="px-2 py-1 rounded bg-rose-500/20 text-rose-400 font-mono font-bold text-xs shrink-0">
                        -7 to -12 Pts
                      </div>
                      <div>
                        <div className="text-rose-300 font-bold text-xs">Missing End-to-End Data Pipeline (Slide 3)</div>
                        <p className="text-zinc-400 text-[11px] mt-0.5">Occurs when tech stack is merely a list of logos without an explicit data flow architecture.</p>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                      <div className="px-2 py-1 rounded bg-rose-500/20 text-rose-400 font-mono font-bold text-xs shrink-0">
                        -5 to -8 Pts
                      </div>
                      <div>
                        <div className="text-rose-300 font-bold text-xs">No Innovation Moat / Generic API Wrapper (Slide 2)</div>
                        <p className="text-zinc-400 text-[11px] mt-0.5">Occurs when the solution is a thin layer over ChatGPT without proprietary domain logic.</p>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                      <div className="px-2 py-1 rounded bg-rose-500/20 text-rose-400 font-mono font-bold text-xs shrink-0">
                        -5 to -8 Pts
                      </div>
                      <div>
                        <div className="text-rose-300 font-bold text-xs">Generic Problem Statement (Slide 1)</div>
                        <p className="text-zinc-400 text-[11px] mt-0.5">Occurs when problem lacks specific target user personas and baseline friction numbers.</p>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                      <div className="px-2 py-1 rounded bg-rose-500/20 text-rose-400 font-mono font-bold text-xs shrink-0">
                        -4 to -7 Pts
                      </div>
                      <div>
                        <div className="text-rose-300 font-bold text-xs">Ignoring Edge Cases & Fail-Safes (Slide 4)</div>
                        <p className="text-zinc-400 text-[11px] mt-0.5">Occurs when failure scenarios (network offline, API timeout, bad input) have no mitigation.</p>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                      <div className="px-2 py-1 rounded bg-rose-500/20 text-rose-400 font-mono font-bold text-xs shrink-0">
                        -3 to -5 Pts
                      </div>
                      <div>
                        <div className="text-rose-300 font-bold text-xs">Missing Metrics / Vague Roadmap (Slides 5 & 6)</div>
                        <p className="text-zinc-400 text-[11px] mt-0.5">Occurs when impact metrics have no baseline comparison or roadmap has no role ownership.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-zinc-900 pt-4 shrink-0">
              <div className="text-[11px] text-zinc-500 font-mono">
                AI Evaluator Engine v2.4 • 6-Slide Fixed Structure
              </div>
              <button
                type="button"
                onClick={() => setShowScoringGuideModal(false)}
                className="btn btn-primary text-xs py-2 px-5 bg-lime-500 hover:bg-lime-400 text-black font-bold border-none shadow-lg shadow-lime-500/20 cursor-pointer"
              >
                Got It, Let's Build!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Microsoft Teams Style Emoji Pop & Celebration Overlay */}
      {(() => {
        const themeEntry = challenge.constraints?.find((c) => c.startsWith("ReactionTheme:"));
        const reactionTheme = themeEntry ? themeEntry.replace("ReactionTheme:", "") : "default";
        return (
          <TeamsEmojiCelebration
            active={showCelebration}
            theme={reactionTheme}
            message="Your pitch deck has been evaluated by the AI Jury! Loading score diagnostics..."
            onComplete={() => {
              if (pendingSubmissionId) {
                router.push(`/challenges/${slug}/submissions/${pendingSubmissionId}`);
              }
            }}
          />
        );
      })()}
      {/* Invite Teammates Modal (WhatsApp + In-App) */}
      {showInviteTeammatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-teams-pop">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-lime-500/15 border border-lime-500/30 flex items-center justify-center text-lime-600 dark:text-lime-400 font-bold">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">Invite Teammates to Practice Squad</h3>
                  <p className="text-xs text-zinc-500">Collaborate with peers to build a winning 6-slide deck.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteTeammatesModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-xs">
              {/* WhatsApp Share Card */}
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5 text-xs">
                    <MessageCircle className="w-4 h-4" />
                    <span>Invite via WhatsApp (Non-HackerMate Users)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold font-mono">
                    1-Click Share
                  </span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                  Send a personalized invite link directly to your WhatsApp group or contacts so they can jump straight in and co-author your pitch deck.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined" && challenge) {
                      const text = encodeURIComponent(
                        `Hey! 👋 I'm practicing for our upcoming hackathon on HackerMate for Challenge #${challenge.challenge_number}: "${challenge.title}".\n\nJoin my practice squad and review our 6-slide deck here:\n${window.location.href}`
                      );
                      window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
                    }
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Share Challenge on WhatsApp ↗</span>
                </button>
              </div>

              {/* Copy Direct Link */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                  Copy Direct Challenge Link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={typeof window !== "undefined" ? window.location.href : ""}
                    className="input w-full bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white text-xs font-mono select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        navigator.clipboard.writeText(window.location.href);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }
                    }}
                    className="px-3.5 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition cursor-pointer"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-lime-400" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* In-App HackerMate Users Invite */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4">
                <div>
                  <div className="font-bold text-zinc-900 dark:text-white text-xs">Invite HackerMate Builders</div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Manage your full team roster or find developers on the platform.</p>
                </div>
                <Link
                  href="/teams"
                  className="px-3.5 py-2 rounded-lg bg-lime-500 hover:bg-lime-400 text-black font-bold text-xs shrink-0 flex items-center gap-1.5 transition shadow-xs"
                >
                  <span>Team Hub →</span>
                </Link>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowInviteTeammatesModal(false)}
                className="btn btn-secondary text-xs px-4 py-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
