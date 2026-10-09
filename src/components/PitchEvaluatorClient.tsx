"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  JudgingTrackId,
  TRACK_PROFILES,
  ProjectEvaluationResult,
} from "@/lib/evaluator/evaluatorTypes";
import { detectJudgingTrack } from "@/lib/evaluator/trackDetection";
import {
  Layers,
  Cpu,
  Target,
  CheckCircle2,
  TriangleAlert,
  ArrowRight,
  Share2,
  Copy,
  Users,
  Zap,
  Check,
  History,
  Trash2,
  FolderPlus,
  Lightbulb,
  Target,
  type LucideIcon,
} from "lucide-react";
import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorNotice,
  FieldLabel,
  IconButton,
  Input,
  Page,
  PageHeader,
  Panel,
  Progress,
  Section,
  Segmented,
  Select,
  Sheet,
  Spinner,
  Tape,
  Textarea,
  type TapeTone,
} from "@/components/system";
import { cn } from "@/lib/utils";

/* ---------- Presentation-only helpers (V2) ---------- */

/** Lucide icon per judging track (replaces the emoji in TRACK_PROFILES.icon). */
const TRACK_ICON: Record<JudgingTrackId, LucideIcon> = {
  web_dev: Layers,
  ai_genai: Cpu,
  generic: Lightbulb,
  specific: Target,
};

const TRACK_ORDER: JudgingTrackId[] = ["generic", "web_dev", "ai_genai", "specific"];

/** Grade strings from the engine end in an emoji; strip it for display only. */
function gradeLabel(grade: string | null | undefined): string {
  // Trophy, check mark, warning sign (+ variation selector), rotating light.
  return (grade || "").replace(/[\u{1F3C6}\u{2705}\u{26A0}\u{FE0F}\u{1F6A8}]/gu, "").trim();
}

function gradeTone(grade: string | null | undefined): TapeTone {
  const g = (grade || "").toLowerCase();
  if (g.startsWith("top tier")) return "ok";
  if (g.startsWith("strong")) return "accent";
  if (g.startsWith("needs")) return "warn";
  if (g.startsWith("high risk")) return "bad";
  return "neutral";
}

type RubricKey = "novelty" | "tech" | "uiUxOrFeasibility" | "impactOrTeam";
const RUBRIC_KEYS: RubricKey[] = ["novelty", "tech", "uiUxOrFeasibility", "impactOrTeam"];

/** One rubric row: label | score, with a thin bar underneath. */
function RubricRow({ label, score, max }: { label: string; score?: number; max: number }) {
  const pct = typeof score === "number" && max > 0 ? (score / max) * 100 : 0;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 py-2.5">
      <span className="min-w-0 text-[13px] text-ink-2">{label}</span>
      <span className="font-mono text-[12.5px] text-ink-3 tabular">
        {typeof score === "number" ? <span className="font-semibold text-ink">{score}</span> : null}
        {typeof score === "number" ? " / " : "max "}
        {max}
      </span>
      {typeof score === "number" && <Progress value={pct} tone={pct < 50 ? "warn" : "accent"} className="col-span-2" />}
    </li>
  );
}

interface PitchEvaluatorClientProps {
  initialTrack?: JudgingTrackId;
}

