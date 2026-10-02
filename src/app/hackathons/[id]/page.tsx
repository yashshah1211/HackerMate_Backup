"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Building2,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Ellipsis,
  ExternalLink,
  Handshake,
  Link2,
  Link2Off,
  Plus,
  Search,
  Target,
  Trash2,
  UserX,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";
import { formatPrizeDisplay } from "@/app/hackathons/page";
import VerifiedBuilderBadge from "@/components/VerifiedBuilderBadge";
import StructuredHackathonDescription from "@/components/StructuredHackathonDescription";
import {
  Avatar,
  Button,
  ButtonLink,
  Chip,
  Dialog,
  EmptyState,
  ErrorNotice,
  FieldLabel,
  Input,
  Menu,
  Page,
  PageLoader,
  Section,
  SeatMeter,
  Select,
  Stat,
  Tape,
  TeamMark,
  type MenuItem,
} from "@/components/system";
import { cn } from "@/lib/utils";
import { eventTimeline } from "@/lib/time";
import { getTeamCategoryInfo } from "@/lib/teamCategory";

type RoundInfo = {
  round_number: number;
  name: string;
  type?: string;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
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
  type: string | null;
  organizer_id: string | null;
  college?: string | null;
  max_participants?: number | null;
  min_team_size?: number | null;
  max_team_size?: number | null;
  rounds_count?: number | null;
  rounds_info?: RoundInfo[] | null;
};

type Team = {
  id: string;
  name: string;
  description: string;
  college: string | null;
  skills: string[] | null;
  roles_needed: string[] | null;
  max_members: number;
  is_recruiting?: boolean;
  owner_id?: string;
  team_members?: { id: string }[];
  team_hackathons?: { hackathon_id: string }[];
  hackathon_id?: string | null;
};

type Registration = {
  id: string;
  user_id: string;
  team_id: string | null;
  looking_for_team?: boolean;
  status?: string;
  created_at: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
    college: string | null;
    avatar_url: string | null;
    skills: string[] | null;
    is_available?: boolean;
  };
  teams: {
    id: string;
    name: string;
  } | null;
};


type Resource = {
  id: string;
  hackathon_id: string;
  title: string;
  url: string;
  category: string;
  created_by: string;
  created_at: string;
};

type HackathonStage = {
  id: string;
  hackathon_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  stage_type: string;
  sort_order: number;
  created_at: string;
};

type BuilderWithMatch = {
  id: string;
  full_name: string;
  email: string;
  college: string | null;
  avatar_url: string | null;
  skills: string[];
  is_available?: boolean;
  matchedSkills: string[];
  isRegistered: boolean;
  teamName?: string | null;
};

function formatDateRange(start: string | null, end: string | null) {
  if (!start) return "Date TBA";
  const opts: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    year: "numeric",
  };
  const startStr = new Date(start).toLocaleDateString("en-US", opts);
  if (!end || end === start) return startStr;
  const endStr = new Date(end).toLocaleDateString("en-US", opts);
  return `${startStr} – ${endStr}`;
}

