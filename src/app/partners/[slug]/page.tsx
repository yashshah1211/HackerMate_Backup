"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  Brain,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Flag,
  Flame,
  Globe,
  Handshake,
  Lightbulb,
  Lock,
  Plus,
  Radio,
  Rocket,
  Route,
  Share2,
  Shield,
  Sprout,
  Target,
  Trophy,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Button,
  ButtonLink,
  Chip,
  Dialog,
  EmptyState,
  PageLoader,
  Segmented,
  Select,
  SeatMeter,
  Tape,
  TeamMark,
  buttonClass,
} from "@/components/system";
import { Container, Eyebrow } from "@/components/landing/primitives";
import { useNotification } from "@/context/NotificationContext";
import CertificateModal, { UserBadge } from "@/components/CertificateModal";
import ShareModal from "@/components/ShareModal";
import { formatPrizeDisplay } from "@/lib/hackathons/prizeDisplay";
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

/* ---------- Presentational helpers (V2) ---------- */

/** Mobile touch-target bump for md buttons (34px → 40px below sm). */
const TAP = "max-sm:h-10";

/** Lucide icons for the known symposium tracks (replaces V1 emoji fallbacks). */
const TRACK_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  ignis: Flame,
  nexus: Radio,
  atlas: Route,
  vita: Sprout,
  aether: Rocket,
  sapientia: Brain,
  aegis: Shield,
  nova: Lightbulb,
};

function TrackIcon({ id, className }: { id: string; className?: string }) {
  const Icon = TRACK_ICONS[id] || Target;
  return <Icon className={cn("size-4", className)} aria-hidden />;
}

