"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { parseGithubUsername, fetchGithubProfileInfo } from "@/lib/github";
import { COLLEGES } from "@/lib/colleges";

interface QuickOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialGithubUrl?: string;
}

export default function QuickOnboardingModal({
  isOpen,
  onClose,
  onSuccess,
  initialGithubUrl = "",
}: QuickOnboardingModalProps) {
  const { showToast } = useNotification();

  const [githubInput, setGithubInput] = useState(initialGithubUrl);
  const [college, setCollege] = useState("");
  const [customCollege, setCustomCollege] = useState("");
  const [collegeSearch, setCollegeSearch] = useState("");
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);

  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");

  const [fetchingGithub, setFetchingGithub] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  async function handleAutofillGithub() {
    const username = parseGithubUsername(githubInput);
    if (!username) {
      showToast("Please enter a valid GitHub username or profile URL.", "warning");
      return;
    }

    setFetchingGithub(true);
    try {
      const info = await fetchGithubProfileInfo(username);
      if (info.bio && !bio) setBio(info.bio);
      if (info.avatar_url && !avatarUrl) setAvatarUrl(info.avatar_url);
      if (info.skills && info.skills.length > 0) {
        const merged = Array.from(new Set([...selectedSkills, ...info.skills]));
        setSelectedSkills(merged);
      }
      showToast(`Fetched profile info for @${info.username}!`, "success");
    } catch (err: any) {
      console.error("Failed to fetch GitHub profile:", err);
      showToast("Could not fetch GitHub info automatically. You can fill in the details manually.", "warning");
    }
    setFetchingGithub(false);
  }

  function handleAddSkill() {
    const trimmed = skillInput.trim();
    if (trimmed && !selectedSkills.includes(trimmed)) {
      setSelectedSkills([...selectedSkills, trimmed]);
      setSkillInput("");
    }
  }

  function handleRemoveSkill(skillToRemove: string) {
    setSelectedSkills(selectedSkills.filter((s) => s !== skillToRemove));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalCollege = college === "Other" ? customCollege.trim() : college.trim();

    if (!finalCollege) {
      showToast("Please select your college / institution.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast("Session expired. Please log in again.", "error");
        setSubmitting(false);
        return;
      }

      const parsedGithub = parseGithubUsername(githubInput);
      const cleanGithubUrl = parsedGithub ? `https://github.com/${parsedGithub}` : githubInput.trim() || null;

      const { error } = await supabase
        .from("profiles")
        .update({
          college: finalCollege,
          bio: bio.trim() || null,
          github_url: cleanGithubUrl,
          skills: selectedSkills.length > 0 ? selectedSkills : ["Coding", "Hackathons"],
          avatar_url: avatarUrl || undefined,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) {
        console.error("Error setting profile onboarding complete:", error);
        showToast(error.message, "error");
      } else {
        showToast("Profile completed successfully! You are now a Verified Builder.", "success");
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to complete profile.", "error");
    }
    setSubmitting(false);
  }

  const filteredColleges = COLLEGES.filter((c) =>
    c.toLowerCase().includes(collegeSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg card card-static p-6 border-emerald-950/80 bg-zinc-950 animate-scale-in">
        <div className="flex items-start justify-between gap-4 mb-4 border-b border-zinc-900 pb-3">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <span>⚡ Quick Profile Setup (15 Seconds)</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                Verified Builder
              </span>
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Complete your profile to unlock teammate matching and search visibility.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-xs"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* GitHub Auto-Fill */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
              GitHub Username or Profile URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. octocat or github.com/octocat"
                value={githubInput}
                onChange={(e) => setGithubInput(e.target.value)}
                className="input text-xs flex-1 font-mono"
              />
              <button
                type="button"
                onClick={handleAutofillGithub}
                disabled={fetchingGithub || !githubInput.trim()}
                className="btn btn-secondary text-xs py-1.5 px-3 border-emerald-900/60 text-emerald-400 hover:bg-emerald-950/40 flex items-center gap-1 shrink-0"
              >
                {fetchingGithub ? (
                  <>
                    <div className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                    <span>Fetching...</span>
                  </>
                ) : (
                  <>
                    <span>⚡ Auto-fill</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* College Selection */}
          <div className="relative">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
              College / Institution <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              placeholder="Search or select your college..."
              value={collegeSearch || college}
              onChange={(e) => {
                setCollegeSearch(e.target.value);
                setShowCollegeDropdown(true);
              }}
              onFocus={() => setShowCollegeDropdown(true)}
              className="input text-xs w-full"
            />
            {showCollegeDropdown && (
              <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded shadow-xl">
                {filteredColleges.slice(0, 30).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCollege(c);
                      setCollegeSearch(c);
                      setShowCollegeDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors border-b border-zinc-800/40 last:border-0"
                  >
                    {c}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setCollege("Other");
                    setCollegeSearch("Other");
                    setShowCollegeDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-emerald-400 font-semibold hover:bg-zinc-800 transition-colors"
                >
                  + Other (Specify custom college)
                </button>
              </div>
            )}

            {college === "Other" && (
              <input
                type="text"
                placeholder="Type your college name..."
                value={customCollege}
                onChange={(e) => setCustomCollege(e.target.value)}
                className="input text-xs w-full mt-2"
                required
              />
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
              Short Bio / Tagline
            </label>
            <input
              type="text"
              placeholder="e.g. Full-stack dev interested in AI & Web3 hackathons"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="input text-xs w-full"
            />
          </div>

          {/* Skills */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
              Skills & Tech Stack
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedSkills.map((s) => (
                <span
                  key={s}
                  className="bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 rounded px-2 py-0.5 text-[10px] font-mono flex items-center gap-1"
                >
                  <span>{s}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(s)}
                    className="text-emerald-500 hover:text-emerald-200"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add skill (e.g. React, Python, Figma)"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSkill();
                  }
                }}
                className="input text-xs flex-1"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="btn btn-secondary text-xs py-1 px-3 shrink-0"
              >
                Add
              </button>
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-900">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary text-xs py-1.5 px-4"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary text-xs py-2 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving Profile...</span>
                </>
              ) : (
                <>
                  <span>🚀 Complete Profile & Get Verified</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
