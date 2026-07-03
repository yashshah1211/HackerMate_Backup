"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import AuthGuard from "@/components/AuthGuard";

function EditProfileContent() {
  const router = useRouter();
  const { showToast } = useNotification();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [college, setCollege] = useState("");
  const [customCollege, setCustomCollege] = useState("");
  const [bio, setBio] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const SKILLS = [
    "React",
    "Next.js",
    "TypeScript",
    "JavaScript",
    "Node.js",
    "Express",
    "Python",
    "Java",
    "C++",
    "Flutter",
    "React Native",
    "AI/ML",
    "TensorFlow",
    "PyTorch",
    "Docker",
    "Kubernetes",
    "AWS",
    "Terraform",
    "Supabase",
    "PostgreSQL",
    "MongoDB",
    "UI/UX",
    "Figma",
    "DevOps",
    "Pandas",
    "MySQL",
    "HTML",
  ];

  const COLLEGES = [
    "DJSCE",
    "SPIT",
    "VJTI",
    "TSEC",
    "COEP",
    "PICT",
    "DAIICT",
    "Nirma University",
    "PDEU",
    "BITS Pilani",
    "IIT Bombay",
    "IIT Delhi",
    "IIT Madras",
    "NIT Trichy",
    "NIT Surathkal",
    "KJSIT",
    "Other",
  ];

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/");
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    if (data.college && COLLEGES.includes(data.college)) {
      setCollege(data.college);
    } else {
      setCollege("Other");
      setCustomCollege(data.college || "");
    }
    setBio(data.bio || "");
    setGithubUrl(data.github_url || "");
    setLinkedinUrl(data.linkedin_url || "");
    setSelectedSkills(data.skills || []);

    setLoading(false);
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      loadProfile();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSkill(skill: string) {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(
        selectedSkills.filter((s) => s !== skill)
      );
    } else {
      setSelectedSkills([...selectedSkills, skill]);
    }
  }

  async function saveProfile() {
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        college: 
          college === "Other"
            ? customCollege
            : college,
        bio: bio,
        github_url: githubUrl,
        linkedin_url: linkedinUrl,
        skills: selectedSkills,
      })
      .eq("id", user.id);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      setSaving(false);
      return;
    }

    showToast("Profile updated successfully!", "success");
    router.push("/dashboard");
  }

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto px-6 pt-24 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading profile...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-6 pt-24 pb-12">
      {/* Header */}
      <div className="mb-8 animate-fade-in-up">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors mb-2 font-mono uppercase tracking-wider"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          Back to dashboard
        </Link>

        <p className="section-label">SETTINGS</p>

        <h1 className="text-2xl font-semibold tracking-tight text-white mb-1">
          Edit profile
        </h1>

        <p className="text-xs text-zinc-400">
          Keep your information up to date.
        </p>
      </div>

      {/* Form */}
      <div className="card card-static p-6 animate-fade-in-up stagger-1">
        <div className="space-y-4">
          {/* College */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider font-mono">
              College / University
            </label>
            <select
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              className="input text-xs"
            >
              <option value="">Select College</option>

              {COLLEGES.map((collegeName) => (
                <option key={collegeName} value={collegeName}>
                  {collegeName}
                </option>
              ))}
            </select>
            {college === "Other" && (
              <input
                type="text"
                placeholder="Enter your college"
                value={customCollege}
                onChange={(e) => setCustomCollege(e.target.value)}
                className="input text-xs mt-2"
              />
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider font-mono">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Tell others about yourself..."
              className="input text-xs"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              A brief description helps others understand your background.
            </p>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-2 uppercase tracking-wider font-mono">
              Skills
            </label>

            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-zinc-950/40 border border-zinc-800/80 rounded">
              {SKILLS.map((skill) => {
                const selected = selectedSkills.includes(skill);

                return (
                  <button
                    type="button"
                    key={skill}
                    onClick={() => toggleSkill(skill)}
                    aria-pressed={selected}
                    className={`profile-skill-chip text-[10px] py-1 px-2 font-semibold border transition-all cursor-pointer select-none rounded ${
                      selected
                        ? "profile-skill-chip--selected bg-white text-black border-white"
                        : "profile-skill-chip--unselected bg-zinc-900/30 text-zinc-400 border-zinc-800/80 hover:border-zinc-700"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {selected && (
                        <svg
                          aria-hidden="true"
                          className="h-2.5 w-2.5"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M2.25 6.25 4.75 8.5 9.75 3.5"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      {skill}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3.5">
            {/* GitHub */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider font-mono">
                GitHub URL
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  <svg
                    className="w-4 h-4 text-zinc-600"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                </div>
                <input
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="github.com/username"
                  className="w-full rounded border border-zinc-800 bg-zinc-950/40 text-xs py-2 pl-9 pr-3 focus:outline-none focus:border-zinc-700 transition-colors"
                />
              </div>
            </div>

            {/* LinkedIn */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider font-mono">
                LinkedIn URL
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  <svg
                    className="w-4 h-4 text-zinc-600"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </div>
                <input
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="linkedin.com/in/username"
                  className="w-full rounded border border-zinc-800 bg-zinc-950/40 text-xs py-2 pl-9 pr-3 focus:outline-none focus:border-zinc-700 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="pt-3 flex items-center gap-2.5 border-t border-zinc-900 mt-4">
            <button
              onClick={saveProfile}
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </div>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                  <span>Save Changes</span>
                </>
              )}
            </button>

            <Link href="/dashboard" className="btn btn-secondary">
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function EditProfilePage() {
  return (
    <AuthGuard>
      <EditProfileContent />
    </AuthGuard>
  );
}
