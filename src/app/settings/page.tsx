"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowUpRight, Copy, Lock, LogOut, Plus, UserX, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import AuthGuard from "@/components/AuthGuard";
import DeleteAccountSection from "@/components/settings/DeleteAccountSection";
import { useShell } from "@/components/shell/ShellContext";
import { COLLEGES, normalizeCollege } from "@/lib/colleges";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  ErrorNotice,
  FieldLabel,
  FilterChip,
  GithubIcon,
  Input,
  LinkedinIcon,
  List,
  Page,
  PageHeader,
  SearchField,
  Section,
  Select,
  Skeleton,
  SkeletonRows,
  Switch,
  Textarea,
} from "@/components/system";

interface BlockedUserItem {
  blocked_id: string;
  created_at: string;
  blocked_user?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    college: string | null;
  } | null;
}

const SKILLS_LIST = [
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

const YEAR_OPTIONS = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Postgrad / Alumni", "Other"];
const GENDER_OPTIONS = ["Male", "Female", "Non-binary / Other", "Prefer not to say"];

type SettingsTab = "profile" | "privacy" | "account";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "privacy", label: "Privacy" },
  { id: "account", label: "Account" },
];

/* ── Presentational helpers ─────────────────────────────────────────────── */

/** In-page section switch styled like RouteTabs (the tab lives in local state). */
function SettingsTabs({ value, onChange }: { value: SettingsTab; onChange: (t: SettingsTab) => void }) {
  const layoutId = useId();
  return (
    <div role="tablist" aria-label="Settings sections" className="-mb-px flex items-end gap-5 overflow-x-auto scrollbar-none">
      {TABS.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative flex h-10 shrink-0 items-center text-[13px] font-medium transition-colors",
              active ? "text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {t.label}
            {active && (
              <motion.span
                layoutId={`settings-tab-${layoutId}`}
                className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-signal"
                transition={{ type: "spring", stiffness: 520, damping: 42 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Labelled row inside a boxed Section: text on the left, control on the right. */
function SettingRow({ title, description, control }: { title: ReactNode; description?: ReactNode; control: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-ink">{title}</p>
        {description && <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast, confirm } = useNotification();

  const [activeTab, setActiveTab] = useState<"profile" | "privacy" | "account">(
    (searchParams.get("tab") as any) || "profile"
  );

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userCreatedAt, setUserCreatedAt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Profile Form States
  const [fullName, setFullName] = useState("");
  const [college, setCollege] = useState("");
  const [customCollege, setCustomCollege] = useState("");
  const [collegeSearch, setCollegeSearch] = useState("");
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);
  const [yearOfStudy, setYearOfStudy] = useState("2nd Year");
  const [gender, setGender] = useState("");
  const [bio, setBio] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillSearch, setSkillSearch] = useState("");

  // Hackathon Experience States (Personal Display)
  const [hasParticipated, setHasParticipated] = useState<boolean>(false);
  const [participationsCount, setParticipationsCount] = useState<number | "">("");
  const [hasWon, setHasWon] = useState<boolean>(false);
  const [winsCount, setWinsCount] = useState<number | "">("");

  // Privacy States
  const [isAvailable, setIsAvailable] = useState(true);
  const [showTrackRecord, setShowTrackRecord] = useState(true);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  // Blocked Users
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserItem[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [blocksError, setBlocksError] = useState<string | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  // Sign out confirmation modal
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoadError(null);
    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr || !user) {
        router.push("/login?next=/settings");
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email || "");
      setUserCreatedAt(user.created_at || "");

      // Explicit safe columns query on profiles
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select(
          "id, full_name, college, year_of_study, bio, avatar_url, skills, github_url, linkedin_url, gender, is_available, show_track_record, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins"
        )
        .eq("id", user.id)
        .single();

      if (profErr) {
        console.error("Error loading profile settings:", profErr);
        setLoadError(profErr.message || "Failed to load profile details");
        showToast("Failed to load profile details", "error");
      } else if (prof) {
        setFullName(prof.full_name || "");
        if (prof.college && COLLEGES.includes(prof.college)) {
          setCollege(prof.college);
        } else if (prof.college) {
          setCollege("Other");
          setCustomCollege(prof.college);
        } else {
          setCollege("Other");
          setCustomCollege("");
        }

        setYearOfStudy(prof.year_of_study || "2nd Year");
        setGender(prof.gender || "");
        setBio(prof.bio || "");
        setGithubUrl(prof.github_url || "");
        setLinkedinUrl(prof.linkedin_url || "");
        setSelectedSkills(prof.skills || []);
        setIsAvailable(prof.is_available ?? true);
        setShowTrackRecord(prof.show_track_record ?? true);

        setHasParticipated(prof.has_participated_hackathon ?? false);
        setParticipationsCount(prof.hackathon_participations ?? "");
        setHasWon(prof.has_won_hackathon ?? false);
        setWinsCount(prof.hackathon_wins ?? "");
      }

      // Load blocked users
      loadBlockedUsers(user.id);
    } catch (err) {
      console.error("Failed to initialize settings:", err);
      setLoadError(err instanceof Error ? err.message : "Failed to initialize settings");
    } finally {
      setLoading(false);
    }
  }

  async function loadBlockedUsers(currentUid: string) {
    setLoadingBlocks(true);
    setBlocksError(null);
    try {
      // blocked_users.blocked_id references auth.users, not public.profiles, so
      // PostgREST cannot embed profiles here. Fetch the rows, then the profiles
      // separately (explicit columns, normal RLS), and merge them client-side.
      const { data: rows, error } = await supabase
        .from("blocked_users")
        .select("blocked_id, created_at")
        .eq("blocker_id", currentUid)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load blocked users:", error);
        setBlocksError(error.message);
        return;
      }

      const blockRows = rows ?? [];
      const ids = [...new Set(blockRows.map((r) => r.blocked_id))];
      const profilesById = new Map<string, NonNullable<BlockedUserItem["blocked_user"]>>();

      if (ids.length > 0) {
        const { data: profs, error: profError } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, college")
          .in("id", ids);

        if (profError) {
          console.error("Failed to load blocked builders' profiles:", profError);
          setBlocksError(profError.message);
          return;
        }
        for (const p of profs ?? []) profilesById.set(p.id, p);
      }

      // Rows whose profile is missing still render (as "Unknown user") so they can be unblocked.
      setBlockedUsers(
        blockRows.map((r) => ({
          blocked_id: r.blocked_id,
          created_at: r.created_at,
          blocked_user: profilesById.get(r.blocked_id) ?? null,
        })),
      );
    } catch (e) {
      console.error("Failed to load blocked users:", e);
      setBlocksError(e instanceof Error ? e.message : "Failed to load blocked users");
    } finally {
      setLoadingBlocks(false);
    }
  }

  function toggleSkill(skill: string) {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(selectedSkills.filter((s) => s !== skill));
    } else {
      if (selectedSkills.length >= 15) {
        showToast("Maximum 15 skills allowed", "warning");
        return;
      }
      setSelectedSkills([...selectedSkills, skill]);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;

    if (!fullName.trim()) {
      showToast("Please enter your full name", "warning");
      return;
    }

    if (hasParticipated) {
      if (participationsCount === "" || Number(participationsCount) <= 0) {
        showToast("Please enter valid hackathon participations count", "warning");
        return;
      }
      if (hasWon && (winsCount === "" || Number(winsCount) < 0)) {
        showToast("Please enter valid hackathon wins count", "warning");
        return;
      }
      if (hasWon && Number(winsCount) > Number(participationsCount)) {
        showToast("Wins count cannot exceed participation count", "warning");
        return;
      }
    }

    setSaving(true);
    try {
      const finalCollege = college === "Other" ? customCollege.trim() : college;
      const normalizedCollege = normalizeCollege(finalCollege);

      const updatePayload: Record<string, any> = {
        college: normalizedCollege || null,
        year_of_study: yearOfStudy,
        gender: gender || null,
        bio: bio.trim() || null,
        github_url: githubUrl.trim() || null,
        linkedin_url: linkedinUrl.trim() || null,
        skills: selectedSkills,
        has_participated_hackathon: hasParticipated,
        hackathon_participations: hasParticipated ? Number(participationsCount) : 0,
        has_won_hackathon: hasParticipated && hasWon ? true : false,
        hackathon_wins: hasParticipated && hasWon ? Number(winsCount) : 0,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("profiles").update(updatePayload).eq("id", userId);

      if (error) {
        console.error("Save profile error:", error);
        showToast(error.message || "Failed to update profile", "error");
      } else {
        showToast("Profile settings saved", "success");
      }
    } catch (err: any) {
      console.error(err);
      showToast("An unexpected error occurred while saving", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePrivacy(field: "is_available" | "show_track_record", newValue: boolean) {
    if (!userId) return;
    setSavingPrivacy(true);
    try {
      if (field === "is_available") setIsAvailable(newValue);
      if (field === "show_track_record") setShowTrackRecord(newValue);

      const { error } = await supabase
        .from("profiles")
        .update({ [field]: newValue, updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (error) {
        console.error(`Failed to update ${field}:`, error);
        showToast("Failed to update privacy preference", "error");
        // Revert local state
        if (field === "is_available") setIsAvailable(!newValue);
        if (field === "show_track_record") setShowTrackRecord(!newValue);
      } else {
        showToast("Privacy settings updated", "success");
      }
    } catch (e) {
      console.error(e);
      showToast("Could not save preference", "error");
    } finally {
      setSavingPrivacy(false);
    }
  }

  async function handleUnblockUser(blockedId: string, blockedName: string) {
    if (!userId) return;
    confirm({
      title: "Unblock User",
      message: `Are you sure you want to unblock ${blockedName || "this user"}? They will be able to see your public profile and connect with you again.`,
      confirmText: "Unblock",
      cancelText: "Cancel",
      onConfirm: async () => {
        setUnblockingId(blockedId);
        try {
          const { error } = await supabase
            .from("blocked_users")
            .delete()
            .eq("blocker_id", userId)
            .eq("blocked_id", blockedId);

          if (error) {
            console.error("Failed to unblock user:", error);
            showToast("Failed to unblock user", "error");
          } else {
            showToast("User unblocked successfully", "success");
            setBlockedUsers((prev) => prev.filter((b) => b.blocked_id !== blockedId));
          }
        } catch (e) {
          console.error(e);
        } finally {
          setUnblockingId(null);
        }
      },
    });
  }

  async function handleSignOut() {
    setShowSignOutModal(false);
    localStorage.removeItem("theme");
    document.documentElement.className = "dark";
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function copyUserId() {
    if (userId) {
      navigator.clipboard.writeText(userId);
      showToast("User ID copied to clipboard", "info");
    }
  }

  const filteredColleges = COLLEGES.filter((c) =>
    c.toLowerCase().includes(collegeSearch.toLowerCase())
  );

  const filteredSkills = SKILLS_LIST.filter(
    (s) => s.toLowerCase().includes(skillSearch.toLowerCase()) && !selectedSkills.includes(s)
  );

  if (loading) {
    return (
      <Page width="narrow">
        <div className="pt-5 md:pt-8" aria-busy="true" aria-label="Loading settings">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-3 h-3.5 w-56" />
          <div className="mt-6 flex gap-5 border-b border-line pb-3">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3.5 w-14" />
          </div>
          <div className="mt-8 space-y-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-[34px] w-full rounded-md" />
            <Skeleton className="h-[34px] w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <PageHeader
        title="Settings"
        meta={
          <span className="block truncate">
            {userEmail}
            {college && college !== "Other" && <span className="text-ink-4"> · </span>}
            {college && college !== "Other" && college}
          </span>
        }
        actions={
          userId && (
            <ButtonLink href={`/profile/${userId}`} variant="secondary" iconRight={<ArrowUpRight />}>
              View public profile
            </ButtonLink>
          )
        }
        tabs={<SettingsTabs value={activeTab} onChange={setActiveTab} />}
      />

      {loadError && (
        <ErrorNotice className="mt-6" title="Couldn't load your settings" detail={loadError} onRetry={() => loadSettings()} />
      )}

      {/* ── TAB 1: PROFILE ── */}
      {activeTab === "profile" && (
        <form onSubmit={handleSaveProfile} className="mt-8 space-y-10">
          <Section title="Basic info" id="settings-basic">
            <div className="space-y-4">
              <div>
                <FieldLabel
                  htmlFor="settings-name"
                  hint={
                    <span className="inline-flex items-center gap-1">
                      <Lock className="size-3" aria-hidden />
                      From your Google account
                    </span>
                  }
                >
                  Full name
                </FieldLabel>
                <Input id="settings-name" type="text" readOnly disabled value={fullName} />
              </div>

              {/* College selector */}
              <div>
                <FieldLabel htmlFor="settings-college" hint="Required">
                  College
                </FieldLabel>
                <div className="relative">
                  <Input
                    id="settings-college"
                    type="text"
                    autoComplete="off"
                    aria-expanded={showCollegeDropdown}
                    aria-controls="settings-college-list"
                    value={college === "Other" ? customCollege : collegeSearch || college}
                    onFocus={() => {
                      setShowCollegeDropdown(true);
                      setCollegeSearch(college === "Other" ? "" : college);
                    }}
                    onChange={(e) => {
                      setCollegeSearch(e.target.value);
                      if (college === "Other") setCustomCollege(e.target.value);
                      setShowCollegeDropdown(true);
                    }}
                    placeholder="Search your college"
                  />

                  {showCollegeDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowCollegeDropdown(false)} />
                      <div
                        id="settings-college-list"
                        className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-overlay p-1 shadow-pop"
                      >
                        {filteredColleges.slice(0, 20).map((c) => (
                          <button
                            type="button"
                            key={c}
                            onClick={() => {
                              setCollege(c);
                              setCustomCollege("");
                              setCollegeSearch("");
                              setShowCollegeDropdown(false);
                            }}
                            className={cn(
                              "flex min-h-9 w-full items-center rounded-[5px] px-2.5 py-1.5 text-left text-[13px] transition-colors",
                              college === c ? "bg-selected font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
                            )}
                          >
                            {c}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setCollege("Other");
                            setCustomCollege(collegeSearch);
                            setShowCollegeDropdown(false);
                          }}
                          className="mt-1 flex min-h-9 w-full items-center gap-1.5 rounded-[5px] border-t border-line px-2.5 py-1.5 text-left text-[13px] font-medium text-accent-ink hover:bg-hover"
                        >
                          <Plus className="size-3.5 shrink-0" aria-hidden />
                          Other (enter your college name)
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {college === "Other" && (
                  <div className="mt-2">
                    <Input
                      type="text"
                      required
                      aria-label="College name"
                      value={customCollege}
                      onChange={(e) => setCustomCollege(e.target.value)}
                      placeholder="Full name of your college"
                    />
                    <p className="mt-1.5 text-[12px] text-ink-3">Use the official, non-abbreviated name.</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <FieldLabel htmlFor="settings-year">Year of study</FieldLabel>
                  <Select id="settings-year" value={yearOfStudy} onChange={(e) => setYearOfStudy(e.target.value)}>
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="min-w-0">
                  <FieldLabel htmlFor="settings-gender">Gender</FieldLabel>
                  <Select id="settings-gender" value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="">Select gender</option>
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1.5 text-[12px] text-ink-3">Used to check SIH team composition rules.</p>
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="settings-bio" hint={<span className="font-mono tabular">{bio.length}/300</span>}>
                  Bio
                </FieldLabel>
                <Textarea
                  id="settings-bio"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={300}
                  className="resize-none"
                  placeholder="What you like to build, past projects, what you want from your next hackathon"
                />
              </div>
            </div>
          </Section>

          {/* ── Skills ── */}
          <Section
            title="Skills"
            id="settings-skills"
            action={<span className="font-mono text-[12.5px] text-ink-3 tabular">{selectedSkills.length}/15</span>}
            description="Tap a selected skill to remove it."
          >
            <div className="space-y-4">
              {selectedSkills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedSkills.map((skill) => (
                    <FilterChip key={skill} active onClick={() => toggleSkill(skill)}>
                      {skill}
                      <X className="size-3" aria-hidden />
                    </FilterChip>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-ink-3">No skills yet. Add up to 15 below.</p>
              )}

              <div className="space-y-2.5">
                <SearchField
                  value={skillSearch}
                  onChange={setSkillSearch}
                  placeholder="Search skills to add"
                  label="Search skills to add"
                />
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto p-0.5">
                  {filteredSkills.slice(0, 24).map((skill) => (
                    <FilterChip key={skill} active={false} onClick={() => toggleSkill(skill)}>
                      <Plus className="size-3 text-ink-3" aria-hidden />
                      {skill}
                    </FilterChip>
                  ))}
                  {filteredSkills.length === 0 && (
                    <p className="text-[12.5px] text-ink-3">No matching skills.</p>
                  )}
                </div>
              </div>
            </div>
          </Section>

          {/* ── Links ── */}
          <Section title="Links" id="settings-links">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <FieldLabel htmlFor="settings-github">GitHub</FieldLabel>
                <Input
                  id="settings-github"
                  type="url"
                  leading={<GithubIcon />}
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/username"
                  className="font-mono text-[13px]"
                />
              </div>
              <div className="min-w-0">
                <FieldLabel htmlFor="settings-linkedin">LinkedIn</FieldLabel>
                <Input
                  id="settings-linkedin"
                  type="url"
                  leading={<LinkedinIcon />}
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/profile"
                  className="font-mono text-[13px]"
                />
              </div>
            </div>
          </Section>

          {/* ── Hackathon experience (self-reported) ── */}
          <Section
            title="Hackathon experience"
            id="settings-experience"
            description="Self-reported. Shown on your profile card."
            boxed
          >
            <div className="divide-y divide-line">
              <SettingRow
                title="I've taken part in hackathons"
                description="Shows team leads you've shipped under pressure before."
                control={
                  <Switch
                    label="I've taken part in hackathons"
                    checked={hasParticipated}
                    onChange={(v) => {
                      if (v) {
                        setHasParticipated(true);
                      } else {
                        setHasParticipated(false);
                        setParticipationsCount("");
                        setHasWon(false);
                        setWinsCount("");
                      }
                    }}
                  />
                }
              />

              {hasParticipated && (
                <div className="px-4 py-3.5">
                  <FieldLabel htmlFor="settings-participations">Hackathons entered</FieldLabel>
                  <Input
                    id="settings-participations"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    value={participationsCount}
                    onChange={(e) => setParticipationsCount(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="e.g. 3"
                    className="max-w-[160px] font-mono tabular"
                  />
                </div>
              )}

              {hasParticipated && (
                <SettingRow
                  title="I've won or placed top 3"
                  control={
                    <Switch
                      label="I've won or placed top 3"
                      checked={hasWon}
                      onChange={(v) => {
                        if (v) {
                          setHasWon(true);
                        } else {
                          setHasWon(false);
                          setWinsCount("");
                        }
                      }}
                    />
                  }
                />
              )}

              {hasParticipated && hasWon && (
                <div className="px-4 py-3.5">
                  <FieldLabel htmlFor="settings-wins">Wins / top-3 finishes</FieldLabel>
                  <Input
                    id="settings-wins"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={participationsCount || 99}
                    value={winsCount}
                    onChange={(e) => setWinsCount(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="e.g. 1"
                    className="max-w-[160px] font-mono tabular"
                  />
                </div>
              )}
            </div>
          </Section>

          {/* ── Save bar: fixed above the tab bar on mobile, inline on desktop ── */}
          <div className="fixed inset-x-0 bottom-[calc(var(--hm-tabbar-h)+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 border-t border-line bg-canvas px-4 py-2.5 md:static md:justify-end md:border-t md:bg-transparent md:px-0 md:pb-0 md:pt-5">
            <Button type="button" variant="ghost" onClick={() => loadSettings()} disabled={saving}>
              Discard
            </Button>
            <Button type="submit" variant="primary" loading={saving} className="flex-1 md:flex-none">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      )}

      {/* ── TAB 2: PRIVACY ── */}
      {activeTab === "privacy" && (
        <div className="mt-8 space-y-10">
          <Section title="Visibility" id="settings-visibility" boxed>
            <div className="divide-y divide-line">
              <SettingRow
                title="Show track record"
                description="Your badges, past hackathons and campus leaderboard points appear on your profile and campus rosters."
                control={
                  <Switch
                    label="Show track record"
                    checked={showTrackRecord}
                    disabled={savingPrivacy}
                    onChange={(v) => handleTogglePrivacy("show_track_record", v)}
                  />
                }
              />
              <SettingRow
                title="Open to teams"
                description="Team leads can find you in the builder directory and see you in match suggestions for upcoming hackathons."
                control={
                  <Switch
                    label="Open to teams"
                    checked={isAvailable}
                    disabled={savingPrivacy}
                    onChange={(v) => handleTogglePrivacy("is_available", v)}
                  />
                }
              />
            </div>
          </Section>

          <Section
            title="Blocked builders"
            id="settings-blocked"
            count={loadingBlocks ? undefined : blockedUsers.length}
            description="Blocked builders can't send you connection requests, team invites or messages."
          >
            {loadingBlocks ? (
              <SkeletonRows rows={2} />
            ) : blocksError ? (
              <ErrorNotice
                title="Couldn't load blocked builders"
                detail={blocksError}
                onRetry={userId ? () => loadBlockedUsers(userId) : undefined}
              />
            ) : blockedUsers.length === 0 ? (
              <EmptyState
                compact
                icon={<UserX />}
                title="No one blocked"
                body="You can block a builder from their profile if you need to."
              />
            ) : (
              <div className="rounded-lg border border-line bg-raised">
                <List>
                  {blockedUsers.map((b) => {
                    const u = b.blocked_user;
                    return (
                      <li key={b.blocked_id} className="flex items-center gap-3 px-4 py-3">
                        <Avatar name={u?.full_name || "Unknown"} src={u?.avatar_url} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium text-ink">{u?.full_name || "Unknown user"}</p>
                          <p className="truncate text-[12.5px] text-ink-3">{u?.college || "College not set"}</p>
                        </div>
                        <Button
                          variant="ghost"
                          loading={unblockingId === b.blocked_id}
                          onClick={() => handleUnblockUser(b.blocked_id, u?.full_name || "this user")}
                          className="shrink-0"
                        >
                          {unblockingId === b.blocked_id ? "Unblocking…" : "Unblock"}
                        </Button>
                      </li>
                    );
                  })}
                </List>
              </div>
            )}
          </Section>
        </div>
      )}

      {/* ── TAB 3: ACCOUNT ── */}
      {activeTab === "account" && (
        <div className="mt-8 space-y-10">
          <Section title="Account" id="settings-account" boxed>
            <dl className="divide-y divide-line">
              <div className="px-4 py-3.5">
                <dt className="caps-label text-ink-3">Email</dt>
                <dd className="mt-1 break-all font-mono text-[13px] text-ink select-all">{userEmail}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0">
                  <dt className="caps-label text-ink-3">User ID</dt>
                  <dd className="mt-1 truncate font-mono text-[12.5px] text-ink-2 select-all">{userId}</dd>
                </div>
                <Button variant="secondary" size="md" icon={<Copy />} onClick={copyUserId} className="shrink-0">
                  Copy
                </Button>
              </div>
              {userCreatedAt && (
                <div className="px-4 py-3.5">
                  <dt className="caps-label text-ink-3">Member since</dt>
                  <dd className="mt-1 text-[13.5px] text-ink-2">
                    {new Date(userCreatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  </dd>
                </div>
              )}
            </dl>
          </Section>

          <Section title="Appearance" id="settings-appearance" boxed>
            <SettingRow
              title="Theme"
              description="Choose how HackerMate looks to you."
              control={<ThemeSegmentedControl />}
            />
          </Section>

          <Section title="Session" id="settings-session" boxed>
            <SettingRow
              title="Sign out on this browser"
              description="Your teams, messages and profile stay as they are."
              control={
                <Button variant="secondary" icon={<LogOut />} onClick={() => setShowSignOutModal(true)}>
                  Sign out
                </Button>
              }
            />
          </Section>

          {/* Destructive actions live last, visually separated from normal settings. */}
          <div className="mt-10 border-t border-line pt-10">
            <DeleteAccountSection />
          </div>
        </div>
      )}

      {/* Sign out confirmation */}
      <Dialog
        open={showSignOutModal}
        onClose={() => setShowSignOutModal(false)}
        size="sm"
        title="Sign out?"
        description="You'll need to sign in again to get back to your teams and messages."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowSignOutModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" icon={<LogOut />} onClick={handleSignOut}>
              Sign out
            </Button>
          </>
        }
      />
    </Page>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}

function ThemeSegmentedControl() {
  const shell = useShell();
  if (!shell) return null;
  const { themePref, setThemePref } = shell;

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-line bg-surface p-1">
      {(["system", "dark", "light"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setThemePref?.(t)}
          className={cn(
            "px-3 py-1.5 text-[13px] font-medium rounded-sm transition-colors capitalize",
            themePref === t ? "bg-raised text-ink shadow-sm ring-1 ring-inset ring-line" : "text-ink-3 hover:text-ink-2"
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

