"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { promptDiscoverySignIn, PUBLIC_HACKATHON_COLUMNS } from "@/lib/discovery-auth";
import { useNotification } from "@/context/NotificationContext";
import { formatPrizeDisplay } from "@/app/hackathons/page";
import VerifiedBuilderBadge from "@/components/VerifiedBuilderBadge";
import StructuredHackathonDescription from "@/components/StructuredHackathonDescription";
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, Building2, CalendarDays, ChevronDown, Download, ExternalLink, Globe2, Handshake, Layers, Link2Off, Mail, MapPin, Plus, Search, Target, Trash2, Trophy, Users, Wrench } from "lucide-react";

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
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
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
        .select(PUBLIC_HACKATHON_COLUMNS)
        .eq("id", hackathonId)
        .single();

      if (hackathonError) {
        console.error(hackathonError);
        setLoading(false);
        return;
      }

      setHackathon(hackathonData);

      // Fetch partner config if exists for this hackathon
      const { data: partnerData, error: partnerError } = await supabase
        .from("partner_configs")
        .select("slug, partner_name")
        .eq("hackathon_id", hackathonId)
        .maybeSingle();

      if (partnerError) console.error("Public partner query failed:", partnerError);
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

      if (stageError) console.error("Public schedule query failed:", stageError);
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

      const { data: regData, error: registrationError } = await supabase
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

      if (registrationError) console.error("Hackathon registrations query failed:", registrationError);
      setRegistrations((regData as unknown as Registration[]) || []);

      // Load resources
      const { data: resourcesData, error: resourceError } = await supabase
        .from("hackathon_resources")
        .select("*")
        .eq("hackathon_id", hackathonId)
        .order("created_at", { ascending: false });

      if (resourceError) console.error("Public resources query failed:", resourceError);
      setResources(resourcesData || []);

      // Load all builders of all registered teams for this hackathon
      const registeredTeamIds = (teamsData || []).map((t: any) => t.id);
      const computedBuilders: BuilderWithMatch[] = [];

      if (registeredTeamIds.length > 0) {
        const { data: teamMembersData, error: memberError } = await supabase
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

        if (memberError) console.error("Public member query failed:", memberError);
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
    if (!currentUserId) { promptDiscoverySignIn(); return; }
    if (!hackathon) return;
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
    if (!currentUserId) { promptDiscoverySignIn(); return; }
    if (!hackathon || !hackathon.website_url) return;
    window.open(hackathon.website_url, "_blank", "noopener,noreferrer");
    setShowExternalRegisterModal(true);
  }

  async function handleRegisterExternallyConfirm() {
    if (!currentUserId) { promptDiscoverySignIn(); return; }
    if (!hackathon) return;
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
    if (!currentUserId) { promptDiscoverySignIn(); return; }
    if (!hackathon) return;
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
    if (!currentUserId) { promptDiscoverySignIn(); return; }
    if (!hackathon) {
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
        const { data: resourcesData, error: resourceError } = await supabase
          .from("hackathon_resources")
          .select("*")
          .eq("hackathon_id", hackathonId)
          .order("created_at", { ascending: false });
        if (resourceError) console.error("Public resources query failed:", resourceError);
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

  if (loading) {
    return (
      <main className="mx-auto min-h-[70vh] max-w-7xl bg-[#09090b] px-4 pb-12 pt-36 text-zinc-100 sm:px-6">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="mb-3 size-6 animate-spin rounded-full border-2 border-zinc-800 border-t-[#B4F461]" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading hackathon details...</p>
        </div>
      </main>
    );
  }

  if (!hackathon) {
    return (
      <main className="mx-auto min-h-[70vh] max-w-7xl bg-[#09090b] px-4 pb-12 pt-36 text-zinc-100 sm:px-6">
        <div className="rounded-[20px] border border-white/10 bg-zinc-950/60 backdrop-blur-xl shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] p-16 text-center">
          <h3 className="text-sm font-semibold text-white mb-2">
            Hackathon not found
          </h3>
          <Link href="/hackathons" className="mt-2 inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-[#B4F461] hover:underline">
            Back to hackathons
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate mx-auto min-h-screen max-w-7xl px-4 pb-20 pt-27 font-[family-name:var(--font-geist-sans)] text-zinc-100 sm:px-6 lg:pt-30">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(ellipse_55%_45%_at_15%_12%,rgba(180,244,97,0.045),transparent),radial-gradient(ellipse_45%_40%_at_85%_35%,rgba(34,211,238,0.025),transparent)]" />
      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/hackathons"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3.5 text-xs font-medium text-zinc-400 transition-all hover:-translate-y-0.5 hover:border-white/[0.16] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] motion-reduce:transform-none"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Back to hackathons
        </Link>
      </div>

      {/* Official Partner Dedicated Page Banner */}
      {partnerConfig && (
        <div className="mb-6 flex flex-col items-start justify-between gap-4 rounded-[20px] border border-[#22D3EE]/20 bg-zinc-950/60 p-5 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg border border-[#22D3EE]/20 bg-[#22D3EE]/[0.07] text-[#22D3EE]"><Handshake aria-hidden="true" className="size-4" /></span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-white">
                  Official Partner Event
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#22D3EE]/[0.07] text-[#22D3EE] border border-[#22D3EE]/20 uppercase font-semibold">
                  {partnerConfig.partner_name}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Explore the dedicated team-matching hub & custom partner portal.
              </p>
            </div>
          </div>
          <Link
            href={`/partners/${partnerConfig.slug}`}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-xs font-semibold text-zinc-100 transition-all hover:-translate-y-0.5 hover:border-[#22D3EE]/30 hover:text-[#22D3EE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE] motion-reduce:transform-none"
          >
            <span>View Partner Portal</span><ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      )}

      {/* Dedicated Organizer Portal Redirection Banner (Shown to Event Host) */}
      {isOrganizer && (
        <div className="mb-6 flex flex-col items-start justify-between gap-4 rounded-[20px] border border-[#B4F461]/20 bg-zinc-950/60 p-5 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg border border-[#B4F461]/20 bg-[#B4F461]/[0.07] text-[#B4F461]"><Building2 aria-hidden="true" className="size-4" /></span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-white">
                  Organizer Control Center
                </h3>
                <span className="rounded-md border border-[#B4F461]/20 bg-[#B4F461]/[0.07] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#B4F461]">
                  Event Host
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Manage participant roster, export CSV, track capacity limits, and post custom resource links.
              </p>
            </div>
          </div>
          <Link
            href={`/hackathons/${hackathon.id}/organizer`}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#B4F461]/40 bg-[#B4F461] px-4 text-xs font-bold !text-[#11160b] transition-all hover:-translate-y-0.5 hover:bg-[#c4f782] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] motion-reduce:transform-none"
          >
            <span>Open Organizer Portal</span><ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      )}

      {/* Main Grid */}
      <section className="mb-10 grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(290px,1fr)]">
        {/* Left - Hackathon Info */}
        <div className="relative overflow-hidden rounded-[20px] border border-white/10 bg-zinc-950/60 p-6 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-xl md:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-[#B4F461]/35 to-transparent" />
          <div className="flex items-center gap-2 mb-4">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-0">HACKATHON DETAILS</p>
            <span className={`inline-flex items-center rounded-md border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${
              hackathon.type === "native" ? "border-[#B4F461]/20 bg-[#B4F461]/[0.08] text-[#B4F461]" : "border-white/10 bg-white/[0.05] text-zinc-300"
            }`}>
              {hackathon.type === "native" ? "HackerMate Host" : "External Event"}
            </span>
          </div>

          <h1 className="mb-6 max-w-3xl bg-gradient-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text text-[34px] font-semibold leading-[1.12] tracking-[-0.045em] text-transparent sm:text-[42px]">
            {hackathon.name}
          </h1>

          <StructuredHackathonDescription
            description={hackathon.description}
            className="mb-6 [&>div]:!border-white/10 [&>div]:!bg-zinc-900/35 [&>div>div>span:last-child]:!border-[#B4F461]/25 [&>div>div>span:last-child]:!bg-[#B4F461]/[0.08] [&>div>div>span:last-child]:!text-[#B4F461]"
          />

          {/* Tags */}
          <div className="pt-5 border-t border-white/[0.08]">
            <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-3">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {hackathon.tags?.length ? (
                hackathon.tags.map((tag) => (
                   <span key={tag} className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-300">
                    {tag}
                  </span>
                ))
              ) : (
                 <span className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-500">No tags listed</span>
              )}
            </div>
          </div>

          {/* Hackathon Rounds Breakdown */}
          {hackathon.rounds_info && Array.isArray(hackathon.rounds_info) && hackathon.rounds_info.length > 0 && (
            <div className="mt-6 border-t border-white/[0.08] pt-6">
              <div className="flex items-center justify-between gap-2 mb-4">
                <p className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400"><Trophy aria-hidden="true" className="size-3.5 text-[#B4F461]" /> Hackathon rounds ({hackathon.rounds_info.length})</p>
                <span className="rounded-md border border-[#B4F461]/20 bg-[#B4F461]/[0.08] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#B4F461]">
                  {hackathon.rounds_info.length} {hackathon.rounds_info.length === 1 ? "Round" : "Rounds"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {hackathon.rounds_info.map((rd: any, idx: number) => (
                  <div key={idx} className="space-y-2 rounded-xl border border-white/10 bg-zinc-900/35 p-4 transition-colors hover:border-white/20">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-full border border-[#B4F461]/25 bg-[#B4F461]/10 font-mono text-xs font-bold text-[#B4F461]">
                          {rd.round_number || idx + 1}
                        </span>
                        <h4 className="text-sm font-bold text-white">
                          {rd.name || `Round ${idx + 1}`}
                        </h4>
                      </div>

                      {rd.type && (
                        <span className="rounded-md border border-white/10 bg-white/[0.05] px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-300">
                          {rd.type}
                        </span>
                      )}
                    </div>

                    {rd.description && (
                      <p className="pl-8 text-xs leading-relaxed text-zinc-400">
                        {rd.description}
                      </p>
                    )}

                    {(rd.start_date || rd.end_date) && (
                      <div className="pl-8 pt-1 flex flex-wrap items-center gap-3 text-[11px] font-mono text-zinc-500">
                        {rd.start_date && (
                          <span>Start: {new Date(rd.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                        )}
                        {rd.end_date && (
                          <span>→ Deadline: {new Date(rd.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Event Schedule & Timeline */}
          {stages.length > 0 && (
            <div className="pt-6 border-t border-white/[0.08] mt-6">
              <div className="flex items-center justify-between gap-2 mb-4">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-0">EVENT SCHEDULE & STAGES</p>
                <span className="text-[10px] font-mono text-zinc-500">
                  {stages.length} {stages.length === 1 ? "Milestone" : "Milestones"}
                </span>
              </div>

              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
                {stages.map((stg) => {
                  const now = new Date();
                  const startTime = new Date(stg.start_time);
                  const endTime = stg.end_time ? new Date(stg.end_time) : null;

                  const isPast = endTime ? endTime < now : startTime < now;
                  const isLive = endTime
                    ? startTime <= now && now <= endTime
                    : false;
                  const isUpcoming = startTime > now;

                  const typeBadges: Record<string, string> = {
                    ceremony: "bg-zinc-900/60 text-[#B4F461] border-[#B4F461]/20",
                    checkpoint: "bg-[#22D3EE]/[0.06] text-[#22D3EE] border-[#22D3EE]/20",
                    deadline: "bg-rose-950 text-rose-400 border-rose-800/60",
                    judging: "bg-amber-950 text-amber-400 border-amber-800/60",
                    other: "bg-zinc-900 text-zinc-400 border-zinc-800",
                  };
                  const badgeClass = typeBadges[stg.stage_type] || typeBadges.other;

                  return (
                    <div key={stg.id} className="relative group">
                      {/* Status indicator node */}
                      <div
                        className={`absolute -left-[23.5px] top-1.5 w-3 h-3 rounded-full border-2 transition-all ${
                          isLive
                            ? "border-[#B4F461] bg-[#B4F461] shadow-[0_0_10px_rgba(180,244,97,0.35)]"
                            : isPast
                            ? "bg-zinc-800 border-zinc-700"
                            : "bg-zinc-950 border-zinc-500"
                        }`}
                      />

                       <div className="rounded-xl border border-white/10 bg-zinc-900/35 p-4 transition-colors group-hover:border-white/20">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-semibold ${badgeClass}`}>
                              {stg.stage_type}
                            </span>
                            <h4 className={`text-sm font-bold ${isPast ? "text-zinc-400 line-through decoration-zinc-600" : "text-white"}`}>
                              {stg.title}
                            </h4>
                          </div>

                          {isLive && (
                            <span className="flex items-center gap-1 rounded-md border border-[#B4F461]/20 bg-[#B4F461]/[0.08] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#B4F461]">
                              <span className="size-1.5 rounded-full bg-[#B4F461]" />
                              LIVE NOW
                            </span>
                          )}
                          {isPast && (
                            <span className="text-[10px] font-mono text-zinc-500">
                              ✓ Completed
                            </span>
                          )}
                          {isUpcoming && (
                            <span className="text-[10px] font-mono text-zinc-400">
                              Upcoming
                            </span>
                          )}
                        </div>

                        {stg.description && (
                          <p className="text-xs text-zinc-400 mb-2.5 leading-relaxed">
                            {stg.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-zinc-400 pt-2 border-t border-white/[0.08]">
                          <span>
                             Start: {startTime.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {endTime && (
                            <span>
                              → End: {endTime.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right - Stats & Actions */}
        <div className="rounded-[20px] border border-white/10 bg-zinc-950/60 backdrop-blur-xl shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] p-6 md:p-8 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              {hackathon.mode && (
                 <span className="inline-flex items-center rounded-md border border-[#22D3EE]/20 bg-[#22D3EE]/[0.06] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#8fe7f3]">
                  {hackathon.mode}
                </span>
              )}

              <div className="text-right">
                <div className="text-2xl font-semibold text-white leading-none mb-1">
                  {hackathon.type === "native" ? registrations.length : teams.length}
                </div>
                <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider">
                  {hackathon.type === "native" ? "Builders Joined" : "Teams Joined"}
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="space-y-4 mb-8">
              {/* Date */}
              <div className="flex items-start gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400">
                  <CalendarDays aria-hidden="true" className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Dates</p>
                  <p className="text-xs font-semibold text-white break-words">
                    {formatDateRange(hackathon.start_date, hackathon.end_date)}
                  </p>
                </div>
              </div>

              {/* Location */}
              {!(hackathon.mode?.toLowerCase() === "online" && (!hackathon.location || hackathon.location.toLowerCase().includes("venue in india") || hackathon.location.toLowerCase().includes("online"))) && (
                <div className="flex items-start gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400">
                    <MapPin aria-hidden="true" className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Location</p>
                    <p className="text-xs font-semibold text-white break-words">
                      {hackathon.location || "TBA"}
                    </p>
                  </div>
                </div>
              )}

              {/* College / University / Organizing Communities */}
              {hackathon.college && (
                <div className="flex items-start gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400">
                    <Building2 aria-hidden="true" className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-zinc-500 font-mono uppercase">
                      {hackathon.college.toLowerCase().includes("alpha forge") || hackathon.college.toLowerCase().includes("together we solve") || hackathon.college.toLowerCase().includes("tws")
                        ? "Organizing Communities"
                        : "College / University"}
                    </p>
                    <p className="text-xs font-semibold text-white break-words">
                      {hackathon.college.toLowerCase().includes("alpha forge") || hackathon.college.toLowerCase().includes("together we solve") || hackathon.college.toLowerCase().includes("tws")
                        ? "Alpha Forge & TWS (Together We Solve)"
                        : hackathon.college}
                    </p>
                  </div>
                </div>
              )}

              {/* Prize Pool */}
              {hackathon.prize_pool && (
                <div className="flex items-start gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400">
                    <Trophy aria-hidden="true" className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Prize Pool</p>
                    <p className="text-xs font-semibold text-white break-words whitespace-pre-wrap">
                      {formatPrizeDisplay(hackathon.prize_pool, hackathon.currency)}
                    </p>
                  </div>
                </div>
              )}

              {/* Participant Team Sizes */}
              <div className="flex items-start gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400">
                  <Users aria-hidden="true" className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Team Size Rule</p>
                  <p className="text-xs font-semibold text-white break-words">
                    {hackathon.min_team_size === 1 && hackathon.max_team_size === 1
                      ? "Solo Participation"
                      : hackathon.min_team_size && hackathon.max_team_size
                      ? `${hackathon.min_team_size} – ${hackathon.max_team_size} Members`
                      : hackathon.max_team_size
                      ? `Up to ${hackathon.max_team_size} Members`
                      : hackathon.min_team_size
                      ? `At least ${hackathon.min_team_size} Members`
                      : "Flexible (No Rule Published)"}
                  </p>
                </div>
              </div>

              {/* Hackathon Rounds Count */}
              {hackathon.rounds_count && hackathon.rounds_count > 0 && (
                <div className="flex items-start gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400">
                    <Layers aria-hidden="true" className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Hackathon Rounds</p>
                    <p className="text-xs font-semibold text-white break-words">
                      {hackathon.rounds_count} {hackathon.rounds_count === 1 ? "Round" : "Rounds"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2 border-t border-white/[0.08] pt-5">
            {hackathon.type === "native" ? (
              <>
                {isRegistered ? (
                  <div className="space-y-2">
                     <div className="inline-flex w-full items-center justify-center rounded-xl border border-[#B4F461]/20 bg-[#B4F461]/[0.08] px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#B4F461]">
                      Registered Natively ✓
                    </div>
                    <button
                      onClick={handleCancelRegistration}
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 text-xs font-semibold text-rose-300 transition-colors hover:border-rose-500/35 hover:bg-rose-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:cursor-not-allowed disabled:opacity-55 w-full"
                    >
                      Cancel Registration
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { if (!currentUserId) { promptDiscoverySignIn(); return; } setShowRegisterModal(true); }}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#B4F461]/45 bg-[#B4F461] px-4 text-xs font-bold !text-[#11160b] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_24px_rgba(180,244,97,0.13)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#c4f782] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none w-full"
                  >
                    Register Natively
                  </button>
                )}
              </>
            ) : (
              <>
                {isRegistered ? (
                  <div className="space-y-2">
                     <div className="inline-flex w-full items-center justify-center rounded-xl border border-[#B4F461]/20 bg-[#B4F461]/[0.08] px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#B4F461]">
                      Registered Externally ✓
                    </div>
                    <button
                      onClick={handleCancelRegistration}
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 text-xs font-semibold text-rose-300 transition-colors hover:border-rose-500/35 hover:bg-rose-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:cursor-not-allowed disabled:opacity-55 w-full"
                    >
                      Cancel Registration
                    </button>
                  </div>
                ) : (
                  hackathon.website_url && (
                    <button
                      onClick={handleRegisterExternally}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#B4F461]/45 bg-[#B4F461] px-4 text-xs font-bold !text-[#11160b] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_24px_rgba(180,244,97,0.13)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#c4f782] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none w-full"
                    >
                      Register Externally ↗
                    </button>
                  )
                )}
              </>
            )}

            {(() => {
              const linkedTeam = userOwnedTeams.find((t) => t.hackathon_id === hackathon?.id);
              if (linkedTeam) {
                return (
                  <div className="p-3 rounded-lg bg-[#B4F461]/10 border border-[#B4F461]/20 text-center space-y-2">
                    <p className="text-xs text-zinc-300">
                      Your team <span className="font-semibold text-white">{linkedTeam.name}</span> is linked to this hackathon.
                    </p>
                    <button
                      onClick={handleUnlinkTeam}
                      disabled={inviteLoading}
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 text-xs font-semibold text-rose-300 transition-colors hover:border-rose-500/35 hover:bg-rose-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:cursor-not-allowed disabled:opacity-55 w-full flex items-center justify-center gap-1.5"
                    >
                      <Link2Off aria-hidden="true" className="size-4" />
                      <span>Remove Team from Listing</span>
                    </button>
                  </div>
                );
              }
              return (
                userOwnedTeams.length > 0 && (
                  <button
                    onClick={() => { if (!currentUserId) { promptDiscoverySignIn(); return; } setShowClaimModal(true); }}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/50 px-4 text-xs font-semibold text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-zinc-800/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none w-full"
                  >
                    Claim Team on HackerMate
                  </button>
                )
              );
            })()}


            <Link
              href={`/teams/create?hackathon=${hackathon.id}`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/50 px-4 text-xs font-semibold text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-zinc-800/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none w-full"
            >
              + Create a Team
            </Link>

            <button
              onClick={handleToggleSave}
              aria-pressed={isSaved}
              className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-4 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] motion-reduce:transform-none ${
                isSaved
                  ? "border-[#B4F461]/30 bg-[#B4F461]/10 text-[#B4F461] hover:bg-[#B4F461]/15"
                  : "border-white/10 bg-zinc-900/50 text-zinc-200 hover:border-white/20 hover:bg-zinc-800/70"
              }`}
            >
              {isSaved ? (
                <>
                  <Bookmark aria-hidden="true" className="size-4 fill-[#B4F461] text-[#B4F461]" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Bookmark aria-hidden="true" className="size-4" />
                  <span>Save Event</span>
                </>
              )}
            </button>

            {/* Add to Calendar Button */}
            <div className="relative mb-4">
              <button
                onClick={() => {
                  if (hackathon.start_date && hackathon.end_date) {
                    setShowCalendarDropdown(!showCalendarDropdown);
                  } else {
                    showToast("Event date is not announced yet.", "info");
                  }
                }}
                disabled={!hackathon.start_date || !hackathon.end_date}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/50 px-4 text-xs font-semibold text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-zinc-800/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none w-full flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title={(!hackathon.start_date || !hackathon.end_date) ? "Dates TBA" : undefined}
              >
                <CalendarDays aria-hidden="true" className="size-4 text-zinc-400" />
                <span>Add to Calendar</span>
                <ChevronDown aria-hidden="true" className={`ml-auto size-3.5 text-zinc-500 transition-transform ${showCalendarDropdown ? "rotate-180" : ""}`} />
              </button>

              {showCalendarDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-20" 
                    onClick={() => setShowCalendarDropdown(false)}
                  />
                  <div className="absolute inset-x-0 bottom-full z-30 mb-2 rounded-xl border border-white/10 bg-zinc-950/95 p-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
                    <a
                      href={getCalendarUrls().google}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowCalendarDropdown(false)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-[11px] font-medium text-zinc-300 hover:text-white rounded-lg hover:bg-white/[0.04] transition-colors"
                    >
                      <Globe2 aria-hidden="true" className="size-3.5" /> Google Calendar
                    </a>
                    <a
                      href={getCalendarUrls().outlook}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowCalendarDropdown(false)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-[11px] font-medium text-zinc-300 hover:text-white rounded-lg hover:bg-white/[0.04] transition-colors"
                    >
                      <Mail aria-hidden="true" className="size-3.5" /> Outlook Calendar
                    </a>
                    <button
                      onClick={() => {
                        downloadICSFile();
                        setShowCalendarDropdown(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-[11px] font-medium text-zinc-300 hover:text-white rounded-lg hover:bg-white/[0.04] transition-all text-left"
                    >
                      <Download aria-hidden="true" className="size-3.5" /> Download iCal (.ics)
                    </button>
                  </div>
                </>
              )}
            </div>

            {isOrganizer && (
              <button
                onClick={handleDeleteHackathon}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 text-xs font-semibold text-rose-300 transition-colors hover:border-rose-500/35 hover:bg-rose-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:cursor-not-allowed disabled:opacity-55 w-full flex items-center justify-center gap-2 mt-4"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                <span>Delete Hackathon</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Tabs / Sub-Sections */}
      <section>
        <div role="group" aria-label="Hackathon sections" className="mb-6 flex max-w-full gap-1 overflow-x-auto whitespace-nowrap border-b border-white/[0.08] scrollbar-none">
          <button
            onClick={() => setActiveTab("teams")}
            aria-pressed={activeTab === "teams"}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#B4F461] ${
              activeTab === "teams"
                ? "border-[#B4F461] text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Users aria-hidden="true" className="size-3.5" /> Teams ({teams.length})
          </button>

          <button
            onClick={() => setActiveTab("builders")}
            aria-pressed={activeTab === "builders"}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#B4F461] ${
              activeTab === "builders"
                ? "border-[#B4F461] text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Wrench aria-hidden="true" className="size-3.5" /> Builders ({buildersList.length})
          </button>

          <button
            onClick={() => setActiveTab("looking_for_teams")}
            aria-pressed={activeTab === "looking_for_teams"}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#B4F461] ${
              activeTab === "looking_for_teams"
                ? "border-[#B4F461] text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Search aria-hidden="true" className="size-3.5" /> Looking for Teams ({registrations.filter((r) => r.looking_for_team === true).length})
          </button>

          <button
            onClick={() => setActiveTab("looking_for_builders")}
            aria-pressed={activeTab === "looking_for_builders"}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#B4F461] ${
              activeTab === "looking_for_builders"
                ? "border-[#B4F461] text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Target aria-hidden="true" className="size-3.5" /> Looking for Builders ({teams.filter((t) => t.is_recruiting === true && !isTeamFullAndRegistered(t)).length})
          </button>

          <button
            onClick={() => setActiveTab("resources")}
            aria-pressed={activeTab === "resources"}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#B4F461] ${
              activeTab === "resources"
                ? "border-[#B4F461] text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <BookOpen aria-hidden="true" className="size-3.5" /> Resources
          </button>
        </div>

        {/* Tab CONTENT 2: Teams Grid */}
        {activeTab === "teams" && (
          <>
            {teams.length === 0 ? (
              <div className="rounded-[20px] border border-white/10 bg-zinc-950/60 backdrop-blur-xl shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] p-12 text-center">
                <div className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4 text-zinc-500">
                  <Users aria-hidden="true" className="size-5" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-1">No teams yet</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-4">
                  Be the first to create a team for this hackathon on HackerMate!
                </p>
                <Link href={`/teams/create?hackathon=${hackathon.id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#B4F461]/45 bg-[#B4F461] px-4 text-xs font-bold !text-[#11160b] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_24px_rgba(180,244,97,0.13)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#c4f782] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none inline-flex">
                  Create a Team
                </Link>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {teams.map((team) => (
                  <Link
                    key={team.id}
                    href={`/teams/${team.id}`}
                     className="group flex min-h-[140px] flex-col justify-between rounded-[20px] border border-white/10 bg-zinc-950/60 p-5 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 motion-reduce:transform-none"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h3 className="font-semibold text-sm text-white group-hover:text-white truncate">
                        {team.name}
                      </h3>
                      {team.is_recruiting !== false ? (
                         <span className="inline-flex shrink-0 items-center rounded-md border border-[#22D3EE]/20 bg-[#22D3EE]/[0.06] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#8fe7f3]">
                          Recruiting
                        </span>
                      ) : (
                         <span className="inline-flex shrink-0 items-center rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                          Full
                        </span>
                      )}
                    </div>

                    <p className="text-zinc-400 text-xs leading-relaxed mb-4 line-clamp-2">
                      {team.description || "No description provided."}
                    </p>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {team.skills?.length ? (
                        team.skills.slice(0, 3).map((skill) => (
                           <span key={skill} className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-300">
                            {skill}
                          </span>
                        ))
                      ) : (
                         <span className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-500">No skills listed</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-white/[0.08]">
                      <span className="text-[10px] text-zinc-500 truncate">
                        {team.college || "Independent Team"}
                      </span>
                      <span className="text-[10px] font-semibold text-white group-hover:text-zinc-300 transition-colors">
                        View Team →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab CONTENT 3: Builders Directory */}
        {activeTab === "builders" && (
          <>
            {buildersList.length === 0 ? (
              <div className="rounded-[20px] border border-white/10 bg-zinc-950/60 backdrop-blur-xl shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] p-12 text-center">
                <p className="text-xs text-zinc-500">No matching builders found for this hackathon yet.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {buildersList.map((builder) => (
                  <Link
                    key={builder.id}
                    href={`/profile/${builder.id}`}
                     className="group flex min-h-[135px] flex-col justify-between rounded-[20px] border border-white/10 bg-zinc-950/60 p-4 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 motion-reduce:transform-none"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {builder.avatar_url ? (
                            <img
                              src={builder.avatar_url}
                              alt={builder.full_name}
                              className="w-9 h-9 rounded object-cover border border-zinc-800 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-zinc-400 text-xs shrink-0">
                              {builder.full_name?.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-semibold text-xs text-white truncate group-hover:text-[#B4F461] transition-colors">
                                {builder.full_name}
                              </h3>
                              <VerifiedBuilderBadge profile={builder} />
                            </div>
                            <p className="text-zinc-500 text-[10px] truncate">
                              {builder.college || "Independent Builder"}
                            </p>
                          </div>
                        </div>

                        {builder.matchedSkills.length > 0 && (
                           <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#B4F461]/20 bg-[#B4F461]/[0.08] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#B4F461]">
                             <Target aria-hidden="true" className="size-3" /> {builder.matchedSkills.length} Match{builder.matchedSkills.length !== 1 ? "es" : ""}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1 mb-3">
                        {builder.skills?.length ? (
                          builder.skills.slice(0, 4).map((skill) => {
                            const isMatched = builder.matchedSkills.map(s => s.toLowerCase()).includes(skill.toLowerCase());
                            return (
                              <span 
                                key={skill} 
                                 className={`rounded-md border px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wider ${
                                  isMatched
                                     ? "border-[#B4F461]/25 bg-[#B4F461]/[0.08] text-[#B4F461]"
                                     : "border-white/10 bg-white/[0.04] text-zinc-400"
                                }`}
                              >
                                {skill}
                              </span>
                            );
                          })
                        ) : (
                           <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">No skills added</span>
                        )}
                      </div>
                    </div>

                     <div className="flex items-center justify-between border-t border-white/[0.08] pt-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {builder.isRegistered && (
                           <span className="inline-flex items-center rounded-md border border-[#B4F461]/20 bg-[#B4F461]/[0.08] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#B4F461]">
                            ✓ Registered
                          </span>
                        )}
                         <span className={`rounded-md border px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wider ${
                          builder.teamName 
                             ? "border-white/10 bg-white/[0.04] text-zinc-400"
                             : "border-[#B4F461]/20 bg-[#B4F461]/[0.08] text-[#B4F461]"
                        }`}>
                          {builder.teamName ? `In Team: ${builder.teamName}` : "Looking for Team"}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 group-hover:text-white transition-colors">
                        View Profile →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab CONTENT 4: Looking for Teams */}
        {activeTab === "looking_for_teams" && (
          <>
            {currentUserId && (
              <div className="rounded-[20px] border border-white/10 bg-zinc-950/60 backdrop-blur-xl shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-white">List your profile as Looking for Teams</h4>
                  <p className="text-[10px] text-zinc-500 mt-1">Let other registered teams know you are looking to join a team for this hackathon.</p>
                </div>
                {!isRegistered ? (
                  <div className="text-[10px] text-zinc-400 font-medium bg-zinc-900/50 border border-zinc-800 rounded px-3 py-1.5 shrink-0">
                    Register first to list your profile
                  </div>
                ) : (
                  <button
                    onClick={handleToggleLookingForTeam}
                    className={`btn shrink-0 ${
                      registrations.find(r => r.user_id === currentUserId)?.looking_for_team
                        ? "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/50 px-4 text-xs font-semibold text-zinc-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-zinc-800/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
                        : "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#B4F461]/45 bg-[#B4F461] px-4 text-xs font-bold !text-[#11160b] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#c4f782] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
                    }`}
                  >
                    {registrations.find(r => r.user_id === currentUserId)?.looking_for_team
                      ? "Stop Listing Profile"
                       : "List My Profile"}
                  </button>
                )}
              </div>
            )}

            {registrations.filter((r) => r.looking_for_team === true).length === 0 ? (
              <div className="rounded-[20px] border border-white/10 bg-zinc-950/60 backdrop-blur-xl shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] p-12 text-center">
                <p className="text-xs text-zinc-500">No builders are currently looking for teams. Be the first to list!</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {registrations
                  .filter((reg) => reg.looking_for_team === true)
                  .map((reg) => {
                    // Match score based on user skills vs participant skills
                    const sharedSkills = reg.profiles.skills?.filter((s) =>
                      userSkills.map((sk) => sk.toLowerCase()).includes(s.toLowerCase())
                    ) || [];
                    const matchScore = reg.profiles.skills?.length
                      ? Math.min(Math.round((sharedSkills.length / Math.max(userSkills.length, 1)) * 100) + 30, 98)
                      : 0;

                    return (
                      <Link
                        key={reg.id}
                        href={`/profile/${reg.profiles.id}`}
                         className="group flex min-h-[140px] flex-col justify-between rounded-[20px] border border-white/10 bg-zinc-950/60 p-4 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 motion-reduce:transform-none"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-start gap-3 min-w-0">
                              {reg.profiles.avatar_url ? (
                                <img
                                  src={reg.profiles.avatar_url}
                                  alt={reg.profiles.full_name}
                                  className="w-9 h-9 rounded object-cover border border-zinc-800 shrink-0"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-zinc-400 text-xs shrink-0">
                                  {reg.profiles.full_name?.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <h3 className="font-semibold text-xs text-white truncate group-hover:text-[#B4F461] transition-colors">
                                  {reg.profiles.full_name}
                                </h3>
                                <p className="text-zinc-500 text-[10px] truncate">
                                  {reg.profiles.college || "Independent Builder"}
                                </p>
                              </div>
                            </div>

                            {matchScore > 0 && (
                               <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#B4F461]/20 bg-[#B4F461]/[0.08] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#B4F461]">
                                 <Target aria-hidden="true" className="size-3" /> {matchScore}% Match
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1 mb-3">
                            {reg.profiles.skills?.length ? (
                              reg.profiles.skills.slice(0, 3).map((skill) => {
                                const isMatched = userSkills.map(s => s.toLowerCase()).includes(skill.toLowerCase());
                                return (
                                  <span 
                                    key={skill} 
                                     className={`rounded-md border px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wider ${
                                      isMatched
                                         ? "border-[#B4F461]/25 bg-[#B4F461]/[0.08] text-[#B4F461]"
                                         : "border-white/10 bg-white/[0.04] text-zinc-400"
                                    }`}
                                  >
                                    {skill}
                                  </span>
                                );
                              })
                            ) : (
                              <span className="text-[10px] text-zinc-500">No skills added</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]">
                           <span className="rounded-md border border-[#B4F461]/20 bg-[#B4F461]/[0.08] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#B4F461]">
                            Looking to join
                          </span>
                          <span className="text-[10px] text-zinc-500 group-hover:text-white transition-colors">
                            View Profile →
                          </span>
                        </div>
                      </Link>
                    );
                  })}
              </div>
            )}
          </>
        )}

        {/* Tab CONTENT 5: Looking for Builders */}
        {activeTab === "looking_for_builders" && (
          <>
            {teams.filter(t => t.owner_id === currentUserId && !isTeamFullAndRegistered(t)).map(myTeam => (
              <div key={myTeam.id} className="rounded-[20px] border border-white/10 bg-zinc-950/60 backdrop-blur-xl shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-white">Manage Recruitment for &ldquo;{myTeam.name}&rdquo;</h4>
                  <p className="text-[10px] text-zinc-500 mt-1">Toggle whether your team should be listed under &lsquo;Looking for Builders&rsquo; to find teammates.</p>
                </div>
                <button
                  onClick={() => handleToggleTeamRecruiting(myTeam.id, myTeam.is_recruiting === true)}
                  className={`btn shrink-0 ${
                    myTeam.is_recruiting === true
                      ? "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/50 px-4 text-xs font-semibold text-zinc-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-zinc-800/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
                      : "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#B4F461]/45 bg-[#B4F461] px-4 text-xs font-bold !text-[#11160b] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#c4f782] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
                  }`}
                >
                  {myTeam.is_recruiting === true
                    ? "Stop Recruiting"
                     : "List Team as Recruiting"}
                </button>
              </div>
            ))}

            {teams.filter((t) => t.is_recruiting === true && !isTeamFullAndRegistered(t)).length === 0 ? (
              <div className="rounded-[20px] border border-white/10 bg-zinc-950/60 backdrop-blur-xl shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] p-12 text-center">
                <p className="text-xs text-zinc-500">No teams are currently recruiting builders. Check back later!</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {teams
                  .filter((team) => team.is_recruiting === true && !isTeamFullAndRegistered(team))
                  .map((team) => {
                    const matchedTeamSkills = team.skills?.filter((s) => userSkills.includes(s)) || [];
                    const teamMatchScore = team.skills?.length
                      ? Math.round((matchedTeamSkills.length / team.skills.length) * 100)
                      : 0;

                    return (
                      <Link
                        key={team.id}
                        href={`/teams/${team.id}`}
                         className="group flex min-h-[150px] flex-col justify-between rounded-[20px] border border-white/10 bg-zinc-950/60 p-5 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 motion-reduce:transform-none"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <h3 className="font-semibold text-sm text-white group-hover:text-white truncate">
                              {team.name}
                            </h3>
                            {teamMatchScore > 0 && (
                               <span className="inline-flex items-center gap-1 rounded-md border border-[#B4F461]/20 bg-[#B4F461]/[0.08] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#B4F461]">
                                 <Target aria-hidden="true" className="size-3" /> {teamMatchScore}% Match
                              </span>
                            )}
                          </div>

                          <p className="text-zinc-400 text-xs leading-relaxed mb-4 line-clamp-2">
                            {team.description || "No description provided."}
                          </p>

                          {team.roles_needed?.length ? (
                            <div className="mb-4">
                              <span className="text-[10px] font-mono uppercase tracking-wide text-zinc-500 block mb-1">Roles Needed:</span>
                              <div className="flex flex-wrap gap-1">
                                {team.roles_needed.slice(0, 2).map((role) => (
                                  <span key={role} className="text-[10px] font-semibold bg-[#B4F461]/10 border border-[#B4F461]/20 text-[#B4F461] rounded px-1.5 py-0.5">
                                    {role}
                                  </span>
                                ))}
                                {team.roles_needed.length > 2 && (
                                  <span className="text-[10px] text-zinc-500">+{team.roles_needed.length - 2} more</span>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-white/[0.08]">
                          <span className="text-[10px] text-zinc-500 truncate">
                            {team.college || "Independent Team"}
                          </span>
                          <span className="text-[10px] font-semibold text-white group-hover:text-zinc-300 transition-colors">
                            View recruiting team →
                          </span>
                        </div>
                      </Link>
                    );
                  })}
              </div>
            )}
          </>
        )}

        {/* Tab CONTENT 6: Resources */}
        {activeTab === "resources" && (
          <div className="space-y-6">
            {isOrganizer && (
              <div className="flex justify-end">
                <button
                  onClick={() => setShowAddResourceModal(true)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#B4F461]/45 bg-[#B4F461] px-4 text-xs font-bold !text-[#11160b] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_24px_rgba(180,244,97,0.13)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#c4f782] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none flex items-center gap-1.5"
                >
                   <Plus aria-hidden="true" className="size-3.5" /> Add Custom Resource Link
                </button>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              {/* Category 1: Boilerplates & Starters */}
              <div className="rounded-[20px] border border-white/10 bg-zinc-950/60 backdrop-blur-xl shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
                <h3 className="text-sm font-semibold text-white mb-3.5 flex items-center gap-2 border-b border-white/[0.08] pb-2">
                   <Wrench aria-hidden="true" className="size-4 text-[#B4F461]" /> Boilerplates & Component Starter Kits
                </h3>
                <div className="space-y-3.5">
                  {/* Curated Auto Resources */}
                  {getAutoResources(hackathon.tags)
                    .filter((r) => r.category === "boilerplates")
                    .map((res, i) => (
                      <div key={`auto-bp-${i}`} className="flex items-start justify-between gap-3 group">
                        <div>
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-zinc-300 hover:text-white transition-all flex items-center gap-1.5"
                          >
                            {res.title} <ExternalLink aria-hidden="true" className="size-3 opacity-50 transition-opacity group-hover:opacity-100" />
                          </a>
                          <span className="text-[10px] font-mono text-zinc-600 block mt-0.5">AUTO-RECOMMENDED STARTER</span>
                        </div>
                      </div>
                    ))}
                  {/* Custom Resources */}
                  {resources
                    .filter((r) => r.category === "boilerplates")
                    .map((res) => (
                      <div key={res.id} className="flex items-start justify-between gap-3 group">
                        <div>
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-[#B4F461] hover:text-[#c4f782] transition-all flex items-center gap-1.5"
                          >
                            {res.title} <ExternalLink aria-hidden="true" className="size-3 opacity-50 transition-opacity group-hover:opacity-100" />
                          </a>
                          <span className="text-[10px] font-mono text-zinc-500 block mt-0.5">POSTED BY ORGANIZER</span>
                        </div>
                        {isOrganizer && (
                          <button
                            onClick={() => handleDeleteResource(res.id)}
                            className="text-zinc-600 hover:text-rose-400 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* Category 2: Documentation & Developer APIs */}
              <div className="rounded-[20px] border border-white/10 bg-zinc-950/60 backdrop-blur-xl shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
                <h3 className="text-sm font-semibold text-white mb-3.5 flex items-center gap-2 border-b border-white/[0.08] pb-2">
                   <BookOpen aria-hidden="true" className="size-4 text-[#22D3EE]" /> Developer Docs & Sandbox APIs
                </h3>
                <div className="space-y-3.5">
                  {/* Curated Auto Resources */}
                  {getAutoResources(hackathon.tags)
                    .filter((r) => r.category === "docs" || r.category === "apis")
                    .map((res, i) => (
                      <div key={`auto-docs-${i}`} className="flex items-start justify-between gap-3 group">
                        <div>
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-zinc-300 hover:text-white transition-all flex items-center gap-1.5"
                          >
                            {res.title} <ExternalLink aria-hidden="true" className="size-3 opacity-50 transition-opacity group-hover:opacity-100" />
                          </a>
                          <span className="text-[10px] font-mono text-zinc-500 block mt-0.5">AUTO-RECOMMENDED GUIDE</span>
                        </div>
                      </div>
                    ))}
                  {/* Custom Resources */}
                  {resources
                    .filter((r) => r.category === "docs" || r.category === "apis")
                    .map((res) => (
                      <div key={res.id} className="flex items-start justify-between gap-3 group">
                        <div>
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-[#B4F461] hover:text-[#c4f782] transition-all flex items-center gap-1.5"
                          >
                            {res.title} <ExternalLink aria-hidden="true" className="size-3 opacity-50 transition-opacity group-hover:opacity-100" />
                          </a>
                          <span className="text-[10px] font-mono text-zinc-600 block mt-0.5">POSTED BY ORGANIZER</span>
                        </div>
                        {isOrganizer && (
                          <button
                            onClick={() => handleDeleteResource(res.id)}
                            className="text-zinc-600 hover:text-rose-400 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* MODAL: Add Resource Link */}
      {showAddResourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Add custom resource link" className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-[20px] border border-white/10 bg-zinc-950/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
            <h3 className="text-sm font-semibold text-white mb-2">Add Custom Resource Link</h3>
            <form onSubmit={handleCreateResource} className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Resource Title</label>
                <input
                  type="text"
                  placeholder="e.g. Official Challenge Guide"
                  value={resourceTitle}
                  onChange={(e) => setResourceTitle(e.target.value)}
                  className="min-h-10 rounded-xl border border-white/10 bg-zinc-900/50 px-3.5 text-xs text-zinc-100 outline-none transition-colors hover:border-white/20 focus:border-[#B4F461]/60 focus:ring-2 focus:ring-[#B4F461]/10 w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Resource URL</label>
                <input
                  type="url"
                  placeholder="https://docs.google.com/..."
                  value={resourceUrl}
                  onChange={(e) => setResourceUrl(e.target.value)}
                  className="min-h-10 rounded-xl border border-white/10 bg-zinc-900/50 px-3.5 text-xs text-zinc-100 outline-none transition-colors hover:border-white/20 focus:border-[#B4F461]/60 focus:ring-2 focus:ring-[#B4F461]/10 w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Resource Category</label>
                <select
                  value={resourceCategory}
                  onChange={(e) => setResourceCategory(e.target.value as "boilerplates" | "apis" | "docs" | "other")}
                  className="min-h-10 rounded-xl border border-white/10 bg-zinc-900/50 px-3.5 text-xs text-zinc-100 outline-none transition-colors hover:border-white/20 focus:border-[#B4F461]/60 focus:ring-2 focus:ring-[#B4F461]/10 w-full"
                >
                  <option value="boilerplates">Boilerplates & Templates</option>
                  <option value="apis">Sandbox APIs / Datasets</option>
                  <option value="docs">Guides & Official Documentation</option>
                  <option value="other">Other Links</option>
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowAddResourceModal(false)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/50 px-4 text-xs font-semibold text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-zinc-800/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingResource}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#B4F461]/45 bg-[#B4F461] px-4 text-xs font-bold !text-[#11160b] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_24px_rgba(180,244,97,0.13)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#c4f782] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
                >
                  {savingResource ? "Adding..." : "Add Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: Register Natively */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Confirm hackathon registration" className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-[20px] border border-white/10 bg-zinc-950/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-white mb-1.5">
              Confirm Registration
            </h2>

            <p className="text-xs text-zinc-400 mb-4">
              Register for {hackathon.name}. Choose if you are registering with an existing team.
            </p>

            <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 block mb-1.5">Register with Team (Optional)</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="min-h-10 rounded-xl border border-white/10 bg-zinc-900/50 px-3.5 text-xs text-zinc-100 outline-none transition-colors hover:border-white/20 focus:border-[#B4F461]/60 focus:ring-2 focus:ring-[#B4F461]/10 w-full mb-4"
            >
              <option value="">No team (Individual)</option>
              {userOwnedTeams
                .filter((t) => !t.is_linked_to_this_hackathon)
                .map((team) => (
                  <option 
                    key={team.id} 
                    value={team.id} 
                  >
                    {team.name}
                  </option>
                ))}

            </select>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.08]">
              <button
                onClick={() => setShowRegisterModal(false)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/50 px-4 text-xs font-semibold text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-zinc-800/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
              >
                Cancel
              </button>

              <button
                onClick={handleRegisterNatively}
                disabled={inviteLoading}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#B4F461]/45 bg-[#B4F461] px-4 text-xs font-bold !text-[#11160b] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_24px_rgba(180,244,97,0.13)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#c4f782] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
              >
                {inviteLoading ? "Registering..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Claim Team Status */}
      {showClaimModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Link team to hackathon" className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-[20px] border border-white/10 bg-zinc-950/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-white mb-1.5">
              Link Team to Hackathon
            </h2>

            <p className="text-xs text-zinc-400 mb-4">
              If your team has registered externally, associate your HackerMate team with {hackathon.name} to recruit builders and collaborate.
            </p>

            <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 block mb-1.5">Select Team</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="min-h-10 rounded-xl border border-white/10 bg-zinc-900/50 px-3.5 text-xs text-zinc-100 outline-none transition-colors hover:border-white/20 focus:border-[#B4F461]/60 focus:ring-2 focus:ring-[#B4F461]/10 w-full mb-4"
            >
              <option value="">Choose your team</option>
              {userOwnedTeams
                .filter((t) => !t.is_linked_to_this_hackathon)
                .map((team) => (
                  <option 
                    key={team.id} 
                    value={team.id} 
                  >
                    {team.name}
                  </option>
                ))}

            </select>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.08]">
              <button
                onClick={() => setShowClaimModal(false)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/50 px-4 text-xs font-semibold text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-zinc-800/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
              >
                Cancel
              </button>

              <button
                onClick={handleClaimTeam}
                disabled={!selectedTeam || inviteLoading}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#B4F461]/45 bg-[#B4F461] px-4 text-xs font-bold !text-[#11160b] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_24px_rgba(180,244,97,0.13)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#c4f782] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
              >
                {inviteLoading ? "Linking..." : "Link Team"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Confirm External Registration */}
      {showExternalRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Confirm external registration" className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-[20px] border border-white/10 bg-zinc-950/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-white mb-1.5">
              Confirm External Registration
            </h2>

            <p className="text-xs text-zinc-400 mb-4 font-light leading-relaxed">
              We opened the registration page for <strong className="text-white font-semibold">{hackathon.name}</strong> in a new tab. Please complete your registration there, then confirm below to log your status on HackerMate.
            </p>

            <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 block mb-1.5">Register with Team (Optional)</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="min-h-10 rounded-xl border border-white/10 bg-zinc-900/50 px-3.5 text-xs text-zinc-100 outline-none transition-colors hover:border-white/20 focus:border-[#B4F461]/60 focus:ring-2 focus:ring-[#B4F461]/10 w-full mb-4"
            >
              <option value="">No team (Individual)</option>
              {userOwnedTeams
                .filter((t) => !t.is_linked_to_this_hackathon)
                .map((team) => (
                  <option 
                    key={team.id} 
                    value={team.id} 
                  >
                    {team.name}
                  </option>
                ))}

            </select>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.08]">
              <button
                onClick={() => {
                  setShowExternalRegisterModal(false);
                  setSelectedTeam("");
                }}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/50 px-4 text-xs font-semibold text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-zinc-800/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
              >
                Cancel
              </button>

              <button
                onClick={handleRegisterExternallyConfirm}
                disabled={inviteLoading}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#B4F461]/45 bg-[#B4F461] px-4 text-xs font-bold !text-[#11160b] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_24px_rgba(180,244,97,0.13)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#c4f782] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
              >
                {inviteLoading ? "Confirming..." : "I Have Registered"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function HackathonDetailPage() {
  return (
    <>
      <HackathonDetailContent />
    </>
  );
}
