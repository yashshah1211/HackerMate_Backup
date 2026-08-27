"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import Logo from "@/components/Logo";
import { COLLEGES, normalizeCollege } from "@/lib/colleges";
import { trackEvent, identifyUser } from "@/lib/posthog";


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
          .select("id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, sih_broadcast_sent_at, username, show_track_record")

          .eq("id", user.id)
          .single();

        if (error) {
          console.error("Error loading profile during onboarding:", error);
        } else if (data) {
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

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-[var(--background)]">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in-up">
          <div className="flex justify-center mb-4">
            <Logo className="h-12 w-auto" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-white mb-1.5">
            Quick Builder Setup
          </h1>

          <p className="text-xs text-zinc-400">
            Set up your college and tech stack in under 30 seconds to start matching with teams.
          </p>
        </div>

        {/* Form Card (Flagship Surface) */}
        <div className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] via-zinc-950/85 to-[#080808]/95 p-6 sm:p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_16px_40px_-8px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-fade-in-up stagger-1 min-h-[380px]">
          {fetchingProfile ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-zinc-700 border-t-[#B4F461] rounded-full animate-spin mb-4" />
              <p className="text-xs text-zinc-500 font-mono">Loading profile data...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* College / University */}
              <div className="relative">
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider font-mono">
                  College / University <span className="text-[#B4F461] font-mono">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Search or select your college..."
                  value={showCollegeDropdown ? collegeSearch : (college || "")}
                  onFocus={() => {
                    setCollegeSearch("");
                    setShowCollegeDropdown(true);
                  }}
                  onChange={(e) => {
                    setCollegeSearch(e.target.value);
                    setShowCollegeDropdown(true);
                  }}
                  className="input text-xs w-full"
                />

                {showCollegeDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowCollegeDropdown(false)}
                    />
                    <div className="absolute left-0 right-0 top-full mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-white/[0.08] bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur-xl z-20">
                      {filteredColleges.slice(0, 35).map((collegeName) => (
                        <button
                          type="button"
                          key={collegeName}
                          onClick={() => {
                            setCollege(collegeName);
                            setCollegeSearch("");
                            setShowCollegeDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-[#B4F461] transition-colors cursor-pointer"
                        >
                          {collegeName}
                        </button>
                      ))}
                      {filteredColleges.length === 0 && (
                        <div className="text-center py-3 text-xs text-zinc-500">
                          No matching colleges found.
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setCollege("Other");
                          setCollegeSearch("");
                          setShowCollegeDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs text-[#B4F461] font-semibold hover:bg-white/[0.06] transition-colors border-t border-white/[0.08] cursor-pointer"
                      >
                        + Other (Specify custom college)
                      </button>
                    </div>
                  </>
                )}

                {college === "Other" && (
                  <input
                    type="text"
                    placeholder="Enter your custom college name..."
                    value={customCollege}
                    onChange={(e) => setCustomCollege(e.target.value)}
                    className="input text-xs mt-2 w-full"
                    required
                  />
                )}
              </div>

              {/* Academic Year of Study (Accessible Custom Dropdown) */}
              <div className="relative">
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider font-mono">
                  Academic Year of Study <span className="text-[#B4F461] font-mono">*</span>
                </label>

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
                  className="flex h-10 w-full cursor-pointer items-center justify-between rounded-xl border border-white/[0.08] bg-zinc-950/80 px-3.5 text-xs text-zinc-200 transition-all duration-200 hover:border-white/[0.22] hover:bg-zinc-900 focus:border-white/[0.25] focus:outline-none"
                >
                  <span className="font-medium">
                    {ACADEMIC_YEAR_OPTIONS.find((opt) => opt.value === yearOfStudy)?.label || yearOfStudy}
                  </span>
                  <svg
                    className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${
                      showYearDropdown ? "rotate-180 text-[#B4F461]" : ""
                    }`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {showYearDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowYearDropdown(false)}
                    />
                    <div
                      role="listbox"
                      className="absolute left-0 right-0 top-full mt-1.5 rounded-xl border border-white/[0.08] bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur-xl z-20"
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
                            className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors ${
                              isSelected
                                ? "bg-[#B4F461]/10 font-semibold text-[#B4F461]"
                                : isFocused
                                ? "bg-white/[0.06] text-white"
                                : "text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                            }`}
                          >
                            <span>{option.label}</span>
                            {isSelected && (
                              <svg className="h-3.5 w-3.5 text-[#B4F461]" viewBox="0 0 20 20" fill="currentColor">
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Skills & Tech Stack (Natural Flow + Option A Luminous Chips) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                    Tech Stack & Skills <span className="text-[#B4F461] font-mono">*</span>
                  </label>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    <span className={selectedSkills.length > 0 ? "text-[#B4F461] font-semibold" : ""}>
                      {selectedSkills.length}
                    </span>{" "}
                    selected
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 p-3.5 bg-zinc-950/60 border border-white/[0.08] rounded-xl">
                  {SKILLS.map((skill) => {
                    const selected = selectedSkills.includes(skill);
                    return (
                      <button
                        type="button"
                        key={skill}
                        onClick={() => toggleSkill(skill)}
                        className={`text-[11px] py-1.5 px-3 font-medium border rounded-lg transition-all duration-150 ease-out cursor-pointer select-none active:scale-[0.96] ${
                          selected
                            ? "bg-[#B4F461]/10 text-[#B4F461] border-[#B4F461]/60 font-semibold shadow-[0_0_12px_rgba(180,244,97,0.18)] hover:border-[#B4F461] hover:bg-[#B4F461]/18 hover:-translate-y-0.5 hover:shadow-[0_0_16px_rgba(180,244,97,0.28)]"
                            : "bg-zinc-900/60 text-zinc-400 border-white/[0.08] hover:border-white/[0.22] hover:text-zinc-200 hover:bg-zinc-850 hover:-translate-y-0.5"
                        }`}
                      >
                        {skill}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Short Tagline / Bio */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider font-mono flex items-center justify-between">
                  <span>Tagline / Bio</span>
                  <span className="text-[10px] text-zinc-500 lowercase font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Full-stack dev interested in AI & Web3 hackathons"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="input text-xs w-full"
                />
              </div>

              {/* Action Button */}
              <div className="pt-4 border-t border-white/[0.06]">
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full py-3.5 text-xs font-bold bg-[#B4F461] hover:bg-[#c2f77d] text-[#09090b] rounded-xl transition-all duration-200 shadow-[0_0_24px_rgba(180,244,97,0.25)] hover:shadow-[0_0_32px_rgba(180,244,97,0.4)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-[#09090b]/30 border-t-[#09090b] rounded-full animate-spin" />
                      <span>Completing Setup...</span>
                    </div>
                  ) : (
                    <span>Start Building →</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}