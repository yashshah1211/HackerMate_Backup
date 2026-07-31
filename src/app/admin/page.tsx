"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import AuthGuard from "@/components/AuthGuard";
import Link from "next/link";
import type { EmailUsageSummary } from "@/lib/admin/emailBudgetGuard";

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
  const [activeTab, setActiveTab] = useState<"reports" | "users" | "teams" | "outreach" | "badges" | "partnering">("reports");

  // Partnering Organizers & Portal state
  const [allHackathons, setAllHackathons] = useState<{ id: string; name: string; website_url: string | null }[]>([]);
  const [partnerConfigsMap, setPartnerConfigsMap] = useState<Record<string, { id: string; slug: string; partner_name: string }>>({});
  const [creatingPortalId, setCreatingPortalId] = useState<string | null>(null);

  // Winner Badge Issuer & Directory state
  const [badgeFormHackathonId, setBadgeFormHackathonId] = useState("00000000-0000-0000-0000-000001703933");
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

  // Data
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [emailUsage, setEmailUsage] = useState<EmailUsageSummary | null>(null);

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

      if (dbError || !profile || profile.role !== "admin") {
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

      const { data: pcData } = await supabase.from("partner_configs").select("id, slug, hackathon_id, partner_name");
      if (pcData) {
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
      const res = await fetch("/api/admin/dashboard-data");
      if (res.ok) {
        const data = await res.json();
        const usersList = (data.users || []) as UserProfile[];
        const rawTeams = (data.teams || []) as Team[];
        const reportsData = (data.reports || []) as any[];

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
        .select("id, full_name, email, is_banned, role, created_at, onboarding_completed, referrer_source")
        .order("created_at", { ascending: false });

      if (pErr) {
        const { data: fallbackProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, email, is_banned, role, created_at, onboarding_completed")
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
            <button
              onClick={() => {
                setActiveTab("badges");
                setSearchQuery("");
              }}
              className={`px-4 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition ${
                activeTab === "badges"
                  ? "bg-blue-600 text-white shadow"
                  : "text-blue-400 hover:text-blue-300"
              }`}
            >
              🏆 Issue Winner Badges
            </button>

            {userEmail?.toLowerCase() === outreachAdminEmail.toLowerCase() && (
              <>
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
                <button
                  onClick={() => {
                    setActiveTab("partnering");
                    setSearchQuery("");
                  }}
                  className={`px-4 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition ${
                    activeTab === "partnering"
                      ? "bg-zinc-900 text-amber-400 shadow border border-amber-500/20"
                      : "text-amber-500/70 hover:text-amber-400"
                  }`}
                >
                  Partnering Organizers 🤝 ({leads.filter((l) => l.status === "replied").length})
                </button>
              </>
            )}
          </div>
        </div>

        {/* Daily Resend Email Limit Tracker Widget */}
        {emailUsage && (
          <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-lg relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">📧</span>
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
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Source of Truth for Email Budget Guard. Resets daily at <strong className="text-zinc-200">00:00 UTC</strong> (Resend system boundary).
                </p>
              </div>

              <div className="text-right shrink-0">
                <div className="text-2xl font-extrabold font-mono text-white tracking-tight">
                  {emailUsage.total_sent} <span className="text-sm font-normal text-zinc-500">/ {emailUsage.limit}</span>
                </div>
                <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                  {emailUsage.remaining_global} emails remaining today
                </div>
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
              <div className="px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800/80 text-zinc-300 flex items-center gap-1.5 font-mono">
                <span>👤 Profile Nudges:</span>
                <strong className="text-emerald-400">{emailUsage.categories.profile_nudges}</strong>
              </div>
              <div className="px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800/80 text-zinc-300 flex items-center gap-1.5 font-mono">
                <span>👋 Onboarding Nudges:</span>
                <strong className="text-purple-400">{emailUsage.categories.onboarding_nudges}</strong>
              </div>
              {emailUsage.categories.other > 0 && (
                <div className="px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800/80 text-zinc-300 flex items-center gap-1.5 font-mono">
                  <span>⚙️ Other Emails:</span>
                  <strong className="text-zinc-400">{emailUsage.categories.other}</strong>
                </div>
              )}
            </div>
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

            {/* Leads List Table */}
            <div className="card card-static p-0 overflow-hidden">
              <div className="p-4 border-b border-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/40">
                <div className="text-xs font-semibold text-zinc-300 flex flex-wrap items-center gap-1.5">
                  <span>Total Leads ({leads.length}) •</span>
                  <span className="text-emerald-400">
                    Pitches Sent ({leads.filter((l) => l.pitch_sent_at || l.status === "pitch_sent" || l.status === "opened" || l.status === "replied").length})
                  </span>
                  <span>•</span>
                  <span className="text-emerald-300 font-mono">
                    Opened ({leads.filter((l) => l.opened_at || (l.open_count && l.open_count > 0) || l.status === "opened").length})
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono italic ml-1" title="Open rates are approximate because some mail clients pre-fetch or block tracking pixels.">
                    *Approximate — some mail clients pre-fetch or block tracking pixels
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="input text-xs py-1.5 px-3 bg-zinc-950 text-zinc-200 border border-zinc-800 rounded"
                  >
                    <option value="all">All Statuses</option>
                    <option value="new">New Leads</option>
                    <option value="sent">Pitch Sent (Unopened)</option>
                    <option value="opened">Opened</option>
                    <option value="replied">Replied</option>
                  </select>

                  <input
                    type="text"
                    placeholder="Search hackathons or colleges..."
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
                        <td colSpan={7} className="p-12 text-center text-zinc-500 text-xs">
                          No Unstop hackathon leads found. Click <strong>"Fetch Unstop Hackathons"</strong> to import live events!
                        </td>
                      </tr>
                    ) : (
                      leads
                        .filter((l) => {
                          const matchesQuery =
                            l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (l.college_or_host &&
                              l.college_or_host.toLowerCase().includes(searchQuery.toLowerCase()));

                          if (!matchesQuery) return false;

                          if (statusFilter === "replied") return l.status === "replied";
                          if (statusFilter === "opened") return l.opened_at || (l.open_count && l.open_count > 0) || l.status === "opened";
                          if (statusFilter === "sent") return (l.status === "pitch_sent" || l.pitch_sent_at) && !l.opened_at && l.status !== "replied";
                          if (statusFilter === "new") return !l.pitch_sent_at && l.status !== "pitch_sent" && l.status !== "opened" && l.status !== "replied";

                          return true;
                        })
                        .map((lead) => (
                          <tr key={lead.id} className={`hover:bg-zinc-900/30 transition-colors ${selectedLeadIds.has(lead.id) ? "bg-amber-950/10" : ""}`}>
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
                                <div>
                                  <span className="text-zinc-200">{lead.organizer_email}</span>
                                  {lead.last_sent_to && lead.last_sent_to.toLowerCase() !== lead.organizer_email.toLowerCase() && (
                                    <div className="text-[10px] text-emerald-400/90 font-mono mt-0.5" title="Sent to custom recipient email">
                                      ✉ Sent to: {lead.last_sent_to}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-zinc-600 italic">Not listed on public API</span>
                              )}
                            </td>

                            {/* Status Tag */}
                            <td className="p-4">
                              {lead.status === "replied" ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-violet-950/90 text-violet-300 border border-violet-700/60 shadow-[0_0_8px_rgba(139,92,246,0.2)]">
                                  💬 Replied
                                </span>
                              ) : lead.opened_at || (lead.open_count && lead.open_count > 0) || lead.status === "opened" ? (
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
                                {(lead.pitch_sent_at || lead.status === "pitch_sent" || lead.status === "opened") && lead.status !== "replied" && (
                                  <button
                                    type="button"
                                    onClick={() => handleMarkReplied(lead.id, lead.title)}
                                    title="Mark organizer response as replied"
                                    className="text-[10px] font-mono uppercase tracking-wider py-1.5 px-2.5 rounded border border-violet-900/60 hover:border-violet-500 bg-violet-950/30 hover:bg-violet-900/50 text-violet-300 transition cursor-pointer"
                                  >
                                    💬 Replied
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openPitchModal(lead)}
                                  className="text-[10px] font-mono uppercase tracking-wider py-1.5 px-3 rounded border border-emerald-900/60 hover:border-emerald-500 bg-emerald-950/30 hover:bg-emerald-600 text-emerald-400 hover:text-white transition cursor-pointer"
                                >
                                  {lead.status === "pitch_sent" || lead.status === "replied" ? "Re-pitch" : "Preview & Send Pitch"}
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
