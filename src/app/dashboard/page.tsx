"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
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

type RecentActivity = {
  id: string;
  message: string;
  timeLabel: string;
  link?: string | null;
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

function DashboardContent() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Custom dashboard data states
  const [spotlights, setSpotlights] = useState<Profile[]>([]);
  const [collegeMates, setCollegeMates] = useState<Profile[]>([]);
  const [upcomingHackathons, setUpcomingHackathons] = useState<Hackathon[]>([]);
  const [activeTeams, setActiveTeams] = useState<Team[]>([]);
  const [connectionStates, setConnectionStates] = useState<
    Record<string, SpotlightConnectionState>
  >({});
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [profileCompleteness, setProfileCompleteness] = useState({ percent: 0, pendingTasks: [] as string[] });


  // Statistics counters
  const [stats, setStats] = useState({
    builders: 0,
    teams: 0,
    hackathons: 0,
    unread: 0,
    closingSoon: 0,
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


      await loadConnectionStates(user.id);

      // 1. Fetch current profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        if (!profileData.onboarding_completed) {
          router.push("/onboarding");
          return;
        }
        setProfile(profileData);

        // Calculate profile completeness
        let completenessScore = 0;
        const pending: string[] = [];
        if (profileData.full_name) {
          completenessScore += 20;
        } else {
          pending.push("Add your full name");
        }
        if (profileData.college) {
          completenessScore += 20;
        } else {
          pending.push("Select your college / university");
        }
        if (profileData.bio) {
          completenessScore += 20;
        } else {
          pending.push("Write a bio about yourself");
        }
        if (profileData.github_url) {
          completenessScore += 20;
        } else {
          pending.push("Connect your GitHub account");
        }
        if (profileData.skills && (profileData.skills as string[]).length > 0) {
          completenessScore += 20;
        } else {
          pending.push("Select your profile skills");
        }
        setProfileCompleteness({ percent: completenessScore, pendingTasks: pending });

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
            const mySkills = (profileData.skills as string[]) || [];
            const otherSkills = (other.skills as string[]) || [];

            // Jaccard similarity for skills (100% of score)
            let skillScore = 0;
            if (mySkills.length > 0 || otherSkills.length > 0) {
              const mySkillsLower = mySkills.map((s: string) => s.toLowerCase().trim());
              const otherSkillsLower = otherSkills.map((s: string) => s.toLowerCase().trim());
              const shared = otherSkillsLower.filter((s: string) => mySkillsLower.includes(s));
              const union = new Set([...mySkillsLower, ...otherSkillsLower]);

              if (union.size > 0) {
                skillScore = (shared.length / union.size) * 100;
              }
            }

            const compatibility = Math.max(5, Math.min(Math.round(skillScore), 99));
            return { ...other, compatibility };
          });

          // Sort by compatibility descending
          devsWithScore.sort((a, b) => b.compatibility - a.compatibility);
          setSpotlights(devsWithScore.slice(0, 4)); // Get top 4 compatible builders

          // Filter builders from the same college
          const myCollege = profileData.college ? profileData.college.toLowerCase().trim() : "";
          if (myCollege) {
            const mates = devsWithScore.filter(other => {
              if (!other.college) return false;
              const otherCollege = other.college.toLowerCase().trim();
              if (otherCollege === myCollege) return true;
              
              const getFirstWord = (s: string) => s.split(/[\s,()]+/)[0];
              const w1 = getFirstWord(myCollege);
              const w2 = getFirstWord(otherCollege);
              
              const acronyms = ["djsce", "spit", "vjti", "tsec", "vesit", "coep", "pict", "vit", "mit", "vnit"];
              if (acronyms.includes(w1) && w1 === w2) {
                return true;
              }
              
              return myCollege.includes(otherCollege) || otherCollege.includes(myCollege);
            });
            setCollegeMates(mates.slice(0, 4)); // Top 4 builders from the same college
          } else {
            setCollegeMates([]);
          }
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
        team_hackathons?: { hackathons: { name: string } | null }[];
        memberCount: number;
        members: TeamMember[];
      }
      let teamsWithDetails: TeamWithDetails[] = [];
      if (teamIds.length > 0) {
        const { data: batchTeams, error: batchErr } = await supabase
          .from("teams")
          .select("id, name, hackathon_id, max_members, owner_id, team_members(role, user_id, profiles(id, full_name, avatar_url)), team_hackathons(hackathons(name))")
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
            team_hackathons: { hackathons: { name: string } | null }[];
            team_members: TeamMember[];
          }[]).map((d) => {
            const members = d.team_members || [];
            const memberCount = members.length;
            const hackathonsData = d.team_hackathons && d.team_hackathons.length > 0
              ? d.team_hackathons[0].hackathons
              : null;
            return {
              id: d.id,
              name: d.name,
              hackathon_id: d.hackathon_id,
              max_members: d.max_members || 5,
              owner_id: d.owner_id,
              hackathons: hackathonsData,
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

      const { count: globalTeamsCount } = await supabase
        .from("teams")
        .select("*", { count: "exact", head: true });

      const sevenDaysFromNowDate = new Date();
      sevenDaysFromNowDate.setDate(sevenDaysFromNowDate.getDate() + 7);
      const sevenDaysFromNow = sevenDaysFromNowDate.toISOString().split("T")[0];

      const { count: closingSoonCount } = await supabase
        .from("hackathons")
        .select("*", { count: "exact", head: true })
        .gte("end_date", today)
        .lte("end_date", sevenDaysFromNow);

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
        teams: globalTeamsCount ?? 0,
        hackathons: liveHacksCount ?? 0,
        unread: unreadMsgCount,
        closingSoon: closingSoonCount ?? 0,
      });



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
    "linear-gradient(135deg,#3b82f6,#1d4ed8)",
    "linear-gradient(135deg,#8b5cf6,#6d28d9)",
    "linear-gradient(135deg,#10b981,#047857)",
    "linear-gradient(135deg,#f59e0b,#b45309)"
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
          <span className="dot"></span> {stats.hackathons} hackathons live · {stats.closingSoon} closing within 7 days
        </div>
      </div>

      <div className="header-row">
        <div className="greet">
          <h2>{getGreeting()}, <span>{profile?.full_name?.split(" ")[0] || "there"}</span></h2>
          <p>Here's what's happening in your network.</p>
        </div>
        <button className="cta-primary" onClick={() => router.push("/teams/create")}>+ Create a team</button>
      </div>

      <div className="stats-row">
        <div className="stat-card c1">
          <div className="stat-top">
            <div className="stat-label">Builders in network</div>
            <div className="stat-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
          </div>
          <div className="stat-value">{stats.builders} <span className="stat-trend">active</span></div>
          <div className="stat-sub">Grow this by connecting on <b className="cursor-pointer hover:underline" onClick={() => router.push("/developers")}>Builders</b></div>
        </div>
        <div className="stat-card c2">
          <div className="stat-top">
            <div className="stat-label">Teams active</div>
            <div className="stat-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z" /></svg>
            </div>
          </div>
          <div className="stat-value">{stats.teams}</div>
          <div className="stat-sub">{stats.teams} ongoing projects in progress</div>
        </div>
        <div className="stat-card c3">
          <div className="stat-top">
            <div className="stat-label">Hackathons live</div>
            <div className="stat-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
            </div>
          </div>
          <div className="stat-value">{stats.hackathons}</div>
          <div className="stat-sub"><b>{stats.closingSoon} closing</b> in the next 7 days</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Compatibility Spotlight</div>
            <div className="view-all" onClick={() => router.push("/developers")}>view all →</div>
          </div>

          {spotlights.length > 0 ? (
            spotlights.map((dev, idx) => {
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
                    <div className="match-pct">{dev.compatibility}%<span>match</span></div>
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
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 text-zinc-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.115a8.312 8.312 0 01-.115 1.342m0 0A8.284 8.284 0 017.747 18.25m8.312 2.22c.28-.654.443-1.373.443-2.128v-.079c0-1.428-.433-2.755-1.173-3.856M7.747 18.25a8.284 8.284 0 01-.115-1.342v-.003c0-1.43.433-2.758 1.173-3.859M7.747 18.25V18a8.312 8.312 0 01.115-1.342m0 0A8.284 8.284 0 0012 15.75m0 0c.928 0 1.815.153 2.642.435" /></svg>
              </div>
              <p className="text-zinc-500 text-xs">No compatible builders found</p>
              <p className="text-[10px] text-zinc-600 mt-1 max-w-[200px] mx-auto">Update your skills on your profile to find matching teammates.</p>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Builders from {profile?.college || "your college"}</div>
            <div className="view-all" onClick={() => router.push("/developers")}>view all →</div>
          </div>

          {collegeMates.length > 0 ? (
            collegeMates.map((dev, idx) => {
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
                  <div className="match-avatar" style={{ background: avatarColors[(idx + 2) % avatarColors.length] }}>
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
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 text-zinc-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.22 4 2.22V20" /></svg>
              </div>
              <p className="text-zinc-500 text-xs">No builders from your college found</p>
              <p className="text-[10px] text-zinc-600 mt-1 max-w-[200px] mx-auto">Make sure your college is set in your profile.</p>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Upcoming Hackathons</div>
            <div className="view-all" onClick={() => router.push("/hackathons")}>view all →</div>
          </div>

          {upcomingHackathons.length > 0 ? (
            upcomingHackathons.map((hack, idx) => {
              const timeline = hack.start_date && hack.end_date ? getHackathonTimelineLabel(hack.start_date, hack.end_date) : { label: "Ends soon", variant: "end" };
              const isUrgent = timeline.variant === "end" && (
                timeline.label.toLowerCase().includes("today") ||
                timeline.label.toLowerCase().includes("tomorrow") ||
                (timeline.label.toLowerCase().includes("ends in") && parseInt(timeline.label.replace(/\D/g, "")) <= 1)
              );
              const badgeClass = isUrgent ? "badge-urgent" : "badge-mid";

              return (
                <div
                  key={hack.id}
                  className="hack-row cursor-pointer hover:bg-white/[0.02] transition-colors rounded-xl px-2 -mx-2"
                  onClick={() => router.push(`/hackathons/${hack.id}`)}
                >
                  <div className="hack-icon">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
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
                    <div className="amt">
                      {hack.prize_pool
                        ? (hack.prize_pool.length > 25
                          ? `${hack.prize_pool.slice(0, 22)}...`
                          : hack.prize_pool)
                        : "Perks"}
                    </div>
                    <div className="lbl">{hack.prize_pool ? "PRIZE POOL" : "FOR WINNERS"}</div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 text-zinc-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-.875V10.5h1.5a3.75 3.75 0 100-7.5h-9a3.75 3.75 0 100 7.5h1.5v3.75h-.875c-.621 0-1.125.504-1.125 1.125v3.375m9 0h-9" /></svg>
              </div>
              <p className="text-zinc-500 text-xs">No upcoming hackathons</p>
              <p className="text-[10px] text-zinc-600 mt-1">Check back later for newly published events.</p>
            </div>
          )}
        </div>

        {profileCompleteness.percent < 100 ? (
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">Profile Strength</div>
              <div className="text-[10px] text-zinc-500 font-mono uppercase">{profileCompleteness.percent}% Complete</div>
            </div>

            <div className="flex flex-col gap-4 py-2">
              <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${profileCompleteness.percent}%` }}
                />
              </div>

              <div className="space-y-2 mt-2">
                <p className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">Recommended to complete:</p>
                {profileCompleteness.pendingTasks.map((task, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-zinc-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-800 shrink-0" />
                    <span>{task}</span>
                    <button
                      onClick={() => router.push("/profile/edit")}
                      className="ml-auto text-[10px] text-[#B4F461] hover:underline"
                    >
                      Add +
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">Hacker Status</div>
              <div className="text-[10px] text-zinc-500 font-mono uppercase">Verified All-Star</div>
            </div>
            
            <div className="flex flex-col items-center justify-center text-center py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
              </div>
              <p className="text-xs text-zinc-200 font-semibold">Your Profile is 100% Complete!</p>
              <p className="text-[10px] text-zinc-500 mt-1 max-w-[220px] leading-relaxed">
                You're ready to build. Your skills match maximum compatibility for team invitations and spotlights.
              </p>
              <button 
                onClick={() => router.push("/developers")}
                className="btn btn-primary btn-xs mt-4 py-1.5 px-4 font-mono text-[10px] uppercase"
              >
                Find Teammates →
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid-3">
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">My Teams</div>
              <div className="view-all" onClick={() => router.push("/my-teams")}>manage →</div>
            </div>

            {activeTeams.length > 0 ? (
              activeTeams.map((team) => {
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
                            background: percent <= 35 ? "var(--warning)" : "var(--accent)"
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
                        const stackColors = ["#3b82f6", "#8b5cf6", "#10b981"];
                        return (
                          <div
                            key={m.user_id}
                            style={{
                              background: stackColors[mIdx % stackColors.length],
                              color: "#fff"
                            }}
                          >
                            {initials}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 text-zinc-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z" /></svg>
                </div>
                <p className="text-zinc-500 text-xs">No active teams</p>
                <p className="text-[10px] text-zinc-600 mt-1">Create a team or request to join one to get started.</p>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">Recent Activity</div>
            </div>

            {recentActivities.length > 0 ? (
              recentActivities.map((act) => {
                const colors = ["var(--accent)", "var(--success)", "var(--warning)", "var(--danger)"];
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
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 text-zinc-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
                </div>
                <p className="text-zinc-500 text-xs">No recent activity</p>
                <p className="text-[10px] text-zinc-600 mt-1">Notifications and network matches will appear here.</p>
              </div>
            )}
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