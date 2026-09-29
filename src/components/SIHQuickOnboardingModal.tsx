"use client";

import { useState, type ReactNode } from "react";
import { Check, GraduationCap, Plus, TriangleAlert, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { COLLEGES, normalizeCollege } from "@/lib/colleges";
import { Button, Dialog, FieldLabel, Input, Tape } from "@/components/system";
import { cn } from "@/lib/utils";


type Props = {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  initialCollege?: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
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

/** Toggle button sized for touch (36px on mobile, compact on desktop). */
function ToggleOption({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-[5px] px-2.5 text-[12.5px] font-medium transition-colors md:h-8 [&_svg]:size-3.5 [&_svg]:shrink-0",
        active
          ? "bg-ink text-canvas"
          : "bg-raised text-ink-2 ring-1 ring-inset ring-line-strong hover:text-ink hover:ring-ink-4",
        className,
      )}
    >
      {children}
    </button>
  );
}

export default function SIHQuickOnboardingModal({
  isOpen,
  onClose,
  userId,
  initialCollege = "",
  title,
  subtitle,
  buttonText,
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
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="lg"
      title={title || "List Yourself for SIH 2026 Teammate Matching"}
      description={subtitle || "Teammates from your college will find you on the SIH builder board."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving} icon={saving ? undefined : <Zap />}>
            {saving ? "Saving profile…" : buttonText || "Publish Profile & Get Matched"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Tape tone="accent" icon={<Zap />}>
          Takes about 10 seconds
        </Tape>

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-md bg-bad-soft px-3 py-2.5 text-[12.5px] text-ink ring-1 ring-inset ring-bad/25" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
            <span className="min-w-0">{errorMsg}</span>
          </div>
        )}

        {/* College Selection */}
        <div className="relative">
          <FieldLabel htmlFor="sih-qo-college" hint="Required">
            College / university
          </FieldLabel>
          <Input
            id="sih-qo-college"
            type="text"
            autoComplete="off"
            leading={<GraduationCap />}
            value={collegeSearch}
            onChange={(e) => {
              setCollegeSearch(e.target.value);
              setCollege(e.target.value);
              setShowCollegeDropdown(true);
            }}
            onFocus={() => setShowCollegeDropdown(true)}
            placeholder="VJTI, SPIT, DJSCE, IIT…"
            className="max-md:h-10"
          />

          {showCollegeDropdown && filteredColleges.length > 0 && (
            <div className="absolute inset-x-0 z-20 mt-1 max-h-44 overflow-y-auto rounded-md border border-line bg-overlay p-1 shadow-pop">
              {filteredColleges.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCollege(c);
                    setCollegeSearch(c);
                    setShowCollegeDropdown(false);
                  }}
                  className="flex h-9 w-full items-center rounded-[5px] px-2.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
                >
                  <span className="truncate">{c}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Primary Role */}
        <div>
          <FieldLabel hint="Required">Primary SIH role</FieldLabel>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="group" aria-label="Primary SIH role">
            {POPULAR_ROLES.map((r) => (
              <ToggleOption key={r} active={selectedRole === r} onClick={() => setSelectedRole(r)}>
                <span className="truncate">{r}</span>
              </ToggleOption>
            ))}
          </div>
        </div>

        {/* Top Skill Chips */}
        <div>
          <FieldLabel hint={<span className="font-mono tabular">{selectedSkills.length}/5 selected</span>}>Top skills</FieldLabel>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Top skills">
            {POPULAR_SKILLS.map((s) => {
              const isSelected = selectedSkills.includes(s);
              return (
                <ToggleOption key={s} active={isSelected} onClick={() => toggleSkill(s)}>
                  {isSelected ? <Check aria-hidden /> : <Plus aria-hidden />}
                  {s}
                </ToggleOption>
              );
            })}
          </div>
        </div>

        {/* Short Bio */}
        <div>
          <FieldLabel htmlFor="sih-qo-bio">Short bio</FieldLabel>
          <Input
            id="sih-qo-bio"
            type="text"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="e.g. Full-stack developer looking for an AI/ML lead for SIH 2026"
            className="max-md:h-10"
          />
        </div>
      </div>
    </Dialog>
  );
}
