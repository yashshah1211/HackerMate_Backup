"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";
import { COLLEGES, normalizeCollege } from "@/lib/colleges";

import ContextualProfileNudgeModal from "@/components/ContextualProfileNudgeModal";
import { calculateProfileCompleteness } from "@/lib/profileCompleteness";
import { trackEvent } from "@/lib/posthog";
import { SIH_HACKATHON_ID } from "@/lib/constants";

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
        <main className="max-w-2xl mx-auto px-6 pt-36 pb-16">
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--primary-500)] to-[var(--accent-500)] animate-pulse mb-4" />
            <p className="text-zinc-500">Loading team creator...</p>
          </div>
        </main>
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
    const { data, error } = await supabase
      .from("hackathons")
      .select("id, name, min_team_size, max_team_size")
      .order("start_date", { ascending: true });

    if (error) {
      console.error(error);
    } else {
      setHackathons((data as unknown as Hackathon[]) || []);
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

  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [nudgeModalOpen, setNudgeModalOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from("profiles").select("id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, sih_broadcast_sent_at, username, show_track_record").eq("id", user.id).single().then(({ data }) => {

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
      p_college: college ? normalizeCollege(college === "Other" ? customCollege.trim() : college) : null,

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
    if (hackathonId === SIH_HACKATHON_ID) {
      router.push("/hackathons/sih");
    } else {
      router.push("/teams");
    }
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

  return (
    <main className="max-w-2xl mx-auto px-6 pt-36 pb-16">
      {/* Header */}
      <div className="mb-8 animate-fade-in-up">
        <p className="section-label">Team creation</p>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-tight mb-3">
          Create your
          <br />
          <span className="text-gradient">team.</span>
        </h1>
        <p className="text-zinc-400 text-base">
          Build your dream team and start collaborating.
        </p>
      </div>

      {/* Contextual invite banner — shown when coming from post-acceptance prompt */}
      {inviteUserId && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-indigo-950/40 border border-indigo-800/50 flex items-center gap-3 animate-fade-in-up">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031a.005.005 0 01-.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zm-3.75 9h7.5m-7.5 0H12" />
            </svg>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            <span className="font-semibold text-indigo-300">
              {inviteUserName ? `Building with ${inviteUserName}` : "Team invite queued"}
            </span>
            {" — "}
            {inviteUserName
              ? `${inviteUserName} will automatically receive an invite once your team is created.`
              : "An invite will be sent automatically once your team is created."}
          </p>
        </div>
      )}

      {/* Form Card */}
      <div className="card card-static animate-fade-in-up stagger-1">

        {/* ── Basics ── */}
        <section className="p-8 pb-0">
          <SectionHeader label="Basics" />
          <div className="space-y-5">
            <Field label="Team name" required>
              <input
                type="text"
                placeholder="e.g. Hack Warriors"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Description" required>
              <textarea
                placeholder="What's your team's mission?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="input"
              />
            </Field>
          </div>
        </section>

        <Divider />

        {/* ── Context ── */}
        <section className="px-8 pb-0">
          <SectionHeader label="Context" />
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <Field label="College (Optional)">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search or select your college..."
                    value={showCollegeDropdown ? collegeSearch : (college || "")}
                    onFocus={() => {
                      setCollegeSearch("");
                      setShowCollegeDropdown(true);
                    }}
                    onChange={(e) => {
                      setCollegeSearch(e.target.value);
                      setShowCollegeDropdown(true);
                    }}
                    className="input px-4 w-full"
                  />
                  
                  {showCollegeDropdown && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setShowCollegeDropdown(false)}
                      />
                      <div className="absolute left-0 right-0 top-full mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-1.5 shadow-xl z-20 text-left">
                        {COLLEGES.filter((col) => 
                          col.toLowerCase().includes(collegeSearch.toLowerCase())
                        ).map((collegeName) => (
                          <button
                            type="button"
                            key={collegeName}
                            onClick={() => {
                              setCollege(collegeName);
                              setCollegeSearch("");
                              setShowCollegeDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-md text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors"
                          >
                            {collegeName}
                          </button>
                        ))}
                        {COLLEGES.filter((col) => 
                          col.toLowerCase().includes(collegeSearch.toLowerCase())
                        ).length === 0 && (
                          <div className="text-center py-4 text-xs text-zinc-600">
                            No colleges match your search.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </Field>
              {college === "Other" && (
                <input
                  type="text"
                  placeholder="Enter your college name"
                  value={customCollege}
                  onChange={(e) => setCustomCollege(e.target.value)}
                  className="input mt-2.5"
                />
              )}
            </div>
            <Field label="Hackathon (Optional)">
              <select
                value={hackathonId}
                onChange={(e) => setHackathonId(e.target.value)}
                className="input px-4"
                disabled={hackathonsLoading}
              >
                <option value="">
                  {hackathonsLoading ? "Loading hackathons..." : "Select hackathon"}
                </option>
                {hackathons.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
              {!hackathonsLoading && hackathons.length === 0 && (
                <p className="text-xs text-zinc-500 mt-1.5">
                  No hackathons available yet.
                </p>
              )}
            </Field>

            {availableTracks.length > 0 && (
              <Field label="Event Track / Pillar (Optional)">
                <select
                  value={selectedTrack}
                  onChange={(e) => setSelectedTrack(e.target.value)}
                  className="input px-4"
                >
                  <option value="">Select track / pillar...</option>
                  {availableTracks.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </section>

        <Divider />

        {/* ── Skills ── */}
        <section className="px-8 pb-0">
          <SectionHeader label="Skills needed" required />
          <div className="flex flex-wrap gap-2">
            {SKILLS.map((skill) => (
              <TagButton
                key={skill}
                label={skill}
                active={selectedSkills.includes(skill)}
                onClick={() => toggleSkill(skill)}
              />
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-2">Select all that apply</p>
        </section>

        <Divider />

        {/* ── Roles ── */}
        <section className="px-8 pb-0">
          <SectionHeader label="Roles needed" required />
          <div className="flex flex-wrap gap-2">
            {ROLES.map((role) => (
              <TagButton
                key={role}
                label={role}
                active={selectedRoles.includes(role)}
                onClick={() => toggleRole(role)}
              />
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-2">Select all that apply</p>
        </section>

        <Divider />

        {/* ── Team size ── */}
        <section className="px-8">
          <SectionHeader label="Team size" />
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="2"
              max="10"
              value={maxMembers}
              onChange={(e) => setMaxMembers(Number(e.target.value))}
              className="flex-1 h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-primary-500"
            />
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <span className="text-lg font-medium text-white">{maxMembers}</span>
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-2">Maximum members allowed</p>
        </section>

        {/* ── Submit ── */}
        <div className="px-8 pb-8 pt-6">
          <button
            onClick={handleCreateTeam}
            disabled={isDisabled}
            className="btn btn-primary w-full btn-lg"
          >
            {loading ? (
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>Creating team…</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>Create team</span>
              </div>
            )}
          </button>
        </div>

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
    </main>
  );
}

/* ── Small shared components ── */

function SectionHeader({ label, required }: { label: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 mb-4 pb-3 border-b border-white/[0.06]">
      <span className="text-[10px] uppercase tracking-widest font-medium text-zinc-500">
        {label}
      </span>
      {required && <span className="text-rose-400 text-xs">*</span>}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-300">
        {label}
        {required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function TagButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
        active
          ? "bg-[var(--primary-500)] text-white border-[var(--primary-500)]"
          : "bg-white/[0.03] text-zinc-400 border-white/[0.06] hover:border-white/[0.15] hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <div className="border-t border-white/[0.06] mx-8 my-6" />;
}
