"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { COLLEGES, normalizeCollege } from "@/lib/colleges";


type Props = {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  initialCollege?: string;
  onSuccess: (updatedProfile: any) => void;
};

const POPULAR_ROLES = [
  "Frontend Dev",
  "Backend Dev",
  "Full-Stack Dev",
  "AI / ML Engineer",
  "UI/UX Designer",
  "Mobile App Dev",
];

const POPULAR_SKILLS = [
  "React",
  "Node.js",
  "Python",
  "AI/ML",
  "Tailwind",
  "Figma",
  "Next.js",
  "Flutter",
  "Java",
  "C++",
  "PostgreSQL",
  "TypeScript",
];

import { trackEvent, identifyUser } from "@/lib/posthog";

export default function SIHQuickOnboardingModal({
  isOpen,
  onClose,
  userId,
  initialCollege = "",
  onSuccess,
}: Props) {
  const [college, setCollege] = useState(initialCollege);
  const [collegeSearch, setCollegeSearch] = useState(initialCollege);
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);
  const [selectedRole, setSelectedRole] = useState(POPULAR_ROLES[0]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>(["React", "Python"]);
  const [bio, setBio] = useState("Building for Smart India Hackathon 2026. Looking for compatible teammates!");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const filteredColleges = COLLEGES.filter((c) =>
    c.toLowerCase().includes(collegeSearch.toLowerCase())
  ).slice(0, 8);

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill)
        ? prev.filter((s) => s !== skill)
        : [...prev, skill].slice(0, 5)
    );
  };

  const handleSave = async () => {
    if (!college.trim() && !collegeSearch.trim()) {
      setErrorMsg("Please select or type your college / institution.");
      return;
    }

    if (selectedSkills.length === 0) {
      setErrorMsg("Please select at least 1 skill.");
      return;
    }

    if (!userId) {
      setErrorMsg("Authentication required. Please sign in to list yourself on the builder board.");
      if (typeof window !== "undefined") {
        window.location.href = `/?next=${encodeURIComponent("/hackathons/sih?action=list_myself")}&auth=true`;
      }
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const rawCollege = college.trim() || collegeSearch.trim();
      const finalCollege = normalizeCollege(rawCollege);

      const { data, error } = await supabase
        .from("profiles")
        .update({
          college: finalCollege,
          bio: bio.trim(),
          skills: selectedSkills,
          is_available: true,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select("id, full_name, avatar_url, college, skills, gender, role, bio, github_url, linkedin_url, onboarding_completed, is_available")
        .single();

      if (error) {
        throw error;
      }

      identifyUser(userId, { onboarding_completed: true });
      trackEvent("onboarding_completed", {
        modal_type: "sih_quick_modal",
        college: finalCollege,
        skills_count: selectedSkills.length,
      });

      onSuccess(data);
      onClose();
    } catch (err: any) {
      console.error("[SIH Quick Onboarding] Error:", err);
      setErrorMsg(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="card card-static w-full max-w-lg p-6 space-y-5 border-emerald-500/30 bg-zinc-950 shadow-2xl relative overflow-hidden">
        {/* Neon accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />

        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-900 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                ⚡ 10-Second Registration
              </span>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight mt-1.5">
              List Yourself for SIH 2026 Teammate Matching
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Teammates from your college will find you on the SIH builder board.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition p-1 text-base cursor-pointer"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg">
            {errorMsg}
          </div>
        )}

        <div className="space-y-4 text-xs">
          {/* College Selection */}
          <div className="relative">
            <label className="block text-zinc-300 font-mono text-[11px] font-semibold mb-1.5">
              1. Your College / University <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={collegeSearch}
              onChange={(e) => {
                setCollegeSearch(e.target.value);
                setCollege(e.target.value);
                setShowCollegeDropdown(true);
              }}
              onFocus={() => setShowCollegeDropdown(true)}
              placeholder="Type or select college (e.g. VJTI, SPIT, DJSCE, IIT...)"
              className="input w-full bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500/50"
            />

            {showCollegeDropdown && filteredColleges.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 max-h-44 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl divide-y divide-zinc-800/50">
                {filteredColleges.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCollege(c);
                      setCollegeSearch(c);
                      setShowCollegeDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition truncate cursor-pointer"
                  >
                    🏫 {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Primary Role */}
          <div>
            <label className="block text-zinc-300 font-mono text-[11px] font-semibold mb-1.5">
              2. Your Primary SIH Role <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {POPULAR_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedRole(r)}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-mono transition cursor-pointer text-center truncate border ${
                    selectedRole === r
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold shadow-sm"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Top Skill Chips */}
          <div>
            <label className="block text-zinc-300 font-mono text-[11px] font-semibold mb-1.5 flex items-center justify-between">
              <span>3. Top Skills (Select 1-5)</span>
              <span className="text-zinc-500 font-normal">{selectedSkills.length} selected</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_SKILLS.map((s) => {
                const isSelected = selectedSkills.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSkill(s)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition cursor-pointer ${
                      isSelected
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold"
                        : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    {isSelected ? `✓ ${s}` : `+ ${s}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Short Bio */}
          <div>
            <label className="block text-zinc-300 font-mono text-[11px] font-semibold mb-1.5">
              4. Short Teammate Bio
            </label>
            <input
              type="text"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="e.g. Full-Stack Developer looking for AI/ML lead for SIH 2026..."
              className="input w-full bg-zinc-900 border-zinc-800 text-white"
            />
          </div>
        </div>

        {/* Footer CTA */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-900">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-xs py-2 px-4"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary text-xs py-2 px-5 flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-bold border-none shadow-lg shadow-emerald-950/50 cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                <span>Publishing Profile...</span>
              </>
            ) : (
              <>
                <span>🚀 Publish Profile & Get Matched</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
