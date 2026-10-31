"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { sendModerationWarning, WARNING_ACCEPTED, WARNING_LIMIT } from "@/lib/admin/moderationClient";
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
  ShieldAlert,
  Mail,
  SlidersHorizontal,
  Radio,
  Send,
  FlaskConical,
  Bell,
  Megaphone,
  FileText,
  Zap,
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

function AdminContent() {
  const { showToast, confirm } = useNotification();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<"reports" | "users" | "teams" | "outreach" | "badges" | "partnering" | "deleted_logs" | "native_hackathons">("reports");

  // Single shared search query across tabs
  const [searchQuery, setSearchQuery] = useState("");

  // Data Collections
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardLoaded, setDashboardLoaded] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const dashboardRequest = useRef(0);
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
  const warningInFlight = useRef(false);
  const banInFlight = useRef(new Set<string>());
  const [banPendingIds, setBanPendingIds] = useState<ReadonlySet<string>>(new Set());

  // Onboarding nudge states
  const [onboardingFilter, setOnboardingFilter] = useState<"all" | "incomplete">("all");
  const [nudgingUserIds, setNudgingUserIds] = useState<Set<string>>(new Set());
  const [bulkNudging, setBulkNudging] = useState(false);

  // Partner Composition & Broadcast Modal States
  const [selectedPartnerModal, setSelectedPartnerModal] = useState<any | null>(null);
  const [partnerAnalyticsData, setPartnerAnalyticsData] = useState<any | null>(null);
  const [loadingPartnerAnalytics, setLoadingPartnerAnalytics] = useState(false);
  const [sendingPartnerBroadcast, setSendingPartnerBroadcast] = useState(false);


  useEffect(() => {
    if (activeTab === "users" || activeTab === "deleted_logs") {
      loadDeletedUserLogs();

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
    const request = ++dashboardRequest.current;
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/admin/dashboard-data", { headers, signal: AbortSignal.timeout(20_000) });
      if (request !== dashboardRequest.current) return;
      if (res.ok) {
        const data = await res.json();
        if (request !== dashboardRequest.current) return;
        if (data?.success !== true || !Array.isArray(data.users) || !Array.isArray(data.teams) || !Array.isArray(data.reports) ||
          [data.users, data.teams, data.reports].some((rows: unknown[]) => rows.some(row => !row || typeof row !== "object" || !("id" in row) || typeof row.id !== "string"))) {
          throw new Error("Incomplete admin dashboard response");
        }
        const usersList = data.users as UserProfile[];
        const rawTeams = data.teams as Team[];
        const reportsData = data.reports as Report[];

        if (data.emailUsage) {
          setEmailUsage(data.emailUsage);
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
        setDashboardLoaded(true);
        // Optional telemetry must not keep a valid dashboard snapshot loading.
        void (async () => {
          try {
            const analyticsRes = await fetch("/api/admin/email-analytics", { headers });
            const analyticsData = await analyticsRes.json();
            if (request === dashboardRequest.current && analyticsRes.ok && analyticsData.success) {
              setEmailAnalytics(analyticsData.stats);
              setRecentWebhookEvents(analyticsData.recentEvents || []);
            } else if (request === dashboardRequest.current) {
              setEmailAnalytics(null); setRecentWebhookEvents([]);
            }
          } catch (e) {
            console.error("Failed to fetch email analytics:", e);
            if (request === dashboardRequest.current) { setEmailAnalytics(null); setRecentWebhookEvents([]); }
          }
        })();
        return;
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("[Admin loadData Error]:", res.status, errData.error || "Failed to load dashboard data");
        if (request !== dashboardRequest.current) return;
        if (res.status === 401 || res.status === 403) {
          setUsers([]); setTeams([]); setReports([]); setEmailUsage(null);
          setEmailAnalytics(null); setRecentWebhookEvents([]); setDashboardLoaded(false);
        }
        throw new Error(`Dashboard request failed (HTTP ${res.status})`);
      }
    } catch (apiErr) {
      console.error("[Admin loadData Exception]:", apiErr);
      if (request !== dashboardRequest.current) return;
      const message = "Could not load dashboard data. Please retry.";
      setDashboardError(message);
      showToast(message, "error");
    } finally {
      if (request === dashboardRequest.current) setDashboardLoading(false);
    }
  }

  async function loadLeads() {
    setLoadingLeads(true);
    try {
      const { data, error } = await supabase
        .from("organizer_leads")
        .select("*")
        .neq("status", "removed")
        .neq("status", "archived")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading leads:", error);
      } else {
        setLeads((data || []) as OrganizerLead[]);
      }

      const { data: hData } = await supabase
        .from("hackathons")
        .select("id, name, website_url")
        .order("name");
      if (hData) setAllHackathons(hData);

      // partner_configs has no is_active column; requesting it made every
      // admin load fail with a 400 and left the partner map empty.
      const { data: pConfigs, error: pConfigsErr } = await supabase
        .from("partner_configs")
        .select("id, hackathon_id, slug, partner_name, created_at");
      if (pConfigsErr) console.error("[admin] partner_configs query failed:", pConfigsErr);
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
      console.error("Error in loadLeads:", err);
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
        if (
          user.email?.toLowerCase().trim() === outreachAdminEmail.toLowerCase().trim() ||
          isSuperAdminEmail
        ) {
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

  function handleToggleBan(userId: string, currentBanStatus: boolean, fullName: string) {
    if (banInFlight.current.has(userId)) return;
    confirm({
      title: currentBanStatus ? "UNBAN USER" : "BAN USER",
      message: `${currentBanStatus ? "Remove the profile ban for" : "Set the profile ban for"} ${fullName || "this user"}? This changes the profile flag; it does not revoke active sessions or guarantee every product action is blocked.`,
      confirmText: currentBanStatus ? "Unban" : "Ban",
      onConfirm: async () => {
        if (banInFlight.current.has(userId)) return;
        banInFlight.current.add(userId);
        setBanPendingIds(new Set(banInFlight.current));
        try {
          const res = await fetch("/api/admin/ban-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, is_banned: !currentBanStatus }),
          });
          const data = await res.json();
          if (res.ok && data.success === true && data.userId === userId && data.is_banned === !currentBanStatus && typeof data.changed === "boolean") {
            showToast(data.changed ? "Profile ban status updated." : "The requested ban status was already applied.", data.changed ? "success" : "info");
            await loadData();
          } else {
            showToast(data.error || "Ban status was not confirmed. Refresh before retrying.", "error");
          }
        } catch (error) {
          console.error("[admin] Ban request failed:", error);
          showToast("Ban status is unknown. Refresh before retrying.", "error");
        } finally {
          banInFlight.current.delete(userId);
          setBanPendingIds(new Set(banInFlight.current));
        }
      },
    });
  }

  function handleOpenUserWarningModal(userId: string, fullName: string) {
    setWarningTargetUserId(userId);
    setWarningTargetName(fullName || "User");
    setWarningMessageText("");
    setUserWarningModalOpen(true);
  }

  async function handleSendUserWarning() {
    if (warningInFlight.current) return;
    if (!warningTargetUserId || !warningMessageText.trim() || warningMessageText.trim().length > WARNING_LIMIT) {
      showToast("Please enter a warning message.", "error");
      return;
    }
    warningInFlight.current = true;
    setSendingUserWarning(true);
    try {
      await sendModerationWarning(currentUserId, warningTargetUserId, warningMessageText);
      showToast(WARNING_ACCEPTED, "success");
      setUserWarningModalOpen(false);
      await loadData();
    } catch (error) {
      console.error("[admin] Warning request failed:", error);
      showToast(error instanceof Error ? error.message : "Warning acceptance was not confirmed.", "error");
    } finally {
      warningInFlight.current = false;
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
      <div role="status" className="flex items-center justify-center min-h-[60vh]">
        <span className="sr-only">Loading admin dashboard</span>
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
              <span className="text-[12px] font-medium tracking-widest text-zinc-500 font-semibold">
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "reports"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
              }`}
            >
              <span>Reports</span>
              <span className="px-1.5 py-0.5 rounded-md text-[12.5px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/40 dark:border-zinc-800">
                {dashboardLoaded ? reports.length : "—"}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("users")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "users"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
              }`}
            >
              <span>Users</span>
              <span className="px-1.5 py-0.5 rounded-md text-[12.5px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/40 dark:border-zinc-800">
                {dashboardLoaded ? users.length : "—"}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("deleted_logs")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "deleted_logs"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
              }`}
            >
              <span>Exit Logs</span>
              <span className="px-1.5 py-0.5 rounded-md text-[12.5px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/40 dark:border-zinc-800">
                {deletedUserLogs.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("teams")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "teams"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
              }`}
            >
              <span>Teams</span>
              <span className="px-1.5 py-0.5 rounded-md text-[12.5px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/40 dark:border-zinc-800">
                {dashboardLoaded ? teams.length : "—"}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("badges")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 cursor-pointer ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "native_hackathons"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
              }`}
            >
              <span>Native Hackathons</span>
              {pendingNativeCount > 0 ? (
                <span className="px-1.5 py-0.5 rounded-md text-[12.5px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                  {pendingNativeCount}
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-md text-[12.5px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/40 dark:border-zinc-800">
                  {nativeHackathons.length}
                </span>
              )}
            </button>

            {userEmail?.toLowerCase().trim() === outreachAdminEmail.toLowerCase() && (
              <>
                <button
                  onClick={() => setActiveTab("outreach")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    activeTab === "outreach"
                      ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
                  }`}
                >
                  <span>Outreach</span>
                  <span className="px-1.5 py-0.5 rounded-md text-[12.5px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/40 dark:border-zinc-800">
                    {leads.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("partnering")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    activeTab === "partnering"
                      ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700 font-semibold"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900"
                  }`}
                >
                  <span>Partnering</span>
                  <span className="px-1.5 py-0.5 rounded-md text-[12.5px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/40 dark:border-zinc-800">
                    {leads.filter((l) => l.status === "replied").length}
                  </span>
                </button>
              </>
            )}




          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {dashboardError ? (
            <div role="alert" className="text-rose-600 dark:text-rose-400">
              <p>{dashboardError}</p>
              {dashboardLoaded && <p className="text-zinc-500">Showing previously loaded data.</p>}
            </div>
          ) : (
            <p role="status" className="text-zinc-500">
              {dashboardLoading ? dashboardLoaded ? "Refreshing dashboard data…" : "Loading dashboard data…" : "Dashboard data loaded."}
            </p>
          )}
          <button type="button" disabled={dashboardLoading} onClick={() => void loadData()}
            className="btn btn-secondary text-xs disabled:opacity-50">
            {dashboardLoading ? "Loading dashboard data…" : dashboardError ? "Retry dashboard data" : "Refresh dashboard data"}
          </button>
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
                    label={emailUsage.status === "unavailable" ? "Metrics unavailable" : "Partial legacy counters"}
                    variant="neutral"
                    dot
                  />
                  {emailUsage.is_resend_live && (
                    <StatusBadge
                      label="Partial evidence"
                      variant="accent"
                      dot
                    />
                  )}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Partial email accounting evidence.{" "}
                  {emailUsage.note}{" "}
                  Resets daily at <strong className="text-zinc-700 dark:text-zinc-300 font-mono">00:00 UTC</strong>.
                </p>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <div className="text-2xl font-extrabold font-mono text-zinc-900 dark:text-zinc-100 tracking-tight">
                  {emailUsage.total_sent ?? "Unavailable"}{" "}
                  <span className="text-sm font-normal text-zinc-400">/ {emailUsage.limit}</span>
                </div>
                <div className="text-[12px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Remaining provider quota unavailable
                </div>
                {!emailUsage.is_resend_live && (
                  <div className="flex items-center gap-2 mt-1.5 sm:justify-end">
                    <button
                      onClick={() => {
                        setCustomEmailCount(emailUsage.total_sent?.toString() || "");
                        setShowSyncEmailModal(true);
                      }}
                      className="text-[12.5px] font-mono font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2 py-0.5 rounded-md transition flex items-center gap-1 cursor-pointer"
                      title="Manually calibrate today's total count to match resend.com"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      <span>Calibrate Count</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Category Breakdown Badges with Icons */}
            <div className="flex flex-wrap items-center gap-2 text-xs">

              <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[12px]">
                <Send className="w-3 h-3 text-zinc-400" />
                <span>Outreach Pitches:</span>
                <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.outreach ?? "Unavailable"}</strong>
              </div>
              {(emailUsage.categories.test_dispatches ?? 0) > 0 && (
                <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[12px]">
                  <FlaskConical className="w-3 h-3 text-zinc-400" />
                  <span>Sandbox Testing:</span>
                  <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.test_dispatches ?? "Unavailable"}</strong>
                </div>
              )}
              <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[12px]">
                <Bell className="w-3 h-3 text-zinc-400" />
                <span>Notifications & Invites:</span>
                <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.notifications ?? "Unavailable"}</strong>
              </div>
              <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[12px]">
                <Megaphone className="w-3 h-3 text-zinc-400" />
                <span>Organizer Broadcasts:</span>
                <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.organizer_broadcasts ?? "Unavailable"}</strong>
              </div>
              <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[12px]">
                <FileText className="w-3 h-3 text-zinc-400" />
                <span>Admin Digests:</span>
                <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.admin_reports ?? "Unavailable"}</strong>
              </div>
              <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[12px]">
                <Zap className="w-3 h-3 text-zinc-400" />
                <span>Onboarding Nudges:</span>
                <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.onboarding_nudges ?? "Unavailable"}</strong>
              </div>
              {(emailUsage.categories.contact_submissions ?? 0) > 0 && (
                <div className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-mono text-[12px]">
                  <Inbox className="w-3 h-3 text-zinc-400" />
                  <span>Contact Forms:</span>
                  <strong className="text-zinc-900 dark:text-zinc-100">{emailUsage.categories.contact_submissions ?? "Unavailable"}</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Email Analytics & Delivery Health Widget */}
        {!emailAnalytics && <p className="text-sm text-zinc-500">Email delivery metrics unavailable; no delivery rate is confirmed.</p>}
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
                  <StatusBadge label="Recent event sample" variant="neutral" dot />
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Recent webhook sample only. Complete delivery and engagement rates are unavailable.
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                <div className="text-center px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-[12.5px] text-zinc-500 dark:text-zinc-400 font-medium">Delivery</div>
                  <div className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                    {emailAnalytics.deliveryRate}
                  </div>
                </div>
                <div className="text-center px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-[12.5px] text-zinc-500 dark:text-zinc-400 font-medium">Open Rate</div>
                  <div className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                    {emailAnalytics.openRate}
                  </div>
                </div>
                <div className="text-center px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-[12.5px] text-zinc-500 dark:text-zinc-400 font-medium">Click Rate</div>
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
                <div className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-2">
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
                        <span className="text-zinc-700 dark:text-zinc-200 truncate max-w-[200px] sm:max-w-xs font-mono text-[12px]">
                          {ev.recipient_email}
                        </span>
                        {ev.subject && (
                          <span className="text-zinc-400 dark:text-zinc-500 truncate hidden md:inline text-[12px]">
                            — {ev.subject}
                          </span>
                        )}
                      </div>
                      <span className="text-[12.5px] text-zinc-400 dark:text-zinc-500 shrink-0">
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
        {activeTab === "reports" && dashboardLoaded && (
          <ReportsTab
            reports={reports}
            currentUserId={currentUserId}
            onRefresh={loadData}
            onToggleBan={handleToggleBan}
            banPendingIds={banPendingIds}
          />
        )}

        {activeTab === "users" && (
          <UsersTab
            users={users}
            dashboardLoading={dashboardLoading}
            dashboardLoaded={dashboardLoaded}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            currentUserId={currentUserId}
            deletedUserLogs={deletedUserLogs}
            loadingDeletedLogs={loadingDeletedLogs}
            onRefresh={loadData}
            onRefreshDeletedLogs={loadDeletedUserLogs}
            onToggleBan={handleToggleBan}
            banPendingIds={banPendingIds}
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

        {activeTab === "teams" && dashboardLoaded && (
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



      </div>

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
                  Request a moderation warning to <strong>{warningTargetName}</strong>. Provider acceptance does not confirm delivery.
                </p>
              </div>
              <button
                onClick={() => setUserWarningModalOpen(false)}
                disabled={sendingUserWarning}
                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-500 dark:text-zinc-400 font-mono text-[12.5px] uppercase mb-1">
                  Warning Details & Guidelines Violated
                </label>
                <textarea
                  value={warningMessageText}
                  maxLength={WARNING_LIMIT}
                  disabled={sendingUserWarning}
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
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[var(--bg)] shadow-2xl p-6 space-y-4 overflow-hidden">
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

