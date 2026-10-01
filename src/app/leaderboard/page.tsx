"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { normalizeCollege } from "@/lib/colleges";
import {
  Trophy,
  Award,
  ShieldCheck,
  Share2,
  ChevronDown,
  ChevronUp,
  Check,
  Link2,
  ArrowRight,
  School,
} from "lucide-react";
import {
  Avatar,
  Button,
  ButtonLink,
  EmptyState,
  ErrorNotice,
  IconButton,
  Page,
  PageHeader,
  PageLoader,
  Panel,
  SearchField,
  Segmented,
  Skeleton,
  SkeletonRows,
  Stat,
  Tape,
} from "@/components/system";
import { cn } from "@/lib/utils";

type CategoryFilter = "all" | "maharashtra" | "iit_nit_bits" | "delhi" | "south";

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "Top 10" },
  { value: "maharashtra", label: "Maharashtra" },
  { value: "iit_nit_bits", label: "IIT / NIT / BITS" },
  { value: "delhi", label: "Delhi NCR" },
  { value: "south", label: "South" },
];

/** Rank label, zero-padded mono (01, 02 …). */
function rankLabel(rank: number) {
  return String(rank).padStart(2, "0");
}

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
  // Presentation-only: surfaces load failures instead of a silent empty board.
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setLoadError(null);
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

        if (pErr) {
          console.error("Error loading profiles for leaderboard:", pErr);
          setLoadError(pErr.message);
        }

        // 3. Fetch public-safe teams with members
        const { data: teamsData, error: tErr } = await supabase
          .from("teams")
          .select("id, name, college, is_recruiting, created_at, team_members(id, user_id)");

        if (tErr) {
          console.error("Error loading teams for leaderboard:", tErr);
          setLoadError(tErr.message);
        }

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
        setLoadError(err instanceof Error ? err.message : String(err));
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
    <Page>
      <PageHeader
        eyebrow="Practice"
        title="Leaderboard"
        meta="Campus rankings by verified builders and active hackathon squads."
      />

      {/* Live totals */}
      <div className="grid grid-cols-3 gap-4 border-y border-line py-4">
        <Stat label="Colleges" value={loading ? <Skeleton className="h-5 w-10" /> : colleges.length} />
        <Stat label="Verified devs" value={loading ? <Skeleton className="h-5 w-10" /> : totalBuilders} />
        <Stat label="Active squads" value={loading ? <Skeleton className="h-5 w-10" /> : totalSquads} />
      </div>

      {loadError && (
        <ErrorNotice
          className="mt-6"
          title="Couldn't load the full leaderboard"
          detail={loadError}
          onRetry={() => window.location.reload()}
        />
      )}

      {/* Your campus standing / CTA */}
      <div className="mt-6">
        {loading ? (
          <Panel className="flex items-center justify-between gap-4 p-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <Skeleton className="hidden h-[34px] w-36 rounded-md sm:block" />
          </Panel>
        ) : userCollegeRank ? (
          <Panel className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Tape tone="accent">Your campus · #{userCollegeRank.rank}</Tape>
                <span className="font-mono text-[12px] text-ink-3 tabular">
                  {userCollegeRank.college.builderCount} builders · {userCollegeRank.college.activeSquadCount} active squads
                </span>
              </div>
              <h2 className="font-display text-[18px] font-semibold tracking-[-0.015em] text-ink break-words">
                {userCollegeRank.college.name}
              </h2>
              {userCollegeRank.nextCollegeName && (
                <p className="text-[13px] text-ink-3">
                  <span className="font-medium text-accent-ink">
                    {Math.ceil(userCollegeRank.pointsToNextRank / 10)} more builders
                  </span>{" "}
                  to overtake #{userCollegeRank.rank - 1} {userCollegeRank.nextCollegeName}.
                </p>
              )}
            </div>
            <Button
              variant="primary"
              icon={<Share2 aria-hidden />}
              onClick={() => handleShareWhatsApp(userCollegeRank.college.name, userCollegeRank.rank)}
              className="w-full sm:w-auto"
            >
              Invite campus mates
            </Button>
          </Panel>
        ) : userProfile ? (
          <Panel className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <Tape>College not set</Tape>
              <h2 className="text-[14.5px] font-semibold text-ink">Set your college to see your campus rank</h2>
              <p className="text-[13px] text-ink-3">
                Your profile counts toward your campus score once your college is added.
              </p>
            </div>
            <ButtonLink href="/profile/edit" variant="secondary" iconRight={<ArrowRight aria-hidden />} className="w-full sm:w-auto">
              Set college
            </ButtonLink>
          </Panel>
        ) : (
          <Panel className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <Tape>Where does your college rank?</Tape>
              <h2 className="text-[14.5px] font-semibold text-ink">Sign in to track your campus rank</h2>
              <p className="text-[13px] text-ink-3">
                Join builders from your college, form squads and move your campus up the board.
              </p>
            </div>
            <ButtonLink
              href={`/login?next=${encodeURIComponent(
                `/leaderboard${highlightedCollegeParam ? `?college=${encodeURIComponent(highlightedCollegeParam)}` : ""}`
              )}${highlightedCollegeParam ? `&college=${encodeURIComponent(highlightedCollegeParam)}` : ""}`}
              variant="primary"
              iconRight={<ArrowRight aria-hidden />}
              className="w-full sm:w-auto"
            >
              Sign in to see your rank
            </ButtonLink>
          </Panel>
        )}
      </div>

      {/* Top 3 podium */}
      {!loading && colleges.length >= 3 && (
        <section aria-label="Top 3 colleges" className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {colleges.slice(0, 3).map((college, i) => {
            const rank = i + 1;
            const RankIcon = rank === 1 ? Trophy : Award;
            return (
              <Panel key={college.name} className={cn("flex min-w-0 flex-col p-4", rank === 1 && "ring-1 ring-inset ring-warn/30")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[12px] font-semibold text-ink-2 tabular">
                    <RankIcon className="size-4 text-warn" aria-hidden />
                    {rankLabel(rank)}
                  </span>
                  <span className="truncate font-mono text-[12.5px] text-ink-3">{college.cityState}</span>
                </div>
                <h3 className="mt-3 line-clamp-2 font-display text-[16px] font-semibold leading-snug tracking-[-0.015em] text-ink">
                  {college.shortName}
                </h3>
                <p className="mt-1 font-mono text-[12px] text-ink-3 tabular">
                  {college.builderCount} builders · {college.activeSquadCount} squads
                </p>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                  <span className="font-display text-[20px] font-semibold leading-none text-ink tabular">
                    {college.powerScore}
                    <span className="ml-1 caps-label text-ink-3">pts</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Share2 aria-hidden />}
                    onClick={() => handleShareWhatsApp(college.name, rank)}
                    className="h-9 md:h-7"
                  >
                    Share
                  </Button>
                </div>
              </Panel>
            );
          })}
        </section>
      )}

      {/* Scoring methodology */}
      <Panel className="mt-8">
        <button
          type="button"
          onClick={() => setShowMethodology(!showMethodology)}
          aria-expanded={showMethodology}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-ok" aria-hidden />
            <span className="text-[13.5px] font-semibold text-ink">How scoring works</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[12.5px] text-ink-3">
            <span className="hidden sm:inline">{showMethodology ? "Hide formula" : "View formula"}</span>
            {showMethodology ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
          </span>
        </button>

        {showMethodology && (
          <div className="space-y-3 border-t border-line px-4 py-4 text-[13px] leading-relaxed text-ink-2">
            <p>Rankings use one fixed formula with no manual weighting:</p>
            <p className="rounded-md bg-sunken px-3 py-2 font-mono text-[12px] text-ink ring-1 ring-inset ring-line">
              Campus score = (Verified builders × 10) + (Active squads × 25)
            </p>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <li className="rounded-md border border-line p-3">
                <span className="mb-0.5 block font-semibold text-ink">Verified builders (10 pts)</span>
                <span className="text-ink-3">Only accounts with completed onboarding and a college set count. Empty signups score 0.</span>
              </li>
              <li className="rounded-md border border-line p-3">
                <span className="mb-0.5 block font-semibold text-ink">Active squads (25 pts)</span>
                <span className="text-ink-3">Teams need at least 2 members. Solo or empty teams score 0.</span>
              </li>
              <li className="rounded-md border border-line p-3">
                <span className="mb-0.5 block font-semibold text-ink">Privacy</span>
                <span className="text-ink-3">Builders who set their track record to private are left out of public rosters.</span>
              </li>
            </ul>
          </div>
        )}
      </Panel>

      {/* Rankings */}
      <section aria-label="College rankings" className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchField
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search college, acronym or city"
            label="Search colleges"
            className="w-full sm:max-w-sm"
          />
          <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
            <Segmented
              label="Region"
              size="sm"
              options={CATEGORY_OPTIONS}
              value={selectedCategory as CategoryFilter}
              onChange={(v) => setSelectedCategory(v)}
              className="shrink-0 whitespace-nowrap"
            />
          </div>
        </div>

        <Panel className="mt-3 overflow-hidden">
          {loading ? (
            <div className="px-4">
              <SkeletonRows rows={6} avatar="none" />
            </div>
          ) : filteredColleges.length === 0 ? (
            <div className="p-4">
              <EmptyState
                compact
                icon={<School />}
                title={searchQuery.trim() ? `No colleges match "${searchQuery}"` : "No ranked colleges yet"}
                body={searchQuery.trim() ? "Try another college name or clear the filter." : "Colleges appear once builders add their college to their profile."}
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {filteredColleges.map((college) => {
                const rank = colleges.findIndex((c) => c.name === college.name) + 1;
                const isExpanded = expandedCollege === college.name;
                const isUserCollege = userProfile?.college && normalizeCollege(userProfile.college) === college.name;

                // Opt-in active builders (respecting show_track_record !== false)
                const optInBuilders = college.builders.filter(
                  (b) => b.show_track_record !== false && !b.is_banned && b.onboarding_completed
                );

                return (
                  <li key={college.name} className={cn(isUserCollege && "bg-selected")}>
                    <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
                      <span className={cn("w-7 shrink-0 font-mono text-[12.5px] font-semibold tabular", rank <= 3 ? "text-ink-2" : "text-ink-3")}>
                        {rankLabel(rank)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          {rank <= 3 && (rank === 1 ? <Trophy className="size-3.5 shrink-0 text-warn" aria-hidden /> : <Award className="size-3.5 shrink-0 text-warn" aria-hidden />)}
                          <h4 className="truncate text-[14px] font-semibold text-ink">{college.shortName}</h4>
                          {isUserCollege && <Tape tone="accent" className="shrink-0">You</Tape>}
                        </div>
                        <p className="truncate font-mono text-[12px] text-ink-3">
                          {college.cityState} · {college.name}
                        </p>
                      </div>

                      <div className="hidden shrink-0 text-right sm:block">
                        <span className="block font-mono text-[12px] text-ink-2 tabular">{college.builderCount} devs</span>
                        <span className="block font-mono text-[12.5px] text-ink-3 tabular">{college.activeSquadCount} squads</span>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className="block font-display text-[17px] font-semibold leading-none text-ink tabular">
                          {college.powerScore}
                        </span>
                        <span className="caps-label text-ink-3">pts</span>
                      </div>

                      <div className="flex shrink-0 items-center">
                        <IconButton label={`Share ${college.shortName} on WhatsApp`} onClick={() => handleShareWhatsApp(college.name, rank)}>
                          <Share2 />
                        </IconButton>
                        <IconButton
                          label={isExpanded ? "Hide builders" : "Show builders"}
                          aria-expanded={isExpanded}
                          onClick={() => setExpandedCollege(isExpanded ? null : college.name)}
                        >
                          {isExpanded ? <ChevronUp /> : <ChevronDown />}
                        </IconButton>
                      </div>
                    </div>

                    {/* Expanded builders roster */}
                    {isExpanded && (
                      <div className="space-y-3 border-t border-line bg-sunken px-3 pb-4 pt-3 sm:px-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h5 className="caps-label text-ink-3">
                            Builders from {college.shortName} · {optInBuilders.length}
                          </h5>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={copiedCollege === college.name ? <Check aria-hidden /> : <Link2 aria-hidden />}
                            onClick={() => handleCopyLink(college.name)}
                            className="h-9 md:h-7"
                          >
                            {copiedCollege === college.name ? "Link copied" : "Copy campus link"}
                          </Button>
                        </div>

                        {optInBuilders.length === 0 ? (
                          <p className="text-[13px] text-ink-3">
                            No builders from this college have a public profile yet.
                          </p>
                        ) : (
                          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                            {optInBuilders.slice(0, 9).map((builder) => (
                              <li key={builder.id} className="min-w-0">
                                <Link
                                  href={`/profile/${builder.id}`}
                                  className="flex min-h-11 items-center gap-2.5 rounded-md border border-line bg-raised px-2.5 py-2 transition-colors hover:border-line-strong hover:bg-hover"
                                >
                                  <Avatar name={builder.full_name} src={builder.avatar_url} size="sm" />
                                  <span className="min-w-0">
                                    <span className="block truncate text-[13px] font-medium text-ink">
                                      {builder.full_name || "Anonymous builder"}
                                    </span>
                                    <span className="block truncate font-mono text-[12.5px] text-ink-3">
                                      {builder.skills && builder.skills.length > 0
                                        ? builder.skills.slice(0, 2).join(", ")
                                        : "Full-stack builder"}
                                    </span>
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </section>
    </Page>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading leaderboard" />}>
      <LeaderboardContent />
    </Suspense>
  );
}

