"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";

type Hackathon = {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  mode: string | null;
  prize_pool: string | null;
  website_url: string | null;
  tags: string[] | null;
  type: string | null;
  organizer_id: string | null;
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

function parsePrizeValue(prize: string | null): number {
  if (!prize) return 0;
  // Strip any HTML tags first (handles legacy DB values with markup)
  const stripped = prize.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, "").trim();
  const isUSD = stripped.includes("$");
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
    } else {
      setHackathons(hackathonData || []);
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
      return result.sort((a, b) => parsePrizeValue(b.prize_pool) - parsePrizeValue(a.prize_pool));
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
      <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--primary-500)] to-[var(--accent-500)] animate-pulse mb-4" />
          <p className="text-zinc-500">Loading hackathons...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
      {/* Hero */}
      <section className="mb-10 animate-fade-in-up flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <p className="section-label">HACKATHON DISCOVERY</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
            Find your next hackathon
          </h1>
          <p className="text-zinc-400 text-sm max-w-xl leading-relaxed">
            Browse upcoming hackathons, see who&apos;s already building teams, and find the right event for your next project.
          </p>
        </div>
        <Link href="/hackathons/create" className="btn btn-primary btn-sm flex-shrink-0">
          + List a Hackathon
        </Link>
      </section>

      {/* Filter Panel */}
      <div className="card card-static p-6 mb-8 animate-fade-in-up stagger-1">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <p className="section-label mb-0">SEARCH & FILTER</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Search hackathon or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input text-xs w-full"
          />

          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="input px-4 text-xs w-full"
          >
            <option value="">All modes</option>
            <option value="online">Online</option>
            <option value="in-person">In-person</option>
          </select>

          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="input px-4 text-xs w-full"
          >
            <option value="">All Platforms</option>
            <option value="native">HackerMate (Native)</option>
            <option value="unstop">Unstop</option>
            <option value="hack2skill">Hack2skills</option>
            <option value="devfolio">Devfolio</option>
            <option value="other">Other External</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="input px-4 text-xs w-full"
          >
            <option value="date">Sort by Date</option>
            <option value="prize">Sort by Prize (Highest)</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-900 mb-6 animate-fade-in-up stagger-2">
        <button
          onClick={() => setActiveTab("recommended")}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-[2px] transition-colors flex items-center gap-1.5 ${
            activeTab === "recommended"
              ? "border-violet-500 text-violet-400"
              : "border-transparent text-zinc-500 hover:text-white"
          }`}
        >
          ✨ For You
        </button>
        <button
          onClick={() => setActiveTab("upcoming")}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-[2px] transition-colors ${
            activeTab === "upcoming"
              ? "border-white text-white"
              : "border-transparent text-zinc-500 hover:text-white"
          }`}
        >
          Upcoming Events
        </button>
        <button
          onClick={() => setActiveTab("saved")}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-[2px] transition-colors ${
            activeTab === "saved"
              ? "border-white text-white"
              : "border-transparent text-zinc-500 hover:text-white"
          }`}
        >
          Saved Events
        </button>
        <button
          onClick={() => setActiveTab("past")}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-[2px] transition-colors ${
            activeTab === "past"
              ? "border-white text-white"
              : "border-transparent text-zinc-500 hover:text-white"
          }`}
        >
          Past Events
        </button>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between mb-6 animate-fade-in-up stagger-2">
        <p className="text-zinc-500 text-sm">
          {filtered.length} event{filtered.length !== 1 ? "s" : ""} found
        </p>

        {(search || modeFilter || platformFilter || sortBy !== "date") && (
          <button
            onClick={() => {
              setSearch("");
              setModeFilter("");
              setPlatformFilter("");
              setSortBy("date");
            }}
            className="text-sm text-zinc-500 hover:text-white transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="card card-static p-16 text-center animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.5 18h1.5m4.5-13.764c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.5 18h-1.5" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-white mb-2">No events found</h3>
          <p className="text-zinc-500 max-w-sm mx-auto text-xs leading-relaxed">
            {activeTab === "recommended"
              ? userSkills.length === 0
                ? "Add skills to your profile so we can recommend hackathons tailored to you!"
                : "No upcoming hackathons match your skills right now. Check back after the next weekly refresh!"
              : activeTab === "saved"
              ? "You haven't bookmarked any events yet. Click the bookmark icon on any hackathon to save it!"
              : activeTab === "upcoming"
              ? "There are no upcoming events matching your query. Try checking Past Events!"
              : "No past events match your filters."}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((h, i) => {
            const todayStr = new Date().toISOString().split("T")[0];
            const isEventPast = h.end_date && h.end_date < todayStr;
            return (
              <Link
                key={h.id}
                href={`/hackathons/${h.id}`}
                className={`card p-6 group animate-fade-in-up stagger-${Math.min(i % 6, 6) + 1} ${
                  isEventPast ? "opacity-75 hover:opacity-100 transition-opacity" : ""
                }`}
              >
                {/* Top - Name & Mode */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2 className="text-base font-semibold text-white group-hover:text-gradient transition-all">
                    {h.name}
                  </h2>

                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    {h.mode && (
                      <span className="badge badge-primary capitalize text-[10px] py-0.5 px-1.5">
                        {h.mode}
                      </span>
                    )}
                    {isEventPast ? (
                      <span className="badge text-[10px] py-0.5 px-1.5 bg-zinc-800 text-zinc-500 border-zinc-700">
                        Ended
                      </span>
                    ) : (
                      <span className={`badge text-[10px] py-0.5 px-1.5 ${
                        h.type === "native" ? "badge-success" : "badge-warning"
                      }`}>
                        {h.type === "native" ? "Native" : "External"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-zinc-400 text-xs leading-relaxed mb-5 line-clamp-3">
                  {getPlainPreview(h.description)}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {h.tags?.length ? (
                    h.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="badge text-[10px]">
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="badge text-[10px] text-zinc-500">No tags</span>
                  )}
                  {h.tags && h.tags.length > 3 && (
                    <span className="badge text-[10px]">+{h.tags.length - 3}</span>
                  )}
                </div>

                {/* Meta Info */}
                <div className="space-y-2.5 mb-6 text-xs">
                  <div className="flex items-center gap-2 text-zinc-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                    </svg>
                    <span>{formatDateRange(h.start_date, h.end_date)}</span>
                  </div>

                  <div className="flex items-center gap-2 text-zinc-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                    <span>{h.location || "Location TBA"}</span>
                  </div>

                  {h.prize_pool && (
                    <div className="flex items-center gap-2 text-zinc-500">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>
                        {stripHtml(h.prize_pool).length > 35 
                          ? `${stripHtml(h.prize_pool).slice(0, 32)}...` 
                          : stripHtml(h.prize_pool)}
                      </span>
                    </div>
                  )}
                </div>

                {/* CTA */}
                <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
                  <button
                    onClick={(e) => toggleSave(e, h.id)}
                    className="flex items-center gap-1.5 text-zinc-500 hover:text-violet-400 transition-colors py-1 text-xs"
                  >
                    {savedIds.has(h.id) ? (
                      <>
                        <svg className="w-4 h-4 text-violet-500 fill-violet-500" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                        </svg>
                        <span className="text-violet-400 font-medium">Saved</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                        </svg>
                        <span>Save</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1.5 font-medium text-white group-hover:text-primary-400 transition-colors">
                    <span>Explore</span>
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

export default function HackathonsPage() {
  return (
    <AuthGuard>
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-zinc-800 border-t-violet-500 rounded-full animate-spin mb-4" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Loading hackathons...</p>
        </div>
      }>
        <HackathonsContent />
      </Suspense>
    </AuthGuard>
  );
}