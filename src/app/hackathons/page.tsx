"use client";

import { useCallback, useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bookmark, CalendarSearch, Plus, SlidersHorizontal, Target, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import BrowsingBoundary from "@/components/hackathons/BrowsingBoundary";
import { DiscoveryDropdown } from "@/components/hackathons/DiscoveryDropdown";
import { CopyDiscoveryLink } from "@/components/hackathons/CopyDiscoveryLink";
import { loadPublicEvents, verifyBrowsingAccess, browsingActionHref, type BrowsingAccess } from "@/lib/hackathons/publicBrowsing";
import { LogoMark } from "@/components/Logo";
import { useNotification } from "@/context/NotificationContext";

import SourceInformation from "@/components/hackathons/SourceInformation";
import { dateLabel, registrationLabel, eventStateLabel, scheduleIsUnverified } from "@/lib/hackathons/lifecycle";
import { cn } from "@/lib/utils";
import { discoverEvents, readDiscoverySettings, discoveryQuery, eventState, eventDate, eventFormat,
  eventPlatform, knownLocation, eventTopics, listedTags, plainEventText, prizeLabel, discoveryReason,
  type DiscoveryEvent as Hackathon, type DiscoverySettings, type DiscoveryTab as Tab } from "@/lib/hackathons/discovery";
import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorNotice,
  FieldLabel,
  IconButton,
  Page,
  PageHeader,
  PageLoader,
  SearchField,
  Sheet,
  SkeletonRows,
} from "@/components/system";

function formatDateRange(start: string | null, end: string | null) {
  const label = (value: string) => new Date(eventDate(value)!).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
  const validStart = eventDate(start) !== null, validEnd = eventDate(end) !== null;
  if (validStart && validEnd && eventDate(end, true)! <= eventDate(start)!) return "Date information inconsistent";
  if (!validStart) return validEnd ? `Ends ${label(end!)}` : "Date TBA";
  return !validEnd || end === start ? label(start!) : `${label(start!)} – ${label(end!)}`;
}

function getPlainPreview(html: string | null, maxLength = 145): string {
  const text = plainEventText(html) || "No description provided.";
  return text.length <= maxLength ? text : `${text.slice(0, maxLength).trim()}...`;
}

/* ─── Presentational helpers ─────────────────────────────────────────────── */

/** Mono date stamp (day + 3-letter month), matching the landing's upcoming strip. */
function dayStamp(iso: string | null) {
  const time = eventDate(iso);
  if (time === null) return { day: "--", month: "TBA" };
  const d = new Date(time);
  return {
    day: d.toLocaleDateString("en-IN", { day: "2-digit", timeZone: "Asia/Kolkata" }),
    month: d.toLocaleDateString("en-US", { month: "short", timeZone: "Asia/Kolkata" }).toUpperCase(),
  };
}

/** Display label for where the event is hosted (mirrors the platform filter buckets). */
const PLATFORM_LABELS: Record<string, string> = { native: "HackerMate", unstop: "Unstop", hack2skill: "Hack2skill", devfolio: "Devfolio", other: "External" };
const FORMAT_LABELS: Record<string, string> = { online: "Online", "in-person": "In person", hybrid: "Hybrid" };
const SORT_OPTIONS = [
  { value: "relevant", label: "Best match" }, { value: "date", label: "Starting soon" },
  { value: "recent", label: "Recently added" }, { value: "prize-inr", label: "Highest INR prize" }, { value: "prize-usd", label: "Highest USD prize" },
];

