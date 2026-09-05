"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import AuthGuard from "@/components/AuthGuard";
import type { EmailUsageSummary } from "@/lib/admin/emailBudgetGuard";
import type {
  Report,
  UserProfile,
  Team,
  OrganizerLead,
  NativeHackathon,
  DeletedUserLog,
  EmailAnalyticsStats,
  WebhookEvent,
  PartnerConfigRecord,
} from "./_types";
import PartnerCompositionModal from "@/components/PartnerCompositionModal";
import { StatusBadge } from "./_components/StatusBadge";
import { DEFAULT_HACKATHON_ID } from "@/lib/constants";
import {
  RefreshCw,
  ShieldAlert,
  Mail,
  SlidersHorizontal,
  Radio,
  Send,
  FlaskConical,
  Bell,
  Megaphone,
  FileText,
  Sparkles,
  Inbox,
  Activity,
  CheckCircle2,
  Eye,
  MousePointerClick,
  AlertTriangle,
  X,
} from "lucide-react";

// Modular Tab Components
import ReportsTab from "./_tabs/ReportsTab";
import UsersTab from "./_tabs/UsersTab";
import DeletedLogsTab from "./_tabs/DeletedLogsTab";
import TeamsTab from "./_tabs/TeamsTab";
import BadgesTab from "./_tabs/BadgesTab";
import NativeHackathonsTab from "./_tabs/NativeHackathonsTab";
import OutreachTab from "./_tabs/OutreachTab";
import PartneringTab from "./_tabs/PartneringTab";
import SihStatsTab from "./_tabs/SihStatsTab";

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

  // Single shared search query across tabs
  const [searchQuery, setSearchQuery] = useState("");

  // Data Collections
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [leads, setLeads] = useState<OrganizerLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [allHackathons, setAllHackathons] = useState<
    { id: string; name: string; website_url: string | null }[]
  >([]);
  const [partnerConfigsMap, setPartnerConfigsMap] = useState<
    Record<string, { id: string; slug: string; partner_name: string }>
  >({});
  const [partnerConfigsList, setPartnerConfigsList] = useState<PartnerConfigRecord[]>([]);
  const [nativeHackathons, setNativeHackathons] = useState<NativeHackathon[]>([]);
  const [loadingNativeHackathons, setLoadingNativeHackathons] = useState(false);
  const [deletedUserLogs, setDeletedUserLogs] = useState<DeletedUserLog[]>([]);
  const [loadingDeletedLogs, setLoadingDeletedLogs] = useState(false);

  // Email Usage & Analytics
  const [emailUsage, setEmailUsage] = useState<EmailUsageSummary | null>(null);
  const [emailAnalytics, setEmailAnalytics] = useState<EmailAnalyticsStats | null>(null);
  const [recentWebhookEvents, setRecentWebhookEvents] = useState<WebhookEvent[]>([]);

  // Email Calibration Modal
  const [showSyncEmailModal, setShowSyncEmailModal] = useState(false);
  const [syncingEmailStats, setSyncingEmailStats] = useState(false);
  const [customEmailCount, setCustomEmailCount] = useState<string>("");

  // User warning modal state (for warnings triggered directly from Users tab)
  const [userWarningModalOpen, setUserWarningModalOpen] = useState(false);
  const [warningTargetUserId, setWarningTargetUserId] = useState<string | null>(null);
  const [warningTargetName, setWarningTargetName] = useState("");
  const [warningMessageText, setWarningMessageText] = useState("");
  const [sendingUserWarning, setSendingUserWarning] = useState(false);

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
    } else if (activeTab === "native_hackathons") {
      fetchNativeHackathons();
    } else if (activeTab === "outreach" || activeTab === "partnering") {
      if (leads.length === 0) {
        loadLeads();
      }
    }
  }, [activeTab]);

  const outreachAdminEmail =
    process.env.NEXT_PUBLIC_OUTREACH_ADMIN_EMAIL || "yashshah7117@gmail.com";

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
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("[Admin loadData Error]:", res.status, errData.error || "Failed to load dashboard data");
        showToast(errData.error || `Failed to load admin data (HTTP ${res.status})`, "error");
      }
    } catch (apiErr: any) {
      console.error("[Admin loadData Exception]:", apiErr);
      showToast(apiErr.message || "Network error loading admin dashboard data.", "error");
    }
  }

  async function loadLeads() {
    setLoadingLeads(true);
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

      const { data: hData } = await supabase
        .from("hackathons")
        .select("id, name, website_url")
        .order("name");
      if (hData) setAllHackathons(hData);

      const { data: pConfigs } = await supabase
        .from("partner_configs")
        .select("id, hackathon_id, slug, partner_name, is_active, created_at");
      if (pConfigs) {
        const pMap: Record<string, { id: string; slug: string; partner_name: string }> = {};
        pConfigs.forEach((pc: any) => {
          if (pc.hackathon_id) {
            pMap[pc.hackathon_id] = {
              id: pc.id,
              slug: pc.slug,
              partner_name: pc.partner_name,
            };
          }
        });
        setPartnerConfigsMap(pMap);
        setPartnerConfigsList(pConfigs as PartnerConfigRecord[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLeads(false);
    }
  }

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

  async function fetchNativeHackathons() {
    setLoadingNativeHackathons(true);
    try {
      const res = await fetch("/api/admin/hackathons");
      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("application/json")) {
        const data = await res.json();
        if (data.success) {
          setNativeHackathons(data.hackathons || []);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingNativeHackathons(false);
    }
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

      const { data: profile } = await supabase
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
        await fetchNativeHackathons();
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

  useEffect(() => {
    checkAdminAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === "users" || activeTab === "deleted_logs") {
      loadDeletedUserLogs();
    }
  }, [activeTab]);

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
      showToast(err.message || "An error occurred.", "error");
    } finally {
      setSyncingEmailStats(false);
    }
  }

  async function handleToggleBan(userId: string, currentBanStatus: boolean) {
    try {
      const res = await fetch("/api/admin/ban-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, is_banned: !currentBanStatus }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message, "success");
        loadData();
      } else {
        showToast(data.error || "Failed to update ban status.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "An error occurred.", "error");
    }
  }

  async function handleToggleRole(userId: string, currentRole: string) {
    const nextRole = currentRole === "admin" ? "user" : "admin";
    try {
      const res = await fetch("/api/admin/set-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: nextRole }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message, "success");
        loadData();
      } else {
        showToast(data.error || "Failed to update role.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "An error occurred.", "error");
    }
  }

  function handleOpenUserWarningModal(userId: string, fullName: string) {
    setWarningTargetUserId(userId);
    setWarningTargetName(fullName || "User");
    setWarningMessageText("");
    setUserWarningModalOpen(true);
  }

  async function handleSendUserWarning() {
    if (!warningTargetUserId || !warningMessageText.trim()) {
      showToast("Please enter a warning message.", "error");
      return;
    }
    setSendingUserWarning(true);
    try {
      const res = await fetch("/api/admin/warn-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: warningTargetUserId,
          message: warningMessageText.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || "Official warning email dispatched successfully.", "success");
        setUserWarningModalOpen(false);
      } else {
        showToast(data.error || "Failed to send warning email.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "An unexpected error occurred.", "error");
    } finally {
      setSendingUserWarning(false);
    }
  }

  function handleDeleteUser(userId: string, fullName: string) {
    confirm({
      title: "PERMANENTLY PURGE USER ACCOUNT",
      message: `Are you sure you want to permanently delete "${
        fullName || "this user"
      }" and ALL their associated data (profile, teams, applications, connections, messages)? This action CANNOT be undone.`,
      confirmText: "Delete Permanently",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/admin/delete-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast(data.message || "User successfully deleted.", "success");
            loadData();
            loadDeletedUserLogs();
          } else {
            showToast(data.error || "Failed to delete user.", "error");
          }
        } catch (err: any) {
          showToast(err.message || "An error occurred.", "error");
        }
      },
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-zinc-200 dark:border-zinc-800 border-t-[#B4F461] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 text-center space-y-4 shadow-xs">
        <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Access Restricted</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          You do not have administrative privileges to access the moderation backoffice.
        </p>
        <button
          onClick={() => (window.location.href = "/dashboard")}
          className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const pendingNativeCount = nativeHackathons.filter((h) => h.status === "pending").length;

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800/80 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B4F461] animate-pulse" />
              <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 font-semibold">
                Platform Moderation
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Admin Backoffice
            </h1>
          </div>

          {/* Clean Segmented Tab Navigation */}
          <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 select-none">
            <button
              onClick={() => setActiveTab("reports")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "reports"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
              }`}
            >
              <span>Reports</span>
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/40 dark:border-zinc-800">
                {reports.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("users")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "users"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
              }`}
            >
              <span>Users</span>
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/40 dark:border-zinc-800">
                {users.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("deleted_logs")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "deleted_logs"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
              }`}
            >
              <span>Exit Logs</span>
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/40 dark:border-zinc-800">
                {deletedUserLogs.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("teams")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "teams"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
              }`}
            >
              <span>Teams</span>
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/40 dark:border-zinc-800">
                {teams.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("badges")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition shrink-0 cursor-pointer ${
                activeTab === "badges"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
              }`}
            >
              Badges
            </button>

            <button
              onClick={() => {
                setActiveTab("native_hackathons");
                fetchNativeHackathons();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "native_hackathons"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
              }`}
            >
              <span>Native Hackathons</span>
              {pendingNativeCount > 0 ? (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                  {pendingNativeCount}
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/40 dark:border-zinc-800">
                  {nativeHackathons.length}
                </span>
              )}
            </button>

            {userEmail?.toLowerCase().trim() === outreachAdminEmail.toLowerCase() && (
              <>
                <button
                  onClick={() => setActiveTab("outreach")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    activeTab === "outreach"
                      ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
                  }`}
                >
                  <span>Outreach</span>
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/40 dark:border-zinc-800">
                    {leads.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("partnering")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    activeTab === "partnering"
                      ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
                  }`}
                >
                  <span>Partnering</span>
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/40 dark:border-zinc-800">
                    {leads.filter((l) => l.status === "replied").length}
                  </span>
                </button>
              </>
            )}

            <button
              onClick={() => setActiveTab("sih_stats")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition shrink-0 cursor-pointer ${
                activeTab === "sih_stats"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
              }`}
            >
              SIH 2026
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

        {/* Daily Resend Email Limit & Telemetry Widgets (Users & Outreach tabs only) */}
        {(activeTab === "users" || activeTab === "outreach") && (
          <>
            {emailUsage && (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-center text-zinc-700 dark:text-zinc-300 shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                    Daily Resend Email Limit
                  </h2>
                  <StatusBadge
                    label={
                      emailUsage.usage_percent < 70
                        ? "Normal Usage"
                        : emailUsage.usage_percent < 90
                        ? "High Volume Warning"
                        : "Critical Budget Cap"
                    }
                    variant={
                      emailUsage.usage_percent < 70
                        ? "neutral"
                        : emailUsage.usage_percent < 90
                        ? "warning"
                        : "danger"
                    }
                    dot
                  />
                  {emailUsage.is_resend_live && (
                    <StatusBadge
                      label="Live Resend Sync"
                      variant="accent"
                      dot
                    />
                  )}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Source of truth for Email Budget Guard.{" "}
                  {emailUsage.is_resend_live
                    ? "Synced directly with Resend API."
                    : "Full database audit tracking active."}{" "}
                  Resets daily at <strong className="text-zinc-700 dark:text-zinc-300 font-mono">00:00 UTC</strong>.
                </p>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <div className="text-2xl font-extrabold font-mono text-zinc-900 dark:text-zinc-100 tracking-tight">
                  {emailUsage.total_sent}{" "}
                  <span className="text-sm font-normal text-zinc-400">/ {emailUsage.limit}</span>
                </div>
                <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {emailUsage.remaining_global} emails remaining today
                </div>
                {!emailUsage.is_resend_live && (
                  <div className="flex items-center gap-2 mt-1.5 sm:justify-end">
                    <button
                      onClick={() => {
                        setCustomEmailCount(emailUsage.total_sent.toString());
                        setShowSyncEmailModal(true);
                      }}
                      className="text-[10px] font-mono font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2 py-0.5 rounded-md transition flex items-center gap-1 cursor-pointer"
                      title="Manually calibrate today's total count to match resend.com"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      <span>Calibrate Count</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  emailUsage.usage_percent < 70
                    ? "bg-[#B4F461]"
                    : emailUsage.usage_percent < 90
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
                style={{ width: `${Math.min(100, Math.max(2, emailUsage.usage_percent))}%` }}
              />
            </div>

            {/* Category Breakdown Badges with Icons */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[11px]">
                <Radio className="w-3 h-3 text-zinc-400" />
                <span>SIH Broadcast:</span>
                <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.sih_broadcast}</strong>
              </div>
              <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[11px]">
                <Send className="w-3 h-3 text-zinc-400" />
                <span>Outreach Pitches:</span>
                <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.outreach}</strong>
              </div>
              {emailUsage.categories.test_dispatches > 0 && (
                <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[11px]">
                  <FlaskConical className="w-3 h-3 text-zinc-400" />
                  <span>Sandbox Testing:</span>
                  <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.test_dispatches}</strong>
                </div>
              )}
              <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[11px]">
                <Bell className="w-3 h-3 text-zinc-400" />
                <span>Notifications & Invites:</span>
                <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.notifications}</strong>
              </div>
              <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[11px]">
                <Megaphone className="w-3 h-3 text-zinc-400" />
                <span>Organizer Broadcasts:</span>
                <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.organizer_broadcasts}</strong>
              </div>
              <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[11px]">
                <FileText className="w-3 h-3 text-zinc-400" />
                <span>Admin Digests:</span>
                <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.admin_reports}</strong>
              </div>
              <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[11px]">
                <Sparkles className="w-3 h-3 text-zinc-400" />
                <span>Onboarding Nudges:</span>
                <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.onboarding_nudges}</strong>
              </div>
              {emailUsage.categories.contact_submissions > 0 && (
                <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[11px]">
                  <Inbox className="w-3 h-3 text-zinc-400" />
                  <span>Contact Forms:</span>
                  <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.contact_submissions}</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Email Analytics & Delivery Health Widget */}
        {emailAnalytics && (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-center text-zinc-700 dark:text-zinc-300 shrink-0">
                    <Activity className="w-4 h-4" />
                  </div>
                  <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                    Resend Delivery & Engagement Health
                  </h2>
                  <StatusBadge label="Live Webhooks Active" variant="neutral" dot />
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Real-time webhook telemetry for delivery, open rate, clicks, and bounce monitoring.
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                <div className="text-center px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono uppercase">Delivery</div>
                  <div className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                    {emailAnalytics.deliveryRate}
                  </div>
                </div>
                <div className="text-center px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono uppercase">Open Rate</div>
                  <div className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                    {emailAnalytics.openRate}
                  </div>
                </div>
                <div className="text-center px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono uppercase">Click Rate</div>
                  <div className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                    {emailAnalytics.clickRate}
                  </div>
                </div>
              </div>
            </div>

            {/* Event Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Delivered</span>
                </div>
                <span className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  {emailAnalytics.delivered}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  <Eye className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Opened</span>
                </div>
                <span className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  {emailAnalytics.opened}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  <MousePointerClick className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Clicked</span>
                </div>
                <span className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  {emailAnalytics.clicked}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  <AlertTriangle className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Bounced</span>
                </div>
                <span
                  className={`text-sm font-bold font-mono ${
                    emailAnalytics.bounced > 0 ? "text-rose-500 dark:text-rose-400" : "text-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {emailAnalytics.bounced}
                </span>
              </div>
            </div>

            {/* Recent Webhook Events Stream */}
            {recentWebhookEvents.length > 0 && (
              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                <div className="text-[11px] font-mono font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                  Recent Email Events ({recentWebhookEvents.length})
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {recentWebhookEvents.slice(0, 10).map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/60 text-xs font-mono"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <StatusBadge
                          label={ev.event_type}
                          variant={
                            ev.event_type === "delivered"
                              ? "neutral"
                              : ev.event_type === "opened" || ev.event_type === "clicked"
                              ? "info"
                              : ev.event_type === "bounced"
                              ? "danger"
                              : "neutral"
                          }
                        />
                        <span className="text-zinc-700 dark:text-zinc-200 truncate max-w-[200px] sm:max-w-xs font-mono text-[11px]">
                          {ev.recipient_email}
                        </span>
                        {ev.subject && (
                          <span className="text-zinc-400 dark:text-zinc-500 truncate hidden md:inline text-[11px]">
                            — {ev.subject}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">
                        {new Date(ev.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
          </>
        )}

        {/* Modular Active Tab Renderers */}
        {activeTab === "reports" && (
          <ReportsTab
            reports={reports}
            currentUserId={currentUserId}
            onRefresh={loadData}
            onToggleBan={handleToggleBan}
          />
        )}

        {activeTab === "users" && (
          <UsersTab
            users={users}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            currentUserId={currentUserId}
            deletedUserLogs={deletedUserLogs}
            loadingDeletedLogs={loadingDeletedLogs}
            onRefresh={loadData}
            onRefreshDeletedLogs={loadDeletedUserLogs}
            onToggleBan={handleToggleBan}
            onToggleRole={handleToggleRole}
            onDeleteUser={handleDeleteUser}
            onOpenWarningModal={handleOpenUserWarningModal}
            onNavigateToDeletedLogs={() => setActiveTab("deleted_logs")}
          />
        )}

        {activeTab === "deleted_logs" && (
          <DeletedLogsTab
            deletedUserLogs={deletedUserLogs}
            loadingDeletedLogs={loadingDeletedLogs}
            onRefreshDeletedLogs={loadDeletedUserLogs}
          />
        )}

        {activeTab === "teams" && (
          <TeamsTab
            teams={teams}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onRefresh={loadData}
          />
        )}

        {activeTab === "badges" && (
          <BadgesTab partnerConfigsMap={partnerConfigsMap} />
        )}

        {activeTab === "native_hackathons" && (
          <NativeHackathonsTab
            nativeHackathons={nativeHackathons}
            loadingNativeHackathons={loadingNativeHackathons}
            onRefresh={fetchNativeHackathons}
          />
        )}

        {activeTab === "outreach" && (
          <OutreachTab
            leads={leads}
            setLeads={setLeads}
            loadingLeads={loadingLeads}
            loadLeads={loadLeads}
            userEmail={userEmail}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        )}

        {activeTab === "partnering" && (
          <PartneringTab
            leads={leads}
            allHackathons={allHackathons}
            partnerConfigsMap={partnerConfigsMap}
            partnerConfigsList={partnerConfigsList}
            loadLeads={loadLeads}
          />
        )}

        {activeTab === "sih_stats" && <SihStatsTab />}

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

      {/* User Warning Modal */}
      {userWarningModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-xl card card-static p-6 animate-scale-in border-emerald-950/80 bg-zinc-950">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>Issue Direct Moderation Warning</span>
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Send official moderation warning email to <strong>{warningTargetName}</strong>.
                </p>
              </div>
              <button
                onClick={() => setUserWarningModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-500 dark:text-zinc-400 font-mono text-[10px] uppercase mb-1">
                  Warning Details & Guidelines Violated
                </label>
                <textarea
                  value={warningMessageText}
                  onChange={(e) => setWarningMessageText(e.target.value)}
                  placeholder="Explain why this warning is being issued (e.g. offensive language, fake portfolio, spamming teams)..."
                  rows={4}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-900">
              <button
                type="button"
                onClick={() => setUserWarningModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs transition cursor-pointer"
                disabled={sendingUserWarning}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendUserWarning}
                disabled={sendingUserWarning || !warningMessageText.trim()}
                className="px-5 py-2 rounded-xl bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 font-bold text-xs transition cursor-pointer disabled:opacity-50 shadow-sm shadow-[#B4F461]/10"
              >
                {sendingUserWarning ? "Dispatching..." : "Send Official Warning Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calibrate Email Count Modal */}
      {showSyncEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090b] shadow-2xl p-6 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-900">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Mail className="w-4 h-4 text-zinc-500" />
                <span>Calibrate Daily Email Count</span>
              </h3>
              <button
                onClick={() => setShowSyncEmailModal(false)}
                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Enter the exact sent email count shown for today on{" "}
              <a
                href="https://resend.com/emails"
                target="_blank"
                rel="noreferrer"
                className="text-[#B4F461] underline hover:opacity-80 font-medium"
              >
                resend.com
              </a>
              . This updates your database baseline count for today so future emails stay 100% in
              sync.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-zinc-700 dark:text-zinc-300 font-semibold">
                Today&apos;s Sent Count on Resend.com
              </label>
              <input
                type="number"
                min="0"
                max="1000"
                value={customEmailCount}
                onChange={(e) => setCustomEmailCount(e.target.value)}
                placeholder="e.g. 52"
                className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 text-sm text-zinc-900 dark:text-zinc-100 font-mono focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-900">
              <button
                onClick={() => setShowSyncEmailModal(false)}
                className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={syncingEmailStats}
                onClick={handleSyncEmailStats}
                className="px-4 py-2 rounded-xl bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 font-bold text-xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-sm shadow-[#B4F461]/10"
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
