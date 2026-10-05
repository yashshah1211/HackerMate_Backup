"use client";

import { useEffect, useMemo, useState, Suspense, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Bookmark, CalendarSearch, Plus, SlidersHorizontal, Target, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { LogoMark } from "@/components/Logo";
import { useNotification } from "@/context/NotificationContext";

import { eventTimeline } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatPrizeDisplay } from "@/lib/hackathons/prizeDisplay";
import {
  Button,
  ButtonLink,
  Chip,
  EmptyState,
  ErrorNotice,
  FieldLabel,
  FilterChip,
  IconButton,
  Page,
  PageHeader,
  PageLoader,
  SearchField,
  Segmented,
  Select,
  Sheet,
  SkeletonRows,
  Tape,
  buttonClass,
} from "@/components/system";

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
};

function formatDateRange(start: string | null, end: string | null) {
  if (!start) return "Date TBA";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startStr = new Date(start).toLocaleDateString("en-US", opts);
  if (!end || end === start) return startStr;
  const endStr = new Date(end).toLocaleDateString("en-US", opts);
  return `${startStr} – ${endStr}`;
}

function getPlainPreview(html: string | null, maxLength: number = 145): string {
  if (!html) return "No description provided.";
  
  const plainText = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&hellip;/g, "...")
    .replace(/&middot;/g, "·")
    .replace(/&bull;/g, "•")
    .replace(/\s+/g, " ")
    .trim();

  if (plainText.length <= maxLength) return plainText;
  return plainText.slice(0, maxLength).trim() + "...";
}

function parsePrizeValue(prize: string | null, currency?: string | null): number {
  if (!prize) return 0;
  // Strip any HTML tags first (handles legacy DB values with markup)
  const stripped = prize.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, "").trim();
  const isUSD = currency === "USD" || currency === "$" || stripped.includes("$") || /\bUSD\b/i.test(stripped);
  // Remove commas and currency symbols, grab first number
  const clean = stripped.replace(/,/g, "").split(".")[0];
  const match = clean.match(/\d+/);
  if (!match) return 0;
  const value = parseInt(match[0], 10);
  // Normalize to INR for fair cross-currency comparison (1 USD ≈ ₹83)
  return isUSD ? value * 83 : value;
}

/* ─── Presentational helpers ─────────────────────────────────────────────── */

type Tab = "recommended" | "upcoming" | "saved" | "past";

/** Mono date stamp (day + 3-letter month), matching the landing's upcoming strip. */
function dayStamp(iso: string | null) {
  if (!iso) return { day: "--", month: "TBA" };
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("en-IN", { day: "2-digit", timeZone: "Asia/Kolkata" }),
    month: d.toLocaleDateString("en-US", { month: "short", timeZone: "Asia/Kolkata" }).toUpperCase(),
  };
}

/** Display label for where the event is hosted (mirrors the platform filter buckets). */
function platformLabel(h: Hackathon): string {
  if (h.type === "native") return "HackerMate";
  if (h.website_url) {
    const url = h.website_url.toLowerCase();
    if (url.includes("unstop.com")) return "Unstop";
    if (url.includes("hack2skill.com")) return "Hack2skill";
    if (url.includes("devfolio.co")) return "Devfolio";
  }
  return "External";
}

function modeLabel(mode: string | null): string | null {
  if (!mode) return null;
  const m = mode.toLowerCase();
  if (m.includes("person") || m.includes("offline")) return "In person";
  if (m.includes("online")) return "Online";
  if (m.includes("hybrid")) return "Hybrid";
  return mode;
}

const MODE_OPTIONS: [string, string][] = [
  ["", "Any"],
  ["online", "Online"],
  ["in-person", "In person"],
];

const PLATFORM_OPTIONS: [string, string][] = [
  ["", "Any"],
  ["native", "HackerMate"],
  ["unstop", "Unstop"],
  ["hack2skill", "Hack2skill"],
  ["devfolio", "Devfolio"],
  ["other", "Other"],
];

function MetaDot() {
  return (
    <span className="text-ink-4" aria-hidden>
      ·
    </span>
  );
}