export default function PitchEvaluatorClient({
  initialTrack = "web_dev",
}: PitchEvaluatorClientProps) {
  const searchParams = useSearchParams();
  const forceHeuristic = searchParams?.get("engine") === "heuristic";
  const [selectedTrack, setSelectedTrack] = useState<JudgingTrackId>(initialTrack);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [techStack, setTechStack] = useState("");
  const [architecture, setArchitecture] = useState("");
  const [customRubric, setCustomRubric] = useState("");

  // Logged-in user context & hackathon auto-detection
  const [user, setUser] = useState<any | null>(null);
  const [userTeams, setUserTeams] = useState<any[]>([]);
  const [allHackathons, setAllHackathons] = useState<any[]>([]);
  const [selectedHackathonId, setSelectedHackathonId] = useState<string>("");
  const [autoDetectedBadge, setAutoDetectedBadge] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [evaluatingStep, setEvaluatingStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ProjectEvaluationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"feedback" | "architecture" | "team">("feedback");

  // Post-evaluation Team Funnel State
  const [savedEvaluationId, setSavedEvaluationId] = useState<string | null>(null);
  const [selectedAttachTeamId, setSelectedAttachTeamId] = useState<string>("");
  const [isAttaching, setIsAttaching] = useState(false);
  const [attachedTeamName, setAttachedTeamName] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  // History Drawer State
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/evaluator/history", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setHistory(data.history || []);
      } else {
        console.error("[PitchEvaluatorClient] loadHistory failed:", res.status, data?.error);
      }
    } catch (err) {
      console.error("[PitchEvaluatorClient] loadHistory error:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setDeletingHistoryId(id);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/evaluator/history?id=${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (res.ok) {
        setHistory((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (err) {
      console.error("[PitchEvaluatorClient] deleteHistoryItem error:", err);
    } finally {
      setDeletingHistoryId(null);
    }
  };

  const handleSelectHistoryItem = (item: any) => {
    if (item.evaluation_result) {
      setResult(item.evaluation_result);
      if (item.id) setSavedEvaluationId(item.id);
      setAttachedTeamName(null);
      setAttachError(null);
      if (item.ps_title) setTitle(item.ps_title);
      if (item.track_id) setSelectedTrack(item.track_id as JudgingTrackId);
      setShowHistoryDrawer(false);
      setTimeout(() => {
        document.getElementById("evaluation-results")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  // Load user session, user teams, and platform hackathons
  useEffect(() => {
    async function loadUserAndHackathons() {
      const {
        data: { user: sessionUser },
      } = await supabase.auth.getUser();

      if (sessionUser) {
        setUser(sessionUser);
        loadHistory();

        // 1. Fetch user's teams & joined hackathons
        try {
          const { data: memberData, error: memberErr } = await supabase
            .from("team_members")
            .select("teams(id, name, description, team_hackathons(hackathons(id, name, description)))")
            .eq("user_id", sessionUser.id);
          if (memberErr) console.error("[PitchEvaluatorClient] team_members load failed:", memberErr);

          const formattedTeams = (memberData as any[])
            ?.map((d) => d.teams)
            .filter(Boolean) || [];
          setUserTeams(formattedTeams);
        } catch (err) {
          console.warn("Could not load user teams:", err);
        }

        // 2. Fetch all platform hackathons for dropdown (alphabetical A-Z)
        try {
          const { data: hackathonList, error: hackathonErr } = await supabase
            .from("hackathons")
            .select("id, name, description")
            .eq("archived", false)
            .order("name", { ascending: true });
          if (hackathonErr) console.error("[PitchEvaluatorClient] hackathons load failed:", hackathonErr);

          if (hackathonList) {
            setAllHackathons(hackathonList);
          }
        } catch (err) {
          console.warn("Could not load hackathons:", err);
        }
      }
    }

    loadUserAndHackathons();
  }, []);

  // Auto-detect track when a hackathon is selected
  const handleHackathonSelect = (hackathonId: string) => {
    setSelectedHackathonId(hackathonId);
    if (!hackathonId) {
      setAutoDetectedBadge(null);
      return;
    }

    // Look for hackathon in user teams first, then in platform list
    let targetHackathon: any = null;
    for (const t of userTeams) {
      const thList = t.team_hackathons || [];
      for (const th of thList) {
        if (th.hackathons && th.hackathons.id === hackathonId) {
          targetHackathon = th.hackathons;
          // Optionally prefill title & description from user's team if empty
          if (!title && t.name) setTitle(t.name);
          if (!description && t.description) setDescription(t.description);
          break;
        }
      }
      if (targetHackathon) break;
    }

    if (!targetHackathon) {
      targetHackathon = allHackathons.find((h) => h.id === hackathonId);
    }

    if (targetHackathon) {
      const detection = detectJudgingTrack({
        name: targetHackathon.name,
        tag: targetHackathon.tag,
        description: targetHackathon.description,
      });

      const detected = detection.detectedTrack;
      setSelectedTrack(detected);
      if (detection.isConfident) {
        setAutoDetectedBadge(`Auto-detected ${TRACK_PROFILES[detected].badge} for "${targetHackathon.name}"`);
      } else {
        setAutoDetectedBadge(`Defaulted to ${TRACK_PROFILES[detected].badge} for "${targetHackathon.name}" (Review track)`);
      }
    }
  };

  const currentProfile = TRACK_PROFILES[selectedTrack] || TRACK_PROFILES.web_dev;

  // Sample idea presets engineered for top-tier score demonstrations
  const loadSample = () => {
    if (selectedTrack === "web_dev") {
      setTitle("DevOrbit: High-Throughput Edge-Synchronized Developer Collaboration Suite");
      setDescription("Modern hackathon teams face 40% collaboration loss across fragmented tools. DevOrbit provides a unified workspace with sub-30ms CRDT state synchronization, integrated schema-to-mock API generation, and real-time multiplayer code review designed for 36-hour sprint environments.");
      setTechStack("Next.js 15 (App Router + Server Components), TypeScript 5.5, Tailwind CSS v4, PostgreSQL with Supabase RLS, Prisma ORM, Redis (Upstash) for sub-10ms ephemeral presence, Yjs CRDTs, Docker, Vercel Edge Middleware.");
      setArchitecture("Client connects via Yjs WebSockets to edge gateways with optimistic local state updates. Backend executes relational ACID transactions on PostgreSQL with row-level security (RLS) policies per team workspace. Database indexes applied on (team_id, updated_at). Sensitive endpoints protected by sliding-window Redis rate-limiting (100 req/min) and HMAC-signed webhook validation. Background export jobs queued asynchronously with BullMQ worker pools.");
    } else if (selectedTrack === "ai_genai") {
      setTitle("OmniAudit: Multi-Agent Regulatory & Compliance Verification Engine");
      setDescription("Enterprise legal and fintech audits require parsing 500+ page compliance binders with 0% tolerance for hallucinations. OmniAudit provides an end-to-end multi-agent verification system with hybrid semantic retrieval, deterministic citation hashes, and automated cross-encoder re-ranking achieving 98.4% retrieval precision.");
      setTechStack("Python 3.11, FastAPI, PyTorch, LlamaIndex, pgvector on PostgreSQL, BGE-M3 hybrid embeddings, Cohere ReRank v3, vLLM inference server, Next.js 15 dashboard, Docker.");
      setArchitecture("Documents ingested via hierarchical chunking (512 token chunks with 64 overlap + parent-document metadata). Retrieval fuses BM25 sparse search and dense vector cosine similarity via Reciprocal Rank Fusion (RRF). Queries pass through a cross-encoder re-ranker before entering a 3-stage agent loop (Researcher -> Drafter -> Auditor) in LangGraph. Ground-truth citation engine maps every paragraph to source SHA-256 hashes, rejecting responses with confidence < 0.92 to prevent hallucinations.");
    } else {
      setTitle("JalDrishti: IoT Acoustic Telemetry & Satellite GIS Water Pipeline Anomaly Detection");
      setDescription("Problem Statement ID 1729 (Ministry of Jal Shakti): Municipal water networks lose 38% of drinking water to undetected subterranean pipeline bursts. JalDrishti deploys non-invasive acoustic vibration telemetry paired with satellite GIS mapping to detect underground leaks within 15 meters in real-time.");
      setTechStack("ESP32 Acoustic Vibration Sensors (I2S MEMS), LoRaWAN Gateway, Next.js 15 Web Dashboard, Python FastAPI, TimescaleDB (Postgres time-series), XGBoost anomaly classifier, Mapbox GL JS.");
      setArchitecture("Slide 1: Problem Statement 1729 & Ministry alignment. Slide 2: Pipeline acoustic wave transient physics. Slide 3: Telemetry pipeline: ESP32 -> LoRaWAN -> MQTT Broker -> TimescaleDB -> FastAPI -> Next.js GIS UI. Slide 4: 36h bench execution roadmap with hardware bench-test and synthetic leak test rig. Slide 5: Quantified impact: 42M liters saved, ₹3.2 Cr annual municipal loss prevention, 85% reduction in repair response time. Slide 6: IEEE citations on pipe acoustic transients, Jal Jeevan Mission open dataset integration.");
    }
  };

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setErrorMsg("Please provide at least a project title and problem statement description.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    setSavedEvaluationId(null);
    setAttachedTeamName(null);
    setAttachError(null);

    // Simulated evaluation steps for animated UX
    setEvaluatingStep(1);
    const stepInterval = setInterval(() => {
      setEvaluatingStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 900);

    try {
      const res = await fetch("/api/evaluator/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          psTitle: title,
          solutionDescription: description,
          techStack,
          architectureDetails: architecture,
          trackId: selectedTrack,
          customRubric: selectedTrack === "specific" ? customRubric : undefined,
          hackathonId: selectedHackathonId || undefined,
          userId: user?.id,
          forceFallback: forceHeuristic,
        }),
      });

      clearInterval(stepInterval);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Evaluation failed. Please try again.");
      } else {
        setResult(data.result);
        if (data.savedEvaluationId) {
          setSavedEvaluationId(data.savedEvaluationId);
        }
        if (user) {
          loadHistory();
        }
        setTimeout(() => {
          document.getElementById("evaluation-results")?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    } catch (err: any) {
      clearInterval(stepInterval);
      setErrorMsg(err.message || "Network exception during evaluation.");
    } finally {
      setLoading(false);
      setEvaluatingStep(0);
    }
  };

  const handleBuildWithTeam = () => {
    if (!result) return;

    // Platform skills configured in CreateTeamForm (src/app/teams/create/page.tsx)
    const PLATFORM_SKILLS = [
      "React", "Next.js", "TypeScript", "JavaScript", "Node.js", "Express",
      "Python", "Java", "C++", "Flutter", "React Native", "AI/ML",
      "TensorFlow", "PyTorch", "Docker", "Kubernetes", "AWS", "Terraform",
      "Supabase", "PostgreSQL", "MongoDB", "UI/UX", "Figma", "DevOps"
    ];

    const PLATFORM_ROLES = [
      "Frontend Developer", "Backend Developer", "Full Stack Developer",
      "UI/UX Designer", "AI/ML Engineer", "Data Scientist", "Mobile Developer",
      "DevOps Engineer", "Cloud Engineer", "Product Manager", "Blockchain Developer"
    ];

    // Collect skills from user techStack input and evaluator recommended roles
    const allSuggestedSkills = result.recommendedRoles?.flatMap((r) => r.suggestedSkills || []) || [];
    const enteredSkills = techStack
      ? techStack.split(/[,+\/\n]/).map((s) => s.trim()).filter(Boolean)
      : [];

    const combinedRaw = [...allSuggestedSkills, ...enteredSkills];

    const matchedSkills = PLATFORM_SKILLS.filter((ps) =>
      combinedRaw.some(
        (raw) =>
          raw.toLowerCase() === ps.toLowerCase() ||
          raw.toLowerCase().includes(ps.toLowerCase()) ||
          ps.toLowerCase().includes(raw.toLowerCase())
      )
    );

    const matchedRoles = PLATFORM_ROLES.filter((pr) =>
      result.recommendedRoles?.some(
        (rr) =>
          rr.role.toLowerCase() === pr.toLowerCase() ||
          rr.role.toLowerCase().includes(pr.toLowerCase()) ||
          pr.toLowerCase().includes(rr.role.toLowerCase())
      )
    );

    const prefillPayload = {
      name: title.trim(),
      description: description.trim(),
      skills: matchedSkills,
      roles: matchedRoles,
      hackathonId: selectedHackathonId || undefined,
    };

    try {
      sessionStorage.setItem("hackermate_team_prefill", JSON.stringify(prefillPayload));
    } catch (e) {
      console.warn("Could not save team prefill to sessionStorage:", e);
    }

    // Opaque redirect URL: never leak confidential idea title, description, or stack in query params
    const opaquePrefillId = savedEvaluationId ? encodeURIComponent(savedEvaluationId) : "evaluator";
    const targetUrl = `/teams/create?prefill=${opaquePrefillId}`;

    if (user) {
      window.location.href = targetUrl;
    } else {
      window.location.href = `/login?next=${encodeURIComponent(targetUrl)}`;
    }
  };

  const handleAttachToTeam = async (targetTeamId: string) => {
    if (!targetTeamId) return;
    setIsAttaching(true);
    setAttachError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setAttachError("Please log in to attach this scorecard to a team workspace.");
        return;
      }

      if (!savedEvaluationId) {
        setAttachError("Evaluation record ID is not ready yet. Please re-run evaluation while signed in.");
        return;
      }

      const res = await fetch("/api/evaluator/history", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          evaluationId: savedEvaluationId,
          teamId: targetTeamId,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        setAttachError(resData.error || "Failed to attach evaluation to team.");
      } else {
        const teamObj = userTeams.find((t) => t.id === targetTeamId);
        setAttachedTeamName(resData.teamName || teamObj?.name || "Team");
      }
    } catch (err: any) {
      setAttachError(err.message || "Network error attaching to team.");
    } finally {
      setIsAttaching(false);
    }
  };

  const shareOnWhatsApp = () => {
    if (!result) return;
    const text = `🚀 My project "${title}" scored ${result.totalScore}/100 on the HackerMate Idea Evaluator (${result.grade})! Test your pitch & find teammates: https://www.hackermate.in/evaluator`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const copySummary = () => {
    if (!result) return;
    const summary = `📊 HackerMate Idea Evaluation: ${title}\nScore: ${result.totalScore}/100 (${result.grade})\nTrack: ${currentProfile.name}\n\nTop Strengths:\n${result.strengths.map((s) => `• ${s}`).join("\n")}\n\nKey Recommendations:\n${result.architectureSuggestions.map((a) => `• ${a}`).join("\n")}\n\nEvaluated at: https://www.hackermate.in/evaluator`;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Practice"
        title="Idea evaluator"
        meta="Score your idea against a track-specific judging rubric. See red flags, next steps and the roles you still need."
        actions={
          user ? (
            <Button variant="secondary" icon={<History aria-hidden />} onClick={() => setShowHistoryDrawer(true)}>
              History
              <span className="font-mono text-[12.5px] text-ink-3 tabular">{history.length}</span>
            </Button>
          ) : null
        }
      />

      <div className="mt-2 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------- Form ---------- */}
        <Panel as="section" className="min-w-0 p-4 md:p-5">
          <form onSubmit={handleEvaluate} className="space-y-5">
            {/* Hackathon selector (auto-track detection for logged-in users) */}
            {user && (userTeams.length > 0 || allHackathons.length > 0) && (
              <div>
                <FieldLabel htmlFor="ev-hackathon" hint="Optional">Hackathon</FieldLabel>
                <Select
                  id="ev-hackathon"
                  value={selectedHackathonId}
                  onChange={(e) => handleHackathonSelect(e.target.value)}
                >
                  <option value="">Choose a hackathon to auto-detect its track</option>
                  {userTeams.length > 0 && (
                    <optgroup label="Your team hackathons">
                      {userTeams.map((team) => {
                        const th = team.team_hackathons?.[0]?.hackathons;
                        if (!th) return null;
                        return (
                          <option key={`team-${th.id}`} value={th.id}>
                            {th.name} ({team.name})
                          </option>
                        );
                      })}
                    </optgroup>
                  )}
                  {allHackathons.length > 0 && (
                    <optgroup label="All hackathons">
                      {allHackathons.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
                {autoDetectedBadge && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-ink-3">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />
                    <span className="min-w-0">{autoDetectedBadge}</span>
                  </p>
                )}
              </div>
            )}

            {/* Track picker */}
            <fieldset>
              <legend className="mb-1.5 flex w-full items-center justify-between gap-2">
                <span className="caps-label text-ink-3">Judging track</span>
              </legend>
              <div role="radiogroup" aria-label="Judging track" className="divide-y divide-line overflow-hidden rounded-md border border-line">
                {TRACK_ORDER.map((trackKey) => {
                  const profile = TRACK_PROFILES[trackKey];
                  const isSelected = selectedTrack === trackKey;
                  const Icon = TRACK_ICON[trackKey];
                  return (
                    <button
                      key={trackKey}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => {
                        setSelectedTrack(trackKey);
                        setResult(null);
                      }}
                      className={cn(
                        "flex min-h-12 w-full items-start gap-3 px-3 py-2.5 text-left transition-colors",
                        isSelected ? "bg-selected" : "hover:bg-hover",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
                          isSelected ? "ring-accent-ink" : "ring-line-strong",
                        )}
                      >
                        {isSelected && <span className="size-2 rounded-full bg-accent" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Icon className={cn("size-4 shrink-0", isSelected ? "text-accent-ink" : "text-ink-3")} aria-hidden />
                          <span className="text-[13.5px] font-medium text-ink">{profile.name}</span>
                          <Tape tone={isSelected ? "accent" : "neutral"}>{profile.badge}</Tape>
                        </span>
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{profile.tagline}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[12.5px] text-ink-3">{currentProfile.description}</p>
            </fieldset>

            {selectedTrack === "specific" && (
              <div>
                <FieldLabel htmlFor="ev-rubric" hint="Required for Specific mode">Custom organizer rubric</FieldLabel>
                <Textarea
                  id="ev-rubric"
                  required
                  rows={4}
                  placeholder="Paste the hackathon's specific judging criteria, scoring rules, or focus areas here."
                  value={customRubric}
                  onChange={(e) => setCustomRubric(e.target.value)}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <span className="caps-label text-ink-3">Your idea</span>
              <Button variant="ghost" size="sm" icon={<Lightbulb aria-hidden />} onClick={loadSample} className="h-9 md:h-7">
                Load sample idea
              </Button>
            </div>

            <div>
              <FieldLabel htmlFor="ev-title" hint="Required">Project or pitch title</FieldLabel>
              <Input
                id="ev-title"
                type="text"
                required
                placeholder="e.g. Nexus: real-time collaboration workspace for dev teams"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-10 md:h-[34px]"
              />
            </div>

            <div>
              <FieldLabel htmlFor="ev-description" hint="Required">Problem and proposed solution</FieldLabel>
              <Textarea
                id="ev-description"
                required
                rows={4}
                placeholder="What problem are you solving, who is it for, and what makes your solution different?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel htmlFor="ev-stack">Tech stack</FieldLabel>
              <Textarea
                id="ev-stack"
                rows={2}
                placeholder="e.g. Next.js, TypeScript, PostgreSQL with Supabase RLS, Redis, Docker"
                value={techStack}
                onChange={(e) => setTechStack(e.target.value)}
                className="min-h-16"
              />
            </div>

            <div>
              <FieldLabel htmlFor="ev-architecture">Architecture and data flow</FieldLabel>
              <Textarea
                id="ev-architecture"
                rows={3}
                placeholder="How the pieces connect: request flow, API, database, caching / RAG / queues, response handling."
                value={architecture}
                onChange={(e) => setArchitecture(e.target.value)}
              />
            </div>

            {errorMsg && <ErrorNotice title={errorMsg} />}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              icon={<Zap aria-hidden />}
              className="w-full"
            >
              <span className="min-w-0 truncate">
                {loading
                  ? evaluatingStep === 1
                    ? "Reading architecture and stack…"
                    : evaluatingStep === 2
                      ? "Checking edge cases and red flags…"
                      : "Scoring and finding role gaps…"
                  : `Evaluate · ${currentProfile.badge}`}
              </span>
            </Button>
          </form>
        </Panel>

        {/* ---------- Score aside ---------- */}
        <aside id="evaluation-results" className="min-w-0 scroll-mt-6 space-y-4">
          {loading ? (
            <Panel className="flex items-center gap-3 p-4" >
              <Spinner className="text-accent-ink" label="Evaluating" />
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-ink">Evaluating your idea</p>
                <p className="text-[12.5px] text-ink-3">Step {Math.max(evaluatingStep, 1)} of 3</p>
              </div>
            </Panel>
          ) : result ? (
            <Panel className="p-4">
              <div className="caps-label text-ink-3">{currentProfile.name}</div>
              <h2 className="mt-1 break-words text-[14.5px] font-semibold leading-snug text-ink">{title}</h2>

              <div className="mt-4 flex items-end gap-2">
                <span className="font-display text-[56px] font-semibold leading-[0.9] tracking-[-0.03em] text-ink tabular [font-variation-settings:'wdth'_92]">
                  {result.totalScore}
                </span>
                <span className="pb-1 font-mono text-[12.5px] text-ink-3 tabular">/ 100</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Tape tone={gradeTone(result.grade)} dot>{gradeLabel(result.grade)}</Tape>
                {result.usedAiEngine ? (
                  <Tape
                    tone="ok"
                    icon={<Zap aria-hidden />}
                    title="Evaluated using live Gemini AI model with deep semantic reasoning and domain jury rubric checks."
                  >
                    Gemini AI
                  </Tape>
                ) : (
                  <Tape
                    tone="warn"
                    icon={<Zap aria-hidden />}
                    title="Evaluated using static pattern heuristic rules (offline / fast check mode)."
                  >
                    Quick heuristic check
                  </Tape>
                )}
              </div>

              <ul className="mt-4 divide-y divide-line border-t border-line">
                {RUBRIC_KEYS.map((key) => (
                  <RubricRow
                    key={key}
                    label={result.categoryLabels[key]}
                    score={result.subScores[key]}
                    max={currentProfile.categories[key].maxPts}
                  />
                ))}
              </ul>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="secondary" icon={<Share2 aria-hidden />} onClick={shareOnWhatsApp} className="h-10 md:h-[34px]">
                  WhatsApp
                </Button>
                <Button
                  variant="secondary"
                  icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  onClick={copySummary}
                  className="h-10 md:h-[34px]"
                >
                  {copied ? "Copied" : "Copy summary"}
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel className="p-4">
              <div className="caps-label text-ink-3">How this track is scored</div>
              <p className="mt-1 text-[13px] text-ink-2">{currentProfile.name}</p>
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {RUBRIC_KEYS.map((key) => (
                  <RubricRow
                    key={key}
                    label={currentProfile.categories[key].label}
                    max={currentProfile.categories[key].maxPts}
                  />
                ))}
              </ul>
              <p className="mt-3 text-[12.5px] text-ink-3">
                Fill in the form and run an evaluation. Your total score, rubric breakdown and red flags show up here.
              </p>
            </Panel>
          )}

          {/* Fallback engine notice */}
          {result && !result.usedAiEngine && (
            <div className="flex items-start gap-2.5 rounded-lg bg-warn-soft px-4 py-3 ring-1 ring-inset ring-warn/25" role="status">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
              <p className="min-w-0 text-[12.5px] leading-relaxed text-ink-2">
                <span className="font-semibold text-ink">Heuristic mode.</span>{" "}
                {result.fallbackReason === "missing_api_key" ? (
                  <>
                    This scorecard was generated using pattern heuristics because the server&apos;s AI environment key is not configured. Scores are conservative baseline approximations.
                  </>
                ) : result.fallbackReason === "budget_exhausted" ? (
                  <>
                    This scorecard was generated using pattern heuristics because today&apos;s global Gemini AI daily budget cap has been reached. Scores are conservative baseline approximations.
                  </>
                ) : (
                  <>
                    This scorecard was generated using static rule heuristics because the live AI model was temporarily rate-limited or offline. Scores from the heuristic engine are conservative baseline approximations.
                  </>
                )}
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* ---------- Detailed feedback ---------- */}
      {result && (
        <div className="mt-10 space-y-10">
          <section aria-label="Evaluation details" className="min-w-0">
            <div className="-mx-4 overflow-x-auto px-4 scrollbar-none md:mx-0 md:px-0">
              <Segmented
                label="Evaluation details"
                value={activeTab}
                onChange={(v) => setActiveTab(v)}
                options={[
                  { value: "feedback", label: "Feedback" },
                  { value: "architecture", label: "Next steps" },
                  { value: "team", label: "Roles", count: result.recommendedRoles.length },
                ]}
                className="shrink-0 whitespace-nowrap"
              />
            </div>

            <div className="mt-4">
              {activeTab === "feedback" && (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <Section title="Strengths" count={result.strengths.length}>
                    <ul className="divide-y divide-line border-y border-line">
                      {result.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2.5 py-2.5 text-[13.5px] leading-relaxed text-ink-2">
                          <CheckCircle2 className="mt-1 size-4 shrink-0 text-ok" aria-hidden />
                          <span className="min-w-0">{s}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                  <Section title="Red flags" count={result.redFlags.length}>
                    <ul className="divide-y divide-line border-y border-line">
                      {result.redFlags.map((rf, i) => (
                        <li key={i} className="flex items-start gap-2.5 py-2.5 text-[13.5px] leading-relaxed text-ink-2">
                          <TriangleAlert className="mt-1 size-4 shrink-0 text-warn" aria-hidden />
                          <span className="min-w-0">{rf}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                </div>
              )}

              {activeTab === "architecture" && (
                <Section title="What to improve next" description="Technical iterations most likely to raise your score.">
                  <ol className="divide-y divide-line border-y border-line">
                    {result.architectureSuggestions.map((a, i) => (
                      <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 py-2.5 text-[13.5px] leading-relaxed text-ink-2">
                        <span className="pt-0.5 font-mono text-[12px] font-semibold text-ink-3 tabular">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {activeTab === "team" && (
                <Section
                  title="Roles your team is missing"
                  count={result.recommendedRoles.length}
                  description="Based on your architecture, these roles would round out the squad."
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {result.recommendedRoles.map((role, idx) => (
                      <Panel key={idx} className="flex min-w-0 flex-col p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="min-w-0 text-[14px] font-semibold text-ink">{role.role}</h3>
                          <Tape tone="accent" className="shrink-0">Needed</Tape>
                        </div>
                        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{role.reason}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {role.suggestedSkills.map((sk, sIdx) => (
                            <Link
                              key={sIdx}
                              href={`/developers?skills=${encodeURIComponent(sk)}`}
                              className="inline-flex h-7 items-center rounded-[4px] bg-selected px-2 font-mono text-[12.5px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
                              title={`Find builders with ${sk}`}
                            >
                              {sk}
                            </Link>
                          ))}
                        </div>
                        <Link
                          href={`/developers?skills=${encodeURIComponent(role.suggestedSkills.join(","))}`}
                          className="group mt-3 inline-flex min-h-9 items-center gap-1 self-start text-[12.5px] font-medium text-accent-ink hover:underline underline-offset-4"
                        >
                          Find {role.role} builders
                          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </Link>
                      </Panel>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          </section>

          {/* ---------- Next steps: build with a team / attach to workspace ---------- */}
          <Section title="Take it further" description="Start a team with this idea prefilled, or save the scorecard to a team you're already on.">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* Build this with a team */}
              <Panel className="flex min-w-0 flex-col justify-between gap-4 p-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-ink">
                      <Users className="size-4 shrink-0 text-ink-3" aria-hidden />
                      Build this with a team
                    </span>
                    <Tape className="shrink-0">Prefilled</Tape>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
                    Creates a new team with your title, problem description and the skills this scorecard recommends.
                  </p>
                </div>
                <Button variant="inverse" iconRight={<ArrowRight aria-hidden />} onClick={handleBuildWithTeam} className="h-10 w-full md:h-[34px]">
                  Build this with a team
                </Button>
              </Panel>

              {/* Attach to team workspace */}
              <Panel className="flex min-w-0 flex-col justify-between gap-4 p-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-ink">
                      <FolderPlus className="size-4 shrink-0 text-ink-3" aria-hidden />
                      Attach to a team
                    </span>
                    <Tape className="shrink-0">Workspace</Tape>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
                    Save this evaluation to a team&apos;s workspace so teammates can review the rubric and track iterations.
                  </p>
                </div>

                {user ? (
                  userTeams.length > 0 ? (
                    <div className="space-y-2">
                      {attachedTeamName ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-ok-soft px-3 py-2 ring-1 ring-inset ring-ok/25">
                          <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-ink">
                            <CheckCircle2 className="size-4 shrink-0 text-ok" aria-hidden />
                            <span className="truncate">Attached to {attachedTeamName}</span>
                          </span>
                          <Link
                            href={`/teams/${selectedAttachTeamId || userTeams[0]?.id}`}
                            className="inline-flex min-h-9 items-center gap-1 text-[12.5px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                          >
                            Open team
                          </Link>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <label htmlFor="ev-attach-team" className="sr-only">Team to attach to</label>
                            <Select
                              id="ev-attach-team"
                              value={selectedAttachTeamId}
                              onChange={(e) => {
                                setSelectedAttachTeamId(e.target.value);
                                setAttachError(null);
                              }}
                              disabled={isAttaching}
                              className="h-10 min-w-0 flex-1 md:h-[34px]"
                            >
                              <option value="">Select a team</option>
                              {userTeams.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </Select>
                            <Button
                              variant="secondary"
                              onClick={() => handleAttachToTeam(selectedAttachTeamId)}
                              disabled={!selectedAttachTeamId || isAttaching}
                              loading={isAttaching}
                              className="h-10 shrink-0 md:h-[34px]"
                            >
                              Attach
                            </Button>
                          </div>

                          {/* Sharing notice */}
                          {selectedAttachTeamId && (() => {
                            const chosenTeam = userTeams.find((t) => t.id === selectedAttachTeamId);
                            const teamName = chosenTeam?.name || "this team";
                            return (
                              <div className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] leading-relaxed text-ink-2 ring-1 ring-inset ring-warn/25">
                                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
                                <span className="min-w-0">
                                  This shares the full evaluation, including weaknesses and red flags, with all current and future members of{" "}
                                  <strong className="font-semibold text-ink">{teamName}</strong>.
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      {attachError && <p className="text-[12.5px] text-bad" role="alert">{attachError}</p>}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-3">
                      <span>You&apos;re not on a team yet.</span>
                      <Button variant="ghost" size="sm" iconRight={<ArrowRight aria-hidden />} onClick={handleBuildWithTeam} className="h-9 md:h-7">
                        Create your first team
                      </Button>
                    </div>
                  )
                ) : (
                  <ButtonLink
                    href={`/login?next=${encodeURIComponent("/evaluator")}`}
                    variant="secondary"
                    className="h-10 w-full md:h-[34px]"
                  >
                    Sign in to attach to a team
                  </ButtonLink>
                )}
              </Panel>
            </div>
          </Section>
        </div>
      )}

      {/* ---------- History sheet ---------- */}
      <Sheet
        open={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        label="Evaluation history"
        title={
          <span className="flex items-baseline gap-2">
            Evaluation history
            <span className="font-mono text-[12.5px] font-normal text-ink-3 tabular">{history.length}</span>
          </span>
        }
      >
        {loadingHistory ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-ink-3">
            <Spinner label="Loading history" />
            Loading your history
          </div>
        ) : history.length === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              icon={<History />}
              title="No saved evaluations yet"
              body="Evaluations you run while signed in are saved here automatically."
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((item) => {
              const trackInfo = TRACK_PROFILES[item.track_id as JudgingTrackId] || TRACK_PROFILES.web_dev;
              const dateStr = new Date(item.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              });
              return (
                <li key={item.id} className="flex items-start gap-1 pr-2">
                  <button
                    type="button"
                    onClick={() => handleSelectHistoryItem(item)}
                    className="min-w-0 flex-1 px-4 py-3 text-left transition-colors hover:bg-hover md:px-5"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12.5px] text-ink-3">{dateStr}</span>
                      <Tape>{trackInfo.badge}</Tape>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-[13.5px] font-medium text-ink">{item.ps_title}</span>
                    <span className="mt-1 flex min-w-0 items-center gap-2">
                      <span className="font-display text-[15px] font-semibold text-ink tabular">
                        {item.total_score}
                        <span className="font-mono text-[12.5px] font-normal text-ink-3">/100</span>
                      </span>
                      <span className="truncate text-[12px] text-ink-3">{gradeLabel(item.grade)}</span>
                    </span>
                  </button>
                  <IconButton
                    label="Delete this evaluation"
                    onClick={(e) => deleteHistoryItem(item.id, e)}
                    disabled={deletingHistoryId === item.id}
                    className="mt-2.5 hover:text-bad"
                  >
                    {deletingHistoryId === item.id ? <Spinner label="Deleting" /> : <Trash2 />}
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </Page>
  );
}

