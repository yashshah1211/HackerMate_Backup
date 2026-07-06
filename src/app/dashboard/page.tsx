"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  college: string;
  bio: string;
  github_url: string;
  linkedin_url: string;
  avatar_url: string;
  skills: string[];
  created_at?: string;
  compatibility?: number;
};

type Hackathon = {
  id: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  location: string;
  mode: string;
  prize_pool: string;
  website_url: string;
  type: string;
};

type TeamMember = {
  role: string;
  user_id: string;
  profiles: {
    id: string;
    full_name: string;
    avatar_url: string;
  } | null;
};

type Team = {
  id: string;
  name: string;
  hackathon_id: string | null;
  max_members?: number | null;
  memberCount?: number;
  members?: TeamMember[];
  hackathons: { name: string } | null;
  owner_id?: string;
};

type RecentMessage = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  conversation_id: string;
  is_read: boolean;
  senderName: string;
  senderAvatar?: string;
  timeLabel: string;
};

type SpotlightConnectionState =
  | "not_connected"
  | "request_sent"
  | "request_received"
  | "connected";

function getHackathonTimelineLabel(startDateStr: string, endDateStr: string): { label: string; variant: "start" | "end" | "ended" } {
  const now = new Date();
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  now.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const startDiff = Math.round((start.getTime() - now.getTime()) / 86400000);
  const endDiff = Math.round((end.getTime() - now.getTime()) / 86400000);
  if (startDiff > 0) {
    return { label: startDiff === 1 ? "Starts tomorrow" : `Starts in ${startDiff}d`, variant: "start" };
  } else if (endDiff >= 0) {
    if (endDiff === 0) return { label: "Ends today", variant: "end" };
    return { label: endDiff === 1 ? "Ends tomorrow" : `Ends in ${endDiff}d`, variant: "end" };
  }
  return { label: "Ended", variant: "ended" };
}

