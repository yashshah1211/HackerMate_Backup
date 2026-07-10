"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { COLLEGES } from "@/lib/colleges";

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
};

export default function CreateTeamPage() {
  return (
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
  );
}

function CreateTeamForm() {
  const router = useRouter();
  const { showToast } = useNotification();
  const searchParams = useSearchParams();
  const preselectedHackathonId = searchParams.get("hackathon");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [college, setCollege] = useState("");
  const [hackathonId, setHackathonId] = useState(preselectedHackathonId || "");
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [hackathonsLoading, setHackathonsLoading] = useState(true);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [maxMembers, setMaxMembers] = useState(4);
  const [loading, setLoading] = useState(false);
  const [customCollege, setCustomCollege] = useState("");
  const [collegeSearch, setCollegeSearch] = useState("");
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);

  async function loadHackathons() {
    const { data, error } = await supabase
      .from("hackathons")
      .select("id, name")
      .order("start_date", { ascending: true });

    if (error) {
      console.error(error);
    } else {
      setHackathons(data || []);
    }
    setHackathonsLoading(false);
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      loadHackathons();
    });
  }, []);

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

  async function handleCreateTeam() {
    if (!name.trim()) { showToast("Team name is required", "warning"); return; }
    if (!description.trim()) { showToast("Team description is required", "warning"); return; }
    if (college === "Other" && !customCollege.trim()) { showToast("Please enter your college name", "warning"); return; }
    if (selectedSkills.length === 0) { showToast("Please select at least one skill", "warning"); return; }
    if (selectedRoles.length === 0) { showToast("Please select at least one role", "warning"); return; }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast("You must be logged in", "error"); setLoading(false); return; }

    const selectedHackathon = hackathons.find((h) => h.id === hackathonId);

    const { error } = await supabase.rpc("create_team_with_owner", {
      p_name: name.trim(),
      p_description: description.trim(),
      p_max_members: maxMembers,
      p_college: college ? (college === "Other" ? customCollege.trim() : college) : null,
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

    showToast("Team created successfully!", "success");
    setLoading(false);
    router.push("/teams");
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
