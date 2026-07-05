"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
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

type Team = {
  id: string;
  name: string;
  hackathon_id: string | null;
  max_members?: number | null;
  memberCount?: number;
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

      // 3. Fetch 4 nearest upcoming hackathons
      const today = new Date().toISOString().split("T")[0];
      const { data: hacks } = await supabase
        .from("hackathons")
        .select("*")
        .gte("end_date", today)
        .order("start_date", { ascending: true })
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
      interface TeamWithDetails {
        id: string;
        name: string;
        hackathon_id: string | null;
        max_members: number;
        owner_id: string;
        hackathons: { name: string } | null;
        memberCount: number;
      }
      let teamsWithDetails: TeamWithDetails[] = [];
      if (teamIds.length > 0) {
        const { data: batchTeams, error: batchErr } = await supabase
          .from("teams")
          .select("id, name, hackathon_id, max_members, owner_id, team_members(count), hackathons(name)")
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
            team_members: { count: number }[] | { count: number };
          }[]).map((d) => {
            const countObj = Array.isArray(d.team_members) ? d.team_members[0] : d.team_members;
            const memberCount = countObj ? countObj.count : 0;
            return {
              id: d.id,
              name: d.name,
              hackathon_id: d.hackathon_id,
              max_members: d.max_members,
              owner_id: d.owner_id,
              hackathons: d.hackathons,
              memberCount: memberCount || 0,
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
      )
      .subscribe();

    return () => {
      supabase.removeChannel(connectionChannel);
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

  const teamColors = [
    "from-indigo-500/20 to-indigo-600/5 border-indigo-500/20 text-indigo-400",
    "from-amber-500/20 to-amber-600/5 border-amber-500/20 text-amber-400",
    "from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400",
    "from-violet-500/20 to-violet-600/5 border-violet-500/20 text-violet-400"
  ];

  // Only render messages from DB - no hardcoded fallbacks
  const messagesToRender = recentMessages;

  // Initial colors for spotlight names matching mockup avatars
  const avatarColors = [
    "bg-amber-600/10 border-amber-500/20 text-amber-500",
    "bg-violet-600/10 border-violet-500/20 text-violet-500",
    "bg-blue-600/10 border-blue-500/20 text-blue-500",
    "bg-emerald-600/10 border-emerald-500/20 text-emerald-500"
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
    <main className="max-w-7xl mx-auto px-6 py-6 space-y-7">
      
      {/* Dynamic Greetings and Hero */}
      <section className="animate-fade-in-up">
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-1.5">
          {getGreeting()}, <span className="text-violet-500">{profile?.full_name?.split(" ")[0] || "Builder"}</span> 👋
        </h1>
        <p className="text-xs text-zinc-500 font-medium">Build together. Win together.</p>
      </section>



      {/* Dynamic Stats row */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-in-up stagger-1">
        
        {/* Stat 1: Builders in Network */}
        <div className="card card-static p-4.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0012 20.25a11.38 11.38 0 00-3-1.13v-.109m0-3.072a9.047 9.047 0 00-4.121.952 4.125 4.125 0 007.533 2.493M9 19.128v-.003c0-1.113.285-2.16.786-3.07M12 9.047a3.375 3.375 0 100-6.75 3.375 3.375 0 000 6.75zM12 9.047a3.374 3.374 0 00-2.492 1.096A3.49 3.49 0 0112 12a3.49 3.49 0 012.492-1.857A3.374 3.374 0 0012 9.047z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 font-mono uppercase mb-0.5 tracking-wider">Builders in Network</p>
              <h3 className="text-xl font-bold text-white mb-0.5">{stats.builders}</h3>
            </div>
          </div>
        </div>

        {/* Stat 2: Active Teams */}
        <div className="card card-static p-4.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 font-mono uppercase mb-0.5 tracking-wider">Teams Active</p>
              <h3 className="text-xl font-bold text-white mb-0.5">{stats.teams}</h3>
              <p className="text-[9px] text-emerald-500 font-semibold mb-0">● {stats.teams} ongoing projects</p>
            </div>
          </div>
        </div>

        {/* Stat 3: Hackathons Live */}
        <div className="card card-static p-4.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 font-mono uppercase mb-0.5 tracking-wider">Hackathons Live</p>
              <h3 className="text-xl font-bold text-white mb-0.5">{stats.hackathons}</h3>
              <p className="text-[9px] text-amber-500 font-semibold mb-0">⏰ 14 closing soon</p>
            </div>
          </div>
        </div>

      </section>

      {/* Middle Split Grid: Spotlights & Hackathons */}
      <section className="grid lg:grid-cols-[1.4fr_1fr] gap-6 animate-fade-in-up stagger-2">
        
        {/* Compatibility Spotlight Box */}
        <div className="card card-static p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold tracking-tight text-white uppercase font-mono text-xs">Compatibility Spotlight</h3>
              <Link href="/developers" className="text-[10px] text-zinc-500 hover:text-white transition-colors underline underline-offset-2 uppercase font-mono font-semibold">
                View all
              </Link>
            </div>

            {spotlights.length > 0 ? (
              <div className="space-y-3.5">
                {spotlights.map((dev, idx) => {
                  const connectionState =
                    connectionStates[dev.id] || "not_connected";

                  return (
                  <div
                    key={dev.id}
                    onClick={() => router.push(`/profile/${dev.id}`)}
                    className="flex items-center justify-between gap-4 p-2.5 -mx-1 rounded-xl border border-transparent hover:border-zinc-800/80 hover:bg-zinc-900/20 transition-all cursor-pointer group"
                  >
                    
                    {/* User profile layout */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* colored avatar circle */}
                      <div className={`w-9 h-9 rounded-full border flex items-center justify-center font-bold text-xs shrink-0 ${avatarColors[idx % 4]}`}>
                        {dev.full_name.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="text-xs font-semibold text-white truncate leading-none group-hover:text-violet-300 transition-colors">{dev.full_name}</h4>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        </div>
                        <p className="text-[10px] text-zinc-500 truncate mb-1">
                          {dev.skills && dev.skills.includes("Figma") ? "UI/UX Designer" : dev.skills && dev.skills.includes("TensorFlow") ? "ML Engineer" : "Full Stack Developer"}
                        </p>
                        
                        {/* Tags */}
                        {dev.skills && dev.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {dev.skills.slice(0, 3).map((skill) => (
                              <span key={skill} className="text-[8px] text-zinc-400 bg-zinc-900/30 border border-zinc-800/80 px-1.5 py-0.5 rounded">
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Match Score & Connect State */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-bold text-white leading-none">{dev.compatibility || 96}%</p>
                        <p className="text-[8px] text-emerald-500 font-semibold uppercase leading-none mt-0.5">Match</p>
                      </div>
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-[9px] font-semibold rounded-lg border transition-colors ${
                          connectionState === "request_sent"
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                            : connectionState === "connected"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                              : connectionState === "request_received"
                                ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                                : "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:text-white hover:border-zinc-700"
                        }`}
                      >
                        {connectionState === "connected" ? (
                          <>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            Connected
                          </>
                        ) : connectionState === "request_sent" ? (
                          <>
                            <svg className="w-3 h-3 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Sent
                          </>
                        ) : connectionState === "request_received" ? (
                          <>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                            Respond
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            Connect
                          </>
                        )}
                      </div>
                    </div>

                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center bg-[var(--surface-2)] border border-dashed border-[var(--card-border)] rounded-lg">
                <p className="text-xs text-[var(--text-muted)] mb-0">Explore developers in the builder network directory.</p>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Hackathons Box */}
        <div className="card card-static p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold tracking-tight text-[var(--text-primary)] uppercase font-mono text-xs">Upcoming Hackathons</h3>
              <Link href="/hackathons" className="text-[10px] text-zinc-500 hover:text-white transition-colors underline underline-offset-2 uppercase font-mono font-semibold">
                View all
              </Link>
            </div>

            {upcomingHackathons.length > 0 ? (
              <div className="space-y-4">
                {upcomingHackathons.map((hack, idx) => {
                  const logoColors = [
                    "bg-orange-500/10 border-orange-500/20 text-orange-400",
                    "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
                    "bg-red-500/10 border-red-500/20 text-red-400",
                    "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  ];
                  const timeline = getHackathonTimelineLabel(hack.start_date, hack.end_date);
                  const timelineCls = timeline.variant === "start"
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    : timeline.variant === "end"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : "bg-zinc-800/60 text-zinc-500 border-zinc-700/60";

                  return (
                    <div
                      key={hack.id}
                      onClick={() => router.push(`/hackathons/${hack.id}`)}
                      className="flex items-center justify-between gap-4 p-2 -mx-2 rounded-xl border border-transparent hover:border-zinc-800/80 hover:bg-zinc-900/20 transition-all cursor-pointer group"
                    >
                      
                      {/* Logo and metadata */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${logoColors[idx % 4]}`}>
                          {idx === 0 ? "🏆" : idx === 1 ? "🌐" : idx === 2 ? "💻" : "🛡️"}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-white truncate mb-0.5 group-hover:text-violet-300 transition-colors">{hack.name}</h4>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[9px] text-zinc-500 uppercase tracking-wide">
                              {new Date(hack.start_date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} – {new Date(hack.end_date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                            </p>
                            <span className={`text-[8px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded border ${timelineCls}`}>
                              {timeline.label}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Prize pool info */}
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-white leading-none">{hack.prize_pool || "Perks"}</p>
                        <p className="text-[8px] text-zinc-500 uppercase leading-none mt-1">Prize Pool</p>
                      </div>

                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center bg-[var(--surface-2)] border border-dashed border-[var(--card-border)] rounded-lg">
                <p className="text-xs text-[var(--text-muted)] mb-0">No active hackathon listings found.</p>
              </div>
            )}
          </div>
        </div>

      </section>

      {/* Bottom Split Grid: Your Teams & Messages */}
      <section className="grid lg:grid-cols-[2fr_1fr] gap-6 animate-fade-in-up stagger-3">
        
        {/* Your Teams deck */}
        <div className="card card-static p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold tracking-tight text-white uppercase font-mono text-xs">Your Teams</h3>
            <Link href="/my-teams" className="text-[10px] text-zinc-500 hover:text-white transition-colors underline underline-offset-2 uppercase font-mono font-semibold">
              View all
            </Link>
          </div>

          {activeTeams.length > 0 ? (
            <div className="space-y-6">
              {/* Teams You Lead */}
              <div>
                <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3 font-mono">Teams You Lead</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {(() => {
                    const owned = activeTeams.filter((t) => t.owner_id === currentUserId);
                    if (owned.length === 0) {
                      return (
                        <Link
                          href="/teams/create"
                          className="border border-dashed border-zinc-850 bg-zinc-950/20 hover:bg-zinc-900/10 hover:border-zinc-700 transition-all rounded-xl p-4.5 flex flex-col justify-center items-center text-center min-h-[145px] group"
                        >
                          <svg className="w-5 h-5 text-zinc-600 group-hover:text-violet-400 transition-colors mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          <span className="text-xs font-semibold text-zinc-400 group-hover:text-white transition-colors">Create a Team</span>
                          <span className="text-[9px] text-zinc-500 mt-1 leading-snug">Start your own project and recruit builders</span>
                        </Link>
                      );
                    }
                    return (
                      <>
                        {owned.slice(0, 2).map((team, idx) => {
                          const count = team.memberCount || 0;
                          const max = team.max_members || 5;
                          const percent = Math.min(Math.round((count / max) * 100), 100);
                          
                          return (
                            <div
                              key={team.id}
                              onClick={() => router.push(`/teams/${team.id}`)}
                              className="bg-zinc-900/10 border border-zinc-900 rounded-xl p-4.5 flex flex-col justify-between min-h-[145px] hover:border-zinc-800 hover:bg-zinc-900/20 transition-all cursor-pointer group"
                            >
                              <div>
                                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center mb-3.5 shrink-0 ${teamColors[idx % 4]}`}>
                                  {renderTeamIcon(idx)}
                                </div>
                                <h4 className="text-xs font-semibold text-white truncate mb-1 group-hover:text-violet-300 transition-colors">{team.name}</h4>
                                <p className="text-[9px] text-zinc-500 mb-4">{team.hackathons?.name || "Active"}</p>
                              </div>

                              <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-[9px] font-semibold text-zinc-500 font-mono">
                                  <span>{count} of {max} members</span>
                                  <span>{percent}%</span>
                                </div>
                                <div className="w-full bg-zinc-900 border border-zinc-800/40 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      percent >= 100
                                        ? "bg-emerald-500"
                                        : percent >= 60
                                          ? "bg-violet-500"
                                          : "bg-zinc-600"
                                    }`}
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {owned.length > 2 && (
                          <div
                            onClick={() => router.push("/my-teams")}
                            className="bg-zinc-900/10 border border-dashed border-zinc-800 rounded-xl p-4.5 flex flex-col justify-center items-center min-h-[145px] hover:border-zinc-700 hover:bg-zinc-900/20 transition-all cursor-pointer group text-center"
                          >
                            <span className="text-xl font-bold text-violet-400 font-mono">+{owned.length - 2}</span>
                            <span className="text-[10px] text-zinc-500 font-medium mt-1 uppercase tracking-wider font-mono">More Teams</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Teams You've Joined */}
              <div>
                <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3 font-mono">Teams You&apos;ve Joined</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {(() => {
                    const joined = activeTeams.filter((t) => t.owner_id !== currentUserId);
                    if (joined.length === 0) {
                      return (
                        <Link
                          href="/teams"
                          className="border border-dashed border-zinc-850 bg-zinc-950/20 hover:bg-zinc-900/10 hover:border-zinc-700 transition-all rounded-xl p-4.5 flex flex-col justify-center items-center text-center min-h-[145px] group"
                        >
                          <svg className="w-5 h-5 text-zinc-600 group-hover:text-indigo-400 transition-colors mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                          </svg>
                          <span className="text-xs font-semibold text-zinc-400 group-hover:text-white transition-colors">Join a Team</span>
                          <span className="text-[9px] text-zinc-500 mt-1 leading-snug">Explore existing teams looking for members</span>
                        </Link>
                      );
                    }
                    return (
                      <>
                        {joined.slice(0, 2).map((team, idx) => {
                          const count = team.memberCount || 0;
                          const max = team.max_members || 5;
                          const percent = Math.min(Math.round((count / max) * 100), 100);
                          
                          return (
                            <div
                              key={team.id}
                              onClick={() => router.push(`/teams/${team.id}`)}
                              className="bg-zinc-900/10 border border-zinc-900 rounded-xl p-4.5 flex flex-col justify-between min-h-[145px] hover:border-zinc-800 hover:bg-zinc-900/20 transition-all cursor-pointer group"
                            >
                              <div>
                                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center mb-3.5 shrink-0 ${teamColors[(idx + 2) % 4]}`}>
                                  {renderTeamIcon(idx + 2)}
                                </div>
                                <h4 className="text-xs font-semibold text-white truncate mb-1 group-hover:text-violet-300 transition-colors">{team.name}</h4>
                                <p className="text-[9px] text-zinc-500 mb-4">{team.hackathons?.name || "Active"}</p>
                              </div>

                              <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-[9px] font-semibold text-zinc-500 font-mono">
                                  <span>{count} of {max} members</span>
                                  <span>{percent}%</span>
                                </div>
                                <div className="w-full bg-zinc-900 border border-zinc-800/40 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      percent >= 100
                                        ? "bg-emerald-500"
                                        : percent >= 60
                                          ? "bg-violet-500"
                                          : "bg-zinc-600"
                                    }`}
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {joined.length > 2 && (
                          <div
                            onClick={() => router.push("/my-teams")}
                            className="bg-zinc-900/10 border border-dashed border-zinc-800 rounded-xl p-4.5 flex flex-col justify-center items-center min-h-[145px] hover:border-zinc-700 hover:bg-zinc-900/20 transition-all cursor-pointer group text-center"
                          >
                            <span className="text-xl font-bold text-indigo-400 font-mono">+{joined.length - 2}</span>
                            <span className="text-[10px] text-zinc-500 font-medium mt-1 uppercase tracking-wider font-mono">More Teams</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584.036-.219.05-.44.05-.666l.001-.03m11.911 0a9.1 9.1 0 00-11.911 0M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="text-center">
                <h4 className="text-xs font-semibold text-white mb-1">You&apos;re not in any teams yet</h4>
                <p className="text-[10px] text-zinc-500 max-w-[260px] leading-relaxed">
                  Join an existing team looking for members, or start your own and recruit builders.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/teams"
                  className="flex items-center gap-1.5 text-[10px] font-semibold px-3.5 py-2 rounded-lg border border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-300 transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z" />
                  </svg>
                  Browse Teams
                </Link>
                <Link
                  href="/teams/create"
                  className="flex items-center gap-1.5 text-[10px] font-semibold px-3.5 py-2 rounded-lg border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Create Team
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Recent Messages list */}
        <div className="card card-static p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold tracking-tight text-white uppercase font-mono text-xs">Recent Messages</h3>
              <Link href="/messages" className="text-[10px] text-zinc-500 hover:text-white transition-colors underline underline-offset-2 uppercase font-mono font-semibold">
                View all
              </Link>
            </div>

            {messagesToRender.length > 0 ? (
              <div className="space-y-3.5">
                {messagesToRender.map((msg) => (
                  <div key={msg.id} className="flex items-center justify-between gap-3 p-1 hover:bg-zinc-900/10 transition-colors rounded">
                    
                    {/* Sender details and snippet */}
                    <div className="flex items-center gap-3 min-w-0">
                      <DashboardAvatar src={msg.senderAvatar} name={msg.senderName} size="sm" />
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-white truncate leading-none mb-1">{msg.senderName}</h4>
                        <p className="text-[10px] text-zinc-500 truncate leading-none">{msg.content}</p>
                      </div>
                    </div>

                    {/* Message stats / indicator */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-[8px] font-semibold text-zinc-600 font-mono">{msg.timeLabel}</span>
                      {!msg.is_read ? (
                        <span className="w-4 h-4 rounded-full bg-violet-600 border border-violet-500/20 text-[9px] font-bold text-white flex items-center justify-center">1</span>
                      ) : (
                        <div className="w-1 h-1" />
                      )}
                    </div>

                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 flex flex-col items-center text-center">
                <div className="w-11 h-11 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-3">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.999 5.999 0 011.523-3.678C3.963 15.116 3 13.665 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                </div>
                <h4 className="text-xs font-semibold text-white mb-1">No messages yet</h4>
                <p className="text-[10px] text-zinc-500 max-w-[180px] leading-relaxed mb-3.5">
                  Reach out to compatible builders to collaborate on projects.
                </p>
                <Link
                  href="/developers"
                  className="text-[10px] font-semibold px-3 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors"
                >
                  Find Collaborators
                </Link>
              </div>
            )}
          </div>
        </div>

      </section>



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
