"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import AuthGuard from "@/components/AuthGuard";
import { COLLEGES, normalizeCollege } from "@/lib/colleges";

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
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  // Sign out confirmation modal
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
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
    } finally {
      setLoading(false);
    }
  }

  async function loadBlockedUsers(currentUid: string) {
    setLoadingBlocks(true);
    try {
      const { data, error } = await supabase
        .from("blocked_users")
        .select(
          `
          blocked_id,
          created_at,
          blocked_user:profiles!blocked_id (
            id,
            full_name,
            avatar_url,
            college
          )
        `
        )
        .eq("blocker_id", currentUid);

      if (!error && data) {
        setBlockedUsers(data as any);
      }
    } catch (e) {
      console.error("Failed to load blocked users:", e);
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
        showToast("Profile settings saved successfully! ✅", "success");
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
        showToast("Failed to update privacy preference", "error");
        // Revert local state
        if (field === "is_available") setIsAvailable(!newValue);
        if (field === "show_track_record") setShowTrackRecord(!newValue);
      } else {
        showToast("Privacy settings updated! ✅", "success");
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
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function copyUserId() {
    if (userId) {
      navigator.clipboard.writeText(userId);
      showToast("User ID copied to clipboard! 📋", "info");
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
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-6 animate-pulse">
        <div className="h-32 rounded-2xl bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800" />
        <div className="h-12 rounded-xl bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800" />
        <div className="h-96 rounded-2xl bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12 space-y-8">
      {/* ── Page Header / User Banner ── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/80 backdrop-blur-md p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm dark:shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-violet-500/10 dark:bg-violet-600/10 blur-3xl pointer-events-none" />

        <div className="flex items-center gap-4 min-w-0">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-white font-extrabold text-xl shadow-md shrink-0 border border-violet-400/30">
            {fullName ? fullName.charAt(0).toUpperCase() : "B"}
          </div>
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight truncate">
              {fullName || "Builder Profile"}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{userEmail}</p>
            {college && college !== "Other" && (
              <p className="text-xs text-violet-600 dark:text-violet-400 font-semibold truncate flex items-center gap-1.5 pt-0.5">
                <span>🎓</span> {college}
              </p>
            )}
          </div>
        </div>

        {userId && (
          <Link
            href={`/profile/${userId}`}
            className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/80 text-xs font-semibold transition-all flex items-center gap-2 shrink-0 shadow-xs"
          >
            <span>View Public Profile</span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        )}
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800/80 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab("profile")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "profile"
              ? "bg-violet-50 text-violet-700 border border-violet-200 shadow-xs dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-500/30"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900/60"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.219-.044-7.499-.12a.75.75 0 01-.5-.18z"
            />
          </svg>
          <span>Profile & Identity</span>
        </button>

        <button
          onClick={() => setActiveTab("privacy")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "privacy"
              ? "bg-violet-50 text-violet-700 border border-violet-200 shadow-xs dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-500/30"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900/60"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
          <span>Privacy & Safety</span>
        </button>

        <button
          onClick={() => setActiveTab("account")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "account"
              ? "bg-violet-50 text-violet-700 border border-violet-200 shadow-xs dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-500/30"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900/60"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Account</span>
        </button>
      </div>

      {/* ── TAB 1: PROFILE & IDENTITY ── */}
      {activeTab === "profile" && (
        <form onSubmit={handleSaveProfile} className="space-y-6">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 p-6 md:p-8 space-y-6 shadow-sm dark:shadow-md">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-800 pb-3 flex items-center gap-2">
              <span>👤</span> Basic Information
            </h2>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Full Name</label>
                <span className="text-[10px] text-zinc-500 flex items-center gap-1 font-medium">
                  <svg className="w-3 h-3 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  Verified from Google Account
                </span>
              </div>
              <input
                type="text"
                readOnly
                disabled
                value={fullName}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs cursor-not-allowed select-all"
              />
            </div>

            {/* College Selector */}
            <div className="space-y-1.5 relative">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">College / Institution *</label>
              <div className="relative">
                <input
                  type="text"
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
                  placeholder="Search and select your college..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 text-xs focus:outline-none focus:border-violet-500 focus:bg-white dark:focus:bg-zinc-900 transition-colors"
                />

                {showCollegeDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowCollegeDropdown(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl z-20 p-1 space-y-0.5">
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
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                            college === c
                              ? "bg-violet-600 text-white font-bold"
                              : "text-zinc-800 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          }`}
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
                        className="w-full text-left px-3 py-2 rounded-lg text-xs text-amber-600 dark:text-amber-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-800 font-semibold"
                      >
                        + Other (Enter custom college name)
                      </button>
                    </div>
                  </>
                )}
              </div>

              {college === "Other" && (
                <div className="pt-2">
                  <input
                    type="text"
                    required
                    value={customCollege}
                    onChange={(e) => setCustomCollege(e.target.value)}
                    placeholder="Enter full name of your college..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-amber-400 dark:border-amber-500/40 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 text-xs focus:outline-none focus:border-amber-500 transition-colors"
                  />
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                    Please provide the official, non-abbreviated name of your institution.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Year of Study</label>
                <select
                  value={yearOfStudy}
                  onChange={(e) => setYearOfStudy(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white text-xs focus:outline-none focus:border-violet-500 transition-colors cursor-pointer"
                >
                  {YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white text-xs focus:outline-none focus:border-violet-500 transition-colors cursor-pointer"
                >
                  <option value="" className="bg-white dark:bg-zinc-900 text-zinc-500">
                    Select Gender
                  </option>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g} value={g} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
                      {g}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-zinc-500">Used for SIH mandatory diversity teaming validations.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Bio / About You</label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={300}
                placeholder="Tell potential teammates about your interests, past projects, or hackathon goals..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 text-xs focus:outline-none focus:border-violet-500 focus:bg-white dark:focus:bg-zinc-900 transition-colors resize-none"
              />
              <div className="flex justify-end text-[10px] text-zinc-500">{bio.length}/300</div>
            </div>
          </div>

          {/* ── Skills & Tech Stack ── */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 p-6 md:p-8 space-y-6 shadow-sm dark:shadow-md">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <span>⚡</span> Technical Skills & Roles
              </h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">{selectedSkills.length}/15 Selected</span>
            </div>

            {/* Selected Skills Chips */}
            {selectedSkills.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Your Active Skills:</span>
                <div className="flex flex-wrap gap-2">
                  {selectedSkills.map((skill) => (
                    <button
                      type="button"
                      key={skill}
                      onClick={() => toggleSkill(skill)}
                      className="px-3 py-1 rounded-lg bg-violet-50 dark:bg-violet-600/20 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-violet-700 dark:text-violet-300 hover:text-rose-600 dark:hover:text-rose-300 border border-violet-200 dark:border-violet-500/30 hover:border-rose-200 dark:hover:border-rose-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5 group cursor-pointer"
                      title="Click to remove"
                    >
                      <span>{skill}</span>
                      <span className="text-xs opacity-70 group-hover:opacity-100">✕</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add More Skills */}
            <div className="space-y-2.5">
              <input
                type="text"
                value={skillSearch}
                onChange={(e) => setSkillSearch(e.target.value)}
                placeholder="Search skills to add (e.g. Next.js, Python, UI/UX)..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 text-xs focus:outline-none focus:border-violet-500 focus:bg-white dark:focus:bg-zinc-900 transition-colors"
              />

              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-1">
                {filteredSkills.slice(0, 24).map((skill) => (
                  <button
                    type="button"
                    key={skill}
                    onClick={() => toggleSkill(skill)}
                    className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white border border-zinc-200 dark:border-zinc-800 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>+</span>
                    <span>{skill}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Social & Connected Links ── */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 p-6 md:p-8 space-y-6 shadow-sm dark:shadow-md">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-800 pb-3 flex items-center gap-2">
              <span>🔗</span> Social & Coding Profiles
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <span>GitHub Profile</span>
                </label>
                <input
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/your-username"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 text-xs focus:outline-none focus:border-violet-500 focus:bg-white dark:focus:bg-zinc-900 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <span>LinkedIn Profile</span>
                </label>
                <input
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/your-profile"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 text-xs focus:outline-none focus:border-violet-500 focus:bg-white dark:focus:bg-zinc-900 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* ── Hackathon Track Record (Display-Only) ── */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 p-6 md:p-8 space-y-6 shadow-sm dark:shadow-md">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <span>🏆</span> Hackathon Experience
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Self-reported portfolio stats displayed on your profile card.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80">
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Have you participated in hackathons before?</h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Shows your builder experience to team leaders.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHasParticipated(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      hasParticipated
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/40"
                        : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHasParticipated(false);
                      setParticipationsCount("");
                      setHasWon(false);
                      setWinsCount("");
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      !hasParticipated
                        ? "bg-zinc-200 text-zinc-900 border border-zinc-300 dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                        : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {hasParticipated && (
                <div className="p-4 rounded-xl bg-zinc-50/80 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 space-y-4 animate-fadeIn">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Total Hackathons Participated In</label>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={participationsCount}
                      onChange={(e) => setParticipationsCount(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="e.g. 3"
                      className="w-full max-w-xs px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white text-xs focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800/60">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Have you won / placed on a podium?</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setHasWon(true)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          hasWon
                            ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/40"
                            : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800"
                        }`}
                      >
                        Yes, I have won
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHasWon(false);
                          setWinsCount("");
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          !hasWon
                            ? "bg-zinc-200 text-zinc-900 border border-zinc-300 dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
                            : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800"
                        }`}
                      >
                        Not yet
                      </button>
                    </div>
                  </div>

                  {hasWon && (
                    <div className="space-y-1.5 animate-fadeIn">
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Total Hackathons Won / Top 3</label>
                      <input
                        type="number"
                        min={1}
                        max={participationsCount || 99}
                        value={winsCount}
                        onChange={(e) => setWinsCount(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="e.g. 1"
                        className="w-full max-w-xs px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white text-xs focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Submit Button Bar ── */}
          <div className="flex justify-end gap-3 sticky bottom-4 z-20 p-4 rounded-2xl bg-white/90 dark:bg-zinc-950/90 border border-zinc-200 dark:border-zinc-800 backdrop-blur-md shadow-lg dark:shadow-2xl">
            <button
              type="button"
              onClick={() => loadSettings()}
              className="px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-300 text-xs font-semibold transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-800"
            >
              Discard Changes
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-extrabold transition-all shadow-md shadow-violet-600/20 disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Profile Changes</span>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ── TAB 2: PRIVACY & SAFETY ── */}
      {activeTab === "privacy" && (
        <div className="space-y-6">
          {/* Visibility Controls */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 p-6 md:p-8 space-y-6 shadow-sm dark:shadow-md">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-800 pb-3 flex items-center gap-2">
              <span>🔒</span> Public Visibility & Discovery
            </h2>

            <div className="space-y-5">
              {/* Show Track Record Toggle */}
              <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Public Track Record Visibility</h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    When enabled, your verified badges, past hackathon participations, and campus leaderboard points are
                    publicly visible on your profile and campus rosters.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={savingPrivacy}
                  onClick={() => handleTogglePrivacy("show_track_record", !showTrackRecord)}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                    showTrackRecord ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-800"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      showTrackRecord ? "right-1" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {/* Teaming Availability Toggle */}
              <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Available for Team Matchmaking</h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Allows squad leaders to find you in the Developer Directory and recommend you in compatibility
                    matchmaking for upcoming hackathons.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={savingPrivacy}
                  onClick={() => handleTogglePrivacy("is_available", !isAvailable)}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                    isAvailable ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-800"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      isAvailable ? "right-1" : "left-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Blocked Users Manager */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 p-6 md:p-8 space-y-6 shadow-sm dark:shadow-md">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <span>🚫</span> Blocked Users
                </h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Blocked users cannot send you connection requests, team invites, or direct messages.
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">{blockedUsers.length} Blocked</span>
            </div>

            {loadingBlocks ? (
              <div className="py-8 text-center text-xs text-zinc-500">Loading blocked users...</div>
            ) : blockedUsers.length === 0 ? (
              <div className="py-8 text-center space-y-2 border border-dashed border-zinc-200 dark:border-zinc-800/80 rounded-xl">
                <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">You haven&apos;t blocked any builders.</p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  You can block users anytime from their public profile card if needed.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {blockedUsers.map((b) => {
                  const u = b.blocked_user;
                  return (
                    <div
                      key={b.blocked_id}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-700 dark:text-zinc-300 shrink-0">
                          {u?.full_name?.charAt(0) || "U"}
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-zinc-900 dark:text-white truncate">{u?.full_name || "Unknown User"}</h5>
                          <p className="text-[11px] text-zinc-500 truncate">{u?.college || "College not set"}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={unblockingId === b.blocked_id}
                        onClick={() => handleUnblockUser(b.blocked_id, u?.full_name || "this user")}
                        className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white border border-zinc-200 dark:border-zinc-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {unblockingId === b.blocked_id ? "Unblocking..." : "Unblock"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: ACCOUNT & SESSION ── */}
      {activeTab === "account" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 p-6 md:p-8 space-y-6 shadow-sm dark:shadow-md">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-800 pb-3 flex items-center gap-2">
              <span>🛡️</span> Account Credentials
            </h2>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 space-y-1">
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Registered Email Address</span>
                <p className="text-xs font-mono text-zinc-900 dark:text-white select-all">{userEmail}</p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Authenticated securely via Supabase Auth.</p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">User Identification ID</span>
                  <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate select-all">{userId}</p>
                </div>
                <button
                  type="button"
                  onClick={copyUserId}
                  className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                >
                  Copy ID
                </button>
              </div>

              {userCreatedAt && (
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 space-y-1">
                  <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Member Since</span>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300">{new Date(userCreatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
                </div>
              )}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="rounded-2xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/60 dark:bg-rose-500/5 p-6 md:p-8 space-y-4 shadow-sm dark:shadow-md">
            <h2 className="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <span>⚠️</span> Session & Sign Out
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Sign out of your active session on this browser. All your teams, messages, and profile data will remain safe.
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowSignOutModal(true)}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-md shadow-rose-600/20"
              >
                Sign Out of HackerMate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign Out Modal */}
      {showSignOutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-center">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Sign Out?</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">Are you sure you want to end your session?</p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSignOutModal(false)}
                className="flex-1 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold border border-zinc-200 dark:border-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}
