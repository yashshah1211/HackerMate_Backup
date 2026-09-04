"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { normalizeCollege } from "@/lib/colleges";
import {
  Trophy,
  Users,
  ShieldCheck,
  Search,
  Share2,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
  Flame,
  ArrowRight,
} from "lucide-react";
import Logo from "@/components/Logo";

type BuilderProfile = {
  id: string;
  full_name: string | null;
  college: string | null;
  avatar_url: string | null;
  skills: string[] | null;
  show_track_record?: boolean;
  is_banned?: boolean;
  onboarding_completed?: boolean;
};

type TeamRow = {
  id: string;
  name: string;
  college: string | null;
  is_recruiting: boolean;
  created_at: string;
  team_members: { id: string; user_id: string }[] | null;
};

export type CollegeRank = {
  name: string;
  shortName: string;
  cityState: string;
  category: "maharashtra" | "iit_nit_bits" | "delhi" | "south" | "other";
  builderCount: number;
  activeSquadCount: number;
  powerScore: number;
  builders: BuilderProfile[];
};

function getCollegeCategory(name: string): "maharashtra" | "iit_nit_bits" | "delhi" | "south" | "other" {
  const lower = name.toLowerCase();
  if (lower.includes("iit") || lower.includes("nit") || lower.includes("bits") || lower.includes("iiit")) {
    return "iit_nit_bits";
  }
  if (lower.includes("mumbai") || lower.includes("pune") || lower.includes("maharashtra") || lower.includes("vjti") || lower.includes("spit") || lower.includes("djsce") || lower.includes("coep") || lower.includes("pict") || lower.includes("tsec") || lower.includes("vesit") || lower.includes("kjsit") || lower.includes("tcet") || lower.includes("somaiya")) {
    return "maharashtra";
  }
  if (lower.includes("delhi") || lower.includes("dtu") || lower.includes("nsut")) {
    return "delhi";
  }
  if (lower.includes("bangalore") || lower.includes("vellore") || lower.includes("chennai") || lower.includes("hyderabad") || lower.includes("karnataka") || lower.includes("tamil")) {
    return "south";
  }
  return "other";
}

function parseCollegeDetails(fullName: string) {
  let short = fullName;
  let location = "India";

  if (fullName.includes("(")) {
    const parts = fullName.split("(");
    short = parts[0].trim();
  }

  if (fullName.toLowerCase().includes("mumbai")) location = "Mumbai, MH";
  else if (fullName.toLowerCase().includes("pune")) location = "Pune, MH";
  else if (fullName.toLowerCase().includes("delhi")) location = "Delhi NCR";
  else if (fullName.toLowerCase().includes("bangalore")) location = "Bangalore, KA";
  else if (fullName.toLowerCase().includes("hyderabad")) location = "Hyderabad, TS";
  else if (fullName.toLowerCase().includes("chennai") || fullName.toLowerCase().includes("vellore")) location = "Tamil Nadu";
  else if (fullName.toLowerCase().includes("nagpur")) location = "Nagpur, MH";
  else if (fullName.toLowerCase().includes("sangli")) location = "Sangli, MH";

  return { shortName: short, cityState: location };
}

