"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  FileText,
  Link as LinkIcon,
  MessageCircle,
  PlayCircle,
  Share2,
  Target,
  Trash2,
  TriangleAlert,
  User,
  Users,
  Zap,
} from "lucide-react";
import { CELEBRATION_THEMES, TeamsEmojiCelebration } from "@/components/challenges/TeamsEmojiCelebration";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { useNotification } from "@/context/NotificationContext";
import AuthModal from "@/components/AuthModal";
import PresentationErrorAlert from "@/components/ui/PresentationErrorAlert";
import {
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  FieldLabel,
  IconButton,
  Input,
  Page,
  PageHeader,
  PageLoader,
  Panel,
  Progress,
  Section,
  Segmented,
  Select,
  Spinner,
  Tape,
  buttonClass,
  type TapeTone,
} from "@/components/system";
import { eventTimeline } from "@/lib/time";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Presentational data + helpers                                       */
/* ------------------------------------------------------------------ */

/** Same expression the page used inline before: deadline passed or status closed. */
function isSubmissionWindowClosed(endsAt: string, status: string): boolean {
  return new Date(endsAt).getTime() <= Date.now() || status === "closed";
}

function difficultyTone(difficulty: string | null | undefined): TapeTone {
  const d = (difficulty || "").toLowerCase();
  if (/(beginner|easy|starter)/.test(d)) return "ok";
  if (/(advanced|hard|expert)/.test(d)) return "bad";
  if (/(intermediate|medium)/.test(d)) return "warn";
  return "neutral";
}

const SLIDE_STRUCTURE = [
  { num: 1, title: "Problem Framing & Target Personas", pts: 20, desc: "Pain points, personas, baseline data" },
  { num: 2, title: "Proposed Solution & Value Moat", pts: 20, desc: "Core innovation, moat vs existing tools" },
  { num: 3, title: "Technical Architecture & Pipeline", pts: 25, desc: "Data flow diagram, DB, frameworks, APIs" },
  { num: 4, title: "Feasibility, Edge Cases & Risks", pts: 15, desc: "Fail-safes, offline mode, rate limits" },
  { num: 5, title: "Impact Metrics & Beneficiary ROI", pts: 10, desc: "Measurable KPIs, baseline comparisons" },
  { num: 6, title: "Execution Roadmap & Team Roles", pts: 10, desc: "Sprint roadmap, deliverables, role breakdown" },
];

const GUIDE_PILLARS = [
  {
    n: 1,
    title: "Problem framing & target personas",
    slides: "Slide 1",
    max: 25,
    intro: "The AI checks whether you understand the root pain point beyond surface symptoms.",
    full: [
      "Name 2+ specific user personas (e.g. Triage Nurse, Dispatch Officer).",
      'Include quantified baseline friction (e.g. "45 min triage delay").',
      "Articulate the cost of inaction clearly.",
    ],
    penalty: "-5 to -8 pts",
    penaltyText: "Generic problem statements with zero target persona definition or no measurable baseline numbers.",
  },
  {
    n: 2,
    title: "Solution design & innovation moat",
    slides: "Slide 2",
    max: 25,
    intro: "The AI verifies that your solution offers genuine novelty rather than an off-the-shelf wrapper.",
    full: [
      "Detail a unique architectural moat (custom rule engine, local-first cache).",
      "Show why competitor solutions fail where yours succeeds.",
      "Include user workflow / step-by-step resolution.",
    ],
    penalty: "-5 to -8 pts",
    penaltyText: "Superficial ChatGPT/OpenAI API wrappers lacking competitive technical differentiation.",
  },
  {
    n: 3,
    title: "Technical architecture & data pipeline",
    slides: "Slide 3 · highest weight",
    max: 30,
    intro: "This is the heaviest graded slide. The AI looks for a complete, unbroken data flow diagram and stack.",
    full: [
      "Detail data pipeline: Ingestion → Worker/Queue → Storage → Edge Client.",
      "Specify database choices, latency budgets, and security/auth layers.",
      "Provide a clear architecture block diagram.",
    ],
    penalty: "-7 to -12 pts",
    penaltyText: 'Listing logo buzzwords ("React, Node, Mongo, AI") without an actual data flow pipeline.',
  },
  {
    n: 4,
    title: "Feasibility, edge cases & roadmap",
    slides: "Slides 4, 5, 6",
    max: 20,
    intro: "The AI checks real-world resilience, ROI quantification, and team execution readiness.",
    full: [
      "Detail 3+ concrete edge cases with mitigation in Slide 4.",
      "Include baseline vs projected ROI metrics in Slide 5.",
      "Provide sprint-by-sprint milestones and team roles in Slide 6.",
    ],
    penalty: "-4 to -7 pts",
    penaltyText: 'Ignoring system fail-safes (e.g. network dropout) or vague "launch soon" roadmaps.',
  },
];

