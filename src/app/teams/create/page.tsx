"use client";

import { useEffect, useState, Suspense, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lightbulb, Minus, Plus, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  Button,
  ButtonLink,
  Chip,
  FieldLabel,
  FilterChip,
  IconButton,
  Input,
  Page,
  PageHeader,
  PageLoader,
  Panel,
  SeatMeter,
  Section,
  Select,
  TeamMark,
  Textarea,
} from "@/components/system";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";
import { COLLEGES, normalizeCollege } from "@/lib/colleges";

import ContextualProfileNudgeModal from "@/components/ContextualProfileNudgeModal";
import { calculateProfileCompleteness } from "@/lib/profileCompleteness";
import { trackEvent } from "@/lib/posthog";

const SKILLS = [
  "React", "Next.js", "TypeScript", "JavaScript", "Node.js", "Express",
  "Python", "Java", "C++", "Flutter", "React Native", "AI/ML",
  "TensorFlow", "PyTorch", "Docker", "Kubernetes", "AWS", "Terraform",
  "Supabase", "PostgreSQL", "MongoDB", "UI/UX", "Figma", "DevOps",
];

const ROLES = [
  "Frontend Developer", "Backend Developer", "Full Stack Developer",
  "UI/UX Designer", "AI/ML Engineer", "Data Scientist", "Mobile Developer",
  "DevOps Engineer", "Cloud Engineer", "Product Manager", "Blockchain Developer",
];

type Hackathon = {
  id: string;
  name: string;
  min_team_size?: number | null;
  max_team_size?: number | null;
};

export default function CreateTeamPage() {
  return (
    <AuthGuard>
      <Suspense fallback={
        <Page width="narrow">
          <PageLoader label="Loading team creator" />
        </Page>
      }>
        <CreateTeamForm />
      </Suspense>
    </AuthGuard>
  );
}

