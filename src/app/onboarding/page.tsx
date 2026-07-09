"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { parseGithubUsername, fetchGithubStats } from "@/lib/github";
import Logo from "@/components/Logo";

export default function OnboardingPage() {
  const router = useRouter();
  const { showToast } = useNotification();

  const [step, setStep] = useState(1);
  const [college, setCollege] = useState("");
  const [customCollege, setCustomCollege] = useState("");
  const [bio, setBio] = useState("");
  const [github, setGithub] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const SKILLS = [
    "React",
    "Next.js",
    "TypeScript",
    "JavaScript",
    "TailwindCSS",
    "Node.js",
    "Express",
    "Python",
    "FastAPI",
    "Django",
    "Java",
    "C++",
    "Go",
    "Rust",
    "Flutter",
    "React Native",
    "Swift",
    "Kotlin",
    "AI/ML",
    "GenAI / LLMs",
    "OpenAI API",
    "TensorFlow",
    "PyTorch",
    "Web3 / Blockchain",
    "Solidity",
    "Docker",
    "Kubernetes",
    "AWS",
    "GCP",
    "Supabase",
    "Firebase",
    "PostgreSQL",
    "MongoDB",
    "MySQL",
    "UI/UX",
    "Figma",
    "Product Management",
    "Cybersecurity",
    "IoT / Hardware",
    "AR/VR",
    "GameDev (Unity/Unreal)",
    "DevOps",
    "Public Speaking",
    "Presenting",
    "Pitching",
    "Technical Writing",
    "Graphic Design",
    "Video Editing",
  ];

  const COLLEGES = [
    "DJSCE",
    "SPIT",
    "VJTI",
    "TSEC",
    "COEP",
    "PICT",
    "VIT Vellore",
    "SRM University",
    "Manipal Institute",
    "RVCE",
    "PES University",
    "DTU",
    "NSUT",
    "BITS Pilani",
    "IIT Bombay",
    "IIT Delhi",
    "IIT Madras",
    "IIT Kharagpur",
    "IIT Roorkee",
    "NIT Trichy",
    "NIT Surathkal",
    "Nirma University",
    "DAIICT",
    "Other",
  ];

  function toggleSkill(skill: string) {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(selectedSkills.filter((s) => s !== skill));
    } else {
      setSelectedSkills([...selectedSkills, skill]);
    }
  }

  function validateStep1() {
    if (!college) {
      showToast("Please select your college", "warning");
      return false;
    }
    if (college === "Other" && !customCollege.trim()) {
      showToast("Please enter your college name", "warning");
      return false;
    }
    if (!bio.trim()) {
      showToast("Please write a short bio about yourself", "warning");
      return false;
    }
    return true;
  }

  function validateStep2() {
    // GitHub and LinkedIn are optional, but we check formatting if entered
    if (github.trim() && !github.toLowerCase().includes("github.com") && !parseGithubUsername(github)) {
      showToast("Please enter a valid GitHub URL or username", "warning");
      return false;
    }
    return true;
  }

  async function handleSubmit() {
    if (selectedSkills.length === 0) {
      showToast("Please select at least one skill", "warning");
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      showToast("User not found", "error");
      setLoading(false);
      return;
    }

    let stats = null;
    let statsUpdated = null;
    const trimmedGithub = github.trim();
    if (trimmedGithub !== "") {
      const username = parseGithubUsername(trimmedGithub);
      if (username) {
        try {
          showToast("Syncing GitHub statistics...", "info");
          stats = await fetchGithubStats(username);
          statsUpdated = new Date().toISOString();
        } catch (e) {
          console.error("Failed to auto-sync GitHub statistics during onboarding:", e);
          showToast("Profile set up, but could not retrieve GitHub repository stats.", "warning");
        }
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        college: college === "Other" ? customCollege : college,
        bio,
        github_url: github,
        linkedin_url: linkedin,
        skills: selectedSkills,
        github_stats: stats,
        github_stats_updated_at: statsUpdated,
        onboarding_completed: true,
      })
      .eq("id", user.id);

    setLoading(false);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      return;
    }

    showToast("Profile set up successfully!", "success");
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-[var(--background)]">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in-up">
          <div className="flex justify-center mb-4">
            <Logo className="h-12 w-auto" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-white mb-1.5">
            Create your profile
          </h1>

          <p className="text-xs text-zinc-400">
            Tell the community who you are and what you build.
          </p>
        </div>

        {/* Stepper Progress Indicator */}
        <div className="flex items-center justify-between mb-6 px-2 select-none animate-fade-in-up">
          {[
            { num: 1, label: "Profile" },
            { num: 2, label: "Socials" },
            { num: 3, label: "Skills" },
          ].map((s, idx) => (
            <div key={s.num} className="flex items-center flex-1 last:flex-initial">
              <div className="flex items-center gap-2">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all duration-300 ${
                    step >= s.num
                      ? "bg-white text-black border-white shadow-[0_0_12px_rgba(255,255,255,0.25)]"
                      : "bg-zinc-950 text-zinc-500 border-zinc-800"
                  }`}
                >
                  {s.num}
                </div>
                <span
                  className={`text-[10px] font-mono uppercase tracking-wider hidden sm:inline transition-colors duration-300 ${
                    step >= s.num ? "text-zinc-200 font-semibold" : "text-zinc-500"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {idx < 2 && (
                <div
                  className={`h-[1px] flex-1 mx-4 transition-all duration-300 ${
                    step > s.num ? "bg-white" : "bg-zinc-800"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="card card-static p-6 animate-fade-in-up stagger-1 min-h-[380px] flex flex-col justify-between">
          <div className="space-y-5">
            {step === 1 && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <h2 className="text-sm font-semibold text-white mb-1">Academic Background</h2>
                  <p className="text-[10px] text-zinc-500 mb-3">Where do you study or teach?</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider font-mono">
                    College / University *
                  </label>
                  <select
                    value={college}
                    onChange={(e) => setCollege(e.target.value)}
                    className="input text-xs"
                  >
                    <option value="">Select your college</option>
                    {COLLEGES.map((collegeName) => (
                      <option key={collegeName} value={collegeName}>
                        {collegeName}
                      </option>
                    ))}
                  </select>

                  {college === "Other" && (
                    <input
                      type="text"
                      placeholder="Enter your college name"
                      value={customCollege}
                      onChange={(e) => setCustomCollege(e.target.value)}
                      className="input text-xs mt-2"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider font-mono">
                    Bio *
                  </label>
                  <textarea
                    placeholder="Tell us about yourself, your interests, and what you like to build..."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={4}
                    className="input text-xs resize-none"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    A brief description helps others understand your background.
                  </p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <h2 className="text-sm font-semibold text-white mb-1">Developer Networks</h2>
                  <p className="text-[10px] text-zinc-500 mb-3">Connect your social accounts to display on your card.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider font-mono">
                    GitHub URL / Username
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                      <svg className="w-4 h-4 text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="github.com/username"
                      value={github}
                      onChange={(e) => setGithub(e.target.value)}
                      className="w-full rounded border border-zinc-800 bg-zinc-950/40 text-xs py-2 pl-9 pr-3 focus:outline-none focus:border-zinc-700 transition-colors"
                    />
                  </div>
                  <p className="text-[9px] text-zinc-600 mt-1">This will automatically fetch your top repository statistics.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider font-mono">
                    LinkedIn URL
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                      <svg className="w-4 h-4 text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="linkedin.com/in/username"
                      value={linkedin}
                      onChange={(e) => setLinkedin(e.target.value)}
                      className="w-full rounded border border-zinc-800 bg-zinc-950/40 text-xs py-2 pl-9 pr-3 focus:outline-none focus:border-zinc-700 transition-colors"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <h2 className="text-sm font-semibold text-white mb-1">Developer Skills</h2>
                  <p className="text-[10px] text-zinc-500 mb-3">Select the languages and technologies you build with.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-2 uppercase tracking-wider font-mono">
                    Skills ({selectedSkills.length} selected) *
                  </label>

                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2 bg-zinc-950/40 border border-zinc-800/80 rounded">
                    {SKILLS.map((skill) => {
                      const selected = selectedSkills.includes(skill);

                      return (
                        <button
                          type="button"
                          key={skill}
                          onClick={() => toggleSkill(skill)}
                          className={`text-[10px] py-1 px-2 font-medium border transition-colors cursor-pointer select-none rounded ${
                            selected
                              ? "bg-white text-black border-white"
                              : "bg-zinc-900/30 text-zinc-400 border-zinc-800/80 hover:border-zinc-700"
                          }`}
                        >
                          {skill}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-8 pt-4 border-t border-zinc-900/60 flex items-center justify-between gap-3">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="btn btn-secondary text-xs py-1.5 px-4"
                disabled={loading}
              >
                Back
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && validateStep1()) setStep(2);
                  else if (step === 2 && validateStep2()) setStep(3);
                }}
                className="btn btn-primary text-xs py-1.5 px-5 flex items-center gap-1"
              >
                <span>Continue</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="btn btn-primary text-xs py-1.5 px-5 flex items-center gap-1.5"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span>Complete Profile</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Footer text */}
        <p className="text-center text-[9px] text-zinc-600 font-mono uppercase tracking-widest mt-6 select-none">
          HackerMate • Team OS for Hackathons
        </p>
      </div>
    </main>
  );
}