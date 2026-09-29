"use client";

import { useState, useEffect } from "react";
import { Check, Lightbulb, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { calculateProfileCompleteness } from "@/lib/profileCompleteness";
import { Button, Dialog, FieldLabel, FilterChip, Progress, Textarea } from "@/components/system";

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
          // Explicit column list: profiles has column-level SELECT grants, and
          // an unrestricted RETURNING * fails on the non-readable email column.
          .select("id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, is_available, onboarding_completed")
          .single();

        if (error) {
          console.error("[Profile Nudge Modal] Profile update failed:", error);
        } else if (updated && onProfileUpdated) {
          // The returned row only has the columns selected above, so merge it into
          // the caller's profile instead of replacing that profile wholesale.
          onProfileUpdated({ ...userProfile, ...updated });
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
    <Dialog
      open={isOpen}
      // Dismissing (Escape, backdrop, close button) closes without acting.
      // "Skip for now" still proceeds with the intended action.
      onClose={() => {
        if (!saving) onClose();
      }}
      title={
        <span className="inline-flex items-center gap-2">
          <Lightbulb className="size-4 shrink-0 text-accent-ink" aria-hidden />
          Help teams find you
        </span>
      }
      description={`Before ${actionTitle.toLowerCase()}, take a few seconds to fill in your profile.`}
      footer={
        <>
          <Button variant="ghost" onClick={handleSkipAndProceed} disabled={saving}>
            Skip for now
          </Button>
          <Button variant="primary" onClick={handleSaveAndProceed} loading={saving}>
            {saving ? "Saving…" : "Save and continue"}
          </Button>
        </>
      }
    >
      {/* Completeness summary */}
      <div className="rounded-lg border border-line bg-sunken px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-semibold text-ink">Your profile is {completeness.score}% complete</p>
          <span className="font-mono text-[12px] text-accent-ink tabular">{completeness.score}%</span>
        </div>
        <Progress value={completeness.score} className="mt-2" />
        <p className="mt-2 text-[12.5px] text-ink-3">
          Profiles with a bio and skills get <span className="font-medium text-ink-2">3x more team invites</span>.
        </p>
      </div>

      {/* Quick fill fields */}
      {(completeness.missingBio || completeness.missingSkills) && (
        <div className="mt-5 space-y-5">
          {completeness.missingBio && (
            <div>
              <FieldLabel htmlFor="nudge-bio">Short bio</FieldLabel>
              <Textarea
                id="nudge-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="e.g. Full-stack developer who likes Next.js and AI hackathons"
                rows={2}
                className="min-h-16"
              />
            </div>
          )}

          {completeness.missingSkills && (
            <div role="group" aria-labelledby="nudge-skills-label">
              <div id="nudge-skills-label" className="mb-2 caps-label text-ink-3">Your top skills</div>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1 [&>button]:h-9 md:[&>button]:h-7">
                {POPULAR_SKILLS.map((skill) => {
                  const isSelected = skills.includes(skill);
                  return (
                    <FilterChip key={skill} active={isSelected} onClick={() => toggleSkill(skill)}>
                      {isSelected ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                      {skill}
                    </FilterChip>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
