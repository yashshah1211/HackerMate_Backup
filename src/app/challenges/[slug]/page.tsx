"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { challengeIdentity, isParticipantConstraint } from "@/lib/challenges/challengeEvaluationContract";
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
import { TeamsEmojiCelebration } from "@/components/challenges/TeamsEmojiCelebration";
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
import { logDatabaseFailure } from "@/lib/evaluator/evaluationContract";

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

const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
const SLIDE_STRUCTURE = [
  { num: 1, title: "Problem framing", pts: 25, desc: "Problem evidence, intended users and value" },
  { num: 2, title: "Solution innovation", pts: 25, desc: "Problem fit and justified differentiation" },
  { num: 3, title: "Technical architecture", pts: 30, desc: "The actual proposed system and its data flow" },
  { num: 4, title: "Feasibility and impact", pts: 20, desc: "Risks, measurement, impact and execution" },
];

const GUIDE_PILLARS = [
  {
    n: 1,
    title: "Problem framing & target personas",
    slides: "Problem topic",
    max: 25,
    intro: "The AI checks whether you understand the root pain point beyond surface symptoms.",
    full: [
      "Identify relevant users and support the problem with evidence.",
      'Include quantified baseline friction (e.g. "45 min triage delay").',
      "Articulate the cost of inaction clearly.",
    ],
    penalty: "Evidence to review",
    penaltyText: "Generic problem statements with zero target persona definition or no measurable baseline numbers.",
  },
  {
    n: 2,
    title: "Solution design & innovation moat",
    slides: "Solution topic",
    max: 25,
    intro: "Explain useful differentiation for the stated problem. The evaluator assesses supplied claims, not independent verification.",
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
    slides: "Architecture topic · 30 points",
    max: 30,
    intro: "This is the highest-weight category. Explain your actual system and data flow in text; diagrams are not visually validated.",
    full: [
      "Explain the data flow appropriate to your proposed system; queues and databases are optional.",
      "Specify database choices, latency budgets, and security/auth layers.",
      "Provide a clear architecture block diagram.",
    ],
    penalty: "Evidence to review",
    penaltyText: 'Listing logo buzzwords ("React, Node, Mongo, AI") without an actual data flow pipeline.',
  },
  {
    n: 4,
    title: "Feasibility, edge cases & roadmap",
    slides: "Risks, impact and execution topics",
    max: 20,
    intro: "The AI checks real-world resilience, ROI quantification, and team execution readiness.",
    full: [
      "Explain relevant failure cases and mitigations; no fixed number is required.",
      "Include baseline vs projected ROI metrics in Slide 5.",
      "Provide sprint-by-sprint milestones and team roles in Slide 6.",
    ],
    penalty: "Evidence to review",
    penaltyText: 'Ignoring system fail-safes (e.g. network dropout) or vague "launch soon" roadmaps.',
  },
];

const GUIDE_CHECKLIST = [
  { slide: "Slide 1", title: "Problem Framing", check: "Explain relevant users and distinguish measured evidence from proposed targets." },
  { slide: "Slide 2", title: "Solution & Moat", check: "Clear architectural value moat beyond existing commercial tools." },
  { slide: "Slide 3", title: "Architecture & Data Pipeline", check: "Explain your actual system data flow; particular databases or queues are optional." },
  { slide: "Slide 4", title: "Feasibility & Risks", check: "Explain relevant failure cases and mitigations." },
  { slide: "Slide 5", title: "Impact & ROI", check: "Quantified baseline vs post-implementation target metrics." },
  { slide: "Slide 6", title: "Roadmap & Roles", check: "Sprint milestones with explicit owner roles and deliverables." },
];

