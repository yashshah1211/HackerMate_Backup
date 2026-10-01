"use client";

import { useEffect, useMemo, useState, Suspense, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Bookmark, CalendarSearch, Plus, SlidersHorizontal, Target, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";
import { SIH_HACKATHON_ID } from "@/lib/constants";
import { eventTimeline } from "@/lib/time";
import { cn } from "@/lib/utils";
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

function stripHtml(str: string | null): string {
  if (!str) return "";
  return str.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, "").trim();
}

export function formatPrizeDisplay(prize: string | null | undefined, currency?: string | null): string {
  if (!prize) return "";

  const clean = stripHtml(prize);
  if (!clean) return "";

  // If already starts with currency symbol, preserve as-is
  if (/^[₹$€£]/.test(clean)) {
    return clean;
  }

  // Check if string represents a monetary amount like "50,000", "1,00,000", "50K", "1 Lakh", "10M"
  const isNumericAmount = /^[\d,.\s]+(?:k|lakh|lac|crore|cr|m|million)?$/i.test(clean);

  // If prize description is descriptive text (e.g. "Nomination to SIH 2026 National Round", "Swag & Perks")
  if (!isNumericAmount) {
    return clean;
  }

  const isUSD = currency === "USD" || currency === "$" || clean.includes("$") || /\bUSD\b/i.test(clean);
  const targetSymbol = isUSD ? "$" : "₹";
  return `${targetSymbol} ${clean.replace(/^[₹$]\s*/, "")}`;
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

  let stateTape: ReactNode;
  if (isEventPast) stateTape = <Tape tone="neutral">Ended</Tape>;
  else if (t.state === "live") stateTape = <Tape tone="ok" dot>Live</Tape>;
  else if (t.state === "upcoming") stateTape = <Tape tone="accent">Upcoming</Tape>;
  else stateTape = <Tape tone="neutral">{t.state === "unknown" ? "Dates TBA" : "Started"}</Tape>;

  return (
    <li className="group relative flex gap-3.5 px-4 py-3.5 transition-colors hover:bg-hover sm:gap-4">
      {/* Date stamp */}
      <div className="flex w-9 shrink-0 flex-col items-center pt-0.5 font-mono leading-none" aria-hidden>
        <span className={cn("text-[17px] font-semibold tabular", isEventPast ? "text-ink-3" : "text-ink")}>{d.day}</span>
        <span className="mt-1 text-[12.5px] text-ink-3">{d.month}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/hackathons/${h.id}`}
              className={cn(
                "block truncate text-[15px] font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent/40",
                isEventPast ? "text-ink-2" : "text-ink",
              )}
            >
              {h.name}
            </Link>
            <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-3">
              <span>{platformLabel(h)}</span>
              {mode && (
                <>
                  <MetaDot />
                  <span>{mode}</span>
                </>
              )}
              <MetaDot />
              <span className="max-w-full truncate">{h.location || "Location TBA"}</span>
              {h.college && (
                <>
                  <MetaDot />
                  <span className="max-w-full truncate">{h.college}</span>
                </>
              )}
            </p>
          </div>
          <IconButton
            label={saved ? "Remove from saved" : "Save hackathon"}
            aria-pressed={saved}
            onClick={(e) => onToggleSave(e, h.id)}
            className={cn("relative z-10 -mr-1.5 -mt-1.5", saved && "text-accent-ink hover:text-accent-ink")}
          >
            <Bookmark className={saved ? "fill-current" : undefined} />
          </IconButton>
        </div>

        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-2 md:line-clamp-1">{getPlainPreview(h.description)}</p>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          {stateTape}
          {h.id === SIH_HACKATHON_ID && <Tape tone="sih">SIH</Tape>}
          {!isEventPast && (t.state === "live" || t.state === "upcoming") && (
            <span className={cn("font-mono text-[12px] tabular", t.urgent ? "text-warn" : "text-ink-3")}>{t.label}</span>
          )}
          <span className="font-mono text-[12px] text-ink-3 tabular">{formatDateRange(h.start_date, h.end_date)}</span>
          {prizeShort && (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 font-mono text-[12px] text-ink-2">
              <Trophy className="size-3.5 shrink-0 text-ink-3" aria-hidden />
              <span className="truncate">{prizeShort}</span>
            </span>
          )}
          {h.tags && h.tags.length > 0 && (
            <span className="flex min-w-0 flex-wrap gap-1">
              {h.tags.slice(0, 3).map((tag) => (
                <Chip key={tag} className="h-5 px-1.5 text-[12px]">
                  {tag}
                </Chip>
              ))}
              {h.tags.length > 3 && <Chip className="h-5 px-1.5 text-[12px]">+{h.tags.length - 3}</Chip>}
            </span>
          )}
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
            <span className="font-mono text-ink-2 tabular">{hackathons.length.toLocaleString("en-IN")}</span> listed ·{" "}
            <span className="font-mono text-ink-2 tabular">{upcomingCount.toLocaleString("en-IN")}</span> upcoming ·{" "}
            <span className="font-mono text-ink-2 tabular">{savedIds.size.toLocaleString("en-IN")}</span> saved
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

  const sihCallout = (
    <Link
      href="/hackathons/sih"
      className="group flex items-center gap-3.5 rounded-lg border border-line bg-raised px-4 py-3.5 transition-colors hover:border-line-strong hover:bg-hover"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[7px] bg-sih-soft text-sih ring-1 ring-inset ring-sih/25" aria-hidden>
        <Target className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <Tape tone="sih">SIH 2026</Tape>
          <span className="caps-label text-ink-3">Internal round</span>
        </span>
        <span className="mt-1 block text-[14.5px] font-semibold text-ink">Find teammates for Smart India Hackathon</span>
        <span className="mt-0.5 block text-[12.5px] text-ink-3">
          6-member teams from your college, at least one woman, filtered by institution.
        </span>
      </span>
      <span className={buttonClass("secondary", "md", "hidden shrink-0 sm:inline-flex")}>
        Open SIH hub
        <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
      <ArrowRight className="size-4 shrink-0 text-ink-3 sm:hidden" aria-hidden />
    </Link>
  );

  const filterGroups = (
    <div className="space-y-5">
      <div>
        <FieldLabel>Mode</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {MODE_OPTIONS.map(([v, label]) => (
            <FilterChip key={v || "any"} active={modeFilter === v} onClick={() => setModeFilter(v)}>
              {label}
            </FilterChip>
          ))}
        </div>
      </div>
      <div>
        <FieldLabel>Platform</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORM_OPTIONS.map(([v, label]) => (
            <FilterChip key={v || "any"} active={platformFilter === v} onClick={() => setPlatformFilter(v)}>
              {label}
            </FilterChip>
          ))}
        </div>
      </div>
      <div>
        <FieldLabel>Sort</FieldLabel>
        <Segmented<"date" | "prize">
          label="Sort hackathons"
          size="sm"
          value={sortBy === "prize" ? "prize" : "date"}
          onChange={(v) => setSortBy(v)}
          options={[
            { value: "date", label: "Date" },
            { value: "prize", label: "Prize (highest)" },
          ]}
        />
      </div>
    </div>
  );

  if (loading) {
    return (
      <Page>
        {header}
        <div className="mt-2">{sihCallout}</div>
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

      <div className="mt-2">{sihCallout}</div>

      {/* Scope + search */}
      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented<Tab> label="Hackathon scope" value={activeTab} onChange={setActiveTab} options={tabOptions} className="self-start" />
        <div className="flex min-w-0 gap-2 md:w-[340px]">
          <SearchField className="min-w-0 flex-1" value={search} onChange={setSearch} placeholder="Hackathon or tag" label="Search hackathons" />
          <Button
            variant="secondary"
            icon={<SlidersHorizontal />}
            onClick={() => setFiltersOpen(true)}
            aria-label="Filters"
            className="h-9 md:hidden"
          >
            {activeFilterCount > 0 ? activeFilterCount : null}
          </Button>
        </div>
      </div>

      {/* Desktop filters */}
      <div className="mt-3 hidden flex-wrap items-center gap-x-5 gap-y-2 md:flex">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Mode">
          <span className="mr-1 caps-label text-ink-3">Mode</span>
          {MODE_OPTIONS.map(([v, label]) => (
            <FilterChip key={v || "any"} active={modeFilter === v} onClick={() => setModeFilter(v)}>
              {label}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Platform">
          <span className="mr-1 caps-label text-ink-3">Platform</span>
          {PLATFORM_OPTIONS.map(([v, label]) => (
            <FilterChip key={v || "any"} active={platformFilter === v} onClick={() => setPlatformFilter(v)}>
              {label}
            </FilterChip>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2">
          <span className="caps-label text-ink-3">Sort</span>
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="h-7 w-auto text-[12.5px]">
            <option value="date">Date</option>
            <option value="prize">Prize (highest)</option>
          </Select>
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
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-raised" data-stagger>
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

