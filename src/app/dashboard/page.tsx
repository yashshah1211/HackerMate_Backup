"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
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
  hackathon_id: string;
  max_members?: number | null;
  memberCount?: number;
  hackathons: { name: string } | null;
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Custom dashboard data states
  const [spotlights, setSpotlights] = useState<Profile[]>([]);
  const [upcomingHackathons, setUpcomingHackathons] = useState<Hackathon[]>([]);
  const [activeTeams, setActiveTeams] = useState<Team[]>([]);
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);

  // Statistics counters
  const [stats, setStats] = useState({
    builders: 0,
    teams: 0,
    hackathons: 0,
    unread: 0,
  });

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 17) return "Good afternoon";
    return "Good evening";
  };

  async function loadDashboardData() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // 1. Fetch current profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData);

        // 2. Fetch all other profiles for compatibility calculation
        const { data: otherProfiles } = await supabase
          .from("profiles")
          .select("*")
          .neq("id", user.id);

        if (otherProfiles) {
          // Calculate score and sort
          const devsWithScore = otherProfiles.map((other) => {
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
        .select("team_id, teams(id, name, hackathon_id, max_members)")
        .eq("user_id", user.id);

      const { data: ownedTeams } = await supabase
        .from("teams")
        .select("id, name, hackathon_id, max_members")
        .eq("owner_id", user.id);

      // Extract unique teams
      const allTeamsMap = new Map<string, { id: string; name: string; hackathon_id: string; max_members: number | null }>();
      if (ownedTeams) {
        ownedTeams.forEach(t => allTeamsMap.set(t.id, t));
      }
      if (memberRows) {
        memberRows.forEach((m) => {
          if (m.teams) {
            const teamList = m.teams as unknown as { id: string; name: string; hackathon_id: string; max_members: number | null }[];
            const t = teamList[0];
            if (t) {
              allTeamsMap.set(t.id, t);
            }
          }
        });
      }
      const uniqueTeams = Array.from(allTeamsMap.values());

      // Fetch hackathon and member count details for these teams
      const teamsWithDetails = await Promise.all(uniqueTeams.map(async (t) => {
        const { count } = await supabase
          .from("team_members")
          .select("*", { count: "exact", head: true })
          .eq("team_id", t.id);

        let hackData = null;
        if (t.hackathon_id) {
          const { data } = await supabase
            .from("hackathons")
            .select("name")
            .eq("id", t.hackathon_id)
            .single();
          hackData = data;
        }
        return {
          ...t,
          hackathons: hackData,
          memberCount: count || 0,
        };
      }));

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
      const teamIds = uniqueTeams.map((team) => team.id);
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

  // Fallbacks for Teams list if empty
  const defaultActiveTeams = [
    { id: "t1", name: "Hack Warriors", memberCount: 4, max_members: 5, hackathons: { name: "Active" } },
    { id: "t2", name: "Project Nova", memberCount: 3, max_members: 5, hackathons: { name: "Active" } },
    { id: "t3", name: "Code Crafters", memberCount: 5, max_members: 5, hackathons: { name: "Active" } },
    { id: "t4", name: "InnovateX", memberCount: 2, max_members: 6, hackathons: { name: "Planning" } },
  ];

  const teamsToRender = activeTeams.length > 0 ? activeTeams : defaultActiveTeams;

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
              <p className="text-[9px] text-emerald-500 font-semibold mb-0">↗ +12 this week</p>
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
                {spotlights.map((dev, idx) => (
                  <div key={dev.id} className="flex items-center justify-between gap-4 p-2 rounded-lg hover:bg-zinc-900/10 transition-colors">
                    
                    {/* User profile layout */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* colored avatar circle matching mockup initials */}
                      <div className={`w-9 h-9 rounded-full border flex items-center justify-center font-bold text-xs shrink-0 ${avatarColors[idx % 4]}`}>
                        {dev.full_name.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="text-xs font-semibold text-white truncate leading-none">{dev.full_name}</h4>
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

                    {/* Match Score & Connect Button */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-bold text-white leading-none">{dev.compatibility || 96}%</p>
                        <p className="text-[8px] text-emerald-500 font-semibold uppercase leading-none mt-0.5">Match</p>
                      </div>
                      <Link href={`/profile/${dev.id}`} className="btn btn-secondary px-3 py-1.5 text-[9px] rounded-lg border border-zinc-800 bg-[#0E1017] hover:bg-zinc-900">
                        Connect
                      </Link>
                    </div>

                  </div>
                ))}
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
                  return (
                    <div key={hack.id} className="flex items-center justify-between gap-4">
                      
                      {/* Logo and metadata */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${logoColors[idx % 4]}`}>
                          {idx === 0 ? "🏆" : idx === 1 ? "🌐" : idx === 2 ? "💻" : "🛡️"}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-white truncate mb-0.5">{hack.name}</h4>
                          <p className="text-[9px] text-zinc-500 truncate uppercase tracking-wide">
                            {new Date(hack.start_date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} - {new Date(hack.end_date).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })} | {hack.location}
                          </p>
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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {teamsToRender.slice(0, 4).map((team, idx) => {
              const count = team.memberCount || 3;
              const max = team.max_members || 5;
              const percent = Math.min(Math.round((count / max) * 100), 100);
              
              return (
                <div key={team.id} className="bg-zinc-900/10 border border-zinc-900 rounded-xl p-4.5 flex flex-col justify-between min-h-[145px] hover:border-zinc-800 transition-all">
                  
                  {/* Icon & title */}
                  <div>
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center mb-3.5 shrink-0 ${teamColors[idx % 4]}`}>
                      {renderTeamIcon(idx)}
                    </div>
                    <h4 className="text-xs font-semibold text-white truncate mb-1">{team.name}</h4>
                    <p className="text-[9px] text-zinc-500 mb-4">{count} members • {team.hackathons?.name || "Active"}</p>
                  </div>

                  {/* Progress bar wrapper */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[9px] font-semibold text-zinc-500 font-mono">
                      <span>Capacity</span>
                      <span>{percent}%</span>
                    </div>
                    <div className="w-full bg-zinc-900 border border-zinc-800/40 h-1.5 rounded-full overflow-hidden">
                      <div className="progress-bar-fill h-full rounded-full" style={{ width: `${percent}%` }} />
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
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
              <div className="py-8 text-center">
                <p className="text-xs text-zinc-600 mb-1">No messages yet.</p>
                <Link href="/messages" className="text-[10px] text-violet-500 hover:text-violet-400 transition-colors underline underline-offset-2">
                  Start a conversation
                </Link>
              </div>
            )}
          </div>
        </div>

      </section>

      {/* Full-width call-to-action banner matching mockup style */}
      <section className="animate-fade-in-up stagger-4">
        <div
          className="relative overflow-hidden rounded-2xl border border-violet-500/20 p-8 flex flex-col md:flex-row md:items-center justify-between gap-6"
          style={{ background: "linear-gradient(to right, rgba(124,58,237,0.12), rgba(99,102,241,0.06), transparent)" }}
        >
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Build better together</h2>
            <p className="text-xs text-[var(--text-secondary)] max-w-lg leading-relaxed">Join a team or create your own and start building something amazing.</p>
          </div>
          <Link href="/teams" className="btn bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl text-xs font-semibold shrink-0 transition-colors">
            Explore Teams
          </Link>
          
          {/* Subtle background graphic */}
          <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-20 pointer-events-none" style={{ background: "radial-gradient(circle at bottom right, rgba(139,92,246,0.4), transparent)" }} />
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