const GUIDE_DEDUCTIONS = [
  { pts: "Review evidence", title: "Missing End-to-End Data Pipeline (Slide 3)", body: "Occurs when tech stack is merely a list of logos without an explicit data flow architecture." },
  { pts: "Review evidence", title: "No Innovation Moat / Generic API Wrapper (Slide 2)", body: "Occurs when the solution is a thin layer over ChatGPT without proprietary domain logic." },
  { pts: "Review evidence", title: "Generic Problem Statement (Slide 1)", body: "Occurs when problem lacks specific target user personas and baseline friction numbers." },
  { pts: "Review evidence", title: "Ignoring Edge Cases & Fail-Safes (Slide 4)", body: "Occurs when failure scenarios (network offline, API timeout, bad input) have no mitigation." },
  { pts: "Review evidence", title: "Missing Metrics / Vague Roadmap (Slides 5 & 6)", body: "Occurs when impact metrics have no baseline comparison or roadmap has no role ownership." },
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
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const [, setInputMode] = useState<"upload" | "link">("upload");
  const [, setFile] = useState<File | null>(null);
  const [externalLink, setExternalLink] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);


  const generation = useRef(0);
  const actor = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const retryToken = useRef<{ fingerprint: string; token: string } | null>(null);
  const [accountRevision, setAccountRevision] = useState(0);
  const [hasRetryToken, setHasRetryToken] = useState(false);

  useEffect(() => {
    let disposed = false;
    const invalidate = (id: string | null) => {
      if (disposed || id === actor.current) return;
      const hadAccount = !!actor.current;
      actor.current = id; generation.current++; controller.current?.abort();
      submitting.current = false; retryToken.current = null; setHasRetryToken(false);
      setIsSubmitting(false); setShowCelebration(false); setPendingSubmissionId(null); setPreviousSubmissions([]); setUserTeams([]); setSelectedTeamId(""); setErrorMsg(null);
      if (hadAccount) { setExternalLink(""); setGithubUrl(""); setDemoUrl(""); setFile(null); sessionStorage.removeItem("hackermate_challenge_draft"); }
      setAccountRevision(value => value + 1);
    };
    const initial = generation.current;
    void supabase.auth.getSession().then(({ data, error }) => { if (!disposed && initial === generation.current) { if (error) logDatabaseFailure("challenge_client_session", error); invalidate(error ? null : data.session?.user?.id || null); } }).catch(error => { if (!disposed && initial === generation.current) { logDatabaseFailure("challenge_client_session", error); setErrorMsg("Identity verification is unavailable. Reload before submitting."); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => invalidate(session?.user?.id || null));
    const dispose = () => { generation.current++; controller.current?.abort(); };
    return () => { disposed = true; dispose(); subscription.unsubscribe(); };
  }, [slug]);

  useEffect(() => {
    const epoch = generation.current;
    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    async function loadChallengeData() {
      setLoading(true); setChallenge(null); setLoadError(null); setPreviousSubmissions([]);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (epoch !== generation.current || requestController.signal.aborted) return;

        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }

        const res = await fetch(`/api/challenges/${encodeURIComponent(slug)}`, { headers, signal: requestController.signal });
        if (epoch !== generation.current || requestController.signal.aborted) return;
        if (res.ok) {
          const data = await res.json();
          if (epoch !== generation.current || requestController.signal.aborted) return;
          const identity = challengeIdentity(slug);
          if (!data.challenge || (![identity.slug, identity.normalized].includes(data.challenge.slug) && (!identity.id || data.challenge.id !== identity.id))) { setLoadError("The challenge response did not match this link. Please reload."); return; }
          setChallenge(data.challenge);
          setUserTeams(data.userTeams || []);
          if (data.userTeams?.length > 0) {
            setSelectedTeamId(data.userTeams[0].id);
          }
        } else {
          console.error("Failed to load challenge details: HTTP", res.status);
          if (res.status !== 404) setLoadError("Challenge data is temporarily unavailable. Please reload to retry.");
          return;
        }

        if (session?.access_token) {
          const subRes = await fetch(`/api/challenges/${encodeURIComponent(slug)}/submissions`, {
            signal: requestController.signal,
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (subRes.ok) {
            const subData = await subRes.json();
            if (epoch !== generation.current || requestController.signal.aborted) return;
            setPreviousSubmissions(subData.submissions || []);
          } else {
            console.error("Failed to load challenge submissions: HTTP", subRes.status);
            if (epoch === generation.current && !requestController.signal.aborted) setErrorMsg("Submission history could not be loaded. Reload before submitting again.");
          }
        }
      } catch (err) {
        logDatabaseFailure("challenge_client_load", err);
        if (epoch === generation.current && !requestController.signal.aborted) setLoadError("Challenge data is temporarily unavailable. Please reload to retry.");
      } finally {
        if (epoch === generation.current && !requestController.signal.aborted) setLoading(false);
      }
    }

    loadChallengeData();
    return () => requestController.abort();
  }, [slug, accountRevision]);

  // 2-Hour TTL for draft restoration (7,200,000 ms)


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
    let draft: { slug?: string; externalLink?: string; githubUrl?: string; demoUrl?: string; submissionMode?: string; savedAt?: number } | null = null;
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

    const epoch = generation.current;
    queueMicrotask(() => {
      if (epoch !== generation.current) return;
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
    });
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
        } catch (err: unknown) {
          logDatabaseFailure("challenge_delete", err); showToast("Delete outcome unconfirmed. Refresh history.", "error");
        } finally {
          setDeletingSubmissionId(null);
        }
      },
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    const epoch = generation.current;
    submitting.current = true;
    setErrorMsg(null);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (epoch !== generation.current) return;
      if (error) { logDatabaseFailure("challenge_client_session", error); setErrorMsg("Session verification is unavailable. Your draft remains here."); return; }
      if (!externalLink.trim()) { setErrorMsg("Please provide a Google Slides or Drive presentation link."); return; }
      if (!session) {
        const now = Date.now();
        try { sessionStorage.setItem("hackermate_challenge_draft", JSON.stringify({ slug, externalLink: externalLink.trim(), githubUrl: githubUrl.trim(), demoUrl: demoUrl.trim(), submissionMode, savedAt: now })); }
        catch { console.error("[Challenges] Draft storage unavailable"); }
        const query = new URLSearchParams({ prefill_link: externalLink.trim(), ts: String(now), mode: submissionMode });
        if (githubUrl.trim()) query.set("github_url", githubUrl.trim());
        if (demoUrl.trim()) query.set("demo_url", demoUrl.trim());
        setAuthNextUrl(`/challenges/${encodeURIComponent(slug)}?${query}`); setShowAuthModal(true); return;
      }
      if (session.user.id !== actor.current) { setErrorMsg("Account changed. Review the current draft before submitting."); return; }
      if (submissionMode === "team" && !selectedTeamId) { setErrorMsg("Select a team or switch to Solo."); return; }
      setIsSubmitting(true);
      setEvaluatingStep("Waiting for a confirmed text-only AI evaluation. Visuals are not validated.");
      const fingerprint = JSON.stringify({ slug, externalLink: externalLink.trim(), submissionMode, selectedTeamId: submissionMode === "team" ? selectedTeamId : null, githubUrl, demoUrl });
      if (retryToken.current?.fingerprint !== fingerprint) retryToken.current = { fingerprint, token: crypto.randomUUID() };
      setHasRetryToken(true);
      const form = new FormData();
      form.append("external_link_url", externalLink.trim()); form.append("submission_mode", submissionMode);
      if (submissionMode === "team") form.append("team_id", selectedTeamId);
      if (githubUrl.trim()) form.append("github_url", githubUrl.trim());
      if (demoUrl.trim()) form.append("demo_url", demoUrl.trim());
      const res = await fetch(`/api/challenges/${encodeURIComponent(slug)}/evaluate`, { method: "POST", signal: controller.current?.signal,
        headers: { Authorization: `Bearer ${session.access_token}`, "Idempotency-Key": retryToken.current!.token }, body: form });
      const data = await res.json();
      if (epoch !== generation.current) return;
      if (!res.ok || data.success !== true || data.submission?.status !== "completed" || data.submission?.challenge_id !== challenge?.id || typeof data.submission?.id !== "string") {
        setErrorMsg(data.code === "unauthorized" ? "Session verification failed. Reload and authenticate before submitting." : data.code === "forbidden" ? "This submission is not authorized or the challenge window is closed." : typeof data.error === "string" ? data.error : "No completed scorecard was confirmed. Review submission history before retrying.");
        if (["invalid_input", "upload_too_large", "invalid_ai_output", "blocked_content", "provider_rejected", "unusable_text"].includes(data.code)) { retryToken.current = null; setHasRetryToken(false); }
        return;
      }
      retryToken.current = null; setHasRetryToken(false);
      try { sessionStorage.removeItem("hackermate_challenge_draft"); } catch { console.error("[Challenges] Draft storage unavailable"); }
      setPendingSubmissionId(data.submission.id); setShowCelebration(true);
    } catch (error) {
      if (epoch !== generation.current) return;
      logDatabaseFailure("challenge_client_submission", error);
      setErrorMsg("The outcome could not be confirmed. Your draft remains here. Check submission history before starting another attempt.");
    } finally {
      if (epoch === generation.current) { submitting.current = false; setIsSubmitting(false); }
    }
  }
  if (loading) {
    return (
      <Page>
        <PageLoader label="Loading challenge" />
      </Page>
    );
  }

  if (loadError || !challenge) {
    return (
      <Page width="narrow">
        <div className="pt-10">
          <EmptyState
            icon={<TriangleAlert />}
            title={loadError ? "Challenge unavailable" : "Challenge not found"}
            body={loadError || "It may have been archived, or the link is wrong."}
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
  const participantConstraints = (challenge.constraints || []).filter(isParticipantConstraint);
  const themeEntries = (challenge.constraints || []).filter((c) => !isParticipantConstraint(c));
  const reactionTheme = themeEntries[0]?.trim().slice(themePrefix.length) ?? "default";

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
            title="Scoring rubric"
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
                <Tape>Text only · up to 60 pages</Tape>
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

              {hasRetryToken && !isSubmitting && <Button variant="ghost" size="sm" onClick={() => { retryToken.current = null; setHasRetryToken(false); setErrorMsg("Check previous submissions before proceeding. A new explicit attempt reserves another allowance; no earlier reservation is refunded."); }}>Start a new attempt after reviewing history</Button>}
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
                  <form onSubmit={handleSubmit} className="space-y-4"><fieldset disabled={isSubmitting} className="min-w-0 space-y-4">
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
                      <p className="mt-1.5 text-[12px] text-ink-3">Supplied link only; repository code is not inspected by this text-only evaluation.</p>
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
                      Review scoring criteria
                    </button>
                  </fieldset></form>
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
                        <p className="mt-1 truncate font-mono text-[12.5px] text-ink-3">
                          {new Date(sub.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-display text-[16px] font-semibold leading-none text-ink tabular">
                          {sub.total_score}
                          <span className="text-[12px] font-normal text-ink-3">/100</span>
                        </p>
                        <p className="mt-1 font-mono text-[12px] text-ink-3">{sub.grade}</p>
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
        description="Four categories, 100 points. Text-only feedback on supplied evidence; no fixed slide template or automatic point penalties."
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
          <p className="mb-3 text-[12px] text-ink-3">These are guidance topics, not required physical pages. Only the supplied challenge rules establish eligibility restrictions. Visual layout and repository/demo links are not inspected.</p>
          <ScoringGuideBody tab={scoringTab} />
        </div>
        <p className="mt-4 caps-label text-ink-3">Text-only AI evaluation · linked PDFs up to 8 MiB · direct API uploads up to 4,000,000 bytes · no numeric fallback</p>
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
        description="Build a text-readable deck together."
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
                    `Hey! 👋 I'm practicing for our upcoming hackathon on HackerMate for Challenge #${challenge.challenge_number}: "${challenge.title}".\n\nJoin my practice squad and review our practice deck here:\n${window.location.href}`
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
