"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import Link from "next/link";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";

import QuickOnboardingModal from "@/components/QuickOnboardingModal";
import { calculateProfileCompleteness } from "@/lib/profileCompleteness";
import MatchReasoningBadge from "@/components/MatchReasoningBadge";
import PartnerBannerCarousel from "@/components/PartnerBannerCarousel";
import TeamWorkspaceSpotlightBanner from "@/components/TeamWorkspaceSpotlightBanner";
import StreakWidget from "@/components/StreakWidget";
import { getInitials } from "@/lib/utils";
import { SIH_HACKATHON_ID } from "@/lib/constants";
import { LANDING_TOKENS } from "@/lib/design-tokens";

type Profile = {
  id: string;
  email?: string | null;

  full_name: string;
  college: string;
  bio: string;
  github_url: string;
  linkedin_url: string;
  avatar_url: string;
  skills: string[];
  onboarding_completed?: boolean;
  created_at?: string;
  compatibility?: number;
  shared_skills?: string[];
  same_college?: boolean;
  current_streak?: number;
  longest_streak?: number;
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
  currency?: string;
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
  hackathons: { id?: string; name: string; type?: string | null; tags?: string[] | null } | null;
  team_hackathons?: { hackathon_id: string; hackathons: { id: string; name: string; type?: string | null; tags?: string[] | null } | null }[];
  owner_id?: string;
};

export type TeamCategory = "sih" | "project" | "hackathon";

