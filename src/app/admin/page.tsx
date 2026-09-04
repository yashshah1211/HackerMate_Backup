"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import AuthGuard from "@/components/AuthGuard";
import Link from "next/link";
import type { EmailUsageSummary } from "@/lib/admin/emailBudgetGuard";
import PartnerCompositionModal from "@/components/PartnerCompositionModal";
import { DEFAULT_HACKATHON_ID } from "@/lib/constants";
import { RefreshCw } from "lucide-react";

type Report = {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  details: string;
  created_at: string;
  reporterName?: string;
  reporterEmail?: string;
  reportedName?: string;
  reportedEmail?: string;
  reportedBanned?: boolean;
};

type UserProfile = {
  id: string;
  full_name: string;
  email: string;
  is_banned: boolean;
  role: string;
  created_at: string;
  onboarding_completed: boolean;
  referrer_source?: string | null;
};

type Team = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  max_members: number;
  created_at: string;
  college?: string;
  hackathon_name?: string;
  ownerName?: string;
  ownerEmail?: string;
  team_members?: { id: string }[];
  team_hackathons?: { hackathons: { id: string; name: string } }[];
};

type OrganizerLead = {
  id: string;
  title: string;
  college_or_host: string;
  unstop_url: string;
  organizer_email: string | null;
  last_sent_to?: string | null;
  event_date: string;
  status: string;
  pitch_sent_at: string | null;
  opened_at?: string | null;
  open_count?: number;
  notes: string | null;
  created_at: string;
  updated_at?: string | null;
};

function getReferralSourceBadge(source?: string | null) {
  if (!source) return <span className="inline-block text-[9px] uppercase tracking-wider font-mono px-2.5 py-0.5 rounded border bg-zinc-950 text-zinc-500 border-zinc-800">Direct</span>;
  const s = source.toLowerCase();
  if (s.includes("reddit")) {
    return <span className="inline-block text-[9px] uppercase tracking-wider font-mono font-semibold px-2.5 py-0.5 rounded border bg-orange-500/10 text-orange-400 border-orange-500/20">Reddit</span>;
  }
  if (s.includes("linkedin")) {
    return <span className="inline-block text-[9px] uppercase tracking-wider font-mono font-semibold px-2.5 py-0.5 rounded border bg-sky-500/10 text-sky-400 border-sky-500/20">LinkedIn</span>;
  }
  if (s.includes("instagram") || s === "ig") {
    return <span className="inline-block text-[9px] uppercase tracking-wider font-mono font-semibold px-2.5 py-0.5 rounded border bg-pink-500/10 text-pink-400 border-pink-500/20">Instagram</span>;
  }
  if (s.includes("whatsapp")) {
    return <span className="inline-block text-[9px] uppercase tracking-wider font-mono font-semibold px-2.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">WhatsApp</span>;
  }
  if (s.includes("discord")) {
    return <span className="inline-block text-[9px] uppercase tracking-wider font-mono font-semibold px-2.5 py-0.5 rounded border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">Discord</span>;
  }
  if (s.includes("unstop")) {
    return <span className="inline-block text-[9px] uppercase tracking-wider font-mono font-semibold px-2.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/20">Unstop</span>;
  }
  if (s.includes("google")) {
    return <span className="inline-block text-[9px] uppercase tracking-wider font-mono font-semibold px-2.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20">Google</span>;
  }
  return <span className="inline-block text-[9px] uppercase tracking-wider font-mono font-semibold px-2.5 py-0.5 rounded border bg-zinc-900 text-zinc-300 border-zinc-700">{source}</span>;
}

