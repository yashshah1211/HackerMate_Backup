"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { IssuedBadgeRecord } from "../_types";
import { DEFAULT_HACKATHON_ID } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { StatusBadge } from "../_components/StatusBadge";
import { Award, AlertTriangle, RefreshCw, Trash2, ExternalLink, CheckCircle2 } from "lucide-react";

interface BadgesTabProps {
  partnerConfigsMap?: Record<string, { id: string; slug: string; partner_name: string }>;
}

export default function BadgesTab({ partnerConfigsMap = {} }: BadgesTabProps) {
  const { showToast, confirm } = useNotification();

  // Form State
  const [badgeFormHackathonId, setBadgeFormHackathonId] = useState(DEFAULT_HACKATHON_ID);
  const [badgeFormEmails, setBadgeFormEmails] = useState("");
  const [badgeFormType, setBadgeFormType] = useState("verified_winner");
  const [badgeFormName, setBadgeFormName] = useState("Verified Winner — All India Hackathon 2026");
  const [badgeFormIssuer, setBadgeFormIssuer] = useState("HackerMate");
  const [badgeFormRank, setBadgeFormRank] = useState("Verified Winner");
  const [submittingBadges, setSubmittingBadges] = useState(false);
  const [badgeIssuerResult, setBadgeIssuerResult] = useState<{
    granted: number;
    missingEmails: string[];
  } | null>(null);

  // Directory State
  const [issuedBadges, setIssuedBadges] = useState<IssuedBadgeRecord[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(false);
  const [revokingBadgeId, setRevokingBadgeId] = useState<string | null>(null);

  // Dynamically derive default issuer name when hackathon ID changes
  useEffect(() => {
    async function updateIssuer() {
      if (!badgeFormHackathonId) {
        setBadgeFormIssuer("HackerMate");
        return;
      }

      if (partnerConfigsMap[badgeFormHackathonId]) {
        const p = partnerConfigsMap[badgeFormHackathonId];
        setBadgeFormIssuer(`HackerMate × ${p.partner_name}`);
        return;
      }

      try {
        const { data } = await supabase
          .from("partner_configs")
          .select("partner_name")
          .eq("hackathon_id", badgeFormHackathonId)
          .maybeSingle();

        if (data?.partner_name) {
          setBadgeFormIssuer(`HackerMate × ${data.partner_name}`);
        } else {
          setBadgeFormIssuer("HackerMate");
        }
      } catch {
        setBadgeFormIssuer("HackerMate");
      }
    }

    updateIssuer();
  }, [badgeFormHackathonId, partnerConfigsMap]);

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

  useEffect(() => {
    fetchIssuedBadges();
  }, []);

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

  function handleRevokeBadge(badge: IssuedBadgeRecord) {
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

  return (
    <div className="p-6 max-w-4xl mx-auto rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 shadow-xs space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800/80">
        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-center text-zinc-900 dark:text-zinc-100 shrink-0">
          <Award className="w-5 h-5 text-zinc-700 dark:text-[#B4F461]" />
        </div>
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            Partner & Winner Badge Issuer
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Bulk grant verified profile badges and digital certificates to hackathon winners.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleIssueBadges();
        }}
        className="space-y-4"
      >
        <div>
          <label className="block text-xs font-mono text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
            Target Hackathon ID
          </label>
          <input
            type="text"
            value={badgeFormHackathonId}
            onChange={(e) => setBadgeFormHackathonId(e.target.value)}
            placeholder="e.g. 00000000-0000-0000-0000-000001703933"
            className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition"
            required
          />
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono mt-1 block">
            Default pre-filled ID corresponds to <strong>All India Hackathon</strong>.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-mono text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Badge Name
            </label>
            <input
              type="text"
              value={badgeFormName}
              onChange={(e) => setBadgeFormName(e.target.value)}
              placeholder="Verified Winner — All India Hackathon 2026"
              className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Issuer Name
            </label>
            <input
              type="text"
              value={badgeFormIssuer}
              onChange={(e) => setBadgeFormIssuer(e.target.value)}
              placeholder="HackerMate"
              className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-mono text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Badge Type
            </label>
            <select
              value={badgeFormType}
              onChange={(e) => setBadgeFormType(e.target.value)}
              className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition"
            >
              <option value="verified_winner">verified_winner</option>
              <option value="finalist">finalist</option>
              <option value="participant">participant</option>
              <option value="special_award">special_award</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-mono text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Rank Title (Badge Chip)
            </label>
            <input
              type="text"
              value={badgeFormRank}
              onChange={(e) => setBadgeFormRank(e.target.value)}
              placeholder="1st Place / Track Winner / Verified Winner"
              className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-mono text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
            Winner User Emails (One per line or comma-separated)
          </label>
          <textarea
            value={badgeFormEmails}
            onChange={(e) => setBadgeFormEmails(e.target.value)}
            rows={5}
            placeholder={`winner1@example.com\nwinner2@example.com\nwinner3@example.com`}
            className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-[#B4F461] focus:ring-1 focus:ring-[#B4F461] outline-none transition resize-y"
            required
          />
        </div>

        {badgeIssuerResult && (
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs space-y-2">
            <div className="flex items-center gap-1.5 text-zinc-900 dark:text-zinc-100 font-bold">
              <CheckCircle2 className="w-4 h-4 text-[#B4F461]" />
              <span>Granted {badgeIssuerResult.granted} badge(s) to registered user profiles.</span>
            </div>
            {badgeIssuerResult.missingEmails.length > 0 && (
              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/80 text-amber-700 dark:text-amber-400">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{badgeIssuerResult.missingEmails.length} email(s) not registered on HackerMate yet:</span>
                </div>
                <p className="text-[11px] font-mono mt-1 text-zinc-500 dark:text-zinc-400 break-all">
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
            className="px-6 py-2.5 rounded-xl bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer shadow-sm shadow-[#B4F461]/10 disabled:opacity-50"
          >
            <Award className="w-4 h-4" />
            <span>{submittingBadges ? "Granting Badges..." : "Bulk Issue Badges"}</span>
          </button>
        </div>
      </form>

      {/* Directory Section */}
      <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>Issued Badges & Certificate Directory</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 font-semibold">
                {issuedBadges.length} total
              </span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Inspect and revoke granted badges. Revoking permanently deletes the badge and invalidates verification.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchIssuedBadges}
            disabled={loadingBadges}
            className="px-3.5 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider bg-zinc-100/80 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium transition cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingBadges ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {loadingBadges ? (
          <div className="p-8 text-center text-xs text-zinc-500 font-mono">
            Loading issued badges directory...
          </div>
        ) : issuedBadges.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500 dark:text-zinc-400 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 font-mono">
            No issued badges found in database.
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50/50 dark:bg-zinc-950/40 border-b border-zinc-200 dark:border-zinc-800/80">
                  <tr>
                    <th className="p-3.5 font-semibold">Recipient</th>
                    <th className="p-3.5 font-semibold">Badge Title & Rank</th>
                    <th className="p-3.5 font-semibold">Hackathon</th>
                    <th className="p-3.5 font-semibold">Certificate ID</th>
                    <th className="p-3.5 font-semibold">Issued Date</th>
                    <th className="p-3.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {issuedBadges.map((b) => {
                    const recipientName = b.profiles?.full_name || "Unknown User";
                    const recipientEmail = b.profiles?.email || b.user_id;
                    const certId = (b as any).metadata?.certificate_id || `HM-CERT-${b.id.slice(0, 8).toUpperCase()}`;

                    return (
                      <tr key={b.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                        <td className="p-3.5">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100">{recipientName}</div>
                          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">{recipientEmail}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5">
                            <Award className="w-3.5 h-3.5 text-[#B4F461] shrink-0" />
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{b.rank_title || b.badge_name}</span>
                          </div>
                          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">{b.badge_name}</div>
                        </td>
                        <td className="p-3.5">
                          <span className="text-zinc-700 dark:text-zinc-300">{b.hackathons?.name || "All India Hackathon"}</span>
                        </td>
                        <td className="p-3.5 font-mono text-[11px]">
                          <Link
                            href={`/api/certificates/verify/${certId}`}
                            target="_blank"
                            className="text-zinc-900 dark:text-zinc-100 hover:text-[#B4F461] inline-flex items-center gap-1 transition"
                          >
                            <span>{certId}</span>
                            <ExternalLink className="w-3 h-3 text-zinc-400" />
                          </Link>
                        </td>
                        <td className="p-3.5 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                          {new Date(b.issued_at).toLocaleDateString()}
                        </td>
                        <td className="p-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleRevokeBadge(b)}
                            disabled={revokingBadgeId === b.id}
                            className="text-[10px] font-mono uppercase tracking-wider py-1 px-2.5 rounded-lg border border-rose-500/20 bg-rose-500/10 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white transition cursor-pointer font-semibold"
                          >
                            {revokingBadgeId === b.id ? "Revoking..." : "Revoke"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