export function getTeamCategoryInfo(team: {
  hackathon_id?: string | null;
  hackathons?: { id?: string; name?: string; type?: string | null; tags?: string[] | null } | null;
  team_hackathons?: { hackathon_id: string; hackathons: { id?: string; name?: string; type?: string | null; tags?: string[] | null } | null }[];
}): {
  category: TeamCategory;
  tag: "SIH" | "PROJECT" | "HACKATHON";
  eventName: string;
} {
  const hackathon = team.team_hackathons?.[0]?.hackathons || team.hackathons;
  const targetHackathonId = team.team_hackathons?.[0]?.hackathon_id || team.hackathon_id;

  // 1. Primary: Exact relational UUID check for SIH
  if (targetHackathonId === SIH_HACKATHON_ID || hackathon?.id === SIH_HACKATHON_ID) {
    return {
      category: "sih",
      tag: "SIH",
      eventName: hackathon?.name || "Smart India Hackathon 2026 (SIH internal round)",
    };
  }

  // 2. Primary: Relational hackathon.type check
  if (hackathon?.type) {
    if (hackathon.type === "external" || hackathon.type === "partner") {
      return {
        category: "hackathon",
        tag: "HACKATHON",
        eventName: hackathon.name || "External Hackathon",
      };
    }
    if (hackathon.type === "native") {
      return {
        category: "project",
        tag: "PROJECT",
        eventName: hackathon.name || "Active project",
      };
    }
  }

  // 3. Primary: No hackathon linked = Native / Independent project
  if (!targetHackathonId && !hackathon) {
    return {
      category: "project",
      tag: "PROJECT",
      eventName: "Active project",
    };
  }

  // 4. Last-resort fallback if custom record lacks both ID and type
  const hackName = hackathon?.name || "";
  if (/smart india hackathon|sih/i.test(hackName) || hackathon?.tags?.some((t) => /sih/i.test(t))) {
    return {
      category: "sih",
      tag: "SIH",
      eventName: hackName || "Smart India Hackathon 2026",
    };
  }

  return {
    category: "hackathon",
    tag: "HACKATHON",
    eventName: hackName || "Hackathon",
  };
}


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
  const [activeTeams, setActiveTeams] = useState<Team[]>([]);
  const [connectionStates, setConnectionStates] = useState<
    Record<string, SpotlightConnectionState>
  >({});
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [profileCompleteness, setProfileCompleteness] = useState({ percent: 0, pendingTasks: [] as string[] });
  const [showQuickOnboardingModal, setShowQuickOnboardingModal] = useState(false);

  // Academic Year Confirmation Banner state
  const [yearDismissed, setYearDismissed] = useState(true);
  const [selectedYear, setSelectedYear] = useState("2nd Year");
  const [savingYear, setSavingYear] = useState(false);


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

  async function handleConfirmYear() {
    if (!profile) return;
    setSavingYear(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ year_of_study: selectedYear })
        .eq("id", profile.id);

      if (error) {
        console.warn("Could not save year_of_study to DB:", error);
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(`year_confirmed_${profile.id}`, "true");
      }
      setProfile((prev) => (prev ? ({ ...prev, year_of_study: selectedYear } as any) : prev));
      setYearDismissed(true);
    } catch (err) {
      console.error(err);
      if (typeof window !== "undefined") {
        localStorage.setItem(`year_confirmed_${profile.id}`, "true");
      }
      setYearDismissed(true);
    } finally {
      setSavingYear(false);
    }
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
        .select("id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, sih_broadcast_sent_at, username, show_track_record, current_streak, longest_streak")
        .eq("id", user.id)
        .single();

      if (profileData) {
        if (!profileData.onboarding_completed) {
          router.push("/onboarding");
          return;
        }
        setProfile(profileData);

        // Check if academic year was confirmed by user
        const isConfirmed = typeof window !== "undefined" && localStorage.getItem(`year_confirmed_${user.id}`) === "true";
        if (!isConfirmed) {
          setYearDismissed(false);
          setSelectedYear((profileData as any).year_of_study || "2nd Year");
        }

        // Calculate profile completeness using shared helper
        const comp = calculateProfileCompleteness(profileData);
        const pending: string[] = comp.missingFields.map((f) => `Add / set ${f.label}`);
        setProfileCompleteness({ percent: comp.score, pendingTasks: pending });


        // 2. Fetch compatible builders via server-side matchmaking RPC.
        // Replaces the previous full-table profiles download; blocked users,
        // banned accounts and non-onboarded builders are excluded in SQL.
        // Same Jaccard skill score + same-college matcher as before,
        // computed in Postgres (get_recommended_teammates).
        const { data: recommended, error: matchErr } = await supabase.rpc(
          "get_recommended_teammates",
          { p_user_id: user.id, p_limit: 50 }
        );
        if (matchErr) {
          console.error("Matchmaking RPC failed:", matchErr);
        }

        const devsWithScore = (recommended ?? []) as Profile[];

        setSpotlights(devsWithScore.slice(0, 6)); // Get top 6 compatible builders

        // Same-college builders first (flag computed server-side), backfilled
        // up to 6 with the most-compatible remaining builders.
        const mates = devsWithScore.filter((d) => d.same_college);
        const mateIds = new Set(mates.map((m) => m.id));
        const fallbackDevs = devsWithScore.filter((d) => !mateIds.has(d.id));
        setCollegeMates([...mates, ...fallbackDevs].slice(0, 6));
      }

      // 3. Fetch 4 nearest upcoming hackathons closing soon (Relocated profile completion)

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
        max_members: number | null;
        owner_id: string;
        hackathons: { id?: string; name: string; type?: string | null; tags?: string[] | null } | null;
        team_hackathons?: { hackathon_id: string; hackathons: { id: string; name: string; type?: string | null; tags?: string[] | null } | null }[];
        memberCount: number;
        members: TeamMember[];
      }
      let teamsWithDetails: TeamWithDetails[] = [];
      if (teamIds.length > 0) {
        const { data: batchTeams, error: batchErr } = await supabase
          .from("teams")
          .select("id, name, hackathon_id, max_members, owner_id, team_members(role, user_id, profiles(id, full_name, avatar_url)), team_hackathons(hackathon_id, hackathons(id, name, type, tags))")
          .in("id", teamIds);

        if (batchErr) {
          console.error("Error batch loading teams details:", batchErr);
        } else if (batchTeams) {
          teamsWithDetails = (batchTeams as unknown as {
            id: string;
            name: string;
            hackathon_id: string | null;
            max_members: number | null;
            owner_id: string;
            team_hackathons: { hackathon_id: string; hackathons: { id: string; name: string; type?: string | null; tags?: string[] | null } | null }[];
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
              max_members: typeof d.max_members === "number" ? d.max_members : null,
              owner_id: d.owner_id,
              hackathons: hackathonsData,
              team_hackathons: d.team_hackathons,
              memberCount: memberCount || 0,
              members: members,
            };
          });
        }
      }


      setActiveTeams(teamsWithDetails);

      const today = new Date().toISOString().split("T")[0];

      // 5. Fetch stats counters dynamically
      const { count: buildersCount } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });


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
    "linear-gradient(135deg,#2c4a6e,#1a2d45)", // muted slate-blue
    "linear-gradient(135deg,#4a2c6e,#2d1a45)", // muted plum/mauve
    "linear-gradient(135deg,#6e4a2c,#452d1a)", // muted tawny/amber-brown
    "linear-gradient(135deg,#2c6e4a,#1a4530)", // muted forest/sage
  ];

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-zinc-800 border-t-[#B4F461] rounded-full animate-spin mb-4" />
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
          {!yearDismissed ? (
            <div className="flex items-center gap-2 mt-1.5 p-1.5 px-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-xs text-zinc-300 w-fit animate-fade-in-up">
              <span className="text-zinc-400 font-mono font-semibold text-[11px]">🎓 Confirm Year:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white text-[11px] px-2 py-0.5 rounded cursor-pointer focus:border-zinc-600 font-mono"
              >
                <option value="1st Year">1st Year (Fresher)</option>
                <option value="2nd Year">2nd Year (Sophomore)</option>
                <option value="3rd Year">3rd Year (Junior)</option>
                <option value="4th Year">4th Year (Senior)</option>
                <option value="Postgrad / Alumni">Postgrad</option>
              </select>
              <button
                onClick={handleConfirmYear}
                disabled={savingYear}
                className="px-2.5 py-0.5 bg-[#B4F461] hover:bg-[#a8eb52] text-zinc-950 text-[11px] font-bold rounded cursor-pointer transition-all shadow-sm"
              >
                {savingYear ? "Saving..." : "Save ✓"}
              </button>
            </div>
          ) : (
            <p>Here&apos;s what&apos;s happening in your network.</p>
          )}
        </div>

        {/* Primary Action Banner driven by user state */}
        {(() => {
          const strongMatchesCount = spotlights.filter((dev) => (dev.compatibility ?? 0) >= 40).length;

          if (profileCompleteness.percent < 100) {
            const pct = profileCompleteness.percent;
            // 1. Determine gradient colors & badge styling based on urgency tier
            let strokeGradientStart = "#F43F5E"; // Rose 500
            let strokeGradientEnd = "#F97316";   // Orange 500
            let badgeBg = "bg-rose-500/10 border-rose-500/30 text-rose-400";
            let pulseDotBg = "bg-rose-500";
            let dropShadowColor = "rgba(244,63,94,0.3)";

            if (pct >= 80) {
              strokeGradientStart = "#EAB308"; // Yellow 500
              strokeGradientEnd = "#84CC16";   // Lime 500
              badgeBg = "bg-amber-500/10 border-amber-500/30 text-amber-300";
              pulseDotBg = "bg-amber-400";
              dropShadowColor = "rgba(234,179,8,0.25)";
            } else if (pct >= 50) {
              strokeGradientStart = "#F59E0B"; // Amber 500
              strokeGradientEnd = "#EAB308";   // Yellow 500
              badgeBg = "bg-amber-500/10 border-amber-500/30 text-amber-400";
              pulseDotBg = "bg-amber-500";
              dropShadowColor = "rgba(245,158,11,0.25)";
            }

            // 2. Prioritize dynamic subtext by impact
            let impactSubtext = "Add your skills — without skills, you're invisible to skill-based matching.";
            if (profile?.skills && profile.skills.length > 0) {
              if (!profile.github_url) {
                impactSubtext = "Link your GitHub — teammates check code stats before sending invites.";
              } else if (!profile.college) {
                impactSubtext = "Set your college — unlock your campus teammate matching hub.";
              } else if (!profile.bio) {
                impactSubtext = "Write a bio — tell teammates what project roles you're looking for.";
              } else if (!profile.full_name) {
                impactSubtext = "Set your full name — build trust with team recruiters.";
              }
            }

            return (
              <div className="profile-strength-card group relative">
                {/* Circle Progress Indicator with dashed track & pulsing arc */}
                <div className="relative w-14 h-14 flex-shrink-0 flex items-center justify-center z-10">
                  <svg className="w-full h-full transform -rotate-90" style={{ filter: `drop-shadow(0 0 6px ${dropShadowColor})` }} viewBox="0 0 64 64">
                    <defs>
                      <linearGradient id="profileUrgencyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={strokeGradientStart} />
                        <stop offset="100%" stopColor={strokeGradientEnd} />
                      </linearGradient>
                    </defs>
                    {/* Unfinished dashed track */}
                    <circle cx="32" cy="32" r="26" className="stroke-zinc-800/80 dark:stroke-zinc-800/80 light:stroke-zinc-200" strokeWidth="4" strokeDasharray="4 4" fill="transparent" />
                    {/* Active progress arc with pulse animation */}
                    <circle 
                      cx="32" cy="32" r="26" 
                      stroke="url(#profileUrgencyGradient)"
                      strokeWidth="4" 
                      fill="transparent" 
                      strokeLinecap="round"
                      strokeDasharray={163.36}
                      strokeDashoffset={163.36 * (1 - pct / 100)}
                      className="transition-all duration-700 ease-out animate-pulse" 
                    />
                  </svg>
                  <span className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xs font-mono font-extrabold circle-progress-percent leading-none tracking-tight">{pct}%</span>
                  </span>
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0 text-left z-10">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pulseDotBg} opacity-75`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${pulseDotBg}`}></span>
                    </span>
                    <p className="status-title tracking-wider text-xs font-bold text-zinc-100">
                      Your profile is missing pieces builders look for
                    </p>
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase border ${badgeBg}`}>
                      {pct}% Unverified
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-zinc-300 font-medium">
                      {impactSubtext}
                    </p>
                    {profileCompleteness.pendingTasks.length > 1 && (
                      <span className="text-[10px] text-zinc-400 font-mono font-medium shrink-0 bg-zinc-900/80 px-1.5 py-0.5 rounded border border-zinc-800">
                        +{profileCompleteness.pendingTasks.length - 1} more items
                      </span>
                    )}
                  </div>
                </div>

                {/* Primary Action CTA Button for Incomplete Profile */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowQuickOnboardingModal(true);
                  }}
                  className="z-10 px-3.5 py-1.5 bg-[#B4F461] hover:bg-[#a3e64d] active:scale-[0.98] text-zinc-950 font-bold rounded-lg text-xs tracking-wide transition-all border border-[#B4F461]/50 whitespace-nowrap self-stretch md:self-center flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
                >
                  <span>Enhance Profile</span>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>

                {/* Hover Tooltip for Tasks */}
                <div className="absolute left-1/2 md:left-auto md:right-0 top-full mt-2.5 -translate-x-1/2 md:translate-x-0 w-80 bg-zinc-950/95 dark:bg-zinc-950/95 light:bg-white backdrop-blur-xl border border-zinc-800 dark:border-zinc-800 light:border-zinc-200 rounded-2xl p-4 opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-200 z-50 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-zinc-800 dark:border-zinc-800 light:border-zinc-200 pb-2.5 mb-2.5">
                    <p className="text-[11px] text-zinc-300 dark:text-zinc-300 light:text-zinc-800 font-bold font-mono uppercase tracking-wider flex items-center gap-1.5">
                      <span className="text-amber-400">⚡</span> Profile Checklist ({pct}%)
                    </p>
                    <span className="text-[10px] text-zinc-400 font-mono">{profileCompleteness.pendingTasks.length} items left</span>
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {profileCompleteness.pendingTasks.map((task, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 text-xs text-zinc-300 dark:text-zinc-300 light:text-zinc-700 hover:text-white transition-colors py-1 px-2 rounded-lg hover:bg-zinc-900/60 dark:hover:bg-zinc-900/60 light:hover:bg-zinc-100 border border-transparent hover:border-zinc-800">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          <span className="truncate">{task}</span>
                        </div>
                        <button
                          onClick={() => router.push("/profile/edit")}
                          className="text-[11px] font-bold text-[#B4F461] hover:underline whitespace-nowrap bg-[#B4F461]/10 px-2 py-0.5 rounded border border-[#B4F461]/20 cursor-pointer"
                        >
                          +20% Boost
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          }

          if (strongMatchesCount > 0) {
            return (
              <div 
                onClick={() => router.push("/developers")}
                className="hacker-status-card group cursor-pointer transition-colors"
              >
                <div className="hacker-status-grid" />
                <div className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full bg-[#B4F461]/[0.08] border border-[#B4F461]/[0.18] text-[#B4F461]/70 shadow-inner shadow-black/20">
                  <div className="absolute inset-0 rounded-full bg-[#B4F461]/[0.03] animate-ping opacity-75" />
                  <span className="text-xl">⚡</span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="status-title tracking-wider text-xs text-zinc-200 dark:text-zinc-200 font-bold">Teammate Match Radar</p>
                  <p className="status-desc text-xs text-zinc-400 mt-0.5">
                    You have <strong className="text-zinc-200 font-bold">{strongMatchesCount} strong teammate match{strongMatchesCount > 1 ? "es" : ""}</strong> ready to connect!
                  </p>
                </div>
                <div className="px-3 py-1.5 bg-[#B4F461] hover:bg-[#a8eb52] text-zinc-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer">
                  <span>View Matches</span>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                  </svg>
                </div>
              </div>
            );
          }

          return (
            <div 
              onClick={() => router.push("/developers")}
              className="hacker-status-card group cursor-pointer transition-colors"
            >
              <div className="hacker-status-grid" />
              <div className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 shadow-inner shadow-black/20">
                <div className="absolute inset-0 rounded-full bg-white/[0.02] animate-ping opacity-75" />
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="status-desc text-xs text-zinc-300">
                  Profile 100% complete. Match visibility scores are fully maximized!
                </p>
              </div>
              <div className="find-teammates-btn text-xs flex items-center gap-1.5">
                <span>Browse Builders</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                </svg>
              </div>
            </div>
          );
        })()}

        {/* Secondary Action: Create Team */}
        <button 
          className="cta-secondary" 
          onClick={() => router.push("/teams/create")}
        >
          + Create a team
        </button>
      </div>

      {/* Team Workspace Spotlight & Feature Value Banner */}
      <TeamWorkspaceSpotlightBanner userTeams={activeTeams} />

      {/* Purposeful & Clickable Stat Cards */}
      <div className="stats-row">
        <div 
          className="stat-card cursor-pointer hover:border-white/[0.15] transition-all group relative overflow-hidden"
          onClick={() => router.push("/developers")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && router.push("/developers")}
        >
          <div className="absolute top-0 right-0 w-28 h-28 bg-white/[0.02] rounded-full blur-2xl pointer-events-none group-hover:bg-white/[0.04] transition-colors" />
          <div className="stat-top">
            <div className="stat-label text-zinc-500 dark:text-zinc-400">Builders in network</div>
            <div className="stat-icon bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
          </div>
          <div className="stat-value text-zinc-900 dark:text-white">
            {stats.builders} 
            <span className="stat-trend inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#B4F461]/10 border border-[#B4F461]/20 text-[#B4F461] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B4F461] animate-pulse" />
              active
            </span>
          </div>
          <div className="stat-sub text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">
            <span>Explore all verified builders</span>
            <span className="font-mono text-zinc-400">→</span>
          </div>
        </div>

        <div 
          className="stat-card cursor-pointer hover:border-white/[0.15] transition-all group relative overflow-hidden"
          onClick={() => router.push("/teams")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && router.push("/teams")}
        >
          <div className="absolute top-0 right-0 w-28 h-28 bg-white/[0.02] rounded-full blur-2xl pointer-events-none group-hover:bg-white/[0.04] transition-colors" />
          <div className="stat-top">
            <div className="stat-label text-zinc-500 dark:text-zinc-400">Teams active</div>
            <div className="stat-icon bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z" /></svg>
            </div>
          </div>
          <div className="stat-value text-zinc-900 dark:text-white">{stats.teams}</div>
          <div className="stat-sub text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">
            <span>{stats.teams} ongoing projects — Find teams recruiting</span>
            <span className="font-mono text-zinc-400">→</span>
          </div>
        </div>

        <div 
          className="stat-card cursor-pointer hover:border-white/[0.15] transition-all group relative overflow-hidden"
          onClick={() => router.push("/hackathons")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && router.push("/hackathons")}
        >
          <div className="absolute top-0 right-0 w-28 h-28 bg-white/[0.02] rounded-full blur-2xl pointer-events-none group-hover:bg-white/[0.04] transition-colors" />
          <div className="stat-top">
            <div className="stat-label text-zinc-500 dark:text-zinc-400">Hackathons live</div>
            <div className="stat-icon bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
            </div>
          </div>
          <div className="stat-value text-zinc-900 dark:text-white">{stats.hackathons}</div>
          <div className="stat-sub text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">
            <span><b className="text-zinc-700 dark:text-zinc-200 font-semibold">{stats.closingSoon} closing</b> in 7 days</span>
            <span className="font-mono text-zinc-400">→</span>
          </div>
        </div>
      </div>

      {/* Daily Visit Flame Streak Widget */}
      <StreakWidget initialStreak={profile?.current_streak} initialLongest={profile?.longest_streak} />

      {/* Featured Partner Portals Carousel (Prime Video Style - Auto Shuffling) */}
      <PartnerBannerCarousel />

      {/* Smart India Hackathon 2026 Teammate Matcher Banner */}
      <div className="mb-8">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.09] bg-gradient-to-br from-white/[0.04] via-zinc-950 to-[#080808] p-6 md:p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_16px_40px_-8px_rgba(0,0,0,0.55)] hover:border-white/[0.14] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18),0_20px_48px_-8px_rgba(0,0,0,0.65)] transition-all duration-300">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#B4F461]/40 via-[#B4F461] to-[#B4F461]/40" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700/60 bg-zinc-800/60 px-3 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B4F461] animate-pulse" />
                <span>🇮🇳 SIH 2026 COLLEGE TEAM BUILDER</span>
              </div>
              <h2 className="text-xl md:text-2xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                Smart India Hackathon 2026 Internal Round
              </h2>
              <p className="text-xs md:text-sm text-zinc-600 dark:text-zinc-300 mt-1.5 max-w-2xl leading-relaxed">
                Form your official 6-member team from your college with diverse skills and mandatory female teammate representation. Open to all engineering & tech colleges across India.
              </p>
            </div>

            <Link
              href="/hackathons/sih"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold !text-zinc-950 text-zinc-950 bg-[#B4F461] hover:bg-[#a3e64f] shadow-md shadow-[#B4F461]/20 transition-all hover:scale-105 shrink-0"
            >
              <span className="!text-zinc-950 text-zinc-950 font-extrabold">Find SIH Teammates →</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <span className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse shrink-0" />
              <span className="truncate">Compatibility Spotlight</span>
            </div>
            <div className="view-all" onClick={() => router.push("/developers")}>view all →</div>
          </div>

          {spotlights.length > 0 ? (
            <div className="space-y-1">
              {spotlights.map((dev, idx) => {
                const connectionState = connectionStates[dev.id] || "not_connected";
                const initials = getInitials(dev.full_name);

                return (
                  <div
                    key={dev.id}
                    className="group match-row cursor-pointer hover:bg-zinc-800/40 dark:hover:bg-zinc-800/40 transition-all rounded-xl p-2.5 -mx-1 border border-transparent hover:border-zinc-700/50"
                    onClick={() => router.push(`/profile/${dev.id}`)}
                  >
                    <div className="match-avatar shadow-md" style={{ background: avatarColors[idx % avatarColors.length] }}>
                      {initials}
                      <span className="status-dot" style={connectionState === "not_connected" ? { background: "var(--text-faint)" } : {}}></span>
                    </div>
                    <div className="match-info flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="name text-zinc-900 dark:text-zinc-100 font-bold text-xs truncate">{dev.full_name}</span>
                        {dev.college && (
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono truncate max-w-[120px]">· {dev.college}</span>
                        )}
                      </div>
                      <div className="role text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {dev.skills && dev.skills.includes("Figma") ? "Product Designer" : dev.skills && dev.skills.includes("TensorFlow") ? "ML Engineer" : "Full Stack Developer"}
                      </div>
                      <div className="match-skills flex items-center gap-1 mt-1.5 flex-wrap">
                        {dev.skills?.slice(0, 3).map((skill) => (
                          <span key={skill} className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/60 font-medium">{skill}</span>
                        ))}
                      </div>
                      <div className="max-h-0 overflow-hidden opacity-0 group-hover:max-h-48 group-hover:opacity-100 transition-all duration-300 ease-out">
                        <MatchReasoningBadge userA={profile} userB={dev} isSelfViewer={true} matchScore={dev.compatibility} />
                      </div>
                    </div>
                    <div className="match-right flex flex-col items-end gap-1.5 shrink-0 ml-2">
                      <div className="text-right">
                        <span className="text-sm font-extrabold font-mono text-zinc-100">{dev.compatibility}%</span>
                        <span className="text-[9px] text-zinc-400 block font-mono">match</span>
                      </div>
                      {connectionState === "connected" ? (
                        <div className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-zinc-400 bg-zinc-700/30 border border-zinc-700/50">✓ Connected</div>
                      ) : connectionState === "request_sent" ? (
                        <div className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-zinc-500 bg-zinc-700/20 border border-zinc-700/40">Sent</div>
                      ) : connectionState === "request_received" ? (
                        <button
                          className="px-3 py-1 bg-[#B4F461] hover:bg-[#a8eb52] active:scale-95 text-zinc-950 font-bold rounded-lg text-[11px] transition-all cursor-pointer shadow-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/profile/${dev.id}`);
                          }}
                        >
                          Respond
                        </button>
                      ) : (
                        <button
                          className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-lg text-[11px] transition-all active:scale-95 cursor-pointer shadow-sm"
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
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mb-3 text-zinc-400 shadow-inner">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.115a8.312 8.312 0 01-.115 1.342m0 0A8.284 8.284 0 017.747 18.25m8.312 2.22c.28-.654.443-1.373.443-2.128v-.079c0-1.428-.433-2.755-1.173-3.856M7.747 18.25a8.284 8.284 0 01-.115-1.342v-.003c0-1.43.433-2.758 1.173-3.859M7.747 18.25V18a8.312 8.312 0 01.115-1.342m0 0A8.284 8.284 0 0012 15.75m0 0c.928 0 1.815.153 2.642.435" /></svg>
              </div>
              <p className="text-zinc-700 dark:text-zinc-300 font-semibold text-xs">No compatible builders found</p>
              <p className="text-[11px] text-zinc-500 mt-1 max-w-[220px] mx-auto">Update your skills on your profile to find matching teammates.</p>
              <button
                onClick={() => router.push("/developers")}
                className="mt-3 px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                Browse All Builders →
              </button>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <span className="w-2 h-2 rounded-full bg-sky-600/70 animate-pulse shrink-0" />
              <span
                className="truncate"
                title={profile?.college ? `Builders from ${profile.college}` : "Builders from your college"}
              >
                Builders from {profile?.college ? (profile.college.includes("(") ? profile.college.split("(")[0].trim() : profile.college) : "your college"}
              </span>
              <span className="tag">Campus</span>
            </div>
            <div className="view-all flex items-center gap-2.5">
              <span onClick={() => router.push("/leaderboard")} className="hover:text-zinc-300 text-zinc-400 font-mono text-[10px] cursor-pointer">🏆 Campus Rank</span>
              <span onClick={() => router.push("/developers")} className="cursor-pointer">view all →</span>
            </div>
          </div>

          {(() => {
            const collegeLimit = spotlights.length > 0 ? spotlights.length : 6;
            const displayedCollegeMates = collegeMates.slice(0, collegeLimit);

            if (displayedCollegeMates.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mb-3 text-zinc-400 shadow-inner">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.22 4 2.22V20" /></svg>
                  </div>
                  <p className="text-zinc-700 dark:text-zinc-300 font-semibold text-xs">No builders from your college found</p>
                  <p className="text-[11px] text-zinc-500 mt-1 max-w-[220px] mx-auto">Make sure your college name is set accurately in your profile.</p>
                  <button
                    onClick={() => router.push("/profile/edit")}
                    className="mt-3 px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Set College in Profile →
                  </button>
                </div>
              );
            }

            return (
              <div className="space-y-1">
                {displayedCollegeMates.map((dev, idx) => {
                  const connectionState = connectionStates[dev.id] || "not_connected";
                  const initials = getInitials(dev.full_name);

                  return (
                    <div
                      key={dev.id}
                      className="match-row cursor-pointer hover:bg-zinc-800/40 dark:hover:bg-zinc-800/40 transition-all rounded-xl p-2.5 -mx-1 border border-transparent hover:border-zinc-700/50"
                      onClick={() => router.push(`/profile/${dev.id}`)}
                    >
                      <div className="match-avatar shadow-md" style={{ background: avatarColors[(idx + 2) % avatarColors.length] }}>
                        {initials}
                        <span className="status-dot" style={connectionState === "not_connected" ? { background: "var(--text-faint)" } : {}}></span>
                      </div>
                      <div className="match-info flex-1 min-w-0">
                        <div className="name text-zinc-900 dark:text-zinc-100 font-bold text-xs truncate">{dev.full_name}</div>
                        <div className="role text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {dev.skills && dev.skills.includes("Figma") ? "Product Designer" : dev.skills && dev.skills.includes("TensorFlow") ? "ML Engineer" : "Full Stack Developer"}
                        </div>
                        <div className="match-skills flex items-center gap-1 mt-1.5 flex-wrap">
                          {dev.skills?.slice(0, 3).map((skill) => (
                            <span key={skill} className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/60 font-medium">{skill}</span>
                          ))}
                        </div>
                      </div>
                      <div className="match-right flex flex-col items-end gap-1.5 shrink-0 ml-2">
                        {dev.compatibility ? (
                          <div className="text-right">
                            <span className="text-sm font-extrabold font-mono text-zinc-100">{dev.compatibility}%</span>
                            <span className="text-[9px] text-zinc-400 block font-mono">match</span>
                          </div>
                        ) : null}
                        {connectionState === "connected" ? (
                          <div className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-zinc-400 bg-zinc-700/30 border border-zinc-700/50">✓ Connected</div>
                        ) : connectionState === "request_sent" ? (
                          <div className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-zinc-500 bg-zinc-700/20 border border-zinc-700/40">Sent</div>
                        ) : connectionState === "request_received" ? (
                          <button
                            className="px-3 py-1 bg-[#B4F461] hover:bg-[#a8eb52] active:scale-95 text-zinc-950 font-bold rounded-lg text-[11px] transition-all cursor-pointer shadow-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/profile/${dev.id}`);
                            }}
                          >
                            Respond
                          </button>
                        ) : (
                          <button
                            className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-lg text-[11px] transition-all active:scale-95 cursor-pointer shadow-sm"
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
            );
          })()}
        </div>
      </div>

      <div className="grid-3 mt-4">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#B4F461] animate-pulse shrink-0" />
              <span>My teams</span>
              <span className="text-[11px] font-mono font-normal text-zinc-500">{activeTeams.length} active</span>
            </div>
            <Link href="/my-teams" className="view-all text-lime-600 dark:text-[#B4F461] hover:text-lime-700 dark:hover:text-[#a3e64f] font-mono transition-colors">
              Manage &gt;
            </Link>
          </div>

          {activeTeams.length > 0 ? (
            <div className="space-y-2.5">
              {activeTeams.map((team) => {
                const info = getTeamCategoryInfo(team);
                const theme = LANDING_TOKENS.categories[info.category];
                const initials = getInitials(team.name, 2);
                const filledCount = Math.max(0, team.memberCount || team.members?.length || 0);
                const hasMax = typeof team.max_members === "number" && team.max_members > 0;
                const totalSeats = hasMax && team.max_members! >= filledCount ? team.max_members! : filledCount;
                const seatLabel = hasMax && team.max_members! >= filledCount
                  ? `${filledCount}/${team.max_members} seats`
                  : `${filledCount} seats`;

                return (
                  <div
                    key={team.id}
                    onClick={() => {
                      const firstHackathonId = team.team_hackathons?.[0]?.hackathon_id || team.hackathon_id;
                      router.push(`/teams/${team.id}/workspace${firstHackathonId ? `?hackathon_id=${firstHackathonId}` : ''}`);
                    }}
                    className="group relative flex items-center justify-between p-3.5 rounded-2xl border border-zinc-200/90 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/40 hover:bg-white dark:hover:bg-zinc-900/80 hover:border-lime-500/60 dark:hover:border-[#B4F461]/35 hover:-translate-y-px transition-all duration-[160ms] cursor-pointer shadow-xs dark:shadow-none"
                  >
                    {/* Left Section: Monogram Avatar + Team Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
                      {/* Monogram Avatar (42px, rounded-lg) */}
                      <div className={`w-[42px] h-[42px] shrink-0 rounded-lg flex items-center justify-center font-mono font-bold text-sm ${theme.bg} ${theme.text} border ${theme.border}`}>
                        {initials}
                      </div>

                      {/* Team Name + Category Pill + Subtitle */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-950 dark:group-hover:text-white transition-colors truncate">
                            {team.name}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase shrink-0 ${theme.bg} ${theme.text} border ${theme.border}`}>
                            {info.tag}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate max-w-[200px] sm:max-w-[260px]">
                          {info.eventName}
                        </p>
                      </div>
                    </div>

                    {/* Right Section: Seat Roster Ticks + Workspace Action */}
                    <div className="flex items-center gap-4 shrink-0">
                      {/* Seat Roster */}
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1">
                          {Array.from({ length: totalSeats }).map((_, i) => (
                            <span
                              key={i}
                              className={`w-2 h-2 rounded-[2px] ${
                                i < filledCount ? theme.tickFilled : theme.tickEmpty
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 mt-1">
                          {seatLabel}
                        </span>
                      </div>

                      {/* Workspace Link */}
                      <div className="flex items-center gap-1 font-mono text-xs text-zinc-600 dark:text-zinc-400 group-hover:text-lime-600 dark:group-hover:text-[#B4F461] group-hover:translate-x-0.5 transition-all duration-[160ms] font-medium">
                        <span>Workspace</span>
                        <span className="text-[11px]">↗</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mb-3 text-zinc-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z" /></svg>
              </div>
              <p className="text-zinc-700 dark:text-zinc-300 font-semibold text-xs">No active teams</p>
              <p className="text-[10px] text-zinc-500 mt-1">Create a team or request to join one to get started.</p>
              <button
                onClick={() => router.push("/teams/create")}
                className="mt-3 px-3 py-1 rounded-lg bg-[#B4F461] hover:bg-[#a3e64f] text-zinc-950 text-xs font-bold transition-all cursor-pointer"
              >
                + Create a Team
              </button>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <span className="w-2 h-2 rounded-full bg-amber-500/80 animate-pulse shrink-0" />
              <span>Recent Activity</span>
            </div>
          </div>

          {recentActivities.length > 0 ? (
            <div className="space-y-1">
              {recentActivities.map((act) => {
                const colors = ["#a1a1aa"];
                const randColor = colors[Math.abs(act.id.split("").reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0)) % colors.length];

                return (
                  <div
                    key={act.id}
                    onClick={() => {
                      if (act.link) router.push(act.link);
                    }}
                    className={`flex items-start gap-2.5 p-2 rounded-xl transition-colors border border-transparent ${
                      act.link ? "cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:border-zinc-200 dark:hover:border-zinc-700/50" : ""
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: randColor, boxShadow: `0 0 6px ${randColor}80` }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-snug" dangerouslySetInnerHTML={{ __html: formatActivityText(act.message) }} />
                      <div className="text-[10px] text-zinc-400 font-mono mt-0.5">{act.timeLabel}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mb-3 text-zinc-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
              </div>
              <p className="text-zinc-700 dark:text-zinc-300 font-semibold text-xs">No recent activity</p>
              <p className="text-[10px] text-zinc-500 mt-1">Notifications and network matches will appear here.</p>
            </div>
          )}
        </div>
      </div>

        <Footer />

        <QuickOnboardingModal
          isOpen={showQuickOnboardingModal}
          onClose={() => setShowQuickOnboardingModal(false)}
          onSuccess={loadDashboardData}
          initialGithubUrl={profile?.github_url}
        />
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