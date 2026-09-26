"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import Logo from "@/components/Logo";
import { COLLEGES, normalizeCollege } from "@/lib/colleges";
import { trackEvent, identifyUser } from "@/lib/posthog";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Code2, GraduationCap, LoaderCircle, ShieldCheck } from "lucide-react";


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

const fieldClass = "h-11 w-full rounded-xl border border-white/[0.085] bg-zinc-900/50 px-3.5 text-sm text-zinc-100 outline-none transition-all duration-200 placeholder:text-zinc-600 hover:border-white/[0.22] focus:border-[#B4F461]/50 focus:bg-zinc-900/70 focus:ring-2 focus:ring-[#B4F461]/[0.08]";

export default function OnboardingPage() {
  const router = useRouter();
  const { showToast } = useNotification();

  const [college, setCollege] = useState("");
  const [customCollege, setCustomCollege] = useState("");
  const [collegeSearch, setCollegeSearch] = useState("");
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);
  const [focusedCollegeIndex, setFocusedCollegeIndex] = useState(-1);

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
          .select("college, bio, skills, github_url, linkedin_url, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins")

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
                } catch {}
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
    setSelectedSkills((current) => current.includes(skill)
      ? current.filter((item) => item !== skill)
      : [...current, skill]);
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

    const fieldsToSave: Record<string, string | number | boolean | string[] | null> = {
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
    const yearSaved = !error;

    if (error) {
      console.error("Unable to save academic year during onboarding; retrying profile update:", error);
      delete fieldsToSave.year_of_study;
      const { error: fbErr } = await supabase
        .from("profiles")
        .update(fieldsToSave)
        .eq("id", user.id);
      error = fbErr;
    }

    setLoading(false);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      return;
    }

    if (yearSaved && typeof window !== "undefined") {
      localStorage.setItem(`year_confirmed_${user.id}`, "true");
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
      requestedPath?.startsWith("/") && !requestedPath.startsWith("//") && !/[\\\u0000-\u001f]/.test(requestedPath)
        ? requestedPath
        : "/dashboard";
    router.push(safePath);
  }

  const filteredColleges = COLLEGES.filter((col) =>
    col !== "Other" && col.toLowerCase().includes(collegeSearch.toLowerCase())
  );
  const visibleColleges = filteredColleges.slice(0, 35);

  function selectCollege(value: string) {
    setCollege(value);
    setCollegeSearch("");
    setFocusedCollegeIndex(-1);
    setShowCollegeDropdown(false);
  }

  function handleCollegeKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setShowCollegeDropdown(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setShowCollegeDropdown(true);
      const optionCount = visibleColleges.length + 1;
      setFocusedCollegeIndex((index) => event.key === "ArrowDown"
        ? (index + 1) % optionCount
        : (index - 1 + optionCount) % optionCount);
    } else if (event.key === "Enter" && showCollegeDropdown) {
      event.preventDefault();
      if (focusedCollegeIndex >= 0) {
        selectCollege(visibleColleges[focusedCollegeIndex] ?? "Other");
      } else if (visibleColleges.length === 1) {
        selectCollege(visibleColleges[0]);
      }
    }
  }

  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden bg-[#09090b] px-4 py-6 text-zinc-100 selection:bg-[#B4F461] selection:text-zinc-950 sm:px-6 sm:py-9">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:52px_52px] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_36%,black,transparent)]" />
      <div aria-hidden="true" className="pointer-events-none absolute left-[10%] top-[-230px] -z-10 size-[520px] rounded-full bg-[#B4F461]/[0.045] blur-[120px]" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-[-250px] right-[7%] -z-10 size-[520px] rounded-full bg-[#22D3EE]/[0.03] blur-[130px]" />

      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-10 flex items-center justify-between gap-4 sm:mb-12">
          <Link href="/" className="group inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3.5 text-xs font-medium text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.055] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 motion-reduce:transform-none">
            <ArrowLeft aria-hidden="true" className="size-3.5 transition-transform group-hover:-translate-x-0.5 motion-reduce:transform-none" />
            Back to home
          </Link>
          <span className="hidden items-center gap-2 text-[11px] font-medium tracking-[0.12em] text-zinc-600 sm:inline-flex">
            <span className="size-1.5 rounded-full bg-[#B4F461] shadow-[0_0_10px_rgba(180,244,97,0.5)]" />
            HACKERMATE / SETUP
          </span>
        </header>

        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-11 w-20 items-center justify-center rounded-xl border border-[#B4F461]/20 bg-[#B4F461]/[0.05] shadow-[0_0_28px_rgba(180,244,97,0.055)]">
            <Logo className="w-15" />
          </div>
          <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.23em] text-[#B4F461]">Your builder profile</p>
          <h1 className="bg-gradient-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text text-[32px] font-semibold leading-tight tracking-[-0.045em] text-transparent sm:text-[38px]">
            Quick Builder Setup
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
            A few details help us surface relevant teammates and teams. You can refine your profile later.
          </p>
        </div>

        <div className="relative rounded-[24px] border border-white/[0.085] bg-[#111115]/95 shadow-[0_28px_90px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-2xl">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-[#B4F461]/35 to-transparent" />
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg border border-[#B4F461]/20 bg-[#B4F461]/[0.07] font-mono text-xs font-semibold text-[#B4F461]">01</span>
              <div>
                <p className="text-xs font-semibold text-zinc-100">Build your profile</p>
                <p className="text-[11px] text-zinc-500">College, skills, and a short intro</p>
              </div>
            </div>
            <span className="hidden font-mono text-[10px] uppercase tracking-wider text-zinc-600 sm:block">Required fields marked *</span>
          </div>

          {fetchingProfile ? (
            <div role="status" aria-live="polite" className="flex min-h-80 flex-col items-center justify-center gap-4">
              <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-[#B4F461]" />
              <p className="font-mono text-xs text-zinc-400">Loading your profile…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-7 px-5 py-7 sm:px-8 sm:py-8">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="relative">
                  <label htmlFor="onboarding-college" className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-300">
                    <GraduationCap aria-hidden="true" className="size-3.5 text-zinc-500" />
                    College / University <span className="text-[#B4F461]">*</span>
                  </label>
                  <input
                    id="onboarding-college"
                    type="text"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-controls="onboarding-college-options"
                    aria-expanded={showCollegeDropdown}
                    autoComplete="off"
                    placeholder="Search your college"
                    value={showCollegeDropdown ? collegeSearch : college}
                    onFocus={() => { setCollegeSearch(""); setFocusedCollegeIndex(-1); setShowCollegeDropdown(true); }}
                    onChange={(event) => { setCollegeSearch(event.target.value); setFocusedCollegeIndex(-1); setShowCollegeDropdown(true); }}
                    onKeyDown={handleCollegeKeyDown}
                    className={`relative z-20 ${fieldClass}`}
                  />
                  {showCollegeDropdown && (
                    <>
                      <button type="button" aria-label="Close college options" className="fixed inset-0 z-10 cursor-default" onClick={() => setShowCollegeDropdown(false)} />
                      <div id="onboarding-college-options" role="listbox" className="absolute left-0 right-0 top-full z-30 mt-2 max-h-60 overflow-y-auto rounded-xl border border-white/[0.12] bg-[#1a1a20]/95 p-1.5 shadow-[0_20px_55px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl">
                        {visibleColleges.map((collegeName, index) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={index === focusedCollegeIndex}
                            key={collegeName}
                            onMouseEnter={() => setFocusedCollegeIndex(index)}
                            onClick={() => selectCollege(collegeName)}
                            className={`w-full rounded-lg px-3 py-2.5 text-left text-xs transition-colors hover:bg-white/[0.07] hover:text-white ${index === focusedCollegeIndex ? "bg-white/[0.07] text-white" : "text-zinc-300"}`}
                          >
                            {collegeName}
                          </button>
                        ))}
                        {visibleColleges.length === 0 && <p className="px-3 py-3 text-xs text-zinc-500">No matching colleges. Add yours below.</p>}
                        <div className="mt-1 border-t border-white/[0.08] pt-1">
                          <button type="button" role="option" aria-selected={focusedCollegeIndex === visibleColleges.length} onMouseEnter={() => setFocusedCollegeIndex(visibleColleges.length)} onClick={() => selectCollege("Other")} className="w-full rounded-lg px-3 py-2.5 text-left text-xs font-medium text-[#B4F461] transition-colors hover:bg-[#B4F461]/[0.08]">
                            Add a different college
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  {college === "Other" && (
                    <input
                      id="onboarding-custom-college"
                      type="text"
                      aria-label="Custom college name"
                      placeholder="Enter your college name"
                      value={customCollege}
                      onChange={(event) => setCustomCollege(event.target.value)}
                      className={`mt-2.5 ${fieldClass}`}
                      required
                    />
                  )}
                </div>

                <div className="relative">
                  <label id="onboarding-year-label" className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-300">
                    <GraduationCap aria-hidden="true" className="size-3.5 text-zinc-500" />
                    Academic year <span className="text-[#B4F461]">*</span>
                  </label>
                  <button
                    type="button"
                    aria-labelledby="onboarding-year-label"
                    aria-haspopup="listbox"
                    aria-expanded={showYearDropdown}
                    aria-controls="onboarding-year-options"
                    onClick={() => {
                      setShowYearDropdown(!showYearDropdown);
                      const currentIndex = ACADEMIC_YEAR_OPTIONS.findIndex((option) => option.value === yearOfStudy);
                      setFocusedYearIndex(currentIndex >= 0 ? currentIndex : 0);
                    }}
                    onKeyDown={handleYearKeyDown}
                    className={`relative z-20 flex cursor-pointer items-center justify-between text-left hover:border-white/[0.22] focus-visible:border-[#B4F461]/50 ${fieldClass}`}
                  >
                    <span>{ACADEMIC_YEAR_OPTIONS.find((option) => option.value === yearOfStudy)?.label || yearOfStudy}</span>
                    <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-zinc-500 transition-transform duration-200 ${showYearDropdown ? "rotate-180 text-[#B4F461]" : ""}`} />
                  </button>
                  {showYearDropdown && (
                    <>
                      <button type="button" aria-label="Close academic year options" className="fixed inset-0 z-10 cursor-default" onClick={() => setShowYearDropdown(false)} />
                      <div id="onboarding-year-options" role="listbox" aria-labelledby="onboarding-year-label" className="absolute left-0 right-0 top-full z-30 mt-2 rounded-xl border border-white/[0.12] bg-[#1a1a20]/95 p-1.5 shadow-[0_20px_55px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl">
                        {ACADEMIC_YEAR_OPTIONS.map((option, index) => {
                          const selected = option.value === yearOfStudy;
                          return (
                            <button
                              type="button"
                              role="option"
                              aria-selected={selected}
                              key={option.value}
                              onMouseEnter={() => setFocusedYearIndex(index)}
                              onClick={() => { setYearOfStudy(option.value); setShowYearDropdown(false); }}
                              className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition-colors hover:bg-white/[0.07] hover:text-white ${selected ? "bg-[#B4F461]/[0.08] font-semibold text-[#B4F461]" : index === focusedYearIndex ? "bg-white/[0.07] text-white" : "text-zinc-300"}`}
                            >
                              {option.label}
                              {selected && <Check aria-hidden="true" className="size-3.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <label id="onboarding-skills-label" className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-300">
                      <Code2 aria-hidden="true" className="size-3.5 text-zinc-500" />
                      Tech stack & skills <span className="text-[#B4F461]">*</span>
                    </label>
                    <p className="mt-1.5 text-xs text-zinc-500">Choose what you build with. At least one skill is required.</p>
                  </div>
                  <span aria-live="polite" className="shrink-0 rounded-md border border-white/[0.08] bg-white/[0.025] px-2 py-1 font-mono text-[10px] text-zinc-400">
                    <span className={selectedSkills.length ? "font-semibold text-[#B4F461]" : ""}>{selectedSkills.length}</span> selected
                  </span>
                </div>
                <div role="group" aria-labelledby="onboarding-skills-label" className="flex flex-wrap gap-2 rounded-2xl border border-white/[0.07] bg-[#0c0c0f]/75 p-4 sm:p-5">
                  {SKILLS.map((skill) => {
                    const selected = selectedSkills.includes(skill);
                    return (
                      <button
                        type="button"
                        key={skill}
                        aria-pressed={selected}
                        onClick={() => toggleSkill(skill)}
                        className={`cursor-pointer select-none rounded-lg border px-3 py-2 text-[11px] font-medium leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-all duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 active:scale-[0.97] motion-reduce:transform-none ${selected
                          ? "border-[#B4F461]/55 bg-[#B4F461]/10 font-semibold text-[#B4F461] shadow-[0_0_12px_rgba(180,244,97,0.18),inset_0_1px_0_rgba(180,244,97,0.1)] hover:border-[#B4F461]/80"
                          : "border-white/[0.085] bg-zinc-900/70 text-zinc-400 hover:border-white/[0.22] hover:bg-zinc-800/70 hover:text-zinc-100"}`}
                      >
                        {skill}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="onboarding-bio" className="font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-300">Short intro</label>
                  <span className="font-mono text-[10px] text-zinc-600">OPTIONAL</span>
                </div>
                <input id="onboarding-bio" type="text" placeholder="What do you like building?" value={bio} onChange={(event) => setBio(event.target.value)} className={fieldClass} />
              </div>

              <div className="border-t border-white/[0.07] pt-6">
                <button type="submit" disabled={loading} className="group flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#d8ffa5]/55 bg-[#B4F461] px-5 text-sm font-bold text-[#11160b] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_30px_rgba(180,244,97,0.19)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#c5f783] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_14px_36px_rgba(180,244,97,0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 motion-reduce:transform-none">
                  {loading ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Completing setup…</> : <>Start Building <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" /></>}
                </button>
                <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-zinc-500">
                  <ShieldCheck aria-hidden="true" className="size-3.5" />
                  Your profile details can be updated later.
                </p>
              </div>
            </form>
          )}
        </div>
        <p className="mt-6 text-center font-mono text-[10px] tracking-wide text-zinc-600">HACKERMATE / BUILD WITH THE RIGHT PEOPLE</p>
      </div>
    </main>
  );
}