function CreateTeamForm() {
  const router = useRouter();
  const { showToast } = useNotification();
  const searchParams = useSearchParams();
  const preselectedHackathonId = searchParams.get("hackathon");
  const preselectedTrack = searchParams.get("track");
  // Pre-populate invite from post-acceptance prompt
  const inviteUserId = searchParams.get("invite");
  const [inviteUserName, setInviteUserName] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [college, setCollege] = useState("");
  const [hackathonId, setHackathonId] = useState(preselectedHackathonId || "");
  const [selectedTrack, setSelectedTrack] = useState<string>(preselectedTrack || "");
  const [availableTracks, setAvailableTracks] = useState<{ id: string; name: string }[]>([]);
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [hackathonsLoading, setHackathonsLoading] = useState(true);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [maxMembers, setMaxMembers] = useState(4);
  const [loading, setLoading] = useState(false);
  const [customCollege, setCustomCollege] = useState("");
  const [collegeSearch, setCollegeSearch] = useState("");
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);
  const [isFromEvaluator, setIsFromEvaluator] = useState(false);

  // Check for prefill from Idea Evaluator or query parameters
  useEffect(() => {
    try {
      const storedSession = sessionStorage.getItem("hackermate_team_prefill");
      let prefill: any = null;
      if (storedSession) {
        prefill = JSON.parse(storedSession);
        sessionStorage.removeItem("hackermate_team_prefill");
      }

      const prefillParam = searchParams.get("prefill");
      const prefillSource = Boolean(prefillParam || prefill);

      if (prefillSource) {
        setIsFromEvaluator(true);
      }

      if (prefill) {
        if (prefill.name) setName(prefill.name);
        if (prefill.description) setDescription(prefill.description);
        if (prefill.hackathonId) setHackathonId(prefill.hackathonId);
        if (Array.isArray(prefill.skills) && prefill.skills.length > 0) {
          const validSkills = prefill.skills.filter((s: string) => SKILLS.includes(s));
          if (validSkills.length > 0) {
            setSelectedSkills((prev) => Array.from(new Set([...prev, ...validSkills])));
          }
        }
        if (Array.isArray(prefill.roles) && prefill.roles.length > 0) {
          const validRoles = prefill.roles.filter((r: string) => ROLES.includes(r));
          if (validRoles.length > 0) {
            setSelectedRoles((prev) => Array.from(new Set([...prev, ...validRoles])));
          }
        }
        if (prefill.name || prefill.description) {
          showToast("Prefilled team details from your Idea Evaluation", "info");
        }
      } else if (prefillParam && prefillParam !== "evaluator") {
        // Fetch server-side evaluation details by opaque ID
        (async () => {
          try {
            const { data: evalRow } = await supabase
              .from("user_pitch_evaluations")
              .select("id, ps_title, evaluation_result")
              .eq("id", prefillParam)
              .maybeSingle();

            if (evalRow) {
              if (evalRow.ps_title) setName(evalRow.ps_title);
              const res = evalRow.evaluation_result as any;
              if (res?.recommendedRoles) {
                const allSuggested = res.recommendedRoles.flatMap((r: any) => r.suggestedSkills || []);
                const validSkills = allSuggested.filter((s: string) => SKILLS.includes(s));
                if (validSkills.length > 0) {
                  setSelectedSkills((prev) => Array.from(new Set([...prev, ...validSkills])));
                }
                const rolesNeeded = res.recommendedRoles.map((r: any) => r.role);
                const validRoles = rolesNeeded.filter((r: string) => ROLES.includes(r));
                if (validRoles.length > 0) {
                  setSelectedRoles((prev) => Array.from(new Set([...prev, ...validRoles])));
                }
              }
              showToast("Prefilled team details from your Idea Evaluation", "info");
            }
          } catch (err) {
            console.warn("Could not fetch evaluation prefill:", err);
          }
        })();
      }
    } catch (err) {
      console.warn("Could not parse team prefill:", err);
    }
  }, [searchParams, showToast]);

  useEffect(() => {
    if (hackathonId) {
      supabase
        .from("partner_configs")
        .select("features")
        .eq("hackathon_id", hackathonId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.features?.events) {
            setAvailableTracks(data.features.events);
          } else {
            setAvailableTracks([]);
          }
        });
    } else {
      setAvailableTracks([]);
    }
  }, [hackathonId]);

  async function loadHackathons() {
    let { data, error } = await supabase
      .from("hackathons")
      .select("id, name, min_team_size, max_team_size, status, end_date")
      .eq("archived", false)
      .order("start_date", { ascending: true });

    if (error) {
      console.error("[loadHackathons] Primary query failed, attempting fallback:", error);
      const fallback = await supabase
        .from("hackathons")
        .select("id, name, status, end_date")
        .eq("archived", false)
        .order("start_date", { ascending: true });

      if (fallback.error) {
        console.error("[loadHackathons] Fallback query failed:", fallback.error);
      } else {
        data = fallback.data as any;
      }
    }

    const allHackathons = (data as unknown as (Hackathon & { status?: string, end_date?: string })[]) || [];
    
    // Filter out concluded or archived events
    const activeHackathons = allHackathons.filter(h => {
      if (h.status === "archived") return false;
      if (h.end_date && new Date(h.end_date) < new Date()) return false;
      return true;
    });

    setHackathons(activeHackathons);
    
    // If the preselected hackathon is now invalid, clear it
    if (hackathonId && !activeHackathons.find(h => h.id === hackathonId)) {
      setHackathonId("");
      showToast("The selected event has concluded. You cannot form teams for it.", "warning");
    }

    setHackathonsLoading(false);
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      loadHackathons();
    });
  }, []);

  useEffect(() => {
    if (hackathonId && hackathons.length > 0) {
      const selected = hackathons.find((h) => h.id === hackathonId);
      if (selected?.max_team_size) {
        setMaxMembers(selected.max_team_size);
      }
    }
  }, [hackathonId, hackathons]);

  function toggleSkill(skill: string) {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  }

  function toggleRole(role: string) {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  // UI-only: free-text entries appended to the same selectedSkills / selectedRoles arrays.
  const [customSkill, setCustomSkill] = useState("");
  const [customRole, setCustomRole] = useState("");

  function addCustomSkill() {
    const trimmed = customSkill.trim();
    if (!trimmed) return;
    setSelectedSkills((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setCustomSkill("");
  }

  function addCustomRole() {
    const trimmed = customRole.trim();
    if (!trimmed) return;
    setSelectedRoles((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setCustomRole("");
  }

  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [nudgeModalOpen, setNudgeModalOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from("profiles").select("id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, username, show_track_record").eq("id", user.id).single().then(({ data }) => {

          if (data) setCurrentUserProfile(data);
        });
      }
    });

    // Fetch the invited user's name for the banner
    if (inviteUserId) {
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", inviteUserId)
        .single()
        .then(({ data }) => {
          if (data) setInviteUserName(data.full_name);
        });
    }
  }, [inviteUserId]);

  async function executeCreateTeam() {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast("You must be logged in", "error"); setLoading(false); return; }

    const selectedHackathon = hackathons.find((h) => h.id === hackathonId);

    let finalDesc = description.trim();
    if (selectedTrack) {
      finalDesc = `[Track: ${selectedTrack}] ${finalDesc}`;
    }

    const { data: teamId, error } = await supabase.rpc("create_team_with_owner", {
      p_name: name.trim(),
      p_description: finalDesc,
      p_max_members: maxMembers,
      p_college: college
        ? normalizeCollege(college === "Other" ? customCollege.trim() : college)
        : currentUserProfile?.college
        ? normalizeCollege(currentUserProfile.college)
        : null,

      p_hackathon_id: hackathonId || null,
      p_hackathon_name: selectedHackathon?.name || null,
      p_skills: selectedSkills,
      p_roles_needed: selectedRoles,
    });

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      setLoading(false);
      return;
    }

    if (teamId && hackathonId) {
      try {
        await supabase.from("team_hackathons").upsert(
          { team_id: teamId, hackathon_id: hackathonId },
          { onConflict: "team_id,hackathon_id" }
        );
      } catch (hErr) {
        console.error("Failed to link team_hackathons:", hErr);
      }
    }

    trackEvent("team_created", {
      team_id: teamId,
      team_name: name.trim(),
      hackathon_id: hackathonId || null,
      max_members: maxMembers,
      has_auto_invited_user: !!inviteUserId,
    });

    // Auto-invite user from post-acceptance prompt if param present
    if (inviteUserId && teamId) {
      const { error: inviteErr } = await supabase.rpc("send_team_invite", {
        p_team_id: teamId as string,
        p_invited_user_id: inviteUserId,
      });
      if (inviteErr) {
        console.error("Auto-invite failed:", inviteErr);
        showToast("Team created! (Invite failed — please invite from workspace)", "warning");
      } else {
        const label = inviteUserName || "your new connection";
        showToast(`Team created and invite sent to ${label}!`, "success");
      }

    } else {
      showToast("Team created successfully!", "success");
    }

    setLoading(false);
    router.push("/teams");
  }

  function handleCreateTeam() {
    if (!name.trim()) { showToast("Team name is required", "warning"); return; }
    if (!description.trim()) { showToast("Team description is required", "warning"); return; }
    if (college === "Other" && !customCollege.trim()) { showToast("Please enter your college name", "warning"); return; }
    if (selectedSkills.length === 0) { showToast("Please select at least one skill", "warning"); return; }
    if (selectedRoles.length === 0) { showToast("Please select at least one role", "warning"); return; }

    if (currentUserProfile) {
      const completeness = calculateProfileCompleteness(currentUserProfile);
      if (completeness.score < 100) {
        setNudgeModalOpen(true);
        return;
      }
    }

    executeCreateTeam();
  }

  const isDisabled =
    loading ||
    !name.trim() ||
    !description.trim() ||
    (college === "Other" && !customCollege.trim()) ||
    selectedSkills.length === 0 ||
    selectedRoles.length === 0;

  // ── Presentation-only derived values ──
  const selectedHackathonInfo = hackathons.find((h) => h.id === hackathonId);
  const previewTone = hackathonId ? "hack" : "proj";
  const extraSkills = selectedSkills.filter((s) => !SKILLS.includes(s));
  const extraRoles = selectedRoles.filter((r) => !ROLES.includes(r));
  const filteredColleges = COLLEGES.filter((col) =>
    col.toLowerCase().includes(collegeSearch.toLowerCase())
  );
  const missing = [
    !name.trim() && "team name",
    !description.trim() && "description",
    college === "Other" && !customCollege.trim() && "college name",
    selectedSkills.length === 0 && "a skill",
    selectedRoles.length === 0 && "a role",
  ].filter(Boolean) as string[];
  const missingText = missing.length > 0 ? `Still needed: ${missing.join(", ")}` : null;

  const submitButton = (className?: string) => (
    <Button
      variant="primary"
      size="lg"
      onClick={handleCreateTeam}
      disabled={isDisabled}
      loading={loading}
      icon={<Plus aria-hidden />}
      className={className}
    >
      {loading ? "Creating team…" : "Create team"}
    </Button>
  );

  return (
    <Page width="narrow" className="pb-44 md:pb-16">
      <PageHeader
        eyebrow="Teams"
        title="New team"
        meta="Say what you're building and who you need."
      />

      {(inviteUserId || isFromEvaluator) && (
        <div className="mt-1 space-y-2.5">
          {/* Contextual invite banner — shown when coming from post-acceptance prompt */}
          {inviteUserId && (
            <Notice icon={<UserPlus />} title={inviteUserName ? `Building with ${inviteUserName}` : "Team invite queued"}>
              {inviteUserName
                ? `${inviteUserName} will get an invite as soon as your team is created.`
                : "An invite will be sent as soon as your team is created."}
            </Notice>
          )}
          {/* Contextual Idea Evaluator banner — shown when prefilled from /evaluator */}
          {isFromEvaluator && (
            <Notice icon={<Lightbulb />} title="Prefilled from your idea evaluation">
              Name, description and skills came from your evaluation report. Review them below.
            </Notice>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-9">
          {/* ── Idea & event ── */}
          <Section title="Idea & event">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="team-name" hint="Required">Team name</FieldLabel>
                <Input
                  id="team-name"
                  type="text"
                  placeholder="e.g. Hack Warriors"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10 md:h-[34px]"
                />
              </div>

              <div className="sm:col-span-2">
                <FieldLabel htmlFor="team-description" hint="Required">What you&apos;re building</FieldLabel>
                <Textarea
                  id="team-description"
                  placeholder="The problem, your idea, and how far along you are."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="min-w-0">
                <FieldLabel htmlFor="team-hackathon" hint="Optional">Hackathon</FieldLabel>
                <Select
                  id="team-hackathon"
                  value={hackathonId}
                  onChange={(e) => setHackathonId(e.target.value)}
                  disabled={hackathonsLoading}
                  className="h-10 md:h-[34px]"
                >
                  <option value="">
                    {hackathonsLoading ? "Loading hackathons…" : "No hackathon"}
                  </option>
                  {hackathons.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </Select>
                {!hackathonsLoading && hackathons.length === 0 && (
                  <p className="mt-1.5 text-[12px] text-ink-3">No hackathons available yet.</p>
                )}
                {selectedHackathonInfo?.max_team_size ? (
                  <p className="mt-1.5 text-[12px] text-ink-3">
                    Team size set to {selectedHackathonInfo.max_team_size} for this event.
                  </p>
                ) : null}
              </div>

              {availableTracks.length > 0 && (
                <div className="min-w-0">
                  <FieldLabel htmlFor="team-track" hint="Optional">Track</FieldLabel>
                  <Select
                    id="team-track"
                    value={selectedTrack}
                    onChange={(e) => setSelectedTrack(e.target.value)}
                    className="h-10 md:h-[34px]"
                  >
                    <option value="">Select a track</option>
                    {availableTracks.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Select>
                </div>
              )}

              <div className={availableTracks.length > 0 ? "min-w-0 sm:col-span-2" : "min-w-0"}>
                <FieldLabel htmlFor="team-college" hint="Optional">College</FieldLabel>
                <div className="relative">
                  <Input
                    id="team-college"
                    type="text"
                    autoComplete="off"
                    placeholder="Search your college"
                    value={showCollegeDropdown ? collegeSearch : (college || "")}
                    onFocus={() => {
                      setCollegeSearch("");
                      setShowCollegeDropdown(true);
                    }}
                    onChange={(e) => {
                      setCollegeSearch(e.target.value);
                      setShowCollegeDropdown(true);
                    }}
                    className="h-10 md:h-[34px]"
                  />

                  {showCollegeDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowCollegeDropdown(false)}
                        aria-hidden
                      />
                      <div
                        role="listbox"
                        aria-label="Colleges"
                        className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-line bg-overlay p-1 text-left shadow-pop"
                      >
                        {filteredColleges.map((collegeName) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={college === collegeName}
                            key={collegeName}
                            onClick={() => {
                              setCollege(collegeName);
                              setCollegeSearch("");
                              setShowCollegeDropdown(false);
                            }}
                            className="flex min-h-9 w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
                          >
                            {collegeName}
                          </button>
                        ))}
                        {filteredColleges.length === 0 && (
                          <div className="px-2.5 py-4 text-center text-[12.5px] text-ink-3">
                            No colleges match your search.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {college === "Other" && (
                  <Input
                    type="text"
                    aria-label="College name"
                    placeholder="Enter your college name"
                    value={customCollege}
                    onChange={(e) => setCustomCollege(e.target.value)}
                    className="mt-2 h-10 md:h-[34px]"
                  />
                )}
              </div>
            </div>
          </Section>

          {/* ── Who you need ── */}
          <Section title="Who you need" description="Pick at least one skill and one role. Add your own if it isn't listed.">
            <div className="space-y-6">
              <ChipGroup
                id="team-skills"
                label="Skills"
                count={selectedSkills.length}
                addValue={customSkill}
                onAddValueChange={setCustomSkill}
                onAdd={addCustomSkill}
                addPlaceholder="Add a skill"
              >
                {SKILLS.map((skill) => (
                  <FilterChip key={skill} active={selectedSkills.includes(skill)} onClick={() => toggleSkill(skill)}>
                    {skill}
                  </FilterChip>
                ))}
                {extraSkills.map((skill) => (
                  <FilterChip key={skill} active onClick={() => toggleSkill(skill)}>
                    {skill}
                  </FilterChip>
                ))}
              </ChipGroup>

              <ChipGroup
                id="team-roles"
                label="Roles"
                count={selectedRoles.length}
                addValue={customRole}
                onAddValueChange={setCustomRole}
                onAdd={addCustomRole}
                addPlaceholder="Add a role"
              >
                {ROLES.map((role) => (
                  <FilterChip key={role} active={selectedRoles.includes(role)} onClick={() => toggleRole(role)}>
                    {role}
                  </FilterChip>
                ))}
                {extraRoles.map((role) => (
                  <FilterChip key={role} active onClick={() => toggleRole(role)}>
                    {role}
                  </FilterChip>
                ))}
              </ChipGroup>
            </div>
          </Section>

          {/* ── Team settings ── */}
          <Section title="Team settings">
            <div id="team-size-label" className="mb-2 caps-label text-ink-3">Max members</div>
            <div className="flex flex-wrap items-center gap-4" role="group" aria-labelledby="team-size-label">
              <div className="inline-flex items-center rounded-md bg-sunken ring-1 ring-inset ring-line-strong">
                <IconButton
                  label="Fewer members"
                  onClick={() => setMaxMembers(Math.max(2, maxMembers - 1))}
                  disabled={maxMembers <= 2}
                  className="disabled:opacity-40"
                >
                  <Minus />
                </IconButton>
                <output
                  aria-live="polite"
                  className="w-10 text-center font-display text-[18px] font-semibold text-ink tabular"
                >
                  {maxMembers}
                </output>
                <IconButton
                  label="More members"
                  onClick={() => setMaxMembers(Math.min(10, maxMembers + 1))}
                  disabled={maxMembers >= 10}
                  className="disabled:opacity-40"
                >
                  <Plus />
                </IconButton>
              </div>
              <SeatMeter filled={1} total={maxMembers} />
            </div>
            <p className="mt-2 text-[12px] text-ink-3">Including you. Between 2 and 10.</p>
          </Section>

          {/* ── Submit (desktop) ── */}
          <div className="hidden items-center gap-3 border-t border-line pt-5 md:flex">
            <p className="mr-auto min-w-0 truncate text-[12.5px] text-ink-3">{missingText}</p>
            <ButtonLink href="/teams" variant="ghost" size="lg">
              Cancel
            </ButtonLink>
            {submitButton()}
          </div>
        </div>

        {/* ── Live preview (desktop) ── */}
        <aside className="hidden lg:block" aria-label="Team card preview">
          <div className="sticky top-6">
            <div className="mb-2 caps-label text-ink-3">Preview</div>
            <Panel className="p-4">
              <div className="flex min-w-0 items-start gap-3">
                <TeamMark name={name.trim() || "New team"} tone={previewTone} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-ink">{name.trim() || "Your team name"}</p>
                  <p className="truncate text-[12px] text-ink-3">
                    {selectedHackathonInfo?.name || "No hackathon"}
                  </p>
                </div>
              </div>
              <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-ink-2">
                {description.trim() || "What you're building shows up here."}
              </p>
              <div className="mt-3">
                <SeatMeter filled={1} total={maxMembers} />
              </div>
              {selectedSkills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {selectedSkills.slice(0, 6).map((s) => (
                    <Chip key={s}>{s}</Chip>
                  ))}
                  {selectedSkills.length > 6 && <Chip>+{selectedSkills.length - 6}</Chip>}
                </div>
              )}
              {selectedRoles.length > 0 && (
                <p className="mt-3 text-[12px] text-ink-3">
                  Looking for <span className="text-ink-2">{selectedRoles.slice(0, 3).join(", ")}</span>
                  {selectedRoles.length > 3 && ` +${selectedRoles.length - 3}`}
                </p>
              )}
            </Panel>
          </div>
        </aside>
      </div>

      {/* ── Submit (mobile): fixed above the tab bar ── */}
      <div className="fixed inset-x-0 bottom-[calc(var(--hm-tabbar-h)+env(safe-area-inset-bottom))] z-30 border-t border-line bg-canvas px-4 py-2.5 md:hidden">
        {missingText && <p className="mb-2 truncate text-[12px] text-ink-3">{missingText}</p>}
        {submitButton("w-full")}
      </div>

      <ContextualProfileNudgeModal
        isOpen={nudgeModalOpen}
        onClose={() => setNudgeModalOpen(false)}
        onProceed={() => {
          setNudgeModalOpen(false);
          executeCreateTeam();
        }}
        userProfile={currentUserProfile}
        actionTitle="Creating Team"
        onProfileUpdated={(updated) => {
          setCurrentUserProfile(updated);
        }}
      />
    </Page>
  );
}

/* ── Small presentational helpers ── */

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-raised px-4 py-3">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-ink [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{children}</p>
      </div>
    </div>
  );
}

function ChipGroup({
  id,
  label,
  count,
  children,
  addValue,
  onAddValueChange,
  onAdd,
  addPlaceholder,
}: {
  id: string;
  label: string;
  count: number;
  children: ReactNode;
  addValue: string;
  onAddValueChange: (v: string) => void;
  onAdd: () => void;
  addPlaceholder: string;
}) {
  return (
    <div role="group" aria-labelledby={`${id}-label`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span id={`${id}-label`} className="caps-label text-ink-3">{label}</span>
        <span className={count > 0 ? "text-[12px] text-ink-3" : "text-[12px] text-warn"}>
          {count > 0 ? `${count} selected` : "Required"}
        </span>
      </div>
      {/* Chips are 36px tall on touch screens, compact on desktop. */}
      <div className="flex flex-wrap gap-1.5 [&>button]:h-9 md:[&>button]:h-7">{children}</div>
      <div className="mt-2.5 flex gap-2">
        <Input
          type="text"
          aria-label={addPlaceholder}
          placeholder={addPlaceholder}
          value={addValue}
          onChange={(e) => onAddValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          className="h-10 min-w-0 flex-1 md:h-[34px]"
        />
        <Button
          variant="secondary"
          icon={<Plus aria-hidden />}
          onClick={onAdd}
          disabled={!addValue.trim()}
          className="h-10 md:h-[34px]"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