function HackathonRow({
  h,
  saved,
  onToggleSave,
}: {
  h: Hackathon;
  saved: boolean;
  onToggleSave: (e: React.MouseEvent, id: string) => void;
}) {
  const todayStr = new Date().toISOString().split("T")[0];
  const isEventPast = Boolean(h.end_date && h.end_date < todayStr);
  const d = dayStamp(h.start_date);
  const t = eventTimeline(h.start_date, h.end_date);
  const prize = h.prize_pool ? formatPrizeDisplay(h.prize_pool, h.currency) : "";
  const prizeShort = prize.length > 35 ? `${prize.slice(0, 32)}...` : prize;
  const mode = modeLabel(h.mode);

  return (
    <li className="group relative flex flex-col sm:flex-row gap-4 sm:gap-5 py-5 px-3 sm:px-4 sm:-mx-4 rounded-xl transition-colors hover:bg-hover">
      {/* Date stamp */}
      <div className="flex w-10 shrink-0 flex-col items-center pt-0.5 font-mono leading-none" aria-hidden>
        <span className={cn("text-[18px] font-semibold tabular", isEventPast ? "text-ink-3" : "text-ink")}>{d.day}</span>
        <span className="mt-1 text-[11px] uppercase tracking-wider text-ink-3">{d.month}</span>
      </div>

      <div className="min-w-0 flex-1 flex gap-3 sm:gap-4">
        {/* Identity mark */}
        {h.type === "native" && (
          <div className="flex w-7 sm:w-8 shrink-0 items-start justify-center pt-0.5" aria-hidden>
            <LogoMark size={28} className="opacity-90 transition-opacity group-hover:opacity-100" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={`/hackathons/${h.id}`}
                className={cn(
                  "block truncate text-[15.5px] font-semibold outline-none after:absolute after:inset-0 after:content-[''] hover:underline decoration-line-strong underline-offset-4 focus-visible:ring-2 focus-visible:ring-accent",
                  isEventPast ? "text-ink-2" : "text-ink",
                )}
              >
                {h.name}
              </Link>
            </div>
            <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] text-ink-3">
              <span>{platformLabel(h)}</span>
              {mode && (
                <>
                  <MetaDot />
                  <span>{mode}</span>
                </>
              )}
              {h.location && (
                <>
                  <MetaDot />
                  <span className="truncate max-w-[200px]">{h.location}</span>
                </>
              )}
              {h.college && (
                <>
                  <MetaDot />
                  <span className="truncate max-w-[200px]">{h.college}</span>
                </>
              )}
            </p>
          </div>
          <IconButton
            label={saved ? "Remove from saved" : "Save hackathon"}
            aria-pressed={saved}
            onClick={(e) => onToggleSave(e, h.id)}
            className={cn("relative z-10 shrink-0 -mr-2 -mt-1.5 transition-colors", saved ? "text-accent-ink hover:text-accent-ink" : "text-ink-3 hover:text-ink")}
          >
            <Bookmark className={saved ? "fill-current" : undefined} size={18} />
          </IconButton>
        </div>

        <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2 sm:line-clamp-1">{getPlainPreview(h.description)}</p>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
          {/* Status */}
          {isEventPast ? (
            <span className="font-medium text-ink-3">Ended</span>
          ) : t.state === "live" ? (
            <span className="font-medium text-ink-2"><span className="text-ok">●</span> Live</span>
          ) : t.state === "upcoming" ? (
            <span className="font-medium text-ink-2">Upcoming</span>
          ) : (
            <span className="font-medium text-ink-3">{t.state === "unknown" ? "Dates TBA" : "Started"}</span>
          )}

          <MetaDot />

          {/* Deadline / Range */}
          {!isEventPast && (t.state === "live" || t.state === "upcoming") && (
            <>
              <span className={cn("font-medium", t.urgent ? "text-warn" : "text-ink-2")}>{t.label}</span>
              <MetaDot />
            </>
          )}
          <span className="text-ink-3">{formatDateRange(h.start_date, h.end_date)}</span>

          {prizeShort && (
            <>
              <MetaDot />
              <span className="inline-flex min-w-0 items-center gap-1 font-medium text-ink-2">
                <Trophy className="size-3 shrink-0 text-ink-3" aria-hidden />
                <span className="truncate">{prizeShort}</span>
              </span>
            </>
          )}

          {/* Tags */}
          {h.tags && h.tags.length > 0 && (
            <>
              <MetaDot />
              <span className="text-ink-3 truncate">
                {h.tags.filter(tag => tag.toLowerCase() !== platformLabel(h).toLowerCase()).slice(0, 3).join(" · ")}
                {h.tags.length > 3 && ` · +${h.tags.length - 3}`}
              </span>
            </>
          )}
        </div>
      </div>
      </div>
    </li>
  );
}

function HackathonsContent() {
  const { showToast } = useNotification();
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const searchParams = useSearchParams();

  // Tab controller
  const [activeTab, setActiveTab] = useState<"recommended" | "upcoming" | "saved" | "past">("recommended");

  useEffect(() => {
    const tabParam = searchParams?.get("tab");
    if (tabParam && ["recommended", "upcoming", "saved", "past"].includes(tabParam)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(tabParam as "recommended" | "upcoming" | "saved" | "past");
    }
  }, [searchParams]);

  async function loadHackathons() {
    // 1. Fetch hackathons
    const { data: hackathonData, error: hackathonError } = await supabase
      .from("hackathons")
      .select("*")
      .eq("archived", false)
      .order("start_date", { ascending: true });

    if (hackathonError) {
      console.error(hackathonError);
      setLoadError(hackathonError.message || "Unknown error");
    } else {
      setLoadError(null);
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      const validHackathons = (hackathonData || []).filter((h: any) => {
        const fb = h.ai_feedback || {};
        const status = h.status || fb.status || (h.type === "native" ? "pending" : "approved");
        if (status === "approved" || h.type === "external" || !h.type) return true;
        if (currentUser && h.organizer_id === currentUser.id) return true;
        return false;
      });

      setHackathons(validHackathons);
    }

    // 2. Fetch saved hackathons + user skills
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: savedData, error: savedError } = await supabase
        .from("saved_hackathons")
        .select("hackathon_id")
        .eq("user_id", user.id);

      if (savedError) {
        console.error("Error loading saved hackathons:", savedError);
      } else if (savedData) {
        setSavedIds(new Set(savedData.map((s) => s.hackathon_id)));
      }

      // Fetch user skills for recommendations
      const { data: profileData } = await supabase
        .from("profiles")
        .select("skills")
        .eq("id", user.id)
        .single();

      if (profileData?.skills) {
        setUserSkills(profileData.skills.map((s: string) => s.toLowerCase()));
      }
    }

    setLoading(false);
  }

  async function toggleSave(e: React.MouseEvent, hackathonId: string) {
    e.preventDefault();
    e.stopPropagation();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast("Please sign in to save hackathons.", "warning");
      return;
    }

    const isSaved = savedIds.has(hackathonId);
    if (isSaved) {
      const { error } = await supabase
        .from("saved_hackathons")
        .delete()
        .eq("user_id", user.id)
        .eq("hackathon_id", hackathonId);

      if (error) {
        console.error("Error removing saved hackathon:", error);
        showToast("Failed to unsave hackathon.", "error");
      } else {
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(hackathonId);
          return next;
        });
        showToast("Hackathon unsaved", "info");
      }
    } else {
      const { error } = await supabase
        .from("saved_hackathons")
        .insert({
          user_id: user.id,
          hackathon_id: hackathonId,
        });

      if (error) {
        console.error("Error saving hackathon:", error);
        showToast("Failed to save hackathon.", "error");
      } else {
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.add(hackathonId);
          return next;
        });
        showToast("Hackathon saved successfully!", "success");
      }
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      loadHackathons();
    });
  }, []);

  const filtered = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];

    const result = hackathons.filter((h) => {
      // 1. Tab filter
      if (activeTab === "saved") {
        if (!savedIds.has(h.id)) return false;
      } else if (activeTab === "recommended") {
        // Only upcoming hackathons with at least one tag matching user skills
        const isPast = h.end_date && h.end_date < todayStr;
        if (isPast) return false;
        if (!h.tags || h.tags.length === 0) return false;
        const hasMatch = h.tags.some((tag) =>
          userSkills.some((skill) =>
            tag.toLowerCase().includes(skill) || skill.includes(tag.toLowerCase())
          )
        );
        if (!hasMatch) return false;
      } else {
        const isPast = h.end_date && h.end_date < todayStr;
        if (activeTab === "upcoming" && isPast) return false;
        if (activeTab === "past" && !isPast) return false;
      }

      // 2. Search query filter
      const matchesSearch =
        !search ||
        h.name.toLowerCase().includes(search.toLowerCase()) ||
        h.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase()));

      // 3. Mode filter
      const matchesMode = !modeFilter || h.mode === modeFilter;

      // 4. Platform filter
      let platform = "other";
      if (h.type === "native") {
        platform = "native";
      } else if (h.website_url) {
        const url = h.website_url.toLowerCase();
        if (url.includes("unstop.com")) platform = "unstop";
        else if (url.includes("hack2skill.com")) platform = "hack2skill";
        else if (url.includes("devfolio.co")) platform = "devfolio";
      }
      const matchesPlatform = !platformFilter || platform === platformFilter;

      return matchesSearch && matchesMode && matchesPlatform;
    });

    // Apply sorting
    if (sortBy === "prize") {
      return result.sort((a, b) => parsePrizeValue(b.prize_pool, b.currency) - parsePrizeValue(a.prize_pool, a.currency));
    } else {
      // Default: sort by start date
      return result.sort((a, b) => {
        if (!a.start_date) return 1;
        if (!b.start_date) return -1;
        const timeA = new Date(a.start_date).getTime();
        const timeB = new Date(b.start_date).getTime();
        return activeTab === "past" ? timeB - timeA : timeA - timeB;
      });
    }
    }, [hackathons, savedIds, userSkills, search, modeFilter, platformFilter, sortBy, activeTab]);

  // Presentational counts for the header.
  const todayStr = new Date().toISOString().split("T")[0];
  const upcomingCount = hackathons.filter((h) => !(h.end_date && h.end_date < todayStr)).length;
  const activeFilterCount = (modeFilter ? 1 : 0) + (platformFilter ? 1 : 0) + (sortBy !== "date" ? 1 : 0);
  const hasAnyFilter = Boolean(search || modeFilter || platformFilter || sortBy !== "date");

  function clearFilters() {
    setSearch("");
    setModeFilter("");
    setPlatformFilter("");
    setSortBy("date");
  }

  const tabOptions: { value: Tab; label: string; count?: number }[] = [
    { value: "recommended", label: "For you" },
    { value: "upcoming", label: "Upcoming" },
    { value: "saved", label: "Saved", count: savedIds.size > 0 ? savedIds.size : undefined },
    { value: "past", label: "Past" },
  ];

  const header = (
    <PageHeader
      title="Hackathons"
      meta={
        loading ? (
          "Loading events…"
        ) : (
          <>
            <span className="font-medium text-ink-2 tabular-nums">{hackathons.length.toLocaleString("en-IN")}</span> listed ·{" "}
            <span className="font-medium text-ink-2 tabular-nums">{upcomingCount.toLocaleString("en-IN")}</span> upcoming ·{" "}
            <span className="font-medium text-ink-2 tabular-nums">{savedIds.size.toLocaleString("en-IN")}</span> saved
          </>
        )
      }
      actions={
        <ButtonLink href="/hackathons/create" variant="secondary" icon={<Plus />}>
          Host a hackathon
        </ButtonLink>
      }
    />
  );

  const filterGroups = (
    <div className="space-y-6">
      <div>
        <div className="mb-2"><FieldLabel>Mode</FieldLabel></div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {MODE_OPTIONS.map(([v, label]) => (
            <button
              key={v || "any"}
              onClick={() => setModeFilter(v)}
              className={cn(
                "text-[13.5px] transition-colors relative pb-1",
                modeFilter === v ? "text-ink font-semibold" : "text-ink-3 hover:text-ink-2"
              )}
            >
              {label}
              {modeFilter === v && <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-ink" />}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2"><FieldLabel>Platform</FieldLabel></div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {PLATFORM_OPTIONS.map(([v, label]) => (
            <button
              key={v || "any"}
              onClick={() => setPlatformFilter(v)}
              className={cn(
                "text-[13.5px] transition-colors relative pb-1",
                platformFilter === v ? "text-ink font-semibold" : "text-ink-3 hover:text-ink-2"
              )}
            >
              {label}
              {platformFilter === v && <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-ink" />}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2"><FieldLabel>Sort</FieldLabel></div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {[
            { value: "date", label: "Date" },
            { value: "prize", label: "Prize (highest)" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={cn(
                "text-[13.5px] transition-colors relative pb-1",
                sortBy === opt.value ? "text-ink font-semibold" : "text-ink-3 hover:text-ink-2"
              )}
            >
              {opt.label}
              {sortBy === opt.value && <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-ink" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <Page>
        {header}
        <SkeletonRows rows={6} avatar="square" className="mt-6" />
      </Page>
    );
  }

  const emptyBody =
    activeTab === "recommended"
      ? userSkills.length === 0
        ? "Add skills to your profile and we'll match hackathons to them."
        : "No upcoming hackathons match your skills right now. Check back after the next weekly refresh."
      : activeTab === "saved"
        ? "You haven't saved any events yet. Use the bookmark on any hackathon to keep it here."
        : activeTab === "upcoming"
          ? "No upcoming events match your search. Try Past."
          : "No past events match your filters.";

  return (
    <Page>
      {header}

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-line self-start sm:w-auto w-full">
          {tabOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setActiveTab(opt.value)}
              className={cn(
                "relative pb-2.5 text-[14.5px] transition-colors font-medium",
                activeTab === opt.value ? "text-ink" : "text-ink-3 hover:text-ink-2",
              )}
            >
              {opt.label}
              {opt.count !== undefined && <span className="ml-1.5 text-[12px] text-ink-4">{opt.count}</span>}
              {activeTab === opt.value && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-ink" />
              )}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 gap-2 lg:w-[340px]">
          <SearchField className="min-w-0 flex-1" value={search} onChange={setSearch} placeholder="Search hackathons or tags..." label="Search hackathons" />
          <Button
            variant="secondary"
            icon={<SlidersHorizontal />}
            onClick={() => setFiltersOpen(true)}
            aria-label="Filters"
            className="h-9 lg:hidden"
          >
            {activeFilterCount > 0 ? activeFilterCount : null}
          </Button>
        </div>
      </div>

      {/* Desktop filters */}
      <div className="mt-4 hidden lg:flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-ink-3">Mode:</span>
          <div className="flex flex-wrap gap-3">
            {MODE_OPTIONS.map(([v, label]) => (
              <button
                key={v || "any"}
                onClick={() => setModeFilter(v)}
                className={cn(
                  "text-[13px] transition-colors relative",
                  modeFilter === v ? "text-ink font-medium" : "text-ink-3 hover:text-ink-2"
                )}
              >
                {label}
                {modeFilter === v && <span className="absolute -bottom-1 left-0 right-0 h-[1.5px] rounded-t-full bg-ink" />}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 border-l border-line pl-6">
          <span className="text-[13px] text-ink-3">Platform:</span>
          <div className="flex flex-wrap gap-3">
            {PLATFORM_OPTIONS.map(([v, label]) => (
              <button
                key={v || "any"}
                onClick={() => setPlatformFilter(v)}
                className={cn(
                  "text-[13px] transition-colors relative",
                  platformFilter === v ? "text-ink font-medium" : "text-ink-3 hover:text-ink-2"
                )}
              >
                {label}
                {platformFilter === v && <span className="absolute -bottom-1 left-0 right-0 h-[1.5px] rounded-t-full bg-ink" />}
              </button>
            ))}
          </div>
        </div>

        <label className="ml-auto flex items-center gap-2 text-[13px] text-ink-3">
          Sort by:
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-transparent text-ink font-medium focus:outline-none cursor-pointer"
          >
            <option value="date">Date</option>
            <option value="prize">Prize (highest)</option>
          </select>
        </label>
      </div>

      {/* Results count */}
      <div className="mb-3 mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-ink-3">
          <span className="font-mono text-ink-2 tabular">{filtered.length}</span> event{filtered.length !== 1 ? "s" : ""}
        </p>
        {hasAnyFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[12.5px] font-medium text-ink-3 underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
          >
            Clear filters
          </button>
        )}
      </div>

      {loadError && (
        <ErrorNotice
          className="mb-4"
          title="Couldn't load hackathons"
          detail={loadError}
          onRetry={() => {
            loadHackathons();
          }}
        />
      )}

      {loadError && hackathons.length === 0 ? null : filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarSearch />}
          title="No events found"
          body={emptyBody}
          action={
            hasAnyFilter ? (
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-line border-y border-line" data-stagger>
          {filtered.map((h) => (
            <HackathonRow key={h.id} h={h} saved={savedIds.has(h.id)} onToggleSave={toggleSave} />
          ))}
        </ul>
      )}

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter hackathons"
        label="Filter hackathons"
        footer={
          <div className="flex gap-2">
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setModeFilter("");
                  setPlatformFilter("");
                  setSortBy("date");
                }}
              >
                Reset
              </Button>
            )}
            <Button variant="inverse" className="flex-1" onClick={() => setFiltersOpen(false)}>
              Show {filtered.length} event{filtered.length !== 1 ? "s" : ""}
            </Button>
          </div>
        }
      >
        <div className="px-4 py-4">{filterGroups}</div>
      </Sheet>
    </Page>
  );
}

export default function HackathonsPage() {
  return (
    <AuthGuard>
      <Suspense fallback={<PageLoader label="Loading hackathons" />}>
        <HackathonsContent />
      </Suspense>
    </AuthGuard>
  );
}