const MODE_OPTIONS: [string, string][] = [
  ["", "Any"],
  ["online", "Online"],
  ["in-person", "In person"],
  ["hybrid", "Hybrid"],
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
  now,
  reason,
}: {
  h: Hackathon;
  saved: boolean;
  now: number;
  reason?: string;
  onToggleSave: (e: React.MouseEvent, id: string) => void;
}) {
  const state = eventState(h, now);
  const isEventPast = state === "ended";
  const d = dayStamp(h.start_date);
  const prize = prizeLabel(h);
  const location = knownLocation(h.location);
  const deadline = eventDate(h.registration_end, true);
  const prizeShort = prize.length > 35 ? `${prize.slice(0, 32)}...` : prize;
  const mode = FORMAT_LABELS[eventFormat(h.mode)] || "Format not specified";

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
              <span>{PLATFORM_LABELS[eventPlatform(h)]}</span>
              {mode && (
                <>
                  <MetaDot />
                  <span>{mode}</span>
                </>
              )}
              {(location || eventFormat(h.mode) !== "online") && (
                <>
                  <MetaDot />
                  <span className="truncate max-w-[200px]">{location || "Location not specified"}</span>
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
          <span className={cn("font-medium", state === "ongoing" ? "text-ok" : "text-ink-3")}>{eventStateLabel(h, now)}</span>
          <MetaDot />
          <span className="text-ink-3">{scheduleIsUnverified(h, now) && "Listed dates, unverified: "}{formatDateRange(h.start_date, h.end_date)}</span>

          {prizeShort && (
            <>
              <MetaDot />
              <span className="inline-flex min-w-0 items-center gap-1 font-medium text-ink-2">
                <Trophy className="size-3 shrink-0 text-ink-3" aria-hidden />
                <span className="truncate" title={prize}>{prizeShort}</span>
              </span>
            </>
          )}

          {listedTags(h.tags).length > 0 && <>
            <MetaDot />
            <span className="text-ink-3 truncate">{listedTags(h.tags).slice(0, 3).join(" · ")}{listedTags(h.tags).length > 3 && ` · +${listedTags(h.tags).length - 3}`}</span>
          </>}
        </div>
        <p className="mt-2 text-[13px] font-medium text-ink-2">{registrationLabel(h, now)}</p>
        <p className="mt-1 text-[12.5px] text-ink-3">{deadline === null ? "Registration deadline not listed · check the organizer site" : `${now >= deadline ? "Registration deadline passed" : "Registration deadline"}: ${dateLabel(h.registration_end)}`}</p>
        <SourceInformation event={h} now={now} compact />
        {reason && <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-3"><Target className="size-3 shrink-0" aria-hidden />{reason}</p>}
      </div>
      </div>
    </li>
  );
}

function HackathonsContent({ access }: { access: Extract<BrowsingAccess, { kind: "guest" | "member" }> }) {
  const { showToast } = useNotification();
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showEvidenceInfo, setShowEvidenceInfo] = useState(false);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const [actionPrompt, setActionPrompt] = useState(false);
  const [personalError, setPersonalError] = useState(false);
  const alive = useRef(true);
  const loadRequest = useRef(0);
  const loadingRequests = useRef(new Set<AbortController>());
  const saving = useRef(new Set<string>());
  const canParticipate = access.kind === "member" && access.onboarded;
  const [now, setNow] = useState(() => Date.now());
  const searchParams = useSearchParams();
  const settings = readDiscoverySettings(searchParams);
  const { tab: activeTab, q: search, mode: modeFilter, platform: platformFilter, sort: sortBy } = settings;
  function updateSettings(patch: Partial<DiscoverySettings>) {
    const query = discoveryQuery(new URLSearchParams(window.location.search), patch);
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }
  const setSearch = (q: string) => updateSettings({ q });
  const setModeFilter = (mode: string) => updateSettings({ mode });
  const setPlatformFilter = (platform: string) => updateSettings({ platform });
  const setSortBy = (sort: string) => updateSettings({ sort: sort as DiscoverySettings["sort"] });
  const setActiveTab = (tab: Tab) => updateSettings({ tab });
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(clock);
  }, []);

  async function loadHackathons() {
    loadingRequests.current.forEach(controller => controller.abort());
    const controller = new AbortController();
    loadingRequests.current.add(controller);
    const request = ++loadRequest.current;
    const current = () => alive.current && request === loadRequest.current && !controller.signal.aborted;
    try {
      const events = await loadPublicEvents(supabase, controller.signal);
      if (!current()) return;
      setHackathons(events);
      setLoadError(null);
      if (access.kind === "member") {
        const [saved, profile] = await Promise.all([
          supabase.from("saved_hackathons").select("hackathon_id").eq("user_id", access.userId),
          supabase.from("profiles").select("skills").eq("id", access.userId).single(),
        ]);
        if (!current()) return;
        if (saved.error) console.error("Saved events unavailable:", saved.error);
        if (profile.error) console.error("Recommendations unavailable:", profile.error);
        setPersonalError(Boolean(saved.error || profile.error));
        if (!saved.error) setSavedIds(new Set((saved.data || []).map(row => row.hackathon_id)));
        if (!profile.error) setUserSkills(listedTags(profile.data?.skills));
      }
    } catch (error) {
      if (!controller.signal.aborted) console.error("Hackathon listing failed:", error);
      if (current()) setLoadError("Events are unavailable. Please retry.");
    } finally {
      loadingRequests.current.delete(controller);
      if (current()) setLoading(false);
    }
  }

  async function toggleSave(e: React.MouseEvent, hackathonId: string) {
    e.preventDefault();
    e.stopPropagation();

    if (!canParticipate) { setActionPrompt(true); return; }
    if (saving.current.has(hackathonId)) return;
    saving.current.add(hackathonId);
    const verified = await verifyBrowsingAccess(supabase);
    if (!alive.current) { saving.current.delete(hackathonId); return; }
    if (verified.kind !== "member" || !verified.onboarded || access.kind !== "member" || verified.userId !== access.userId) {
      saving.current.delete(hackathonId);
      showToast("Your account could not be authorized. Reload before saving.", "warning");
      return;
    }
    const user = { id: verified.userId };
    try {
      const isSaved = savedIds.has(hackathonId);
      if (isSaved) {
        const { error } = await supabase
          .from("saved_hackathons")
          .delete()
          .eq("user_id", user.id)
          .eq("hackathon_id", hackathonId);

        if (!alive.current) return;
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

        if (!alive.current) return;
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
    } catch (error) {
      console.error("Bookmark failed:", error);
      if (alive.current) showToast("Could not update saved event.", "error");
    } finally { saving.current.delete(hackathonId); }
  }

  useEffect(() => {
    alive.current = true;
    const requests = loadingRequests.current;
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) void loadHackathons(); });
    return () => {
      cancelled = true;
      alive.current = false;
      requests.forEach(controller => controller.abort());
      requests.clear();
    };
    // Access changes remount this subtree at the boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = discoverEvents(hackathons, settings, userSkills, savedIds, now);
  const topics = [...new Map(hackathons.flatMap(h => eventTopics(h)).map(tag => [tag.toLowerCase(), tag])).entries()]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  // The headline describes the full currently verified catalog, not just the search results.
  const openCount = discoverEvents(hackathons,
    { ...readDiscoverySettings(new URLSearchParams()), tab: "open" }, userSkills, savedIds, now).length;
  // Visibility is based on the entire trusted catalog, never on the current search/filters.
  // This avoids an unhelpful zero tab while keeping ongoing detection and deep links intact.
  const ongoingCatalogCount = discoverEvents(hackathons,
    { ...readDiscoverySettings(new URLSearchParams()), tab: "ongoing" }, userSkills, savedIds, now).length;
  const activeCount = discoverEvents(hackathons, { ...settings, tab: "active" }, userSkills, savedIds, now).length;
  const defaultSort = activeTab === "recommended" ? "relevant" : "date";
  const activeFilterCount = [search.trim(), modeFilter, platformFilter, settings.topic, settings.from, settings.to,
    settings.participation, settings.registration, settings.registrationFrom, settings.registrationTo, sortBy !== defaultSort ? sortBy : ""].filter(Boolean).length;
  const advancedFilterCount = [platformFilter, settings.topic, settings.from, settings.to,
    settings.participation, settings.registration, settings.registrationFrom, settings.registrationTo,
    sortBy !== defaultSort ? sortBy : ""].filter(Boolean).length;
  const hasAnyFilter = activeFilterCount > 0;
  function clearFilters() {
    updateSettings({ q: "", mode: "", platform: "", topic: "", from: "", to: "", participation: "", registration: "", registrationFrom: "", registrationTo: "", sort: defaultSort });
  }

  // Keep legacy URL tabs (open, past, upcoming and recommended) working while
  // offering three clear public choices instead of overlapping technical filters.
  const tabOptions: { value: Tab; label: string; count?: number }[] = [
    { value: "active", label: "Available now", count: activeCount },
    ...(ongoingCatalogCount > 0 || activeTab === "ongoing"
      ? [{ value: "ongoing" as Tab, label: "Happening now", count: ongoingCatalogCount || undefined }]
      : []),
    { value: "all", label: "Explore all" },
    { value: "saved", label: "Saved", count: savedIds.size || undefined },
  ];

  const header = (
    <PageHeader
      title="Hackathons"
      meta={
        loading ? (
          "Loading events…"
        ) : loadError && hackathons.length === 0 ? (
          "Events unavailable"
        ) : (
          <>
            <span className="font-medium text-ink tabular-nums">{openCount.toLocaleString("en-IN")}</span> accepting registrations
          </>
        )
      }
      actions={
        <ButtonLink href={canParticipate ? "/hackathons/create" : browsingActionHref("/hackathons/create", access.kind === "member")} variant="secondary" icon={<Plus />}>
          Host a hackathon
        </ButtonLink>
      }
    />
  );

  const extraFilters = (suffix: string) => <>
    <div><FieldLabel htmlFor={`hk-topic-${suffix}`}>Topic / domain</FieldLabel>
      <DiscoveryDropdown id={`hk-topic-${suffix}`} label="Topic / domain" value={settings.topic} onChange={topic => updateSettings({ topic })}
        options={[{ value: "", label: "Any listed topic" },
          ...(settings.topic && !topics.some(([key]) => key === settings.topic) ? [{ value: settings.topic, label: `${settings.topic} (not listed)` }] : []),
          ...topics.map(([value, label]) => ({ value, label }))]} /></div>
    <div><FieldLabel htmlFor={`hk-from-${suffix}`}>Starts from</FieldLabel><input id={`hk-from-${suffix}`} type="date" value={settings.from} onChange={e => updateSettings({ from: e.target.value })} className="h-9 w-full rounded-md bg-sunken px-3 text-[13px] text-ink ring-1 ring-line" /></div>
    <div><FieldLabel htmlFor={`hk-to-${suffix}`}>Starts by</FieldLabel><input id={`hk-to-${suffix}`} type="date" value={settings.to} onChange={e => updateSettings({ to: e.target.value })} className="h-9 w-full rounded-md bg-sunken px-3 text-[13px] text-ink ring-1 ring-line" /></div>
    <div><FieldLabel htmlFor={`hk-registration-from-${suffix}`}>Registration deadline from</FieldLabel><input id={`hk-registration-from-${suffix}`} type="date" value={settings.registrationFrom} onChange={e => updateSettings({ registrationFrom: e.target.value })} className="h-9 w-full rounded-md bg-sunken px-3 text-[13px] text-ink ring-1 ring-line" /></div>
    <div><FieldLabel htmlFor={`hk-registration-to-${suffix}`}>Registration deadline by</FieldLabel><input id={`hk-registration-to-${suffix}`} type="date" value={settings.registrationTo} onChange={e => updateSettings({ registrationTo: e.target.value })} className="h-9 w-full rounded-md bg-sunken px-3 text-[13px] text-ink ring-1 ring-line" /></div>
    <div><FieldLabel htmlFor={`hk-size-${suffix}`}>Participation</FieldLabel><DiscoveryDropdown id={`hk-size-${suffix}`} label="Participation" value={settings.participation} onChange={participation => updateSettings({ participation })}
        options={[{ value: "", label: "Any team size" }, { value: "solo", label: "Solo allowed (listed)" }, { value: "team", label: "Teams allowed (listed)" }]} /></div>
    <div><FieldLabel htmlFor={`hk-registration-${suffix}`}>Registration availability</FieldLabel><DiscoveryDropdown id={`hk-registration-${suffix}`} label="Registration availability" value={settings.registration} onChange={registration => updateSettings({ registration })}
        options={[{ value: "", label: "Default for this view" }, { value: "open", label: "Registration open" }, { value: "closed", label: "Registration closed" }, { value: "unknown", label: "Availability unverified" }, { value: "not-yet-open", label: "Not yet open" }, { value: "all", label: "Include closed registrations" }, { value: "not-closed", label: "Exclude confirmed closed" }, { value: "recorded", label: "Deadline listed (including closed)" }]} /></div>
  </>;

  const filterGroups = (
    <div className="space-y-6">
      <div>
        <div className="mb-2"><FieldLabel>Mode</FieldLabel></div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {MODE_OPTIONS.map(([v, label]) => (
            <button
              key={v || "any"}
              onClick={() => setModeFilter(v)}
              aria-pressed={modeFilter === v}
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
              aria-pressed={platformFilter === v}
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
      {extraFilters("mobile")}
      <div>
        <div className="mb-2"><FieldLabel>Sort</FieldLabel></div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {SORT_OPTIONS.map((opt) => (
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

  const emptyBody = hasAnyFilter ? "No events match these settings. Clear filters to explore more events."
    : activeTab === "saved" ? "You haven't saved any listed events yet. Use a bookmark to keep an event here."
    : activeTab === "past" ? "No listings with past dates match this view. Imported schedules remain unverified."
    : activeTab === "ongoing" ? "We can’t currently confirm an event is happening right now. Some organizers haven’t published verifiable event dates yet; try Available now for open registrations."
    : activeTab === "upcoming" ? "No currently verified upcoming hackathons match this view."
    : activeTab === "all" ? "No public listings match this view."
    : "No currently verified opportunities match this view. Try Explore all to review other listings.";

  return (
    <Page>
      {header}

      <div className="mt-6 flex flex-col gap-4">
        <div role="tablist" aria-label="Browse hackathons" className="flex flex-wrap gap-2">
          {tabOptions.map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => setActiveTab(opt.value)}
              role="tab"
              aria-selected={activeTab === opt.value || (activeTab === "open" && opt.value === "active")}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 py-2 text-[13.5px] font-medium transition-colors",
                activeTab === opt.value || (activeTab === "open" && opt.value === "active")
                  ? "border-accent bg-accent text-on-accent" : "border-line bg-sunken text-ink-2 hover:border-line-strong hover:text-ink"
              )}
            >
              {opt.label}
              {opt.count !== undefined && <span className="text-[12px] opacity-75 tabular-nums">{opt.count}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchField className="min-w-0 flex-1" value={search} onChange={setSearch}
            placeholder="Search hackathons, topics or colleges" label="Search hackathons" />
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 sm:w-[160px] sm:flex-none">
              <DiscoveryDropdown id="hk-mode-quick" label="Event format" value={modeFilter}
                onChange={setModeFilter} options={[
                  { value: "", label: "All formats" }, { value: "online", label: "Online" },
                  { value: "in-person", label: "In person" }, { value: "hybrid", label: "Hybrid" },
                ]} />
            </div>
            <Button variant="secondary" icon={<SlidersHorizontal />} onClick={() => setFiltersOpen(true)}
              aria-label="More hackathon filters" className="h-9 whitespace-nowrap">
              Filters{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}
            </Button>
          </div>
        </div>
      </div>

      {activeTab === "all" && (
        <p className="mt-3 text-[12.5px] text-ink-3">
          Full directory: {hackathons.length.toLocaleString("en-IN")} listings, including older and unverified events.
          Not all are accepting registrations; check the official organizer page.
        </p>
      )}
      {activeTab === "ongoing" && (
        <p className="mt-3 text-[12.5px] text-ink-3">
          Happening now only includes events whose current event dates are confirmed by their source.
          Unverified schedules aren’t counted.
        </p>
      )}
      {["past", "upcoming", "recommended"].includes(activeTab) && (
        <p className="mt-3 text-[12.5px] text-ink-3">
          Viewing a saved link to an older discovery view. Switch to Available now or Explore all to browse.
        </p>
      )}
      <button type="button" className="mt-2 text-left text-[12px] text-ink-3 underline underline-offset-4 hover:text-ink-2"
        aria-expanded={showEvidenceInfo} onClick={() => setShowEvidenceInfo(v => !v)}>
        {showEvidenceInfo ? "Hide verification details" : "How are these listings verified?"}
      </button>
      {showEvidenceInfo && (
        <p role="note" className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-ink-2">
          Available now means registration is confirmed open or the event itself is verified as running.
          Happening now requires current evidence for both event dates; registration can already be closed.
          Source checks expire after 26 hours. We retain other historical and uncertain listings in Explore all,
          and official registration always happens on the provider’s website.
        </p>
      )}
      {sortBy.startsWith("prize-") && <p className="mt-1 text-[12px] text-ink-3">Known {sortBy === "prize-inr" ? "INR" : "USD"} cash prizes first; other rewards follow. No currency conversion.</p>}
      {settings.from && settings.to && settings.from > settings.to && <p role="alert" className="mt-2 text-[13px] text-warn">Choose a “Starts by” date on or after “Starts from”.</p>}

      {settings.registrationFrom && settings.registrationTo && settings.registrationFrom > settings.registrationTo && <p role="alert" className="mt-2 text-[13px] text-warn">Choose a registration deadline end day on or after its start day.</p>}
      {/* Results count */}
      {!(loadError && hackathons.length === 0) && <div className="mb-3 mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-ink-3">
          <span className="font-semibold text-ink tabular-nums">{filtered.length}</span> hackathon{filtered.length !== 1 ? "s" : ""} found
        </p>
        {hasAnyFilter && <span className="text-[12px] text-ink-3">{activeFilterCount} selected filter{activeFilterCount === 1 ? "" : "s"}</span>}
        {hasAnyFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[12.5px] font-medium text-ink-3 underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
          >
            Clear filters
          </button>
        )}
      </div>}

      <div className="mt-1"><CopyDiscoveryLink searchParams={searchParams} compact /></div>

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

      {personalError && <ErrorNotice title="Personalized events unavailable" detail="Saved events or recommendations could not be verified." onRetry={() => { void loadHackathons(); }} />}
      {(actionPrompt || (activeTab === "saved" && !canParticipate)) && <EmptyState title={access.kind === "guest" ? "Sign in to save events" : "Complete your profile to participate"} body="Browse freely. After signing in, return here and choose the action yourself." action={<ButtonLink href={browsingActionHref(`/hackathons${searchParams.toString() ? `?${searchParams}` : ""}`, access.kind === "member")}>{access.kind === "guest" ? "Sign in" : "Complete onboarding"}</ButtonLink>} />}
      {loadError && hackathons.length === 0 || activeTab === "saved" && (!canParticipate || personalError) ? null : filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarSearch />}
          title="No events found"
          body={emptyBody}
          action={
            ["active", "open", "ongoing"].includes(activeTab) && hackathons.length > 0 ? (
              <Button size="sm" variant="secondary" onClick={() => setActiveTab("all")}>
                Browse all listings ({hackathons.length})
              </Button>
            ) : hasAnyFilter ? (
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-line border-y border-line" data-stagger>
          {filtered.map((h) => (
            <HackathonRow key={h.id} h={h} now={now} reason={activeTab === "recommended" || sortBy === "relevant" ? discoveryReason(h, userSkills, now) : undefined} saved={savedIds.has(h.id)} onToggleSave={toggleSave} />
          ))}
        </ul>
      )}

      <Sheet
        open={filtersOpen}
        onClose={closeFilters}
        title="Filter hackathons"
        label="Filter hackathons"
        footer={
          <div className="flex gap-2">
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                onClick={clearFilters}
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
        <div className="px-4 py-4">
          {filterGroups}
          <div className="mt-6 border-t border-line pt-4">
            <p className="mb-2 text-[12px] font-semibold text-ink-2">More ways to browse</p>
            <button type="button" className="text-sm text-ink-2 underline underline-offset-4 hover:text-ink"
              onClick={() => { setActiveTab("past"); setFiltersOpen(false); }}>
              See past events
            </button>
          </div>
        </div>
      </Sheet>
    </Page>
  );
}

export default function HackathonsPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading hackathons" />}>
      <BrowsingBoundary>{access => <HackathonsContent access={access} />}</BrowsingBoundary>
    </Suspense>
  );
}

