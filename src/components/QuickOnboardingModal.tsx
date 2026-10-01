"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { parseGithubUsername } from "@/lib/github";
import { COLLEGES, normalizeCollege } from "@/lib/colleges";
import { trackEvent, identifyUser } from "@/lib/posthog";
import { Button, Dialog, FieldLabel, Input, Select, Tape } from "@/components/system";

interface QuickOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialGithubUrl?: string;
}

const FORM_ID = "quick-onboarding-form";

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
  const [yearOfStudy, setYearOfStudy] = useState("2nd Year");
  const [collegeSearch, setCollegeSearch] = useState("");
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);

  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");

  const [submitting, setSubmitting] = useState(false);

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
    const rawCollege = college === "Other" ? customCollege.trim() : college.trim();
    const finalCollege = normalizeCollege(rawCollege);


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
      const storedReferrer = typeof window !== 'undefined' ? localStorage.getItem('hm_referrer_source') : null;

      const updatePayload: any = {
        college: finalCollege,
        year_of_study: yearOfStudy,
        bio: bio.trim() || null,
        github_url: cleanGithubUrl,
        skills: selectedSkills.length > 0 ? selectedSkills : ["Coding", "Hackathons"],
        avatar_url: avatarUrl || undefined,
        referrer_source: storedReferrer || undefined,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      };

      let { error } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", user.id);

      if (error) {
        delete updatePayload.year_of_study;
        const { error: fbErr } = await supabase
          .from("profiles")
          .update(updatePayload)
          .eq("id", user.id);
        error = fbErr;
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(`year_confirmed_${user.id}`, "true");
      }

      if (error) {
        console.error("Error setting profile onboarding complete:", error);
        showToast(error.message, "error");
      } else {
        identifyUser(user.id, { onboarding_completed: true });
        trackEvent("onboarding_completed", {
          modal_type: "quick_modal",
          college: finalCollege,
          skills_count: selectedSkills.length,
        });
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
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          Quick profile setup
          <Tape tone="ok">Verified builder</Tape>
        </span>
      }
      description="Finish your profile to show up in teammate matching and search."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={submitting}>
            {submitting ? "Saving profile…" : "Complete profile"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        {/* GitHub Profile URL */}
        <div>
          <FieldLabel htmlFor="qo-github">GitHub username or URL</FieldLabel>
          <Input
            id="qo-github"
            type="text"
            placeholder="e.g. octocat or github.com/octocat"
            value={githubInput}
            onChange={(e) => setGithubInput(e.target.value)}
            className="h-10 font-mono md:h-[34px]"
          />
        </div>

        {/* College Selection */}
        <div className="relative">
          <FieldLabel htmlFor="qo-college" hint="Required">College / institution</FieldLabel>
          <Input
            id="qo-college"
            type="text"
            autoComplete="off"
            placeholder="Search your college"
            value={collegeSearch || college}
            onChange={(e) => {
              setCollegeSearch(e.target.value);
              setShowCollegeDropdown(true);
            }}
            onFocus={() => setShowCollegeDropdown(true)}
            className="h-10 md:h-[34px]"
          />
          {showCollegeDropdown && (
            <div
              role="listbox"
              aria-label="Colleges"
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-line bg-overlay p-1 shadow-pop"
            >
              {filteredColleges.slice(0, 30).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="option"
                  aria-selected={college === c}
                  onClick={() => {
                    setCollege(c);
                    setCollegeSearch(c);
                    setShowCollegeDropdown(false);
                  }}
                  className="flex min-h-9 w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
                >
                  {c}
                </button>
              ))}
              <button
                type="button"
                role="option"
                aria-selected={college === "Other"}
                onClick={() => {
                  setCollege("Other");
                  setCollegeSearch("Other");
                  setShowCollegeDropdown(false);
                }}
                className="flex min-h-9 w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium text-accent-ink transition-colors hover:bg-hover"
              >
                <Plus className="size-3.5" aria-hidden />
                Other (type your college)
              </button>
            </div>
          )}

          {college === "Other" && (
            <Input
              type="text"
              aria-label="College name"
              placeholder="Type your college name"
              value={customCollege}
              onChange={(e) => setCustomCollege(e.target.value)}
              className="mt-2 h-10 md:h-[34px]"
              required
            />
          )}
        </div>

        {/* Academic Year of Study */}
        <div>
          <FieldLabel htmlFor="qo-year" hint="Required">Year of study</FieldLabel>
          <Select
            id="qo-year"
            value={yearOfStudy}
            onChange={(e) => setYearOfStudy(e.target.value)}
            className="h-10 cursor-pointer md:h-[34px]"
          >
            <option value="1st Year">1st Year (Fresher)</option>
            <option value="2nd Year">2nd Year (Sophomore)</option>
            <option value="3rd Year">3rd Year (Junior)</option>
            <option value="4th Year">4th Year (Senior)</option>
            <option value="Postgrad / Alumni">Postgrad / Alumni</option>
          </Select>
        </div>

        {/* Bio */}
        <div>
          <FieldLabel htmlFor="qo-bio">Short bio</FieldLabel>
          <Input
            id="qo-bio"
            type="text"
            placeholder="e.g. Full-stack dev interested in AI and Web3 hackathons"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="h-10 md:h-[34px]"
          />
        </div>

        {/* Skills */}
        <div>
          <FieldLabel htmlFor="qo-skill">Skills and stack</FieldLabel>
          {selectedSkills.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selectedSkills.map((s) => (
                <span
                  key={s}
                  className="inline-flex h-9 items-center gap-1 rounded-[4px] bg-accent-soft pl-2 pr-0.5 font-mono text-[12.5px] text-accent-ink ring-1 ring-inset ring-accent/35 md:h-7"
                >
                  <span className="max-w-[16ch] truncate">{s}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(s)}
                    aria-label={`Remove ${s}`}
                    className="inline-flex size-8 items-center justify-center rounded-[3px] hover:bg-hover md:size-6"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              id="qo-skill"
              type="text"
              placeholder="Add a skill (e.g. React, Python, Figma)"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddSkill();
                }
              }}
              className="h-10 min-w-0 flex-1 md:h-[34px]"
            />
            <Button
              variant="secondary"
              onClick={handleAddSkill}
              icon={<Plus aria-hidden />}
              className="h-10 shrink-0 md:h-[34px]"
            >
              Add
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

