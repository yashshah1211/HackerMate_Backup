"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { calculateProfileCompleteness } from "@/lib/profileCompleteness";

const POPULAR_SKILLS = [
  "React",
  "Next.js",
  "Node.js",
  "Python",
  "AI / ML",
  "UI / UX Design",
  "Tailwind CSS",
  "TypeScript",
  "Flutter",
  "FastAPI",
  "Java",
  "C++",
  "PostgreSQL",
  "Supabase",
];

export type ContextualProfileNudgeModalProps = {
  isOpen: boolean;
  onClose: () => void; // Closes without action
  onProceed: () => void; // Executes the intended action (e.g. create team / list self)
  userProfile: any;
  actionTitle?: string;
  onProfileUpdated?: (updatedProfile: any) => void;
};

export default function ContextualProfileNudgeModal({
  isOpen,
  onClose,
  onProceed,
  userProfile,
  actionTitle = "Proceeding",
  onProfileUpdated,
}: ContextualProfileNudgeModalProps) {
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const completeness = calculateProfileCompleteness(userProfile);

  useEffect(() => {
    if (userProfile) {
      setBio(userProfile.bio || "");
      setSkills(Array.isArray(userProfile.skills) ? userProfile.skills : []);
    }
  }, [userProfile]);

  if (!isOpen) return null;

  const toggleSkill = (skill: string) => {
    setSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const handleSaveAndProceed = async () => {
    if (!userProfile?.id) {
      onProceed();
      return;
    }

    setSaving(true);
    try {
      const updates: any = {};
      if (completeness.missingBio && bio.trim()) {
        updates.bio = bio.trim();
      }
      if (completeness.missingSkills && skills.length > 0) {
        updates.skills = skills;
      }

      if (Object.keys(updates).length > 0) {
        const { data: updated, error } = await supabase
          .from("profiles")
          .update(updates)
          .eq("id", userProfile.id)
          .select()
          .single();

        if (!error && updated && onProfileUpdated) {
          onProfileUpdated(updated);
        }
      }
    } catch (err) {
      console.error("[Profile Nudge Modal] Save Error:", err);
    } finally {
      setSaving(false);
      onProceed();
    }
  };

  const handleSkipAndProceed = () => {
    onProceed();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        {/* Top Header Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500 text-base">
              💡
            </span>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Boost Your Team Visibility
              </h3>
              <p className="text-xs text-zinc-400">
                Before {actionTitle.toLowerCase()}...
              </p>
            </div>
          </div>
          <button
            onClick={handleSkipAndProceed}
            className="text-xs text-zinc-500 hover:text-zinc-300 font-mono transition"
          >
            ✕
          </button>
        </div>

        {/* Banner Alert */}
        <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3.5 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-zinc-200">
              Your profile is {completeness.score}% complete
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Profiles with a bio & skills get <strong className="text-orange-400">3x more team invites</strong>!
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-mono font-bold text-orange-400">
              {completeness.score}%
            </div>
          </div>
        </div>

        {/* Quick Fill Form Fields */}
        <div className="space-y-4 mb-6">
          {/* Quick Bio Input */}
          {completeness.missingBio && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Add a quick bio / short summary:
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="e.g. Full-stack developer passionate about Next.js and AI hackathons..."
                rows={2}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none transition"
              />
            </div>
          )}

          {/* Quick Skills Pills */}
          {completeness.missingSkills && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-2">
                Select your top tech skills:
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {POPULAR_SKILLS.map((skill) => {
                  const isSelected = skills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        isSelected
                          ? "bg-orange-500 text-white shadow-xs"
                          : "bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                      }`}
                    >
                      {isSelected ? `✓ ${skill}` : `+ ${skill}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={handleSkipAndProceed}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={handleSaveAndProceed}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 active:scale-98 transition shadow-lg shadow-orange-500/20 flex items-center gap-1.5"
          >
            {saving ? (
              <>
                <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>Save & Continue →</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