function htmlToPlainText(html: string) {
  return html
    .replace(/&zwj;/gi, "")
    .replace(/&zwnj;/gi, "")
    .replace(/&#8205;/g, "")
    .replace(/&#8204;/g, "")
    .replace(/&#8203;/g, "")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[\s•\-*✦●▪◦▸·]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isTeamFullAndRegistered(team: Team) {
  const currentMembersCount = team.team_members?.length || 0;
  const isFull = currentMembersCount >= team.max_members;
  const isRegisteredForHackathon =
    (team.team_hackathons && team.team_hackathons.length > 0) ||
    !!team.hackathon_id;
  return isFull && isRegisteredForHackathon;
}

function HackathonDetailContent() {
  const { showToast, confirm } = useNotification();
  const params = useParams();
  const router = useRouter();
  const hackathonId = params.id as string;
  const [hackathon, setHackathon] = useState<Hackathon | null>(null);
  const [partnerConfig, setPartnerConfig] = useState<{ slug: string; partner_name: string } | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [stages, setStages] = useState<HackathonStage[]>([]);
  const [loading, setLoading] = useState(true);
  // Real reason the hackathon failed to load (null = loaded, or simply not found).
  const [loadError, setLoadError] = useState<string | null>(null);

  // Hybrid system states
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [userOwnedTeams, setUserOwnedTeams] = useState<{ id: string; name: string; hackathon_id: string | null; owner_id: string; active_hackathon?: { id: string; name: string; end_date: string | null } | null; is_linked_to_this_hackathon?: boolean }[]>([]);

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [buildersList, setBuildersList] = useState<BuilderWithMatch[]>([]);

  // Tab controls
  const [activeTab, setActiveTab] = useState<"teams" | "builders" | "looking_for_teams" | "looking_for_builders" | "resources" | "organizer">("teams");

  // Modals & form states
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showExternalRegisterModal, setShowExternalRegisterModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [organizerSearch, setOrganizerSearch] = useState("");

  // Resources states
  const [resources, setResources] = useState<Resource[]>([]);
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceCategory, setResourceCategory] = useState<"boilerplates" | "apis" | "docs" | "other">("other");
  const [savingResource, setSavingResource] = useState(false);

  // Description expansion state
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);

  const formatTimezoneIndependentDate = (dateString: string | null, isEnd: boolean = false, format: "date-only" | "timed" = "timed") => {
    if (!dateString) return "";
    
    const parts = dateString.split("-");
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    
    const date = new Date(Date.UTC(y, m - 1, d));
    
    if (isEnd) {
      if (format === "date-only") {
        date.setUTCDate(date.getUTCDate() + 1);
      } else {
        date.setUTCHours(18, 0, 0, 0);
      }
    } else {
      if (format === "timed") {
        date.setUTCHours(9, 0, 0, 0);
      }
    }
    
    const pad = (n: number) => n.toString().padStart(2, "0");
    
    if (format === "date-only") {
      return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
    }
    
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  };

  const getCalendarUrls = () => {
    if (!hackathon || !hackathon.start_date || !hackathon.end_date) return { google: "", outlook: "" };
    
    const title = encodeURIComponent(hackathon.name);
    const desc = encodeURIComponent(htmlToPlainText(hackathon.description || "").slice(0, 500) + "...");
    const loc = encodeURIComponent(hackathon.location || "TBA");
    
    const startStr = formatTimezoneIndependentDate(hackathon.start_date, false, "timed");
    const endStr = formatTimezoneIndependentDate(hackathon.end_date, true, "timed");
    
    const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${desc}&location=${loc}`;
    const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${title}&startdt=${hackathon.start_date}T09:00:00Z&enddt=${hackathon.end_date}T18:00:00Z&body=${desc}&location=${loc}`;
    
    return { google, outlook };
  };

  const downloadICSFile = () => {
    if (!hackathon || !hackathon.start_date || !hackathon.end_date) return;
    
    const startStr = formatTimezoneIndependentDate(hackathon.start_date, false, "timed");
    const endStr = formatTimezoneIndependentDate(hackathon.end_date, true, "timed");
    
    const pad = (n: number) => n.toString().padStart(2, "0");
    const now = new Date();
    const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    
    const summary = hackathon.name.replace(/[,;]/g, "\\$&");
    const desc = htmlToPlainText(hackathon.description || "").replace(/[,;]/g, "\\$&").slice(0, 300) + "...";
    const loc = (hackathon.location || "TBA").replace(/[,;]/g, "\\$&");
    const uid = `${hackathon.id}@hackermate.com`;

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//HackerMate//Hackathon Event//EN",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      `LOCATION:${loc}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute("download", `${hackathon.name.toLowerCase().replace(/\s+/g, "_")}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  async function loadData() {
    try {
      const { data: hackathonData, error: hackathonError } = await supabase
        .from("hackathons")
        .select("*")
        .eq("id", hackathonId)
        .single();

      if (hackathonError) {
        console.error(hackathonError);
        // PGRST116 = no row for this id → "not found"; anything else is a real load failure.
        setLoadError(hackathonError.code === "PGRST116" ? null : hackathonError.message);
        setLoading(false);
        return;
      }

      setLoadError(null);
      setHackathon(hackathonData);

      // Fetch partner config if exists for this hackathon
      const { data: partnerData, error: partnerError } = await supabase
        .from("partner_configs")
        .select("slug, partner_name")
        .eq("hackathon_id", hackathonId)
        .maybeSingle();

      if (partnerError) console.error("Failed to load partner config:", partnerError);

      if (partnerData) {
        setPartnerConfig(partnerData);
      } else {
        setPartnerConfig(null);
      }

      // Fetch hackathon stages for schedule timeline
      const { data: stageData, error: stageError } = await supabase
        .from("hackathon_stages")
        .select("*")
        .eq("hackathon_id", hackathonId)
        .order("sort_order", { ascending: true })
        .order("start_time", { ascending: true });

      if (stageError) console.error("Failed to load hackathon stages:", stageError);
      setStages(stageData || []);

      let teamsData: any[] = [];

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setCurrentUserId(user.id);
        if (hackathonData.type === "native" && hackathonData.organizer_id === user.id) {
          setIsOrganizer(true);
        }

        // Check if user has saved this hackathon
        const { data: saveCheck } = await supabase
          .from("saved_hackathons")
          .select("id")
          .eq("hackathon_id", hackathonId)
          .eq("user_id", user.id)
          .maybeSingle();

        setIsSaved(!!saveCheck);

        // Check if user is registered for native hackathon
        const { data: regCheck } = await supabase
          .from("hackathon_registrations")
          .select("id")
          .eq("hackathon_id", hackathonId)
          .eq("user_id", user.id)
          .maybeSingle();

        setIsRegistered(!!regCheck);

        // Load user-owned teams to support linking/registering
        const { data: ownedTeams } = await supabase
          .from("teams")
          .select("id, name, owner_id")
          .eq("owner_id", user.id);

        const teamIds = (ownedTeams || []).map((t) => t.id);
        const linkedHackathonsByTeam: Record<string, string[]> = {};

        if (teamIds.length > 0) {
          const { data: allRelations } = await supabase
            .from("team_hackathons")
            .select("team_id, hackathon_id")
            .in("team_id", teamIds);

          if (allRelations) {
            allRelations.forEach((rel: any) => {
              if (!linkedHackathonsByTeam[rel.team_id]) {
                linkedHackathonsByTeam[rel.team_id] = [];
              }
              if (rel.hackathon_id) {
                linkedHackathonsByTeam[rel.team_id].push(rel.hackathon_id);
              }
            });
          }
        }

        const enrichedOwnedTeams = (ownedTeams || []).map((t) => {
          const linkedIds = linkedHackathonsByTeam[t.id] || [];
          const isLinkedToThisHackathon = linkedIds.includes(hackathonId);
          return {
            ...t,
            is_linked_to_this_hackathon: isLinkedToThisHackathon,
            hackathon_id: isLinkedToThisHackathon ? hackathonId : null,
          };
        });

        setUserOwnedTeams(enrichedOwnedTeams);


        const { data: currentUserProfile } = await supabase
          .from("profiles")
          .select("skills")
          .eq("id", user.id)
          .single();
        setUserSkills(currentUserProfile?.skills || []);
      }

      // Load teams participating in this hackathon
      const { data: teamRelations, error: teamsError } = await supabase
        .from("team_hackathons")
        .select(`
          teams (
            id,
            name,
            description,
            college,
            skills,
            roles_needed,
            max_members,
            is_recruiting,
            owner_id,
            created_at,
            team_members (
              id
            ),
            team_hackathons (
              hackathon_id
            )
          )
        `)
        .eq("hackathon_id", hackathonId);

      if (teamsError) {
        console.error(teamsError);
      } else {
        teamsData = (teamRelations || [])
          .map((r: any) => r.teams)
          .filter(Boolean)
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setTeams(teamsData);
      }

      const { data: regData, error: regError } = await supabase
        .from("hackathon_registrations")
        .select(`
          id,
          user_id,
          team_id,
          looking_for_team,
          status,
          created_at,
          profiles (
            id,
            full_name,
            college,
            avatar_url,
            skills,
            is_available
          ),
          teams (
            id,
            name
          )
        `)
        .eq("hackathon_id", hackathonId)
        .order("created_at", { ascending: false });

      if (regError) console.error("Failed to load hackathon registrations:", regError);
      setRegistrations((regData as unknown as Registration[]) || []);

      // Load resources
      const { data: resourcesData, error: resourcesError } = await supabase
        .from("hackathon_resources")
        .select("*")
        .eq("hackathon_id", hackathonId)
        .order("created_at", { ascending: false });

      if (resourcesError) console.error("Failed to load hackathon resources:", resourcesError);
      setResources(resourcesData || []);

      // Load all builders of all registered teams for this hackathon
      const registeredTeamIds = (teamsData || []).map((t: any) => t.id);
      const computedBuilders: BuilderWithMatch[] = [];

      if (registeredTeamIds.length > 0) {
        const { data: teamMembersData, error: teamMembersError } = await supabase
          .from("team_members")
          .select(`
            id,
            team_id,
            user_id,
            project_role,
            profiles (
              id,
              full_name,
              college,
              avatar_url,
              skills,
              is_available
            )

          `)
          .in("team_id", registeredTeamIds);

        if (teamMembersError) console.error("Failed to load team members for hackathon:", teamMembersError);
        const uniqueBuildersMap = new Map();
        if (teamMembersData) {
          teamMembersData.forEach((tm: any) => {
            const profile = Array.isArray(tm.profiles) ? tm.profiles[0] : tm.profiles;
            if (profile && !uniqueBuildersMap.has(profile.id)) {
              const reg = (regData as unknown as Registration[])?.find((r) => r.user_id === profile.id);
              const isRegistered = !!reg;
              const teamName = (teamsData || []).find((t: any) => t.id === tm.team_id)?.name || "";

              uniqueBuildersMap.set(profile.id, {
                id: profile.id,
                full_name: profile.full_name,
                email: profile.email,
                college: profile.college,
                avatar_url: profile.avatar_url,
                skills: profile.skills || [],
                is_available: profile.is_available,
                matchedSkills: [], // Loaded team builders list is displayed directly
                isRegistered,
                teamName,
              });
            }
          });
        }
        computedBuilders.push(...Array.from(uniqueBuildersMap.values()));
      }

      setBuildersList(computedBuilders);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  const handleToggleLookingForTeam = async () => {
    if (!currentUserId || !hackathonId) return;

    if (!isRegistered) {
      showToast("Please register for the hackathon first before listing your profile.", "error");
      return;
    }

    const currentStatus = registrations.find(r => r.user_id === currentUserId)?.looking_for_team || false;
    const newStatus = !currentStatus;

    try {
      const { data, error } = await supabase
        .from("hackathon_registrations")
        .update({ looking_for_team: newStatus })
        .eq("hackathon_id", hackathonId)
        .eq("user_id", currentUserId)
        .select();

      if (error) {
        showToast(error.message, "error");
      } else if (!data || data.length === 0) {
        showToast("Failed to update status. Registration not found.", "error");
      } else {
        showToast(newStatus ? "Profile listed under 'Looking for Teams'!" : "Stopped listing profile.", "success");
        loadData(); // Refresh list
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to update status.", "error");
    }
  };

  const handleToggleTeamRecruiting = async (teamId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("teams")
        .update({ is_recruiting: !currentStatus })
        .eq("id", teamId);

      if (error) {
        showToast(error.message, "error");
      } else {
        showToast(!currentStatus ? "Team listed under 'Looking for Builders'!" : "Team stopped recruiting.", "success");
        loadData();
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to update recruiting status.", "error");
    }
  };

  useEffect(() => {
    if (hackathonId) {
      Promise.resolve().then(() => {
        loadData();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hackathonId]);

  // Handle Native Registration Flow
  async function handleRegisterNatively() {
    if (!currentUserId || !hackathon) return;
    
    if (hackathon.end_date && new Date() > new Date(hackathon.end_date)) {
      showToast("Registration is closed. This hackathon has already ended.", "error");
      return;
    }

    setInviteLoading(true);
    try {
      if (selectedTeam) {
        const teamObj = userOwnedTeams.find((t) => t.id === selectedTeam);
        if (teamObj?.active_hackathon) {
          showToast(`This team is already registered for an active hackathon: ${teamObj.active_hackathon.name}.`, "error");
          setInviteLoading(false);
          return;
        }
      }

      // 1. Check capacity limit & determine status
      let regStatus = "confirmed";
      if (hackathon.max_participants !== null && hackathon.max_participants !== undefined) {
        const { count } = await supabase
          .from("hackathon_registrations")
          .select("id", { count: "exact", head: true })
          .eq("hackathon_id", hackathon.id)
          .eq("status", "confirmed");

        if (count !== null && count >= hackathon.max_participants) {
          regStatus = "waitlisted";
        }
      }

      // 2. Insert native registration row
      const { error: regError } = await supabase
        .from("hackathon_registrations")
        .insert({
          hackathon_id: hackathon.id,
          user_id: currentUserId,
          team_id: selectedTeam || null,
          status: regStatus,
        });

      if (regError) {
        showToast(regError.message, "error");
        setInviteLoading(false);
        return;
      }

      // 3. If registering with a team, update the team's hackathon_id association
      if (selectedTeam) {
        await supabase
          .from("teams")
          .update({ hackathon_id: hackathon.id })
          .eq("id", selectedTeam);
      }

      if (regStatus === "waitlisted") {
        showToast("Capacity limit reached! You've been added to the waitlist.", "info");
      } else {
        showToast("Successfully registered for the hackathon!", "success");
      }
      setShowRegisterModal(false);
      setSelectedTeam("");
      loadData();
    } catch (err) {
      console.error(err);
      showToast("Failed to register.", "error");
    }
    setInviteLoading(false);
  }

  // Handle External Registration Flow
  function handleRegisterExternally() {
    if (!hackathon || !hackathon.website_url) return;
    window.open(hackathon.website_url, "_blank", "noopener,noreferrer");
    setShowExternalRegisterModal(true);
  }

  async function handleRegisterExternallyConfirm() {
    if (!currentUserId || !hackathon) return;

    if (hackathon.end_date && new Date() > new Date(hackathon.end_date)) {
      showToast("Registration is closed. This hackathon has already ended.", "error");
      return;
    }

    setInviteLoading(true);
    try {
      if (selectedTeam) {
        const teamObj = userOwnedTeams.find((t) => t.id === selectedTeam);
        if (teamObj?.active_hackathon) {
          showToast(`This team is already registered for an active hackathon: ${teamObj.active_hackathon.name}.`, "error");
          setInviteLoading(false);
          return;
        }
      }

      // 1. Check capacity limit & determine status
      let regStatus = "confirmed";
      if (hackathon.max_participants !== null && hackathon.max_participants !== undefined) {
        const { count } = await supabase
          .from("hackathon_registrations")
          .select("id", { count: "exact", head: true })
          .eq("hackathon_id", hackathon.id)
          .eq("status", "confirmed");

        if (count !== null && count >= hackathon.max_participants) {
          regStatus = "waitlisted";
        }
      }

      // 2. Insert registration row
      const { error: regError } = await supabase
        .from("hackathon_registrations")
        .insert({
          hackathon_id: hackathon.id,
          user_id: currentUserId,
          team_id: selectedTeam || null,
          status: regStatus,
        });

      if (regError) {
        showToast(regError.message, "error");
        setInviteLoading(false);
        return;
      }

      // 3. If registering with a team, update the team's hackathon_id association
      if (selectedTeam) {
        await supabase
          .from("teams")
          .update({ hackathon_id: hackathon.id })
          .eq("id", selectedTeam);
      }

      if (regStatus === "waitlisted") {
        showToast("Capacity limit reached! Added to waitlist on HackerMate.", "info");
      } else {
        showToast("Successfully registered and confirmed on HackerMate!", "success");
      }
      setShowExternalRegisterModal(false);
      setSelectedTeam("");
      loadData();
    } catch (err) {
      console.error(err);
      showToast("Failed to confirm registration.", "error");
    }
    setInviteLoading(false);
  }

  // Handle External Claim Team Flow
  async function handleClaimTeam() {
    if (!selectedTeam || !hackathon) return;
    setInviteLoading(true);

    try {
      const teamObj = userOwnedTeams.find((t) => t.id === selectedTeam);
      if (teamObj?.is_linked_to_this_hackathon) {
        showToast(`This team is already registered for ${hackathon.name}.`, "error");
        setInviteLoading(false);
        return;
      }


      const { error } = await supabase
        .from("team_hackathons")
        .insert({ team_id: selectedTeam, hackathon_id: hackathon.id });

      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Your team has been linked to this hackathon!", "success");
        setShowClaimModal(false);
        setSelectedTeam("");
        loadData();
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to claim team.", "error");
    }
    setInviteLoading(false);
  }

  async function handleUnlinkTeam() {
    const linkedTeam = userOwnedTeams.find((t) => t.hackathon_id === hackathon?.id);
    if (!linkedTeam || !hackathon) return;

    confirm({
      title: "Remove Team from Listing",
      message: `Are you sure you want to remove your team "${linkedTeam.name}" from the listing of "${hackathon.name}"?`,
      confirmText: "Remove Listing",
      cancelText: "Cancel",
      onConfirm: async () => {
        setInviteLoading(true);
        try {
          const { error } = await supabase
            .from("team_hackathons")
            .delete()
            .eq("team_id", linkedTeam.id)
            .eq("hackathon_id", hackathon.id);

          if (error) {
            showToast(error.message, "error");
          } else {
            showToast("Your team has been unlinked from this hackathon.", "success");
            loadData();
          }
        } catch (err) {
          console.error(err);
          showToast("Failed to unlink team.", "error");
        }
        setInviteLoading(false);
      }
    });
  }

  async function performCancel() {
    try {
      // Find team_id first to unlink if needed
      const { data: reg } = await supabase
        .from("hackathon_registrations")
        .select("team_id")
        .eq("hackathon_id", hackathon!.id)
        .eq("user_id", currentUserId!)
        .single();

      if (reg?.team_id) {
        await supabase
          .from("team_hackathons")
          .delete()
          .eq("team_id", reg.team_id)
          .eq("hackathon_id", hackathon!.id);
      }

      await supabase
        .from("hackathon_registrations")
        .delete()
        .eq("hackathon_id", hackathon!.id)
        .eq("user_id", currentUserId!);

      showToast("Registration cancelled.", "info");
      loadData();
    } catch (err) {
      console.error(err);
      showToast("Failed to cancel registration.", "error");
    }
  }

  // Cancel Native Registration
  async function handleCancelRegistration() {
    if (!currentUserId || !hackathon) return;
    confirm({
      title: "Cancel Registration",
      message: "Are you sure you want to cancel your registration?",
      confirmText: "Cancel Registration",
      cancelText: "Keep Registered",
      onConfirm: () => {
        performCancel();
      }
    });
  }

  async function handleToggleSave() {
    if (!currentUserId || !hackathon) {
      showToast("Please sign in to save this hackathon.", "warning");
      return;
    }

    try {
      if (isSaved) {
        const { error } = await supabase
          .from("saved_hackathons")
          .delete()
          .eq("user_id", currentUserId)
          .eq("hackathon_id", hackathon.id);

        if (error) {
          console.error("Error removing saved hackathon:", error);
          showToast("Failed to unsave hackathon.", "error");
        } else {
          setIsSaved(false);
          showToast("Hackathon unsaved", "info");
        }
      } else {
        const { error } = await supabase
          .from("saved_hackathons")
          .insert({
            user_id: currentUserId,
            hackathon_id: hackathon.id,
          });

        if (error) {
          console.error("Error saving hackathon:", error);
          showToast("Failed to save hackathon.", "error");
        } else {
          setIsSaved(true);
          showToast("Hackathon saved successfully!", "success");
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = resourceTitle.trim();
    const url = resourceUrl.trim();
    if (!title || !url) {
      showToast("Please fill in all fields", "warning");
      return;
    }

    setSavingResource(true);
    try {
      const { error } = await supabase
        .from("hackathon_resources")
        .insert({
          hackathon_id: hackathonId,
          title,
          url,
          category: resourceCategory,
          created_by: currentUserId,
        });

      if (error) {
        showToast(error.message, "error");
      } else {
        setResourceTitle("");
        setResourceUrl("");
        setShowAddResourceModal(false);
        showToast("Resource link added successfully!", "success");
        // Reload resources
        const { data: resourcesData } = await supabase
          .from("hackathon_resources")
          .select("*")
          .eq("hackathon_id", hackathonId)
          .order("created_at", { ascending: false });
        setResources(resourcesData || []);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to add resource.", "error");
    }
    setSavingResource(false);
  };

  const handleDeleteResource = async (resourceId: string) => {
    confirm({
      title: "Delete Resource",
      message: "Are you sure you want to remove this resource link?",
      confirmText: "Remove",
      cancelText: "Cancel",
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from("hackathon_resources")
            .delete()
            .eq("id", resourceId);

          if (error) {
            showToast(error.message, "error");
          } else {
            showToast("Resource removed.", "info");
            setResources(resources.filter((r) => r.id !== resourceId));
          }
        } catch (err) {
          console.error(err);
          showToast("Failed to remove resource.", "error");
        }
      }
    });
  };

  const getAutoResources = (tags: string[] | null) => {
    const autoList: { title: string; url: string; category: string }[] = [];
    const tagsLower = (tags || []).map((t) => t.toLowerCase());

    autoList.push({
      title: "GitHub Hackathon Starter Template",
      url: "https://github.com/sahat/hackathon-starter",
      category: "boilerplates",
    });
    autoList.push({
      title: "Vercel Deployment Quickstart Guide",
      url: "https://vercel.com/docs",
      category: "docs",
    });

    if (tagsLower.includes("ai") || tagsLower.includes("artificial intelligence") || tagsLower.some(t => t.includes("ai")) || tagsLower.some(t => t.includes("ml"))) {
      autoList.push({
        title: "Google Gemini API Reference Docs",
        url: "https://ai.google.dev/gemini-api/docs",
        category: "apis",
      });
      autoList.push({
        title: "Hugging Face Models Directory",
        url: "https://huggingface.co/models",
        category: "apis",
      });
      autoList.push({
        title: "LangChain Orchestration Documentation",
        url: "https://python.langchain.com/docs/get_started/introduction",
        category: "docs",
      });
    }

    if (tagsLower.includes("web3") || tagsLower.includes("blockchain") || tagsLower.includes("crypto") || tagsLower.some(t => t.includes("solana")) || tagsLower.some(t => t.includes("eth"))) {
      autoList.push({
        title: "Ethereum Developer Portal",
        url: "https://ethereum.org/en/developers/",
        category: "docs",
      });
      autoList.push({
        title: "Solana Cookbook & Web3 API reference",
        url: "https://solanacookbook.com/",
        category: "docs",
      });
      autoList.push({
        title: "Thirdweb Web3 React Starter Boilerplates",
        url: "https://thirdweb.com/templates",
        category: "boilerplates",
      });
    }

    if (tagsLower.includes("design") || tagsLower.includes("ui") || tagsLower.includes("ux") || tagsLower.some(t => t.includes("figma"))) {
      autoList.push({
        title: "Figma Community UI Resource Kits",
        url: "https://www.figma.com/community",
        category: "boilerplates",
      });
      autoList.push({
        title: "Tailwind UI Components Hub",
        url: "https://tailwindui.com/components",
        category: "boilerplates",
      });
    }

    autoList.push({
      title: "Supabase Backend-as-a-Service Guide",
      url: "https://supabase.com/docs",
      category: "docs",
    });

    return autoList;
  };

  const handleDeleteHackathon = () => {
    confirm({
      title: "Delete Hackathon",
      message: `Are you sure you want to delete the hackathon "${hackathon?.name}"? This action is permanent and cannot be undone.`,
      confirmText: "Delete Permanently",
      cancelText: "Cancel",
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from("hackathons")
            .delete()
            .eq("id", hackathonId);

          if (error) {
            showToast(error.message, "error");
          } else {
            showToast("Hackathon deleted successfully.", "success");
            router.push("/hackathons");
          }
        } catch (err) {
          console.error(err);
          showToast("Failed to delete hackathon.", "error");
        }
      }
    });
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Link copied", "success");
    } catch (err) {
      console.error("Failed to copy link:", err);
      showToast("Couldn't copy the link.", "error");
    }
  };

  if (loading) {
    return (
      <Page>
        <PageLoader label="Loading hackathon" />
      </Page>
    );
  }

  if (!hackathon) {
    return (
      <Page width="narrow">
        <div className="pt-8">
          {loadError ? (
            <ErrorNotice
              title="Couldn't load this hackathon"
              detail={loadError}
              onRetry={() => {
                setLoading(true);
                loadData();
              }}
            />
          ) : (
            <EmptyState
              icon={<Search />}
              title="Hackathon not found"
              body="It may have been removed, or the link is wrong."
              action={
                <ButtonLink href="/hackathons" variant="secondary" size="sm" icon={<ArrowLeft />}>
                  Back to hackathons
                </ButtonLink>
              }
            />
          )}
        </div>
      </Page>
    );
  }

  // ── Presentational derivations ────────────────────────────────────────
  const timeline = eventTimeline(hackathon.start_date, hackathon.end_date);
  const stateLabel =
    timeline.state === "live" ? "Live" : timeline.state === "upcoming" ? "Upcoming" : timeline.state === "ended" ? "Ended" : "Dates TBA";
  const stateTone = timeline.state === "live" ? "ok" : timeline.state === "upcoming" ? "accent" : "neutral";
  const eventTone = "hack";

  const showLocation = !(
    hackathon.mode?.toLowerCase() === "online" &&
    (!hackathon.location ||
      hackathon.location.toLowerCase().includes("venue in india") ||
      hackathon.location.toLowerCase().includes("online"))
  );
  const collegeLower = hackathon.college?.toLowerCase() || "";
  const isCommunityOrg =
    collegeLower.includes("alpha forge") || collegeLower.includes("together we solve") || collegeLower.includes("tws");
  const organizerLabel = isCommunityOrg ? "Organizers" : "College";
  const organizerName = hackathon.college ? (isCommunityOrg ? "Alpha Forge & TWS (Together We Solve)" : hackathon.college) : null;
  const teamSizeLabel =
    hackathon.min_team_size === 1 && hackathon.max_team_size === 1
      ? "Solo"
      : hackathon.min_team_size && hackathon.max_team_size
        ? `${hackathon.min_team_size}–${hackathon.max_team_size} members`
        : hackathon.max_team_size
          ? `Up to ${hackathon.max_team_size} members`
          : hackathon.min_team_size
            ? `At least ${hackathon.min_team_size} members`
            : "Flexible";

  const linkedTeam = userOwnedTeams.find((t) => t.hackathon_id === hackathon?.id);
  const myRegistration = registrations.find((r) => r.user_id === currentUserId);
  const lookingForTeamRegs = registrations.filter((r) => r.looking_for_team === true);
  const recruitingTeams = teams.filter((t) => t.is_recruiting === true && !isTeamFullAndRegistered(t));
  const hasDates = !!hackathon.start_date && !!hackathon.end_date;
  const isNative = hackathon.type === "native";
  // Same visibility as V1: native → modal; external → only when a website URL exists.
  const canRegister = !isRegistered && (isNative || !!hackathon.website_url);
  const createTeamHref = `/teams/create?hackathon=${hackathon.id}`;

  const primaryAction = canRegister ? (
    <Button
      variant="primary"
      icon={isNative ? <CheckCircle2 /> : <ExternalLink />}
      onClick={isNative ? () => setShowRegisterModal(true) : handleRegisterExternally}
    >
      {isNative ? "Register" : "Register on event site"}
    </Button>
  ) : (
    <ButtonLink href={createTeamHref} variant="primary" icon={<Plus />}>
      Create a team
    </ButtonLink>
  );

  const menuItems: MenuItem[] = [];
  if (linkedTeam) {
    menuItems.push({ label: "Remove team from listing", icon: <Link2Off />, tone: "danger", disabled: inviteLoading, onSelect: handleUnlinkTeam });
  } else if (userOwnedTeams.length > 0) {
    menuItems.push({ label: "Link a team you own", icon: <Link2 />, onSelect: () => setShowClaimModal(true) });
  }
  menuItems.push({ label: "Copy link", icon: <Link2 />, onSelect: handleCopyLink });
  if (isRegistered) {
    menuItems.push({ type: "separator" }, { label: "Cancel registration", icon: <UserX />, tone: "danger", onSelect: handleCancelRegistration });
  }
  if (isOrganizer) {
    menuItems.push(
      { type: "label", label: "Organizer" },
      { label: "Open organizer portal", icon: <Building2 />, onSelect: () => router.push(`/hackathons/${hackathon.id}/organizer`) },
      { label: "Delete hackathon", icon: <Trash2 />, tone: "danger", onSelect: handleDeleteHackathon },
    );
  }
  // Mobile bar only shows the primary action + save, so surface "Create a team" in its menu.
  const mobileMenuItems: MenuItem[] = canRegister
    ? [{ label: "Create a team", icon: <Plus />, onSelect: () => router.push(createTeamHref) }, ...menuItems]
    : menuItems;

  const metaParts = [organizerName, hackathon.mode, showLocation ? hackathon.location || "Location TBA" : null].filter(Boolean) as string[];

  const renderSkills = (skills: string[] | null | undefined, max: number, isMatched: (s: string) => boolean) =>
    skills?.length ? (
      <div className="mt-2 flex flex-wrap gap-1">
        {skills.slice(0, max).map((skill) => (
          <Chip key={skill} active={isMatched(skill)}>
            {skill}
          </Chip>
        ))}
        {skills.length > max && <span className="self-center font-mono text-[12px] text-ink-3">+{skills.length - max}</span>}
      </div>
    ) : (
      <p className="mt-1.5 text-[12px] text-ink-3">No skills listed</p>
    );

  const userSkillsLower = userSkills.map((sk) => sk.toLowerCase());

  return (
    <Page className="pb-32 md:pb-16">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center pt-5 text-[12.5px] text-ink-3 md:pt-6">
        <Link href="/hackathons" className="inline-flex shrink-0 items-center gap-1.5 hover:text-ink">
          <ArrowLeft className="size-3.5 md:hidden" aria-hidden />
          Hackathons
        </Link>
        <span className="mx-1.5 hidden text-ink-4 md:inline" aria-hidden>
          /
        </span>
        <span className="hidden min-w-0 truncate text-ink-2 md:inline">{hackathon.name}</span>
      </nav>

      {/* Official partner event */}
      {partnerConfig && (
        <Notice
          icon={<Handshake />}
          title={
            <>
              Official partner event
              <Tape tone="info">{partnerConfig.partner_name}</Tape>
            </>
          }
          body="This event has a dedicated partner page with its own team matching."
          action={
            <ButtonLink href={`/partners/${partnerConfig.slug}`} variant="secondary" size="sm" iconRight={<ArrowUpRight />}>
              Partner page
            </ButtonLink>
          }
        />
      )}

      {/* Organizer shortcut (event host only) */}
      {isOrganizer && (
        <Notice
          icon={<Building2 />}
          title={
            <>
              You&apos;re hosting this event
              <Tape tone="solid">Host</Tape>
            </>
          }
          body="Manage the participant roster, export CSV, track capacity and post resource links."
          action={
            <ButtonLink href={`/hackathons/${hackathon.id}/organizer`} variant="secondary" size="sm" iconRight={<ArrowUpRight />}>
              Organizer portal
            </ButtonLink>
          }
        />
      )}

      {/* ── Identity ─────────────────────────────────────────────── */}
      <header className="pt-5 md:pt-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Tape tone={stateTone} dot={timeline.state === "live"}>
                {stateLabel}
              </Tape>
              <Tape tone={eventTone}>Hackathon</Tape>
              <Tape>{isNative ? "Hosted on HackerMate" : "External event"}</Tape>
              {isRegistered && (
                <Tape tone="ok" icon={<CheckCircle2 />}>
                  Registered
                </Tape>
              )}
            </div>
            <h1
              data-v2-heading
              className="mt-3 break-words font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink [font-variation-settings:'wdth'_92] [overflow-wrap:anywhere] md:text-[32px]"
            >
              {hackathon.name}
            </h1>
            {metaParts.length > 0 && (
              <p className="mt-2 break-words text-[13.5px] text-ink-3">
                {metaParts.map((part, i) => (
                  <span key={i} className={part === hackathon.mode ? "capitalize" : undefined}>
                    {i > 0 && <span className="mx-1.5 text-ink-4">·</span>}
                    {part}
                  </span>
                ))}
              </p>
            )}
            <p className="mt-1 font-mono text-[12.5px] text-ink-3 tabular">
              {formatDateRange(hackathon.start_date, hackathon.end_date)}
              {timeline.state !== "unknown" && (
                <>
                  <span className="mx-1.5 text-ink-4">·</span>
                  <span className={timeline.urgent ? "text-warn" : undefined}>{timeline.label}</span>
                </>
              )}
            </p>
          </div>
          <div className="hidden shrink-0 flex-wrap items-center justify-end gap-2 md:flex">
            {primaryAction}
            {canRegister && (
              <ButtonLink href={createTeamHref} variant="secondary" icon={<Plus />}>
                Create a team
              </ButtonLink>
            )}
            <Button variant="secondary" icon={isSaved ? <BookmarkCheck /> : <Bookmark />} aria-pressed={isSaved} onClick={handleToggleSave}>
              {isSaved ? "Saved" : "Save"}
            </Button>
            <OverflowMenu items={menuItems} />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-4">
          <Stat label="Teams" value={teams.length} />
          <Stat label="Registered" value={registrations.length} />
          <Stat label="Looking for team" value={lookingForTeamRegs.length} />
          <Stat label="Recruiting" value={recruitingTeams.length} />
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
        {/* ── Main column ───────────────────────────────────────── */}
        <div className="min-w-0 space-y-10">
          <Section title="About">
            <StructuredHackathonDescription description={hackathon.description} />
          </Section>

          <Section title="Tags" count={hackathon.tags?.length || 0}>
            {hackathon.tags?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {hackathon.tags.map((tag) => (
                  <Chip key={tag}>{tag}</Chip>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-ink-3">No tags listed.</p>
            )}
          </Section>

          {/* Rounds */}
          {hackathon.rounds_info && Array.isArray(hackathon.rounds_info) && hackathon.rounds_info.length > 0 && (
            <Section title="Rounds" count={hackathon.rounds_info.length}>
              <ol>
                {hackathon.rounds_info.map((rd: RoundInfo, idx: number, all: RoundInfo[]) => {
                  const state = windowState(rd.start_date, rd.end_date);
                  return (
                    <TimelineItem key={idx} state={state} last={idx === all.length - 1}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[12.5px] text-ink-3 tabular">R{rd.round_number || idx + 1}</span>
                        <h3 className="min-w-0 break-words text-[14px] font-semibold text-ink">{rd.name || `Round ${idx + 1}`}</h3>
                        {rd.type && <Tape>{rd.type}</Tape>}
                        {state === "live" && (
                          <Tape tone="ok" dot>
                            Live
                          </Tape>
                        )}
                      </div>
                      {(rd.start_date || rd.end_date) && (
                        <p className="mt-1 font-mono text-[12px] text-ink-3 tabular">
                          {rd.start_date && <span>Starts {shortDate(rd.start_date)}</span>}
                          {rd.start_date && rd.end_date && <span className="mx-1.5 text-ink-4">→</span>}
                          {rd.end_date && <span>Due {shortDate(rd.end_date)}</span>}
                        </p>
                      )}
                      {rd.description && <p className="mt-1.5 break-words text-[13.5px] leading-relaxed text-ink-2">{rd.description}</p>}
                    </TimelineItem>
                  );
                })}
              </ol>
            </Section>
          )}

          {/* Event schedule & stages */}
          {stages.length > 0 && (
            <Section title="Schedule" count={stages.length}>
              <ol>
                {stages.map((stg, idx) => {
                  const now = new Date();
                  const startTime = new Date(stg.start_time);
                  const endTime = stg.end_time ? new Date(stg.end_time) : null;

                  const isPast = endTime ? endTime < now : startTime < now;
                  const isLive = endTime ? startTime <= now && now <= endTime : false;
                  const isUpcoming = startTime > now;

                  const stageTone: Record<string, "info" | "neutral" | "bad" | "warn"> = {
                    ceremony: "info",
                    checkpoint: "neutral",
                    deadline: "bad",
                    judging: "warn",
                    other: "neutral",
                  };
                  const dateOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };

                  return (
                    <TimelineItem key={stg.id} state={isLive ? "live" : isPast ? "past" : "upcoming"} last={idx === stages.length - 1}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Tape tone={stageTone[stg.stage_type] || "neutral"}>{stg.stage_type}</Tape>
                        <h3 className={cn("min-w-0 break-words text-[14px] font-semibold", isPast && !isLive ? "text-ink-3" : "text-ink")}>{stg.title}</h3>
                        {isLive && (
                          <Tape tone="ok" dot>
                            Live now
                          </Tape>
                        )}
                        {isPast && !isLive && (
                          <span className="inline-flex items-center gap-1 caps-label text-ink-3">
                            <CheckCircle2 className="size-3" aria-hidden />
                            Done
                          </span>
                        )}
                        {isUpcoming && <span className="caps-label text-ink-3">Upcoming</span>}
                      </div>
                      <p className="mt-1 font-mono text-[12px] text-ink-3 tabular">
                        {startTime.toLocaleString("en-US", dateOpts)}
                        {endTime && (
                          <>
                            <span className="mx-1.5 text-ink-4">→</span>
                            {endTime.toLocaleString("en-US", dateOpts)}
                          </>
                        )}
                      </p>
                      {stg.description && <p className="mt-1.5 break-words text-[13.5px] leading-relaxed text-ink-2">{stg.description}</p>}
                    </TimelineItem>
                  );
                })}
              </ol>
            </Section>
          )}

          {/* ── People & resources tabs ─────────────────────────── */}
          <section aria-label="Teams, builders and resources" className="min-w-0">
            <InPageTabs
              label="Hackathon sections"
              value={activeTab}
              onChange={setActiveTab}
              tabs={[
                { value: "teams", label: "Teams", count: teams.length },
                { value: "builders", label: "Builders", count: buildersList.length },
                { value: "looking_for_teams", label: "Looking for teams", count: lookingForTeamRegs.length },
                { value: "looking_for_builders", label: "Looking for builders", count: recruitingTeams.length },
                { value: "resources", label: "Resources" },
              ]}
            />

            <div className="pt-5">
              {/* Teams */}
              {activeTab === "teams" &&
                (teams.length === 0 ? (
                  <EmptyState
                    icon={<Users />}
                    title="No teams yet"
                    body="Be the first to start a team for this hackathon on HackerMate."
                    action={
                      <ButtonLink href={createTeamHref} variant="secondary" size="sm" icon={<Plus />}>
                        Create a team
                      </ButtonLink>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
                    {teams.map((team) => (
                      <li key={team.id}>
                        <TeamRow
                          team={team}
                          tone={eventTone}
                          badge={
                            team.is_recruiting !== false ? (
                              <Tape tone="accent" dot>
                                Recruiting
                              </Tape>
                            ) : (
                              <Tape>Closed</Tape>
                            )
                          }
                        >
                          {renderSkills(team.skills, 3, () => false)}
                        </TeamRow>
                      </li>
                    ))}
                  </ul>
                ))}

              {/* Builders */}
              {activeTab === "builders" &&
                (buildersList.length === 0 ? (
                  <EmptyState icon={<Users />} title="No builders yet" body="Builders appear here once their team is listed for this hackathon." />
                ) : (
                  <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
                    {buildersList.map((builder) => {
                      const matchedLower = builder.matchedSkills.map((s) => s.toLowerCase());
                      return (
                        <li key={builder.id}>
                          <Link href={`/profile/${builder.id}`} className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-hover">
                            <Avatar name={builder.full_name} src={builder.avatar_url} size="md" />
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <span className="min-w-0 truncate text-[14px] font-semibold text-ink">{builder.full_name}</span>
                                <VerifiedBuilderBadge profile={builder} />
                                {builder.matchedSkills.length > 0 && (
                                  <Tape tone="accent" icon={<Target />}>
                                    {builder.matchedSkills.length} match{builder.matchedSkills.length !== 1 ? "es" : ""}
                                  </Tape>
                                )}
                              </div>
                              <p className="truncate text-[12.5px] text-ink-3">{builder.college || "Independent builder"}</p>
                              {renderSkills(builder.skills, 4, (s) => matchedLower.includes(s.toLowerCase()))}
                              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                {builder.isRegistered && <Tape tone="ok">Registered</Tape>}
                                {builder.teamName ? (
                                  <span className="min-w-0 truncate text-[12px] text-ink-3">
                                    In team <span className="text-ink-2">{builder.teamName}</span>
                                  </span>
                                ) : (
                                  <Tape tone="accent">Looking for team</Tape>
                                )}
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ))}

              {/* Looking for teams */}
              {activeTab === "looking_for_teams" && (
                <>
                  {currentUserId && (
                    <div className="mb-5 flex flex-col gap-3 rounded-lg border border-line bg-raised px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-ink">List yourself as looking for a team</p>
                        <p className="mt-0.5 text-[12.5px] text-ink-3">Teams in this hackathon can find you and reach out.</p>
                      </div>
                      {!isRegistered ? (
                        <span className="shrink-0 text-[12.5px] text-ink-3">Register first to list your profile</span>
                      ) : (
                        <Button
                          size="sm"
                          variant={myRegistration?.looking_for_team ? "secondary" : "inverse"}
                          icon={myRegistration?.looking_for_team ? undefined : <Search />}
                          className="shrink-0 self-start sm:self-auto"
                          onClick={handleToggleLookingForTeam}
                        >
                          {myRegistration?.looking_for_team ? "Stop listing profile" : "List my profile"}
                        </Button>
                      )}
                    </div>
                  )}

                  {lookingForTeamRegs.length === 0 ? (
                    <EmptyState icon={<Search />} title="Nobody is looking for a team yet" body="Registered builders can list themselves here." />
                  ) : (
                    <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
                      {registrations
                        .filter((reg) => reg.looking_for_team === true)
                        .map((reg) => {
                          // Match score based on user skills vs participant skills
                          const sharedSkills =
                            reg.profiles.skills?.filter((s) => userSkills.map((sk) => sk.toLowerCase()).includes(s.toLowerCase())) || [];
                          const matchScore = reg.profiles.skills?.length
                            ? Math.min(Math.round((sharedSkills.length / Math.max(userSkills.length, 1)) * 100) + 30, 98)
                            : 0;

                          return (
                            <li key={reg.id}>
                              <Link href={`/profile/${reg.profiles.id}`} className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-hover">
                                <Avatar name={reg.profiles.full_name} src={reg.profiles.avatar_url} size="md" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                    <span className="min-w-0 truncate text-[14px] font-semibold text-ink">{reg.profiles.full_name}</span>
                                    {matchScore > 0 && (
                                      <Tape tone="accent" icon={<Target />}>
                                        {matchScore}% match
                                      </Tape>
                                    )}
                                  </div>
                                  <p className="truncate text-[12.5px] text-ink-3">{reg.profiles.college || "Independent builder"}</p>
                                  {renderSkills(reg.profiles.skills, 3, (s) => userSkillsLower.includes(s.toLowerCase()))}
                                </div>
                                <Tape tone="ok" className="hidden shrink-0 sm:inline-flex">
                                  Looking to join
                                </Tape>
                              </Link>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </>
              )}

              {/* Looking for builders */}
              {activeTab === "looking_for_builders" && (
                <>
                  {teams
                    .filter((t) => t.owner_id === currentUserId && !isTeamFullAndRegistered(t))
                    .map((myTeam) => (
                      <div
                        key={myTeam.id}
                        className="mb-5 flex flex-col gap-3 rounded-lg border border-line bg-raised px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="break-words text-[13.5px] font-semibold text-ink">Recruitment for &ldquo;{myTeam.name}&rdquo;</p>
                          <p className="mt-0.5 text-[12.5px] text-ink-3">Choose whether your team shows up under Looking for builders.</p>
                        </div>
                        <Button
                          size="sm"
                          variant={myTeam.is_recruiting === true ? "secondary" : "inverse"}
                          icon={myTeam.is_recruiting === true ? undefined : <Target />}
                          className="shrink-0 self-start sm:self-auto"
                          onClick={() => handleToggleTeamRecruiting(myTeam.id, myTeam.is_recruiting === true)}
                        >
                          {myTeam.is_recruiting === true ? "Stop recruiting" : "List team as recruiting"}
                        </Button>
                      </div>
                    ))}

                  {recruitingTeams.length === 0 ? (
                    <EmptyState icon={<Target />} title="No teams are recruiting yet" body="Check back later, or start your own team." />
                  ) : (
                    <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
                      {teams
                        .filter((team) => team.is_recruiting === true && !isTeamFullAndRegistered(team))
                        .map((team) => {
                          const matchedTeamSkills = team.skills?.filter((s) => userSkills.includes(s)) || [];
                          const teamMatchScore = team.skills?.length ? Math.round((matchedTeamSkills.length / team.skills.length) * 100) : 0;

                          return (
                            <li key={team.id}>
                              <TeamRow
                                team={team}
                                tone={eventTone}
                                badge={
                                  teamMatchScore > 0 ? (
                                    <Tape tone="accent" icon={<Target />}>
                                      {teamMatchScore}% match
                                    </Tape>
                                  ) : undefined
                                }
                              >
                                {team.roles_needed?.length ? (
                                  <div className="mt-2 flex flex-wrap items-center gap-1">
                                    <span className="mr-1 caps-label text-ink-3">Needs</span>
                                    {team.roles_needed.slice(0, 2).map((role) => (
                                      <Tape key={role}>{role}</Tape>
                                    ))}
                                    {team.roles_needed.length > 2 && (
                                      <span className="font-mono text-[12px] text-ink-3">+{team.roles_needed.length - 2} more</span>
                                    )}
                                  </div>
                                ) : null}
                              </TeamRow>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </>
              )}

              {/* Resources */}
              {activeTab === "resources" && (
                <div className="space-y-6">
                  {isOrganizer && (
                    <div className="flex justify-end">
                      <Button size="sm" variant="secondary" icon={<Plus />} onClick={() => setShowAddResourceModal(true)}>
                        Add resource link
                      </Button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-6">
                    <Section title="Boilerplates & starter kits">
                      <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
                        {getAutoResources(hackathon.tags)
                          .filter((r) => r.category === "boilerplates")
                          .map((res, i) => (
                            <ResourceRow key={`auto-bp-${i}`} title={res.title} url={res.url} source="Suggested starter" />
                          ))}
                        {resources
                          .filter((r) => r.category === "boilerplates")
                          .map((res) => (
                            <ResourceRow
                              key={res.id}
                              title={res.title}
                              url={res.url}
                              source="Posted by organizer"
                              highlight
                              onDelete={isOrganizer ? () => handleDeleteResource(res.id) : undefined}
                            />
                          ))}
                      </ul>
                    </Section>

                    <Section title="Docs & developer APIs">
                      <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
                        {getAutoResources(hackathon.tags)
                          .filter((r) => r.category === "docs" || r.category === "apis")
                          .map((res, i) => (
                            <ResourceRow key={`auto-docs-${i}`} title={res.title} url={res.url} source="Suggested guide" />
                          ))}
                        {resources
                          .filter((r) => r.category === "docs" || r.category === "apis")
                          .map((res) => (
                            <ResourceRow
                              key={res.id}
                              title={res.title}
                              url={res.url}
                              source="Posted by organizer"
                              highlight
                              onDelete={isOrganizer ? () => handleDeleteResource(res.id) : undefined}
                            />
                          ))}
                      </ul>
                    </Section>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── Aside ─────────────────────────────────────────────── */}
        <aside className="min-w-0 space-y-9">
          <Section title="At a glance">
            <dl className="divide-y divide-line rounded-lg border border-line">
              <Fact label="Dates" value={<span className="font-mono tabular">{formatDateRange(hackathon.start_date, hackathon.end_date)}</span>} stacked />
              {hackathon.mode && <Fact label="Mode" value={<span className="capitalize">{hackathon.mode}</span>} />}
              {showLocation && <Fact label="Location" value={hackathon.location || "TBA"} stacked />}
              {organizerName && <Fact label={organizerLabel} value={organizerName} stacked />}
              {hackathon.prize_pool && (
                <Fact label="Prize pool" value={<span className="whitespace-pre-wrap">{formatPrizeDisplay(hackathon.prize_pool, hackathon.currency)}</span>} stacked />
              )}
              <Fact label="Team size" value={teamSizeLabel} />
              {!!hackathon.rounds_count && hackathon.rounds_count > 0 && (
                <Fact label="Rounds" value={<span className="font-mono tabular">{hackathon.rounds_count}</span>} />
              )}
              <Fact
                label={isNative ? "Builders joined" : "Teams joined"}
                value={<span className="font-mono tabular">{isNative ? registrations.length : teams.length}</span>}
              />
            </dl>
          </Section>

          <Section title="Your participation">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-3">
                {isRegistered ? (
                  <>
                    <span className="inline-flex min-w-0 items-center gap-2 text-[13px] font-medium text-ink">
                      <CheckCircle2 className="size-4 shrink-0 text-ok" aria-hidden />
                      {isNative ? "Registered" : "Registered externally"}
                    </span>
                    <Button size="sm" variant="ghost" className="text-bad hover:text-bad" onClick={handleCancelRegistration}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <span className="text-[13px] text-ink-3">
                    {canRegister ? "You haven't registered yet." : "Registration isn't available here."}
                  </span>
                )}
              </div>

              {linkedTeam ? (
                <div className="rounded-lg border border-line px-3.5 py-3">
                  <p className="break-words text-[13px] text-ink-2">
                    Your team <span className="font-semibold text-ink">{linkedTeam.name}</span> is listed for this hackathon.
                  </p>
                  <Button size="sm" variant="danger" icon={<Link2Off />} className="mt-2.5" disabled={inviteLoading} onClick={handleUnlinkTeam}>
                    Remove team from listing
                  </Button>
                </div>
              ) : (
                userOwnedTeams.length > 0 && (
                  <Button variant="secondary" icon={<Link2 />} className="w-full" onClick={() => setShowClaimModal(true)}>
                    Link a team you own
                  </Button>
                )
              )}

              <ButtonLink href={createTeamHref} variant="secondary" icon={<Plus />} className="w-full">
                Create a team
              </ButtonLink>
            </div>
          </Section>

          <Section
            title="Recruiting for this event"
            count={recruitingTeams.length}
            action={
              recruitingTeams.length > 3 ? (
                <button type="button" onClick={() => setActiveTab("looking_for_builders")} className="text-[12.5px] font-medium text-ink-3 hover:text-ink">
                  View all
                </button>
              ) : undefined
            }
          >
            {recruitingTeams.length ? (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {recruitingTeams.slice(0, 3).map((team) => (
                  <li key={team.id}>
                    <Link href={`/teams/${team.id}`} className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-hover">
                      <TeamMark name={team.name} tone={eventTone} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-ink">{team.name}</p>
                        <SeatMeter filled={team.team_members?.length || 0} total={team.max_members} className="mt-1" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-3">No teams are recruiting yet.</p>
            )}
          </Section>

          <Section title="Share">
            <div className="grid gap-1.5">
              <Button variant="secondary" icon={<Link2 />} className="w-full justify-start" onClick={handleCopyLink}>
                Copy link
              </Button>
              <div className="relative">
                <Button
                  variant="secondary"
                  icon={<CalendarPlus />}
                  iconRight={<ChevronDown className={cn("ml-auto transition-transform", showCalendarDropdown && "rotate-180")} aria-hidden />}
                  className="w-full justify-start"
                  aria-expanded={showCalendarDropdown}
                  aria-haspopup="menu"
                  onClick={() => {
                    if (hackathon.start_date && hackathon.end_date) {
                      setShowCalendarDropdown(!showCalendarDropdown);
                    } else {
                      showToast("Event date is not announced yet.", "info");
                    }
                  }}
                  disabled={!hasDates}
                  title={!hasDates ? "Dates TBA" : undefined}
                >
                  Add to calendar
                </Button>

                {showCalendarDropdown && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowCalendarDropdown(false)} aria-hidden />
                    <div role="menu" className="absolute inset-x-0 top-full z-30 mt-1.5 rounded-lg border border-line bg-overlay p-1 shadow-pop">
                      <a
                        role="menuitem"
                        href={getCalendarUrls().google}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setShowCalendarDropdown(false)}
                        className={CAL_ITEM}
                      >
                        Google Calendar
                        <ArrowUpRight className="ml-auto size-3.5 text-ink-4" aria-hidden />
                      </a>
                      <a
                        role="menuitem"
                        href={getCalendarUrls().outlook}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setShowCalendarDropdown(false)}
                        className={CAL_ITEM}
                      >
                        Outlook Calendar
                        <ArrowUpRight className="ml-auto size-3.5 text-ink-4" aria-hidden />
                      </a>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          downloadICSFile();
                          setShowCalendarDropdown(false);
                        }}
                        className={CAL_ITEM}
                      >
                        Download iCal (.ics)
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Section>

          {isOrganizer && (
            <Section title="Manage event">
              <div className="grid gap-1.5">
                <ButtonLink href={`/hackathons/${hackathon.id}/organizer`} variant="secondary" icon={<Building2 />} className="w-full justify-start">
                  Organizer portal
                </ButtonLink>
                <Button variant="secondary" icon={<Plus />} className="w-full justify-start" onClick={() => setShowAddResourceModal(true)}>
                  Add resource link
                </Button>
                <Button variant="danger" icon={<Trash2 />} className="w-full justify-start" onClick={handleDeleteHackathon}>
                  Delete hackathon
                </Button>
              </div>
            </Section>
          )}
        </aside>
      </div>

      {/* Mobile sticky action bar (sits above the tab bar) */}
      <div className="fixed inset-x-0 bottom-[calc(var(--hm-tabbar-h)+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 border-t border-line bg-canvas/95 px-4 py-2.5 backdrop-blur md:hidden [&>*:first-child]:flex-1">
        {primaryAction}
        <button
          type="button"
          onClick={handleToggleSave}
          aria-pressed={isSaved}
          aria-label={isSaved ? "Saved" : "Save event"}
          title={isSaved ? "Saved" : "Save event"}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-line-strong hover:bg-hover",
            isSaved ? "text-accent-ink" : "text-ink-2",
          )}
        >
          {isSaved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
        </button>
        <OverflowMenu items={mobileMenuItems} up />
      </div>

      {/* ── Add resource link (organizer) ────────────────────────── */}
      <Dialog
        open={showAddResourceModal}
        onClose={() => setShowAddResourceModal(false)}
        size="sm"
        title="Add resource link"
        description="Shown to every builder in the Resources tab."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAddResourceModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-resource-form" variant="primary" loading={savingResource}>
              Add link
            </Button>
          </>
        }
      >
        <form id="add-resource-form" onSubmit={handleCreateResource} className="space-y-4">
          <div>
            <FieldLabel htmlFor="resource-title">Title</FieldLabel>
            <Input
              id="resource-title"
              data-autofocus
              type="text"
              placeholder="e.g. Official challenge guide"
              value={resourceTitle}
              onChange={(e) => setResourceTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <FieldLabel htmlFor="resource-url">URL</FieldLabel>
            <Input
              id="resource-url"
              type="url"
              placeholder="https://docs.google.com/..."
              value={resourceUrl}
              onChange={(e) => setResourceUrl(e.target.value)}
              required
            />
          </div>
          <div>
            <FieldLabel htmlFor="resource-category">Category</FieldLabel>
            <Select
              id="resource-category"
              value={resourceCategory}
              onChange={(e) => setResourceCategory(e.target.value as "boilerplates" | "apis" | "docs" | "other")}
            >
              <option value="boilerplates">Boilerplates & Templates</option>
              <option value="apis">Sandbox APIs / Datasets</option>
              <option value="docs">Guides & Official Documentation</option>
              <option value="other">Other Links</option>
            </Select>
          </div>
        </form>
      </Dialog>

      {/* ── Register natively ────────────────────────────────────── */}
      <Dialog
        open={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        size="sm"
        title="Confirm registration"
        description={`Register for ${hackathon.name}. Pick a team if you're registering with one.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowRegisterModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={inviteLoading} onClick={handleRegisterNatively}>
              Confirm
            </Button>
          </>
        }
      >
        <FieldLabel htmlFor="register-team" hint="optional">
          Register with team
        </FieldLabel>
        <Select id="register-team" value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
          <option value="">No team (Individual)</option>
          {userOwnedTeams
            .filter((t) => !t.is_linked_to_this_hackathon)
            .map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
        </Select>
      </Dialog>

      {/* ── Link (claim) team ────────────────────────────────────── */}
      <Dialog
        open={showClaimModal}
        onClose={() => setShowClaimModal(false)}
        size="sm"
        title="Link team to hackathon"
        description={`Registered externally? Link your HackerMate team to ${hackathon.name} to recruit builders and collaborate.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowClaimModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!selectedTeam} loading={inviteLoading} onClick={handleClaimTeam}>
              Link team
            </Button>
          </>
        }
      >
        <FieldLabel htmlFor="claim-team">Team</FieldLabel>
        <Select id="claim-team" value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
          <option value="">Choose your team</option>
          {userOwnedTeams
            .filter((t) => !t.is_linked_to_this_hackathon)
            .map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
        </Select>
      </Dialog>

      {/* ── Confirm external registration ────────────────────────── */}
      <Dialog
        open={showExternalRegisterModal}
        onClose={() => {
          setShowExternalRegisterModal(false);
          setSelectedTeam("");
        }}
        size="sm"
        title="Confirm external registration"
        description={
          <>
            We opened the registration page for <span className="font-semibold text-ink">{hackathon.name}</span> in a new tab. Finish
            registering there, then confirm here to log it on HackerMate.
          </>
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setShowExternalRegisterModal(false);
                setSelectedTeam("");
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" loading={inviteLoading} onClick={handleRegisterExternallyConfirm}>
              I have registered
            </Button>
          </>
        }
      >
        <FieldLabel htmlFor="external-team" hint="optional">
          Register with team
        </FieldLabel>
        <Select id="external-team" value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
          <option value="">No team (Individual)</option>
          {userOwnedTeams
            .filter((t) => !t.is_linked_to_this_hackathon)
            .map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
        </Select>
      </Dialog>
    </Page>
  );
}

// ── Presentational helpers ──────────────────────────────────────────────

const CAL_ITEM =
  "flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink";

type WindowState = "past" | "live" | "upcoming" | "unknown";

/** Where "now" sits relative to a round's start/end window (display only). */
function windowState(start?: string | null, end?: string | null): WindowState {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (!s && !e) return "unknown";
  if (e && e < now) return "past";
  if (s && s > now) return "upcoming";
  if (s && e) return "live";
  return s ? "past" : "upcoming";
}

function shortDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function TimelineItem({ state, last, children }: { state: WindowState; last: boolean; children: ReactNode }) {
  return (
    <li className={cn("relative flex gap-4", !last && "pb-6")}>
      <div className="relative flex w-3 shrink-0 justify-center" aria-hidden>
        {!last && <span className="absolute bottom-[-2px] top-4 w-px bg-line" />}
        <span
          className={cn(
            "relative mt-1.5 rounded-full",
            state === "live"
              ? "size-3 bg-ok ring-4 ring-ok-soft"
              : state === "past"
                ? "size-2.5 bg-ink-4"
                : "size-2.5 bg-canvas ring-2 ring-inset ring-line-strong",
          )}
        />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

function InPageTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-5 overflow-x-auto border-b border-line scrollbar-none">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative flex h-10 shrink-0 items-center gap-1.5 text-[13px] font-medium transition-colors",
              active ? "text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span className={cn("font-mono text-[12px] tabular", active ? "text-ink-2" : "text-ink-4")}>{t.count}</span>
            )}
            {active && <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-signal" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

function TeamRow({
  team,
  tone,
  badge,
  children,
}: {
  team: Team;
  tone: "hack";
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Link href={`/teams/${team.id}`} className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-hover">
      <TeamMark name={team.name} tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-[14px] font-semibold text-ink">{team.name}</span>
          {badge}
        </div>
        <p className="mt-0.5 line-clamp-2 break-words text-[13px] leading-relaxed text-ink-2">{team.description || "No description provided."}</p>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <SeatMeter filled={team.team_members?.length || 0} total={team.max_members} />
          <span className="min-w-0 truncate text-[12px] text-ink-3">{team.college || "Independent team"}</span>
        </div>
        {children}
      </div>
    </Link>
  );
}

function ResourceRow({
  title,
  url,
  source,
  highlight = false,
  onDelete,
}: {
  title: string;
  url: string;
  source: string;
  highlight?: boolean;
  onDelete?: () => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3 px-3.5 py-3">
      <div className="min-w-0">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "group inline-flex max-w-full items-start gap-1 break-words text-[13px] font-medium hover:underline decoration-line-strong underline-offset-4",
            highlight ? "text-accent-ink" : "text-ink",
          )}
        >
          <span className="min-w-0 break-words">{title}</span>
          <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-ink-4 group-hover:text-ink-2" aria-hidden />
        </a>
        <span className="mt-0.5 block caps-label text-ink-3">{source}</span>
      </div>
      {onDelete && (
        <button type="button" onClick={onDelete} className="shrink-0 text-[12px] text-ink-3 hover:text-bad">
          Delete
        </button>
      )}
    </li>
  );
}

function Fact({ label, value, stacked = false }: { label: string; value: ReactNode; stacked?: boolean }) {
  if (stacked) {
    return (
      <div className="px-3.5 py-2.5">
        <dt className="caps-label text-ink-3">{label}</dt>
        <dd className="mt-1 break-words text-[13px] text-ink-2 [overflow-wrap:anywhere]">{value}</dd>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <dt className="shrink-0 caps-label text-ink-3">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[13px] text-ink-2">{value}</dd>
    </div>
  );
}

function Notice({ icon, title, body, action }: { icon: ReactNode; title: ReactNode; body: ReactNode; action: ReactNode }) {
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-raised px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-selected text-ink-2 [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-ink">{title}</div>
          <p className="mt-0.5 text-[12.5px] text-ink-3">{body}</p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function OverflowMenu({ items, up = false }: { items: MenuItem[]; up?: boolean }) {
  return (
    <Menu
      align="end"
      side={up ? "top" : "bottom"}
      items={items}
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-label="More hackathon actions"
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-2 ring-1 ring-inset ring-line-strong hover:bg-hover hover:text-ink md:size-[34px]",
            open && "bg-hover",
          )}
        >
          <Ellipsis className="size-4" />
        </button>
      )}
    />
  );
}

export default function HackathonDetailPage() {
  return (
    <AuthGuard>
      <HackathonDetailContent />
    </AuthGuard>
  );
}
