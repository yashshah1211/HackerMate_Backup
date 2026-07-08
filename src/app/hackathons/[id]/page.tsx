"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";

type Hackathon = {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  mode: string | null;
  prize_pool: string | null;
  website_url: string | null;
  tags: string[] | null;
  type: string | null;
  organizer_id: string | null;
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
};

type Registration = {
  id: string;
  user_id: string;
  team_id: string | null;
  looking_for_team?: boolean;
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
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function HackathonDetailContent() {
  const { showToast, confirm } = useNotification();
  const params = useParams();
  const router = useRouter();
  const hackathonId = params.id as string;

  const [hackathon, setHackathon] = useState<Hackathon | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  // Hybrid system states
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [userOwnedTeams, setUserOwnedTeams] = useState<{ id: string; name: string; hackathon_id: string | null; owner_id: string }[]>([]);
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
        setLoading(false);
        return;
      }

      setHackathon(hackathonData);

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
          .select("id, name, hackathon_id, owner_id")
          .eq("owner_id", user.id);

        setUserOwnedTeams(ownedTeams || []);

        const { data: currentUserProfile } = await supabase
          .from("profiles")
          .select("skills")
          .eq("id", user.id)
          .single();
        setUserSkills(currentUserProfile?.skills || []);
      }

      // Load teams participating in this hackathon
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("*")
        .eq("hackathon_id", hackathonId)
        .order("created_at", { ascending: false });

      if (teamsError) {
        console.error(teamsError);
      } else {
        setTeams(teamsData || []);
      }

      const { data: regData } = await supabase
        .from("hackathon_registrations")
        .select(`
          id,
          user_id,
          team_id,
          looking_for_team,
          created_at,
          profiles (
            id,
            full_name,
            email,
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

      setRegistrations((regData as unknown as Registration[]) || []);

      // Load resources
      const { data: resourcesData } = await supabase
        .from("hackathon_resources")
        .select("*")
        .eq("hackathon_id", hackathonId)
        .order("created_at", { ascending: false });

      setResources(resourcesData || []);

      // Load all builders of all registered teams for this hackathon
      const registeredTeamIds = (teamsData || []).map((t) => t.id);
      const computedBuilders: BuilderWithMatch[] = [];

      if (registeredTeamIds.length > 0) {
        const { data: teamMembersData } = await supabase
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
              email,
              is_available
            )
          `)
          .in("team_id", registeredTeamIds);

        const uniqueBuildersMap = new Map();
        if (teamMembersData) {
          teamMembersData.forEach((tm: any) => {
            const profile = Array.isArray(tm.profiles) ? tm.profiles[0] : tm.profiles;
            if (profile && !uniqueBuildersMap.has(profile.id)) {
              const reg = (regData as unknown as Registration[])?.find((r) => r.user_id === profile.id);
              const isRegistered = !!reg;
              const teamName = (teamsData || []).find((t) => t.id === tm.team_id)?.name || "";

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
    const currentStatus = registrations.find(r => r.user_id === currentUserId)?.looking_for_team || false;
    const newStatus = !currentStatus;

    try {
      const { error } = await supabase
        .from("hackathon_registrations")
        .update({ looking_for_team: newStatus })
        .eq("hackathon_id", hackathonId)
        .eq("user_id", currentUserId);

      if (error) {
        showToast(error.message, "error");
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
    setInviteLoading(true);
    try {
      // 1. Insert native registration row
      const { error: regError } = await supabase
        .from("hackathon_registrations")
        .insert({
          hackathon_id: hackathon.id,
          user_id: currentUserId,
          team_id: selectedTeam || null,
        });

      if (regError) {
        showToast(regError.message, "error");
        setInviteLoading(false);
        return;
      }

      // 2. If registering with a team, update the team's hackathon_id association
      if (selectedTeam) {
        await supabase
          .from("teams")
          .update({ hackathon_id: hackathon.id })
          .eq("id", selectedTeam);
      }

      showToast("Successfully registered for the hackathon!", "success");
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
    setInviteLoading(true);
    try {
      // 1. Insert registration row
      const { error: regError } = await supabase
        .from("hackathon_registrations")
        .insert({
          hackathon_id: hackathon.id,
          user_id: currentUserId,
          team_id: selectedTeam || null,
        });

      if (regError) {
        showToast(regError.message, "error");
        setInviteLoading(false);
        return;
      }

      // 2. If registering with a team, update the team's hackathon_id association
      if (selectedTeam) {
        await supabase
          .from("teams")
          .update({ hackathon_id: hackathon.id })
          .eq("id", selectedTeam);
      }

      showToast("Successfully registered and confirmed on HackerMate!", "success");
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
      const { error } = await supabase
        .from("teams")
        .update({ hackathon_id: hackathon.id })
        .eq("id", selectedTeam);

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
          .from("teams")
          .update({ hackathon_id: null })
          .eq("id", reg.team_id);
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

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading hackathon details...</p>
        </div>
      </main>
    );
  }

  if (!hackathon) {
    return (
      <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
        <div className="card card-static p-16 text-center">
          <h3 className="text-sm font-semibold text-white mb-2">
            Hackathon not found
          </h3>
          <Link href="/hackathons" className="link text-xs mt-2 inline-block">
            Back to hackathons
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
      {/* Back link */}
      <div className="mb-6 animate-fade-in-up">
        <Link
          href="/hackathons"
          className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to hackathons
        </Link>
      </div>

      {/* Main Grid */}
      <section className="grid lg:grid-cols-[2fr_1fr] gap-6 mb-10">
        {/* Left - Hackathon Info */}
        <div className="card card-static p-6 md:p-8 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-4">
            <p className="section-label mb-0">HACKATHON DETAILS</p>
            <span className={`badge text-[9px] font-mono py-0.5 px-1.5 uppercase ${
              hackathon.type === "native" ? "badge-success" : "badge-warning"
            }`}>
              {hackathon.type === "native" ? "HackerMate Host" : "External Event"}
            </span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-white mb-3">
            {hackathon.name}
          </h1>

          {(() => {
            const desc = htmlToPlainText(
              hackathon.description || "No description provided."
            );
            const limit = 400;
            const shouldTruncate = desc.length > limit;
            return (
              <div className="mb-6">
                <div 
                  className={`relative overflow-hidden transition-all duration-300 ${
                    shouldTruncate && !isDescExpanded ? "max-h-[240px]" : "max-h-none"
                  }`}
                >
                  <div className="prose-hackathon whitespace-pre-line text-zinc-400 text-sm leading-relaxed">
                    {desc}
                  </div>
                  {shouldTruncate && !isDescExpanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
                  )}
                </div>
                {shouldTruncate && (
                  <div className="flex justify-center mt-3 pt-3 border-t border-zinc-900/50">
                    <button
                      onClick={() => setIsDescExpanded(!isDescExpanded)}
                      className="text-xs font-semibold text-white hover:text-zinc-300 transition-colors inline-flex items-center gap-1 font-mono uppercase tracking-wider"
                    >
                      {isDescExpanded ? (
                        <>
                          <span>Read Less</span>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                          </svg>
                        </>
                      ) : (
                        <>
                          <span>Read More</span>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Tags */}
          <div className="pt-5 border-t border-zinc-900">
            <h3 className="section-label mb-3">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {hackathon.tags?.length ? (
                hackathon.tags.map((tag) => (
                  <span key={tag} className="badge text-[10px] py-0.5 px-1.5">
                    {tag}
                  </span>
                ))
              ) : (
                <span className="badge text-[10px] text-zinc-600">No tags listed</span>
              )}
            </div>
          </div>
        </div>

        {/* Right - Stats & Actions */}
        <div className="card card-static p-6 md:p-8 animate-fade-in-up stagger-1 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              {hackathon.mode && (
                <span className="badge badge-primary text-[10px] py-0.5 px-1.5 capitalize">
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
                <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Dates</p>
                  <p className="text-xs font-semibold text-white break-words">
                    {formatDateRange(hackathon.start_date, hackathon.end_date)}
                  </p>
                </div>
              </div>

              {/* Location */}
              <div className="flex items-start gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Location</p>
                  <p className="text-xs font-semibold text-white break-words">
                    {hackathon.location || "TBA"}
                  </p>
                </div>
              </div>

              {/* Prize Pool */}
              {hackathon.prize_pool && (
                <div className="flex items-start gap-2.5">
                  <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Prize Pool</p>
                    <p className="text-xs font-semibold text-white break-words whitespace-pre-wrap">
                      {hackathon.prize_pool}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2 pt-5 border-t border-zinc-900/50">
            {hackathon.type === "native" ? (
              <>
                {isRegistered ? (
                  <div className="space-y-2">
                    <div className="badge badge-success w-full justify-center py-2 text-xs font-semibold">
                      Registered Natively ✓
                    </div>
                    <button
                      onClick={handleCancelRegistration}
                      className="btn btn-danger btn-sm w-full"
                    >
                      Cancel Registration
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowRegisterModal(true)}
                    className="btn btn-primary w-full"
                  >
                    Register Natively
                  </button>
                )}
              </>
            ) : (
              <>
                {isRegistered ? (
                  <div className="space-y-2">
                    <div className="badge badge-success w-full justify-center py-2 text-xs font-semibold">
                      Registered Externally ✓
                    </div>
                    <button
                      onClick={handleCancelRegistration}
                      className="btn btn-danger btn-sm w-full"
                    >
                      Cancel Registration
                    </button>
                  </div>
                ) : (
                  hackathon.website_url && (
                    <button
                      onClick={handleRegisterExternally}
                      className="btn btn-primary w-full"
                    >
                      Register Externally ↗
                    </button>
                  )
                )}
              </>
            )}

            {userOwnedTeams.length > 0 && (
              <button
                onClick={() => setShowClaimModal(true)}
                className="btn btn-secondary w-full"
              >
                Claim Team on HackerMate
              </button>
            )}


            <Link
              href={`/teams/create?hackathon=${hackathon.id}`}
              className="btn btn-secondary w-full btn-sm"
            >
              + Create a Team
            </Link>

            <button
              onClick={handleToggleSave}
              className={`btn w-full btn-sm flex items-center justify-center gap-2 transition-all ${
                isSaved
                  ? "bg-violet-600/10 text-violet-400 border border-violet-500/30 hover:bg-violet-600/20"
                  : "btn-secondary"
              }`}
            >
              {isSaved ? (
                <>
                  <svg className="w-4 h-4 fill-violet-400 text-violet-400" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                  </svg>
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                  </svg>
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
                className="btn btn-secondary w-full btn-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title={(!hackathon.start_date || !hackathon.end_date) ? "Dates TBA" : undefined}
              >
                <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                <span>Add to Calendar</span>
                <svg className={`w-3.5 h-3.5 ml-auto text-zinc-500 transition-transform ${showCalendarDropdown ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {showCalendarDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-20" 
                    onClick={() => setShowCalendarDropdown(false)}
                  />
                  <div className="absolute right-0 left-0 bottom-full mb-2 z-30 rounded-xl border border-zinc-800 bg-zinc-950 p-1.5 shadow-xl animate-fade-in">
                    <a
                      href={getCalendarUrls().google}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowCalendarDropdown(false)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-[11px] font-medium text-zinc-300 hover:text-white rounded-lg hover:bg-white/[0.04] transition-colors"
                    >
                      <span className="text-xs">🌐</span> Google Calendar
                    </a>
                    <a
                      href={getCalendarUrls().outlook}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowCalendarDropdown(false)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-[11px] font-medium text-zinc-300 hover:text-white rounded-lg hover:bg-white/[0.04] transition-colors"
                    >
                      <span className="text-xs">📧</span> Outlook Calendar
                    </a>
                    <button
                      onClick={() => {
                        downloadICSFile();
                        setShowCalendarDropdown(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-[11px] font-medium text-zinc-300 hover:text-white rounded-lg hover:bg-white/[0.04] transition-all text-left"
                    >
                      <span className="text-xs">📅</span> Download iCal (.ics)
                    </button>
                  </div>
                </>
              )}
            </div>

            {isOrganizer && (
              <button
                onClick={handleDeleteHackathon}
                className="btn btn-danger w-full btn-sm flex items-center justify-center gap-2 mt-4"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                <span>Delete Hackathon</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Tabs / Sub-Sections */}
      <section className="animate-fade-in-up stagger-2">
        <div className="flex border-b border-zinc-900 mb-6 flex-wrap gap-y-2">
          <button
            onClick={() => setActiveTab("teams")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-[2px] transition-all flex items-center gap-2 ${
              activeTab === "teams"
                ? "border-white text-white bg-white/[0.02]"
                : "border-transparent text-zinc-500 hover:text-white"
            }`}
          >
            👥 Teams ({teams.length})
          </button>

          <button
            onClick={() => setActiveTab("builders")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-[2px] transition-all flex items-center gap-2 ${
              activeTab === "builders"
                ? "border-white text-white bg-white/[0.02]"
                : "border-transparent text-zinc-500 hover:text-white"
            }`}
          >
            🛠️ Builders ({buildersList.length})
          </button>

          <button
            onClick={() => setActiveTab("looking_for_teams")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-[2px] transition-all flex items-center gap-2 ${
              activeTab === "looking_for_teams"
                ? "border-white text-white bg-white/[0.02]"
                : "border-transparent text-zinc-500 hover:text-white"
            }`}
          >
            🔍 Looking for Teams ({registrations.filter((r) => r.looking_for_team === true).length})
          </button>

          <button
            onClick={() => setActiveTab("looking_for_builders")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-[2px] transition-all flex items-center gap-2 ${
              activeTab === "looking_for_builders"
                ? "border-white text-white bg-white/[0.02]"
                : "border-transparent text-zinc-500 hover:text-white"
            }`}
          >
            🎯 Looking for Builders ({teams.filter((t) => t.is_recruiting === true).length})
          </button>

          <button
            onClick={() => setActiveTab("resources")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-[2px] transition-all flex items-center gap-2 ${
              activeTab === "resources"
                ? "border-white text-white bg-white/[0.02]"
                : "border-transparent text-zinc-500 hover:text-white"
            }`}
          >
            📚 Resources
          </button>

          {isOrganizer && (
            <button
              onClick={() => setActiveTab("organizer")}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-[2px] transition-all flex items-center gap-2 ${
                activeTab === "organizer"
                  ? "border-white text-white bg-white/[0.02]"
                  : "border-transparent text-zinc-500 hover:text-white"
              }`}
            >
              💼 Organizer Portal
            </button>
          )}
        </div>

        {/* Tab CONTENT 2: Teams Grid */}
        {activeTab === "teams" && (
          <>
            {teams.length === 0 ? (
              <div className="card card-static p-12 text-center">
                <div className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4 text-zinc-500">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-white mb-1">No teams yet</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-4">
                  Be the first to create a team for this hackathon on HackerMate!
                </p>
                <Link href={`/teams/create?hackathon=${hackathon.id}`} className="btn btn-primary btn-sm inline-flex">
                  Create a Team
                </Link>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {teams.map((team) => (
                  <Link
                    key={team.id}
                    href={`/teams/${team.id}`}
                    className={`card p-5 group flex flex-col justify-between min-h-[140px]`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h3 className="font-semibold text-sm text-white group-hover:text-white truncate">
                        {team.name}
                      </h3>
                      {team.is_recruiting !== false ? (
                        <span className="badge badge-primary text-[9px] py-0.5 px-1.5 flex-shrink-0">
                          Recruiting
                        </span>
                      ) : (
                        <span className="badge bg-zinc-800 text-zinc-500 border border-zinc-700 text-[9px] py-0.5 px-1.5 flex-shrink-0">
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
                          <span key={skill} className="badge text-[9px] py-0.5 px-1.5">
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="badge text-[9px] text-zinc-600">No skills listed</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-zinc-900">
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
              <div className="card card-static p-12 text-center">
                <p className="text-xs text-zinc-500">No matching builders found for this hackathon yet.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {buildersList.map((builder) => (
                  <Link
                    key={builder.id}
                    href={`/profile/${builder.id}`}
                    className="card card-static p-4 flex flex-col justify-between group hover:border-zinc-700 transition-all min-h-[135px]"
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
                            <h3 className="font-semibold text-xs text-white truncate group-hover:text-violet-300 transition-colors">
                              {builder.full_name}
                            </h3>
                            <p className="text-zinc-500 text-[10px] truncate">
                              {builder.college || "Independent Builder"}
                            </p>
                          </div>
                        </div>

                        {builder.matchedSkills.length > 0 && (
                          <span className="text-[8px] font-mono font-semibold text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 rounded px-1.5 py-0.5 shrink-0">
                            ✨ {builder.matchedSkills.length} Match{builder.matchedSkills.length !== 1 ? "es" : ""}
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
                                className={`text-[8px] font-semibold px-1.5 py-0.5 rounded border ${
                                  isMatched
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                    : "border-zinc-800/80 bg-zinc-900/30 text-zinc-455"
                                }`}
                              >
                                {skill}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-[8px] text-zinc-650">No skills added</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-900/60">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {builder.isRegistered && (
                          <span className="badge badge-success text-[8px] font-mono py-0.5 px-1 uppercase">
                            ✓ Registered
                          </span>
                        )}
                        <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${
                          builder.teamName 
                            ? "bg-zinc-800/20 text-zinc-500 border-zinc-800" 
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        }`}>
                          {builder.teamName ? `In Team: ${builder.teamName}` : "Looking for Team"}
                        </span>
                      </div>
                      <span className="text-[9px] text-zinc-500 group-hover:text-white transition-colors">
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
              <div className="card card-static p-4 border-zinc-800 bg-zinc-950/20 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-white">List your profile as Looking for Teams</h4>
                  <p className="text-[10px] text-zinc-500 mt-1">Let other registered teams know you are looking to join a team for this hackathon.</p>
                </div>
                <button
                  onClick={handleToggleLookingForTeam}
                  className={`btn btn-sm shrink-0 ${
                    registrations.find(r => r.user_id === currentUserId)?.looking_for_team
                      ? "btn-secondary"
                      : "btn-primary"
                  }`}
                >
                  {registrations.find(r => r.user_id === currentUserId)?.looking_for_team
                    ? "Stop Listing Profile"
                    : "🔍 List My Profile"}
                </button>
              </div>
            )}

            {registrations.filter((r) => r.looking_for_team === true).length === 0 ? (
              <div className="card card-static p-12 text-center">
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
                        className="card card-static p-4 flex flex-col justify-between group hover:border-zinc-700 transition-all min-h-[140px]"
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
                                <h3 className="font-semibold text-xs text-white truncate group-hover:text-violet-300 transition-colors">
                                  {reg.profiles.full_name}
                                </h3>
                                <p className="text-zinc-500 text-[10px] truncate">
                                  {reg.profiles.college || "Independent Builder"}
                                </p>
                              </div>
                            </div>

                            {matchScore > 0 && (
                              <span className="text-[8px] font-mono font-semibold text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 rounded px-1.5 py-0.5 shrink-0">
                                ✨ {matchScore}% Match
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
                                    className={`text-[8px] font-semibold px-1.5 py-0.5 rounded border ${
                                      isMatched
                                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                        : "border-zinc-800/80 bg-zinc-900/30 text-zinc-450"
                                    }`}
                                  >
                                    {skill}
                                  </span>
                                );
                              })
                            ) : (
                              <span className="text-[8px] text-zinc-650">No skills added</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-zinc-900/60">
                          <span className="text-[8px] font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded px-1.5 py-0.5">
                            Looking to join
                          </span>
                          <span className="text-[9px] text-zinc-500 group-hover:text-white transition-colors">
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
            {teams.filter(t => t.owner_id === currentUserId).map(myTeam => (
              <div key={myTeam.id} className="card card-static p-4 border-zinc-800 bg-zinc-950/20 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-white">Manage Recruitment for &ldquo;{myTeam.name}&rdquo;</h4>
                  <p className="text-[10px] text-zinc-500 mt-1">Toggle whether your team should be listed under &lsquo;Looking for Builders&rsquo; to find teammates.</p>
                </div>
                <button
                  onClick={() => handleToggleTeamRecruiting(myTeam.id, myTeam.is_recruiting === true)}
                  className={`btn btn-sm shrink-0 ${
                    myTeam.is_recruiting === true
                      ? "btn-secondary"
                      : "btn-primary"
                  }`}
                >
                  {myTeam.is_recruiting === true
                    ? "Stop Recruiting"
                    : "🎯 List Team as Recruiting"}
                </button>
              </div>
            ))}

            {teams.filter((t) => t.is_recruiting === true).length === 0 ? (
              <div className="card card-static p-12 text-center">
                <p className="text-xs text-zinc-500">No teams are currently recruiting builders. Check back later!</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {teams
                  .filter((team) => team.is_recruiting === true)
                  .map((team) => {
                    const matchedTeamSkills = team.skills?.filter((s) => userSkills.includes(s)) || [];
                    const teamMatchScore = team.skills?.length
                      ? Math.round((matchedTeamSkills.length / team.skills.length) * 100)
                      : 0;

                    return (
                      <Link
                        key={team.id}
                        href={`/teams/${team.id}`}
                        className="card p-5 group flex flex-col justify-between min-h-[150px]"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <h3 className="font-semibold text-sm text-white group-hover:text-white truncate">
                              {team.name}
                            </h3>
                            {teamMatchScore > 0 && (
                              <span className="text-[8px] font-mono font-semibold text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 rounded px-1.5 py-0.5">
                                ✨ {teamMatchScore}% Match
                              </span>
                            )}
                          </div>

                          <p className="text-zinc-400 text-xs leading-relaxed mb-4 line-clamp-2">
                            {team.description || "No description provided."}
                          </p>

                          {team.roles_needed?.length ? (
                            <div className="mb-4">
                              <span className="text-[9px] font-mono uppercase tracking-wide text-zinc-500 block mb-1">Roles Needed:</span>
                              <div className="flex flex-wrap gap-1">
                                {team.roles_needed.slice(0, 2).map((role) => (
                                  <span key={role} className="text-[8px] font-semibold bg-violet-600/10 border border-violet-500/20 text-violet-400 rounded px-1.5 py-0.5">
                                    {role}
                                  </span>
                                ))}
                                {team.roles_needed.length > 2 && (
                                  <span className="text-[8px] text-zinc-500">+{team.roles_needed.length - 2} more</span>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-zinc-900">
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
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                  ➕ Add Custom Resource Link
                </button>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              {/* Category 1: Boilerplates & Starters */}
              <div className="card card-static p-5 border-zinc-900 bg-zinc-950/20">
                <h3 className="text-sm font-semibold text-white mb-3.5 flex items-center gap-2 border-b border-zinc-900 pb-2">
                  🛠️ Boilerplates & Component Starter Kits
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
                            {res.title} <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                          </a>
                          <span className="text-[8px] font-mono text-zinc-600 block mt-0.5">AUTO-RECOMMENDED STARTER</span>
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
                            className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition-all flex items-center gap-1.5"
                          >
                            {res.title} <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                          </a>
                          <span className="text-[8px] font-mono text-zinc-650 block mt-0.5">POSTED BY ORGANIZER</span>
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
              <div className="card card-static p-5 border-zinc-900 bg-zinc-950/20">
                <h3 className="text-sm font-semibold text-white mb-3.5 flex items-center gap-2 border-b border-zinc-900 pb-2">
                  📚 Developer Docs & Sandbox APIs
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
                            {res.title} <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                          </a>
                          <span className="text-[8px] font-mono text-zinc-650 block mt-0.5">AUTO-RECOMMENDED GUIDE</span>
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
                            className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition-all flex items-center gap-1.5"
                          >
                            {res.title} <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                          </a>
                          <span className="text-[8px] font-mono text-zinc-600 block mt-0.5">POSTED BY ORGANIZER</span>
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

        {/* Tab CONTENT 7: Organizer Dashboard */}
        {activeTab === "organizer" && isOrganizer && (
          <div className="card card-static p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-base font-semibold text-white mb-0.5">Organizer Dashboard</h3>
                <p className="text-xs text-zinc-500">Manage registrants, exports, and status for {hackathon.name}.</p>
              </div>

              <button
                onClick={() => {
                  const headers = "Name,Email,College,Team,Registered At\n";
                  const rows = registrations
                    .map(
                      (r) =>
                        `"${r.profiles.full_name}","${r.profiles.email}","${r.profiles.college || ""}","${
                          r.teams?.name || ""
                        }","${r.created_at}"`
                    )
                    .join("\n");
                  
                  const blob = new Blob([headers + rows], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${hackathon.name.replace(/\s+/g, "_")}_registrants.csv`;
                  a.click();
                }}
                className="btn btn-primary btn-sm"
              >
                Export Registrants (.CSV)
              </button>
            </div>

            {/* Table */}
            {registrations.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-6">No registrants found to manage.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-900 text-zinc-500 font-mono uppercase tracking-wider">
                      <th className="py-2.5 pb-2">Name</th>
                      <th className="py-2.5 pb-2">Email</th>
                      <th className="py-2.5 pb-2">College</th>
                      <th className="py-2.5 pb-2">Team</th>
                      <th className="py-2.5 pb-2 text-right">Registration Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((reg) => (
                      <tr key={reg.id} className="border-b border-zinc-900/50 hover:bg-zinc-900/10">
                        <td className="py-3 font-semibold text-white">{reg.profiles.full_name}</td>
                        <td className="py-3 text-zinc-400">{reg.profiles.email}</td>
                        <td className="py-3 text-zinc-500">{reg.profiles.college || "N/A"}</td>
                        <td className="py-3 font-semibold text-primary-400">
                          {reg.teams ? (
                            <Link href={`/teams/${reg.teams.id}`} className="hover:underline">
                              {reg.teams.name}
                            </Link>
                          ) : (
                            <span className="text-zinc-650 font-normal italic">None</span>
                          )}
                        </td>
                        <td className="py-3 text-zinc-500 text-right">
                          {new Date(reg.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* MODAL: Add Resource Link */}
      {showAddResourceModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="card card-static p-5 w-full max-w-sm">
            <h3 className="text-sm font-semibold text-white mb-2">Add Custom Resource Link</h3>
            <form onSubmit={handleCreateResource} className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Resource Title</label>
                <input
                  type="text"
                  placeholder="e.g. Official Challenge Guide"
                  value={resourceTitle}
                  onChange={(e) => setResourceTitle(e.target.value)}
                  className="input text-xs w-full"
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
                  className="input text-xs w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Resource Category</label>
                <select
                  value={resourceCategory}
                  onChange={(e) => setResourceCategory(e.target.value as "boilerplates" | "apis" | "docs" | "other")}
                  className="input text-xs w-full"
                >
                  <option value="boilerplates">Boilerplates & Templates</option>
                  <option value="apis">Sandbox APIs / Datasets</option>
                  <option value="docs">Guides & Official Documentation</option>
                  <option value="other">Other Links</option>
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => setShowAddResourceModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingResource}
                  className="btn btn-primary btn-sm"
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-sm">
            <h2 className="text-sm font-semibold text-white mb-1.5">
              Confirm Registration
            </h2>

            <p className="text-xs text-zinc-400 mb-4">
              Register for {hackathon.name}. Choose if you are registering with an existing team.
            </p>

            <label className="section-label block mb-1.5">Register with Team (Optional)</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="input text-xs w-full mb-4"
            >
              <option value="">No team (Individual)</option>
              {userOwnedTeams
                .filter((t) => t.hackathon_id !== hackathon.id)
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} {team.hackathon_id ? " (Currently linked to another hackathon)" : ""}
                  </option>
                ))}
            </select>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
              <button
                onClick={() => setShowRegisterModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>

              <button
                onClick={handleRegisterNatively}
                disabled={inviteLoading}
                className="btn btn-primary btn-sm"
              >
                {inviteLoading ? "Registering..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Claim Team Status */}
      {showClaimModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-sm">
            <h2 className="text-sm font-semibold text-white mb-1.5">
              Link Team to Hackathon
            </h2>

            <p className="text-xs text-zinc-400 mb-4">
              If your team has registered externally, associate your HackerMate team with {hackathon.name} to recruit builders and collaborate.
            </p>

            <label className="section-label block mb-1.5">Select Team</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="input text-xs w-full mb-4"
            >
              <option value="">Choose your team</option>
              {userOwnedTeams
                .filter((t) => t.hackathon_id !== hackathon.id)
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} {team.hackathon_id ? " (Currently linked to another hackathon)" : ""}
                  </option>
                ))}
            </select>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
              <button
                onClick={() => setShowClaimModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>

              <button
                onClick={handleClaimTeam}
                disabled={!selectedTeam || inviteLoading}
                className="btn btn-primary btn-sm"
              >
                {inviteLoading ? "Linking..." : "Link Team"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Confirm External Registration */}
      {showExternalRegisterModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-sm">
            <h2 className="text-sm font-semibold text-white mb-1.5">
              Confirm External Registration
            </h2>

            <p className="text-xs text-zinc-400 mb-4 font-light leading-relaxed">
              We opened the registration page for <strong className="text-white font-semibold">{hackathon.name}</strong> in a new tab. Please complete your registration there, then confirm below to log your status on HackerMate.
            </p>

            <label className="section-label block mb-1.5">Register with Team (Optional)</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="input text-xs w-full mb-4"
            >
              <option value="">No team (Individual)</option>
              {userOwnedTeams
                .filter((t) => t.hackathon_id !== hackathon.id)
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} {team.hackathon_id ? " (Currently linked to another hackathon)" : ""}
                  </option>
                ))}
            </select>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
              <button
                onClick={() => {
                  setShowExternalRegisterModal(false);
                  setSelectedTeam("");
                }}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>

              <button
                onClick={handleRegisterExternallyConfirm}
                disabled={inviteLoading}
                className="btn btn-primary btn-sm"
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
    <AuthGuard>
      <HackathonDetailContent />
    </AuthGuard>
  );
}
