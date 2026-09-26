"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { promptDiscoverySignIn, PUBLIC_HACKATHON_COLUMNS } from "@/lib/discovery-auth";
import { useNotification } from "@/context/NotificationContext";
import { ArrowRight, Bookmark, Building2, CalendarDays, MapPin, Plus, Search, SlidersHorizontal, Target, Trophy, Zap } from "lucide-react";

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

type ListedHackathon = Hackathon & { status?: string | null; ai_feedback?: { status?: string | null } | null };

const filterControlClass = "h-11 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-3.5 text-sm text-zinc-100 outline-none transition-all duration-200 placeholder:text-zinc-500 hover:border-white/[0.22] focus:border-[#B4F461]/60 focus:bg-zinc-900/75 focus:ring-2 focus:ring-[#B4F461]/10";
const glassShadow = "shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.05)]";

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
  
  let cleaned = html
    .replace(/\/\*[\s\S]*?\*\//gi, "")
    .replace(/(?:@media[^{]+\{)?(?:[.#a-zA-Z0-9:_-][^{]*?\{[\s\S]*?\})(?:\s*\})?/gi, (match) => {
      if (match.includes(";") && match.includes(":") && (match.includes("px") || match.includes("#") || match.includes("--") || match.includes("display") || match.includes("margin"))) {
        return "";
      }
      return match;
    });

  const plainText = cleaned
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
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
  return plainText.substring(0, maxLength).trim() + "...";
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

function HackathonsContent() {
  const { showToast } = useNotification();
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const searchParams = useSearchParams();

  // Tab controller
  const [activeTab, setActiveTab] = useState<"recommended" | "upcoming" | "saved" | "past">("upcoming");

  useEffect(() => {
    const tabParam = searchParams?.get("tab");
    if (tabParam && ["recommended", "upcoming", "saved", "past"].includes(tabParam)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(tabParam as "recommended" | "upcoming" | "saved" | "past");
    }
  }, [searchParams]);

  const loadHackathons = useCallback(async () => {
    // 1. Fetch hackathons
    const { data: hackathonData, error: hackathonError } = await supabase
      .from("hackathons")
      .select(PUBLIC_HACKATHON_COLUMNS)
      .order("start_date", { ascending: true });

    if (hackathonError) {
      console.error(hackathonError);
    } else {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      const validHackathons = ((hackathonData || []) as ListedHackathon[]).filter((h) => {
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
    setCurrentUserId(user?.id ?? null);
    if (user && !searchParams.get("tab")) setActiveTab("recommended");
    if (!user && ["recommended", "saved"].includes(searchParams.get("tab") || "")) setActiveTab("upcoming");
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
  }, [searchParams]);

  async function toggleSave(e: React.MouseEvent, hackathonId: string) {
    e.preventDefault();
    e.stopPropagation();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      promptDiscoverySignIn();
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
  }, [loadHackathons]);

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

  if (loading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-[#09090b] px-5 pt-24 text-zinc-100">
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-[#B4F461]/20 bg-[#B4F461]/[0.05]">
            <div className="size-5 animate-spin rounded-full border-2 border-zinc-700 border-t-[#B4F461]" />
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">Loading hackathons</p>
        </div>
      </main>
    );
  }

  const tabs = [
    { key: "recommended" as const, label: "For You", private: true },
    { key: "upcoming" as const, label: "Upcoming", private: false },
    { key: "saved" as const, label: "Saved", private: true },
    { key: "past" as const, label: "Past Events", private: false },
  ];

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#09090b] px-4 pb-20 pt-27 text-zinc-100 sm:px-6 lg:pt-30">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.014)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.014)_1px,transparent_1px)] bg-[size:52px_52px] [mask-image:radial-gradient(ellipse_68%_45%_at_50%_10%,black,transparent)]" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-44 top-0 -z-10 size-[460px] rounded-full bg-[#B4F461]/[0.035] blur-[120px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-80 -z-10 size-[420px] rounded-full bg-[#22D3EE]/[0.025] blur-[120px]" />

      <div className="mx-auto max-w-7xl">
        <section className="mb-9 flex flex-col gap-6 border-b border-white/[0.07] pb-8 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-4 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B4F461]">
              <span className="size-1.5 rounded-full bg-[#B4F461]" />
              Discover / Hackathons
            </div>
            <h1 className="max-w-2xl bg-gradient-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text text-[38px] font-semibold leading-[1.08] tracking-[-0.05em] text-transparent sm:text-[52px]">
              Find your next hackathon.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-[1.7] text-zinc-400">
              Explore the next challenge, find your people, and build something worth shipping.
            </p>
          </div>
          <Link href="/hackathons/create" className="group inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#B4F461]/45 bg-[#B4F461] px-4 text-xs font-bold !text-[#11160b] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_24px_rgba(180,244,97,0.13)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#c4f782] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_12px_30px_rgba(180,244,97,0.22)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 active:scale-[0.99] motion-reduce:transform-none">
            <Plus aria-hidden="true" className="size-4" />
            Host a Hackathon
            <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
          </Link>
        </section>

        <section aria-label="Smart India Hackathon 2026" className={`relative mb-7 overflow-hidden rounded-[20px] border border-orange-500/20 bg-zinc-950/60 p-5 backdrop-blur-xl sm:p-7 ${glassShadow}`}>
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 size-72 rounded-full bg-orange-500/[0.055] blur-[90px]" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-orange-400/35 to-transparent" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between md:gap-8">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-orange-500/20 bg-orange-500/[0.07] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-orange-300">
                <Target aria-hidden="true" className="size-3.5" />
                Smart India Hackathon 2026
              </div>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-zinc-100 sm:text-2xl">Build your SIH internal-round team.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
                Find builders from your college and assemble a six-member team with the right mix of skills.
              </p>
            </div>
            <Link href="/hackathons/sih" className="group inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/[0.14] bg-white/[0.07] px-4 text-xs font-semibold !text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-[#B4F461]/35 hover:bg-[#B4F461] hover:!text-[#11160b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 motion-reduce:transform-none">
              Open SIH Team Builder
              <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
            </Link>
          </div>
        </section>

        <section aria-label="Search and filter hackathons" className={`mb-8 rounded-[20px] border border-white/10 bg-zinc-950/60 p-5 backdrop-blur-xl sm:p-6 ${glassShadow}`}>
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal aria-hidden="true" className="size-4 text-[#B4F461]" />
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-200">Search & filter</h2>
            </div>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600 sm:block">Find your next challenge</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
            <div className="relative">
              <label htmlFor="hackathon-search" className="sr-only">Search hackathon or tag</label>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <input id="hackathon-search" type="search" placeholder="Search event or tag" value={search} onChange={(event) => setSearch(event.target.value)} className={`${filterControlClass} pl-10`} />
            </div>
            <div>
              <label htmlFor="hackathon-mode" className="sr-only">Filter by mode</label>
              <select id="hackathon-mode" value={modeFilter} onChange={(event) => setModeFilter(event.target.value)} className={filterControlClass}>
                <option value="">All modes</option>
                <option value="online">Online</option>
                <option value="in-person">In-person</option>
              </select>
            </div>
            <div>
              <label htmlFor="hackathon-platform" className="sr-only">Filter by platform</label>
              <select id="hackathon-platform" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} className={filterControlClass}>
                <option value="">All platforms</option>
                <option value="native">HackerMate (Native)</option>
                <option value="unstop">Unstop</option>
                <option value="hack2skill">Hack2skills</option>
                <option value="devfolio">Devfolio</option>
                <option value="other">Other External</option>
              </select>
            </div>
            <div>
              <label htmlFor="hackathon-sort" className="sr-only">Sort hackathons</label>
              <select id="hackathon-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value)} className={filterControlClass}>
                <option value="date">Soonest first</option>
                <option value="prize">Highest prize</option>
              </select>
            </div>
          </div>
        </section>

        <section aria-label="Hackathon results">
          <div className="mb-5 flex flex-col gap-4 border-b border-white/[0.08] sm:flex-row sm:items-end sm:justify-between">
            <div role="group" aria-label="Hackathon categories" className="flex max-w-full gap-1 overflow-x-auto whitespace-nowrap scrollbar-none">
              {tabs.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      if (tab.private && !currentUserId) {
                        promptDiscoverySignIn(`/hackathons?tab=${tab.key}`);
                        return;
                      }
                      setActiveTab(tab.key);
                    }}
                    className={`relative -mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3.5 text-xs font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#B4F461] ${active ? "border-[#B4F461] text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}
                  >
                    {tab.key === "recommended" && <Target aria-hidden="true" className={`size-3.5 ${active ? "text-[#B4F461]" : ""}`} />}
                    {tab.key === "saved" && <Bookmark aria-hidden="true" className={`size-3.5 ${active ? "text-[#B4F461]" : ""}`} />}
                    {tab.label}
                    {tab.key === "saved" && currentUserId && savedIds.size > 0 && <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">{savedIds.size}</span>}
                  </button>
                );
              })}
            </div>
            <span className="pb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 sm:pb-3.5">{filtered.length} event{filtered.length === 1 ? "" : "s"} found</span>
          </div>

          {(search || modeFilter || platformFilter || sortBy !== "date") && (
            <div className="mb-5 flex justify-end">
              <button type="button" onClick={() => { setSearch(""); setModeFilter(""); setPlatformFilter(""); setSortBy("date"); }} className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:text-[#B4F461] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461]">
                Clear filters
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className={`flex min-h-72 flex-col items-center justify-center rounded-[20px] border border-white/10 bg-zinc-950/60 px-6 py-12 text-center backdrop-blur-xl ${glassShadow}`}>
              <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-zinc-400"><Zap aria-hidden="true" className="size-5" /></div>
              <h3 className="text-base font-semibold tracking-tight text-white">No events found</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
                {activeTab === "recommended"
                  ? userSkills.length === 0
                    ? "Add skills to your profile to see events that fit your interests."
                    : "No upcoming events match your skills yet. Browse all upcoming events."
                  : activeTab === "saved"
                    ? "Your saved events will appear here. Explore upcoming hackathons to find one."
                    : activeTab === "upcoming"
                      ? "No upcoming events match these filters. Try a broader search."
                      : "No past events match these filters."}
              </p>
              <div className="mt-5">
                {activeTab === "recommended" && userSkills.length === 0
                  ? <Link href="/profile/edit" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 text-xs font-semibold text-zinc-100 transition-colors hover:border-[#B4F461]/30 hover:text-[#B4F461]">Add your skills <ArrowRight aria-hidden="true" className="size-3.5" /></Link>
                  : activeTab !== "upcoming"
                    ? <button type="button" onClick={() => setActiveTab("upcoming")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 text-xs font-semibold text-zinc-100 transition-colors hover:border-[#B4F461]/30 hover:text-[#B4F461]">Browse upcoming <ArrowRight aria-hidden="true" className="size-3.5" /></button>
                    : null}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((hackathon) => {
                const todayStr = new Date().toISOString().split("T")[0];
                const isEventPast = Boolean(hackathon.end_date && hackathon.end_date < todayStr);
                const isSaved = savedIds.has(hackathon.id);
                const prizeDisplay = formatPrizeDisplay(hackathon.prize_pool, hackathon.currency);
                return (
                  <article key={hackathon.id} className={`group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-white/10 bg-zinc-950/60 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.2] hover:bg-[#151519]/85 hover:shadow-[0_14px_34px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.07)] motion-reduce:transform-none ${glassShadow} ${isEventPast ? "opacity-75 hover:opacity-100" : ""}`}>
                    <Link href={`/hackathons/${hackathon.id}`} className="block flex-1 p-5 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#B4F461] sm:p-6">
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">{isEventPast ? "Past event" : "Open for discovery"}</div>
                          <h2 className="line-clamp-2 text-[17px] font-semibold leading-snug tracking-[-0.025em] text-zinc-100 transition-colors group-hover:text-white">{hackathon.name}</h2>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          {hackathon.mode && <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-zinc-300">{hackathon.mode}</span>}
                          <span className={`rounded-md border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider ${isEventPast ? "border-white/[0.08] bg-white/[0.03] text-zinc-500" : hackathon.type === "native" ? "border-[#22D3EE]/20 bg-[#22D3EE]/[0.06] text-[#8fe7f3]" : "border-white/10 bg-white/[0.05] text-zinc-400"}`}>{isEventPast ? "Ended" : hackathon.type === "native" ? "HackerMate" : "External"}</span>
                        </div>
                      </div>
                      <p className="mb-5 line-clamp-3 min-h-13 text-xs leading-[1.7] text-zinc-400">{getPlainPreview(hackathon.description)}</p>
                      <div className="mb-6 flex min-h-7 flex-wrap content-start gap-1.5">
                        {hackathon.tags?.length ? (
                          <>
                            {hackathon.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1 font-mono text-[10px] text-zinc-400">{tag}</span>)}
                            {hackathon.tags.length > 3 && <span className="rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1 font-mono text-[10px] text-zinc-500">+{hackathon.tags.length - 3}</span>}
                          </>
                        ) : <span className="font-mono text-[10px] text-zinc-600">No tags listed</span>}
                      </div>
                      <div className="space-y-2.5 border-t border-white/[0.065] pt-4 text-xs">
                        <div className="flex items-center gap-2.5 text-zinc-400"><CalendarDays aria-hidden="true" className="size-4 shrink-0 text-zinc-500" /><span>{formatDateRange(hackathon.start_date, hackathon.end_date)}</span></div>
                        <div className="flex items-center gap-2.5 text-zinc-400"><MapPin aria-hidden="true" className="size-4 shrink-0 text-zinc-500" /><span className="truncate">{hackathon.location || "Location TBA"}</span></div>
                        {hackathon.college && <div className="flex items-center gap-2.5 text-zinc-400"><Building2 aria-hidden="true" className="size-4 shrink-0 text-zinc-500" /><span className="truncate">{hackathon.college}</span></div>}
                        {hackathon.prize_pool && <div className="flex items-center gap-2.5 text-zinc-300"><Trophy aria-hidden="true" className="size-4 shrink-0 text-zinc-500" /><span className="truncate" title={prizeDisplay}>{prizeDisplay}</span></div>}
                      </div>
                    </Link>
                    <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-3.5 sm:px-6">
                      <button type="button" aria-pressed={isSaved} aria-label={isSaved ? `Remove ${hackathon.name} from saved events` : `Save ${hackathon.name}`} onClick={(event) => void toggleSave(event, hackathon.id)} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] ${isSaved ? "bg-[#B4F461]/10 text-[#B4F461] hover:bg-[#B4F461]/15" : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-100"}`}>
                        <Bookmark aria-hidden="true" className={`size-4 ${isSaved ? "fill-[#B4F461] text-[#B4F461]" : ""}`} />
                        {isSaved ? "Saved" : "Save"}
                      </button>
                      <Link href={`/hackathons/${hackathon.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-zinc-200 transition-colors hover:text-[#B4F461] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461]">
                        Explore <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function HackathonsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-[#09090b] text-zinc-400">
        <div role="status" aria-label="Loading hackathons" className="mb-4 size-6 animate-spin rounded-full border-2 border-zinc-800 border-t-[#B4F461]" />
        <p className="font-mono text-[11px] uppercase tracking-[0.16em]">Loading hackathons</p>
      </div>
    }>
      <HackathonsContent />
    </Suspense>
  );
}