function LeaderboardContent() {
  const searchParams = useSearchParams();
  const highlightedCollegeParam = searchParams.get("college") || "";

  const [loading, setLoading] = useState(true);
  const [colleges, setColleges] = useState<CollegeRank[]>([]);
  const [totalBuilders, setTotalBuilders] = useState(0);
  const [totalSquads, setTotalSquads] = useState(0);
  const [userProfile, setUserProfile] = useState<BuilderProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedCollege, setExpandedCollege] = useState<string | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const [copiedCollege, setCopiedCollege] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // 1. Fetch current session if any
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, full_name, college, avatar_url, skills, show_track_record, is_banned, onboarding_completed")
            .eq("id", user.id)
            .maybeSingle();
          if (profile) setUserProfile(profile);
        }

        // 2. Fetch public-safe verified profiles
        const { data: profilesData, error: pErr } = await supabase
          .from("profiles")
          .select("id, full_name, college, avatar_url, skills, show_track_record, is_banned, onboarding_completed")
          .eq("is_banned", false)
          .eq("onboarding_completed", true);

        if (pErr) console.error("Error loading profiles for leaderboard:", pErr);

        // 3. Fetch public-safe teams with members
        const { data: teamsData, error: tErr } = await supabase
          .from("teams")
          .select("id, name, college, is_recruiting, created_at, team_members(id, user_id)");

        if (tErr) console.error("Error loading teams for leaderboard:", tErr);

        const profiles = profilesData || [];
        const teams = teamsData || [];

        setTotalBuilders(profiles.length);

        // 4. Group by normalized college with STRICT null/empty exclusion
        const collegeMap: Record<string, { builders: BuilderProfile[]; activeSquads: number }> = {};
        let activeSquadCount = 0;

        profiles.forEach((p) => {
          // Strictly exclude builders with no college set or empty whitespace
          if (!p.college || typeof p.college !== "string" || p.college.trim() === "") return;
          const normalized = normalizeCollege(p.college);
          if (!normalized || normalized.toLowerCase() === "other") return;

          if (!collegeMap[normalized]) {
            collegeMap[normalized] = { builders: [], activeSquads: 0 };
          }
          collegeMap[normalized].builders.push(p);
        });

        // 5. Aggregate active squads (Threshold: team_members.length >= 2)
        teams.forEach((t) => {
          if (!t.college || typeof t.college !== "string" || t.college.trim() === "") return;
          if (!t.team_members || t.team_members.length < 2) return; // Anti-gaming: Solo/empty teams award 0 squad pts

          activeSquadCount++;
          const normalized = normalizeCollege(t.college);
          if (!normalized || normalized.toLowerCase() === "other") return;

          if (collegeMap[normalized]) {
            collegeMap[normalized].activeSquads += 1;
          }
        });

        setTotalSquads(activeSquadCount);

        // 6. Calculate Power Scores: (Verified Builders x 10) + (Active Squads x 25)
        const rankedList: CollegeRank[] = Object.entries(collegeMap).map(([name, data]) => {
          const { shortName, cityState } = parseCollegeDetails(name);
          const builderCount = data.builders.length;
          const activeSquadCount = data.activeSquads;
          const powerScore = builderCount * 10 + activeSquadCount * 25;
          const category = getCollegeCategory(name);

          return {
            name,
            shortName,
            cityState,
            category,
            builderCount,
            activeSquadCount,
            powerScore,
            builders: data.builders,
          };
        });

        // Sort descending by Power Score, then by Builder Count
        rankedList.sort((a, b) => {
          if (b.powerScore !== a.powerScore) return b.powerScore - a.powerScore;
          return b.builderCount - a.builderCount;
        });

        const totalVerifiedDevs = rankedList.reduce((sum, c) => sum + c.builderCount, 0);
        const totalActiveSquads = rankedList.reduce((sum, c) => sum + c.activeSquadCount, 0);
        setTotalBuilders(totalVerifiedDevs);
        setTotalSquads(totalActiveSquads);

        setColleges(rankedList);

        // Auto-expand highlighted college param if present
        if (highlightedCollegeParam) {
          const match = rankedList.find(
            (c) => c.name.toLowerCase().includes(highlightedCollegeParam.toLowerCase())
          );
          if (match) setExpandedCollege(match.name);
        }
      } catch (err) {
        console.error("Leaderboard load failure:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [highlightedCollegeParam]);

  // Identify user's college standing
  const userCollegeRank = useMemo(() => {
    if (!userProfile?.college) return null;
    const normalized = normalizeCollege(userProfile.college);
    const index = colleges.findIndex((c) => c.name === normalized);
    if (index === -1) return null;
    return {
      college: colleges[index],
      rank: index + 1,
      pointsToNextRank: index > 0 ? colleges[index - 1].powerScore - colleges[index].powerScore + 10 : 0,
      nextCollegeName: index > 0 ? colleges[index - 1].shortName : null,
    };
  }, [userProfile, colleges]);

  // Filtered colleges (Capped to Top 10)
  const filteredColleges = useMemo(() => {
    return colleges
      .filter((c) => {
        const matchesSearch =
          searchQuery.trim() === "" ||
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.shortName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.cityState.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesCategory =
          selectedCategory === "all" || c.category === selectedCategory;

        return matchesSearch && matchesCategory;
      })
      .slice(0, 10);
  }, [colleges, searchQuery, selectedCategory]);

  const handleShareWhatsApp = (collegeName: string, rank?: number) => {
    const rankText = rank ? `ranked #${rank}` : "competing";
    const shareUrl = `${typeof window !== "undefined" ? window.location.origin : "https://hackermate.in"}/leaderboard?college=${encodeURIComponent(collegeName)}`;
    const text = `🔥 ${collegeName} is ${rankText} on the HackerMate National Campus Leaderboard! Join our campus squad and find hackathon teammates:\n\n${shareUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleCopyLink = (collegeName: string) => {
    const shareUrl = `${typeof window !== "undefined" ? window.location.origin : "https://hackermate.in"}/leaderboard?college=${encodeURIComponent(collegeName)}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedCollege(collegeName);
    setTimeout(() => setCopiedCollege(null), 2500);
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-900 dark:text-white selection:bg-[#B4F461] selection:text-black font-sans pb-24 transition-colors duration-200">
      {/* Background Dot Matrix Grid */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-[radial-gradient(#e4e4e7_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px] opacity-40 dark:opacity-25" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[450px] pointer-events-none z-0">
        <div className="absolute top-10 left-1/4 w-[400px] h-[400px] bg-[#B4F461]/8 dark:bg-[#B4F461]/6 rounded-full blur-[140px]" />
        <div className="absolute top-10 right-1/4 w-[400px] h-[400px] bg-[#22D3EE]/8 dark:bg-[#22D3EE]/6 rounded-full blur-[140px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        
        {/* Header Title & Platform Live Stats */}
        <div className="space-y-4 text-center max-w-3xl mx-auto pt-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-700 dark:text-zinc-300 backdrop-blur-md shadow-sm">
            <Trophy className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span>INTER-COLLEGE HACKATHON LEADERBOARD</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-white leading-tight font-sans">
            Campus Engineering Power Rankings
          </h1>

          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-2xl mx-auto font-sans">
            Real-time standings of India&apos;s collegiate developer communities. Ranked objectively by verified builders and formed hackathon squads.
          </p>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-3 gap-3 pt-2 max-w-md mx-auto">
            <div className="p-3 rounded-2xl bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 text-center shadow-sm">
              <span className="block text-lg sm:text-xl font-mono font-bold text-zinc-900 dark:text-white">
                {loading ? (
                  <span className="inline-block w-8 h-5 bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded my-0.5" />
                ) : (
                  colleges.length
                )}
              </span>
              <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase">Colleges</span>
            </div>
            <div className="p-3 rounded-2xl bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 text-center shadow-sm">
              <span className="block text-lg sm:text-xl font-mono font-bold text-emerald-600 dark:text-[#B4F461]">
                {loading ? (
                  <span className="inline-block w-8 h-5 bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded my-0.5" />
                ) : (
                  totalBuilders
                )}
              </span>
              <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase">Verified Devs</span>
            </div>
            <div className="p-3 rounded-2xl bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 text-center shadow-sm">
              <span className="block text-lg sm:text-xl font-mono font-bold text-cyan-600 dark:text-[#22D3EE]">
                {loading ? (
                  <span className="inline-block w-8 h-5 bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded my-0.5" />
                ) : (
                  totalSquads
                )}
              </span>
              <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase">Active Squads</span>
            </div>
          </div>
        </div>

        {/* User's College Pinned Status HUD or Logged-Out CTA */}
        {loading ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-100/60 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 animate-pulse flex items-center justify-between">
            <div className="space-y-2">
              <div className="w-28 h-4 bg-zinc-200 dark:bg-zinc-800 rounded" />
              <div className="w-64 h-5 bg-zinc-200 dark:bg-zinc-800 rounded" />
            </div>
            <div className="w-36 h-9 bg-zinc-200 dark:bg-zinc-800 rounded-xl hidden sm:block" />
          </div>
        ) : userCollegeRank ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-white dark:from-zinc-900 dark:via-zinc-900/90 dark:to-zinc-950 border border-amber-500/30 shadow-md dark:shadow-xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 font-mono text-[11px] font-bold">
                    YOUR CAMPUS: #{userCollegeRank.rank}
                  </span>
                  <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
                    {userCollegeRank.college.builderCount} Builders • {userCollegeRank.college.activeSquadCount} Active Squads
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white font-sans">
                  {userCollegeRank.college.name}
                </h3>
                {userCollegeRank.nextCollegeName && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 font-sans">
                    <span className="text-emerald-600 dark:text-[#B4F461] font-semibold">{Math.ceil(userCollegeRank.pointsToNextRank / 10)} more builders</span> needed to overtake #{userCollegeRank.rank - 1} {userCollegeRank.nextCollegeName}!
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  onClick={() => handleShareWhatsApp(userCollegeRank.college.name, userCollegeRank.rank)}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] !text-black font-bold text-xs shadow-lg transition-all cursor-pointer"
                  style={{ color: "#000000" }}
                >
                  <Share2 className="w-3.5 h-3.5 !text-black" style={{ color: "#000000" }} />
                  <span style={{ color: "#000000" }} className="!text-black font-bold">Invite Campus Mates</span>
                </button>
              </div>
            </div>
          </div>
        ) : userProfile ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 shadow-md dark:shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-mono text-[11px] font-semibold">
                  CAMPUS TRACKER
                </span>
                <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">Unset College</span>
              </div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white font-sans">
                Set your college to track your campus rank & team up
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 font-sans">
                Add your college to your profile to contribute points to your campus leaderboard standing.
              </p>
            </div>
            <Link
              href="/profile/edit"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-semibold text-xs transition-colors"
            >
              <span>Set College in Profile →</span>
            </Link>
          </div>
        ) : (
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-gradient-to-r dark:from-zinc-900 dark:via-zinc-900/90 dark:to-zinc-950 border border-zinc-200 dark:border-zinc-800/80 shadow-md dark:shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-mono text-[11px] font-semibold">
                  CAMPUS TRACKER
                </span>
                <span className="text-xs font-mono text-emerald-600 dark:text-[#B4F461] font-semibold">Where does your college rank?</span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white font-sans">
                Sign in to track your campus rank & find college hackathon teammates
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 font-sans">
                Join verified developers from your college, build hackathon squads, and push your campus to #1.
              </p>
            </div>
            <Link
              href={`/login?next=${encodeURIComponent(
                `/leaderboard${highlightedCollegeParam ? `?college=${encodeURIComponent(highlightedCollegeParam)}` : ""}`
              )}${highlightedCollegeParam ? `&college=${encodeURIComponent(highlightedCollegeParam)}` : ""}`}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#B4F461] hover:bg-[#a3e64f] font-extrabold text-xs shadow-md transition-all whitespace-nowrap cursor-pointer !text-black"
              style={{ color: "#000000" }}
            >
              <span style={{ color: "#000000" }} className="!text-black font-extrabold text-black">
                Sign In to See Your Campus Rank →
              </span>
            </Link>
          </div>
        )}

        {/* Top 3 Podium Cards */}
        {!loading && colleges.length >= 3 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Silver: Rank 2 */}
            <div className="order-2 md:order-1 p-5 rounded-2xl bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-700/60 shadow-md dark:shadow-xl flex flex-col justify-between relative overflow-hidden group hover:border-zinc-400 dark:hover:border-zinc-500 transition-all">
              <div className="absolute top-0 right-0 px-3 py-1 bg-zinc-100 dark:bg-zinc-800 border-b border-l border-zinc-200 dark:border-zinc-700 rounded-bl-xl font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                🥈 #2 Silver
              </div>
              <div className="space-y-3 pt-2">
                <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">{colleges[1].cityState}</span>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">
                  {colleges[1].shortName}
                </h3>
                <div className="flex items-center gap-4 text-xs font-mono text-zinc-600 dark:text-zinc-300">
                  <span>{colleges[1].builderCount} Builders</span>
                  <span>•</span>
                  <span>{colleges[1].activeSquadCount} Squads</span>
                </div>
              </div>
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-900 mt-4 flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-zinc-800 dark:text-zinc-200">{colleges[1].powerScore} PTS</span>
                <button
                  onClick={() => handleShareWhatsApp(colleges[1].name, 2)}
                  className="text-xs font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  Invite <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Gold: Rank 1 (Center Highlighted) */}
            <div className="order-1 md:order-2 p-6 rounded-2xl bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-white dark:from-amber-500/10 dark:via-zinc-950 dark:to-zinc-950 border border-amber-500/40 dark:border-amber-500/50 shadow-lg dark:shadow-2xl flex flex-col justify-between relative overflow-hidden md:-mt-2">
              <div className="absolute top-0 right-0 px-3.5 py-1.5 bg-amber-500 text-black font-mono text-xs font-black rounded-bl-xl flex items-center gap-1 shadow-md">
                <Trophy className="w-3.5 h-3.5" /> #1 Champion
              </div>
              <div className="space-y-3 pt-2">
                <span className="text-[11px] font-mono text-amber-700 dark:text-amber-300/80 font-semibold">{colleges[0].cityState}</span>
                <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white leading-snug line-clamp-2">
                  {colleges[0].shortName}
                </h3>
                <div className="flex items-center gap-4 text-xs font-mono text-zinc-700 dark:text-zinc-200">
                  <span className="text-zinc-900 dark:text-white font-bold">{colleges[0].builderCount} Verified Devs</span>
                  <span>•</span>
                  <span>{colleges[0].activeSquadCount} Active Squads</span>
                </div>
              </div>
              <div className="pt-4 border-t border-amber-200/60 dark:border-zinc-800/80 mt-4 flex items-center justify-between">
                <span className="text-sm font-mono font-black text-amber-600 dark:text-amber-400">{colleges[0].powerScore} PTS</span>
                <button
                  onClick={() => handleShareWhatsApp(colleges[0].name, 1)}
                  className="text-xs font-mono text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200 flex items-center gap-1 font-semibold cursor-pointer"
                >
                  Share Campus Card <Share2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Bronze: Rank 3 */}
            <div className="order-3 p-5 rounded-2xl bg-white dark:bg-zinc-950/80 border border-amber-200 dark:border-amber-700/40 shadow-md dark:shadow-xl flex flex-col justify-between relative overflow-hidden group hover:border-amber-300 dark:hover:border-amber-700/60 transition-all">
              <div className="absolute top-0 right-0 px-3 py-1 bg-amber-50 dark:bg-amber-900/60 border-b border-l border-amber-200 dark:border-amber-700/50 rounded-bl-xl font-mono text-xs font-bold text-amber-800 dark:text-amber-200">
                🥉 #3 Bronze
              </div>
              <div className="space-y-3 pt-2">
                <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">{colleges[2].cityState}</span>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">
                  {colleges[2].shortName}
                </h3>
                <div className="flex items-center gap-4 text-xs font-mono text-zinc-600 dark:text-zinc-300">
                  <span>{colleges[2].builderCount} Builders</span>
                  <span>•</span>
                  <span>{colleges[2].activeSquadCount} Squads</span>
                </div>
              </div>
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-900 mt-4 flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-zinc-800 dark:text-zinc-200">{colleges[2].powerScore} PTS</span>
                <button
                  onClick={() => handleShareWhatsApp(colleges[2].name, 3)}
                  className="text-xs font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  Invite <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Auditable Scoring Methodology & Transparency Box */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 shadow-md dark:shadow-lg space-y-3">
          <button
            onClick={() => setShowMethodology(!showMethodology)}
            className="w-full flex items-center justify-between text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-[#B4F461]" />
              <span className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200 font-sans">
                Scoring Methodology & Anti-Gaming Integrity Policy
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              <span>{showMethodology ? "Hide formula" : "View formula & audit details"}</span>
              {showMethodology ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {showMethodology && (
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-900 text-xs text-zinc-600 dark:text-zinc-400 space-y-2.5 font-sans leading-relaxed">
              <p>
                To maintain absolute fairness, rankings are strictly calculated by an auditable, objective mathematical formula with zero manual weighting:
              </p>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 font-mono text-[11px] text-zinc-800 dark:text-zinc-200 space-y-1">
                <p className="text-emerald-600 dark:text-[#B4F461] font-bold">
                  Campus Power Score = (Verified Builders × 10) + (Active Formed Squads × 25)
                </p>
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-[11px]">
                <li className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/60">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 block mb-0.5">Verified Builders (10 pts)</span>
                  Only accounts with completed onboarding and verified college attribution count. Empty signups award 0 pts.
                </li>
                <li className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/60">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 block mb-0.5">Active Squads (25 pts)</span>
                  Teams must have at least 2 verified student members. Solo or empty placeholder teams award 0 pts.
                </li>
                <li className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/60">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 block mb-0.5">Privacy First</span>
                  Builders who toggled their profile track record to private are respected and excluded from public spotlight rosters.
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Search, Filter Tabs & Rankings Table */}
        <div className="space-y-4">
          
          {/* Controls Header */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search college name, acronym, or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors shadow-sm"
              />
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: "all", label: "Top 10 Colleges" },
                { id: "maharashtra", label: "Maharashtra" },
                { id: "iit_nit_bits", label: "IITs / NITs / BITS" },
                { id: "delhi", label: "Delhi NCR" },
                { id: "south", label: "South" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === tab.id
                      ? "bg-zinc-900 text-white dark:bg-zinc-800 dark:text-white font-bold border border-zinc-900 dark:border-zinc-700 shadow-sm"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-transparent"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Leaderboard Table / Card List */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/90 shadow-md dark:shadow-2xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-900">
            {loading ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-6 h-6 border-2 border-zinc-300 dark:border-zinc-800 border-t-emerald-600 dark:border-t-[#B4F461] rounded-full animate-spin mx-auto" />
                <p className="text-xs font-mono text-zinc-500">Calculating live campus power scores...</p>
              </div>
            ) : filteredColleges.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-300">No colleges matched &quot;{searchQuery}&quot;</p>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Try searching for another college name or clear the filter.
                </p>
              </div>
            ) : (
              filteredColleges.map((college, idx) => {
                const rank = colleges.findIndex((c) => c.name === college.name) + 1;
                const isExpanded = expandedCollege === college.name;
                const isUserCollege = userProfile?.college && normalizeCollege(userProfile.college) === college.name;

                // Opt-in active builders (respecting show_track_record !== false)
                const optInBuilders = college.builders.filter(
                  (b) => b.show_track_record !== false && !b.is_banned && b.onboarding_completed
                );

                return (
                  <div
                    key={college.name}
                    className={`transition-colors ${
                      isUserCollege ? "bg-amber-500/10 dark:bg-amber-500/5" : "hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
                    }`}
                  >
                    {/* Main Row */}
                    <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        {/* Rank Badge */}
                        <div
                          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center font-mono font-extrabold text-xs shrink-0 ${
                            rank === 1
                              ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                              : rank === 2
                              ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-white"
                              : rank === 3
                              ? "bg-amber-100 text-amber-900 dark:bg-amber-900/80 dark:text-amber-200"
                              : "bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          }`}
                        >
                          #{rank}
                        </div>

                        {/* College Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 truncate font-sans">
                              {college.shortName}
                            </h4>
                            {isUserCollege && (
                              <span className="px-2 py-0.2 rounded bg-amber-500/15 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 font-mono text-[9px] font-semibold border border-amber-500/30">
                                Your Campus
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate font-mono">
                            {college.cityState} • {college.name}
                          </p>
                        </div>
                      </div>

                      {/* Right Stats & Actions */}
                      <div className="flex items-center gap-3 sm:gap-6 shrink-0">
                        <div className="text-right hidden sm:block">
                          <span className="block text-xs font-mono font-semibold text-zinc-800 dark:text-zinc-300">
                            {college.builderCount} Devs
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500">
                            {college.activeSquadCount} Active Squads
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="block text-sm sm:text-base font-mono font-bold text-emerald-600 dark:text-[#B4F461]">
                            {college.powerScore}
                          </span>
                          <span className="text-[9px] font-mono text-zinc-500 dark:text-zinc-400 uppercase">Points</span>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleShareWhatsApp(college.name, rank)}
                            title="Share on WhatsApp"
                            className="p-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                          
                          <button
                            onClick={() => setExpandedCollege(isExpanded ? null : college.name)}
                            className="p-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Active Builders & Squads Drawer */}
                    {isExpanded && (
                      <div className="px-4 sm:px-5 pb-5 pt-2 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/80 dark:bg-zinc-950/60 space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-mono font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                            Verified Builders from {college.shortName} ({optInBuilders.length})
                          </h5>
                          <button
                            onClick={() => handleCopyLink(college.name)}
                            className="text-[11px] font-mono text-emerald-600 dark:text-[#B4F461] hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                          >
                            {copiedCollege === college.name ? "✓ Link Copied!" : "Copy Campus Leaderboard Link"}
                          </button>
                        </div>

                        {optInBuilders.length === 0 ? (
                          <p className="text-xs text-zinc-500 py-2">
                            No builders from this college have public profile visibility enabled.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {optInBuilders.slice(0, 9).map((builder) => (
                              <Link
                                key={builder.id}
                                href={`/profile/${builder.id}`}
                                className="p-2.5 rounded-xl bg-white dark:bg-zinc-900/60 hover:bg-zinc-50 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between gap-2.5 transition-all group shadow-sm"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-700 dark:text-zinc-300 shrink-0">
                                    {builder.full_name ? builder.full_name.substring(0, 2).toUpperCase() : "HM"}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 truncate group-hover:text-indigo-600 dark:group-hover:text-white">
                                      {builder.full_name || "Anonymous Builder"}
                                    </p>
                                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono truncate">
                                      {builder.skills && builder.skills.length > 0
                                        ? builder.skills.slice(0, 2).join(", ")
                                        : "Full-Stack Builder"}
                                    </p>
                                  </div>
                                </div>
                                <ExternalLink className="w-3 h-3 text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 shrink-0" />
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </main>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-zinc-900 dark:text-white">
          <div className="w-6 h-6 border-2 border-zinc-300 dark:border-zinc-800 border-t-emerald-600 dark:border-t-[#B4F461] rounded-full animate-spin" />
        </div>
      }
    >
      <LeaderboardContent />
    </Suspense>
  );
}
