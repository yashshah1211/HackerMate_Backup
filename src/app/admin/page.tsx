"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import Link from "next/link";

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
  event_date: string;
  status: string;
  pitch_sent_at: string | null;
  opened_at?: string | null;
  open_count?: number;
  notes: string | null;
  created_at: string;
};

export default function AdminPage() {
  const { showToast, confirm } = useNotification();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<"reports" | "users" | "teams" | "outreach">("reports");

  // Data
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

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

  async function handleSendSummaryPdf() {
    setSendingSummaryPdf(true);
    try {
      const res = await fetch("/api/admin/send-outreach-summary-pdf", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(
          `All-time outreach summary PDF (From Day 1) emailed successfully to yashshah7117@gmail.com!`,
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

      if (dbError || !profile || profile.role !== "admin") {
        setIsAdmin(false);
      } else {
        setIsAdmin(true);
        await loadData();
        if (user.email === "yashshah7117@gmail.com") {
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
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load organizer leads:", error);
      } else {
        setLeads((data || []) as OrganizerLead[]);
      }
    } catch (err) {
      console.error("Error in loadLeads:", err);
    }
    setLoadingLeads(false);
  }

  async function handleScrapeUnstop() {
    setFetchingUnstop(true);
    try {
      const res = await fetch("/api/admin/scrape-unstop", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(
          data.count > 0
            ? `Fetched ${data.count} hackathons from Unstop!`
            : "Scrape complete - no new hackathons found.",
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
    const primaryEmail = lead.organizer_email
      ? lead.organizer_email.split(",")[0].trim()
      : "";
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
        showToast(
          `Pitch email sent successfully to ${resData.sentTo || pitchRecipientEmail}!`,
          "success"
        );
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

  function handleRemoveLead(leadId: string, leadTitle: string) {
    confirm({
      title: "REMOVE HACKATHON LEAD",
      message: `Are you sure you want to remove "${leadTitle}"? It will be removed from your outreach list and will never be re-fetched when you click Fetch Unstop Hackathons.`,
      confirmText: "Remove Lead",
      onConfirm: async () => {
        const { error } = await supabase
          .from("organizer_leads")
          .update({ status: "removed" })
          .eq("id", leadId);

        if (error) {
          showToast(error.message, "error");
        } else {
          showToast(`Removed "${leadTitle}". It will not be re-fetched on future scrapes.`, "success");
          await loadLeads();
        }
      },
    });
  }

  async function loadData() {
    try {
      // 1. Fetch user reports
      const { data: reportsData, error: reportsErr } = await supabase
        .from("user_reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (reportsErr) {
        console.error("Failed to load reports:", reportsErr);
      }

      // 2. Fetch profiles
      const { data: profilesData, error: profilesErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, is_banned, role, created_at, onboarding_completed")
        .order("created_at", { ascending: false });

      if (profilesErr) {
        console.error("Failed to load profiles:", profilesErr);
      }

      const usersList = (profilesData || []) as UserProfile[];
      setUsers(usersList);

      // 3. Fetch teams
      const { data: teamsData, error: teamsErr } = await supabase
        .from("teams")
        .select("*, team_members(id), team_hackathons(hackathons(id, name))")
        .order("created_at", { ascending: false });

      if (teamsErr) {
        console.error("Failed to load teams:", teamsErr);
      }

      const rawTeams = (teamsData || []) as Team[];

      // 4. Perform client-side join on reports to display names/emails
      if (reportsData && usersList.length > 0) {
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

      // 5. Perform client-side join on teams to resolve owner details
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
        setTeams([]);
      }
    } catch (err) {
      console.error("Error joining admin logs:", err);
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

        showToast(`Bulk nudging completed! Sent: ${successCount}, Failed: ${failCount}`, "success");
        setBulkNudging(false);
      }
    });
  }

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
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
              <span>Moderation Center</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Inspect user reports, manage account suspension lists, and assign roles.
            </p>
          </div>

          {/* Tab buttons */}
          <div className="flex bg-zinc-950/80 border border-zinc-900 rounded-lg p-1 select-none shrink-0 self-start md:self-center">
            <button
              onClick={() => {
                setActiveTab("reports");
                setSearchQuery("");
              }}
              className={`px-4 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition ${
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
              className={`px-4 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition ${
                activeTab === "users"
                  ? "bg-zinc-900 text-white shadow"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Registered Users ({users.length})
            </button>
            <button
              onClick={() => {
                setActiveTab("teams");
                setSearchQuery("");
              }}
              className={`px-4 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition ${
                activeTab === "teams"
                  ? "bg-zinc-900 text-white shadow"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Teams ({teams.length})
            </button>

            {userEmail === "yashshah7117@gmail.com" && (
              <button
                onClick={() => {
                  setActiveTab("outreach");
                  setSearchQuery("");
                }}
                className={`px-4 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition ${
                  activeTab === "outreach"
                    ? "bg-zinc-900 text-emerald-400 shadow border border-emerald-500/20"
                    : "text-emerald-500/70 hover:text-emerald-400"
                }`}
              >
                Organizer Outreach 🎯 ({leads.length})
              </button>
            )}
          </div>
        </div>

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
              <div className="flex bg-zinc-950 border border-zinc-900 rounded-lg p-1 select-none shrink-0 w-full md:w-auto justify-center">
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
                  Incomplete Onboarding
                </button>
              </div>

              {onboardingFilter === "incomplete" && (
                <button
                  onClick={handleBulkNudge}
                  disabled={bulkNudging || filteredUsers.length === 0}
                  className="btn btn-primary text-[10px] font-mono uppercase tracking-wider py-2 px-4 shrink-0 flex items-center gap-1.5 w-full md:w-auto justify-center cursor-pointer"
                >
                  {bulkNudging ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Nudging All...</span>
                    </>
                  ) : (
                    <>
                      <span>Nudge All ({filteredUsers.filter(u => !u.onboarding_completed).length})</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* List */}
            <div className="card card-static overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-900 bg-zinc-950/40 text-zinc-500 font-mono uppercase tracking-wider text-[10px]">
                      <th className="p-4 font-semibold">User Details</th>
                      <th className="p-4 font-semibold">Registered</th>
                      <th className="p-4 font-semibold">Role</th>
                      <th className="p-4 font-semibold">Onboarding</th>
                      <th className="p-4 font-semibold">Ban Status</th>
                      <th className="p-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/60">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-zinc-500">
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
                                  onClick={() => handleSingleNudge(u.id, u.full_name || "User")}
                                  disabled={nudgingUserIds.has(u.id)}
                                  className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded border border-violet-500/20 hover:border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition disabled:opacity-50 cursor-pointer"
                                >
                                  {nudgingUserIds.has(u.id) ? "Nudging..." : "Nudge"}
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

        {/* Tab 4: Organizer Outreach (yashshah7117@gmail.com exclusive) */}
        {activeTab === "outreach" && userEmail === "yashshah7117@gmail.com" && (
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
                  onClick={handleScrapeUnstop}
                  disabled={fetchingUnstop}
                  className="btn btn-primary text-xs py-2 px-4 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white border-none shadow-lg shadow-emerald-950/50"
                >
                  {fetchingUnstop ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Scraping Unstop...</span>
                    </>
                  ) : (
                    <>
                      <span>🔍 Fetch Unstop Hackathons</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Leads List Table */}
            <div className="card card-static p-0 overflow-hidden">
              <div className="p-4 border-b border-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/40">
                <div className="text-xs font-semibold text-zinc-300">
                  Total Leads ({leads.length}) •{" "}
                  <span className="text-emerald-400">
                    Pitches Sent ({leads.filter((l) => l.pitch_sent_at || l.status === "pitch_sent" || l.status === "opened").length})
                  </span>{" "}
                  •{" "}
                  <span className="text-emerald-300 font-mono">
                    Opened ({leads.filter((l) => l.opened_at || (l.open_count && l.open_count > 0) || l.status === "opened").length})
                  </span>
                </div>

                <input
                  type="text"
                  placeholder="Search hackathons or colleges..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input text-xs py-1.5 px-3 max-w-xs"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950 text-zinc-400 font-mono text-[10px] uppercase tracking-wider border-b border-zinc-900">
                    <tr>
                      <th className="p-4">Hackathon</th>
                      <th className="p-4">College / Host</th>
                      <th className="p-4">Event Date</th>
                      <th className="p-4">Organizer Email</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/60">
                    {leads.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-zinc-500 text-xs">
                          No Unstop hackathon leads found. Click <strong>"Fetch Unstop Hackathons"</strong> to import live events!
                        </td>
                      </tr>
                    ) : (
                      leads
                        .filter(
                          (l) =>
                            l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (l.college_or_host &&
                              l.college_or_host.toLowerCase().includes(searchQuery.toLowerCase()))
                        )
                        .map((lead) => (
                          <tr key={lead.id} className="hover:bg-zinc-900/30 transition-colors">
                            {/* Title & Link */}
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
                            </td>

                            {/* Host */}
                            <td className="p-4 text-zinc-300">
                              <div className="line-clamp-1">{lead.college_or_host || "N/A"}</div>
                            </td>

                            {/* Event Date */}
                            <td className="p-4 font-mono text-[10px] text-zinc-400">
                              {lead.event_date || "Upcoming"}
                            </td>

                            {/* Contact Email */}
                            <td className="p-4 font-mono text-[11px]">
                              {lead.organizer_email ? (
                                <span className="text-zinc-200">{lead.organizer_email}</span>
                              ) : (
                                <span className="text-zinc-600 italic">Not listed on public API</span>
                              )}
                            </td>

                            {/* Status Tag */}
                            <td className="p-4">
                              {lead.opened_at || (lead.open_count && lead.open_count > 0) || lead.status === "opened" ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-950/90 text-emerald-400 border border-emerald-600/60 shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                                  👁 Opened {lead.open_count && lead.open_count > 1 ? `(${lead.open_count}x)` : ""}
                                </span>
                              ) : lead.status === "pitch_sent" || lead.pitch_sent_at ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60">
                                  ✓ Pitch Sent (Unopened)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-blue-950/80 text-blue-400 border border-blue-800/60">
                                  New Lead
                                </span>
                              )}
                            </td>

                            {/* Action Buttons */}
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openPitchModal(lead)}
                                  className="text-[10px] font-mono uppercase tracking-wider py-1.5 px-3 rounded border border-emerald-900/60 hover:border-emerald-500 bg-emerald-950/30 hover:bg-emerald-600 text-emerald-400 hover:text-white transition cursor-pointer"
                                >
                                  {lead.status === "pitch_sent" ? "Re-pitch" : "Preview & Send Pitch"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLead(lead.id, lead.title)}
                                  title="Remove lead from list so it is never re-fetched on future scrapes"
                                  className="text-[10px] font-mono uppercase tracking-wider py-1.5 px-2.5 rounded border border-rose-900/40 hover:border-rose-500/60 bg-rose-950/20 hover:bg-rose-950/50 text-rose-400 hover:text-rose-200 transition cursor-pointer flex items-center gap-1"
                                >
                                  <span>Remove</span>
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
          </div>
        )}
      </div>

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
    </>
  );
}