function DashboardAvatar({ src, name, size = "md" }: { src?: string; name?: string; size?: "sm" | "md" | "lg" }) {
  const [error, setError] = useState(false);
  const fullName = name || "Builder";
  
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-14 h-14 text-lg font-bold"
  };

  const borderClasses = {
    sm: "border-zinc-900",
    md: "border-zinc-900",
    lg: "border-zinc-800"
  };

  const isValidUrl = src && (src.startsWith("http") || src.startsWith("/"));

  if (error || !isValidUrl) {
    return (
      <div className={`${sizeClasses[size]} rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center font-semibold text-zinc-400 shrink-0`}>
        {fullName.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={fullName}
      onError={() => setError(true)}
      className={`${sizeClasses[size]} rounded-lg object-cover border ${borderClasses[size]} shrink-0`}
    />
  );
}

function DashboardContent() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Custom dashboard data states
  const [spotlights, setSpotlights] = useState<Profile[]>([]);
  const [upcomingHackathons, setUpcomingHackathons] = useState<Hackathon[]>([]);
  const [activeTeams, setActiveTeams] = useState<Team[]>([]);
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);
  const [connectionStates, setConnectionStates] = useState<
    Record<string, SpotlightConnectionState>
  >({});
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setTheme((localStorage.getItem("theme") as "dark" | "light") || "dark");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.className = nextTheme;
  };

  // Statistics counters
  const [stats, setStats] = useState({
    builders: 0,
    teams: 0,
    hackathons: 0,
    unread: 0,
  });

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr >= 0 && hr < 5) return "Still grinding";
    if (hr < 12) return "Good morning";
    if (hr < 17) return "Good afternoon";
    return "Good evening";
  };

  async function loadConnectionStates(userId: string) {
    const { data, error } = await supabase
      .from("friend_requests")
      .select("sender_id, receiver_id, status")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    if (error) {
      console.error(error);
      return;
    }

    const nextStates: Record<string, SpotlightConnectionState> = {};
    (data || []).forEach((request) => {
      const otherUserId =
        request.sender_id === userId
          ? request.receiver_id
          : request.sender_id;

      if (request.status === "accepted") {
        nextStates[otherUserId] = "connected";
      } else if (request.status === "pending") {
        nextStates[otherUserId] =
          request.sender_id === userId
            ? "request_sent"
            : "request_received";
      }
    });

    setConnectionStates(nextStates);
  }

  async function loadDashboardData() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setCurrentUserId(user.id);

      await loadConnectionStates(user.id);

      // 1. Fetch current profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData);

        // Fetch user blocklists
        const blockedUserIds: string[] = [];
        const { data: myBlocks } = await supabase
          .from("blocked_users")
          .select("blocked_id")
          .eq("blocker_id", user.id);

        const { data: theirBlocks } = await supabase
          .from("blocked_users")
          .select("blocker_id")
          .eq("blocked_id", user.id);

        if (myBlocks) {
          blockedUserIds.push(...myBlocks.map((b) => b.blocked_id));
        }
        if (theirBlocks) {
          blockedUserIds.push(...theirBlocks.map((b) => b.blocker_id));
        }

        // 2. Fetch all other profiles for compatibility calculation
        const { data: otherProfiles } = await supabase
          .from("profiles")
          .select("*")
          .neq("id", user.id);

        if (otherProfiles) {
          // Filter out blocked users
          const filteredProfiles = otherProfiles.filter(
            (other) => !blockedUserIds.includes(other.id)
          );

          // Calculate score and sort
          const devsWithScore = filteredProfiles.map((other) => {
            let score = 30; // base
            if (
              profileData.college &&
              other.college &&
              profileData.college.toLowerCase().trim() === other.college.toLowerCase().trim()
            ) {
              score += 35;
            }
            if (profileData.skills && other.skills) {
              const shared = other.skills.filter((s: string) =>
                profileData.skills.map((sk: string) => sk.toLowerCase()).includes(s.toLowerCase())
              );
              score += shared.length * 12;
            }
            const compatibility = Math.min(score, 99);
            return { ...other, compatibility };
          });

          // Sort by compatibility descending
          devsWithScore.sort((a, b) => b.compatibility - a.compatibility);
          setSpotlights(devsWithScore.slice(0, 4)); // Get top 4 compatible builders
        }
      }

      // 3. Fetch 4 nearest upcoming hackathons closing soon
      const today = new Date().toISOString().split("T")[0];
      const { data: hacks } = await supabase
        .from("hackathons")
        .select("*")
        .gte("end_date", today)
        .order("end_date", { ascending: true })
        .limit(4);
      setUpcomingHackathons(hacks || []);

      // 4. Fetch active teams (where user is member OR owner)
      const { data: memberRows } = await supabase
        .from("team_members")
        .select("team_id, teams(id, name, hackathon_id, max_members, owner_id)")
        .eq("user_id", user.id);

      const { data: ownedTeams } = await supabase
        .from("teams")
        .select("id, name, hackathon_id, max_members, owner_id")
        .eq("owner_id", user.id);

      // Extract unique teams
      const allTeamsMap = new Map<string, { id: string; name: string; hackathon_id: string; max_members: number | null; owner_id?: string }>();
      if (ownedTeams) {
        ownedTeams.forEach(t => allTeamsMap.set(t.id, t));
      }
      if (memberRows) {
        memberRows.forEach((m) => {
          if (m.teams) {
            const rawTeams = m.teams;
            const t = Array.isArray(rawTeams)
              ? rawTeams[0]
              : (rawTeams as unknown as { id: string; name: string; hackathon_id: string; max_members: number | null; owner_id?: string });
            if (t) {
              allTeamsMap.set(t.id, t);
            }
          }
        });
      }
      const uniqueTeams = Array.from(allTeamsMap.values());

      // Fetch hackathon and member count details in a single query to avoid N+1 queries
      const teamIds = uniqueTeams.map((team) => team.id);
      interface TeamMember {
        role: string;
        user_id: string;
        profiles: {
          id: string;
          full_name: string;
          avatar_url: string;
        } | null;
      }
      interface TeamWithDetails {
        id: string;
        name: string;
        hackathon_id: string | null;
        max_members: number;
        owner_id: string;
        hackathons: { name: string } | null;
        memberCount: number;
        members: TeamMember[];
      }
      let teamsWithDetails: TeamWithDetails[] = [];
      if (teamIds.length > 0) {
        const { data: batchTeams, error: batchErr } = await supabase
          .from("teams")
          .select("id, name, hackathon_id, max_members, owner_id, team_members(role, user_id, profiles(id, full_name, avatar_url)), hackathons(name)")
          .in("id", teamIds);

        if (batchErr) {
          console.error("Error batch loading teams details:", batchErr);
        } else if (batchTeams) {
          teamsWithDetails = (batchTeams as unknown as {
            id: string;
            name: string;
            hackathon_id: string | null;
            max_members: number;
            owner_id: string;
            hackathons: { name: string } | null;
            team_members: TeamMember[];
          }[]).map((d) => {
            const members = d.team_members || [];
            const memberCount = members.length;
            return {
              id: d.id,
              name: d.name,
              hackathon_id: d.hackathon_id,
              max_members: d.max_members || 5,
              owner_id: d.owner_id,
              hackathons: d.hackathons,
              memberCount: memberCount || 0,
              members: members,
            };
          });
        }
      }

      setActiveTeams(teamsWithDetails);

      // 5. Fetch stats counters dynamically
      const { count: buildersCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      const { count: liveHacksCount } = await supabase
        .from("hackathons")
        .select("*", { count: "exact", head: true })
        .gte("end_date", today);

      // Fetch unread messages
      let conversationIds: string[] = [];
      if (teamIds.length > 0) {
        const { data: teamConversations } = await supabase
          .from("conversations")
          .select("id")
          .eq("type", "team")
          .in("team_id", teamIds);
        conversationIds = (teamConversations || []).map((conversation) => conversation.id);
      }
      let unreadMsgCount = 0;
      if (conversationIds.length > 0) {
        const { count: countMsgs } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .in("conversation_id", conversationIds)
          .neq("sender_id", user.id)
          .eq("is_read", false);
        unreadMsgCount = countMsgs || 0;
      }

      setStats({
        builders: buildersCount ?? 0,
        teams: teamsWithDetails.length,
        hackathons: liveHacksCount ?? 0,
        unread: unreadMsgCount,
      });

      // 7. Load Recent Messages
      if (conversationIds.length > 0) {
        const { data: messagesData } = await supabase
          .from("messages")
          .select("id, content, created_at, sender_id, conversation_id, is_read")
          .in("conversation_id", conversationIds)
          .neq("sender_id", user.id)
          .order("created_at", { ascending: false })
          .limit(3);

        if (messagesData && messagesData.length > 0) {
          const senderIds = Array.from(new Set(messagesData.map((m) => m.sender_id)));
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .in("id", senderIds);

          const profileMap: Record<string, Profile> = {};
          if (profilesData) {
            profilesData.forEach((p) => {
              profileMap[p.id] = p as Profile;
            });
          }

          const enrichedMessages = messagesData.map((m) => {
            const sender = profileMap[m.sender_id];
            const diffMs = Date.now() - new Date(m.created_at).getTime();
            const diffMin = Math.round(diffMs / (1000 * 60));
            const timeLabel = diffMin < 60 ? `${diffMin}m` : diffMin < 1440 ? `${Math.round(diffMin / 60)}h` : `${Math.round(diffMin / 1440)}d`;

            return {
              ...m,
              senderName: sender?.full_name || "Builder",
              senderAvatar: sender?.avatar_url,
              timeLabel,
            };
          });

          setRecentMessages(enrichedMessages);
        }
      }

      // 8. Fetch recent notifications for Recent Activity
      const { data: notifsData } = await supabase
        .from("notifications")
        .select("id, message, created_at, link")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(4);

      if (notifsData) {
        const enrichedActivities = notifsData.map((n) => {
          const diffMs = Date.now() - new Date(n.created_at).getTime();
          const diffMin = Math.round(diffMs / (1000 * 60));
          const timeLabel = diffMin < 1 ? "Just now" : diffMin < 60 ? `${diffMin}m ago` : diffMin < 1440 ? `${Math.round(diffMin / 60)}h ago` : `${Math.round(diffMin / 1440)}d ago`;
          return {
            ...n,
            timeLabel,
          };
        });
        setRecentActivities(enrichedActivities);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      loadDashboardData();
    });

    const connectionChannel = supabase
      .channel("dashboard-connections")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
        },
        async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            await loadConnectionStates(user.id);
          }
        }
      );

    const unsubscribe = subscribeWithRetry(connectionChannel);

    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Predefined icons list helper for active teams matching mockup aesthetics
  const renderTeamIcon = (index: number) => {
    switch (index % 4) {
      case 0:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25M21 5.25A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
          </svg>
        );
      case 1:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-2.2 2.2m2.2-2.2a6 6 0 00-2.2-2.2m2.2 2.2h.01M13.39 16.57a6 6 0 01-2.2-2.2m2.2 2.2v.01m-2.2-2.21a6 6 0 00-2.2 2.2m2.2-2.2h.01m-2.2 2.2v.01m-6.13-1.64c-.168-.168-.344-.333-.526-.496A13.064 13.064 0 002.25 8.553a.75.75 0 011.047-.685l3.226 1.29a2.25 2.25 0 001.696-.06l6.81-3.405a2.25 2.25 0 011.696-.06l3.226 1.29a.75.75 0 01.378.926 13.065 13.065 0 01-5.114 6.81 2.25 2.25 0 00-.06 1.696l1.29 3.226a.75.75 0 01-.685 1.047 13.063 13.063 0 01-5.17-5.109 2.25 2.25 0 00-1.696-.06l-3.226 1.29a.75.75 0 01-.926-.378z" />
          </svg>
        );
      case 2:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v3m0 0h.01m-3.01-3h6.02m-.02-3.001A6 6 0 106 11.999c0 1.201.353 2.302.964 3.229l.006.01c.217.332.327.728.327 1.134v.53a1.125 1.125 0 001.125 1.125h5.122a1.125 1.125 0 001.125-1.125v-.53a1.127 1.127 0 00.327-1.135l.006-.009a6.002 6.002 0 00.963-3.228z" />
          </svg>
        );
    }
  };

  const formatActivityText = (text: string) => {
    let formatted = text;
    const keywords = ["matched with", "pushed a", "sent you", "accepted your", "invited you", "created task", "registration closes", "created a team"];
    for (const kw of keywords) {
      if (text.includes(kw)) {
        const parts = text.split(kw);
        formatted = `<b>${parts[0].trim()}</b> ${kw} ${parts.slice(1).join(kw)}`;
        break;
      }
    }
    return formatted;
  };

  const avatarColors = [
    "linear-gradient(135deg,#FF6B8B,#B0304F)",
    "linear-gradient(135deg,#7C6FF0,#4A3FB0)",
    "linear-gradient(135deg,#B4F461,#6B7F3A)",
    "linear-gradient(135deg,#FFB627,#B8894A)"
  ];

  const spotlightsToRender = spotlights.length > 0 ? spotlights : [
    {
      id: "fallback-lucky",
      full_name: "Lucky",
      skills: ["Java", "C++", "Python"],
      compatibility: 54,
      avatar_url: ""
    },
    {
      id: "fallback-riya",
      full_name: "Riya Kapoor",
      skills: ["Figma", "React"],
      compatibility: 71,
      avatar_url: ""
    }
  ];

  const hackathonsToRender = upcomingHackathons.length > 0 ? upcomingHackathons : [
    {
      id: "fallback-hack-1",
      name: "Clash of Coders 3.0",
      start_date: "2026-02-15",
      end_date: "2026-08-23",
      prize_pool: "₹50,000"
    },
    {
      id: "fallback-hack-2",
      name: "LinkHub",
      start_date: "2026-02-26",
      end_date: "2026-02-28",
      prize_pool: "Certificate"
    },
    {
      id: "fallback-hack-3",
      name: "NLP Tool for Maharashtra Govt",
      start_date: "2026-02-27",
      end_date: "2026-08-22",
      prize_pool: "₹15,000"
    },
    {
      id: "fallback-hack-4",
      name: "Pre-Placement Interview Sprint",
      start_date: "2026-03-04",
      end_date: "2026-07-22",
      prize_pool: "Interviews"
    }
  ];

  const teamsToRender = activeTeams.length > 0 ? activeTeams : [
    {
      id: "fallback-team-1",
      name: "HackerMate Core",
      hackathons: { name: "Clash of Coders 3.0" },
      max_members: 5,
      memberCount: 3,
      members: [
        { user_id: "m1", role: "owner", profiles: { id: "m1", full_name: "Yash Shah", avatar_url: "" } },
        { user_id: "m2", role: "member", profiles: { id: "m2", full_name: "Lucky", avatar_url: "" } },
        { user_id: "m3", role: "member", profiles: { id: "m3", full_name: "Riya Kapoor", avatar_url: "" } }
      ]
    },
    {
      id: "fallback-team-2",
      name: "NLP Solvers",
      hackathons: { name: "NLP Tool for Govt" },
      max_members: 5,
      memberCount: 2,
      members: [
        { user_id: "m1", role: "owner", profiles: { id: "m1", full_name: "Yash Shah", avatar_url: "" } },
        { user_id: "m4", role: "member", profiles: { id: "m4", full_name: "Aman", avatar_url: "" } }
      ]
    }
  ];

  const activitiesToRender = recentActivities.length > 0 ? recentActivities : [
    {
      id: "fallback-act-1",
      message: "Riya Kapoor matched with you at 71% compatibility",
      timeLabel: "12 minutes ago"
    },
    {
      id: "fallback-act-2",
      message: "Lucky pushed a standup update in HackerMate Core",
      timeLabel: "2 hours ago"
    },
    {
      id: "fallback-act-3",
      message: "Clash of Coders 3.0 registration closes in 48 days",
      timeLabel: "Today"
    },
    {
      id: "fallback-act-4",
      message: "You created task board for NLP Solvers",
      timeLabel: "Yesterday"
    }
  ];

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-zinc-800 border-t-violet-500 rounded-full animate-spin mb-4" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Loading workspace...</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="topbar">
        <div className="ticker">
          <span className="dot"></span> {stats.hackathons || 97} hackathons live · 14 closing within 7 days
        </div>
        <div className="top-actions hidden md:flex">
          <button className="icon-btn" onClick={toggleTheme}>
            {theme === "dark" ? "☀" : "🌙"}
          </button>
          <button className="icon-btn" onClick={() => router.push("/notifications")}>
            🔔
          </button>
        </div>
      </div>

      <div className="header-row">
        <div className="greet">
          <h2>Good afternoon, <span>{profile?.full_name?.split(" ")[0] || "Yash"}</span> 👋</h2>
          <p>&gt; build_together --win-together</p>
        </div>
        <button className="cta-primary" onClick={() => router.push("/teams/create")}>+ Create a team</button>
      </div>

      <div className="stats-row">
        <div className="stat-card c1">
          <div className="stat-top">
            <div className="stat-label">BUILDERS IN NETWORK</div>
            <div className="stat-icon">◎</div>
          </div>
          <div className="stat-value">{stats.builders} <span className="stat-trend">live matching</span></div>
          <div className="stat-sub">Grow this by connecting on <b className="cursor-pointer hover:underline" onClick={() => router.push("/developers")}>Builders</b></div>
        </div>
        <div className="stat-card c2">
          <div className="stat-top">
            <div className="stat-label">TEAMS ACTIVE</div>
            <div className="stat-icon">⛊</div>
          </div>
          <div className="stat-value">{stats.teams}</div>
          <div className="stat-sub">{stats.teams} ongoing projects in progress</div>
        </div>
        <div className="stat-card c3">
          <div className="stat-top">
            <div className="stat-label">HACKATHONS LIVE</div>
            <div className="stat-icon">🔥</div>
          </div>
          <div className="stat-value">{stats.hackathons}</div>
          <div className="stat-sub"><b>14 closing</b> in the next 7 days</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Compatibility Spotlight</div>
            <div className="view-all" onClick={() => router.push("/developers")}>view all →</div>
          </div>

          {spotlightsToRender.map((dev, idx) => {
            const connectionState = connectionStates[dev.id] || "not_connected";
            const initials = dev.full_name
              ? dev.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
              : "U";

            return (
              <div 
                key={dev.id} 
                className="match-row cursor-pointer hover:bg-white/[0.02] transition-colors rounded-xl px-2 -mx-2"
                onClick={() => router.push(`/profile/${dev.id}`)}
              >
                <div className="match-avatar" style={{ background: avatarColors[idx % avatarColors.length] }}>
                  {initials}
                  <span className="status-dot" style={connectionState === "not_connected" ? { background: "var(--text-faint)" } : {}}></span>
                </div>
                <div className="match-info">
                  <div className="name">{dev.full_name}</div>
                  <div className="role">
                    {dev.skills && dev.skills.includes("Figma") ? "Product Designer" : dev.skills && dev.skills.includes("TensorFlow") ? "ML Engineer" : "Full Stack Developer"}
                  </div>
                  <div className="match-skills">
                    {dev.skills?.slice(0, 3).map((skill) => (
                      <span key={skill} className="skill-chip">{skill}</span>
                    ))}
                  </div>
                </div>
                <div className="match-right">
                  <div className="match-pct">{dev.compatibility || 75}%<span>MATCH</span></div>
                  {connectionState === "connected" ? (
                    <div className="btn-connected">✓ Connected</div>
                  ) : connectionState === "request_sent" ? (
                    <div className="btn-connected" style={{ color: "var(--accent-amber)", borderColor: "rgba(255,182,39,0.3)", background: "rgba(255,182,39,0.1)" }}>Sent</div>
                  ) : connectionState === "request_received" ? (
                    <button
                      className="btn-connect"
                      style={{ background: "var(--accent-indigo)" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/profile/${dev.id}`);
                      }}
                    >
                      Respond
                    </button>
                  ) : (
                    <button
                      className="btn-connect"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/profile/${dev.id}`);
                      }}
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Upcoming Hackathons</div>
            <div className="view-all" onClick={() => router.push("/hackathons")}>view all →</div>
          </div>

          {hackathonsToRender.map((hack, idx) => {
            const timeline = hack.start_date && hack.end_date ? getHackathonTimelineLabel(hack.start_date, hack.end_date) : { label: "Ends soon", variant: "end" };
            const isUrgent = timeline.variant === "end" && timeline.label.toLowerCase().includes("ends in") && parseInt(timeline.label.replace(/\D/g, "")) <= 7;
            const badgeClass = isUrgent ? "badge-urgent" : "badge-mid";

            return (
              <div 
                key={hack.id} 
                className="hack-row cursor-pointer hover:bg-white/[0.02] transition-colors rounded-xl px-2 -mx-2"
                onClick={() => router.push(`/hackathons/${hack.id}`)}
              >
                <div className="hack-icon" style={{ background: idx === 0 ? "rgba(255,182,39,0.12)" : idx === 1 ? "rgba(124,111,240,0.12)" : idx === 2 ? "rgba(255,107,139,0.12)" : "rgba(180,244,97,0.12)" }}>
                  {idx === 0 ? "🏆" : idx === 1 ? "🌐" : idx === 2 ? "💻" : "🛡️"}
                </div>
                <div className="hack-info">
                  <div className="title">{hack.name}</div>
                  <div className="hack-meta">
                    <span className="dates">
                      {hack.start_date ? new Date(hack.start_date).toLocaleDateString("en-US", { day: "numeric", month: "short" }).toUpperCase() : "TBD"} – {hack.end_date ? new Date(hack.end_date).toLocaleDateString("en-US", { day: "numeric", month: "short" }).toUpperCase() : "TBD"}
                    </span>
                    {timeline.label !== "Ended" && (
                      <span className={`badge-closing ${badgeClass}`}>
                        {timeline.label.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="hack-prize">
                  <div className="amt">{hack.prize_pool || "Perks"}</div>
                  <div className="lbl">{hack.prize_pool ? "PRIZE POOL" : "FOR WINNERS"}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid-3">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">My Teams</div>
            <div className="view-all" onClick={() => router.push("/my-teams")}>manage →</div>
          </div>

          {teamsToRender.map((team, idx) => {
            const count = team.memberCount || 0;
            const max = team.max_members || 5;
            const percent = Math.min(Math.round((count / max) * 100), 100);

            return (
              <div 
                key={team.id} 
                className="team-card cursor-pointer hover:bg-white/[0.01] transition-colors rounded-xl px-2 -mx-2"
                onClick={() => router.push(`/teams/${team.id}`)}
              >
                <div style={{ flex: 1 }}>
                  <div className="team-name">{team.name}</div>
                  <div className="team-progress-track">
                    <div 
                      className="team-progress-fill" 
                      style={{ 
                        width: `${percent}%`,
                        background: percent <= 35 ? "var(--accent-amber)" : "var(--accent-lime)"
                      }}
                    ></div>
                  </div>
                  <div className="team-meta">{percent}% tasks done · {team.hackathons?.name || "Active Project"}</div>
                </div>
                <div className="stack-avatars">
                  {team.members?.slice(0, 3).map((m, mIdx) => {
                    const initials = m.profiles?.full_name
                      ? m.profiles.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                      : "?";
                    const stackColors = ["#7C6FF0", "#FF6B8B", "#B4F461"];
                    const isLime = stackColors[mIdx % stackColors.length] === "#B4F461";
                    return (
                      <div 
                        key={m.user_id} 
                        style={{ 
                          background: stackColors[mIdx % stackColors.length],
                          color: isLime ? "#0A0D12" : "#fff"
                        }}
                      >
                        {initials}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Recent Activity</div>
          </div>

          {activitiesToRender.map((act) => {
            const colors = ["var(--accent-lime)", "var(--accent-indigo)", "var(--accent-amber)", "var(--accent-rose)"];
            // pick color based on index or code hash
            const randColor = colors[Math.abs(act.id.split("").reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0)) % colors.length];

            return (
              <div key={act.id} className="activity-item">
                <div className="activity-dot" style={{ background: randColor }}></div>
                <div>
                  <div className="activity-text" dangerouslySetInnerHTML={{ __html: formatActivityText(act.message) }} />
                  <div className="activity-time">{act.timeLabel}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