function AdminContent() {
  const { showToast, confirm } = useNotification();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<"reports" | "users" | "teams" | "outreach" | "badges" | "partnering" | "sih_stats" | "deleted_logs" | "native_hackathons" | "challenges">("reports");

  // Practice Challenges state
  const [adminChallenges, setAdminChallenges] = useState<any[]>([]);
  const [loadingAdminChallenges, setLoadingAdminChallenges] = useState(false);
  const [showCreateChallengeModal, setShowCreateChallengeModal] = useState(false);
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [togglingChallengeId, setTogglingChallengeId] = useState<string | null>(null);

  // New Challenge Form fields
  const [newChNumber, setNewChNumber] = useState("");
  const [newChTitle, setNewChTitle] = useState("");
  const [newChTrack, setNewChTrack] = useState("Full-Stack / AI");
  const [newChDifficulty, setNewChDifficulty] = useState("Intermediate");
  const [newChSummary, setNewChSummary] = useState("");
  const [newChProblem, setNewChProblem] = useState("");
  const [newChAdditionalRules, setNewChAdditionalRules] = useState("");
  const [newChReactionTheme, setNewChReactionTheme] = useState("default");
  const [newChPdfUrl, setNewChPdfUrl] = useState("");
  const [newChPdfFile, setNewChPdfFile] = useState<File | null>(null);
  const [newChStartsAt, setNewChStartsAt] = useState("");
  const [newChEndsAt, setNewChEndsAt] = useState("");
  const [newChStatus, setNewChStatus] = useState("active");

  // Native Hackathons approval & delete state
  const [nativeHackathons, setNativeHackathons] = useState<any[]>([]);
  const [loadingNativeHackathons, setLoadingNativeHackathons] = useState(false);
  const [nativeFilterStatus, setNativeFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");

  // Partnering Organizers & Portal state
  const [allHackathons, setAllHackathons] = useState<{ id: string; name: string; website_url: string | null }[]>([]);
  const [partnerConfigsMap, setPartnerConfigsMap] = useState<Record<string, { id: string; slug: string; partner_name: string }>>({});
  const [creatingPortalId, setCreatingPortalId] = useState<string | null>(null);

  // Winner Badge Issuer & Directory state
  const [badgeFormHackathonId, setBadgeFormHackathonId] = useState(DEFAULT_HACKATHON_ID);
  const [badgeFormEmails, setBadgeFormEmails] = useState("");
  const [badgeFormType, setBadgeFormType] = useState("verified_winner");
  const [badgeFormName, setBadgeFormName] = useState("Verified Winner — All India Hackathon 2026");
  const [badgeFormIssuer, setBadgeFormIssuer] = useState("HackerMate × Axcentra");
  const [badgeFormRank, setBadgeFormRank] = useState("Verified Winner");
  const [submittingBadges, setSubmittingBadges] = useState(false);
  const [badgeIssuerResult, setBadgeIssuerResult] = useState<{ granted: number; missingEmails: string[] } | null>(null);
  const [issuedBadges, setIssuedBadges] = useState<any[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(false);
  const [revokingBadgeId, setRevokingBadgeId] = useState<string | null>(null);

  // Onboarding Nudge state
  const [nudgingUserId, setNudgingUserId] = useState<string | null>(null);
  const [nudgingAll, setNudgingAll] = useState(false);

  // Data
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [emailUsage, setEmailUsage] = useState<EmailUsageSummary | null>(null);

  // Email Analytics & Webhook Event state
  const [emailAnalytics, setEmailAnalytics] = useState<{
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    deliveryRate: string;
    openRate: string;
    clickRate: string;
  } | null>(null);
  const [recentWebhookEvents, setRecentWebhookEvents] = useState<{
    id: string;
    resend_email_id: string;
    event_type: string;
    recipient_email: string;
    subject: string | null;
    created_at: string;
  }[]>([]);

  // Email count calibration state
  const [showSyncEmailModal, setShowSyncEmailModal] = useState(false);
  const [syncingEmailStats, setSyncingEmailStats] = useState(false);
  const [customEmailCount, setCustomEmailCount] = useState<string>("");

  async function handleSyncEmailStats() {
    const num = parseInt(customEmailCount.trim(), 10);
    if (isNaN(num) || num < 0 || num > 1000) {
      showToast("Please enter a valid email count (0-1000).", "error");
      return;
    }
    setSyncingEmailStats(true);
    try {
      const res = await fetch("/api/admin/sync-email-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ total_sent: num }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Email count calibrated to ${num}`, "success");
        setShowSyncEmailModal(false);
        loadData();
      } else {
        showToast(data.error || "Failed to sync email count.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to sync email count.", "error");
    } finally {
      setSyncingEmailStats(false);
    }
  }

  async function fetchNativeHackathons() {
    setLoadingNativeHackathons(true);
    try {
      const res = await fetch("/api/admin/hackathons");
      const data = await res.json();
      if (res.ok && data.success) {
        setNativeHackathons(data.hackathons || []);
      } else {
        showToast(data.error || "Failed to fetch native hackathons.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to fetch native hackathons.", "error");
    } finally {
      setLoadingNativeHackathons(false);
    }
  }

  function handleNativeHackathonAction(hackathonId: string, action: "approve" | "reject" | "delete", name?: string) {
    if (action === "delete") {
      confirm({
        title: "PERMANENTLY DELETE HACKATHON",
        message: `Are you sure you want to permanently delete "${name || "this hackathon"}" from HackerMate? This will remove all associated teams and registrations. This action cannot be undone.`,
        confirmText: "Delete Permanently",
        onConfirm: async () => {
          executeHackathonAction(hackathonId, action);
        },
      });
      return;
    }
    executeHackathonAction(hackathonId, action);
  }

  async function executeHackathonAction(hackathonId: string, action: string) {
    try {
      const res = await fetch("/api/admin/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hackathonId, action }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || `Hackathon ${action} completed successfully!`, "success");
        fetchNativeHackathons();
      } else {
        showToast(data.error || `Failed to ${action} hackathon.`, "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || `Failed to ${action} hackathon.`, "error");
    }
  }

  async function handleNudgeUser(targetUserId: string, userName?: string) {
    setNudgingUserId(targetUserId);
    try {
      const res = await fetch("/api/admin/nudge-incomplete-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Email onboarding nudge sent to ${userName || "user"}!`, "success");
      } else {
        showToast(data.error || "Failed to send onboarding nudge.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to send onboarding nudge.", "error");
    } finally {
      setNudgingUserId(null);
    }
  }

  function handleNudgeAllIncomplete() {
    confirm({
      title: "SEND EMAIL NUDGE TO ALL INCOMPLETE USERS",
      message: "Are you sure you want to send a manual onboarding email nudge to ALL users with incomplete profiles?",
      confirmText: "Send Emails",
      onConfirm: async () => {
        setNudgingAll(true);
        try {
          const res = await fetch("/api/admin/nudge-incomplete-onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ batchAll: true }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast(`⚡ Onboarding nudge emails sent to ${data.count} incomplete user(s)!`, "success");
          } else {
            showToast(data.error || "Failed to send batch onboarding nudges.", "error");
          }
        } catch (err: any) {
          console.error(err);
          showToast(err.message || "Failed to send batch onboarding nudges.", "error");
        } finally {
          setNudgingAll(false);
        }
      },
    });
  }

  // Outreach / Unstop Leads state (yashshah7117@gmail.com exclusive)
  const [leads, setLeads] = useState<OrganizerLead[]>([]);
  const [fetchingUnstop, setFetchingUnstop] = useState(false);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [sendingSummaryPdf, setSendingSummaryPdf] = useState(false);

  // Pitch Modal state
  const [pitchModalOpen, setPitchModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<OrganizerLead | null>(null);
  const [pitchRecipientEmail, setPitchRecipientEmail] = useState("");
  const [pitchSubject, setPitchSubject] = useState("");
  const [pitchBody, setPitchBody] = useState("");
  const [sendingPitch, setSendingPitch] = useState(false);

  // Status Filter & Bulk Pitch Modal states
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [bulkPitchModalOpen, setBulkPitchModalOpen] = useState(false);
  const [bulkPitchSubject, setBulkPitchSubject] = useState("");
  const [bulkPitchBody, setBulkPitchBody] = useState("");
  const [bulkSending, setBulkSending] = useState(false);

  // CRM Notes & Edit Modal states
  const [editingLeadNotes, setEditingLeadNotes] = useState<any | null>(null);
  const [leadNotesText, setLeadNotesText] = useState("");
  const [leadEmailText, setLeadEmailText] = useState("");
  const [updatingLeadStatus, setUpdatingLeadStatus] = useState(false);
  const [syncingGmail, setSyncingGmail] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Warning Modal
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [warningTargetUserId, setWarningTargetUserId] = useState<string | null>(null);
  const [warningTargetName, setWarningTargetName] = useState("");
  const [warningMessageText, setWarningMessageText] = useState("");
  const [sendingWarning, setSendingWarning] = useState(false);

  // Onboarding nudge states
  const [onboardingFilter, setOnboardingFilter] = useState<"all" | "incomplete">("all");
  const [nudgingUserIds, setNudgingUserIds] = useState<Set<string>>(new Set());
  const [bulkNudging, setBulkNudging] = useState(false);

  // SIH 2026 College Stats State
  const [sihStatsData, setSihStatsData] = useState<any | null>(null);
  const [loadingSihStats, setLoadingSihStats] = useState(false);
  const [sihCollegeFilter, setSihCollegeFilter] = useState<"all" | "zero_teams">("all");
  const [expandedCollege, setExpandedCollege] = useState<string | null>(null);

  // Partner Composition & Broadcast Modal States
  const [partnerConfigsList, setPartnerConfigsList] = useState<any[]>([]);
  const [selectedPartnerModal, setSelectedPartnerModal] = useState<any | null>(null);
  const [partnerAnalyticsData, setPartnerAnalyticsData] = useState<any | null>(null);
  const [loadingPartnerAnalytics, setLoadingPartnerAnalytics] = useState(false);
  const [sendingPartnerBroadcast, setSendingPartnerBroadcast] = useState(false);

  async function loadSIHStats() {
    setLoadingSihStats(true);
    try {
      const res = await fetch("/api/admin/sih-college-stats");
      const data = await res.json();
      if (res.ok && data.success) {
        setSihStatsData(data);
      } else {
        showToast(data.error || "Failed to load SIH college stats", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to load SIH college stats", "error");
    } finally {
      setLoadingSihStats(false);
    }
  }

  const [sendingSihPdf, setSendingSihPdf] = useState(false);


  async function sendSIHPdfReport() {
    setSendingSihPdf(true);
    try {
      const res = await fetch("/api/cron/sih-daily-pdf-report", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`SIH Daily PDF Report emailed to ${data.recipient || "yashshah7117@gmail.com"}!`, "success");
      } else {
        showToast(data.error || "Failed to dispatch SIH PDF report email.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to send SIH PDF report", "error");
    } finally {
      setSendingSihPdf(false);
    }
  }

  const [deletedUserLogs, setDeletedUserLogs] = useState<{ id: string; user_id: string; email: string | null; full_name: string | null; college: string | null; deleted_at: string }[]>([]);

  const [loadingDeletedLogs, setLoadingDeletedLogs] = useState(false);

  async function loadDeletedUserLogs() {
    setLoadingDeletedLogs(true);
    try {
      const res = await fetch("/api/admin/deleted-users-log");
      const data = await res.json();
      if (res.ok && data.success) {
        setDeletedUserLogs(data.logs || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDeletedLogs(false);
    }
  }



  async function fetchAdminChallenges() {
    setLoadingAdminChallenges(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/admin/challenges", { headers });
      const data = await res.json();
      if (res.ok && data.success) {
        setAdminChallenges(data.challenges || []);
      } else {
        showToast(data.error || "Failed to load challenges.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to load challenges.", "error");
    } finally {
      setLoadingAdminChallenges(false);
    }
  }

  function generateSummaryFromProblemText(rawText: string): string {
    if (!rawText) return "";
    const cleaned = rawText
      .replace(/###?\s+[^\n]+/g, " ")
      .replace(/\*\*[^*]+\*\*/g, (m) => m.replace(/\*\*/g, ""))
      .replace(/^[*-]\s+/gm, "")
      .replace(/\n+/g, " ")
      .trim();

    const sentences = cleaned.split(/(?<=[.?!])\s+/);
    let summary = sentences[0] || "";
    if (summary.length < 80 && sentences[1]) {
      summary += " " + sentences[1];
    }
    if (summary.length > 200) {
      summary = summary.slice(0, 197) + "...";
    }
    return summary;
  }

  async function handlePdfUploadForChallenge(f: File) {
    setNewChPdfFile(f);
    try {
      const arrayBuffer = await f.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const textMatches = text.match(/\(([^()]{3,})\)/g) || [];
      const extractedText = textMatches
        .map((m) => m.slice(1, -1))
        .filter((t) => !t.startsWith("/") && t.length > 3)
        .join(" ")
        .replace(/\\r|\\n/g, " ")
        .trim();

      if (extractedText && extractedText.length > 20) {
        const autoSummary = generateSummaryFromProblemText(extractedText);
        if (autoSummary) {
          setNewChSummary(autoSummary);
        }
        if (!newChProblem.trim()) {
          setNewChProblem(extractedText.slice(0, 3000));
        }
        showToast("Extracted problem statement and summary from PDF!", "success");
      }
    } catch {
      // PDF stream parsing is best-effort
    }
  }

  async function handleCreateChallenge(e: React.FormEvent) {
    e.preventDefault();
    if (!newChTitle.trim() || !newChProblem.trim()) {
      showToast("Please provide both a title and problem statement.", "error");
      return;
    }

    setCreatingChallenge(true);
    try {
      let finalPdfUrl = newChPdfUrl.trim() || null;
      if (newChPdfFile) {
        try {
          const fileExt = newChPdfFile.name.split(".").pop() || "pdf";
          const cleanSlug = newChTitle.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
          const filePath = `briefings/${cleanSlug}-${Date.now()}.${fileExt}`;
          const { error: upErr } = await supabase.storage
            .from("challenge_submissions_bucket")
            .upload(filePath, newChPdfFile, { upsert: true });

          if (!upErr) {
            const { data: pubData } = supabase.storage
              .from("challenge_submissions_bucket")
              .getPublicUrl(filePath);
            if (pubData?.publicUrl) {
              finalPdfUrl = pubData.publicUrl;
            }
          }
        } catch (upEx) {
          console.warn("Could not upload briefing PDF to storage, using fallback/direct URL:", upEx);
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/admin/challenges", {
        method: "POST",
        headers,
        body: JSON.stringify({
          challenge_number: newChNumber ? parseInt(newChNumber, 10) : undefined,
          title: newChTitle.trim(),
          track: newChTrack,
          difficulty: newChDifficulty,
          summary: newChSummary.trim(),
          problem_statement: newChProblem.trim(),
          problem_pdf_url: finalPdfUrl,
          additional_rules: newChAdditionalRules.trim() || undefined,
          constraints: [
            "Maximum 6 slides total in presentation deck",
            "Must include an end-to-end data pipeline in Slide 3",
            "Quantified baseline metrics and milestones required in Slides 5 & 6",
            `ReactionTheme:${newChReactionTheme}`,
          ],
          starts_at: newChStartsAt ? new Date(newChStartsAt).toISOString() : undefined,
          ends_at: newChEndsAt ? new Date(newChEndsAt).toISOString() : undefined,
          status: newChStatus,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Challenge "${data.challenge.title}" published!`, "success");
        setShowCreateChallengeModal(false);
        setNewChTitle("");
        setNewChSummary("");
        setNewChProblem("");
        setNewChAdditionalRules("");
        setNewChPdfUrl("");
        setNewChPdfFile(null);
        setNewChNumber("");
        fetchAdminChallenges();
      } else {
        showToast(data.error || "Failed to create challenge.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to create challenge.", "error");
    } finally {
      setCreatingChallenge(false);
    }
  }

  async function handleToggleChallengeStatus(ch: any) {
    const nextStatus = ch.status === "active" ? "closed" : "active";
    setTogglingChallengeId(ch.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`/api/admin/challenges/${ch.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Challenge #${ch.challenge_number} marked as ${nextStatus}`, "success");
        fetchAdminChallenges();
      } else {
        showToast(data.error || "Failed to toggle status.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to toggle status.", "error");
    } finally {
      setTogglingChallengeId(null);
    }
  }

  function handleDeleteChallenge(ch: any) {
    confirm({
      title: "DELETE PRACTICE CHALLENGE",
      message: `Are you sure you want to permanently delete Challenge #${ch.challenge_number} (${ch.title})? This will also remove all associated user submissions.`,
      confirmText: "Delete Challenge",
      onConfirm: async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const headers: Record<string, string> = {};
          if (session?.access_token) {
            headers["Authorization"] = `Bearer ${session.access_token}`;
          }

          const res = await fetch(`/api/admin/challenges/${ch.id}`, {
            method: "DELETE",
            headers,
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast("Challenge deleted successfully.", "success");
            fetchAdminChallenges();
          } else {
            showToast(data.error || "Failed to delete challenge.", "error");
          }
        } catch (err: any) {
          showToast(err.message || "Failed to delete challenge.", "error");
        }
      },
    });
  }

  useEffect(() => {
    if (activeTab === "sih_stats") {
      loadSIHStats();
    } else if (activeTab === "users" || activeTab === "deleted_logs") {
      loadDeletedUserLogs();
    } else if (activeTab === "challenges") {
      fetchAdminChallenges();
    }
  }, [activeTab]);

  const outreachAdminEmail =
    process.env.NEXT_PUBLIC_OUTREACH_ADMIN_EMAIL || "yashshah7117@gmail.com";

  async function handleSendSummaryPdf() {
    setSendingSummaryPdf(true);
    try {
      const res = await fetch("/api/admin/send-outreach-summary-pdf", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(
          `All-time outreach summary PDF (From Day 1) emailed successfully to ${userEmail || "administrator email"}!`,
          "success"
        );
      } else {
        showToast(data.error || "Failed to send summary PDF email.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to send summary PDF", "error");
    }
    setSendingSummaryPdf(false);
  }

  async function checkAdminAccess() {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setCurrentUserId(user.id);
      setUserEmail(user.email ?? null);

      const { data: profile, error: dbError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const isSuperAdminEmail = user.email?.toLowerCase().trim() === "yashshah7117@gmail.com";
      const isAllowedAdmin = isSuperAdminEmail || profile?.role === "admin";

      if (!isAllowedAdmin) {
        setIsAdmin(false);
      } else {
        setIsAdmin(true);
        await loadData();
        if (user.email?.toLowerCase() === outreachAdminEmail.toLowerCase()) {
          await loadLeads();
        }
      }
    } catch (err) {
      console.error("Error verifying admin permissions:", err);
      setIsAdmin(false);
    }
    setLoading(false);
  }

  async function loadLeads() {
    setLoadingLeads(true);
    try {
      const { data, error } = await supabase
        .from("organizer_leads")
        .select("*")
        .neq("status", "removed")
        .neq("status", "archived")
        .not("organizer_email", "is", null)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load organizer leads:", error);
      } else {
        const validLeads = ((data || []) as OrganizerLead[]).filter(
          (l) => l.organizer_email && l.organizer_email.trim().length > 0
        );
        setLeads(validLeads);
      }

      // Fetch hackathons & partner configs for portal matching
      const { data: hData } = await supabase.from("hackathons").select("id, name, website_url");
      if (hData) setAllHackathons(hData);

      const { data: pcData } = await supabase.from("partner_configs").select("*");
      if (pcData) {
        setPartnerConfigsList(pcData);
        const map: Record<string, { id: string; slug: string; partner_name: string }> = {};
        pcData.forEach((pc) => {
          if (pc.hackathon_id) map[pc.hackathon_id] = pc;
        });
        setPartnerConfigsMap(map);
      }
    } catch (err) {
      console.error("Error in loadLeads:", err);
    }
    setLoadingLeads(false);
  }

  async function openPartnerCompositionModal(partnerConfig: any) {
    setSelectedPartnerModal(partnerConfig);
    setPartnerAnalyticsData(null);
    setLoadingPartnerAnalytics(true);
    try {
      const res = await fetch(`/api/admin/partner-composition?hackathonId=${partnerConfig.hackathon_id}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setPartnerAnalyticsData(data);
      } else {
        showToast(data.error || "Failed to load partner composition", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to load partner composition", "error");
    } finally {
      setLoadingPartnerAnalytics(false);
    }
  }

  async function handleSendPartnerBroadcast(title: string, message: string) {
    if (!selectedPartnerModal) return;
    setSendingPartnerBroadcast(true);
    try {
      const res = await fetch("/api/organizer/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hackathonId: selectedPartnerModal.hackathon_id,
          title,
          message,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`📢 Announcement broadcast sent to ${data.count} participant(s)!`, "success");
        await openPartnerCompositionModal(selectedPartnerModal);
      } else {
        showToast(data.error || "Failed to send broadcast", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to send broadcast", "error");
    } finally {
      setSendingPartnerBroadcast(false);
    }
  }

  async function handleCreatePartnerPortal(lead: OrganizerLead) {
    setCreatingPortalId(lead.id);
    try {
      const res = await fetch("/api/admin/create-partner-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Partner Portal created for "${lead.title}"! Path: ${data.portalUrl}`, "success");
        await loadLeads();
      } else {
        showToast(data.error || "Failed to create partner portal", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to create partner portal", "error");
    }
    setCreatingPortalId(null);
  }

  function handleRemovePartnerLead(lead: OrganizerLead) {
    confirm({
      title: "Remove Partner",
      message: `Remove "${lead.title}" from Partnering Organizers? This will revert their lead status back to Pitch Sent.`,
      confirmText: "Remove Partner",
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from("organizer_leads")
            .update({ status: "pitch_sent", updated_at: new Date().toISOString() })
            .eq("id", lead.id);

          if (error) {
            showToast(error.message, "error");
          } else {
            showToast(`Removed "${lead.title}" from Partnering Organizers`, "success");
            await loadLeads();
          }
        } catch (err: any) {
          showToast(err.message, "error");
        }
      },
    });
  }

  async function handleScrapeUnstop() {
    setFetchingUnstop(true);
    try {
      const res = await fetch("/api/admin/scrape-unstop", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(
          data.message || (data.count > 0
            ? `Fetched ${data.count} hackathons from Unstop!`
            : "Scrape complete - no new hackathons found."),
          "success"
        );
        await loadLeads();
      } else {
        showToast(data.error || "Failed to fetch Unstop hackathons", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to fetch Unstop hackathons", "error");
    }
    setFetchingUnstop(false);
  }

  function openPitchModal(lead: OrganizerLead) {
    setSelectedLead(lead);
    const primaryEmail = lead.last_sent_to || (lead.organizer_email
      ? lead.organizer_email.split(",")[0].trim()
      : "");
    setPitchRecipientEmail(primaryEmail);
    setPitchSubject(`Partnership Proposal: Official Teammate Matchmaker for ${lead.title}`);
    setPitchBody(
      `Hi Team ${lead.college_or_host || "Organizers"},\n\n` +
        `I saw that ${lead.title} is coming up on Unstop! Congrats on organizing it.\n\n` +
        `I'm Yash, founder of HackerMate (https://hackermate.in) — a dedicated team-formation platform for hackathons (skills & GitHub stats matching).\n\n` +
        `Solo builders often struggle to find teammates, leading to dropouts & spam in Discord/WhatsApp groups. We'd love to serve as your Official Teammate Matching Partner (100% free for your event).\n\n` +
        `What we will do for ${lead.title}:\n` +
        `1. Provide a clean team-matching portal for your participants.\n` +
        `2. Eliminate team-formation spam in your channels.\n` +
        `3. Drive extra builder registrations to your event.\n\n` +
        `All we ask is to include your custom HackerMate match link in your participant welcome email / announcements.\n\n` +
        `Would you be open to a quick chat or 30-second preview?\n\n` +
        `Best regards,\nYash Shah\nFounder, HackerMate`
    );
    setPitchModalOpen(true);
  }

  async function handleSendPitch() {
    if (!selectedLead || !pitchRecipientEmail.trim() || !pitchSubject.trim() || !pitchBody.trim()) {
      showToast("Please provide recipient email, subject, and message body.", "error");
      return;
    }
    setSendingPitch(true);
    try {
      const formattedHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111; max-width: 600px; padding: 20px;">
          ${pitchBody.replace(/\n/g, "<br />")}
        </div>
      `;

      const res = await fetch("/api/admin/send-organizer-pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: selectedLead.id,
          recipientEmail: pitchRecipientEmail.trim(),
          subject: pitchSubject.trim(),
          contentHtml: formattedHtml,
        }),
      });

      const resData = await res.json();
      if (res.ok) {
        if (resData.dbUpdateFailed) {
          showToast(
            "Email sent, but failed to update status — refresh and check manually.",
            "warning"
          );
        } else {
          showToast(
            `Pitch email sent successfully to ${resData.sentTo || pitchRecipientEmail}!`,
            "success"
          );
        }
        setPitchModalOpen(false);
        await loadLeads();
      } else {
        showToast(resData.error || "Failed to send pitch email.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to send pitch", "error");
    }
    setSendingPitch(false);
  }

  function openBulkPitchModal() {
    if (selectedLeadIds.size === 0) {
      showToast("Please select at least one hackathon lead to send a bulk pitch.", "warning");
      return;
    }

    const firstSelectedId = Array.from(selectedLeadIds)[0];
    const lead = leads.find((l) => l.id === firstSelectedId);
    setBulkPitchSubject(
      `Sponsorship & Hackathon Team Ecosystem Partnership — ${lead?.title || "HackerMate Partnership"}`
    );
    setBulkPitchBody(
      `Dear Hackathon Organizing Team,\n\nI hope this email finds you well!\n\nWe came across your upcoming hackathon (${lead?.title || "your upcoming event"}) and wanted to reach out regarding a strategic partnership with HackerMate (https://hackermate.dev).\n\nHackerMate is India's leading Team Operating System for hackathon builders. We help builders discover hackathons, form compatible cross-functional teams using skill-matching algorithms, and collaborate in real-time workspaces.\n\nThrough our partnership program, we offer:\n1. Dedicated Co-Branded Partner Page (e.g., /partners/your-hackathon) with custom branding & logo.\n2. Direct Team Matchmaking & Participant Discovery for your registered hackers.\n3. Verified Digital Winner & Finalist Badges issued directly on builder profiles.\n\nWe would love to feature ${lead?.title || "your event"} as a featured partner hackathon!\n\nPlease let us know if you'd be available for a brief 10-minute call or chat this week.\n\nBest regards,\nYash Shah\nFounder, HackerMate`
    );
    setBulkPitchModalOpen(true);
  }

  async function handleBulkSend() {
    if (selectedLeadIds.size === 0 || !bulkPitchSubject.trim() || !bulkPitchBody.trim()) {
      showToast("Please select at least one lead and fill in subject & body.", "error");
      return;
    }

    setBulkSending(true);
    let successCount = 0;
    let failCount = 0;

    const targetLeads = leads.filter((l) => selectedLeadIds.has(l.id));

    try {
      const formattedHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111; max-width: 600px; padding: 20px;">
          ${bulkPitchBody.replace(/\n/g, "<br />")}
        </div>
      `;

      for (const lead of targetLeads) {
        const recipient = lead.last_sent_to || lead.organizer_email;
        if (!recipient) {
          failCount++;
          continue;
        }

        try {
          const res = await fetch("/api/admin/send-organizer-pitch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leadId: lead.id,
              recipientEmail: recipient.trim(),
              subject: bulkPitchSubject.trim(),
              contentHtml: formattedHtml,
            }),
          });

          if (res.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          console.error(`Error sending lead ${lead.id}:`, err);
          failCount++;
        }

        // Sleep 400ms between emails to prevent rate limits
        if (targetLeads.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }

      showToast(
        `Bulk pitch completed! Successfully dispatched ${successCount} email(s).${failCount > 0 ? ` (${failCount} failed)` : ""}`,
        "success"
      );
      setBulkPitchModalOpen(false);
      setSelectedLeadIds(new Set());
      await loadLeads();
    } catch (err: any) {
      console.error("Bulk send error:", err);
      showToast(err.message || "Bulk pitch dispatch failed", "error");
    } finally {
      setBulkSending(false);
    }
  }

  function handleRemoveLead(leadId: string, leadTitle: string) {
    confirm({
      title: "REMOVE HACKATHON LEAD",
      message: `Are you sure you want to remove "${leadTitle}"? It will be removed from your outreach list and will never be re-fetched when you click Fetch Unstop Hackathons.`,
      confirmText: "Remove Lead",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/admin/organizer-leads/remove", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId }),
          });
          const resData = await res.json();
          if (res.ok) {
            showToast(`Removed "${leadTitle}". It will not be re-fetched on future scrapes.`, "success");
            await loadLeads();
          } else {
            showToast(resData.error || "Failed to remove lead.", "error");
          }
        } catch (err: any) {
          console.error(err);
          showToast(err.message || "Failed to remove lead.", "error");
        }
      },
    });
  }

  function handleMarkReplied(leadId: string, leadTitle: string) {
    confirm({
      title: "MARK LEAD AS REPLIED",
      message: `Mark "${leadTitle}" as Replied? This updates their status to Replied on your dashboard and summary reports.`,
      confirmText: "Mark as Replied",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/admin/organizer-leads/mark-replied", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId }),
          });
          const resData = await res.json();
          if (res.ok) {
            showToast(`Marked "${leadTitle}" as Replied!`, "success");
            await loadLeads();
          } else {
            showToast(resData.error || "Failed to mark as replied.", "error");
          }
        } catch (err: any) {
          console.error(err);
          showToast(err.message || "Failed to mark as replied.", "error");
        }
      },
    });
  }

  async function handleUpdateLeadStatus(leadId: string, status?: string, notes?: string, organizerEmail?: string) {
    setUpdatingLeadStatus(true);
    try {
      const res = await fetch("/api/admin/organizer-leads/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, status, notes, organizerEmail }),
      });
      const resData = await res.json();
      if (res.ok && resData.lead) {
        showToast("Lead updated successfully!", "success");
        setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, ...resData.lead } : l)));
        if (editingLeadNotes && editingLeadNotes.id === leadId) {
          setEditingLeadNotes(null);
        }
      } else {
        showToast(resData.error || "Failed to update lead.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to update lead.", "error");
    } finally {
      setUpdatingLeadStatus(false);
    }
  }

  function openEditNotesModal(lead: any) {
    setEditingLeadNotes(lead);
    setLeadNotesText(lead.notes || "");
    setLeadEmailText(lead.organizer_email || "");
  }

  async function handleSyncGmailReplies() {
    setSyncingGmail(true);
    try {
      const res = await fetch("/api/admin/organizer-leads/sync-gmail-replies", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        if (!data.configured) {
          showToast(data.message, "warning");
        } else {
          showToast(data.message, data.syncedCount > 0 ? "success" : "info");
          if (data.syncedCount > 0) {
            await loadLeads();
          }
        }
      } else {
        showToast(data.error || "Failed to sync Gmail inbox.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to sync Gmail inbox.", "error");
    } finally {
      setSyncingGmail(false);
    }
  }

  function handleRestoreLeads() {
    confirm({
      title: "RESTORE ALL REMOVED LEADS",
      message: "Are you sure you want to restore all previously removed hackathon leads back to your active list?",
      confirmText: "Restore All",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/admin/organizer-leads/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          const resData = await res.json();
          if (res.ok) {
            showToast(resData.message || `Restored ${resData.count} lead(s)!`, "success");
            await loadLeads();
          } else {
            showToast(resData.error || "Failed to restore leads.", "error");
          }
        } catch (err: any) {
          console.error(err);
          showToast(err.message || "Failed to restore leads.", "error");
        }
      },
    });
  }

  async function loadData() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/admin/dashboard-data", { headers });
      if (res.ok) {
        const data = await res.json();
        const usersList = (data.users || []) as UserProfile[];
        const rawTeams = (data.teams || []) as Team[];
        const reportsData = (data.reports || []) as any[];

        if (data.emailUsage) {
          setEmailUsage(data.emailUsage);
        }

        try {
          const analyticsRes = await fetch("/api/admin/email-analytics", { headers });
          const analyticsData = await analyticsRes.json();
          if (analyticsRes.ok && analyticsData.success) {
            setEmailAnalytics(analyticsData.stats);
            setRecentWebhookEvents(analyticsData.recentEvents || []);
          }
        } catch (e) {
          console.warn("Failed to fetch email analytics:", e);
        }

        setUsers(usersList);

        if (rawTeams.length > 0 && usersList.length > 0) {
          const joinedTeams: Team[] = rawTeams.map((t) => {
            const owner = usersList.find((u) => u.id === t.owner_id);
            return {
              ...t,
              ownerName: owner?.full_name || "Unknown",
              ownerEmail: owner?.email || "Unknown",
            };
          });
          setTeams(joinedTeams);
        } else {
          setTeams(rawTeams);
        }

        if (reportsData.length > 0) {
          const joinedReports: Report[] = reportsData.map((rep) => {
            const reporter = usersList.find((u) => u.id === rep.reporter_id);
            const reported = usersList.find((u) => u.id === rep.reported_id);
            return {
              ...rep,
              reporterName: reporter?.full_name || "Unknown",
              reporterEmail: reporter?.email || "Unknown",
              reportedName: reported?.full_name || "Unknown",
              reportedEmail: reported?.email || "Unknown",
              reportedBanned: reported?.is_banned || false,
            };
          });
          setReports(joinedReports);
        } else {
          setReports([]);
        }
        return;
      }
    } catch (apiErr) {
      console.warn("Failed to load admin dashboard data via API, falling back to client queries:", apiErr);
    }

    try {
      const { data: reportsData } = await supabase.from("user_reports").select("*").order("created_at", { ascending: false });
      
      let profilesData = null;
      const { data: pData, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, is_banned, role, created_at, onboarding_completed, referrer_source")
        .order("created_at", { ascending: false });

      if (pErr) {
        const { data: fallbackProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, is_banned, role, created_at, onboarding_completed")
          .order("created_at", { ascending: false });
        profilesData = fallbackProfiles;
      } else {
        profilesData = pData;
      }

      const usersList = (profilesData || []) as UserProfile[];
      setUsers(usersList);

      const { data: teamsData } = await supabase.from("teams").select("*, team_members(id)").order("created_at", { ascending: false });
      const rawTeams = (teamsData || []) as Team[];

      if (rawTeams.length > 0 && usersList.length > 0) {
        const joinedTeams: Team[] = rawTeams.map((t) => {
          const owner = usersList.find((u) => u.id === t.owner_id);
          return {
            ...t,
            ownerName: owner?.full_name || "Unknown",
            ownerEmail: owner?.email || "Unknown",
          };
        });
        setTeams(joinedTeams);
      } else {
        setTeams(rawTeams);
      }
    } catch (err) {
      console.error("Error in fallback loadData:", err);
    }
  }

  useEffect(() => {
    checkAdminAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleToggleBan(userId: string, currentBan: boolean, fullName: string) {
    if (userId === currentUserId) {
      showToast("You cannot ban yourself!", "warning");
      return;
    }

    const action = currentBan ? "unban" : "ban";
    confirm({
      title: `${action.toUpperCase()} USER`,
      message: `Are you sure you want to ${action} ${fullName}? Banned users will be blocked from accessing any system dashboards.`,
      onConfirm: async () => {
        const { error } = await supabase
          .from("profiles")
          .update({ is_banned: !currentBan })
          .eq("id", userId);

        if (error) {
          console.error(error);
          showToast(error.message, "error");
        } else {
          showToast(`User ${fullName} has been ${action}ned successfully.`, "success");
          await loadData();
        }
      }
    });
  }

  function handleToggleRole(userId: string, currentRole: string, fullName: string) {
    if (userId === currentUserId) {
      showToast("You cannot demote yourself!", "warning");
      return;
    }

    const nextRole = currentRole === "admin" ? "user" : "admin";
    confirm({
      title: "CHANGE USER ROLE",
      message: `Are you sure you want to change ${fullName}'s role from ${currentRole} to ${nextRole}?`,
      onConfirm: async () => {
        const { error } = await supabase
          .from("profiles")
          .update({ role: nextRole })
          .eq("id", userId);

        if (error) {
          console.error(error);
          showToast(error.message, "error");
        } else {
          showToast(`Role for ${fullName} updated to ${nextRole}.`, "success");
          await loadData();
        }
      }
    });
  }

  function handleDeleteUser(userId: string, fullName: string) {
    if (userId === currentUserId) {
      showToast("You cannot delete yourself!", "warning");
      return;
    }
    confirm({
      title: "DELETE USER PERMANENTLY",
      message: `Are you sure you want to permanently delete user ${fullName}? This will purge their profile, DMs, files, and disband any teams where they are the sole member. This action is irreversible.`,
      onConfirm: async () => {
        const { error } = await supabase.rpc("delete_user_completely", {
          p_target_user_id: userId
        });
        if (error) {
          console.error(error);
          showToast(error.message, "error");
        } else {
          showToast(`User ${fullName} has been deleted successfully.`, "success");
          await loadData();
        }
      }
    });
  }

  function handleDeleteTeam(teamId: string, teamName: string) {
    confirm({
      title: "DELETE TEAM PERMANENTLY",
      message: `Are you sure you want to permanently delete team "${teamName}"? This will purge the team, its members, document pad, tasks, link hub, brainstorm boards, deployments, and all associated messages. This action is irreversible.`,
      onConfirm: async () => {
        const { error } = await supabase
          .from("teams")
          .delete()
          .eq("id", teamId);

        if (error) {
          console.error(error);
          showToast(error.message, "error");
        } else {
          showToast(`Team "${teamName}" has been deleted successfully.`, "success");
          await loadData();
        }
      }
    });
  }

  function handleDismissReport(reportId: string) {
    confirm({
      title: "DISMISS REPORT",
      message: "Are you sure you want to dismiss this report? This will remove the report from the dashboard logs.",
      onConfirm: async () => {
        const { error } = await supabase
          .from("user_reports")
          .delete()
          .eq("id", reportId);

        if (error) {
          console.error(error);
          showToast(error.message, "error");
        } else {
          showToast("Report dismissed.", "success");
          await loadData();
        }
      }
    });
  }

  function openWarningModal(reportedId: string, reportedName: string) {
    setWarningTargetUserId(reportedId);
    setWarningTargetName(reportedName);
    setWarningMessageText(
      `We have received reports from other community members regarding inappropriate behavior or content on your HackerMate profile. Please review our community guidelines to avoid account suspension.`
    );
    setWarningModalOpen(true);
  }

  async function submitWarningEmail() {
    if (!warningTargetUserId) return;
    setSendingWarning(true);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          senderId: currentUserId,
          recipientId: warningTargetUserId,
          type: "moderation_warning",
          warningMessage: warningMessageText.trim(),
        }),
      });

      const resData = await res.json();
      if (res.ok) {
        showToast(
          resData.mock
            ? "Mock warning email printed to server terminal."
            : "Warning email sent successfully!",
          "success"
        );
        setWarningModalOpen(false);
      } else {
        showToast(resData.error || "Failed to dispatch warning email.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message, "error");
    }
    setSendingWarning(false);
  }

  async function handleSingleNudge(userId: string, fullName: string) {
    setNudgingUserIds((prev) => {
      const next = new Set(prev);
      next.add(userId);
      return next;
    });

    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          senderId: currentUserId,
          recipientId: userId,
          type: "onboarding_nudge",
        }),
      });

      const resData = await res.json();
      if (res.ok) {
        showToast(
          resData.mock
            ? `Mock onboarding nudge email for ${fullName} printed to server console.`
            : `Onboarding nudge email sent to ${fullName}!`,
          "success"
        );
      } else {
        showToast(resData.error || "Failed to dispatch nudge email.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message, "error");
    } finally {
      setNudgingUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  async function handleBulkNudge() {
    const incompleteUsers = users.filter((u) => !u.onboarding_completed);
    if (incompleteUsers.length === 0) {
      showToast("No incomplete profiles found to nudge.", "warning");
      return;
    }

    confirm({
      title: "BULK NUDGE USERS",
      message: `Are you sure you want to send an onboarding reminder email to all ${incompleteUsers.length} users with incomplete profiles?`,
      confirmText: "Nudge All",
      cancelText: "Cancel",
      onConfirm: async () => {
        setBulkNudging(true);
        let successCount = 0;
        let failCount = 0;

        for (const u of incompleteUsers) {
          try {
            const res = await fetch("/api/send-email", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                senderId: currentUserId,
                recipientId: u.id,
                type: "onboarding_nudge",
              }),
            });
            if (res.ok) {
              successCount++;
            } else {
              failCount++;
            }
          } catch (err) {
            console.error(err);
            failCount++;
          }
          // Sleep for 150ms to respect Resend's 10 reqs/sec rate limit
          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        showToast(
          `Bulk nudge complete. Successfully emailed ${successCount} user(s).${failCount > 0 ? ` (${failCount} failed)` : ""}`,
          "success"
        );
        await loadData();
      },
    });
  }

  async function handleIssueBadges() {
    if (!badgeFormHackathonId || !badgeFormEmails.trim()) {
      showToast("Please provide a valid hackathon ID and at least one winner email.", "error");
      return;
    }

    const emailList = badgeFormEmails
      .split(/[\n,]+/)
      .map((e) => e.trim())
      .filter(Boolean);

    if (emailList.length === 0) {
      showToast("Please enter at least one valid email address.", "error");
      return;
    }

    setSubmittingBadges(true);
    setBadgeIssuerResult(null);

    try {
      const res = await fetch("/api/admin/issue-badges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hackathonId: badgeFormHackathonId.trim(),
          emails: emailList,
          badgeType: badgeFormType.trim(),
          badgeName: badgeFormName.trim(),
          issuerName: badgeFormIssuer.trim(),
          rankTitle: badgeFormRank.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || "Failed to issue winner badges", "error");
      } else {
        showToast(`Successfully granted ${data.granted} verified badge(s)!`, "success");
        setBadgeIssuerResult({
          granted: data.granted,
          missingEmails: data.missingEmails || [],
        });
        fetchIssuedBadges();
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to issue badges", "error");
    } finally {
      setSubmittingBadges(false);
    }
  }

  async function fetchIssuedBadges() {
    setLoadingBadges(true);
    try {
      const res = await fetch("/api/admin/issue-badges");
      const data = await res.json();
      if (res.ok) {
        setIssuedBadges(data.badges || []);
      } else {
        showToast(data.error || "Failed to load issued badges", "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBadges(false);
    }
  }

  function handleRevokeBadge(badge: any) {
    const recipientName = badge.profiles?.full_name || badge.profiles?.email || "this user";
    confirm({
      title: "Revoke Badge & Certificate",
      message: `Are you sure you want to revoke this badge from ${recipientName}? This will permanently delete the badge, remove it from their profile, and invalidate the certificate verification link. This action cannot be undone.`,
      confirmText: "Revoke Badge",
      cancelText: "Cancel",
      onConfirm: async () => {
        setRevokingBadgeId(badge.id);
        try {
          const res = await fetch(`/api/admin/revoke-badge?id=${badge.id}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (res.ok) {
            showToast("Badge revoked successfully and certificate invalidated.", "success");
            fetchIssuedBadges();
          } else {
            showToast(data.error || "Failed to revoke badge.", "error");
          }
        } catch (err: any) {
          console.error(err);
          showToast(err.message || "Failed to revoke badge.", "error");
        } finally {
          setRevokingBadgeId(null);
        }
      },
    });
  }

  useEffect(() => {
    if (activeTab === "badges") {
      fetchIssuedBadges();
    }
    if (activeTab === "native_hackathons") {
      fetchNativeHackathons();
    }
  }, [activeTab]);

  // Filter users based on query and onboarding status
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesOnboarding =
      onboardingFilter === "all" || !u.onboarding_completed;

    return matchesSearch && matchesOnboarding;
  });

  // Filter teams based on query
  const filteredTeams = teams.filter((t) => {
    const query = searchQuery.toLowerCase();
    return (
      t.name?.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query) ||
      t.ownerName?.toLowerCase().includes(query) ||
      t.ownerEmail?.toLowerCase().includes(query) ||
      t.college?.toLowerCase().includes(query) ||
      t.hackathon_name?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-6">
        <div className="w-full max-w-md text-center card card-static p-8">
          <div className="w-14 h-14 rounded bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto mb-6">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-2">
            Access Denied
          </h1>
          <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
            You do not have administrative privileges to access this area. If you believe this is an error, please contact the network supervisor.
          </p>
          <div className="p-3 bg-zinc-950 border border-zinc-900 rounded text-[10px] text-zinc-500 font-mono">
            Error Code: AUTH_INSUFFICIENT_ROLE
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header & Tab Navigation Bar */}
        <div className="space-y-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
              <span>Moderation Center</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Inspect user reports, manage account suspension lists, and assign roles.
            </p>
          </div>

          {/* Tab buttons - Responsive Wrap Container */}
          <div className="flex flex-wrap items-center gap-1.5 bg-zinc-950/90 border border-zinc-900 rounded-xl p-1.5 select-none w-full max-w-full overflow-x-auto">
            <button
              onClick={() => {
                setActiveTab("reports");
                setSearchQuery("");
              }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition shrink-0 cursor-pointer ${
                activeTab === "reports"
                  ? "bg-zinc-900 text-white shadow"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Report Logs ({reports.length})
            </button>

            <button
              onClick={() => {
                setActiveTab("users");
                setSearchQuery("");
              }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition shrink-0 cursor-pointer ${
                activeTab === "users"
                  ? "bg-zinc-900 text-white shadow"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Registered Users ({users.length})
            </button>



            <button
              onClick={() => {
                setActiveTab("deleted_logs");
                setSearchQuery("");
              }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition shrink-0 cursor-pointer ${
                activeTab === "deleted_logs"
                  ? "bg-rose-950/40 text-rose-400 border border-rose-500/30 shadow"
                  : "text-rose-500/80 hover:text-rose-400"
              }`}
            >
              🛡️ Account Exits Log ({deletedUserLogs.length})
            </button>

            <button
              onClick={() => {
                setActiveTab("teams");
                setSearchQuery("");
              }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition shrink-0 cursor-pointer ${
                activeTab === "teams"
                  ? "bg-zinc-900 text-white shadow"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Teams ({teams.length})
            </button>

            <button
              onClick={() => {
                setActiveTab("badges");
                setSearchQuery("");
              }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition shrink-0 cursor-pointer ${
                activeTab === "badges"
                  ? "bg-blue-600 text-white shadow"
                  : "text-blue-400 hover:text-blue-300"
              }`}
            >
              🏆 Issue Winner Badges
            </button>

            <button
              onClick={() => {
                setActiveTab("native_hackathons");
                setSearchQuery("");
                fetchNativeHackathons();
              }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition shrink-0 cursor-pointer ${
                activeTab === "native_hackathons"
                  ? "bg-purple-600 text-white shadow font-bold"
                  : "text-purple-400 hover:text-purple-300"
              }`}
            >
              🏰 Native Hackathons ({nativeHackathons.filter((h) => h.status === "pending").length > 0 ? `⏳ ${nativeHackathons.filter((h) => h.status === "pending").length}` : nativeHackathons.length})
            </button>

            {userEmail?.toLowerCase().trim() === "yashshah7117@gmail.com" && (
              <>
                <button
                  onClick={() => {
                    setActiveTab("outreach");
                    setSearchQuery("");
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition shrink-0 cursor-pointer ${
                    activeTab === "outreach"
                      ? "bg-zinc-900 text-emerald-400 shadow border border-emerald-500/20"
                      : "text-emerald-500/70 hover:text-emerald-400"
                  }`}
                >
                  Organizer Outreach 🎯 ({leads.length})
                </button>

                <button
                  onClick={() => {
                    setActiveTab("partnering");
                    setSearchQuery("");
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition shrink-0 cursor-pointer ${
                    activeTab === "partnering"
                      ? "bg-zinc-900 text-amber-400 shadow border border-amber-500/20"
                      : "text-amber-500/70 hover:text-amber-400"
                  }`}
                >
                  Partnering Organizers 🤝 ({leads.filter((l) => l.status === "replied").length})
                </button>
              </>
            )}

            <button
              onClick={() => {
                setActiveTab("sih_stats");
                setSearchQuery("");
              }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition shrink-0 cursor-pointer ${
                activeTab === "sih_stats"
                  ? "bg-orange-600 text-white shadow border border-orange-500/30 font-bold"
                  : "text-orange-400 hover:text-orange-300"
              }`}
            >
              🇮🇳 SIH 2026 Stats
            </button>

            <button
              onClick={() => {
                setActiveTab("challenges");
                setSearchQuery("");
                fetchAdminChallenges();
              }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition shrink-0 cursor-pointer ${
                activeTab === "challenges"
                  ? "bg-lime-500 text-black shadow font-bold"
                  : "text-lime-400 hover:text-lime-300"
              }`}
            >
              ⚡ Practice Challenges ({adminChallenges.length})
            </button>
          </div>
        </div>

        {/* Daily Resend Email Limit Tracker Widget */}
        {emailUsage && (
          <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-lg relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2 2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Daily Resend Email Limit
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold border ${
                      emailUsage.usage_percent < 70
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : emailUsage.usage_percent < 90
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse"
                    }`}
                  >
                    {emailUsage.usage_percent < 70
                      ? "Normal Usage"
                      : emailUsage.usage_percent < 90
                      ? "High Volume Warning"
                      : "Critical Budget Cap"}
                  </span>
                  {emailUsage.is_resend_live && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold border bg-cyan-500/10 text-cyan-400 border-cyan-500/20 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      Live Resend Sync
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Source of Truth for Email Budget Guard. {emailUsage.is_resend_live ? "Synced directly with Resend API." : "Full database audit tracking active."} Resets daily at <strong className="text-zinc-200">00:00 UTC</strong>.
                </p>
              </div>

              <div className="text-right shrink-0">
                <div className="text-2xl font-extrabold font-mono text-white tracking-tight">
                  {emailUsage.total_sent} <span className="text-sm font-normal text-zinc-500">/ {emailUsage.limit}</span>
                </div>
                <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                  {emailUsage.remaining_global} emails remaining today
                </div>
                {!emailUsage.is_resend_live && (
                  <div className="flex items-center gap-2 mt-1.5 justify-end">
                    <button
                      onClick={() => {
                        setCustomEmailCount(emailUsage.total_sent.toString());
                        setShowSyncEmailModal(true);
                      }}
                      className="text-[10px] font-mono font-bold text-zinc-400 hover:text-cyan-400 border border-zinc-800 hover:border-cyan-500/40 bg-zinc-950 px-2 py-0.5 rounded transition flex items-center gap-1 cursor-pointer"
                      title="Manually calibrate today's total count to match resend.com"
                    >
                      <span>⚙️ Calibrate Count</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-3 rounded-full bg-zinc-950 border border-zinc-800 overflow-hidden mb-4">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  emailUsage.usage_percent < 70
                    ? "bg-emerald-500"
                    : emailUsage.usage_percent < 90
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
                style={{ width: `${Math.min(100, Math.max(2, emailUsage.usage_percent))}%` }}
              />
            </div>

            {/* Category Breakdown Badges */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800/80 text-zinc-300 flex items-center gap-1.5 font-mono">
                <span>🚀 SIH Broadcast:</span>
                <strong className="text-orange-400">{emailUsage.categories.sih_broadcast}</strong>
              </div>
              <div className="px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800/80 text-zinc-300 flex items-center gap-1.5 font-mono">
                <span>📤 Outreach Pitches:</span>
                <strong className="text-blue-400">{emailUsage.categories.outreach}</strong>
              </div>
              {emailUsage.categories.test_dispatches > 0 && (
                <div className="px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800/80 text-zinc-300 flex items-center gap-1.5 font-mono">
                  <span>🧪 Sandbox / Pre-broadcast Testing:</span>
                  <strong className="text-amber-400">{emailUsage.categories.test_dispatches}</strong>
                </div>
              )}
              <div className="px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800/80 text-zinc-300 flex items-center gap-1.5 font-mono">
                <span>🔔 Notifications & Invites:</span>
                <strong className="text-emerald-400">{emailUsage.categories.notifications}</strong>
              </div>
              <div className="px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800/80 text-zinc-300 flex items-center gap-1.5 font-mono">
                <span>📢 Organizer Broadcasts:</span>
                <strong className="text-purple-400">{emailUsage.categories.organizer_broadcasts}</strong>
              </div>
              <div className="px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800/80 text-zinc-300 flex items-center gap-1.5 font-mono">
                <span>📊 Admin Daily Digests:</span>
                <strong className="text-cyan-400">{emailUsage.categories.admin_reports}</strong>
              </div>
              <div className="px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800/80 text-zinc-300 flex items-center gap-1.5 font-mono">
                <span>⚡ Onboarding Nudges:</span>
                <strong className="text-rose-400">{emailUsage.categories.onboarding_nudges}</strong>
              </div>
              {emailUsage.categories.contact_submissions > 0 && (
                <div className="px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800/80 text-zinc-300 flex items-center gap-1.5 font-mono">
                  <span>📩 Contact Forms:</span>
                  <strong className="text-pink-400">{emailUsage.categories.contact_submissions}</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Email Analytics & Delivery Health Widget */}
        {emailAnalytics && (
          <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-lg relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Resend Delivery & Engagement Health
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    Live Webhooks Active
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Real-time webhook events for delivery, open rate, clicks, and bounce monitoring.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-center px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400 font-mono uppercase">Delivery Rate</div>
                  <div className="text-sm font-bold font-mono text-emerald-400">{emailAnalytics.deliveryRate}</div>
                </div>
                <div className="text-center px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400 font-mono uppercase">Open Rate</div>
                  <div className="text-sm font-bold font-mono text-cyan-400">{emailAnalytics.openRate}</div>
                </div>
                <div className="text-center px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400 font-mono uppercase">Click Rate</div>
                  <div className="text-sm font-bold font-mono text-purple-400">{emailAnalytics.clickRate}</div>
                </div>
              </div>
            </div>

            {/* Event Metrics Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-mono">✅ Delivered</span>
                <span className="text-sm font-bold font-mono text-emerald-400">{emailAnalytics.delivered}</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-mono">👁️ Opened</span>
                <span className="text-sm font-bold font-mono text-cyan-400">{emailAnalytics.opened}</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-mono">🖱️ Clicked</span>
                <span className="text-sm font-bold font-mono text-purple-400">{emailAnalytics.clicked}</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-mono">⚠️ Bounced</span>
                <span className={`text-sm font-bold font-mono ${emailAnalytics.bounced > 0 ? "text-rose-400" : "text-zinc-400"}`}>{emailAnalytics.bounced}</span>
              </div>
            </div>

            {/* Recent Webhook Events Log */}
            {recentWebhookEvents.length > 0 && (
              <div className="mt-4 pt-4 border-t border-zinc-800/80">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 mb-2.5">
                  Recent Email Events Stream ({recentWebhookEvents.length})
                </h3>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {recentWebhookEvents.slice(0, 10).map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between p-2 rounded-lg bg-zinc-950 border border-zinc-800/60 text-xs font-mono">
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                          ev.event_type === "delivered"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : ev.event_type === "opened"
                            ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                            : ev.event_type === "clicked"
                            ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                            : ev.event_type === "bounced"
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            : "bg-zinc-800 text-zinc-300"
                        }`}>
                          {ev.event_type}
                        </span>
                        <span className="text-zinc-200 truncate max-w-[200px] sm:max-w-xs">{ev.recipient_email}</span>
                        {ev.subject && <span className="text-zinc-500 truncate hidden md:inline">— {ev.subject}</span>}
                      </div>
                      <span className="text-[10px] text-zinc-500 shrink-0">
                        {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Native Hackathons Approvals & Delete Management */}
        {activeTab === "native_hackathons" && (
          <div className="space-y-6">
            {/* Status Metrics Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                <div className="text-2xl font-extrabold text-white font-mono">
                  {nativeHackathons.length}
                </div>
                <div className="text-xs font-semibold text-zinc-400">Total Native Hackathons</div>
                <div className="text-[10px] text-zinc-500 font-mono">Host Portal Submissions</div>
              </div>

              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-1">
                <div className="text-2xl font-extrabold text-amber-400 font-mono">
                  {nativeHackathons.filter((h) => h.status === "pending").length}
                </div>
                <div className="text-xs font-semibold text-amber-300">Pending Admin Approval</div>
                <div className="text-[10px] text-amber-500/80 font-mono">Requires Action</div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-1">
                <div className="text-2xl font-extrabold text-emerald-400 font-mono">
                  {nativeHackathons.filter((h) => h.status === "approved").length}
                </div>
                <div className="text-xs font-semibold text-emerald-300">Approved & Live</div>
                <div className="text-[10px] text-emerald-500/80 font-mono">Public Directory</div>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNativeFilterStatus("all")}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition ${
                    nativeFilterStatus === "all"
                      ? "bg-purple-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  All ({nativeHackathons.length})
                </button>
                <button
                  onClick={() => setNativeFilterStatus("pending")}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition ${
                    nativeFilterStatus === "pending"
                      ? "bg-amber-500 text-zinc-950"
                      : "bg-zinc-800 text-amber-400 hover:text-amber-300"
                  }`}
                >
                  Pending ⏳ ({nativeHackathons.filter((h) => h.status === "pending").length})
                </button>
                <button
                  onClick={() => setNativeFilterStatus("approved")}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition ${
                    nativeFilterStatus === "approved"
                      ? "bg-emerald-500 text-zinc-950"
                      : "bg-zinc-800 text-emerald-400 hover:text-emerald-300"
                  }`}
                >
                  Approved ✅ ({nativeHackathons.filter((h) => h.status === "approved").length})
                </button>
                <button
                  onClick={() => setNativeFilterStatus("rejected")}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition ${
                    nativeFilterStatus === "rejected"
                      ? "bg-rose-600 text-white"
                      : "bg-zinc-800 text-rose-400 hover:text-rose-300"
                  }`}
                >
                  Rejected 🚨 ({nativeHackathons.filter((h) => h.status === "rejected").length})
                </button>
              </div>

              <button
                onClick={() => fetchNativeHackathons()}
                className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 transition flex items-center gap-1.5 cursor-pointer"
              >
                🔄 Refresh List
              </button>
            </div>

            {/* Table */}
            {loadingNativeHackathons ? (
              <div className="py-16 text-center text-zinc-500 flex flex-col items-center gap-2">
                <span className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span className="font-mono text-xs">Loading Native Hackathons...</span>
              </div>
            ) : nativeHackathons.filter((h) => nativeFilterStatus === "all" || h.status === nativeFilterStatus).length === 0 ? (
              <div className="p-12 text-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 text-zinc-500 font-mono text-xs">
                No native hackathons found matching selected filter.
              </div>
            ) : (
              <div className="overflow-x-auto border border-zinc-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-900 text-zinc-400 font-mono text-[11px] border-b border-zinc-800">
                      <th className="p-4">Hackathon Title</th>
                      <th className="p-4">Organizer / Host</th>
                      <th className="p-4">Mode & Location</th>
                      <th className="p-4">Prize Pool</th>
                      <th className="p-4 text-center">Status</th>
                      <th className="p-4 text-right">Admin Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 font-sans">
                    {nativeHackathons
                      .filter((h) => nativeFilterStatus === "all" || h.status === nativeFilterStatus)
                      .map((h) => (
                        <tr key={h.id} className="hover:bg-zinc-900/50 transition">
                          <td className="p-4 font-bold text-white max-w-xs">
                            <div>{h.name}</div>
                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                              Type: <span className="uppercase text-purple-400 font-semibold">{h.type || "native"}</span>
                              {h.college && ` • ${h.college}`}
                            </div>
                          </td>

                          <td className="p-4">
                            <div className="font-medium text-zinc-200">{h.organizerName}</div>
                            <div className="text-[10px] text-zinc-500 font-mono">{h.organizerEmail}</div>
                          </td>

                          <td className="p-4 font-mono text-xs text-zinc-300">
                            <span className="capitalize">{h.mode || "Online"}</span>
                            {h.location && <span className="text-zinc-500 text-[10px] block">{h.location}</span>}
                          </td>

                          <td className="p-4 font-mono font-bold text-emerald-400">
                            {h.prize_pool ? `${h.currency || "INR"} ${h.prize_pool}` : "N/A"}
                          </td>

                          <td className="p-4 text-center">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase border ${
                                h.status === "approved"
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                  : h.status === "rejected"
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                  : "bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse"
                              }`}
                            >
                              {h.status || "pending"}
                            </span>
                          </td>

                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {h.status !== "approved" && (
                                <button
                                  onClick={() => handleNativeHackathonAction(h.id, "approve", h.name)}
                                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition text-xs cursor-pointer shadow-md"
                                >
                                  ✅ Approve
                                </button>
                              )}
                              {h.status !== "rejected" && (
                                <button
                                  onClick={() => handleNativeHackathonAction(h.id, "reject", h.name)}
                                  className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition text-xs cursor-pointer shadow-md"
                                >
                                  ❌ Reject
                                </button>
                              )}
                              <button
                                onClick={() => handleNativeHackathonAction(h.id, "delete", h.name)}
                                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition text-xs cursor-pointer shadow-md"
                                title="Permanently Delete Hackathon"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 1: Reports Logs */}
        {activeTab === "reports" && (
          <div className="space-y-4">
            {reports.length === 0 ? (
              <div className="card card-static p-12 text-center">
                <p className="text-zinc-500 text-xs">No pending user reports. Clear inbox!</p>
              </div>
            ) : (
              reports.map((rep) => (
                <div
                  key={rep.id}
                  className={`card card-static p-5 transition-all ${
                    rep.reportedBanned
                      ? "border-rose-950 bg-rose-950/5"
                      : "hover:border-zinc-800"
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-3.5 flex-1">
                      {/* Targets */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-zinc-400 font-medium">Reporter:</span>
                        <Link
                          href={`/profile/${rep.reporter_id}`}
                          className="text-white font-semibold hover:text-accent-green hover:underline transition-colors"
                        >
                          {rep.reporterName}
                        </Link>
                        <span className="text-[10px] text-zinc-500 font-mono">({rep.reporterEmail})</span>

                        <span className="text-zinc-500 mx-1">➔</span>

                        <span className="text-zinc-400 font-medium">Reported:</span>
                        <Link
                          href={`/profile/${rep.reported_id}`}
                          className="text-rose-400 font-semibold hover:text-rose-300 hover:underline transition-colors"
                        >
                          {rep.reportedName}
                        </Link>
                        <span className="text-[10px] text-zinc-500 font-mono">({rep.reportedEmail})</span>
                        {rep.reportedBanned && (
                          <span className="bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded px-1.5 py-0.5 text-[9px] uppercase font-mono tracking-wider font-semibold">
                            Banned
                          </span>
                        )}
                      </div>

                      {/* Reason & Content */}
                      <div>
                        <div className="text-[10px] uppercase font-mono tracking-wider text-amber-500 font-semibold mb-1">
                          Reason: {rep.reason}
                        </div>
                        <p className="text-xs text-zinc-300 bg-zinc-950/40 border border-zinc-900/60 rounded p-3 leading-relaxed">
                          {rep.details || "No details provided."}
                        </p>
                      </div>

                      {/* Date */}
                      <div className="text-[9px] text-zinc-600 font-mono">
                        Filed on: {new Date(rep.created_at).toLocaleString()}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-row md:flex-col gap-2 shrink-0 md:items-end justify-start md:justify-center">
                      <button
                        onClick={() =>
                          handleToggleBan(rep.reported_id, !!rep.reportedBanned, rep.reportedName || "User")
                        }
                        className={`text-[10px] font-mono uppercase tracking-wider py-1.5 px-3 rounded border font-semibold transition ${
                          rep.reportedBanned
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20"
                            : "bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20"
                        }`}
                      >
                        {rep.reportedBanned ? "Unban User" : "Ban User"}
                      </button>

                      <button
                        onClick={() => openWarningModal(rep.reported_id, rep.reportedName || "User")}
                        className="text-[10px] font-mono uppercase tracking-wider py-1.5 px-3 rounded border border-amber-500/20 hover:border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition"
                      >
                        Warn User
                      </button>

                      <button
                        onClick={() => handleDismissReport(rep.id)}
                        className="text-[10px] font-mono uppercase tracking-wider py-1.5 px-3 rounded border border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 text-zinc-400 hover:text-zinc-200 transition"
                      >
                        Dismiss Report
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Users List */}
        {activeTab === "users" && (
          <div className="space-y-4">
            {/* Search & Onboarding Filter */}
            <div className="flex flex-col md:flex-row items-center gap-3">
              <div style={{ position: "relative", flex: 1, width: "100%" }}>
                <input
                  type="text"
                  placeholder="Search registered builders by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input text-xs bg-zinc-950/50 border-zinc-900 focus:border-zinc-800"
                  style={{ paddingLeft: "34px", width: "100%", boxSizing: "border-box" }}
                />
                <div 
                  style={{ 
                    position: "absolute", 
                    left: "12px", 
                    top: "50%", 
                    transform: "translateY(-50%)", 
                    pointerEvents: "none",
                    color: "#71717a"
                  }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
              </div>

              {/* Onboarding Filter */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="flex bg-zinc-950 border border-zinc-900 rounded-lg p-1 select-none shrink-0 justify-center">
                  <button
                    onClick={() => setOnboardingFilter("all")}
                    className={`px-3 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition cursor-pointer ${
                      onboardingFilter === "all"
                        ? "bg-zinc-900 text-white shadow"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    All Users
                  </button>
                  <button
                    onClick={() => setOnboardingFilter("incomplete")}
                    className={`px-3 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition cursor-pointer ${
                      onboardingFilter === "incomplete"
                        ? "bg-zinc-900 text-white shadow"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Incomplete Onboarding ({users.filter((u) => !u.onboarding_completed).length})
                  </button>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setActiveTab("deleted_logs")}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider bg-rose-950/40 hover:bg-rose-900/50 text-rose-400 border border-rose-500/30 transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    title="View historical user account deletion audit log"
                  >
                    <span>🛡️ Account Exits Log ({deletedUserLogs.length})</span>
                  </button>

                  <button
                    onClick={handleNudgeAllIncomplete}
                    disabled={nudgingAll}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider bg-[#B4F461] hover:bg-[#a3e64f] text-black transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-md shadow-[#B4F461]/10 disabled:opacity-50"
                    title="Send manual onboarding email nudge to all users who haven't completed their profile"
                  >
                    <span>{nudgingAll ? "Sending Nudges..." : "⚡ Nudge All Incomplete"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* List */}
            <div className="card card-static overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-900 bg-zinc-950/40 text-zinc-500 font-mono uppercase tracking-wider text-[10px]">
                      <th className="p-4 font-semibold">User Details</th>
                      <th className="p-4 font-semibold">Registered</th>
                      <th className="p-4 font-semibold">Source</th>
                      <th className="p-4 font-semibold">Role</th>
                      <th className="p-4 font-semibold">Onboarding</th>
                      <th className="p-4 font-semibold">Ban Status</th>
                      <th className="p-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/60">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-zinc-500">
                          No users matching search query.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => (
                        <tr
                          key={u.id}
                          className={`transition-colors ${
                            u.is_banned
                              ? "bg-rose-950/5 hover:bg-rose-950/10"
                              : "hover:bg-zinc-900/20"
                          }`}
                        >
                          {/* Details */}
                          <td className="p-4">
                            <Link
                              href={`/profile/${u.id}`}
                              className="font-semibold text-white hover:text-accent-green hover:underline transition-colors block"
                            >
                              {u.full_name || "Unnamed"}
                            </Link>
                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{u.email}</div>
                          </td>

                          {/* Registered date */}
                          <td className="p-4 text-zinc-400 font-mono text-[10px]">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>

                          {/* Source */}
                          <td className="p-4">
                            {getReferralSourceBadge(u.referrer_source)}
                          </td>

                          {/* Role */}
                          <td className="p-4">
                            <span
                              className={`inline-block text-[9px] uppercase tracking-wider font-mono font-semibold rounded px-2 py-0.5 border ${
                                u.role === "admin"
                                  ? "bg-violet-500/10 text-violet-400 border-violet-500/20 shadow-[0_0_8px_rgba(139,92,246,0.1)]"
                                  : "bg-zinc-950 text-zinc-500 border-zinc-800"
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>

                          {/* Onboarding */}
                          <td className="p-4">
                            <span
                              className={`inline-block text-[9px] uppercase tracking-wider font-mono font-semibold rounded px-2 py-0.5 border ${
                                u.onboarding_completed
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              }`}
                            >
                              {u.onboarding_completed ? "Completed" : "Incomplete"}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="p-4">
                            <span
                              className={`inline-block text-[9px] uppercase tracking-wider font-mono font-semibold rounded px-2 py-0.5 border ${
                                u.is_banned
                                  ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              }`}
                            >
                              {u.is_banned ? "Suspended" : "Active"}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {!u.onboarding_completed && (
                                <button
                                  onClick={() => handleNudgeUser(u.id, u.full_name || u.email)}
                                  disabled={nudgingUserId === u.id}
                                  className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 font-bold transition cursor-pointer disabled:opacity-50"
                                  title="Send manual email onboarding nudge"
                                >
                                  {nudgingUserId === u.id ? "Nudging..." : "📧 Nudge"}
                                </button>
                              )}

                              <button
                                onClick={() => handleToggleRole(u.id, u.role, u.full_name || "User")}
                                className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded border border-zinc-800 hover:border-zinc-700 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                              >
                                {u.role === "admin" ? "Demote" : "Promote"}
                              </button>

                              <button
                                onClick={() => openWarningModal(u.id, u.full_name || "User")}
                                className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded border border-amber-500/20 hover:border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition cursor-pointer"
                              >
                                Warn
                              </button>

                              <button
                                onClick={() => handleToggleBan(u.id, u.is_banned, u.full_name || "User")}
                                className={`text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded border font-semibold transition cursor-pointer ${
                                  u.is_banned
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20"
                                }`}
                              >
                                {u.is_banned ? "Activate" : "Suspend"}
                              </button>

                              <button
                                onClick={() => handleDeleteUser(u.id, u.full_name || "User")}
                                className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded border border-rose-900/60 hover:border-rose-500 bg-rose-950/20 hover:bg-rose-600 text-rose-400 hover:text-white transition cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Deleted Users Audit Log */}
            <div className="card card-static p-6 mt-8">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-900">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🛡️</span>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">Deleted User Audit Logs (Account Exits)</h3>
                    <p className="text-[11px] text-zinc-400">Automatic DB trigger captures user email, name, and college upon account deletion.</p>
                  </div>
                </div>
                <button
                  onClick={loadDeletedUserLogs}
                  disabled={loadingDeletedLogs}
                  className="px-3 py-1 rounded text-[10px] font-mono uppercase bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
                >
                  {loadingDeletedLogs ? "Refreshing..." : "Refresh Audit Log"}
                </button>
              </div>

              {deletedUserLogs.length === 0 ? (
                <div className="p-6 text-center text-zinc-500 font-mono text-xs">
                  No user account deletions recorded since audit tracking was enabled.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-900 bg-zinc-950/40 text-zinc-500 font-mono uppercase tracking-wider text-[10px]">
                        <th className="p-3 font-semibold">User Details</th>
                        <th className="p-3 font-semibold">College / Institution</th>
                        <th className="p-3 font-semibold">Deleted Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/60 font-mono">
                      {deletedUserLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-rose-950/10 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-white">{log.full_name || "Unnamed Builder"}</div>
                            <div className="text-[10px] text-rose-400 mt-0.5">{log.email || "No Email"}</div>
                          </td>
                          <td className="p-3 text-zinc-300 text-[11px]">
                            {log.college || "Unspecified"}
                          </td>
                          <td className="p-3 text-zinc-400 text-[10px]">
                            {new Date(log.deleted_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Deleted Users Audit Log */}
        {activeTab === "deleted_logs" && (
          <div className="space-y-4">
            <div className="card card-static p-6">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-900">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">🛡️</span>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">Deleted User Audit Logs (Account Exits)</h3>
                    <p className="text-xs text-zinc-400 mt-0.5">Automatic DB trigger captures user email, name, and college upon account deletion.</p>
                  </div>
                </div>
                <button
                  onClick={loadDeletedUserLogs}
                  disabled={loadingDeletedLogs}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-mono uppercase bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white cursor-pointer transition font-bold"
                >
                  {loadingDeletedLogs ? "Refreshing..." : "⚡ Refresh Audit Log"}
                </button>
              </div>

              {deletedUserLogs.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 font-mono text-xs bg-zinc-950/40 rounded-xl border border-zinc-900">
                  <p className="text-zinc-400 font-bold text-sm mb-1">No Account Deletions Recorded Yet</p>
                  <p className="text-zinc-600">The audit trigger is actively listening. Any future user account deletion will automatically log the user's name, email, college, and exact deletion timestamp here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-900 bg-zinc-950/40 text-zinc-500 font-mono uppercase tracking-wider text-[10px]">
                        <th className="p-3.5 font-semibold">User Details</th>
                        <th className="p-3.5 font-semibold">College / Institution</th>
                        <th className="p-3.5 font-semibold">Deleted Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/60 font-mono">
                      {deletedUserLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-rose-950/10 transition-colors">
                          <td className="p-3.5">
                            <div className="font-bold text-white text-sm">{log.full_name || "Unnamed Builder"}</div>
                            <div className="text-xs text-rose-400 mt-0.5">{log.email || "No Email"}</div>
                          </td>
                          <td className="p-3.5 text-zinc-300 text-xs">
                            {log.college || "Unspecified Institution"}
                          </td>
                          <td className="p-3.5 text-zinc-400 text-xs">
                            {new Date(log.deleted_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Teams List */}
        {activeTab === "teams" && (
          <div className="space-y-4">
            {/* Search */}
            <div className="flex flex-col md:flex-row items-center gap-3">
              <div style={{ position: "relative", flex: 1, width: "100%" }}>
                <input
                  type="text"
                  placeholder="Search teams by name, description, or owner..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input text-xs bg-zinc-950/50 border-zinc-900 focus:border-zinc-800"
                  style={{ paddingLeft: "34px", width: "100%", boxSizing: "border-box" }}
                />
                <div 
                  style={{ 
                    position: "absolute", 
                    left: "12px", 
                    top: "50%", 
                    transform: "translateY(-50%)", 
                    pointerEvents: "none",
                    color: "#71717a"
                  }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* List */}
            <div className="card card-static overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-900 bg-zinc-950/40 text-zinc-500 font-mono uppercase tracking-wider text-[10px]">
                      <th className="p-4 font-semibold">Team Details</th>
                      <th className="p-4 font-semibold">Created</th>
                      <th className="p-4 font-semibold">Owner</th>
                      <th className="p-4 font-semibold">Members</th>
                      <th className="p-4 font-semibold">Affiliation</th>
                      <th className="p-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/60">
                    {filteredTeams.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-zinc-500">
                          No teams matching search query.
                        </td>
                      </tr>
                    ) : (
                      filteredTeams.map((t) => (
                        <tr
                          key={t.id}
                          className="hover:bg-zinc-900/20 transition-colors"
                        >
                          {/* Details */}
                          <td className="p-4">
                            <Link
                              href={`/teams/${t.id}`}
                              className="font-semibold text-white hover:text-accent-green hover:underline transition-colors"
                            >
                              {t.name}
                            </Link>
                            {t.description && (
                              <p className="text-[10px] text-zinc-400 mt-1 max-w-xs truncate">
                                {t.description}
                              </p>
                            )}
                          </td>

                          {/* Created Date */}
                          <td className="p-4 text-zinc-400 font-mono text-[10px]">
                            {new Date(t.created_at).toLocaleDateString()}
                          </td>

                          {/* Owner */}
                          <td className="p-4">
                            <Link
                              href={`/profile/${t.owner_id}`}
                              className="font-semibold text-white hover:text-accent-green hover:underline transition-colors"
                            >
                              {t.ownerName}
                            </Link>
                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{t.ownerEmail}</div>
                          </td>

                          {/* Members */}
                          <td className="p-4 font-mono text-zinc-300">
                            {t.team_members?.length || 0} / {t.max_members}
                          </td>

                          {/* Affiliation */}
                          <td className="p-4 space-y-1">
                            {t.college && (
                              <div className="text-[10px] text-zinc-400">
                                🏫 {t.college.split(" (")[0] || t.college}
                              </div>
                            )}
                            {t.team_hackathons?.map((th: any) => th.hackathons?.name).join(", ") ? (
                              <div className="text-[10px] text-accent-indigo">
                                🏆 {t.team_hackathons?.map((th: any) => th.hackathons?.name).join(", ")}
                              </div>
                            ) : t.hackathon_name ? (
                              <div className="text-[10px] text-accent-indigo">
                                🏆 {t.hackathon_name}
                              </div>
                            ) : null}
                          </td>

                          {/* Actions */}
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleDeleteTeam(t.id, t.name)}
                              className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded border border-rose-900/60 hover:border-rose-500 bg-rose-950/20 hover:bg-rose-600 text-rose-400 hover:text-white transition cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}



        {/* Tab 4: Organizer Outreach */}
        {activeTab === "outreach" && userEmail?.toLowerCase() === outreachAdminEmail.toLowerCase() && (
          <div className="space-y-6">
            {/* Outreach Action Bar */}
            <div className="card card-static p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-emerald-950/60 bg-emerald-950/10">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <span>Unstop Hackathon Lead Scraper & Outreach</span>
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                    Exclusive
                  </span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Discover upcoming hackathons on Unstop, extract organizer contacts, and send partnership pitches.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={openBulkPitchModal}
                  disabled={selectedLeadIds.size === 0}
                  className="btn btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white border-none shadow-lg shadow-amber-950/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>📲 Bulk Pitch</span>
                  {selectedLeadIds.size > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-950 text-amber-200 font-mono text-[10px] font-bold">
                      {selectedLeadIds.size}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSyncGmailReplies}
                  disabled={syncingGmail}
                  className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 border-violet-900/60 hover:border-violet-500/60 text-violet-300 bg-violet-950/30 cursor-pointer"
                  title="Scan Gmail inbox for organizer replies and auto-update CRM lead status"
                >
                  {syncingGmail ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                      <span>Scanning Inbox...</span>
                    </>
                  ) : (
                    <>
                      <span>📬 Sync Gmail Replies</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSendSummaryPdf}
                  disabled={sendingSummaryPdf}
                  className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 border-emerald-900/60 hover:border-emerald-500/60 text-emerald-400 bg-emerald-950/30 cursor-pointer"
                >
                  {sendingSummaryPdf ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                      <span>Generating Summary PDF...</span>
                    </>
                  ) : (
                    <>
                      <span>📄 Send Summary PDF Email</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={loadLeads}
                  disabled={loadingLeads}
                  className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
                >
                  {loadingLeads ? "Loading..." : "Refresh List"}
                </button>

                <button
                  type="button"
                  onClick={handleRestoreLeads}
                  className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 border-amber-900/60 hover:border-amber-500/60 text-amber-300 bg-amber-950/20 cursor-pointer"
                  title="Restore all previously removed leads back to active list"
                >
                  <span>🔄 Restore Removed Leads</span>
                </button>

                <button
                  type="button"
                  onClick={handleScrapeUnstop}
                  disabled={fetchingUnstop}
                  className="btn btn-primary text-xs py-2 px-4 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white border-none shadow-lg shadow-emerald-950/50"
                >
                  {fetchingUnstop ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Scanning Platforms...</span>
                    </>
                  ) : (
                    <>
                      <span>🔍 Fetch Multi-Platform Leads</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Pipeline Stage Summary Funnel Bar */}
            <div className="flex flex-wrap items-center gap-2 p-3 bg-zinc-950/80 border border-zinc-900 rounded-xl">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === "all" ? "bg-zinc-800 text-white font-semibold shadow" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>📦 All Leads</span>
                <span className="px-1.5 py-0.2 rounded-full bg-zinc-900 text-zinc-300 text-[10px]">{leads.length}</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("new")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === "new" ? "bg-blue-950 text-blue-300 font-semibold border border-blue-800/80" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>📥 New (Pitch Ready)</span>
                <span className="px-1.5 py-0.2 rounded-full bg-blue-900/60 text-blue-200 text-[10px]">
                  {leads.filter((l) => (l.status === "new" || !l.status) && l.organizer_email).length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("no_email")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === "no_email" ? "bg-zinc-800 text-zinc-200 font-semibold border border-zinc-700" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>❓ Missing Email</span>
                <span className="px-1.5 py-0.2 rounded-full bg-zinc-900 text-zinc-400 text-[10px]">
                  {leads.filter((l) => l.status === "no_email" || (!l.organizer_email && l.status !== "partner_live" && l.status !== "archived")).length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("pitch_sent")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === "pitch_sent" ? "bg-amber-950 text-amber-300 font-semibold border border-amber-800/80" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>📤 Pitch Sent</span>
                <span className="px-1.5 py-0.2 rounded-full bg-amber-900/60 text-amber-200 text-[10px]">
                  {leads.filter((l) => (l.status === "pitch_sent" || l.pitch_sent_at) && !l.opened_at && l.status !== "replied" && l.status !== "negotiating" && l.status !== "partner_live").length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("opened")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === "opened" ? "bg-emerald-950 text-emerald-300 font-semibold border border-emerald-800/80" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>👁 Opened</span>
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-900/60 text-emerald-200 text-[10px]">
                  {leads.filter((l) => l.opened_at || (l.open_count && l.open_count > 0) || l.status === "opened").length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("replied")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === "replied" ? "bg-violet-950 text-violet-300 font-semibold border border-violet-800/80" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>💬 Replied</span>
                <span className="px-1.5 py-0.2 rounded-full bg-violet-900/60 text-violet-200 text-[10px]">
                  {leads.filter((l) => l.status === "replied").length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("negotiating")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === "negotiating" ? "bg-cyan-950 text-cyan-300 font-semibold border border-cyan-800/80" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>🤝 Negotiating</span>
                <span className="px-1.5 py-0.2 rounded-full bg-cyan-900/60 text-cyan-200 text-[10px]">
                  {leads.filter((l) => l.status === "negotiating").length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("partner_live")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === "partner_live" ? "bg-emerald-950 text-emerald-300 font-semibold border border-emerald-600" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>🚀 Partner Live</span>
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-900 text-emerald-200 text-[10px]">
                  {leads.filter((l) => l.status === "partner_live").length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("stale")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === "stale" ? "bg-rose-950 text-rose-300 font-semibold border border-rose-800/80" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>⚠️ Stale Leads</span>
                <span className="px-1.5 py-0.2 rounded-full bg-rose-900/60 text-rose-200 text-[10px]">
                  {leads.filter((l) => {
                    const act = l.updated_at || l.opened_at || l.pitch_sent_at || l.created_at;
                    const days = act ? Math.floor((Date.now() - new Date(act).getTime()) / 86400000) : 0;
                    return ["pitch_sent", "opened", "replied", "negotiating"].includes(l.status) && days >= 5;
                  }).length}
                </span>
              </button>
            </div>

            {/* Leads Pipeline Table */}
            <div className="card card-static p-0 overflow-hidden">
              <div className="p-4 border-b border-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/40">
                <div className="text-xs font-semibold text-zinc-300 flex flex-wrap items-center gap-1.5">
                  <span>Showing {leads.filter((l) => {
                    const matchesQuery =
                      l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (l.college_or_host && l.college_or_host.toLowerCase().includes(searchQuery.toLowerCase())) ||
                      (l.organizer_email && l.organizer_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
                      (l.notes && l.notes.toLowerCase().includes(searchQuery.toLowerCase()));

                    if (!matchesQuery) return false;

                    const act = l.updated_at || l.opened_at || l.pitch_sent_at || l.created_at;
                    const days = act ? Math.floor((Date.now() - new Date(act).getTime()) / 86400000) : 0;
                    const isStale = ["pitch_sent", "opened", "replied", "negotiating"].includes(l.status) && days >= 5;

                    if (statusFilter === "stale") return isStale;
                    if (statusFilter === "no_email") return l.status === "no_email" || !l.organizer_email;
                    if (statusFilter === "partner_live") return l.status === "partner_live";
                    if (statusFilter === "negotiating") return l.status === "negotiating";
                    if (statusFilter === "replied") return l.status === "replied";
                    if (statusFilter === "opened") return l.opened_at || (l.open_count && l.open_count > 0) || l.status === "opened";
                    if (statusFilter === "pitch_sent") return (l.status === "pitch_sent" || l.pitch_sent_at) && !l.opened_at;
                    if (statusFilter === "new") return (l.status === "new" || !l.status) && l.organizer_email;

                    return true;
                  }).length} of {leads.length} Leads</span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search titles, hosts, emails, notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input text-xs py-1.5 px-3 max-w-xs"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950 text-zinc-400 font-mono text-[10px] uppercase tracking-wider border-b border-zinc-900">
                    <tr>
                      <th className="p-4 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={leads.length > 0 && selectedLeadIds.size === leads.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLeadIds(new Set(leads.map((l) => l.id)));
                            } else {
                              setSelectedLeadIds(new Set());
                            }
                          }}
                          className="w-3.5 h-3.5 rounded border-zinc-800 text-amber-500 focus:ring-amber-500/20 cursor-pointer"
                        />
                      </th>
                      <th className="p-4">Hackathon & Host</th>
                      <th className="p-4">Pipeline Stage</th>
                      <th className="p-4">Last Activity / Stale Status</th>
                      <th className="p-4">Opens</th>
                      <th className="p-4">Organizer Email & Notes</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/60">
                    {leads.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-zinc-500 text-xs">
                          No Unstop hackathon leads found. Click <strong>"Fetch Multi-Platform Leads"</strong> to import live events!
                        </td>
                      </tr>
                    ) : (
                      leads
                        .filter((l) => {
                          const matchesQuery =
                            l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (l.college_or_host && l.college_or_host.toLowerCase().includes(searchQuery.toLowerCase())) ||
                            (l.organizer_email && l.organizer_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
                            (l.notes && l.notes.toLowerCase().includes(searchQuery.toLowerCase()));

                          if (!matchesQuery) return false;

                          const act = l.updated_at || l.opened_at || l.pitch_sent_at || l.created_at;
                          const days = act ? Math.floor((Date.now() - new Date(act).getTime()) / 86400000) : 0;
                          const isStale = ["pitch_sent", "opened", "replied", "negotiating"].includes(l.status) && days >= 5;

                          if (statusFilter === "stale") return isStale;
                          if (statusFilter === "no_email") return l.status === "no_email" || !l.organizer_email;
                          if (statusFilter === "partner_live") return l.status === "partner_live";
                          if (statusFilter === "negotiating") return l.status === "negotiating";
                          if (statusFilter === "replied") return l.status === "replied";
                          if (statusFilter === "opened") return l.opened_at || (l.open_count && l.open_count > 0) || l.status === "opened";
                          if (statusFilter === "pitch_sent") return (l.status === "pitch_sent" || l.pitch_sent_at) && !l.opened_at;
                          if (statusFilter === "new") return (l.status === "new" || !l.status) && l.organizer_email;

                          return true;
                        })
                        .map((lead) => {
                          const lastActivity = lead.updated_at || lead.opened_at || lead.pitch_sent_at || lead.created_at;
                          const daysSinceContact = lastActivity
                            ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
                            : 0;
                          const isStale = ["pitch_sent", "opened", "replied", "negotiating"].includes(lead.status) && daysSinceContact >= 5;

                          return (
                            <tr
                              key={lead.id}
                              className={`hover:bg-zinc-900/30 transition-colors ${
                                isStale ? "bg-rose-950/15 border-l-2 border-l-rose-500" : selectedLeadIds.has(lead.id) ? "bg-amber-950/10" : ""
                              }`}
                            >
                              <td className="p-4 text-center">
                                <input
                                  type="checkbox"
                                  checked={selectedLeadIds.has(lead.id)}
                                  onChange={() => {
                                    setSelectedLeadIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(lead.id)) next.delete(lead.id);
                                      else next.add(lead.id);
                                      return next;
                                    });
                                  }}
                                  className="w-3.5 h-3.5 rounded border-zinc-800 text-amber-500 focus:ring-amber-500/20 cursor-pointer"
                                />
                              </td>

                              {/* Title & Host */}
                              <td className="p-4 max-w-xs">
                                <a
                                  href={lead.unstop_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold text-white hover:text-emerald-400 transition-colors flex items-center gap-1.5 group"
                                >
                                  <span className="line-clamp-1">{lead.title}</span>
                                  <span className="text-[10px] text-zinc-500 group-hover:text-emerald-400">↗</span>
                                </a>
                                <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                                  🏫 {lead.college_or_host || "Independent Host"} • {lead.event_date || "Upcoming"}
                                </p>
                              </td>

                              {/* Pipeline Stage Select */}
                              <td className="p-4">
                                <select
                                  value={lead.status || (lead.organizer_email ? "new" : "no_email")}
                                  onChange={(e) => handleUpdateLeadStatus(lead.id, e.target.value)}
                                  className={`text-xs py-1 px-2.5 rounded font-mono font-medium border cursor-pointer ${
                                    lead.status === "partner_live"
                                      ? "bg-emerald-950 text-emerald-300 border-emerald-600"
                                      : lead.status === "negotiating"
                                      ? "bg-cyan-950 text-cyan-300 border-cyan-800"
                                      : lead.status === "replied"
                                      ? "bg-violet-950 text-violet-300 border-violet-800"
                                      : lead.status === "opened"
                                      ? "bg-emerald-950/70 text-emerald-400 border-emerald-800"
                                      : lead.status === "pitch_sent"
                                      ? "bg-amber-950/70 text-amber-300 border-amber-800"
                                      : lead.status === "no_email"
                                      ? "bg-zinc-900 text-zinc-400 border-zinc-800"
                                      : "bg-blue-950/70 text-blue-300 border-blue-800"
                                  }`}
                                >
                                  <option value="new">📥 New Lead</option>
                                  <option value="no_email">❓ Missing Email</option>
                                  <option value="pitch_sent">📤 Pitch Sent</option>
                                  <option value="opened">👁 Opened</option>
                                  <option value="replied">💬 Replied</option>
                                  <option value="negotiating">🤝 Negotiating</option>
                                  <option value="partner_live">🚀 Partner Live</option>
                                  <option value="declined">❌ Declined / Archived</option>
                                </select>
                              </td>

                              {/* Last Activity & Stale Warning */}
                              <td className="p-4 font-mono text-[11px]">
                                {isStale ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/90 text-rose-300 border border-rose-700/80 font-bold animate-pulse">
                                    ⚠️ STALE ({daysSinceContact}d)
                                  </span>
                                ) : (
                                  <span className="text-zinc-400">
                                    {daysSinceContact === 0 ? "Today" : `${daysSinceContact}d ago`}
                                  </span>
                                )}
                                <div className="text-[10px] text-zinc-500 mt-0.5">
                                  {lastActivity ? new Date(lastActivity).toLocaleDateString() : "No activity"}
                                </div>
                              </td>

                              {/* Opens Count */}
                              <td className="p-4 font-mono text-[11px]">
                                {lead.open_count && lead.open_count > 0 ? (
                                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                    <span>👁 {lead.open_count}x</span>
                                  </span>
                                ) : (
                                  <span className="text-zinc-600">0</span>
                                )}
                              </td>

                              {/* Email & Notes */}
                              <td className="p-4 font-mono text-[11px] max-w-xs">
                                {lead.organizer_email ? (
                                  <div className="truncate text-zinc-200" title={lead.organizer_email}>
                                    {lead.organizer_email}
                                  </div>
                                ) : (
                                  <div className="text-zinc-500 italic">No email listed</div>
                                )}
                                {lead.notes && (
                                  <p className="text-[10px] text-amber-300/90 font-sans italic mt-1 line-clamp-1" title={lead.notes}>
                                    📝 {lead.notes}
                                  </p>
                                )}
                              </td>

                              {/* Action Buttons */}
                              <td className="p-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openEditNotesModal(lead)}
                                    title="Edit Lead Notes & Email"
                                    className="text-[10px] font-mono uppercase tracking-wider py-1 px-2 rounded border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 text-zinc-300 hover:text-white transition cursor-pointer"
                                  >
                                    📝 Notes
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => openPitchModal(lead)}
                                    className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded border border-emerald-900/60 hover:border-emerald-500 bg-emerald-950/30 hover:bg-emerald-600 text-emerald-400 hover:text-white transition cursor-pointer"
                                  >
                                    {lead.status === "pitch_sent" || lead.status === "replied" ? "Re-pitch" : "Pitch"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleRemoveLead(lead.id, lead.title)}
                                    title="Remove lead"
                                    className="text-[10px] font-mono uppercase tracking-wider py-1 px-2 rounded border border-rose-900/40 hover:border-rose-500/60 bg-rose-950/20 hover:bg-rose-950/50 text-rose-400 hover:text-rose-200 transition cursor-pointer"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Partnering Organizers */}
        {activeTab === "partnering" && userEmail?.toLowerCase() === outreachAdminEmail.toLowerCase() && (
          <div className="space-y-6">
            <div className="card card-static p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-amber-950/60 bg-amber-950/10">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <span>Partnering Organizers & Co-Branded Portals</span>
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-800/60">
                    {leads.filter((l) => l.status === "replied").length} Partnered Events
                  </span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Organizers who responded to outreach. Access live partner portals or provision new custom co-branded pages in 1 click.
                </p>
              </div>
            </div>

            {leads.filter((l) => l.status === "replied").length === 0 ? (
              <div className="card card-static p-12 text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-500 flex items-center justify-center mx-auto mb-3 text-xl">
                  🤝
                </div>
                <p className="text-zinc-400 text-sm font-medium">No Partnering Organizers Yet</p>
                <p className="text-zinc-500 text-xs mt-1">
                  When an organizer lead is marked as "Replied" in the Outreach tab, they will automatically appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {leads
                  .filter((l) => l.status === "replied")
                  .map((lead) => {
                    const matchingHackathon = allHackathons.find(
                      (h) => h.id === lead.id || h.name === lead.title || (h.website_url && h.website_url === lead.unstop_url)
                    );
                    const partnerConfig = matchingHackathon ? partnerConfigsMap[matchingHackathon.id] : null;
                    const isCreating = creatingPortalId === lead.id;

                    return (
                      <div
                        key={lead.id}
                        className="card card-static p-5 flex flex-col justify-between space-y-4 border-zinc-800/80 hover:border-zinc-700 transition"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                              Replied & Partnered ✓
                            </span>
                            {partnerConfig ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                Portal Active (/partners/{partnerConfig.slug})
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                Portal Not Created
                              </span>
                            )}
                          </div>

                          <h4 className="text-sm font-semibold text-white leading-snug">{lead.title}</h4>
                          <p className="text-xs text-zinc-400 mt-1">🏫 {lead.college_or_host || "Independent Host"}</p>
                          <div className="text-[11px] font-mono text-zinc-400 mt-2 space-y-1">
                            <div>✉️ {lead.organizer_email || "No email"}</div>
                            {lead.unstop_url && (
                              <div>
                                🔗{" "}
                                <a
                                  href={lead.unstop_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-emerald-400 hover:underline"
                                >
                                  View Source Event Page ↗
                                </a>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="pt-4 border-t border-zinc-900/80 flex flex-wrap items-center justify-between gap-2">
                          {partnerConfig ? (
                            <Link
                              href={`/partners/${partnerConfig.slug}`}
                              target="_blank"
                              className="btn btn-primary text-xs py-1.5 px-3 flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white border-none shadow cursor-pointer"
                            >
                              <span>View Partner Portal →</span>
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCreatePartnerPortal(lead)}
                              disabled={isCreating}
                              className="btn btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border-none shadow cursor-pointer disabled:opacity-50"
                            >
                              {isCreating ? (
                                <>
                                  <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                  <span>Creating Portal...</span>
                                </>
                              ) : (
                                <>
                                  <span>+ 1-Click Create Partner Portal</span>
                                </>
                              )}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemovePartnerLead(lead)}
                            className="text-[11px] font-mono uppercase tracking-wider text-rose-400 hover:text-rose-300 py-1 px-2.5 rounded border border-rose-900/40 hover:border-rose-700 bg-rose-950/20 cursor-pointer transition"
                          >
                            Remove Partner
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Active Partner Portals Section (With Team Composition & Broadcast Controls) */}
            <div className="space-y-4 pt-6 border-t border-zinc-900">
              <h4 className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <span>Active Partner Portals ({partnerConfigsList.length})</span>
                <span className="text-[10px] text-zinc-500 font-normal">
                  (Live Team Composition & Announcement Broadcast Controls)
                </span>
              </h4>

              {partnerConfigsList.length === 0 ? (
                <div className="card card-static p-6 text-center text-xs text-zinc-500">
                  No active partner configs found in database.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {partnerConfigsList.map((pc) => (
                    <div
                      key={pc.id}
                      className="card card-static p-5 flex flex-col justify-between space-y-4 border-amber-500/20 bg-amber-950/10 hover:border-amber-500/40 transition"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            /partners/{pc.slug}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[150px]" title={pc.hackathon_id}>
                            ID: {pc.hackathon_id.slice(0, 8)}...
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white">{pc.partner_name}</h4>
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{pc.tagline}</p>
                      </div>

                      <div className="pt-3 border-t border-zinc-900 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => openPartnerCompositionModal(pc)}
                          className="btn btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 bg-[#B4F461] hover:bg-[#a3e64f] text-black border-none font-bold shadow cursor-pointer"
                        >
                          <span>📊 Team Composition & Broadcast →</span>
                        </button>

                        <Link
                          href={`/partners/${pc.slug}`}
                          target="_blank"
                          className="text-[11px] font-mono text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <span>View Portal ↗</span>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SIH 2026 COLLEGE STATS TAB PANEL */}
        {activeTab === "sih_stats" && (
          <div className="space-y-6">
            {/* Header Banner */}
            <div className="card card-static p-6 border-orange-500/30 bg-gradient-to-r from-zinc-950 via-orange-950/20 to-zinc-950 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-orange-400 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                  <span>NATIONAL TEAM BUILDING TELEMETRY</span>
                </div>
                <h2 className="text-xl font-extrabold text-white tracking-tight">
                  🇮🇳 Smart India Hackathon 2026 — College Breakdown
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Live college-wise breakdown of registered builders, active team searchers, team formations, and conversion bottlenecks.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                <button
                  type="button"
                  onClick={sendSIHPdfReport}
                  disabled={sendingSihPdf}
                  className="btn text-xs py-2 px-3 flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white font-bold cursor-pointer disabled:opacity-50 transition-all shadow-sm"
                >
                  {sendingSihPdf ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>📧 Email PDF Report</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={loadSIHStats}
                  disabled={loadingSihStats}
                  className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>🔄 Refresh Stats</span>
                </button>
              </div>

            </div>

            {loadingSihStats ? (
              <div className="card card-static p-16 text-center">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs text-zinc-400 font-mono">Loading SIH 2026 College Telemetry...</p>
              </div>
            ) : !sihStatsData ? (
              <div className="card card-static p-12 text-center text-xs text-zinc-500">
                Failed to load SIH college statistics.
              </div>
            ) : (
              <>
                {/* Summary Metrics Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="card card-static p-4 border-zinc-800 bg-zinc-900/50">
                    <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Total SIH Builders</div>
                    <div className="text-2xl font-extrabold text-white mt-1">{sihStatsData.summary.totalBuilders}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Registered participants</div>
                  </div>

                  <div className="card card-static p-4 border-amber-950/60 bg-amber-950/20">
                    <div className="text-[10px] font-mono text-amber-400 uppercase tracking-wider">Looking For Team</div>
                    <div className="text-2xl font-extrabold text-amber-300 mt-1">{sihStatsData.summary.totalLookingForTeam}</div>
                    <div className="text-[10px] text-amber-500/80 mt-0.5">Active searchers</div>
                  </div>

                  <div className="card card-static p-4 border-emerald-950/60 bg-emerald-950/20">
                    <div className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">SIH Teams Formed</div>
                    <div className="text-2xl font-extrabold text-emerald-300 mt-1">{sihStatsData.summary.totalTeams}</div>
                    <div className="text-[10px] text-emerald-500/80 mt-0.5">Created SIH teams</div>
                  </div>

                  <div className="card card-static p-4 border-sky-950/60 bg-sky-950/20">
                    <div className="text-[10px] font-mono text-sky-400 uppercase tracking-wider">Colleges Represented</div>
                    <div className="text-2xl font-extrabold text-sky-300 mt-1">{sihStatsData.summary.totalColleges}</div>
                    <div className="text-[10px] text-sky-500/80 mt-0.5">Unique institutions</div>
                  </div>

                  <div className="card card-static p-4 border-rose-950/60 bg-rose-950/20 col-span-2 md:col-span-1">
                    <div className="text-[10px] font-mono text-rose-400 uppercase tracking-wider">Bottleneck Colleges</div>
                    <div className="text-2xl font-extrabold text-rose-300 mt-1">{sihStatsData.summary.highPotentialZeroTeamColleges}</div>
                    <div className="text-[10px] text-rose-400/80 mt-0.5">2+ builders, 0 teams</div>
                  </div>
                </div>

                {/* Filter Controls */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSihCollegeFilter("all")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        sihCollegeFilter === "all"
                          ? "bg-zinc-100 text-zinc-900 shadow"
                          : "bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800"
                      }`}
                    >
                      All Colleges ({sihStatsData.collegeStats.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSihCollegeFilter("zero_teams")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                        sihCollegeFilter === "zero_teams"
                          ? "bg-amber-500 text-black shadow font-extrabold"
                          : "bg-amber-950/30 text-amber-400 hover:text-amber-300 border border-amber-800/60"
                      }`}
                    >
                      <span>⚠️ Conversion Bottlenecks ({sihStatsData.summary.highPotentialZeroTeamColleges})</span>
                    </button>
                  </div>

                  <div className="text-xs font-mono text-zinc-500">
                    Sorted by Builder Count Descending
                  </div>
                </div>

                {/* College Cards List */}
                <div className="space-y-4">
                  {sihStatsData.collegeStats
                    .filter((c: any) => sihCollegeFilter === "all" || c.isHighPotentialZeroTeams)
                    .map((c: any) => {
                      const isExpanded = expandedCollege === c.collegeName;

                      return (
                        <div
                          key={c.collegeName}
                          className={`card card-static p-5 transition border ${
                            c.isHighPotentialZeroTeams
                              ? "border-amber-500/50 bg-amber-950/10 shadow-lg shadow-amber-950/20"
                              : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                          }`}
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              {c.isHighPotentialZeroTeams && (
                                <div className="inline-flex items-center gap-1.5 rounded bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-[10px] font-mono font-bold text-amber-300 uppercase tracking-wider mb-2">
                                  <span>⚠️ HIGH BUILDER INTEREST (2+ BUILDERS) — ZERO TEAMS FORMED</span>
                                </div>
                              )}
                              <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <span>🏫 {c.collegeName}</span>
                              </h3>
                            </div>

                            {/* Metrics Grid */}
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-center">
                                <div className="text-[10px] font-mono text-zinc-400 uppercase">Builders</div>
                                <div className="text-sm font-extrabold text-white">{c.builderCount}</div>
                              </div>

                              <div className="px-3 py-1.5 rounded-lg bg-amber-950/30 border border-amber-800/60 text-center">
                                <div className="text-[10px] font-mono text-amber-400 uppercase">Looking for Team</div>
                                <div className="text-sm font-extrabold text-amber-300">{c.lookingForTeamCount}</div>
                              </div>

                              <div className="px-3 py-1.5 rounded-lg bg-emerald-950/30 border border-emerald-800/60 text-center">
                                <div className="text-[10px] font-mono text-emerald-400 uppercase">Teams</div>
                                <div className="text-sm font-extrabold text-emerald-300">{c.teamCount}</div>
                              </div>

                              <div className="px-3 py-1.5 rounded-lg bg-sky-950/30 border border-sky-800/60 text-center">
                                <div className="text-[10px] font-mono text-sky-400 uppercase">Avg Team Size</div>
                                <div className="text-sm font-extrabold text-sky-300">{c.avgTeamSize}</div>
                              </div>

                              <button
                                type="button"
                                onClick={() => setExpandedCollege(isExpanded ? null : c.collegeName)}
                                className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-mono text-zinc-300 cursor-pointer transition ml-2"
                              >
                                {isExpanded ? "Hide Roster ▲" : "View Roster ▼"}
                              </button>
                            </div>
                          </div>

                          {/* Collapsible Roster & Teams Details */}
                          {isExpanded && (
                            <div className="mt-4 pt-4 border-t border-zinc-900 grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Builders List */}
                              <div className="space-y-2">
                                <h4 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                                  Registered Builders ({c.builders.length})
                                </h4>
                                <div className="space-y-1.5">
                                  {c.builders.map((b: any) => (
                                    <div key={b.id} className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800 text-xs flex items-center justify-between">
                                      <div>
                                        <div className="font-bold text-white">{b.full_name || "Anonymous Builder"}</div>
                                        <div className="text-[10px] text-zinc-500 font-mono">{b.email}</div>
                                      </div>
                                      {b.looking_for_team && (
                                        <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                          Looking for Team
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Teams List */}
                              <div className="space-y-2">
                                <h4 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                                  Teams Created ({c.teams.length})
                                </h4>
                                {c.teams.length === 0 ? (
                                  <div className="p-4 text-center text-xs text-zinc-500 italic bg-zinc-900/40 rounded border border-zinc-900">
                                    No teams created for this college yet.
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {c.teams.map((t: any) => (
                                      <div key={t.id} className="p-2.5 rounded bg-emerald-950/20 border border-emerald-900/40 text-xs space-y-1">
                                        <div className="flex items-center justify-between font-bold text-white">
                                          <span>{t.name}</span>
                                          <span className="text-[10px] font-mono text-emerald-400">
                                            {(t.team_members || []).length} / {t.max_members} members
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-zinc-400 line-clamp-1">{t.description || "No description"}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        )}

        {/* BADGES TAB PANEL */}
        {activeTab === "badges" && (
          <div className="card card-static p-6 max-w-3xl mx-auto border-blue-500/30 bg-gradient-to-b from-blue-950/20 via-zinc-950 to-zinc-950">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 font-bold text-lg">
                🏆
              </span>
              <div>
                <h2 className="text-base font-bold text-white">Partner & Winner Badge Issuer</h2>
                <p className="text-xs text-zinc-400">Bulk grant verified profile badges & certificates to hackathon winners from CSV/email list.</p>
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleIssueBadges(); }} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1">
                  Target Hackathon ID
                </label>
                <input
                  type="text"
                  value={badgeFormHackathonId}
                  onChange={(e) => setBadgeFormHackathonId(e.target.value)}
                  placeholder="e.g. 00000000-0000-0000-0000-000001703933"
                  className="input text-xs font-mono w-full"
                  required
                />
                <span className="text-[10px] text-zinc-500 font-mono mt-1 block">
                  Default pre-filled ID corresponds to <strong>All India Hackathon (Axcentra)</strong>.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1">
                    Badge Name
                  </label>
                  <input
                    type="text"
                    value={badgeFormName}
                    onChange={(e) => setBadgeFormName(e.target.value)}
                    placeholder="Verified Winner — All India Hackathon 2026"
                    className="input text-xs w-full"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1">
                    Issuer Name
                  </label>
                  <input
                    type="text"
                    value={badgeFormIssuer}
                    onChange={(e) => setBadgeFormIssuer(e.target.value)}
                    placeholder="HackerMate x Axcentra"
                    className="input text-xs w-full"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1">
                    Badge Type
                  </label>
                  <select
                    value={badgeFormType}
                    onChange={(e) => setBadgeFormType(e.target.value)}
                    className="input text-xs w-full"
                  >
                    <option value="verified_winner">verified_winner</option>
                    <option value="finalist">finalist</option>
                    <option value="participant">participant</option>
                    <option value="special_award">special_award</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1">
                    Rank Title (Display Badge Chip)
                  </label>
                  <input
                    type="text"
                    value={badgeFormRank}
                    onChange={(e) => setBadgeFormRank(e.target.value)}
                    placeholder="1st Place / Track Winner / Verified Winner"
                    className="input text-xs w-full"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1">
                  Winner User Email Addresses (One per line or comma-separated)
                </label>
                <textarea
                  value={badgeFormEmails}
                  onChange={(e) => setBadgeFormEmails(e.target.value)}
                  rows={6}
                  placeholder={`winner1@example.com\nwinner2@example.com\nwinner3@example.com`}
                  className="input text-xs font-mono w-full resize-y"
                  required
                />
              </div>

              {badgeIssuerResult && (
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs">
                  <p className="text-blue-400 font-bold">
                    ✓ Granted {badgeIssuerResult.granted} badge(s) to registered user profiles.
                  </p>
                  {badgeIssuerResult.missingEmails.length > 0 && (
                    <div className="mt-2 text-amber-400">
                      <p className="font-semibold">⚠️ {badgeIssuerResult.missingEmails.length} email(s) not registered on HackerMate yet:</p>
                      <p className="text-[11px] font-mono mt-1 text-zinc-400 break-all">
                        {badgeIssuerResult.missingEmails.join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={submittingBadges || !badgeFormEmails.trim()}
                  className="btn btn-primary px-6 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 bg-[#B4F461] text-black hover:bg-[#a3e64f]"
                >
                  {submittingBadges ? "Granting Badges..." : "🏆 Bulk Issue Badges & Certificates"}
                </button>
              </div>
            </form>

            {/* Issued Badges & Revocation Management Directory */}
            <div className="mt-8 pt-6 border-t border-zinc-900">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Issued Badges & Certificate Directory</span>
                    <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 font-normal">
                      {issuedBadges.length} total
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Manage, inspect, and revoke granted badges. Revoking permanently deletes the badge record and invalidates certificate verification.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={fetchIssuedBadges}
                  disabled={loadingBadges}
                  className="btn btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  <span>🔄 Refresh List</span>
                </button>
              </div>

              {loadingBadges ? (
                <div className="p-8 text-center text-xs text-zinc-500 font-mono">
                  Loading issued badges directory...
                </div>
              ) : issuedBadges.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500 card card-static border-dashed border-zinc-800">
                  No issued badges found in database.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider bg-zinc-950/60 border-b border-zinc-900">
                      <tr>
                        <th className="p-3">Recipient</th>
                        <th className="p-3">Badge Title & Rank</th>
                        <th className="p-3">Hackathon</th>
                        <th className="p-3">Certificate ID</th>
                        <th className="p-3">Issued Date</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      {issuedBadges.map((b) => {
                        const recipientName = b.profiles?.full_name || "Unknown User";
                        const recipientEmail = b.profiles?.email || b.user_id;
                        const certId = b.metadata?.certificate_id || `HM-CERT-${b.id.slice(0, 8).toUpperCase()}`;

                        return (
                          <tr key={b.id} className="hover:bg-zinc-900/40 transition-colors">
                            <td className="p-3">
                              <div className="font-bold text-white">{recipientName}</div>
                              <div className="text-[10px] text-zinc-500 font-mono">{recipientEmail}</div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-amber-400 font-bold">🏆</span>
                                <span className="font-bold text-white">{b.rank_title || b.badge_name}</span>
                              </div>
                              <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{b.badge_name}</div>
                            </td>
                            <td className="p-3">
                              <span className="text-zinc-300">{b.hackathons?.name || "All India Hackathon"}</span>
                            </td>
                            <td className="p-3 font-mono text-[11px] text-blue-400">
                              <Link href={`/api/certificates/verify/${certId}`} target="_blank" className="hover:underline">
                                {certId} ↗
                              </Link>
                            </td>
                            <td className="p-3 text-[11px] text-zinc-400">
                              {new Date(b.issued_at).toLocaleDateString()}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRevokeBadge(b)}
                                disabled={revokingBadgeId === b.id}
                                className="btn text-xs py-1.5 px-3 bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 font-bold transition cursor-pointer"
                              >
                                {revokingBadgeId === b.id ? "Revoking..." : "Revoke Badge 🗑️"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Practice Challenges Tab */}
        {activeTab === "challenges" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>⚡ Practice & System Design Challenges</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/20">
                    AI Evaluated
                  </span>
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Publish recurring problem statements, set biweekly active windows, and manage submission lifecycles.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={fetchAdminChallenges}
                  disabled={loadingAdminChallenges}
                  className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingAdminChallenges ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateChallengeModal(true)}
                  className="btn btn-primary text-xs py-2 px-4 flex items-center gap-1.5 bg-lime-500 hover:bg-lime-400 text-black font-bold border-none shadow-lg shadow-lime-500/20 cursor-pointer"
                >
                  <span>+ Create New Challenge</span>
                </button>
              </div>
            </div>

            {loadingAdminChallenges ? (
              <div className="p-12 text-center text-xs text-zinc-500 font-mono">
                Loading challenges list...
              </div>
            ) : adminChallenges.length === 0 ? (
              <div className="card p-12 text-center border-zinc-800 bg-zinc-950/60">
                <p className="text-xs text-zinc-400 mb-4">No practice challenges created yet.</p>
                <button
                  onClick={() => setShowCreateChallengeModal(true)}
                  className="btn btn-primary text-xs py-2 px-4 bg-lime-500 hover:bg-lime-400 text-black font-bold"
                >
                  Create Challenge #01
                </button>
              </div>
            ) : (
              <div className="card card-static border-zinc-800 bg-zinc-950/60 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 font-mono text-[10px] uppercase tracking-wider">
                      <th className="p-3">#</th>
                      <th className="p-3">Title & Track</th>
                      <th className="p-3">Difficulty</th>
                      <th className="p-3">Submissions</th>
                      <th className="p-3">Active Window</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {adminChallenges.map((ch) => (
                      <tr key={ch.id} className="hover:bg-zinc-900/40 transition">
                        <td className="p-3 font-mono font-bold text-lime-400">
                          #{ch.challenge_number}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-white line-clamp-1">{ch.title}</div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{ch.track}</div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-900 text-zinc-300 border border-zinc-800">
                            {ch.difficulty}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-zinc-300">
                          <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-lime-400 font-bold">
                            {ch.submissionCount || 0}
                          </span>
                        </td>
                        <td className="p-3 text-[10px] text-zinc-400 font-mono whitespace-nowrap">
                          {new Date(ch.starts_at).toLocaleDateString()} → {new Date(ch.ends_at).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${
                              ch.status === "active"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : ch.status === "closed"
                                ? "bg-zinc-800 text-zinc-400 border-zinc-700"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            }`}
                          >
                            {ch.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/challenges/${ch.slug}`}
                              target="_blank"
                              className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] transition"
                            >
                              View ↗
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleToggleChallengeStatus(ch)}
                              disabled={togglingChallengeId === ch.id}
                              className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition cursor-pointer ${
                                ch.status === "active"
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                              }`}
                            >
                              {togglingChallengeId === ch.id
                                ? "Updating..."
                                : ch.status === "active"
                                ? "Close"
                                : "Activate"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteChallenge(ch)}
                              className="px-2 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 text-[11px] transition cursor-pointer"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Challenge Modal */}
      {showCreateChallengeModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm p-4 sm:p-6 flex min-h-screen items-center justify-center animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl my-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 shrink-0">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>⚡ Create Practice Challenge</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">Define a recurring problem statement and active dates.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateChallengeModal(false)}
                className="text-zinc-500 hover:text-white transition p-1 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateChallenge} className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-zinc-400 font-mono text-[10px] uppercase mb-1">Challenge Title *</label>
                  <input
                    type="text"
                    required
                    value={newChTitle}
                    onChange={(e) => setNewChTitle(e.target.value)}
                    placeholder="e.g. Real-Time Emergency Patient Triage & Bed Allocation"
                    className="input w-full bg-zinc-900 border-zinc-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-mono text-[10px] uppercase mb-1">Number (Optional)</label>
                  <input
                    type="number"
                    value={newChNumber}
                    onChange={(e) => setNewChNumber(e.target.value)}
                    placeholder="Auto-incremented"
                    className="input w-full bg-zinc-900 border-zinc-800 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-zinc-400 font-mono text-[10px] uppercase mb-1">Track</label>
                  <select
                    value={newChTrack}
                    onChange={(e) => setNewChTrack(e.target.value)}
                    className="input w-full bg-zinc-900 border-zinc-800 text-white"
                  >
                    <option value="Full-Stack / AI">Full-Stack / AI</option>
                    <option value="FinTech">FinTech</option>
                    <option value="Cloud & Systems">Cloud & Systems</option>
                    <option value="Open Innovation">Open Innovation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 font-mono text-[10px] uppercase mb-1">Difficulty</label>
                  <select
                    value={newChDifficulty}
                    onChange={(e) => setNewChDifficulty(e.target.value)}
                    className="input w-full bg-zinc-900 border-zinc-800 text-white"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 font-mono text-[10px] uppercase mb-1">Initial Status</label>
                  <select
                    value={newChStatus}
                    onChange={(e) => setNewChStatus(e.target.value)}
                    className="input w-full bg-zinc-900 border-zinc-800 text-white font-mono"
                  >
                    <option value="active">Active (Live now)</option>
                    <option value="draft">Draft (Hidden)</option>
                    <option value="closed">Closed (Archive only)</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-zinc-400 font-mono text-[10px] uppercase">Short Summary (1-2 sentences) *</label>
                  <button
                    type="button"
                    onClick={() => {
                      const s = generateSummaryFromProblemText(newChProblem);
                      if (s) {
                        setNewChSummary(s);
                        showToast("Summary auto-generated from problem statement!", "success");
                      } else {
                        showToast("Please enter a problem statement first to auto-generate summary.", "info");
                      }
                    }}
                    className="text-[10px] font-semibold text-lime-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>🪄 Auto-Generate Summary</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={newChSummary}
                  onChange={(e) => setNewChSummary(e.target.value)}
                  placeholder="A concise 1-2 sentence hook displayed on the practice card"
                  className="input w-full bg-zinc-900 border-zinc-800 text-white"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono text-[10px] uppercase mb-1">Problem Statement (Markdown) *</label>
                <textarea
                  required
                  value={newChProblem}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewChProblem(val);
                    if (!newChSummary.trim() && val.length > 20) {
                      setNewChSummary(generateSummaryFromProblemText(val));
                    }
                  }}
                  rows={6}
                  placeholder="### Background&#10;Describe problem context...&#10;&#10;### Core Problem&#10;1. Intake vitals...&#10;2. Dynamic dispatch...&#10;&#10;### Key Requirements&#10;- Slide 1 to 6 deliverables..."
                  className="input w-full bg-zinc-900 border-zinc-800 text-white font-mono resize-y min-h-[120px] leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono text-[10px] uppercase mb-1">
                  Problem Statement PDF (Optional)
                </label>
                <div className="space-y-2 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePdfUploadForChallenge(f);
                      }}
                      className="text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
                    />
                    {newChPdfFile && (
                      <span className="text-[11px] text-lime-400 font-mono">
                        ✓ {newChPdfFile.name} ({(newChPdfFile.size / 1024).toFixed(0)} KB)
                      </span>
                    )}
                  </div>
                  <input
                    type="url"
                    value={newChPdfUrl}
                    onChange={(e) => setNewChPdfUrl(e.target.value)}
                    placeholder="Or paste direct PDF URL (e.g. https://.../problem_briefing.pdf)"
                    className="input w-full bg-zinc-900 border-zinc-800 text-white text-xs"
                  />
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">Optional: Attach an official PDF problem briefing document. Uploading extracts text and populates summary automatically.</p>
              </div>

              <div>
                <label className="block text-zinc-400 font-mono text-[10px] uppercase mb-1">
                  Additional Rules & Criteria (Optional)
                </label>
                <textarea
                  value={newChAdditionalRules}
                  onChange={(e) => setNewChAdditionalRules(e.target.value)}
                  rows={3}
                  placeholder="e.g.&#10;- Must detail cost breakdown for cloud hosting&#10;- Must support offline-first local cache fallback&#10;- Must provide latency benchmarks in Slide 3"
                  className="input w-full bg-zinc-900 border-zinc-800 text-white font-mono resize-y min-h-[70px] leading-relaxed text-xs"
                />
                <p className="text-[10px] text-zinc-500 mt-1">Optional: Custom challenge rules. The AI will automatically test and score submissions against these rules.</p>
              </div>

              <div>
                <label className="block text-zinc-400 font-mono text-[10px] uppercase mb-1">
                  Submission Celebration Reaction Theme (Optional)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: "default", name: "🎉 Party Popper", desc: "Pure 🎉 Party Poppers" },
                    { id: "rocket", name: "🚀 Speed Rocket", desc: "Pure 🚀 Floating Rockets" },
                    { id: "trophy", name: "🏆 Gold Trophy", desc: "Pure 🏆 Floating Trophies" },
                    { id: "ai", name: "🤖 AI Bot", desc: "Pure 🤖 Floating AI Bots" },
                    { id: "fire", name: "🔥 Pure Fire", desc: "Pure 🔥 Floating Flames" },
                    { id: "hundred", name: "💯 100 Score", desc: "Pure 💯 Floating Emblems" },
                  ].map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setNewChReactionTheme(theme.id)}
                      className={`p-2.5 rounded-xl text-left border transition cursor-pointer ${
                        newChReactionTheme === theme.id
                          ? "bg-lime-500/15 border-lime-500 text-white shadow-xs"
                          : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      <div className="text-xs font-bold text-zinc-200">{theme.name}</div>
                      <div className="text-[11px] mt-0.5 tracking-wider font-mono">{theme.desc}</div>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">Optional: Choose the Microsoft Teams-style animated reaction pack triggered when users submit this challenge.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-mono text-[10px] uppercase mb-1">Start Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={newChStartsAt}
                    onChange={(e) => setNewChStartsAt(e.target.value)}
                    className="input w-full bg-zinc-900 border-zinc-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-mono text-[10px] uppercase mb-1">End Date (Default: +14 days)</label>
                  <input
                    type="datetime-local"
                    value={newChEndsAt}
                    onChange={(e) => setNewChEndsAt(e.target.value)}
                    className="input w-full bg-zinc-900 border-zinc-800 text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-900 shrink-0 sticky bottom-0 bg-zinc-950 pb-1">
                <button
                  type="button"
                  onClick={() => setShowCreateChallengeModal(false)}
                  className="btn btn-secondary text-xs py-2 px-4 cursor-pointer"
                  disabled={creatingChallenge}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingChallenge}
                  className="btn btn-primary text-xs py-2 px-5 bg-lime-500 hover:bg-lime-400 text-black font-bold border-none shadow-lg shadow-lime-500/20 cursor-pointer"
                >
                  {creatingChallenge ? "Publishing..." : "Publish Practice Challenge"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Warning Modal */}
      {warningModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md card card-static p-6 animate-scale-in">
            <h3 className="text-sm font-semibold text-white mb-1.5">
              Send Warning Email to {warningTargetName}
            </h3>
            <p className="text-[10px] text-zinc-500 mb-4">
              This will send an official behavioral warning notification to their registered email address.
            </p>

            <textarea
              value={warningMessageText}
              onChange={(e) => setWarningMessageText(e.target.value)}
              rows={5}
              placeholder="Type warning details here..."
              className="input text-xs resize-none mb-4"
            />

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-900/60">
              <button
                type="button"
                onClick={() => setWarningModalOpen(false)}
                className="btn btn-secondary text-xs py-1.5 px-4"
                disabled={sendingWarning}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitWarningEmail}
                disabled={sendingWarning || !warningMessageText.trim()}
                className="btn btn-primary text-xs py-1.5 px-5 flex items-center gap-1.5"
              >
                {sendingWarning ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <span>Send Warning</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pitch Modal */}
      {pitchModalOpen && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-xl card card-static p-6 animate-scale-in border-emerald-950/80 bg-zinc-950">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>Pitch Partnership for {selectedLead.title}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                    Resend Email
                  </span>
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Review and customize the partnership email proposal before dispatching.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPitchModalOpen(false)}
                className="text-zinc-500 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Recipient Email */}
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
                  Organizer Email Address
                </label>
                <input
                  type="email"
                  value={pitchRecipientEmail}
                  onChange={(e) => setPitchRecipientEmail(e.target.value)}
                  placeholder="e.g. organizer@college.edu or techlead@hackathon.com"
                  className="input text-xs w-full font-mono"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
                  Email Subject
                </label>
                <input
                  type="text"
                  value={pitchSubject}
                  onChange={(e) => setPitchSubject(e.target.value)}
                  className="input text-xs w-full"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
                  Email Content (Plain text / Markdown)
                </label>
                <textarea
                  value={pitchBody}
                  onChange={(e) => setPitchBody(e.target.value)}
                  rows={9}
                  className="input text-xs font-sans resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-zinc-900">
              <div className="text-[10px] text-zinc-500 font-mono">
                ⚡ Resend free limit: 100 emails/day
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPitchModalOpen(false)}
                  className="btn btn-secondary text-xs py-1.5 px-4"
                  disabled={sendingPitch}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendPitch}
                  disabled={sendingPitch || !pitchRecipientEmail.trim() || !pitchSubject.trim()}
                  className="btn btn-primary text-xs py-1.5 px-5 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border-none shadow-lg shadow-emerald-950/50"
                >
                  {sendingPitch ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Sending Email...</span>
                    </>
                  ) : (
                    <>
                      <span>✉ Send Partnership Pitch</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Pitch Modal */}
      {bulkPitchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl card card-static p-6 animate-scale-in border-amber-950/80 bg-zinc-950">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>Bulk Pitch Dispatch — {selectedLeadIds.size} Leads Selected</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60">
                    Batch Mailer
                  </span>
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Send personalized email proposals to all selected organizers with rate-limiting protection.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkPitchModalOpen(false)}
                className="text-zinc-500 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Selected Target Summary */}
              <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded text-xs">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
                  Selected Recipient Targets ({selectedLeadIds.size}):
                </div>
                <div className="max-h-24 overflow-y-auto space-y-1 text-zinc-300 font-mono text-[11px] pr-2">
                  {leads
                    .filter((l) => selectedLeadIds.has(l.id))
                    .map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-2 border-b border-zinc-800/40 pb-0.5">
                        <span className="truncate max-w-[280px] font-sans font-medium text-white">{l.title}</span>
                        <span className="text-emerald-400 text-[10px]">{l.last_sent_to || l.organizer_email || "No email listed"}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
                  Email Subject
                </label>
                <input
                  type="text"
                  value={bulkPitchSubject}
                  onChange={(e) => setBulkPitchSubject(e.target.value)}
                  className="input text-xs w-full"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
                  Email Template Content (Markdown / Plain Text)
                </label>
                <textarea
                  value={bulkPitchBody}
                  onChange={(e) => setBulkPitchBody(e.target.value)}
                  rows={9}
                  className="input text-xs font-sans resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-zinc-900">
              <div className="text-[10px] text-zinc-500 font-mono">
                ⚡ Resend rate limit: 400ms delay per email
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setBulkPitchModalOpen(false)}
                  className="btn btn-secondary text-xs py-1.5 px-4"
                  disabled={bulkSending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkSend}
                  disabled={bulkSending || selectedLeadIds.size === 0 || !bulkPitchSubject.trim() || !bulkPitchBody.trim()}
                  className="btn btn-primary text-xs py-1.5 px-5 flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white border-none shadow-lg shadow-amber-950/50 cursor-pointer disabled:opacity-50"
                >
                  {bulkSending ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Dispatching Batch ({selectedLeadIds.size})...</span>
                    </>
                  ) : (
                    <>
                      <span>✉ Dispatch {selectedLeadIds.size} Pitch Emails</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lead Notes & Email Edit Modal */}
      {editingLeadNotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="card card-static w-full max-w-lg p-6 space-y-5 border-zinc-800 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>📝 Edit Lead CRM Details</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{editingLeadNotes.title}</p>
              </div>
              <button
                onClick={() => setEditingLeadNotes(null)}
                className="text-zinc-500 hover:text-white transition p-1 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-400 font-mono text-[10px] uppercase mb-1">Organizer Contact Email</label>
                <input
                  type="email"
                  value={leadEmailText}
                  onChange={(e) => setLeadEmailText(e.target.value)}
                  placeholder="e.g. organizer@hackathon.com"
                  className="input w-full bg-zinc-900 border-zinc-800 text-white"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Adding an email to a "Missing Email" lead automatically moves it to "New Lead (Pitch Ready)".
                </p>
              </div>

              <div>
                <label className="block text-zinc-400 font-mono text-[10px] uppercase mb-1">CRM Conversation Notes</label>
                <textarea
                  value={leadNotesText}
                  onChange={(e) => setLeadNotesText(e.target.value)}
                  placeholder="Record negotiation details, Telegram handles, custom requirements, or follow-up notes..."
                  rows={4}
                  className="input w-full bg-zinc-900 border-zinc-800 text-white resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-900">
              <button
                type="button"
                onClick={() => setEditingLeadNotes(null)}
                className="btn btn-secondary text-xs py-1.5 px-4"
                disabled={updatingLeadStatus}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  handleUpdateLeadStatus(editingLeadNotes.id, undefined, leadNotesText, leadEmailText)
                }
                disabled={updatingLeadStatus}
                className="btn btn-primary text-xs py-1.5 px-5 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border-none cursor-pointer"
              >
                {updatingLeadStatus ? "Saving..." : "Save CRM Details"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Partner Team Composition & Broadcast Modal */}
      {selectedPartnerModal && (
        <PartnerCompositionModal
          partnerConfig={selectedPartnerModal}
          analyticsData={partnerAnalyticsData}
          loading={loadingPartnerAnalytics}
          onClose={() => setSelectedPartnerModal(null)}
          onRefresh={() => openPartnerCompositionModal(selectedPartnerModal)}
          onSendBroadcast={handleSendPartnerBroadcast}
          sendingBroadcast={sendingPartnerBroadcast}
        />
      )}

      {/* Calibrate Email Count Modal */}
      {showSyncEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 002-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>Calibrate Daily Email Count</span>
              </h3>
              <button
                onClick={() => setShowSyncEmailModal(false)}
                className="text-zinc-400 hover:text-white transition cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Enter the exact sent email count shown for today on <a href="https://resend.com/emails" target="_blank" rel="noreferrer" className="text-cyan-400 underline hover:text-cyan-300">resend.com</a>. This updates your database baseline count for today so future emails stay 100% in sync.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-zinc-300 font-semibold">
                Today&apos;s Sent Count on Resend.com
              </label>
              <input
                type="number"
                min="0"
                max="1000"
                value={customEmailCount}
                onChange={(e) => setCustomEmailCount(e.target.value)}
                placeholder="e.g. 52"
                className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3.5 py-2 text-sm text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowSyncEmailModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={syncingEmailStats}
                onClick={handleSyncEmailStats}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {syncingEmailStats ? "Saving..." : "Save Baseline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminPage() {
  return (
    <AuthGuard adminOnly>
      <AdminContent />
    </AuthGuard>
  );
}
