"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import Logo from "@/components/Logo";
import { COLLEGES } from "@/lib/colleges";

const SKILLS = [
  "React", "Next.js", "TypeScript", "JavaScript", "TailwindCSS",
  "Node.js", "Express", "Python", "FastAPI", "Django", "Java", "C++",
  "Go", "Rust", "Flutter", "React Native", "AI/ML", "GenAI / LLMs",
  "OpenAI API", "TensorFlow", "PyTorch", "Web3 / Blockchain", "Docker",
  "AWS", "Supabase", "Firebase", "PostgreSQL", "MongoDB", "UI/UX", "Figma",
  "Product Management", "DevOps", "Public Speaking", "Pitching", "Graphic Design"
];

export default function OnboardingPage() {
  const router = useRouter();
  const { showToast } = useNotification();

  const [college, setCollege] = useState("");
  const [customCollege, setCustomCollege] = useState("");
  const [collegeSearch, setCollegeSearch] = useState("");
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);

  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
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
    async function loadProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setFetchingProfile(false);
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("*")
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const finalCollege = college === "Other" ? customCollege.trim() : college.trim();

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

    const { error } = await supabase
      .from("profiles")
      .update(fieldsToSave)
      .eq("id", user.id);

    setLoading(false);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      return;
    }

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

        {/* Form Card */}
        <div className="card card-static p-6 animate-fade-in-up stagger-1 min-h-[380px]">
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
                  College / University <span className="text-[#B4F461]">*</span>
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
                    <div className="absolute left-0 right-0 top-full mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-1.5 shadow-xl z-20">
                      {filteredColleges.slice(0, 35).map((collegeName) => (
                        <button
                          type="button"
                          key={collegeName}
                          onClick={() => {
                            setCollege(collegeName);
                            setCollegeSearch("");
                            setShowCollegeDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-md text-xs text-zinc-300 hover:bg-zinc-900 hover:text-[#B4F461] transition-colors cursor-pointer"
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
                        className="w-full text-left px-3 py-2 rounded-md text-xs text-[#B4F461] font-semibold hover:bg-zinc-900 transition-colors border-t border-zinc-800/80 cursor-pointer"
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

              {/* Skills & Tech Stack */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                    Tech Stack & Skills <span className="text-[#B4F461]">*</span>
                  </label>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {selectedSkills.length} selected
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto p-2.5 bg-zinc-950/50 border border-zinc-800 rounded-lg">
                  {SKILLS.map((skill) => {
                    const selected = selectedSkills.includes(skill);
                    return (
                      <button
                        type="button"
                        key={skill}
                        onClick={() => toggleSkill(skill)}
                        className={`text-[10px] py-1 px-2.5 font-medium border transition-colors cursor-pointer select-none rounded-md ${
                          selected
                            ? "bg-[#B4F461] text-[#09090b] border-[#B4F461] font-bold"
                            : "bg-zinc-900/40 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-white"
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
              <div className="pt-4 border-t border-zinc-900">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-lime w-full py-3 text-xs font-bold bg-[#B4F461] hover:bg-[#a3e64f] text-[#09090b] rounded-xl transition-all shadow-md shadow-[#B4F461]/20 cursor-pointer flex items-center justify-center gap-2"
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