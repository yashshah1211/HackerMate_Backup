"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { ArrowRight, Check, ChevronDown, Plus } from "lucide-react";
import { COLLEGES, normalizeCollege } from "@/lib/colleges";
import { trackEvent, identifyUser } from "@/lib/posthog";
import { Button, FilterChip, Input, Skeleton } from "@/components/system";
import { FormStep, OnboardingFrame, OnboardingLabel } from "@/components/onboarding/OnboardingFrame";
import { ProfilePreview } from "@/components/onboarding/ProfilePreview";
import { cn } from "@/lib/utils";


const SKILLS = [
  "React", "Next.js", "TypeScript", "JavaScript", "TailwindCSS",
  "Node.js", "Express", "Python", "FastAPI", "Django", "Java", "C++",
  "Go", "Rust", "Flutter", "React Native", "AI/ML", "GenAI / LLMs",
  "OpenAI API", "TensorFlow", "PyTorch", "Web3 / Blockchain", "Docker",
  "AWS", "Supabase", "Firebase", "PostgreSQL", "MongoDB", "UI/UX", "Figma",
  "Product Management", "DevOps", "Public Speaking", "Pitching", "Graphic Design"
];

const ACADEMIC_YEAR_OPTIONS = [
  { value: "1st Year", label: "1st Year (Fresher)" },
  { value: "2nd Year", label: "2nd Year (Sophomore)" },
  { value: "3rd Year", label: "3rd Year (Junior)" },
  { value: "4th Year", label: "4th Year (Senior)" },
  { value: "Postgrad / Alumni", label: "Postgrad / Alumni" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { showToast } = useNotification();

  const [college, setCollege] = useState("");
  const [customCollege, setCustomCollege] = useState("");
  const [collegeSearch, setCollegeSearch] = useState("");
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);

  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [yearOfStudy, setYearOfStudy] = useState("2nd Year");
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [focusedYearIndex, setFocusedYearIndex] = useState<number>(-1);
  const [bio, setBio] = useState("");
  const [github, setGithub] = useState("");
  const [linkedin, setLinkedin] = useState("");

  // Preserved fields from previous wizard if returning user
  const [hasParticipated, setHasParticipated] = useState<boolean | null>(null);
  const [participationsCount, setParticipationsCount] = useState<number | "">("");
  const [hasWon, setHasWon] = useState<boolean | null>(null);
  const [winsCount, setWinsCount] = useState<number | "">("");

  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(true);

  // Display-only: name + avatar from the already-fetched profile row, used by the live preview.
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);

  // Load existing profile data on mount to preserve all partial entries
  useEffect(() => {
    trackEvent("onboarding_started", {
      referrer_source: typeof window !== 'undefined' ? localStorage.getItem('hm_referrer_source') : null,
    });

    async function loadProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setFetchingProfile(false);
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, username, show_track_record")

          .eq("id", user.id)
          .single();

        if (error) {
          console.error("Error loading profile during onboarding:", error);
        } else if (data) {
          setPreviewName(data.full_name ?? null);
          setPreviewAvatar(data.avatar_url ?? null);
          if (data.college) {
            if (COLLEGES.includes(data.college)) {
              setCollege(data.college);
            } else {
              setCollege("Other");
              setCustomCollege(data.college);
            }
          } else {
            // Check URL search parameters or next param for a shared invite college prefill
            if (typeof window !== "undefined") {
              const urlParams = new URLSearchParams(window.location.search);
              let prefill = urlParams.get("college");
              if (!prefill && urlParams.get("next")) {
                try {
                  const nextParsed = new URL(urlParams.get("next")!, window.location.origin);
                  prefill = nextParsed.searchParams.get("college");
                } catch (_) {}
              }
              if (prefill) {
                const normalized = normalizeCollege(prefill);
                if (normalized && normalized.toLowerCase() !== "other") {
                  if (COLLEGES.includes(normalized)) {
                    setCollege(normalized);
                  } else {
                    setCollege("Other");
                    setCustomCollege(normalized);
                  }
                }
              }
            }
          }
          if (data.bio) setBio(data.bio);
          if (data.github_url) setGithub(data.github_url);
          if (data.linkedin_url) setLinkedin(data.linkedin_url);
          if (data.skills) setSelectedSkills(data.skills);
          if (data.has_participated_hackathon !== null) {
            setHasParticipated(data.has_participated_hackathon);
          }
          if (data.hackathon_participations) {
            setParticipationsCount(data.hackathon_participations);
          }
          if (data.has_won_hackathon !== null) {
            setHasWon(data.has_won_hackathon);
          }
          if (data.hackathon_wins) {
            setWinsCount(data.hackathon_wins);
          }
        }
      } catch (err) {
        console.error("Error fetching user profile:", err);
      } finally {
        setFetchingProfile(false);
      }
    }
    loadProfile();
  }, []);

  function toggleSkill(skill: string) {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(selectedSkills.filter((s) => s !== skill));
    } else {
      setSelectedSkills([...selectedSkills, skill]);
    }
  }

  function handleYearKeyDown(e: React.KeyboardEvent) {
    if (!showYearDropdown) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setShowYearDropdown(true);
        const currentIndex = ACADEMIC_YEAR_OPTIONS.findIndex((opt) => opt.value === yearOfStudy);
        setFocusedYearIndex(currentIndex >= 0 ? currentIndex : 0);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedYearIndex((prev) => (prev + 1) % ACADEMIC_YEAR_OPTIONS.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedYearIndex((prev) => (prev - 1 + ACADEMIC_YEAR_OPTIONS.length) % ACADEMIC_YEAR_OPTIONS.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (focusedYearIndex >= 0 && focusedYearIndex < ACADEMIC_YEAR_OPTIONS.length) {
        setYearOfStudy(ACADEMIC_YEAR_OPTIONS[focusedYearIndex].value);
      }
      setShowYearDropdown(false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowYearDropdown(false);
    } else if (e.key === "Tab") {
      setShowYearDropdown(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const rawCollege = college === "Other" ? customCollege.trim() : college.trim();
    const finalCollege = normalizeCollege(rawCollege);


    if (!finalCollege) {
      showToast("Please select or enter your college / university", "warning");
      return;
    }

    if (selectedSkills.length === 0) {
      showToast("Please select at least 1 skill or tech stack", "warning");
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      showToast("User session expired. Please sign in again.", "error");
      setLoading(false);
      return;
    }

    const storedReferrer = typeof window !== 'undefined' ? localStorage.getItem('hm_referrer_source') : null;

    const fieldsToSave: any = {
      college: finalCollege,
      year_of_study: yearOfStudy,
      skills: selectedSkills,
      bio: bio.trim() || null,
      github_url: github.trim() || null,
      linkedin_url: linkedin.trim() || null,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    };

    if (hasParticipated !== null) {
      fieldsToSave.has_participated_hackathon = hasParticipated;
      fieldsToSave.hackathon_participations = hasParticipated ? (participationsCount === "" ? 0 : Number(participationsCount)) : 0;
      fieldsToSave.has_won_hackathon = hasParticipated && hasWon ? true : false;
      fieldsToSave.hackathon_wins = hasParticipated && hasWon ? (winsCount === "" ? 0 : Number(winsCount)) : 0;
    }

    if (storedReferrer) {
      fieldsToSave.referrer_source = storedReferrer;
    }

    let { error } = await supabase
      .from("profiles")
      .update(fieldsToSave)
      .eq("id", user.id);

    if (error) {
      delete fieldsToSave.year_of_study;
      const { error: fbErr } = await supabase
        .from("profiles")
        .update(fieldsToSave)
        .eq("id", user.id);
      error = fbErr;
    }

    if (typeof window !== "undefined") {
      localStorage.setItem(`year_confirmed_${user.id}`, "true");
    }

    setLoading(false);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      return;
    }

    identifyUser(user.id, { onboarding_completed: true });
    trackEvent("onboarding_completed", {
      college: finalCollege,
      is_custom_college: college === "Other",
      skills_count: selectedSkills.length,
    });

    showToast("Profile set up successfully! Welcome to HackerMate.", "success");

    const requestedPath = new URLSearchParams(window.location.search).get("next");
    const safePath =
      requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
        ? requestedPath
        : "/dashboard";
    router.push(safePath);
  }

  const filteredColleges = COLLEGES.filter((col) =>
    col !== "Other" && col.toLowerCase().includes(collegeSearch.toLowerCase())
  );

  const displayCollege = college === "Other" ? customCollege.trim() : college;
  const yearLabel = ACADEMIC_YEAR_OPTIONS.find((opt) => opt.value === yearOfStudy)?.label || yearOfStudy;
  const requiredDone = Boolean(displayCollege) && selectedSkills.length > 0;

  return (
    <OnboardingFrame className="pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-0">
      <main data-v2 className="mx-auto grid w-full max-w-[1280px] flex-1 grid-cols-1 gap-10 px-5 py-10 md:px-8 md:py-14 lg:grid-cols-12 lg:gap-16">
        <div className="min-w-0 lg:col-span-7">
          <p className="font-mono text-[12px] text-ink-3">Builder profile · takes under a minute</p>
          <h1
            data-v2-heading
            className="mt-2 font-display text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink [font-variation-settings:'wdth'_88] md:text-[36px]"
          >
            Set up your builder profile
          </h1>
          <p className="mt-2.5 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
            Teams search builders by the skill they&apos;re missing. Add your college and stack so the right teams find you.
          </p>

          {fetchingProfile ? (
            <div className="mt-8" role="status" aria-label="Loading your profile">
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid grid-cols-1 gap-4 border-t border-line py-7 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <div className="space-y-2.5">
                    <Skeleton className="h-10 w-full rounded-md" />
                    {i === 1 && <Skeleton className="h-24 w-full rounded-md" />}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8">
              {/* 01 — Campus: college + year */}
              <FormStep
                id="onb-campus"
                n={1}
                total={3}
                label="Campus"
                title="Where you study"
                description="Used for college-only events and campus team filters."
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,200px)]">
                  {/* College / University (searchable) */}
                  <div className="relative min-w-0">
                    <OnboardingLabel htmlFor="onb-college" required>
                      College / University
                    </OnboardingLabel>
                    <Input
                      id="onb-college"
                      type="text"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={showCollegeDropdown}
                      aria-controls="onb-college-list"
                      autoComplete="off"
                      placeholder="Search your college"
                      value={showCollegeDropdown ? collegeSearch : (college || "")}
                      onFocus={() => {
                        setCollegeSearch("");
                        setShowCollegeDropdown(true);
                      }}
                      onChange={(e) => {
                        setCollegeSearch(e.target.value);
                        setShowCollegeDropdown(true);
                      }}
                      className="h-10"
                    />

                    {showCollegeDropdown && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowCollegeDropdown(false)}
                        />
                        <div
                          id="onb-college-list"
                          className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-64 overflow-y-auto rounded-lg border border-line bg-overlay p-1 shadow-pop"
                        >
                          {filteredColleges.slice(0, 35).map((collegeName) => (
                            <button
                              type="button"
                              key={collegeName}
                              onClick={() => {
                                setCollege(collegeName);
                                setCollegeSearch("");
                                setShowCollegeDropdown(false);
                              }}
                              className={cn(
                                "flex min-h-9 w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-hover hover:text-ink",
                                college === collegeName ? "bg-selected text-ink" : "text-ink-2",
                              )}
                            >
                              <span className="min-w-0 flex-1">{collegeName}</span>
                              {college === collegeName && <Check className="size-3.5 shrink-0 text-accent-ink" aria-hidden />}
                            </button>
                          ))}
                          {filteredColleges.length === 0 && (
                            <div className="px-2.5 py-3 text-[13px] text-ink-3">
                              No matching colleges. Use Other below.
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setCollege("Other");
                              setCollegeSearch("");
                              setShowCollegeDropdown(false);
                            }}
                            className="mt-1 flex min-h-9 w-full items-center gap-2 rounded-[5px] border-t border-line px-2.5 py-1.5 text-left text-[13px] font-medium text-accent-ink transition-colors hover:bg-hover"
                          >
                            <Plus className="size-3.5 shrink-0" aria-hidden />
                            Other (type your college name)
                          </button>
                        </div>
                      </>
                    )}

                    {college === "Other" && (
                      <Input
                        type="text"
                        aria-label="Your college name"
                        placeholder="Type your college name"
                        value={customCollege}
                        onChange={(e) => setCustomCollege(e.target.value)}
                        className="mt-2 h-10"
                        required
                      />
                    )}
                  </div>

                  {/* Academic year (accessible custom dropdown) */}
                  <div className="relative min-w-0">
                    <OnboardingLabel id="onb-year-label" required>
                      Year of study
                    </OnboardingLabel>
                    <button
                      type="button"
                      onClick={() => {
                        setShowYearDropdown(!showYearDropdown);
                        const currentIndex = ACADEMIC_YEAR_OPTIONS.findIndex((opt) => opt.value === yearOfStudy);
                        setFocusedYearIndex(currentIndex >= 0 ? currentIndex : 0);
                      }}
                      onKeyDown={handleYearKeyDown}
                      aria-haspopup="listbox"
                      aria-expanded={showYearDropdown}
                      aria-labelledby="onb-year-label onb-year-value"
                      className={cn(
                        "flex h-10 w-full items-center justify-between gap-2 rounded-md bg-sunken px-3 text-left text-[13.5px] text-ink ring-1 ring-inset ring-line-strong",
                        "transition-[box-shadow] duration-150 hover:ring-ink-4 focus:outline-none focus-visible:ring-accent-ink focus-visible:shadow-[0_0_0_3px_var(--hm-accent-soft)]",
                        showYearDropdown && "ring-accent-ink",
                      )}
                    >
                      <span id="onb-year-value" className="min-w-0 truncate">
                        {yearLabel}
                      </span>
                      <ChevronDown
                        className={cn("size-4 shrink-0 text-ink-3 transition-transform duration-150", showYearDropdown && "rotate-180")}
                        aria-hidden
                      />
                    </button>

                    {showYearDropdown && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowYearDropdown(false)}
                        />
                        <div
                          role="listbox"
                          aria-labelledby="onb-year-label"
                          className="absolute inset-x-0 top-full z-20 mt-1.5 min-w-[200px] rounded-lg border border-line bg-overlay p-1 shadow-pop sm:left-auto"
                        >
                          {ACADEMIC_YEAR_OPTIONS.map((option, idx) => {
                            const isSelected = option.value === yearOfStudy;
                            const isFocused = idx === focusedYearIndex;
                            return (
                              <button
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                key={option.value}
                                onClick={() => {
                                  setYearOfStudy(option.value);
                                  setShowYearDropdown(false);
                                }}
                                onMouseEnter={() => setFocusedYearIndex(idx)}
                                className={cn(
                                  "flex min-h-9 w-full items-center justify-between gap-2 rounded-[5px] px-2.5 py-1.5 text-left text-[13px] transition-colors",
                                  isSelected ? "bg-selected font-medium text-ink" : isFocused ? "bg-hover text-ink" : "text-ink-2",
                                )}
                              >
                                <span className="min-w-0">{option.label}</span>
                                {isSelected && <Check className="size-3.5 shrink-0 text-accent-ink" aria-hidden />}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </FormStep>

              {/* 02 — Stack: skills */}
              <FormStep
                id="onb-stack"
                n={2}
                total={3}
                label="Stack"
                title="What you build with"
                description="Pick at least one. This is what teams search for."
                aside={
                  <span className="font-mono text-[12px] text-ink-3 tabular" aria-live="polite">
                    <span className={selectedSkills.length > 0 ? "text-accent-ink" : undefined}>{selectedSkills.length}</span> selected
                  </span>
                }
              >
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Skills and tech stack">
                  {SKILLS.map((skill) => (
                    <FilterChip key={skill} active={selectedSkills.includes(skill)} onClick={() => toggleSkill(skill)}>
                      {skill}
                    </FilterChip>
                  ))}
                </div>
              </FormStep>

              {/* 03 — Tagline: optional bio */}
              <FormStep
                id="onb-tagline"
                n={3}
                total={3}
                label="Tagline"
                title="One line about you"
                description="Shown next to your name in search and on team requests."
              >
                <OnboardingLabel htmlFor="onb-bio">Tagline</OnboardingLabel>
                <Input
                  id="onb-bio"
                  type="text"
                  placeholder="e.g. Full-stack dev into AI and Web3 hackathons"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="h-10"
                />
              </FormStep>

              {/* Desktop / tablet action row */}
              <div className="hidden items-center justify-between gap-4 border-t border-line pt-6 md:flex">
                <p className="min-w-0 text-[13px] text-ink-3">
                  {requiredDone ? "All set. You can change this anytime from your profile." : "College and at least one skill are required."}
                </p>
                <Button type="submit" variant="primary" size="lg" loading={loading} iconRight={loading ? undefined : <ArrowRight aria-hidden />}>
                  {loading ? "Saving…" : "Finish setup"}
                </Button>
              </div>

              {/* Mobile sticky action bar (bare route: no tab bar underneath) */}
              <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] md:hidden">
                <div className="mx-auto flex w-full max-w-[1280px] items-center gap-3 px-5 py-3">
                  <p className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-3">
                    {selectedSkills.length} skill{selectedSkills.length === 1 ? "" : "s"}
                    {displayCollege ? ` · ${displayCollege}` : " · no college yet"}
                  </p>
                  <Button type="submit" variant="primary" size="lg" loading={loading} className="shrink-0">
                    {loading ? "Saving…" : "Finish setup"}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Live preview of the builder card (desktop) */}
        <aside aria-label="Profile preview" className="hidden lg:col-span-4 lg:col-start-9 lg:block">
          <div className="sticky top-8">
            <ProfilePreview
              name={previewName}
              avatarUrl={previewAvatar}
              college={displayCollege}
              year={yearOfStudy}
              bio={bio}
              skills={selectedSkills}
            />
          </div>
        </aside>
      </main>
    </OnboardingFrame>
  );
}
