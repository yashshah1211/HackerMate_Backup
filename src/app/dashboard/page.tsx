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
  const [upcomingHackathons, setUpcomingHackathons] = useState<Hackathon[]>([]);
  const [activeTeams, setActiveTeams] = useState<Team[]>([]);
  const [connectionStates, setConnectionStates] = useState<
    Record<string, SpotlightConnectionState>
  >({});
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);


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
    "linear-gradient(135deg,#FF6B8B,#B0304F)",
    "linear-gradient(135deg,#7C6FF0,#4A3FB0)",
    "linear-gradient(135deg,#B4F461,#6B7F3A)",
    "linear-gradient(135deg,#FFB627,#B8894A)"
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
          <h2>{getGreeting()}, <span>{profile?.full_name?.split(" ")[0] || "Yash"}</span> 👋</h2>
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
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <span className="text-zinc-600 text-lg mb-2">◎</span>
              <p className="text-zinc-500 text-xs font-mono">NO COMPATIBLE BUILDERS FOUND</p>
              <p className="text-[10px] text-zinc-600 mt-1 max-w-[200px] mx-auto">Update your skills on your profile to find matching teammates.</p>
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
              <span className="text-zinc-600 text-lg mb-2">🏆</span>
              <p className="text-zinc-500 text-xs font-mono">NO UPCOMING HACKATHONS</p>
              <p className="text-[10px] text-zinc-600 mt-1">Check back later for newly published events.</p>
            </div>
          )}
        </div>
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
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <span className="text-zinc-600 text-lg mb-2">⛊</span>
              <p className="text-zinc-500 text-xs font-mono">NO ACTIVE TEAMS</p>
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
              const colors = ["var(--accent-lime)", "var(--accent-indigo)", "var(--accent-amber)", "var(--accent-rose)"];
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
              <span className="text-zinc-600 text-lg mb-2">🔔</span>
              <p className="text-zinc-500 text-xs font-mono">NO RECENT ACTIVITY</p>
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