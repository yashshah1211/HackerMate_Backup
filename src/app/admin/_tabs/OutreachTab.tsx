"use client";

import { useState } from "react";
import { OrganizerLead } from "../_types";
import { useNotification } from "@/context/NotificationContext";
import { StatusBadge } from "../_components/StatusBadge";
import {
  Mail,
  Send,
  FileText,
  RefreshCw,
  Search,
  Building2,
  ExternalLink,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  Eye,
  Inbox,
} from "lucide-react";

interface OutreachTabProps {
  leads: OrganizerLead[];
  setLeads: React.Dispatch<React.SetStateAction<OrganizerLead[]>>;
  loadingLeads: boolean;
  loadLeads: () => Promise<void>;
  userEmail: string | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export default function OutreachTab({
  leads,
  setLeads,
  loadingLeads,
  loadLeads,
  userEmail,
  searchQuery,
  setSearchQuery,
}: OutreachTabProps) {
  const { showToast, confirm } = useNotification();

  const [fetchingUnstop, setFetchingUnstop] = useState(false);
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
  const [editingLeadNotes, setEditingLeadNotes] = useState<OrganizerLead | null>(null);
  const [leadNotesText, setLeadNotesText] = useState("");
  const [leadEmailText, setLeadEmailText] = useState("");
  const [updatingLeadStatus, setUpdatingLeadStatus] = useState(false);
  const [syncingGmail, setSyncingGmail] = useState(false);

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

  async function handleScrapeUnstop() {
    setFetchingUnstop(true);
    try {
      const res = await fetch("/api/admin/scrape-unstop", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(
          data.message ||
            (data.count > 0
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
    const primaryEmail =
      lead.last_sent_to || (lead.organizer_email ? lead.organizer_email.split(",")[0].trim() : "");
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
          showToast("Partnership proposal email dispatched successfully!", "success");
        }
        setPitchModalOpen(false);
        await loadLeads();
      } else {
        showToast(resData.error || "Failed to dispatch email pitch.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to dispatch email pitch.", "error");
    } finally {
      setSendingPitch(false);
    }
  }

  function openBulkPitchModal() {
    if (selectedLeadIds.size === 0) {
      showToast("Please select at least one hackathon lead to bulk pitch.", "error");
      return;
    }
    setBulkPitchSubject(
      "Partnership Proposal: Official Teammate Matchmaker for your upcoming Hackathon"
    );
    setBulkPitchBody(
      `Hi Team,\n\n` +
        `Congrats on launching your hackathon on Unstop!\n\n` +
        `I'm Yash, founder of HackerMate (https://hackermate.in) — a dedicated team-formation platform for hackathons (skills & GitHub stats matching).\n\n` +
        `Solo builders often struggle to find teammates, leading to dropouts & spam in Discord/WhatsApp groups. We'd love to serve as your Official Teammate Matching Partner (100% free for your event).\n\n` +
        `What we will do for your event:\n` +
        `1. Provide a clean team-matching portal for your participants.\n` +
        `2. Eliminate team-formation spam in your channels.\n` +
        `3. Drive extra builder registrations to your event.\n\n` +
        `All we ask is to include your custom HackerMate match link in your participant welcome email / announcements.\n\n` +
        `Would you be open to a quick chat or 30-second preview?\n\n` +
        `Best regards,\nYash Shah\nFounder, HackerMate`
    );
    setBulkPitchModalOpen(true);
  }

  async function handleBulkSend() {
    if (selectedLeadIds.size === 0 || !bulkPitchSubject.trim() || !bulkPitchBody.trim()) {
      showToast("Subject and content body cannot be empty.", "error");
      return;
    }
    setBulkSending(true);
    try {
      const selectedLeads = leads.filter((l) => selectedLeadIds.has(l.id));
      let successCount = 0;
      let failCount = 0;

      for (const lead of selectedLeads) {
        const targetEmail =
          lead.last_sent_to ||
          (lead.organizer_email ? lead.organizer_email.split(",")[0].trim() : "");
        if (!targetEmail) {
          failCount++;
          continue;
        }

        const personalizedBody = bulkPitchBody
          .replace(/your upcoming Hackathon/g, lead.title)
          .replace(/your hackathon/g, lead.title)
          .replace(/your event/g, lead.title);

        const formattedHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111; max-width: 600px; padding: 20px;">
            ${personalizedBody.replace(/\n/g, "<br />")}
          </div>
        `;

        try {
          const res = await fetch("/api/admin/send-organizer-pitch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leadId: lead.id,
              recipientEmail: targetEmail,
              subject: bulkPitchSubject.replace(/your upcoming Hackathon/g, lead.title),
              contentHtml: formattedHtml,
            }),
          });
          if (res.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
        await new Promise((r) => setTimeout(r, 400));
      }

      showToast(
        `Batch dispatch complete: ${successCount} sent successfully${
          failCount > 0 ? `, ${failCount} failed` : ""
        }.`,
        successCount > 0 ? "success" : "error"
      );
      setBulkPitchModalOpen(false);
      setSelectedLeadIds(new Set());
      await loadLeads();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to complete bulk pitch.", "error");
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
            showToast(
              `Removed "${leadTitle}". It will not be re-fetched on future scrapes.`,
              "success"
            );
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

  async function handleUpdateLeadStatus(
    leadId: string,
    status?: string,
    notes?: string,
    organizerEmail?: string
  ) {
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

  function openEditNotesModal(lead: OrganizerLead) {
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
      message:
        "Are you sure you want to restore all previously removed hackathon leads back to your active list?",
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

  return (
    <>
      <div className="space-y-6">
        {/* Outreach Action Bar */}
        <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B4F461] animate-pulse" />
              <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 font-semibold">
                Lead Intelligence & CRM
              </span>
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Unstop Hackathon Outreach
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Discover upcoming hackathons on Unstop, extract organizer contacts, and send partnership pitches.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={openBulkPitchModal}
              disabled={selectedLeadIds.size === 0}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Bulk Pitch</span>
              {selectedLeadIds.size > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-md bg-[#B4F461] text-zinc-950 font-mono text-[10px] font-bold">
                  {selectedLeadIds.size}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleSyncGmailReplies}
              disabled={syncingGmail}
              className="px-3.5 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition flex items-center gap-1.5 cursor-pointer"
              title="Scan Gmail inbox for organizer replies and auto-update CRM lead status"
            >
              <Inbox className={`w-3.5 h-3.5 ${syncingGmail ? "animate-spin" : ""}`} />
              <span>{syncingGmail ? "Scanning Inbox..." : "Sync Gmail"}</span>
            </button>

            <button
              type="button"
              onClick={handleSendSummaryPdf}
              disabled={sendingSummaryPdf}
              className="px-3.5 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className={`w-3.5 h-3.5 ${sendingSummaryPdf ? "animate-spin" : ""}`} />
              <span>{sendingSummaryPdf ? "Generating PDF..." : "Summary PDF"}</span>
            </button>

            <button
              type="button"
              onClick={loadLeads}
              disabled={loadingLeads}
              className="px-3 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingLeads ? "animate-spin" : ""}`} />
            </button>

            <button
              type="button"
              onClick={handleRestoreLeads}
              className="px-3 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition cursor-pointer"
              title="Restore all previously removed leads back to active list"
            >
              Restore Removed
            </button>

            <button
              type="button"
              onClick={handleScrapeUnstop}
              disabled={fetchingUnstop}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-[#B4F461]/10 disabled:opacity-50"
            >
              <Search className={`w-3.5 h-3.5 ${fetchingUnstop ? "animate-spin" : ""}`} />
              <span>{fetchingUnstop ? "Scanning Platforms..." : "Fetch Multi-Platform Leads"}</span>
            </button>
          </div>
        </div>

        {/* Pipeline Stage Summary Funnel Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto p-1.5 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl select-none">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === "all"
                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            <span>All Leads</span>
            <span className="px-1.5 py-0.5 rounded-md bg-zinc-200/60 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 text-[10px] font-mono border border-zinc-300/40 dark:border-zinc-800">
              {leads.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("new")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === "new"
                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            <span>New (Pitch Ready)</span>
            <span className="px-1.5 py-0.5 rounded-md bg-zinc-200/60 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 text-[10px] font-mono border border-zinc-300/40 dark:border-zinc-800">
              {leads.filter((l) => (l.status === "new" || !l.status) && l.organizer_email).length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("no_email")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === "no_email"
                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            <span>Missing Email</span>
            <span className="px-1.5 py-0.5 rounded-md bg-zinc-200/60 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 text-[10px] font-mono border border-zinc-300/40 dark:border-zinc-800">
              {
                leads.filter(
                  (l) =>
                    l.status === "no_email" ||
                    (!l.organizer_email && l.status !== "partner_live" && l.status !== "archived")
                ).length
              }
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("pitch_sent")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === "pitch_sent"
                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            <span>Pitch Sent</span>
            <span className="px-1.5 py-0.5 rounded-md bg-zinc-200/60 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 text-[10px] font-mono border border-zinc-300/40 dark:border-zinc-800">
              {
                leads.filter(
                  (l) =>
                    (l.status === "pitch_sent" || l.pitch_sent_at) &&
                    !l.opened_at &&
                    l.status !== "replied" &&
                    l.status !== "negotiating" &&
                    l.status !== "partner_live"
                ).length
              }
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("opened")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === "opened"
                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            <span>Opened</span>
            <span className="px-1.5 py-0.5 rounded-md bg-zinc-200/60 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 text-[10px] font-mono border border-zinc-300/40 dark:border-zinc-800">
              {
                leads.filter(
                  (l) =>
                    l.opened_at || (l.open_count && l.open_count > 0) || l.status === "opened"
                ).length
              }
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("replied")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === "replied"
                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            <span>Replied</span>
            <span className="px-1.5 py-0.5 rounded-md bg-zinc-200/60 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 text-[10px] font-mono border border-zinc-300/40 dark:border-zinc-800">
              {leads.filter((l) => l.status === "replied").length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("negotiating")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === "negotiating"
                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            <span>Negotiating</span>
            <span className="px-1.5 py-0.5 rounded-md bg-zinc-200/60 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 text-[10px] font-mono border border-zinc-300/40 dark:border-zinc-800">
              {leads.filter((l) => l.status === "negotiating").length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("partner_live")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === "partner_live"
                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            <span>Partner Live</span>
            <span className="px-1.5 py-0.5 rounded-md bg-zinc-200/60 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 text-[10px] font-mono border border-zinc-300/40 dark:border-zinc-800">
              {leads.filter((l) => l.status === "partner_live").length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("stale")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === "stale"
                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            }`}
          >
            <span>Stale Leads</span>
            <span className="px-1.5 py-0.5 rounded-md bg-zinc-200/60 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 text-[10px] font-mono border border-zinc-300/40 dark:border-zinc-800">
              {
                leads.filter((l) => {
                  const act = l.updated_at || l.opened_at || l.pitch_sent_at || l.created_at;
                  const days = act
                    ? Math.floor((Date.now() - new Date(act).getTime()) / 86400000)
                    : 0;
                  return (
                    ["pitch_sent", "opened", "replied", "negotiating"].includes(l.status) &&
                    days >= 5
                  );
                }).length
              }
            </span>
          </button>
        </div>

        {/* Leads Pipeline Table */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-950/40">
            <div className="text-xs font-mono text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
              <span>
                Showing{" "}
                <strong className="text-zinc-900 dark:text-zinc-100 font-mono">
                  {
                    leads.filter((l) => {
                      const matchesQuery =
                        l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (l.college_or_host &&
                          l.college_or_host.toLowerCase().includes(searchQuery.toLowerCase())) ||
                        (l.organizer_email &&
                          l.organizer_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
                        (l.notes && l.notes.toLowerCase().includes(searchQuery.toLowerCase()));

                      if (!matchesQuery) return false;

                      const act = l.updated_at || l.opened_at || l.pitch_sent_at || l.created_at;
                      const days = act
                        ? Math.floor((Date.now() - new Date(act).getTime()) / 86400000)
                        : 0;
                      const isStale =
                        ["pitch_sent", "opened", "replied", "negotiating"].includes(l.status) &&
                        days >= 5;

                      if (statusFilter === "stale") return isStale;
                      if (statusFilter === "no_email")
                        return l.status === "no_email" || !l.organizer_email;
                      if (statusFilter === "partner_live") return l.status === "partner_live";
                      if (statusFilter === "negotiating") return l.status === "negotiating";
                      if (statusFilter === "replied") return l.status === "replied";
                      if (statusFilter === "opened")
                        return (
                          l.opened_at || (l.open_count && l.open_count > 0) || l.status === "opened"
                        );
                      if (statusFilter === "pitch_sent")
                        return (l.status === "pitch_sent" || l.pitch_sent_at) && !l.opened_at;
                      if (statusFilter === "new")
                        return (l.status === "new" || !l.status) && l.organizer_email;

                      return true;
                    }).length
                  }
                </strong>{" "}
                of {leads.length} Leads
              </span>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Search titles, hosts, emails, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 pl-8 pr-3.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition w-full sm:w-64"
              />
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-zinc-50/50 dark:bg-zinc-950/40 text-zinc-500 dark:text-zinc-400 font-mono text-[10px] uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800/80">
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
                      className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-700 text-[#B4F461] focus:ring-[#B4F461] cursor-pointer"
                    />
                  </th>
                  <th className="p-4 font-semibold">Hackathon & Host</th>
                  <th className="p-4 font-semibold">Pipeline Stage</th>
                  <th className="p-4 font-semibold">Last Activity</th>
                  <th className="p-4 font-semibold">Opens</th>
                  <th className="p-4 font-semibold">Organizer Email & Notes</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-zinc-500 text-xs font-mono">
                      No Unstop hackathon leads found. Click <strong>&quot;Fetch Multi-Platform Leads&quot;</strong> to import live events.
                    </td>
                  </tr>
                ) : (
                  leads
                    .filter((l) => {
                      const matchesQuery =
                        l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (l.college_or_host &&
                          l.college_or_host.toLowerCase().includes(searchQuery.toLowerCase())) ||
                        (l.organizer_email &&
                          l.organizer_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
                        (l.notes && l.notes.toLowerCase().includes(searchQuery.toLowerCase()));

                      if (!matchesQuery) return false;

                      const act = l.updated_at || l.opened_at || l.pitch_sent_at || l.created_at;
                      const days = act
                        ? Math.floor((Date.now() - new Date(act).getTime()) / 86400000)
                        : 0;
                      const isStale =
                        ["pitch_sent", "opened", "replied", "negotiating"].includes(l.status) &&
                        days >= 5;

                      if (statusFilter === "stale") return isStale;
                      if (statusFilter === "no_email")
                        return l.status === "no_email" || !l.organizer_email;
                      if (statusFilter === "partner_live") return l.status === "partner_live";
                      if (statusFilter === "negotiating") return l.status === "negotiating";
                      if (statusFilter === "replied") return l.status === "replied";
                      if (statusFilter === "opened")
                        return (
                          l.opened_at || (l.open_count && l.open_count > 0) || l.status === "opened"
                        );
                      if (statusFilter === "pitch_sent")
                        return (l.status === "pitch_sent" || l.pitch_sent_at) && !l.opened_at;
                      if (statusFilter === "new")
                        return (l.status === "new" || !l.status) && l.organizer_email;

                      return true;
                    })
                    .map((lead) => {
                      const lastActivity =
                        lead.updated_at ||
                        lead.opened_at ||
                        lead.pitch_sent_at ||
                        lead.created_at;
                      const daysSinceContact = lastActivity
                        ? Math.floor(
                            (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
                          )
                        : 0;
                      const isStale =
                        ["pitch_sent", "opened", "replied", "negotiating"].includes(lead.status) &&
                        daysSinceContact >= 5;

                      return (
                        <tr
                          key={lead.id}
                          className={`transition-colors ${
                            isStale
                              ? "bg-rose-500/5 dark:bg-rose-500/[0.03] border-l-2 border-l-rose-500"
                              : selectedLeadIds.has(lead.id)
                              ? "bg-zinc-50 dark:bg-zinc-800/40"
                              : "hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40"
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
                              className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-700 text-[#B4F461] focus:ring-[#B4F461] cursor-pointer"
                            />
                          </td>

                          {/* Title & Host */}
                          <td className="p-4 max-w-xs">
                            <a
                              href={lead.unstop_url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-zinc-900 dark:text-zinc-100 hover:text-[#B4F461] transition-colors inline-flex items-center gap-1 group"
                            >
                              <span className="line-clamp-1">{lead.title}</span>
                              <ExternalLink className="w-3 h-3 text-zinc-400 group-hover:text-[#B4F461] shrink-0" />
                            </a>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-zinc-400 shrink-0" />
                              <span>{lead.college_or_host || "Independent Host"} • {lead.event_date || "Upcoming"}</span>
                            </p>
                          </td>

                          {/* Pipeline Stage Select */}
                          <td className="p-4">
                            <select
                              value={lead.status || (lead.organizer_email ? "new" : "no_email")}
                              onChange={(e) => handleUpdateLeadStatus(lead.id, e.target.value)}
                              className="text-xs py-1 px-2.5 rounded-lg font-mono font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 cursor-pointer focus:border-[#B4F461] outline-none"
                            >
                              <option value="new">New Lead</option>
                              <option value="no_email">Missing Email</option>
                              <option value="pitch_sent">Pitch Sent</option>
                              <option value="opened">Opened</option>
                              <option value="replied">Replied</option>
                              <option value="negotiating">Negotiating</option>
                              <option value="partner_live">Partner Live</option>
                              <option value="declined">Declined / Archived</option>
                            </select>
                          </td>

                          {/* Last Activity & Stale Warning */}
                          <td className="p-4 font-mono text-[11px]">
                            {isStale ? (
                              <StatusBadge
                                label={`Stale (${daysSinceContact}d)`}
                                variant="danger"
                                dot
                              />
                            ) : (
                              <span className="text-zinc-600 dark:text-zinc-400">
                                {daysSinceContact === 0 ? "Today" : `${daysSinceContact}d ago`}
                              </span>
                            )}
                            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                              {lastActivity
                                ? new Date(lastActivity).toLocaleDateString()
                                : "No activity"}
                            </div>
                          </td>

                          {/* Opens Count */}
                          <td className="p-4 font-mono text-[11px]">
                            {lead.open_count && lead.open_count > 0 ? (
                              <span className="text-zinc-900 dark:text-zinc-100 font-semibold flex items-center gap-1">
                                <Eye className="w-3 h-3 text-zinc-400" />
                                <span>{lead.open_count}x</span>
                              </span>
                            ) : (
                              <span className="text-zinc-400">0</span>
                            )}
                          </td>

                          {/* Email & Notes */}
                          <td className="p-4 font-mono text-[11px] max-w-xs">
                            {lead.organizer_email ? (
                              <div className="truncate text-zinc-700 dark:text-zinc-300" title={lead.organizer_email}>
                                {lead.organizer_email}
                              </div>
                            ) : (
                              <div className="text-zinc-400 italic">No email listed</div>
                            )}
                            {lead.notes && (
                              <p
                                className="text-[10px] text-zinc-500 font-sans italic mt-1 line-clamp-1 flex items-center gap-1"
                                title={lead.notes}
                              >
                                <Edit3 className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
                                <span>{lead.notes}</span>
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
                                className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer font-medium"
                              >
                                Notes
                              </button>

                              <button
                                type="button"
                                onClick={() => openPitchModal(lead)}
                                className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded-lg bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 font-bold transition cursor-pointer shadow-sm shadow-[#B4F461]/10"
                              >
                                {lead.status === "pitch_sent" || lead.status === "replied"
                                  ? "Re-pitch"
                                  : "Pitch"}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleRemoveLead(lead.id, lead.title)}
                                title="Remove lead"
                                className="text-[10px] font-mono uppercase tracking-wider py-1 px-2 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white transition cursor-pointer"
                              >
                                <X className="w-3 h-3" />
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

      {/* Pitch Modal */}
      {pitchModalOpen && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090b] shadow-2xl p-6 space-y-4 overflow-hidden">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-zinc-100 dark:border-zinc-900">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Send className="w-4 h-4 text-zinc-500" />
                  <span>Pitch Partnership for {selectedLead.title}</span>
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Review and customize the partnership email proposal before dispatching.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPitchModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                  Organizer Email Address
                </label>
                <input
                  type="email"
                  value={pitchRecipientEmail}
                  onChange={(e) => setPitchRecipientEmail(e.target.value)}
                  placeholder="e.g. organizer@college.edu"
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                  Email Subject
                </label>
                <input
                  type="text"
                  value={pitchSubject}
                  onChange={(e) => setPitchSubject(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                  Email Content (Markdown / Plain Text)
                </label>
                <textarea
                  value={pitchBody}
                  onChange={(e) => setPitchBody(e.target.value)}
                  rows={8}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition resize-none leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-900">
              <div className="text-[10px] text-zinc-400 font-mono">
                Resend budget: 100 emails/day
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setPitchModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs transition cursor-pointer"
                  disabled={sendingPitch}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendPitch}
                  disabled={sendingPitch || !pitchRecipientEmail.trim() || !pitchSubject.trim()}
                  className="px-5 py-2 rounded-xl bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 font-bold text-xs transition cursor-pointer shadow-sm shadow-[#B4F461]/10 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {sendingPitch ? "Sending..." : "Send Proposal"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Pitch Modal */}
      {bulkPitchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090b] shadow-2xl p-6 space-y-4 overflow-hidden">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-zinc-100 dark:border-zinc-900">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Send className="w-4 h-4 text-zinc-500" />
                  <span>Bulk Pitch Dispatch — {selectedLeadIds.size} Leads Selected</span>
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Send personalized email proposals to all selected organizers with rate-limiting protection.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkPitchModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Selected Target Summary */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1 font-semibold">
                  Selected Recipient Targets ({selectedLeadIds.size}):
                </div>
                <div className="max-h-24 overflow-y-auto space-y-1 text-zinc-600 dark:text-zinc-300 font-mono text-[11px] pr-2">
                  {leads
                    .filter((l) => selectedLeadIds.has(l.id))
                    .map((l) => (
                      <div
                        key={l.id}
                        className="flex items-center justify-between gap-2 border-b border-zinc-200/50 dark:border-zinc-800/40 pb-0.5"
                      >
                        <span className="truncate max-w-[280px] font-sans font-medium text-zinc-900 dark:text-zinc-100">
                          {l.title}
                        </span>
                        <span className="text-zinc-500 text-[10px]">
                          {l.last_sent_to || l.organizer_email || "No email listed"}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                  Email Subject
                </label>
                <input
                  type="text"
                  value={bulkPitchSubject}
                  onChange={(e) => setBulkPitchSubject(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                  Email Template (Markdown / Plain Text)
                </label>
                <textarea
                  value={bulkPitchBody}
                  onChange={(e) => setBulkPitchBody(e.target.value)}
                  rows={8}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition resize-none leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-900">
              <div className="text-[10px] text-zinc-400 font-mono">
                400ms interval rate-limiting
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setBulkPitchModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs transition cursor-pointer"
                  disabled={bulkSending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkSend}
                  disabled={
                    bulkSending ||
                    selectedLeadIds.size === 0 ||
                    !bulkPitchSubject.trim() ||
                    !bulkPitchBody.trim()
                  }
                  className="px-5 py-2 rounded-xl bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 font-bold text-xs transition cursor-pointer shadow-sm shadow-[#B4F461]/10 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {bulkSending ? "Dispatching..." : `Dispatch ${selectedLeadIds.size} Pitches`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lead Notes & Email Edit Modal */}
      {editingLeadNotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090b] shadow-2xl p-6 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-900">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-zinc-500" />
                  <span>Edit Lead CRM Details</span>
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                  {editingLeadNotes.title}
                </p>
              </div>
              <button
                onClick={() => setEditingLeadNotes(null)}
                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-zinc-500 dark:text-zinc-400 font-mono text-[10px] uppercase mb-1">
                  Organizer Contact Email
                </label>
                <input
                  type="email"
                  value={leadEmailText}
                  onChange={(e) => setLeadEmailText(e.target.value)}
                  placeholder="e.g. organizer@hackathon.com"
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition"
                />
                <p className="text-[10px] text-zinc-400 mt-1">
                  Adding an email to a &quot;Missing Email&quot; lead automatically moves it to &quot;New Lead (Pitch Ready)&quot;.
                </p>
              </div>

              <div>
                <label className="block text-zinc-500 dark:text-zinc-400 font-mono text-[10px] uppercase mb-1">
                  CRM Conversation Notes
                </label>
                <textarea
                  value={leadNotesText}
                  onChange={(e) => setLeadNotesText(e.target.value)}
                  placeholder="Record negotiation details, Telegram handles, custom requirements, or follow-up notes..."
                  rows={4}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-900">
              <button
                type="button"
                onClick={() => setEditingLeadNotes(null)}
                className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs transition cursor-pointer"
                disabled={updatingLeadStatus}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  handleUpdateLeadStatus(
                    editingLeadNotes.id,
                    undefined,
                    leadNotesText,
                    leadEmailText
                  )
                }
                disabled={updatingLeadStatus}
                className="px-5 py-2 rounded-xl bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 font-bold text-xs transition cursor-pointer shadow-sm shadow-[#B4F461]/10 disabled:opacity-50"
              >
                {updatingLeadStatus ? "Saving..." : "Save CRM Details"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