const GUIDE_CHECKLIST = [
  { slide: "Slide 1", title: "Problem Framing", check: "2+ Target Personas defined with quantified baseline friction metrics." },
  { slide: "Slide 2", title: "Solution & Moat", check: "Clear architectural value moat beyond existing commercial tools." },
  { slide: "Slide 3", title: "Architecture & Data Pipeline", check: "End-to-end data flow: Client Ingestion → Backend Worker → DB → Client." },
  { slide: "Slide 4", title: "Feasibility & Risks", check: "3+ Edge cases addressed (rate limits, offline mode, fallback behaviors)." },
  { slide: "Slide 5", title: "Impact & ROI", check: "Quantified baseline vs post-implementation target metrics." },
  { slide: "Slide 6", title: "Roadmap & Roles", check: "Sprint milestones with explicit owner roles and deliverables." },
];

const GUIDE_DEDUCTIONS = [
  { pts: "-7 to -12 pts", title: "Missing End-to-End Data Pipeline (Slide 3)", body: "Occurs when tech stack is merely a list of logos without an explicit data flow architecture." },
  { pts: "-5 to -8 pts", title: "No Innovation Moat / Generic API Wrapper (Slide 2)", body: "Occurs when the solution is a thin layer over ChatGPT without proprietary domain logic." },
  { pts: "-5 to -8 pts", title: "Generic Problem Statement (Slide 1)", body: "Occurs when problem lacks specific target user personas and baseline friction numbers." },
  { pts: "-4 to -7 pts", title: "Ignoring Edge Cases & Fail-Safes (Slide 4)", body: "Occurs when failure scenarios (network offline, API timeout, bad input) have no mitigation." },
  { pts: "-3 to -5 pts", title: "Missing Metrics / Vague Roadmap (Slides 5 & 6)", body: "Occurs when impact metrics have no baseline comparison or roadmap has no role ownership." },
];