/** Non-interactive "closed" state shown where an action used to be. */
function ClosedNote({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-10 items-center gap-1.5 rounded-md bg-sunken px-3 text-[13px] font-medium text-ink-3 ring-1 ring-inset ring-line sm:h-[34px]">
      <Lock className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

/** Selectable row used inside the track picker dialogs. */
function TrackOption({
  id,
  name,
  meta,
  selected,
  onSelect,
}: {
  id: string;
  name: string;
  meta?: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-12 w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left ring-1 ring-inset transition-colors",
        selected ? "bg-selected ring-accent/50" : "bg-raised ring-line hover:bg-hover hover:ring-line-strong",
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2">
          <TrackIcon id={id} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold text-ink">{name}</span>
          {meta && <span className="block truncate text-[12px] text-ink-3">{meta}</span>}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
          selected ? "bg-accent text-on-accent ring-transparent" : "ring-line-strong",
        )}
      >
        {selected && <CheckCircle2 className="size-3.5" />}
      </span>
    </button>
  );
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

  const todayStr = new Date().toISOString().split("T")[0];
  const isEventConcluded = Boolean(hackathon?.end_date && hackathon.end_date < todayStr);

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
        if (partnerErr) console.error("[partners] partner_configs load failed:", partnerErr);
        setPartner(null);
        setLoading(false);
        return;
      }

      setPartner(partnerData);

      // 2. Fetch Hackathon details (explicit public fields)
      const { data: hackathonData, error: hackathonErr } = await supabase
        .from("hackathons")
        .select("id, name, description, start_date, end_date, location, mode, prize_pool, currency, website_url, tags, type, college, max_participants")
        .eq("id", partnerData.hackathon_id)
        .maybeSingle();
      if (hackathonErr) console.error("[partners] hackathon load failed:", hackathonErr);

      setHackathon(hackathonData);

      // 3. Fetch Teams registered for this hackathon
      const { data: teamHackathonsData, error: teamsErr } = await supabase
        .from("team_hackathons")
        .select("team_id, teams(*, team_members(id))")
        .eq("hackathon_id", partnerData.hackathon_id);
      if (teamsErr) console.error("[partners] team_hackathons load failed:", teamsErr);

      const parsedTeams = (teamHackathonsData || [])
        .map((item: any) => item.teams)
        .filter(Boolean);
      setTeams(parsedTeams);

      // 4. Fetch Builders who are actively looking for a team for this hackathon
      const { data: regData, error: regErr } = await supabase
        .from("hackathon_registrations")
        .select("user_id, looking_for_team, metadata, profiles(id, full_name, college, avatar_url, skills, is_available)")

        .eq("hackathon_id", partnerData.hackathon_id)
        .eq("looking_for_team", true);
      if (regErr) console.error("[partners] hackathon_registrations load failed:", regErr);

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
      <main data-v2>
        <Container className="py-14">
          <PageLoader label="Loading partner portal" />
        </Container>
      </main>
    );
  }

  if (!partner) {
    return (
      <main data-v2>
        <Container className="py-16 md:py-24">
          <EmptyState
            align="center"
            icon={<Flag />}
            title="Partner portal not found"
            body="The requested partner page does not exist or has been updated."
            action={
              <ButtonLink href="/hackathons" variant="primary" className={TAP} iconRight={<ArrowRight aria-hidden />}>
                Browse All Hackathons
              </ButtonLink>
            }
            className="mx-auto max-w-lg"
          />
        </Container>
      </main>
    );
  }

  // Partner brand colour is data; used only as a small accent swatch.
  const brandColor = partner.brand_color || null;
  const displayPrize = formatPrizeDisplay(partner.override_prize_pool || hackathon?.prize_pool, hackathon?.currency) || "Prize Pool TBA";

  const isAethos = slug === "aethos" || slug === "aethos-day-zero";
  const isMorrow = slug === "morrow" || slug === "mnm";

  const brandLabel =
    slug === "axcentra"
      ? "AXCENTRA"
      : slug === "stampers"
      ? "STAMPERS"
      : slug === "gamnexis"
      ? "GAMNEXIS"
      : slug === "startupx"
      ? "GAMNEXIS — STARTUPX 2026"
      : slug === "aethos" || slug === "aethos-day-zero"
      ? "ÆTHOS — DAY ZERO"
      : slug === "morrow" || slug === "mnm"
      ? "MORROW 1.0"
      : partner.partner_name.replace(/^HackerMate\s*x\s*/i, "").split(" ")[0].toUpperCase();

  const selectedTrackName =
    partner.features?.events?.find((e: any) => e.id === selectedEventTrack)?.name || selectedEventTrack;

  // Tab counts (logic unchanged from V1; moved out of JSX).
  const teamsTabCount = teams.filter((t) => {
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
  }).length;

  const buildersTabCount = builders.filter((b) => {
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
  }).length;

  const lookingButtonLabel = isUserLookingForTeam ? "Looking for team" : "List myself as looking for team";

  return (
    <main data-v2>
      <Container className="py-8 md:py-12">
        {/* ---------- Partner header ---------- */}
        <header className="border-b border-line pb-7">
          {/* Co-brand line */}
          <Eyebrow className="flex-wrap">
            <span className="text-ink-2">HackerMate</span>
            <span aria-hidden className="text-ink-4">×</span>
            <span className="inline-flex items-center gap-1.5 text-ink-2">
              {brandColor && (
                <span aria-hidden className="size-2 rounded-[2px] ring-1 ring-inset ring-line-strong" style={{ backgroundColor: brandColor }} />
              )}
              {slug === "axcentra" && (
                <img
                  src="/partners/axcentra-icon-only-transparent.png"
                  alt="Axcentra Icon"
                  className="inline-block h-3.5 w-auto object-contain"
                />
              )}
              {brandLabel}
            </span>
          </Eyebrow>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            {partner.logo_url ? (
              <img
                src={partner.logo_url}
                alt={`${partner.partner_name} Logo`}
                className="h-12 w-auto max-w-[180px] shrink-0 self-start rounded-md object-contain sm:h-14 sm:self-auto"
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
            ) : isMorrow ? (
              <img
                src="/partners/morrow-icon.png"
                alt="Morrow Logo"
                className="h-12 w-auto shrink-0 self-start rounded-md object-contain sm:h-14 sm:self-auto"
              />
            ) : isAethos ? (
              <img
                src="/partners/aethos-logo.jpg"
                alt="ÆTHOS Logo"
                className="h-12 w-auto shrink-0 self-start rounded-md object-contain sm:h-14 sm:self-auto"
              />
            ) : (
              slug === "axcentra" && (
                <img
                  src="/partners/axcentra-icon-only-transparent.png"
                  alt="Axcentra Logo"
                  className="h-12 w-auto shrink-0 self-start object-contain sm:h-14 sm:self-auto"
                />
              )
            )}

            <div className="min-w-0">
              <h1
                data-v2-heading
                className="font-display text-[28px] font-semibold leading-[1.08] tracking-[-0.025em] text-ink text-balance break-words [font-variation-settings:'wdth'_92] md:text-[40px]"
              >
                {partner.partner_name}
              </h1>

              {(partner.features?.organizer_logo || partner.features?.organizers?.length > 0 || isAethos) && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="caps-label text-ink-3">Presented by</span>
                  <img
                    src={partner.features?.organizer_logo || "/partners/alpha-forge-logo.jpg"}
                    alt="Alpha Forge Logo"
                    className="h-5 w-auto rounded-[3px] object-contain"
                  />
                  {(isAethos || partner.features?.organizers?.some((o: any) => o.name === "TWS")) && (
                    <img src="/partners/tws-logo.jpg" alt="TWS Logo" className="h-5 w-auto rounded-[3px] object-contain" />
                  )}
                </div>
              )}
            </div>
          </div>

          <p className="mt-4 max-w-[68ch] text-[15px] leading-[1.65] text-ink-2">
            {partner.tagline || hackathon?.description?.slice(0, 180) + "..."}
          </p>

          {/* Facts */}
          <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 border-y border-line py-4 sm:grid-cols-3">
            {!isAethos && (
              <div className="flex min-w-0 items-start gap-2.5">
                <Wallet className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
                <div className="min-w-0">
                  <dt className="caps-label text-ink-3">Prize pool</dt>
                  <dd className="mt-1 break-words font-display text-[18px] font-semibold leading-tight text-ink tabular">{displayPrize}</dd>
                </div>
              </div>
            )}
            <div className="flex min-w-0 items-start gap-2.5">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
              <div className="min-w-0">
                <dt className="caps-label text-ink-3">Dates</dt>
                <dd className="mt-1 text-[14px] font-medium text-ink tabular">
                  {hackathon?.start_date ? new Date(hackathon.start_date).toLocaleDateString() : "Date TBA"} —{" "}
                  {hackathon?.end_date ? new Date(hackathon.end_date).toLocaleDateString() : "Date TBA"}
                </dd>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-2.5">
              <Globe className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
              <div className="min-w-0">
                <dt className="caps-label text-ink-3">Mode</dt>
                <dd className="mt-1 text-[14px] font-medium capitalize text-ink">{hackathon?.mode || "Online"} Sprint</dd>
              </div>
            </div>
          </dl>

          {/* Event concluded */}
          {isEventConcluded && (
            <div className="mt-5 flex flex-col gap-3 rounded-lg bg-warn-soft px-4 py-3.5 ring-1 ring-inset ring-warn/30 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Flag className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[13.5px] font-semibold text-ink">Event Concluded</h2>
                    <Tape tone="warn">Archived</Tape>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
                    This partner hackathon concluded on {new Date(hackathon!.end_date!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. Team formation and registrations are closed, but team records remain archived.
                  </p>
                </div>
              </div>
              <ButtonLink href="/hackathons" variant="secondary" className={cn("shrink-0", TAP)} iconRight={<ArrowRight aria-hidden />}>
                Explore Active Hackathons
              </ButtonLink>
            </div>
          )}

          {/* Platform context */}
          <p className="mt-5 flex max-w-[68ch] items-start gap-2.5 text-[13.5px] leading-relaxed text-ink-3">
            <Handshake className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
            <span>
              <span className="font-medium text-ink-2">HackerMate Team Matching Hub:</span> Browse individual builders, join a recruiting team, or list yourself to find teammates for this hackathon.
            </span>
          </p>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {isEventConcluded ? (
              <ClosedNote>Team Formation Closed</ClosedNote>
            ) : (
              <Button
                variant="primary"
                className={TAP}
                icon={<Plus aria-hidden />}
                onClick={() => handleProtectedAction(`/teams/create?hackathon=${partner.hackathon_id}`)}
              >
                Create Team
              </Button>
            )}

            {partner.features?.events && partner.features.events.length > 0 && !isEventConcluded && (
              <Button
                variant="secondary"
                className={TAP}
                icon={<Target aria-hidden />}
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
              >
                Select Track for My Team
              </Button>
            )}

            {!isEventConcluded && (
              <Button
                variant="secondary"
                className={cn(TAP, isUserLookingForTeam && "border-ok/40 text-ok")}
                icon={isUserLookingForTeam ? <CheckCircle2 aria-hidden /> : <UserPlus aria-hidden />}
                aria-pressed={isUserLookingForTeam}
                loading={togglingStatus}
                onClick={() => handleToggleLookingForTeam()}
              >
                {lookingButtonLabel}
              </Button>
            )}

            <Button
              variant="secondary"
              className={TAP}
              icon={<Share2 aria-hidden />}
              onClick={() => setShowPartnerShareModal(true)}
              title="Share this partner teammate matcher to college WhatsApp groups"
            >
              Share to WhatsApp
            </Button>

            {/* Secondary Link: WhatsApp Channel */}
            {(partner.features?.whatsapp_channel || slug === "morrow" || slug === "mnm" || slug === "aethos" || slug === "aethos-day-zero") && (
              <a
                href={slug === "aethos" || slug === "aethos-day-zero" ? "https://tinyurl.com/AETHOS-Group" : partner.features?.whatsapp_channel || "https://whatsapp.com/channel/0029VbDGVGg96H4VGs87xO2Z"}
                target="_blank"
                rel="noreferrer"
                className={buttonClass("ghost", "md", TAP)}
              >
                Official WhatsApp Channel
                <ExternalLink aria-hidden />
              </a>
            )}

            {/* Secondary Link: Official Website */}
            {(() => {
              const rawWebsiteUrl = partner.features?.website_url || (slug === "morrow" || slug === "mnm" ? "https://www.mnmworks.xyz/" : null);
              if (!rawWebsiteUrl) return null;
              const websiteUrl = rawWebsiteUrl.trim();
              // If the website URL points to Unstop, don't show it as "Official Website" because "Official Unstop Registration" already links to Unstop.
              if (websiteUrl.toLowerCase().includes("unstop")) return null;
              // If it's identical to the hackathon's registration website_url, don't duplicate it
              if (hackathon?.website_url && websiteUrl === hackathon.website_url.trim()) return null;

              return (
                <a href={websiteUrl} target="_blank" rel="noreferrer" className={buttonClass("ghost", "md", TAP)}>
                  Official Website
                  <ExternalLink aria-hidden />
                </a>
              );
            })()}

            {/* Primary Link: Official Unstop Registration */}
            {(() => {
              if (!hackathon?.website_url) return null;
              const url = hackathon.website_url.trim();
              if (url.includes("/partners/") || url.includes("hackermate.in/partners")) return null;
              const isUnstop = url.toLowerCase().includes("unstop");
              const label = isUnstop ? "Official Unstop Registration" : "Official Event Website";
              return (
                <a href={url} target="_blank" rel="noreferrer" className={buttonClass("ghost", "md", TAP)}>
                  {label}
                  <ExternalLink aria-hidden />
                </a>
              );
            })()}
          </div>
        </header>

        {/* ---------- Winner banner ---------- */}
        {userWinnerBadge && (
          <div className="mt-6 flex flex-col gap-4 rounded-lg border border-line bg-raised p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-ink">
                <Trophy className="size-[18px]" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[14px] font-semibold text-ink">Verified Winner of {partner.partner_name}</h2>
                  <Tape tone="accent">{userWinnerBadge.rank_title || "Verified Winner"}</Tape>
                </div>
                <p className="mt-1 text-[13px] text-ink-3">Your official badge & co-branded certificate are verified on HackerMate.</p>
              </div>
            </div>
            <Button variant="inverse" className={cn("shrink-0", TAP)} onClick={() => setShowCertModal(true)}>
              View & Download Certificate
            </Button>
          </div>
        )}

        {/* ---------- Event tracks ---------- */}
        {partner.features?.events && partner.features.events.length > 0 && (
          <section aria-labelledby="partner-tracks-title" className="mt-10">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 id="partner-tracks-title" className="flex items-baseline gap-2 text-[17px] font-semibold text-ink">
                  Official Symposium Events & Tracks
                  <span className="font-mono text-[12px] text-ink-3 tabular">{partner.features.events.length}</span>
                </h2>
                <p className="mt-1 text-[13px] text-ink-3">
                  {partner.features.organizer || "LICET CSE"} — Separate teams & builders matching for each event track.
                </p>
              </div>
              {selectedEventTrack !== "all" && (
                <Button variant="ghost" className={cn("self-start sm:self-auto", TAP)} onClick={() => setSelectedEventTrack("all")}>
                  Reset track filter (show all)
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
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
                    className={cn(
                      "flex min-w-0 flex-col rounded-lg border p-4 transition-colors",
                      isSelected ? "border-line-strong bg-selected ring-1 ring-inset ring-accent/40" : "border-line bg-raised hover:border-line-strong",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2">
                        <TrackIcon id={evt.id} className="size-[18px]" />
                      </span>
                      {evt.category && <Tape>{evt.category}</Tape>}
                    </div>

                    <h3 className="mt-3 text-[15px] font-semibold text-ink">{evt.name}</h3>

                    {evt.desc && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{evt.desc}</p>}

                    {evt.challenge && (
                      <div className="mt-3 rounded-md bg-sunken px-3 py-2.5 ring-1 ring-inset ring-line">
                        <span className="flex items-center gap-1.5 caps-label text-ink-3">
                          <Target className="size-3" aria-hidden /> Your challenge
                        </span>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{evt.challenge}</p>
                      </div>
                    )}

                    <div aria-hidden className="min-h-4 flex-1" />

                    <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
                      <button
                        type="button"
                        aria-pressed={isSelected && activeTab === "teams"}
                        onClick={() => {
                          setSelectedEventTrack(evt.id);
                          setActiveTab("teams");
                        }}
                        className={cn(
                          "inline-flex h-10 items-center justify-center gap-1.5 rounded-md text-[12.5px] font-medium ring-1 ring-inset transition-colors sm:h-9",
                          isSelected && activeTab === "teams" ? "bg-ink text-canvas ring-transparent" : "bg-raised text-ink-2 ring-line-strong hover:text-ink",
                        )}
                      >
                        <Shield className="size-3.5" aria-hidden />
                        <span className="font-mono tabular">{trackTeamsCount}</span> Teams
                      </button>
                      <button
                        type="button"
                        aria-pressed={isSelected && activeTab === "builders"}
                        onClick={() => {
                          setSelectedEventTrack(evt.id);
                          setActiveTab("builders");
                        }}
                        className={cn(
                          "inline-flex h-10 items-center justify-center gap-1.5 rounded-md text-[12.5px] font-medium ring-1 ring-inset transition-colors sm:h-9",
                          isSelected && activeTab === "builders" ? "bg-ink text-canvas ring-transparent" : "bg-raised text-ink-2 ring-line-strong hover:text-ink",
                        )}
                      >
                        <Users className="size-3.5" aria-hidden />
                        <span className="font-mono tabular">{trackBuildersCount}</span> Builders
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ---------- Matching hub ---------- */}
        <section aria-labelledby="partner-hub-title" className="mt-10">
          <div className="mb-5 flex flex-col gap-4 border-b border-line pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h2 id="partner-hub-title" className="flex flex-wrap items-center gap-2 text-[17px] font-semibold text-ink">
                Partner Team Matching Hub
                {selectedEventTrack !== "all" && <Tape tone="accent">Track: {selectedTrackName}</Tape>}
              </h2>
              <p className="mt-1 text-[13px] text-ink-3">
                {selectedEventTrack !== "all"
                  ? `Showing teams and builders matching track '${selectedTrackName}'.`
                  : `Find compatible teammates or join recruiting teams specifically for ${partner.partner_name}.`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Show"
                value={activeTab}
                onChange={(v) => setActiveTab(v)}
                options={[
                  { value: "teams", label: "Teams", count: teamsTabCount },
                  { value: "builders", label: "Builders looking", count: buildersTabCount },
                ]}
              />

              {/* Contextual Action Button */}
              {activeTab === "teams" ? (
                isEventConcluded ? (
                  <ClosedNote>Team Formation Closed</ClosedNote>
                ) : (
                  <Button
                    variant="secondary"
                    className={TAP}
                    icon={<Plus aria-hidden />}
                    onClick={() => handleProtectedAction(`/teams/create?hackathon=${partner.hackathon_id}&track=${selectedEventTrack}`)}
                  >
                    Create Team
                  </Button>
                )
              ) : isEventConcluded ? (
                <ClosedNote>Formation Closed</ClosedNote>
              ) : (
                <Button
                  variant="secondary"
                  className={cn(TAP, isUserLookingForTeam && "border-ok/40 text-ok")}
                  icon={isUserLookingForTeam ? <CheckCircle2 aria-hidden /> : <UserPlus aria-hidden />}
                  aria-pressed={isUserLookingForTeam}
                  loading={togglingStatus}
                  onClick={() => handleToggleLookingForTeam()}
                >
                  {lookingButtonLabel}
                </Button>
              )}
            </div>
          </div>

          {/* Teams Feed */}
          {activeTab === "teams" && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                    <EmptyState
                      className="md:col-span-2"
                      align="center"
                      icon={<Users />}
                      title={selectedEventTrack !== "all" ? "No teams on this track yet" : "No recruiting teams yet"}
                      body={
                        selectedEventTrack !== "all"
                          ? `No teams listed for track '${selectedTrackName}' yet.`
                          : "Be the first to create a team and start recruiting for this event."
                      }
                      action={
                        !isEventConcluded && (
                          <Button
                            variant="secondary"
                            className={TAP}
                            icon={<Plus aria-hidden />}
                            onClick={() => handleProtectedAction(`/teams/create?hackathon=${partner.hackathon_id}&track=${selectedEventTrack}`)}
                          >
                            Be the first to create a team
                          </Button>
                        )
                      }
                    />
                  );
                }

                return filteredTeams.map((team) => {
                  const teamTrackId = getTeamTrack(team);
                  const trackObj = partner.features?.events?.find((e: any) => e.id === teamTrackId);
                  const isUserTeamMember = Boolean(
                    currentUserId &&
                      (team.owner_id === currentUserId ||
                        (team.team_members || []).some(
                          (m: any) => m.user_id === currentUserId || m.profiles?.id === currentUserId
                        ))
                  );
                  const viewLabel = isUserTeamMember ? "View Team" : (isEventConcluded || team.is_recruiting === false) ? "View Team" : "View & Apply";

                  return (
                    <article key={team.id} className="flex min-w-0 flex-col rounded-lg border border-line bg-raised p-4 transition-colors hover:border-line-strong">
                      <div className="flex items-start gap-3">
                        <TeamMark name={team.name} tone="hack" />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-[14.5px] font-semibold text-ink">{team.name}</h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <SeatMeter filled={team.team_members?.length || 1} total={team.max_members} />
                            {(trackObj || teamTrackId) && (
                              <Tape icon={<Target aria-hidden />}>Track: {trackObj?.name || teamTrackId}</Tape>
                            )}
                          </div>
                        </div>
                      </div>

                      {getCleanTeamDescription(team.description) && (
                        <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{getCleanTeamDescription(team.description)}</p>
                      )}

                      {team.skills && team.skills.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {team.skills.map((s) => (
                            <Chip key={s}>{s}</Chip>
                          ))}
                        </div>
                      )}

                      <div aria-hidden className="min-h-4 flex-1" />

                      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                        <span className="min-w-0 truncate font-mono text-[12px] text-ink-3">{team.college || "Cross-College"}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          {isUserTeamMember && (
                            <Button variant="ghost" className={TAP} icon={<Share2 aria-hidden />} onClick={() => setShareTeamForModal(team)}>
                              Share
                            </Button>
                          )}
                          <Button
                            variant={viewLabel === "View & Apply" ? "inverse" : "secondary"}
                            className={TAP}
                            iconRight={<ArrowRight aria-hidden />}
                            onClick={() => handleProtectedAction(`/teams/${team.id}`)}
                          >
                            {viewLabel}
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                });
              })()}
            </div>
          )}

          {/* Builders Feed */}
          {activeTab === "builders" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                    <EmptyState
                      className="sm:col-span-2 lg:col-span-3"
                      align="center"
                      icon={<UserPlus />}
                      title={selectedEventTrack !== "all" ? "No builders on this track yet" : "No builders listed yet"}
                      body={
                        selectedEventTrack !== "all"
                          ? `No builders listed for track '${selectedTrackName}' yet.`
                          : "Be the first to list yourself as looking for a team and get discovered."
                      }
                      action={
                        <Button variant="secondary" className={TAP} icon={<UserPlus aria-hidden />} onClick={() => handleToggleLookingForTeam()}>
                          List myself as looking for a team
                        </Button>
                      }
                    />
                  );
                }

                return filteredBuilders.map((builder) => (
                  <article key={builder.id} className="flex min-w-0 flex-col rounded-lg border border-line bg-raised p-4 transition-colors hover:border-line-strong">
                    <div className="flex items-center gap-3">
                      <Avatar name={builder.full_name} src={builder.avatar_url} size="md" />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <h3 className="truncate text-[14px] font-semibold text-ink">{builder.full_name}</h3>
                          <VerifiedBuilderBadge profile={builder} />
                        </div>
                        <p className="truncate text-[12.5px] text-ink-3">{builder.college || "Developer"}</p>
                      </div>
                    </div>

                    {builder.skills && builder.skills.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {builder.skills.slice(0, 3).map((s) => (
                          <Chip key={s}>{s}</Chip>
                        ))}
                      </div>
                    )}

                    <div aria-hidden className="min-h-4 flex-1" />

                    <div className="border-t border-line pt-3">
                      <Button variant="secondary" className={cn("w-full", TAP)} onClick={() => handleProtectedAction(`/profile/${builder.id}`)}>
                        View Profile
                      </Button>
                    </div>
                  </article>
                ));
              })()}
            </div>
          )}
        </section>
      </Container>

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
      <Dialog
        open={showTrackPickerModal && Boolean(partner?.features?.events)}
        onClose={() => setShowTrackPickerModal(false)}
        title="Which event are you looking a team for?"
        description={`Select which specific event track at ${partner.partner_name} you want to join or recruit teammates for:`}
        footer={
          <>
            <Button variant="ghost" className={TAP} onClick={() => setShowTrackPickerModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className={cn("max-w-full", TAP)}
              loading={togglingStatus}
              disabled={togglingStatus || !selectedTrackForModal}
              onClick={() => handleToggleLookingForTeam(selectedTrackForModal)}
              iconRight={<ArrowRight aria-hidden />}
            >
              <span className="min-w-0 truncate">
                List Myself for {partner.features?.events?.find((e: any) => e.id === selectedTrackForModal)?.name || "Event Track"}
              </span>
            </Button>
          </>
        }
      >
        {partner.features?.events && (
          <div role="radiogroup" aria-label="Event track" className="space-y-2">
            {partner.features.events.map((evt: any) => (
              <TrackOption
                key={evt.id}
                id={evt.id}
                name={evt.name}
                meta={evt.category}
                selected={selectedTrackForModal === evt.id}
                onSelect={() => setSelectedTrackForModal(evt.id)}
              />
            ))}
          </div>
        )}
      </Dialog>

      {/* Team Track Selection Modal */}
      <Dialog
        open={showTeamTrackModal && Boolean(partner?.features?.events)}
        onClose={() => setShowTeamTrackModal(false)}
        title="Select Event Track for Your Team"
        description="Register your team for one track."
        footer={
          <>
            <Button variant="ghost" className={TAP} onClick={() => setShowTeamTrackModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className={TAP}
              loading={savingTeamTrack}
              disabled={savingTeamTrack || !selectedTeamIdForTrack || !selectedTrackForTeamModal}
              onClick={handleSaveTeamTrack}
            >
              {savingTeamTrack ? "Saving..." : "Save Track Registration"}
            </Button>
          </>
        }
      >
        {partner.features?.events &&
          (() => {
            const userTeams = teams.filter(
              (t) => t.owner_id === currentUserId || (t.team_members || []).some((m: any) => m.user_id === currentUserId || m.profiles?.id === currentUserId)
            );

            if (userTeams.length === 0) {
              return (
                <EmptyState
                  align="center"
                  compact
                  icon={<Users />}
                  title="No team yet"
                  body="You do not have any teams registered for this hackathon yet."
                  action={
                    <Button
                      variant="secondary"
                      className={TAP}
                      icon={<Plus aria-hidden />}
                      onClick={() => {
                        setShowTeamTrackModal(false);
                        router.push(`/teams/create?hackathon=${partner.hackathon_id}`);
                      }}
                    >
                      Create a Team First
                    </Button>
                  }
                />
              );
            }

            return (
              <div className="space-y-5">
                {userTeams.length > 1 && (
                  <div>
                    <label htmlFor="partner-team-select" className="mb-1.5 block caps-label text-ink-3">
                      Select Team
                    </label>
                    <Select
                      id="partner-team-select"
                      value={selectedTeamIdForTrack}
                      onChange={(e) => {
                        setSelectedTeamIdForTrack(e.target.value);
                        const selTeam = userTeams.find((t) => t.id === e.target.value);
                        if (selTeam) {
                          const trk = getTeamTrack(selTeam);
                          if (trk) setSelectedTrackForTeamModal(trk);
                        }
                      }}
                      className="h-10"
                    >
                      {userTeams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </Select>
                  </div>
                )}

                <div>
                  <p id="partner-team-track-label" className="mb-2 caps-label text-ink-3">Select Event Track / Pillar</p>
                  <div role="radiogroup" aria-labelledby="partner-team-track-label" className="space-y-2">
                    {partner.features.events.map((evt: any) => (
                      <TrackOption
                        key={evt.id}
                        id={evt.id}
                        name={evt.name}
                        meta={evt.desc}
                        selected={selectedTrackForTeamModal === evt.id}
                        onSelect={() => setSelectedTrackForTeamModal(evt.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
      </Dialog>

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
