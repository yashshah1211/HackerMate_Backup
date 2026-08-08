"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import CertificateModal, { UserBadge } from "@/components/CertificateModal";
import ShareModal from "@/components/ShareModal";
import { formatPrizeDisplay } from "@/app/hackathons/page";
import VerifiedBuilderBadge from "@/components/VerifiedBuilderBadge";

type PartnerConfig = {
  id: string;
  slug: string;
  hackathon_id: string;
  partner_name: string;
  tagline: string | null;
  brand_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
  banner_url: string | null;
  override_prize_pool: string | null;
  features?: any;
};

type Hackathon = {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  mode: string | null;
  prize_pool: string | null;
  currency?: string | null;
  website_url: string | null;
  tags: string[] | null;
  college?: string | null;
  max_participants?: number | null;
};

type Team = {
  id: string;
  name: string;
  description: string;
  college: string | null;
  skills: string[] | null;
  roles_needed: string[] | null;
  max_members: number;
  is_recruiting: boolean;
  owner_id: string;
  team_members: any[];
  track?: string | null;
};

function getTeamTrack(team: any): string | null {
  if (team.track) return team.track;
  if (!team.description) return null;
  const match = team.description.match(/\[Track:\s*([^\]]+)\]/i);
  return match ? match[1].trim() : null;
}

function getCleanTeamDescription(desc: string | null | undefined): string {
  if (!desc) return "";
  return desc.replace(/\[Track:\s*[^\]]+\]/gi, "").trim();
}

type RegisteredBuilder = {
  id: string;
  full_name: string;
  email: string;
  college: string | null;
  avatar_url: string | null;
  skills: string[] | null;
  is_available?: boolean;
  metadata?: any;
};