function ScoringGuideBody({ tab }: { tab: "rubric" | "checklist" | "deductions" }) {
  if (tab === "rubric") {
    return (
      <div className="space-y-3">
        {GUIDE_PILLARS.map((p) => (
          <div key={p.n} className="rounded-lg border border-line bg-raised p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="caps-label text-ink-3">
                  {p.n} · {p.slides}
                </p>
                <h3 className="mt-1 text-[13.5px] font-semibold text-ink">{p.title}</h3>
              </div>
              <span className="shrink-0 font-mono text-[12px] text-ink-2 tabular">{p.max} pts</span>
            </div>
            <Progress value={(p.max / 30) * 100} className="mt-3" />
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">{p.intro}</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="caps-label text-ok">
                  For {p.max}/{p.max}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {p.full.map((f) => (
                    <li key={f} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-2">
                      <CheckCircle2 className="mt-[3px] size-3.5 shrink-0 text-ok" aria-hidden />
                      <span className="min-w-0">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="min-w-0">
                <p className="caps-label text-bad">Deduction {p.penalty}</p>
                <p className="mt-1.5 flex gap-2 text-[12.5px] leading-relaxed text-ink-2">
                  <TriangleAlert className="mt-[3px] size-3.5 shrink-0 text-bad" aria-hidden />
                  <span className="min-w-0">{p.penaltyText}</span>
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (tab === "checklist") {
    return (
      <div>
        <p className="text-[13px] text-ink-3">Check your deck against this list before you submit.</p>
        <ol className="mt-2 divide-y divide-line border-y border-line">
          {GUIDE_CHECKLIST.map((item) => (
            <li key={item.slide} className="flex gap-3 py-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">
                  <span className="font-mono text-[12px] text-ink-3">{item.slide}</span> · {item.title}
                </p>
                <p className="mt-0.5 text-[12.5px] text-ink-3">{item.check}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[13px] text-ink-3">The AI review applies these deductions when key elements are missing.</p>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {GUIDE_DEDUCTIONS.map((d) => (
          <li key={d.title} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start sm:gap-3">
            <Tape tone="bad" className="self-start">{d.pts}</Tape>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">{d.title}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-3">{d.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Two-option toggle that stays inside the submission form (type="button"). */
function ModeToggle({
  value,
  onChange,
}: {
  value: "solo" | "team";
  onChange: (v: "solo" | "team") => void;
}) {
  const opts = [
    { value: "solo" as const, label: "Solo", icon: <User /> },
    { value: "team" as const, label: "Team", icon: <Users /> },
  ];
  return (
    <div role="group" aria-label="Submission mode" className="grid grid-cols-2 gap-1 rounded-md bg-sunken p-0.5 ring-1 ring-inset ring-line">
      {opts.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-[5px] text-[13px] font-medium transition-colors [&_svg]:size-4",
              active ? "bg-raised text-ink ring-1 ring-inset ring-line-strong" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

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
  const { showToast, confirm } = useNotification();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [userTeams, setUserTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [previousSubmissions, setPreviousSubmissions] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [evaluatingStep, setEvaluatingStep] = useState<string>("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [pendingSubmissionId, setPendingSubmissionId] = useState<string | null>(null);
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<string | null>(null);

  // Scoring Guide Modal State
  const [showScoringGuideModal, setShowScoringGuideModal] = useState(false);
  const [showInviteTeammatesModal, setShowInviteTeammatesModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authNextUrl, setAuthNextUrl] = useState<string>("/challenges");
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
        } else {
          console.error("Failed to load challenge details: HTTP", res.status);
        }

        if (session?.access_token) {
          const subRes = await fetch(`/api/challenges/${encodeURIComponent(slug)}/submissions`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (subRes.ok) {
            const subData = await subRes.json();
            setPreviousSubmissions(subData.submissions || []);
          } else {
            console.error("Failed to load challenge submissions: HTTP", subRes.status);
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

  // 2-Hour TTL for draft restoration (7,200,000 ms)
  const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

  // Restore prefilled presentation link & draft values after sign-in / redirect
  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const urlPrefill = urlParams.get("prefill_link") || urlParams.get("link");
    const urlTimestamp = urlParams.get("ts");
    const urlGithub = urlParams.get("github_url");
    const urlDemo = urlParams.get("demo_url");
    const urlMode = urlParams.get("mode");

    const now = Date.now();

    // 1. Check URL param freshness
    let isUrlFresh = false;
    if (urlPrefill) {
      if (urlTimestamp) {
        const parsedTs = Number(urlTimestamp);
        isUrlFresh = !isNaN(parsedTs) && now - parsedTs < DRAFT_TTL_MS;
      } else {
        isUrlFresh = true;
      }
    }

    // 2. Check sessionStorage draft freshness
    let draft: any = null;
    let isDraftFresh = false;
    try {
      const raw = sessionStorage.getItem("hackermate_challenge_draft");
      if (raw) {
        draft = JSON.parse(raw);
        const savedAt = Number(draft?.savedAt);
        if (!isNaN(savedAt) && now - savedAt < DRAFT_TTL_MS) {
          isDraftFresh = true;
        } else {
          // Stale draft: evict immediately
          sessionStorage.removeItem("hackermate_challenge_draft");
          draft = null;
        }
      }
    } catch (err) {
      console.warn("[Challenges] Error reading sessionStorage draft:", err);
    }

    // 3. Determine effective restore values (ensure match with current challenge slug)
    const effectiveLink =
      (isUrlFresh && urlPrefill) ||
      (isDraftFresh && draft?.slug === slug ? draft.externalLink : "");
    const effectiveGithub =
      (isUrlFresh && urlGithub) ||
      (isDraftFresh && draft?.slug === slug ? draft.githubUrl : "");
    const effectiveDemo =
      (isUrlFresh && urlDemo) ||
      (isDraftFresh && draft?.slug === slug ? draft.demoUrl : "");
    const effectiveMode =
      (isUrlFresh && urlMode) ||
      (isDraftFresh && draft?.slug === slug ? draft.submissionMode : "");

    if (effectiveLink) {
      setExternalLink(effectiveLink);
      if (effectiveGithub) setGithubUrl(effectiveGithub);
      if (effectiveDemo) setDemoUrl(effectiveDemo);
      if (effectiveMode === "team" || effectiveMode === "solo") {
        setSubmissionMode(effectiveMode);
      }

      showToast("Welcome back! Your presentation link has been restored and is ready for AI evaluation.", "success");

      // Smooth scroll to submission form
      setTimeout(() => {
        const el = document.getElementById("submission-form");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 350);

      // Clean URL parameters from browser address bar
      if (urlPrefill || urlTimestamp || urlGithub || urlDemo || urlMode) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } else if (urlPrefill && !isUrlFresh) {
      // Stale URL param: clean up address bar without restoring
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [slug, showToast]);

  function handleDeleteSubmission(e: React.MouseEvent, subId: string, version: number) {
    e.preventDefault();
    e.stopPropagation();

    confirm({
      title: "DELETE SUBMISSION",
      message: `Are you sure you want to delete Version ${version}? This will permanently remove its evaluation score, feedback, and diagnostic history.`,
      confirmText: "Delete Version",
      onConfirm: async () => {
        setDeletingSubmissionId(subId);
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          const headers: Record<string, string> = {};
          if (session?.access_token) {
            headers["Authorization"] = `Bearer ${session.access_token}`;
          }

          const res = await fetch(`/api/challenges/${encodeURIComponent(slug)}/submissions/${subId}`, {
            method: "DELETE",
            headers,
          });

          const data = await res.json();
          if (res.ok && data.success) {
            showToast(`Version ${version} deleted successfully.`, "success");
            setPreviousSubmissions((prev) => prev.filter((s) => s.id !== subId));
          } else {
            showToast(data.error || "Failed to delete submission.", "error");
          }
        } catch (err: any) {
          showToast(err.message || "Failed to delete submission.", "error");
        } finally {
          setDeletingSubmissionId(null);
        }
      },
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      if (!externalLink.trim()) {
        setErrorMsg("Please provide your Google Slides or Google Drive presentation link.");
        return;
      }

      const now = Date.now();
      const draft = {
        slug,
        externalLink: externalLink.trim(),
        githubUrl: githubUrl.trim(),
        demoUrl: demoUrl.trim(),
        submissionMode,
        savedAt: now,
      };

      try {
        sessionStorage.setItem("hackermate_challenge_draft", JSON.stringify(draft));
      } catch (err) {
        console.warn("[Challenges] Could not save draft to sessionStorage:", err);
      }

      const queryParams = new URLSearchParams();
      queryParams.set("prefill_link", externalLink.trim());
      queryParams.set("ts", String(now));
      if (githubUrl.trim()) queryParams.set("github_url", githubUrl.trim());
      if (demoUrl.trim()) queryParams.set("demo_url", demoUrl.trim());
      if (submissionMode) queryParams.set("mode", submissionMode);

      const targetPath = `/challenges/${encodeURIComponent(slug)}?${queryParams.toString()}`;
      setAuthNextUrl(targetPath);
      setShowAuthModal(true);
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
        try {
          sessionStorage.removeItem("hackermate_challenge_draft");
        } catch {}
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
      <Page>
        <PageLoader label="Loading challenge" />
      </Page>
    );
  }

  if (!challenge) {
    return (
      <Page width="narrow">
        <div className="pt-10">
          <EmptyState
            icon={<TriangleAlert />}
            title="Challenge not found"
            body="It may have been archived, or the link is wrong."
            action={
              <ButtonLink href="/challenges" icon={<ArrowLeft />}>
                Back to practice
              </ButtonLink>
            }
          />
        </div>
      </Page>
    );
  }

  const themePrefix = "ReactionTheme:";
  const participantConstraints = challenge.constraints.filter((c) => !c.startsWith(themePrefix));
  const themeEntries = challenge.constraints.filter((c) => c.startsWith(themePrefix));
  const reactionTheme = themeEntries[0]?.slice(themePrefix.length) ?? "default";

  // Presentational: same deadline expression the page has always used.
  const isDeadlinePassed = isSubmissionWindowClosed(challenge.ends_at, challenge.status);
  const timeline = eventTimeline(challenge.starts_at, challenge.ends_at);

  return (
    <Page>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Link href="/challenges" className="inline-flex items-center gap-1 hover:text-ink">
              <ArrowLeft className="size-3" aria-hidden />
              Practice
            </Link>
            <span aria-hidden>/</span>
            <span className="tabular">#{challenge.challenge_number}</span>
          </span>
        }
        title={challenge.title}
        meta={
          <span className="flex flex-wrap items-center gap-1.5">
            <Tape>{challenge.track}</Tape>
            <Tape tone={difficultyTone(challenge.difficulty)}>{challenge.difficulty}</Tape>
            {isDeadlinePassed ? (
              <Tape tone="bad" icon={<Clock />}>Closed</Tape>
            ) : (
              <Tape tone="ok" dot>Open</Tape>
            )}
            {!isDeadlinePassed && (
              <span className={cn("ml-1 font-mono text-[12px] tabular", timeline.urgent ? "text-warn" : "text-ink-3")}>
                {timeline.label}
              </span>
            )}
          </span>
        }
        actions={
          <>
            {challenge.problem_pdf_url && (
              <a
                href={challenge.problem_pdf_url}
                target="_blank"
                rel="noreferrer"
                className={buttonClass("secondary", "md")}
              >
                <FileText />
                Problem PDF
              </a>
            )}
            <Button icon={<Target />} onClick={() => setShowScoringGuideModal(true)}>
              Scoring guide
            </Button>
          </>
        }
      />

      <div className="mt-2 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Brief */}
        <div className="min-w-0 space-y-8">
          {challenge.summary && (
            <p className="max-w-prose border-l-2 border-line-strong pl-3 text-[14.5px] leading-relaxed text-ink-2">
              {challenge.summary}
            </p>
          )}

          <Section title="Brief" id="brief">
            <MarkdownRenderer content={challenge.problem_statement} />
          </Section>

          {challenge.additional_rules && (
            <Section title="Challenge rules" description="The AI review grades your deck against these rules too.">
              <Panel className="p-4">
                <MarkdownRenderer content={challenge.additional_rules} />
              </Panel>
            </Section>
          )}

          {participantConstraints.length > 0 && (
            <Section title="Constraints" count={participantConstraints.length}>
              <ul className="divide-y divide-line border-y border-line">
                {participantConstraints.map((c, i) => (
                  <li key={i} className="flex gap-3 py-2.5 text-[13.5px] text-ink-2">
                    <span className="w-5 shrink-0 font-mono text-[12px] text-ink-3 tabular">{i + 1}</span>
                    <span className="min-w-0 break-words">{c}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section
            title="6-slide structure"
            count="100 pts"
            action={
              <Button variant="ghost" size="sm" iconRight={<ArrowRight />} onClick={() => setShowScoringGuideModal(true)}>
                How it&apos;s scored
              </Button>
            }
          >
            <ol className="divide-y divide-line border-y border-line">
              {SLIDE_STRUCTURE.map((slide) => (
                <li key={slide.num} className="flex items-center gap-3 py-2.5">
                  <span className="w-5 shrink-0 font-mono text-[12.5px] text-ink-3 tabular">{slide.num}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-ink">{slide.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">{slide.desc}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[12px] text-ink-2 tabular">{slide.pts} pts</span>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        {/* Submission panel */}
        <aside className="min-w-0 space-y-8 lg:sticky lg:top-6 lg:self-start">
          <Panel as="section" className="scroll-mt-6">
            <div id="submission-form" className="p-4 md:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-[14px] font-semibold text-ink">Submit your deck</h2>
                <Tape>6 slides max</Tape>
              </div>

              <PresentationErrorAlert
                error={errorMsg}
                onDismiss={() => setErrorMsg(null)}
                targetUrl={externalLink}
                onSwitchToUpload={() => {
                  setInputMode("upload");
                  setErrorMsg(null);
                }}
                className="mb-4"
              />

              {(() => {
                if (isDeadlinePassed) {
                  return (
                    <EmptyState
                      compact
                      icon={<Clock />}
                      title="Submissions closed"
                      body={
                        <>
                          Challenge #{challenge.challenge_number} closed on{" "}
                          <span className="font-medium text-ink-2">
                            {new Date(challenge.ends_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          . New submissions aren&apos;t accepted for this round.
                        </>
                      }
                      action={
                        <ButtonLink href="/challenges" size="md" iconRight={<ArrowRight />}>
                          Browse challenges
                        </ButtonLink>
                      }
                    />
                  );
                }

                if (isSubmitting) {
                  return (
                    <div className="flex flex-col items-center gap-3 py-10 text-center" aria-live="polite">
                      <Spinner className="size-6 text-accent-ink" label="Scoring your deck" />
                      <h3 className="text-[14px] font-semibold text-ink">Scoring your deck</h3>
                      <p className="max-w-xs text-[12.5px] leading-relaxed text-ink-3">{evaluatingStep}</p>
                    </div>
                  );
                }

                return (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <FieldLabel>Submitting as</FieldLabel>
                      <ModeToggle value={submissionMode} onChange={setSubmissionMode} />
                    </div>

                    {submissionMode === "team" && (
                      <div>
                        <FieldLabel
                          htmlFor="challenge-team"
                          hint={
                            <button
                              type="button"
                              onClick={() => setShowInviteTeammatesModal(true)}
                              className="font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
                            >
                              Invite teammates
                            </button>
                          }
                        >
                          Team
                        </FieldLabel>
                        {userTeams.length > 0 ? (
                          <Select
                            id="challenge-team"
                            value={selectedTeamId}
                            onChange={(e) => setSelectedTeamId(e.target.value)}
                            className="h-9"
                          >
                            {userTeams.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <EmptyState
                            compact
                            title="No team yet"
                            body="Create a team or invite people to practice with you."
                            action={
                              <>
                                <ButtonLink href="/teams" size="sm">
                                  Create team
                                </ButtonLink>
                                <Button size="sm" variant="ghost" icon={<Share2 />} onClick={() => setShowInviteTeammatesModal(true)}>
                                  Invite via WhatsApp
                                </Button>
                              </>
                            }
                          />
                        )}
                      </div>
                    )}

                    <div>
                      <FieldLabel htmlFor="challenge-deck-link" hint="Public link">
                        Google Slides / Drive link *
                      </FieldLabel>
                      <Input
                        id="challenge-deck-link"
                        type="url"
                        required
                        leading={<LinkIcon />}
                        placeholder="https://docs.google.com/presentation/d/..."
                        value={externalLink}
                        onChange={(e) => setExternalLink(e.target.value)}
                        className="h-9 font-mono text-[12.5px]"
                      />
                      <p className="mt-1.5 text-[12px] text-ink-3">Set sharing to &ldquo;Anyone with the link can view&rdquo;.</p>
                    </div>

                    <div>
                      <FieldLabel htmlFor="challenge-github" hint="Optional">
                        GitHub repository
                      </FieldLabel>
                      <Input
                        id="challenge-github"
                        type="url"
                        leading={<Code2 />}
                        placeholder="https://github.com/username/project"
                        value={githubUrl}
                        onChange={(e) => setGithubUrl(e.target.value)}
                        className="h-9 font-mono text-[12.5px]"
                      />
                      <p className="mt-1.5 text-[12px] text-ink-3">Used to check your architecture claims.</p>
                    </div>

                    <div>
                      <FieldLabel htmlFor="challenge-demo" hint="Optional">
                        Live demo / prototype
                      </FieldLabel>
                      <Input
                        id="challenge-demo"
                        type="url"
                        leading={<PlayCircle />}
                        placeholder="https://demo.app or a Loom walkthrough"
                        value={demoUrl}
                        onChange={(e) => setDemoUrl(e.target.value)}
                        className="h-9 font-mono text-[12.5px]"
                      />
                    </div>

                    <Button type="submit" variant="primary" size="lg" className="w-full" icon={<Zap />} disabled={isSubmitting}>
                      Submit and score
                    </Button>
                    <button
                      type="button"
                      onClick={() => setShowScoringGuideModal(true)}
                      className="mx-auto flex min-h-9 items-center gap-1.5 text-[12.5px] font-medium text-ink-3 hover:text-ink"
                    >
                      <Target className="size-3.5" aria-hidden />
                      How to score 100/100
                    </button>
                  </form>
                );
              })()}
            </div>
          </Panel>

          {/* Version history */}
          {previousSubmissions.length > 0 && (
            <Section title="Your versions" count={previousSubmissions.length}>
              <ul className="divide-y divide-line border-y border-line">
                {previousSubmissions.map((sub) => (
                  <li key={sub.id} className="flex items-center gap-1">
                    <Link
                      href={`/challenges/${slug}/submissions/${sub.id}`}
                      className="group -ml-2 flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-hover"
                    >
                      <span className="w-7 shrink-0 font-mono text-[12.5px] font-semibold text-ink tabular">v{sub.version}</span>
                      <div className="min-w-0 flex-1">
                        <Tape tone={sub.submission_mode === "team" ? "info" : "neutral"}>{sub.submission_mode}</Tape>
                        <p className="mt-1 truncate font-mono text-[11.5px] text-ink-3">
                          {new Date(sub.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-display text-[16px] font-semibold leading-none text-ink tabular">
                          {sub.total_score}
                          <span className="text-[11px] font-normal text-ink-3">/100</span>
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-ink-3">{sub.grade}</p>
                      </div>
                      <ArrowRight className="size-3.5 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
                    </Link>

                    <IconButton
                      label={`Delete version ${sub.version}`}
                      onClick={(e) => handleDeleteSubmission(e, sub.id, sub.version)}
                      disabled={deletingSubmissionId === sub.id}
                      className="hover:bg-bad-soft hover:text-bad disabled:opacity-60"
                    >
                      {deletingSubmissionId === sub.id ? <Spinner label="Deleting" /> : <Trash2 />}
                    </IconButton>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </aside>
      </div>

      {/* Scoring guide */}
      <Dialog
        open={showScoringGuideModal}
        onClose={() => setShowScoringGuideModal(false)}
        size="lg"
        title="How decks are scored"
        description="Four pillars, 100 points. What the AI review rewards and what it deducts."
        footer={
          <Button variant="primary" onClick={() => setShowScoringGuideModal(false)}>
            Got it
          </Button>
        }
      >
        <Segmented
          label="Scoring guide view"
          size="sm"
          value={scoringTab}
          onChange={setScoringTab}
          options={[
            { value: "rubric", label: "4 pillars" },
            { value: "checklist", label: "Checklist" },
            { value: "deductions", label: "Deductions" },
          ]}
        />
        <div className="mt-4">
          <ScoringGuideBody tab={scoringTab} />
        </div>
        <p className="mt-4 caps-label text-ink-3">AI evaluator v2.4 · fixed 6-slide structure</p>
      </Dialog>

      {/* Celebration overlay → redirects to the scored submission */}
      <TeamsEmojiCelebration
        active={showCelebration}
        theme={reactionTheme}
        message="Your deck has been scored. Loading your feedback…"
        onComplete={() => {
          if (pendingSubmissionId) {
            router.push(`/challenges/${slug}/submissions/${pendingSubmissionId}`);
          }
        }}
      />

      {/* Invite teammates (WhatsApp + in-app) */}
      <Dialog
        open={showInviteTeammatesModal}
        onClose={() => setShowInviteTeammatesModal(false)}
        title="Invite teammates"
        description="Build the 6-slide deck together."
        footer={
          <Button onClick={() => setShowInviteTeammatesModal(false)}>Close</Button>
        }
      >
        <div className="space-y-5">
          <div>
            <p className="text-[13.5px] font-semibold text-ink">Share on WhatsApp</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
              Send the challenge link to your group so friends not on HackerMate can join in.
            </p>
            <Button
              className="mt-2.5 w-full"
              icon={<MessageCircle />}
              onClick={() => {
                if (typeof window !== "undefined" && challenge) {
                  const text = encodeURIComponent(
                    `Hey! 👋 I'm practicing for our upcoming hackathon on HackerMate for Challenge #${challenge.challenge_number}: "${challenge.title}".\n\nJoin my practice squad and review our 6-slide deck here:\n${window.location.href}`
                  );
                  window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
                }
              }}
            >
              Share on WhatsApp
            </Button>
          </div>

          <div>
            <FieldLabel htmlFor="challenge-share-link">Challenge link</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="challenge-share-link"
                type="text"
                readOnly
                value={typeof window !== "undefined" ? window.location.href : ""}
                className="h-9 min-w-0 select-all font-mono text-[12px]"
              />
              <Button
                className="h-9 shrink-0"
                icon={copiedLink ? <Check /> : <Copy />}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    navigator.clipboard.writeText(window.location.href);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }
                }}
              >
                {copiedLink ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-ink">Invite HackerMate builders</p>
              <p className="mt-0.5 text-[12.5px] text-ink-3">Manage your roster or find developers on the platform.</p>
            </div>
            <ButtonLink href="/teams" size="md" iconRight={<ArrowRight />} className="shrink-0">
              Your teams
            </ButtonLink>
          </div>
        </div>
      </Dialog>

      {/* Auth Modal for Unregistered / Anonymous Submissions */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title="Sign In to Submit Solution"
        subtitle="Connect with Google or GitHub in 1 tap to submit your deck and run the AI evaluation cascade."
        nextUrl={authNextUrl}
      />
    </Page>
  );
}
