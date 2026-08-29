"use client";

import { useState } from "react";
import Link from "next/link";
import { OrganizerLead, PartnerConfigRecord, PartnerAnalyticsResponse } from "../_types";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { StatusBadge } from "../_components/StatusBadge";
import PartnerCompositionModal from "@/components/PartnerCompositionModal";
import {
  Handshake,
  Building2,
  Mail,
  ExternalLink,
  ArrowRight,
  BarChart3,
  Plus,
  Radio,
} from "lucide-react";

interface PartneringTabProps {
  leads: OrganizerLead[];
  allHackathons: { id: string; name: string; website_url: string | null }[];
  partnerConfigsMap: Record<string, { id: string; slug: string; partner_name: string }>;
  partnerConfigsList: PartnerConfigRecord[];
  loadLeads: () => Promise<void>;
}

export default function PartneringTab({
  leads,
  allHackathons,
  partnerConfigsMap,
  partnerConfigsList,
  loadLeads,
}: PartneringTabProps) {
  const { showToast, confirm } = useNotification();

  const [creatingPortalId, setCreatingPortalId] = useState<string | null>(null);
  const [selectedPartnerModal, setSelectedPartnerModal] = useState<PartnerConfigRecord | null>(null);
  const [partnerAnalyticsData, setPartnerAnalyticsData] = useState<PartnerAnalyticsResponse | null>(null);
  const [loadingPartnerAnalytics, setLoadingPartnerAnalytics] = useState(false);
  const [sendingPartnerBroadcast, setSendingPartnerBroadcast] = useState(false);

  async function openPartnerCompositionModal(partnerConfig: PartnerConfigRecord) {
    setSelectedPartnerModal(partnerConfig);
    setPartnerAnalyticsData(null);
    setLoadingPartnerAnalytics(true);
    try {
      const res = await fetch(
        `/api/admin/partner-composition?hackathonId=${partnerConfig.hackathon_id}`
      );
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
        showToast(`Announcement broadcast sent to ${data.count} participant(s)!`, "success");
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
          showToast(err.message || "Failed to remove partner lead", "error");
        }
      },
    });
  }

  const repliedLeads = leads.filter((l) => l.status === "replied");

  return (
    <>
      <div className="space-y-6">
        {/* Header summary banner */}
        <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B4F461] animate-pulse" />
              <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 font-semibold">
                Event Partnerships
              </span>
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Partnering Organizers & Co-Branded Portals
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Organizers who responded to outreach. Access live partner portals or provision new custom co-branded pages in 1 click.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge
              label={`${repliedLeads.length} Partnered Events`}
              variant="neutral"
            />
          </div>
        </div>

        {repliedLeads.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 text-zinc-500 dark:text-zinc-400 flex items-center justify-center mx-auto mb-3">
              <Handshake className="w-6 h-6" />
            </div>
            <p className="text-zinc-900 dark:text-zinc-100 text-sm font-semibold">No Partnering Organizers Yet</p>
            <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">
              When an organizer lead is marked as &quot;Replied&quot; in the Outreach tab, they will automatically appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {repliedLeads.map((lead) => {
              const matchingHackathon = allHackathons.find(
                (h) =>
                  h.id === lead.id ||
                  h.name === lead.title ||
                  (h.website_url && h.website_url === lead.unstop_url)
              );
              const partnerConfig = matchingHackathon
                ? partnerConfigsMap[matchingHackathon.id]
                : null;
              const isCreating = creatingPortalId === lead.id;

              return (
                <div
                  key={lead.id}
                  className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 hover:border-zinc-300 dark:hover:border-zinc-700/80 transition flex flex-col justify-between space-y-4 shadow-xs"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <StatusBadge label="Replied & Partnered" variant="accent" dot />
                      {partnerConfig ? (
                        <StatusBadge label={`Portal: /partners/${partnerConfig.slug}`} variant="neutral" />
                      ) : (
                        <StatusBadge label="Portal Not Created" variant="warning" />
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
                        {lead.title}
                      </h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span>{lead.college_or_host || "Independent Host"}</span>
                      </p>
                    </div>

                    <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 space-y-1 pt-1">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3 h-3 text-zinc-400" />
                        <span>{lead.organizer_email || "No email listed"}</span>
                      </div>
                      {lead.unstop_url && (
                        <div className="flex items-center gap-1.5">
                          <ExternalLink className="w-3 h-3 text-zinc-400" />
                          <a
                            href={lead.unstop_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-zinc-900 dark:text-zinc-100 hover:text-[#B4F461] transition"
                          >
                            View Source Event Page
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
                    {partnerConfig ? (
                      <Link
                        href={`/partners/${partnerConfig.slug}`}
                        target="_blank"
                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition flex items-center gap-1"
                      >
                        <span>View Partner Portal</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCreatePartnerPortal(lead)}
                        disabled={isCreating}
                        className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-[#B4F461]/10 disabled:opacity-50"
                      >
                        {isCreating ? (
                          <>
                            <div className="w-3 h-3 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
                            <span>Creating Portal...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Create Partner Portal</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleRemovePartnerLead(lead)}
                      className="text-[10px] font-mono uppercase tracking-wider text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 py-1 px-2.5 rounded-lg border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 cursor-pointer transition font-semibold"
                    >
                      Remove Partner
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Active Partner Portals Section */}
        <div className="space-y-4 pt-6 border-t border-zinc-200 dark:border-zinc-800/80">
          <div>
            <h4 className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <span>Active Partner Portals ({partnerConfigsList.length})</span>
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Live team composition telemetry and participant announcement broadcast controls.
            </p>
          </div>

          {partnerConfigsList.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-500">
              No active partner configs found in database.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {partnerConfigsList.map((pc: any) => (
                <div
                  key={pc.id}
                  className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 hover:border-zinc-300 dark:hover:border-zinc-700/80 transition flex flex-col justify-between space-y-4 shadow-xs"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge label={`/partners/${pc.slug}`} variant="neutral" />
                      <span
                        className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 truncate max-w-[150px]"
                        title={pc.hackathon_id}
                      >
                        ID: {pc.hackathon_id?.slice(0, 8)}...
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{pc.partner_name}</h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{pc.tagline}</p>
                  </div>

                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openPartnerCompositionModal(pc)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-[#B4F461]/10"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>Composition & Broadcast</span>
                    </button>

                    <Link
                      href={`/partners/${pc.slug}`}
                      target="_blank"
                      className="text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-[#B4F461] flex items-center gap-1 transition"
                    >
                      <span>View Portal</span>
                      <ExternalLink className="w-3 h-3 text-zinc-400" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
    </>
  );
}