function PartnerPageContent() {
  const { showToast, confirm } = useNotification();
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [partner, setPartner] = useState<PartnerConfig | null>(null);
  const [hackathon, setHackathon] = useState<Hackathon | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [builders, setBuilders] = useState<RegisteredBuilder[]>([]);
  const [userWinnerBadge, setUserWinnerBadge] = useState<UserBadge | null>(null);
  const [userName, setUserName] = useState("");
  const [shareTeamForModal, setShareTeamForModal] = useState<Team | null>(null);
  const [showCertModal, setShowCertModal] = useState(false);
  const [showPartnerShareModal, setShowPartnerShareModal] = useState(false);
  const [isUserLookingForTeam, setIsUserLookingForTeam] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const [activeTab, setActiveTab] = useState<"teams" | "builders">("teams");
  const [selectedEventTrack, setSelectedEventTrack] = useState<string>("all");

  const [showTrackPickerModal, setShowTrackPickerModal] = useState(false);
  const [selectedTrackForModal, setSelectedTrackForModal] = useState("");

  const [showTeamTrackModal, setShowTeamTrackModal] = useState(false);
  const [selectedTeamIdForTrack, setSelectedTeamIdForTrack] = useState("");
  const [selectedTrackForTeamModal, setSelectedTrackForTeamModal] = useState("");
  const [savingTeamTrack, setSavingTeamTrack] = useState(false);

  function handleProtectedAction(targetUrl: string | (() => void)) {
    if (!currentUserId) {
      router.push(`/?next=${encodeURIComponent(`/partners/${slug}`)}&auth=true`);
    } else if (typeof targetUrl === "function") {
      targetUrl();
    } else {
      router.push(targetUrl);
    }
  }

  async function handleSaveTeamTrack() {
    if (!selectedTeamIdForTrack || !selectedTrackForTeamModal) return;
    setSavingTeamTrack(true);
    try {
      const targetTeam = teams.find((t) => t.id === selectedTeamIdForTrack);
      if (!targetTeam) return;

      const cleanDesc = getCleanTeamDescription(targetTeam.description);
      const newDesc = `[Track: ${selectedTrackForTeamModal}] ${cleanDesc}`;

      const { error } = await supabase
        .from("teams")
        .update({ description: newDesc })
        .eq("id", selectedTeamIdForTrack);

      if (error) {
        showToast(error.message, "error");
      } else {
        const trackObj = partner?.features?.events?.find((e: any) => e.id === selectedTrackForTeamModal);
        showToast(`Registered team '${targetTeam.name}' for track '${trackObj?.name || selectedTrackForTeamModal}'!`, "success");
        setShowTeamTrackModal(false);
        setSelectedEventTrack(selectedTrackForTeamModal);
        setActiveTab("teams");
        loadPartnerData();
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to save team track.", "error");
    } finally {
      setSavingTeamTrack(false);
    }
  }

  async function handleToggleLookingForTeam(explicitTrackId?: string) {
    if (!currentUserId) {
      router.push(`/?next=${encodeURIComponent(`/partners/${slug}`)}&auth=true`);
      return;
    }

    if (!partner) return;

    // If user is not currently looking for team AND partner has multiple event tracks AND no track specified yet:
    if (!isUserLookingForTeam && !explicitTrackId && partner.features?.events?.length > 0) {
      setSelectedTrackForModal(partner.features.events[0].id);
      setShowTrackPickerModal(true);
      return;
    }

    const targetTrackId = explicitTrackId || selectedTrackForModal || (selectedEventTrack !== "all" ? selectedEventTrack : undefined);

    setTogglingStatus(true);
    try {
      if (isUserLookingForTeam && !explicitTrackId) {
        const { error } = await supabase
          .from("hackathon_registrations")
          .delete()
          .eq("user_id", currentUserId)
          .eq("hackathon_id", partner.hackathon_id);

        if (error) {
          showToast(error.message, "error");
        } else {
          setIsUserLookingForTeam(false);
          setShowTrackPickerModal(false);
          showToast("Removed yourself from builders looking for teams.", "info");
          loadPartnerData();
        }
      } else {
        let regStatus = "confirmed";
        if (hackathon?.max_participants !== null && hackathon?.max_participants !== undefined) {
          const { count } = await supabase
            .from("hackathon_registrations")
            .select("id", { count: "exact", head: true })
            .eq("hackathon_id", partner.hackathon_id)
            .eq("status", "confirmed");

          if (count !== null && count >= hackathon.max_participants) {
            regStatus = "waitlisted";
          }
        }

        const selectedEvtObj = partner.features?.events?.find((e: any) => e.id === targetTrackId);
        const metaPayload = targetTrackId
          ? {
              event_track: targetTrackId,
              event_name: selectedEvtObj?.name || targetTrackId,
            }
          : {};

        const { error } = await supabase
          .from("hackathon_registrations")
          .upsert(
            {
              user_id: currentUserId,
              hackathon_id: partner.hackathon_id,
              looking_for_team: true,
              status: regStatus,
              metadata: metaPayload,
            },
            { onConflict: "user_id,hackathon_id" }
          );

        if (error) {
          showToast(error.message, "error");
        } else {
          setIsUserLookingForTeam(true);
          setShowTrackPickerModal(false);
          const trackLabel = selectedEvtObj?.name ? ` for track '${selectedEvtObj.name}'` : "";
          if (regStatus === "waitlisted") {
            showToast(`Added to waitlist${trackLabel}! Capacity limit reached for this event.`, "info");
          } else {
            showToast(`Listed${trackLabel}! Other builders can now find you for this event track.`, "success");
          }
          if (targetTrackId) {
            setSelectedEventTrack(targetTrackId);
            setActiveTab("builders");
          }
          loadPartnerData();
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to update status.", "error");
    } finally {
      setTogglingStatus(false);
    }
  }

  async function loadPartnerData() {
    try {
      setLoading(true);

      // 1. Fetch Partner Config by slug
      const { data: partnerData, error: partnerErr } = await supabase
        .from("partner_configs")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (partnerErr || !partnerData) {
        setPartner(null);
        setLoading(false);
        return;
      }

      setPartner(partnerData);

      // 2. Fetch Hackathon details (explicit public fields)
      const { data: hackathonData } = await supabase
        .from("hackathons")
        .select("id, name, description, start_date, end_date, location, mode, prize_pool, currency, website_url, tags, type, college, max_participants")
        .eq("id", partnerData.hackathon_id)
        .maybeSingle();

      setHackathon(hackathonData);

      // 3. Fetch Teams registered for this hackathon
      const { data: teamHackathonsData } = await supabase
        .from("team_hackathons")
        .select("team_id, teams(*, team_members(id))")
        .eq("hackathon_id", partnerData.hackathon_id);

      const parsedTeams = (teamHackathonsData || [])
        .map((item: any) => item.teams)
        .filter(Boolean);
      setTeams(parsedTeams);

      // 4. Fetch Builders who are actively looking for a team for this hackathon
      const { data: regData } = await supabase
        .from("hackathon_registrations")
        .select("user_id, looking_for_team, metadata, profiles(id, full_name, college, avatar_url, skills, is_available)")

        .eq("hackathon_id", partnerData.hackathon_id)
        .eq("looking_for_team", true);

      const parsedBuilders = (regData || [])
        .map((r: any) => ({
          ...(r.profiles || {}),
          metadata: r.metadata,
        }))
        .filter((b: any) => b && b.id);
      setBuilders(parsedBuilders);

      // 5. Check if logged in user has won a badge for this hackathon and checking registration status
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (profile) setUserName(profile.full_name);

        const { data: badgeData } = await supabase
          .from("user_badges")
          .select("*")
          .eq("user_id", user.id)
          .eq("hackathon_id", partnerData.hackathon_id)
          .maybeSingle();

        if (badgeData) {
          setUserWinnerBadge(badgeData as UserBadge);
        }

        const { data: userReg } = await supabase
          .from("hackathon_registrations")
          .select("id, looking_for_team")
          .eq("user_id", user.id)
          .eq("hackathon_id", partnerData.hackathon_id)
          .maybeSingle();

        setIsUserLookingForTeam(!!(userReg?.looking_for_team));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (slug) {
      loadPartnerData();
    }
  }, [slug]);

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-6 pt-36 pb-16">
        <div className="flex flex-col items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-2 border-zinc-800 border-t-[#3B82F6] rounded-full animate-spin mb-4" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading Partner Portal...</p>
        </div>
      </main>
    );
  }

  if (!partner) {
    return (
      <main className="max-w-4xl mx-auto px-6 pt-36 pb-16">
        <div className="card card-static p-12 text-center">
          <h1 className="text-xl font-bold text-white mb-2">Partner Portal Not Found</h1>
          <p className="text-xs text-zinc-400 mb-6">The requested partner page does not exist or has been updated.</p>
          <Link href="/hackathons" className="btn btn-primary btn-sm inline-flex">
            Browse All Hackathons
          </Link>
        </div>
      </main>
    );
  }

  const brandColor = partner.brand_color || "#3B82F6";
  const displayPrize = formatPrizeDisplay(partner.override_prize_pool || hackathon?.prize_pool, hackathon?.currency) || "Prize Pool TBA";

  return (
    <main className="max-w-5xl mx-auto px-6 pt-32 pb-16">
      {/* Partner Hero Header */}
      <div
        className="relative overflow-hidden rounded-2xl border bg-white dark:bg-zinc-950 p-8 md:p-10 shadow-xl dark:shadow-2xl animate-fade-in-up mb-8 transition-colors"
        style={{ borderColor: `${brandColor}40` }}
      >
        <div
          className="absolute top-0 right-0 left-0 h-1.5"
          style={{ background: `linear-gradient(to right, ${brandColor}, #6366f1, #B4F461)` }}
        />

        <div className="flex flex-col gap-6 relative z-10">
          <div>
            {/* Co-Branded Tag */}
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 px-3 py-1 text-xs font-mono uppercase tracking-wider mb-4">
              <span className="text-[#649a1f] dark:text-[#B4F461] font-bold">HACKERMATE</span>
              <span className="text-zinc-400 dark:text-zinc-500">×</span>
              <span style={{ color: brandColor }} className="font-bold flex items-center gap-1.5 dark:text-sky-400">
                {slug === "axcentra" && (
                  <img
                    src="/partners/axcentra-icon-only-transparent.png"
                    alt="Axcentra Icon"
                    className="h-3.5 w-auto object-contain inline-block"
                  />
                )}
                {slug === "axcentra"
                  ? "AXCENTRA"
                  : slug === "stampers"
                  ? "STAMPERS"
                  : slug === "gamnexis"
                  ? "GAMNEXIS"
                  : slug === "aethos" || slug === "aethos-day-zero"
                  ? "ÆTHOS — DAY ZERO"
                  : slug === "morrow" || slug === "mnm"
                  ? "MORROW 1.0"
                  : partner.partner_name.replace(/^HackerMate\s*x\s*/i, "").split(" ")[0].toUpperCase()}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              {partner.logo_url ? (
                <img
                  src={partner.logo_url}
                  alt={`${partner.partner_name} Logo`}
                  className="h-12 sm:h-16 w-auto object-contain shrink-0 rounded-xl shadow-md"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (slug === "axcentra") {
                      target.src = "/partners/axcentra-icon-only-transparent.png";
                    } else if (slug === "aethos" || slug === "aethos-day-zero") {
                      target.src = "/partners/aethos-logo.jpg";
                    } else if (slug === "morrow" || slug === "mnm") {
                      target.src = "/partners/morrow-icon.png";
                    } else {
                      target.style.display = "none";
                    }
                  }}
                />
              ) : (
                (slug === "morrow" || slug === "mnm") ? (
                  <img
                    src="/partners/morrow-icon.png"
                    alt="Morrow Logo"
                    className="h-12 sm:h-14 w-auto object-contain shrink-0 rounded-xl"
                  />
                ) : (slug === "aethos" || slug === "aethos-day-zero") ? (
                  <img
                    src="/partners/aethos-logo.jpg"
                    alt="ÆTHOS Logo"
                    className="h-12 sm:h-14 w-auto object-contain shrink-0 rounded-xl"
                  />
                ) : (
                  slug === "axcentra" && (
                    <img
                      src="/partners/axcentra-icon-only-transparent.png"
                      alt="Axcentra Logo"
                      className="h-12 sm:h-14 w-auto object-contain shrink-0"
                    />
                  )
                )
              )}

              {(partner.features?.organizer_logo || partner.features?.organizers?.length > 0 || (slug === "aethos" || slug === "aethos-day-zero")) && (
                <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs shadow-sm shrink-0">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Presented by</span>
                  <div className="flex items-center gap-2">
                    <img
                      src={partner.features?.organizer_logo || "/partners/alpha-forge-logo.jpg"}
                      alt="Alpha Forge Logo"
                      className="h-5 w-auto object-contain rounded"
                    />
                    {(slug === "aethos" || slug === "aethos-day-zero" || partner.features?.organizers?.some((o: any) => o.name === "TWS")) && (
                      <img
                        src="/partners/tws-logo.jpg"
                        alt="TWS Logo"
                        className="h-5 w-auto object-contain rounded"
                      />
                    )}
                  </div>
                </div>
              )}

              <h1 className="text-3xl md:text-4xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                {partner.partner_name}
              </h1>
            </div>

            <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-2xl mt-3 leading-relaxed font-sans">
              {partner.tagline || hackathon?.description?.slice(0, 180) + "..."}
            </p>

            {/* HackerMate Platform Context Explainer */}
            <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 flex items-start gap-2.5 max-w-2xl">
              <span className="text-blue-500 dark:text-blue-400 text-sm mt-0.5">🤝</span>
              <p className="text-xs text-blue-900 dark:text-blue-200/90 leading-relaxed font-sans">
                <strong className="text-blue-950 dark:text-white font-semibold">HackerMate Team Matching Hub:</strong> Browse individual builders, join a recruiting team, or list yourself to find teammates for this hackathon.
              </p>
            </div>
          </div>

          {/* Event Metrics Bar */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {!(slug === "aethos" || slug === "aethos-day-zero") && (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs">
                <span className="text-amber-500 dark:text-amber-400 font-bold">💰</span>
                <span className="font-bold text-zinc-900 dark:text-white">{displayPrize}</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs">
              <span className="text-blue-500 dark:text-blue-400">📅</span>
              <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                {hackathon?.start_date ? new Date(hackathon.start_date).toLocaleDateString() : "Date TBA"} —{" "}
                {hackathon?.end_date ? new Date(hackathon.end_date).toLocaleDateString() : "Date TBA"}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs">
              <span className="text-emerald-500 dark:text-emerald-400">🌐</span>
              <span className="text-zinc-700 dark:text-zinc-300 font-medium capitalize">{hackathon?.mode || "Online"} Sprint</span>
            </div>
          </div>

          {/* Hero CTAs - Full Width Wrapping Toolbar */}
          <div className="flex flex-wrap items-center gap-3 pt-5 border-t border-zinc-200/80 dark:border-zinc-800/80 w-full">
            <button
              onClick={() => handleProtectedAction(`/teams/create?hackathon=${partner.hackathon_id}`)}
              className="btn btn-lime text-xs py-2.5 px-4 font-bold text-black dark:text-black bg-[#B4F461] hover:bg-[#a3e64f] shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-transform hover:scale-105 rounded-xl"
            >
              <span className="text-black dark:text-black">+ Create Team</span>
            </button>

            {partner.features?.events && partner.features.events.length > 0 && (
              <button
                onClick={() => {
                  handleProtectedAction(() => {
                    const userTeams = teams.filter(
                      (t) => t.owner_id === currentUserId || (t.team_members || []).some((m: any) => m.user_id === currentUserId || m.profiles?.id === currentUserId)
                    );
                    if (userTeams.length > 0) {
                      setSelectedTeamIdForTrack(userTeams[0].id);
                      const existingTrack = getTeamTrack(userTeams[0]);
                      setSelectedTrackForTeamModal(existingTrack || partner.features.events[0].id);
                      setShowTeamTrackModal(true);
                    } else {
                      router.push(`/teams/create?hackathon=${partner.hackathon_id}`);
                    }
                  });
                }}
                className="btn text-xs py-2.5 px-4 font-bold rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>🎯 Select Track for My Team</span>
              </button>
            )}

            <button
              onClick={() => handleToggleLookingForTeam()}
              disabled={togglingStatus}
              className={`btn text-xs py-2.5 px-4 flex items-center justify-center gap-1.5 transition cursor-pointer rounded-xl ${
                isUserLookingForTeam
                  ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 font-bold"
                  : "bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              {isUserLookingForTeam ? "Looking for Team ✓" : "🙋‍♂️ List Myself as Looking for Team"}
            </button>

            <button
              onClick={() => setShowPartnerShareModal(true)}
              className="btn text-xs py-2.5 px-4 flex items-center justify-center gap-1.5 transition cursor-pointer rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 font-bold"
              title="Share this partner teammate matcher to college WhatsApp groups"
            >
              <span>📲 Share to WhatsApp</span>
            </button>

            {/* Secondary Link: WhatsApp Channel */}
            {(partner.features?.whatsapp_channel || slug === "morrow" || slug === "mnm" || slug === "aethos" || slug === "aethos-day-zero") && (
              <a
                href={slug === "aethos" || slug === "aethos-day-zero" ? "https://tinyurl.com/AETHOS-Group" : partner.features?.whatsapp_channel || "https://whatsapp.com/channel/0029VbDGVGg96H4VGs87xO2Z"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/30 transition-colors shadow-sm"
              >
                <span>💬 Official WhatsApp Channel</span>
                <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            )}

            {/* Secondary Link: Official Website */}
            {(partner.features?.website_url || slug === "morrow" || slug === "mnm") && (
              <a
                href={partner.features?.website_url || "https://www.mnmworks.xyz/"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-white bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border border-indigo-300 dark:border-indigo-500/30 transition-colors"
              >
                <span>🌐 Official Website</span>
                <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            )}

            {/* Primary Link: Official Unstop Registration */}
            {(() => {
              if (!hackathon?.website_url) return null;
              const url = hackathon.website_url.trim();
              if (url.includes("/partners/") || url.includes("hackermate.in/partners")) return null;
              const isUnstop = url.toLowerCase().includes("unstop");
              const label = isUnstop ? "Official Unstop Registration" : "Official Event Website";
              return (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 transition-colors"
                >
                  <span>🎓 {label}</span>
                  <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Winner Congratulations Banner */}
      {userWinnerBadge && (
        <div className="mb-8 p-6 rounded-xl border border-blue-500/40 bg-gradient-to-r from-blue-950/40 via-indigo-950/40 to-zinc-950 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in-up">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏆</span>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Verified Winner of {partner.partner_name}!</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase">
                  {userWinnerBadge.rank_title || "Verified Winner"}
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">Your official badge & co-branded certificate are verified on HackerMate.</p>
            </div>
          </div>
          <button
            onClick={() => setShowCertModal(true)}
            className="btn btn-lime text-xs py-2 px-4 font-bold bg-[#B4F461] text-black dark:text-black hover:bg-[#a3e64f] shrink-0"
          >
            <span className="text-black dark:text-black">View & Download Certificate</span>
          </button>
        </div>
      )}

      {/* Featured Symposium Event Tracks Grid (If present in partner config) */}
      {partner.features?.events && partner.features.events.length > 0 && (
        <div className="mb-10 animate-fade-in-up">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>🕸️ Official Symposium Events & Tracks ({partner.features.events.length})</span>
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                {partner.features.organizer || "LICET CSE"} — Separate Teams & Builders matching for each event track!
              </p>
            </div>
            {selectedEventTrack !== "all" && (
              <button
                onClick={() => setSelectedEventTrack("all")}
                className="text-xs font-mono font-bold text-rose-500 hover:underline px-3 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 cursor-pointer"
              >
                Reset Track Filter (Show All)
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {partner.features.events.map((evt: any) => {
              const isSelected = selectedEventTrack === evt.id;
              const trackTeamsCount = teams.filter((t) => {
                const teamTrack = getTeamTrack(t);
                if (teamTrack) {
                  return teamTrack.toLowerCase() === evt.id.toLowerCase();
                }
                const searchTerms: Record<string, string[]> = {
                  "ignis": ["ignis", "energy", "power"],
                  "nexus": ["nexus", "communication", "chat"],
                  "atlas": ["atlas", "infrastructure", "mobility"],
                  "vita": ["vita", "food", "water", "health"],
                  "aether": ["aether", "exploration", "space"],
                  "sapientia": ["sapientia", "knowledge", "ai"],
                  "aegis": ["aegis", "security", "resilience"],
                  "nova": ["nova", "open", "innovation"],
                  "web-forge": ["web", "frontend", "html", "react", "website", "css", "forge"],
                  "multiverse-breach": ["ctf", "security", "cyber", "breach", "multiverse", "hack"],
                  "spider-sense": ["quiz", "sense", "algo", "python", "cs", "trivia"],
                  "across-spiderverse": ["hunt", "treasure", "across", "clue", "spiderverse"],
                  "beyond-the-web": ["paper", "research", "presentation", "beyond", "doc"],
                  "spider-sprint": ["speed", "sprint", "code", "coding", "cpp", "java", "dsa"]
                };
                const keywords = searchTerms[evt.id] || [evt.id.replace(/-/g, " ")];
                const text = [...(t.skills || []), t.description || ""].join(" ").toLowerCase();
                return keywords.some((kw) => text.includes(kw));
              }).length;

              const trackBuildersCount = builders.filter((b) => {
                const searchTerms: Record<string, string[]> = {
                  "web-forge": ["web", "frontend", "html", "react", "website", "css", "forge"],
                  "multiverse-breach": ["ctf", "security", "cyber", "breach", "multiverse", "hack"],
                  "spider-sense": ["quiz", "sense", "algo", "python", "cs", "trivia"],
                  "across-spiderverse": ["hunt", "treasure", "across", "clue", "spiderverse"],
                  "beyond-the-web": ["paper", "research", "presentation", "beyond", "doc"],
                  "spider-sprint": ["speed", "sprint", "code", "coding", "cpp", "java", "dsa"]
                };
                const keywords = searchTerms[evt.id] || [evt.id.replace(/-/g, " ")];
                const text = (b.skills || []).join(" ").toLowerCase();
                return keywords.some((kw) => text.includes(kw));
              }).length;

              return (
                <div
                  key={evt.id}
                  className={`group relative p-5 rounded-2xl border transition-all ${
                    isSelected
                      ? "bg-rose-500/10 dark:bg-rose-950/30 border-rose-500/60 ring-2 ring-rose-500/40 shadow-lg"
                      : "bg-white dark:bg-zinc-950/60 border-zinc-200/90 dark:border-zinc-900 hover:border-rose-500/40 hover:shadow-xl"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-xl shrink-0">
                      {evt.icon || (evt.id === "ignis" ? "🔥" : evt.id === "nexus" ? "📡" : evt.id === "atlas" ? "🌁" : evt.id === "vita" ? "🌱" : evt.id === "aether" ? "🚀" : evt.id === "sapientia" ? "🧠" : evt.id === "aegis" ? "🛡️" : evt.id === "nova" ? "❇️" : "🕸️")}
                    </div>
                    {evt.category && (
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                        {evt.category}
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-extrabold text-zinc-900 dark:text-white group-hover:text-rose-500 transition-colors">
                    {evt.name}
                  </h3>

                  {evt.desc && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1.5 leading-relaxed font-sans">
                      {evt.desc}
                    </p>
                  )}

                  {evt.challenge && (
                    <div className="mt-3 p-3 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 text-xs">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-1">
                        🎯 Your Challenge
                      </span>
                      <p className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans">
                        {evt.challenge}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-900/80 flex items-center justify-between gap-2 text-xs">
                    <button
                      onClick={() => {
                        setSelectedEventTrack(evt.id);
                        setActiveTab("teams");
                      }}
                      className={`px-2.5 py-1.5 rounded-lg font-mono font-bold text-[11px] transition flex items-center gap-1 cursor-pointer ${
                        isSelected && activeTab === "teams"
                          ? "bg-rose-500 text-white shadow-sm"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20"
                      }`}
                    >
                      <span>🛡️ {trackTeamsCount} Teams</span>
                    </button>

                    <button
                      onClick={() => {
                        setSelectedEventTrack(evt.id);
                        setActiveTab("builders");
                      }}
                      className={`px-2.5 py-1.5 rounded-lg font-mono font-bold text-[11px] transition flex items-center gap-1 cursor-pointer ${
                        isSelected && activeTab === "builders"
                          ? "bg-sky-500 text-white shadow-sm"
                          : "bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20"
                      }`}
                    >
                      <span>🙋‍♂️ {trackBuildersCount} Builders</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Team Matching Header Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-zinc-200 dark:border-zinc-900">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <span>Partner Team Matching Hub</span>
            {selectedEventTrack !== "all" && (
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                Track: {partner.features?.events?.find((e: any) => e.id === selectedEventTrack)?.name || selectedEventTrack}
              </span>
            )}
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {selectedEventTrack !== "all"
              ? `Showing teams and builders matching track '${partner.features?.events?.find((e: any) => e.id === selectedEventTrack)?.name || selectedEventTrack}'.`
              : `Find compatible teammates or join recruiting teams specifically for ${partner.partner_name}.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Tab Switcher */}
          <div className="flex bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-lg p-1 text-xs">
            <button
              onClick={() => setActiveTab("teams")}
              className={`px-4 py-1.5 rounded-md font-mono uppercase tracking-wider text-[10px] transition cursor-pointer ${
                activeTab === "teams" ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-bold shadow-sm" : "text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
              }`}
            >
              Teams ({
                teams.filter((t) => {
                  if (selectedEventTrack === "all") return true;
                  const searchTerms: Record<string, string[]> = {
                    "web-forge": ["web", "frontend", "html", "react", "website", "css", "forge"],
                    "multiverse-breach": ["ctf", "security", "cyber", "breach", "multiverse", "hack"],
                    "spider-sense": ["quiz", "sense", "algo", "python", "cs", "trivia"],
                    "across-spiderverse": ["hunt", "treasure", "across", "clue", "spiderverse"],
                    "beyond-the-web": ["paper", "research", "presentation", "beyond", "doc"],
                    "spider-sprint": ["speed", "sprint", "code", "coding", "cpp", "java", "dsa"]
                  };
                  const keywords = searchTerms[selectedEventTrack] || [selectedEventTrack.replace(/-/g, " ")];
                  const text = [...(t.skills || []), t.description || ""].join(" ").toLowerCase();
                  return keywords.some((kw) => text.includes(kw));
                }).length
              })
            </button>
            <button
              onClick={() => setActiveTab("builders")}
              className={`px-4 py-1.5 rounded-md font-mono uppercase tracking-wider text-[10px] transition cursor-pointer ${
                activeTab === "builders" ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-bold shadow-sm" : "text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
              }`}
            >
              Builders Looking ({
                builders.filter((b) => {
                  if (selectedEventTrack === "all") return true;
                  const searchTerms: Record<string, string[]> = {
                    "web-forge": ["web", "frontend", "html", "react", "website", "css", "forge"],
                    "multiverse-breach": ["ctf", "security", "cyber", "breach", "multiverse", "hack"],
                    "spider-sense": ["quiz", "sense", "algo", "python", "cs", "trivia"],
                    "across-spiderverse": ["hunt", "treasure", "across", "clue", "spiderverse"],
                    "beyond-the-web": ["paper", "research", "presentation", "beyond", "doc"],
                    "spider-sprint": ["speed", "sprint", "code", "coding", "cpp", "java", "dsa"]
                  };
                  const keywords = searchTerms[selectedEventTrack] || [selectedEventTrack.replace(/-/g, " ")];
                  const text = (b.skills || []).join(" ").toLowerCase();
                  return keywords.some((kw) => text.includes(kw));
                }).length
              })
            </button>
          </div>

          {/* Contextual Action Button */}
          {activeTab === "teams" ? (
            <button
              onClick={() => handleProtectedAction(`/teams/create?hackathon=${partner.hackathon_id}&track=${selectedEventTrack}`)}
              className="btn btn-lime px-3.5 py-1.5 rounded-lg text-xs font-bold text-black dark:text-black bg-[#B4F461] hover:bg-[#a3e64f] shadow-md shadow-[#B4F461]/20 border border-[#B4F461]/40 transition flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <span className="text-black dark:text-black">+ Create Team</span>
            </button>
          ) : (
            <button
              onClick={() => handleToggleLookingForTeam()}
              disabled={togglingStatus}
              className={`text-xs py-1.5 px-3.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                isUserLookingForTeam
                  ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 font-bold"
                  : "bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              {isUserLookingForTeam ? "Looking for Team ✓" : "🙋‍♂️ List Myself as Looking for Team"}
            </button>
          )}
        </div>
      </div>

      {/* Teams Feed */}
      {activeTab === "teams" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(() => {
            const filteredTeams = teams.filter((t) => {
              if (selectedEventTrack === "all") return true;
              const teamTrack = getTeamTrack(t);
              if (teamTrack) {
                return teamTrack.toLowerCase() === selectedEventTrack.toLowerCase();
              }
              const searchTerms: Record<string, string[]> = {
                "ignis": ["ignis", "energy", "power"],
                "nexus": ["nexus", "communication", "chat"],
                "atlas": ["atlas", "infrastructure", "mobility"],
                "vita": ["vita", "food", "water", "health"],
                "aether": ["aether", "exploration", "space"],
                "sapientia": ["sapientia", "knowledge", "ai"],
                "aegis": ["aegis", "security", "resilience"],
                "nova": ["nova", "open", "innovation"],
                "web-forge": ["web", "frontend", "html", "react", "website", "css", "forge"],
                "multiverse-breach": ["ctf", "security", "cyber", "breach", "multiverse", "hack"],
                "spider-sense": ["quiz", "sense", "algo", "python", "cs", "trivia"],
                "across-spiderverse": ["hunt", "treasure", "across", "clue", "spiderverse"],
                "beyond-the-web": ["paper", "research", "presentation", "beyond", "doc"],
                "spider-sprint": ["speed", "sprint", "code", "coding", "cpp", "java", "dsa"]
              };
              const keywords = searchTerms[selectedEventTrack] || [selectedEventTrack.replace(/-/g, " ")];
              const text = [...(t.skills || []), t.description || ""].join(" ").toLowerCase();
              return keywords.some((kw) => text.includes(kw));
            });

            if (filteredTeams.length === 0) {
              return (
                <div className="col-span-2 p-12 text-center card card-static border-dashed border-zinc-800">
                  <p className="text-xs text-zinc-400 mb-4">
                    {selectedEventTrack !== "all"
                      ? `No teams listed for track '${partner.features?.events?.find((e: any) => e.id === selectedEventTrack)?.name || selectedEventTrack}' yet.`
                      : "No recruiting teams created yet — be the first to create a team and start recruiting top talent for this event!"}
                  </p>
                  <button
                    onClick={() => handleProtectedAction(`/teams/create?hackathon=${partner.hackathon_id}&track=${selectedEventTrack}`)}
                    className="btn btn-primary btn-sm inline-flex cursor-pointer"
                  >
                    Be the first to create a team
                  </button>
                </div>
              );
            }

            return filteredTeams.map((team) => (
              <div
                key={team.id}
                className="card card-static p-5 flex flex-col justify-between hover:border-zinc-700 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h3 className="text-sm font-bold text-white">{team.name}</h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {team.team_members?.length || 1} / {team.max_members} Members
                    </span>
                  </div>

                  {(() => {
                    const teamTrackId = getTeamTrack(team);
                    const trackObj = partner.features?.events?.find((e: any) => e.id === teamTrackId);
                    if (trackObj || teamTrackId) {
                      return (
                        <div className="mb-2">
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold">
                            🎯 Track: {trackObj?.name || teamTrackId}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <p className="text-xs text-zinc-400 line-clamp-2 mb-3">{getCleanTeamDescription(team.description)}</p>

                  {team.skills && team.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {team.skills.map((s) => (
                        <span key={s} className="skill-chip text-[10px]">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-zinc-900 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-zinc-500 font-mono truncate">
                    {team.college || "Cross-College"}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShareTeamForModal(team)}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs font-bold text-zinc-300 hover:text-white flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>🔗 Share</span>
                    </button>
                    {(() => {
                      const isUserTeamMember = Boolean(
                        currentUserId &&
                          (team.owner_id === currentUserId ||
                            (team.team_members || []).some(
                              (m: any) => m.user_id === currentUserId || m.profiles?.id === currentUserId
                            ))
                      );
                      return (
                        <button
                          onClick={() => handleProtectedAction(`/teams/${team.id}`)}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#B4F461] hover:bg-[#a3e64f] transition shadow-sm font-semibold cursor-pointer inline-flex items-center"
                          style={{ color: "#09090b" }}
                        >
                          {isUserTeamMember ? "View Team →" : "View & Apply →"}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* Builders Feed */}
      {activeTab === "builders" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(() => {
            const filteredBuilders = builders.filter((b) => {
              if (selectedEventTrack === "all") return true;
              const searchTerms: Record<string, string[]> = {
                "web-forge": ["web", "frontend", "html", "react", "website", "css", "forge"],
                "multiverse-breach": ["ctf", "security", "cyber", "breach", "multiverse", "hack"],
                "spider-sense": ["quiz", "sense", "algo", "python", "cs", "trivia"],
                "across-spiderverse": ["hunt", "treasure", "across", "clue", "spiderverse"],
                "beyond-the-web": ["paper", "research", "presentation", "beyond", "doc"],
                "spider-sprint": ["speed", "sprint", "code", "coding", "cpp", "java", "dsa"]
              };
              const keywords = searchTerms[selectedEventTrack] || [selectedEventTrack.replace(/-/g, " ")];
              const text = (b.skills || []).join(" ").toLowerCase();
              return keywords.some((kw) => text.includes(kw));
            });

            if (filteredBuilders.length === 0) {
              return (
                <div className="col-span-3 p-12 text-center card card-static border-dashed border-zinc-800">
                  <p className="text-xs text-zinc-400 mb-4">
                    {selectedEventTrack !== "all"
                      ? `No builders listed for track '${partner.features?.events?.find((e: any) => e.id === selectedEventTrack)?.name || selectedEventTrack}' yet.`
                      : "No individual builders listed yet — be the first to list yourself as looking for a team and get discovered!"}
                  </p>
                  <button
                    onClick={() => handleToggleLookingForTeam()}
                    className="btn btn-primary btn-sm inline-flex cursor-pointer"
                  >
                    Be the first to list yourself as looking for a team
                  </button>
                </div>
              );
            }

            return filteredBuilders.map((builder) => (
              <div
                key={builder.id}
                className="card card-static p-4 flex flex-col justify-between hover:border-zinc-700 transition-all"
              >
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-white overflow-hidden text-sm">
                      {builder.avatar_url ? (
                        <img src={builder.avatar_url} alt={builder.full_name} className="w-full h-full object-cover" />
                      ) : (
                        builder.full_name?.charAt(0)
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-bold text-white leading-tight">{builder.full_name}</h4>
                        <VerifiedBuilderBadge profile={builder} />
                      </div>
                      <p className="text-[10px] text-zinc-500 truncate max-w-[150px]">{builder.college || "Developer"}</p>
                    </div>
                  </div>

                  {builder.skills && builder.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {builder.skills.slice(0, 3).map((s) => (
                        <span key={s} className="skill-chip text-[9px]">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-zinc-900">
                  <button
                    onClick={() => handleProtectedAction(`/profile/${builder.id}`)}
                    className="btn btn-secondary btn-xs w-full py-1.5 text-center block text-[11px] cursor-pointer"
                  >
                    View Profile
                  </button>
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* Certificate Modal */}
      {userWinnerBadge && (
        <CertificateModal
          isOpen={showCertModal}
          onClose={() => setShowCertModal(false)}
          badge={userWinnerBadge}
          recipientName={userName || "Verified Winner"}
        />
      )}

      {/* Event Track Selection Modal */}
      {showTrackPickerModal && partner?.features?.events && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 dark:bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl relative animate-fade-in-up">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-500/20">
                  Select Event Track
                </span>
                <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white mt-1">
                  Which event are you looking a team for?
                </h3>
              </div>
              <button
                onClick={() => setShowTrackPickerModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-3 mb-4">
              Select which specific event track at {partner.partner_name} you want to join or recruit teammates for:
            </p>

            <div className="space-y-2.5 my-3 max-h-72 overflow-y-auto pr-1">
              {partner.features.events.map((evt: any) => {
                const isSelected = selectedTrackForModal === evt.id;
                return (
                  <div
                    key={evt.id}
                    onClick={() => setSelectedTrackForModal(evt.id)}
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      isSelected
                        ? "bg-rose-50 dark:bg-rose-500/20 border-rose-500 text-rose-950 dark:text-white ring-1 ring-rose-500/50 shadow-sm"
                        : "bg-zinc-50 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800/80 text-zinc-800 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{evt.icon || "🕸️"}</span>
                      <div>
                        <p className="text-xs font-bold text-zinc-900 dark:text-white">{evt.name}</p>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{evt.category}</p>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? "border-rose-500 bg-rose-500 text-white" : "border-zinc-300 dark:border-zinc-700"}`}>
                      {isSelected && <span className="text-[10px]">✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-900">
              <button
                onClick={() => setShowTrackPickerModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleToggleLookingForTeam(selectedTrackForModal)}
                disabled={togglingStatus || !selectedTrackForModal}
                className="btn btn-lime text-xs py-2 px-5 font-bold bg-[#B4F461] text-black hover:bg-[#a3e64f] cursor-pointer"
              >
                List Myself for {partner.features.events.find((e: any) => e.id === selectedTrackForModal)?.name || "Event Track"} →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team Track Selection Modal */}
      {showTeamTrackModal && partner?.features?.events && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 dark:bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl relative animate-fade-in-up">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-500/20">
                  Register Team for Track
                </span>
                <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white mt-1">
                  Select Event Track for Your Team
                </h3>
              </div>
              <button
                onClick={() => setShowTeamTrackModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {(() => {
              const userTeams = teams.filter(
                (t) => t.owner_id === currentUserId || (t.team_members || []).some((m: any) => m.user_id === currentUserId || m.profiles?.id === currentUserId)
              );

              if (userTeams.length === 0) {
                return (
                  <div className="py-8 text-center">
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-4">You do not have any teams registered for this hackathon yet.</p>
                    <button
                      onClick={() => {
                        setShowTeamTrackModal(false);
                        router.push(`/teams/create?hackathon=${partner.hackathon_id}`);
                      }}
                      className="btn btn-primary btn-sm"
                    >
                      + Create a Team First
                    </button>
                  </div>
                );
              }

              return (
                <div className="space-y-4 my-4">
                  {userTeams.length > 1 && (
                    <div>
                      <label className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-1">Select Team</label>
                      <select
                        value={selectedTeamIdForTrack}
                        onChange={(e) => {
                          setSelectedTeamIdForTrack(e.target.value);
                          const selTeam = userTeams.find((t) => t.id === e.target.value);
                          if (selTeam) {
                            const trk = getTeamTrack(selTeam);
                            if (trk) setSelectedTrackForTeamModal(trk);
                          }
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-xs text-zinc-900 dark:text-white"
                      >
                        {userTeams.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-2">Select Event Track / Pillar</label>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {partner.features.events.map((evt: any) => {
                        const isSelected = selectedTrackForTeamModal === evt.id;
                        return (
                          <div
                            key={evt.id}
                            onClick={() => setSelectedTrackForTeamModal(evt.id)}
                            className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                              isSelected
                                ? "bg-amber-500/10 border-amber-500 text-zinc-900 dark:text-white ring-1 ring-amber-500/50 shadow-sm"
                                : "bg-zinc-50 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-xl">{evt.icon || "🎯"}</span>
                              <div>
                                <p className="text-xs font-bold text-zinc-900 dark:text-white">{evt.name}</p>
                                {evt.desc && <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-1">{evt.desc}</p>}
                              </div>
                            </div>
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? "border-amber-500 bg-amber-500 text-black font-bold" : "border-zinc-300 dark:border-zinc-700"}`}>
                              {isSelected && <span className="text-[10px]">✓</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-900">
              <button
                onClick={() => setShowTeamTrackModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTeamTrack}
                disabled={savingTeamTrack || !selectedTeamIdForTrack || !selectedTrackForTeamModal}
                className="btn btn-lime text-xs py-2 px-5 font-bold bg-[#B4F461] text-black hover:bg-[#a3e64f] cursor-pointer disabled:opacity-50"
              >
                {savingTeamTrack ? "Saving..." : "Save Track Registration →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Team Modal */}
      <ShareModal
        isOpen={!!shareTeamForModal}
        onClose={() => setShareTeamForModal(null)}
        title={`Share Team — ${shareTeamForModal?.name || ""}`}
        subtitle="Recruit teammates via WhatsApp, LinkedIn, X, or Telegram"
        shareUrl={typeof window !== "undefined" ? `${window.location.origin}/teams/${shareTeamForModal?.id}` : `https://hackermate.in/teams/${shareTeamForModal?.id}`}
        shareText={`🚀 We're recruiting developers for team '${shareTeamForModal?.name || ""}' ${partner?.partner_name ? `building for ${partner.partner_name}` : ""} on HackerMate! Check our team profile & apply here:`}
        type="team"
        metadata={{
          teamName: shareTeamForModal?.name,
          hackathonName: partner?.partner_name,
        }}
      />

      {/* Share Partner Hub Modal */}
      <ShareModal
        isOpen={showPartnerShareModal}
        onClose={() => setShowPartnerShareModal(false)}
        title={`Share ${partner?.partner_name || "Partner"} Teammate Matcher`}
        subtitle="Broadcast to your college WhatsApp & Telegram groups"
        shareUrl={typeof window !== "undefined" ? `${window.location.origin}/partners/${slug}` : `https://hackermate.in/partners/${slug}`}
        shareText={`🚀 *${partner?.partner_name || "Hackathon"} — Teammate Matcher Hub* ⚡\n\nFind recruiting teams & verified developers for ${partner?.partner_name || "this hackathon"} on HackerMate:\n\n*(Share this in your college WhatsApp group to team up for this hackathon!)*`}
        type="team"
        metadata={{
          teamName: `${partner?.partner_name || "Partner"} Teammate Hub`,
          hackathonName: partner?.partner_name,
        }}
      />
    </main>
  );
}

export default function PartnerPage() {
  return <PartnerPageContent />;
}
