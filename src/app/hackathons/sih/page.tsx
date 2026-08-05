"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import Footer from "@/components/Footer";
import { COLLEGES } from "@/lib/colleges";
import SIHExportModal from "@/components/SIHExportModal";
import { SIHTeamExport, SIHTeamMemberExport } from "@/lib/sihExport";
import ContextualProfileNudgeModal from "@/components/ContextualProfileNudgeModal";
import { calculateProfileCompleteness } from "@/lib/profileCompleteness";
import VerifiedBuilderBadge from "@/components/VerifiedBuilderBadge";
import SIHQuickOnboardingModal from "@/components/SIHQuickOnboardingModal";
import ShareModal from "@/components/ShareModal";
import { trackEvent } from "@/lib/posthog";
import MockSIHSubmissionModal from "@/components/MockSIHSubmissionModal";
import MockSIHScorecardModal from "@/components/MockSIHScorecardModal";
import DJSCEHackathonHeader from "@/components/DJSCEHackathonHeader";

import { SIH_HACKATHON_ID } from "@/lib/constants";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  college: string | null;
  bio: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  skills: string[] | null;
  gender?: string | null;
  is_available?: boolean;
  onboarding_completed?: boolean;
};

type TeamMember = {
  id: string;
  role: string;
  project_role: string | null;
  user_id: string;
  profiles: {
    id: string;
    full_name: string | null;
    email?: string | null;
    avatar_url: string | null;
    skills: string[] | null;
    gender?: string | null;
  } | null;
};

type Team = {
  id: string;
  name: string;
  description: string | null;
  college: string | null;
  skills: string[] | null;
  roles_needed: string[] | null;
  max_members: number;
  is_recruiting: boolean;
  owner_id: string;
  team_members: TeamMember[];
};

type SIHHackathon = {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  mode: string | null;
  prize_pool: string | null;
  currency?: string | null;
  website_url: string | null;
  tags: string[] | null;
};

function isSameCollege(collegeA: string | null | undefined, collegeB: string | null | undefined): boolean {
  if (!collegeA || !collegeB) return false;
  const a = collegeA.toLowerCase().trim();
  const b = collegeB.toLowerCase().trim();
  if (a === b) return true;

  const getFirstWord = (s: string) => s.split(/[\s,()]+/)[0];
  const w1 = getFirstWord(a);
  const w2 = getFirstWord(b);

  const acronyms = ["djsce", "spit", "vjti", "tsec", "vesit", "coep", "pict", "vit", "mit", "vnit", "iit", "nit", "iiit"];
  if (acronyms.includes(w1) && w1 === w2) return true;

  return a.includes(b) || b.includes(a);
}

export default function SIHTeamBuilderPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-zinc-500 font-mono">Loading SIH 2026 Directory...</p>
      </div>
    }>
      <SIHTeamBuilderContent />
    </Suspense>
  );
}

function SIHTeamBuilderContent() {
  const { showToast } = useNotification();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const [userCollege, setUserCollege] = useState<string>("");
  const [editingCollege, setEditingCollege] = useState(false);
  const [collegeInput, setCollegeInput] = useState("");
  const [collegeSearch, setCollegeSearch] = useState("");
  const [savingCollege, setSavingCollege] = useState(false);

  const [hackathon, setHackathon] = useState<SIHHackathon | null>(null);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [allBuilders, setAllBuilders] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [isUserLookingForTeam, setIsUserLookingForTeam] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [activeTab, setActiveTab] = useState<"teams" | "builders" | "mock_sih">("teams");
  const [selectedExportTeam, setSelectedExportTeam] = useState<{
    team: SIHTeamExport;
    members: SIHTeamMemberExport[];
  } | null>(null);

  const [quickOnboardingModalOpen, setQuickOnboardingModalOpen] = useState(false);
  const [showSIHShareModal, setShowSIHShareModal] = useState(false);

  // Mock SIH states
  const [mockSubmissionsMap, setMockSubmissionsMap] = useState<Record<string, any>>({});
  const [mockLeaderboardList, setMockLeaderboardList] = useState<any[]>([]);
  const [mockLeaderboardTotal, setMockLeaderboardTotal] = useState(0);
  const [mockLeaderboardPage, setMockLeaderboardPage] = useState(1);
  const [mockLeaderboardCategory, setMockLeaderboardCategory] = useState("all");
  const [mockLeaderboardSearch, setMockLeaderboardSearch] = useState("");

  const [mockSubmissionModalOpen, setMockSubmissionModalOpen] = useState(false);
  const [selectedTeamForMockSubmit, setSelectedTeamForMockSubmit] = useState<Team | null>(null);

  const [mockScorecardModalOpen, setMockScorecardModalOpen] = useState(false);
  const [selectedSubmissionForScorecard, setSelectedSubmissionForScorecard] = useState<any | null>(null);
  const [selectedTeamNameForScorecard, setSelectedTeamNameForScorecard] = useState("");

  async function loadSIHData() {
    try {
      setLoading(true);

      // 1. Fetch SIH Hackathon row
      const { data: hackathonData } = await supabase
        .from("hackathons")
        .select("id, name, description, start_date, end_date, location, mode, prize_pool, website_url, tags")
        .eq("id", SIH_HACKATHON_ID)
        .maybeSingle();

      setHackathon(hackathonData);

      // 2. Fetch logged in user profile & SIH registration status
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let currentCollege = "";

      if (user) {
        setCurrentUserId(user.id);
        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (prof) {
          setCurrentUserProfile(prof as Profile);
          currentCollege = prof.college || "";
          setUserCollege(currentCollege);
          setCollegeInput(currentCollege);
        }

        const { data: userReg } = await supabase
          .from("hackathon_registrations")
          .select("id, looking_for_team")
          .eq("user_id", user.id)
          .eq("hackathon_id", SIH_HACKATHON_ID)
          .maybeSingle();

        setIsUserLookingForTeam(!!userReg?.looking_for_team);
      }

      // 3. Fetch Teams registered for SIH
      const { data: teamHackathonsData } = await supabase
        .from("team_hackathons")
        .select("team_id, teams(*, team_members(*, profiles(*)))")
        .eq("hackathon_id", SIH_HACKATHON_ID);

      const parsedTeams: Team[] = (teamHackathonsData || [])
        .map((item: any) => item.teams)
        .filter(Boolean);

      setAllTeams(parsedTeams);

      // 4. Fetch Builders registered for SIH looking for team
      const { data: regData, error: regErr } = await supabase
        .from("hackathon_registrations")
        .select("user_id, looking_for_team, profiles(*)")
        .eq("hackathon_id", SIH_HACKATHON_ID)
        .eq("looking_for_team", true);

      if (regErr) {
        console.error("Error fetching regData:", regErr);
      }

      const parsedBuilders: Profile[] = (Array.isArray(regData) ? regData : [])
        .map((r: any) => r.profiles)
        .filter(Boolean);

      setAllBuilders(parsedBuilders);

      // 5. Fetch Mock SIH active submissions map
      const { data: subData } = await supabase
        .from("sih_mock_submissions_public")
        .select("*")
        .eq("is_active", true);

      if (subData) {
        const map: Record<string, any> = {};
        subData.forEach((s: any) => {
          map[s.team_id] = s;
        });
        setMockSubmissionsMap(map);
      }

      // Load Paginated Leaderboard
      fetchLeaderboard(1, mockLeaderboardCategory, mockLeaderboardSearch);
    } catch (err) {
      console.error("Error loading SIH data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLeaderboard(page: number, category: string, search: string) {
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        category,
        search,
      });

      const res = await fetch(`/api/sih/leaderboard?${query.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setMockLeaderboardList(data.submissions || []);
        setMockLeaderboardTotal(data.pagination?.total || 0);
        setMockLeaderboardPage(data.pagination?.page || 1);
      }
    } catch (e) {
      console.error("Failed to fetch paginated leaderboard:", e);
    }
  }

  useEffect(() => {
    loadSIHData();
  }, []);

  useEffect(() => {
    if (!loading && currentUserId) {
      const action = searchParams ? searchParams.get("action") : null;
      if (action === "list_myself") {
        if (!currentUserProfile?.college || !currentUserProfile?.skills || currentUserProfile?.skills?.length === 0 || !currentUserProfile?.onboarding_completed) {
          setQuickOnboardingModalOpen(true);
        } else if (!isUserLookingForTeam) {
          triggerWithNudge(executeToggleLookingForTeam, "Listing Yourself for SIH");
        }
        if (typeof window !== "undefined") {
          window.history.replaceState({}, "", window.location.pathname);
        }
      }
    }
  }, [loading, currentUserId, currentUserProfile, isUserLookingForTeam, searchParams]);

  async function handleSaveCollege() {
    const finalCollege = collegeInput.trim();
    if (!finalCollege) {
      showToast("Please enter a valid college name.", "warning");
      return;
    }

    if (currentUserId) {
      setSavingCollege(true);
      try {
        const { error } = await supabase
          .from("profiles")
          .update({ college: finalCollege })
          .eq("id", currentUserId);

        if (error) {
          showToast(error.message, "error");
        } else {
          setUserCollege(finalCollege);
          if (currentUserProfile) {
            setCurrentUserProfile({ ...currentUserProfile, college: finalCollege });
          }
          setEditingCollege(false);
          showToast("College updated! Filtered SIH listings for your institution.", "success");
        }
      } catch (err) {
        console.error(err);
        showToast("Failed to update college.", "error");
      } finally {
        setSavingCollege(false);
      }
    } else {
      setUserCollege(finalCollege);
      setEditingCollege(false);
      showToast(`Filter applied for ${finalCollege}!`, "info");
    }
  }

  const [nudgeModalOpen, setNudgeModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [pendingActionTitle, setPendingActionTitle] = useState("");

  const triggerWithNudge = (action: () => void, actionTitle: string) => {
    if (!currentUserProfile) {
      action();
      return;
    }
    const completeness = calculateProfileCompleteness(currentUserProfile);
    if (completeness.score < 100) {
      setPendingAction(() => action);
      setPendingActionTitle(actionTitle);
      setNudgeModalOpen(true);
    } else {
      action();
    }
  };

  async function executeToggleLookingForTeam() {
    if (!currentUserId) {
      router.push(`/?next=${encodeURIComponent("/hackathons/sih")}&auth=true`);
      return;
    }

    setTogglingStatus(true);
    try {
      if (isUserLookingForTeam) {
        const { error } = await supabase
          .from("hackathon_registrations")
          .delete()
          .eq("user_id", currentUserId)
          .eq("hackathon_id", SIH_HACKATHON_ID);

        if (error) {
          showToast(error.message, "error");
        } else {
          setIsUserLookingForTeam(false);
          setAllBuilders((prev) => prev.filter((b) => b.id !== currentUserId));
          showToast("Removed yourself from SIH team seeker list.", "info");
          loadSIHData();
        }
      } else {
        const { error } = await supabase
          .from("hackathon_registrations")
          .upsert(
            {
              user_id: currentUserId,
              hackathon_id: SIH_HACKATHON_ID,
              looking_for_team: true,
              status: "confirmed",
            },
            { onConflict: "user_id,hackathon_id" }
          );

        if (error) {
          showToast(error.message, "error");
        } else {
          setIsUserLookingForTeam(true);
          trackEvent("sih_listed_myself", {
            college: currentUserProfile?.college || userCollege,
            hackathon_id: SIH_HACKATHON_ID,
          });
          if (currentUserProfile) {
            setAllBuilders((prev) => {
              if (prev.some((b) => b.id === currentUserId)) return prev;
              return [currentUserProfile, ...prev];
            });
          }
          showToast("Listed! Builders and teams from your college can now find you for SIH 2026.", "success");
          loadSIHData();
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to update status.", "error");
    } finally {
      setTogglingStatus(false);
    }
  }

  function handleToggleLookingForTeam() {
    if (!currentUserId) {
      router.push(`/?next=${encodeURIComponent("/hackathons/sih?action=list_myself")}&auth=true`);
      return;
    }
    if (!currentUserProfile?.college || !currentUserProfile?.skills || currentUserProfile?.skills?.length === 0 || !currentUserProfile?.onboarding_completed) {
      setQuickOnboardingModalOpen(true);
      return;
    }
    if (!isUserLookingForTeam) {
      triggerWithNudge(executeToggleLookingForTeam, "Listing Yourself for SIH");
    } else {
      executeToggleLookingForTeam();
    }
  }

  function handleProtectedAction(targetUrl: string) {
    if (!currentUserId) {
      router.push(`/?next=${encodeURIComponent(targetUrl)}&auth=true`);
    } else if (!currentUserProfile?.college || !currentUserProfile?.skills || currentUserProfile?.skills?.length === 0 || !currentUserProfile?.onboarding_completed) {
      setQuickOnboardingModalOpen(true);
    } else {
      triggerWithNudge(() => router.push(targetUrl), "Creating SIH Team");
    }
  }

  function handleQuickOnboardingSuccess(updatedProfile: any) {
    setCurrentUserProfile(updatedProfile as Profile);
    if (updatedProfile.college) {
      setUserCollege(updatedProfile.college);
      setCollegeInput(updatedProfile.college);
    }
    showToast("🎉 Profile set up! You are now listed for SIH 2026.", "success");
    executeToggleLookingForTeam();
  }

  // Filter teams and builders by college
  const filteredTeams = allTeams.filter((team) => {
    if (!userCollege) return true;
    return isSameCollege(team.college, userCollege);
  });

  const filteredBuilders = allBuilders.filter((builder) => {
    if (!userCollege) return true;
    return isSameCollege(builder.college, userCollege);
  });

  const filteredCollegesList = COLLEGES.filter((c) =>
    c.toLowerCase().includes(collegeSearch.toLowerCase())
  ).slice(0, 8);

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-6 pt-36 pb-16 min-h-screen">
        <div className="flex flex-col items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-2 border-zinc-300 dark:border-zinc-800 border-t-orange-500 rounded-full animate-spin mb-4" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading SIH Team Builder...</p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col justify-between transition-colors">
      <main className="max-w-5xl mx-auto px-6 pt-32 pb-16 w-full">
        {/* SIH Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-orange-200 dark:border-orange-500/30 bg-orange-50/70 dark:bg-gradient-to-br dark:from-zinc-950 dark:via-zinc-900 dark:to-orange-950/20 p-8 md:p-10 shadow-lg dark:shadow-2xl mb-8 animate-fade-in-up transition-colors">
          <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-orange-500 via-amber-400 to-[#B4F461]" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div>
              {/* Co-Branded Badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 dark:border-orange-500/30 bg-orange-100 dark:bg-orange-500/10 px-3.5 py-1 text-xs font-mono uppercase tracking-wider mb-4">
                <span className="text-orange-700 dark:text-orange-400 font-bold">🇮🇳 SMART INDIA HACKATHON 2026</span>
                <span className="text-zinc-400 dark:text-zinc-500">×</span>
                <span className="text-[#649a1f] dark:text-[#B4F461] font-bold">HACKERMATE</span>
              </div>

              <h1 className="text-3xl md:text-4xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                SIH Team Builder
              </h1>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 max-w-2xl mt-2 leading-relaxed font-sans">
                Form your official 6-member team from your college for SIH 2026 internal selection round. Open to all engineering & tech institutions across India with balanced skill mix and female teammate representation.
              </p>

              {/* SIH Mandate Badges */}
              <div className="flex flex-wrap items-center gap-2.5 mt-5">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 text-xs text-orange-800 dark:text-orange-300 font-medium shadow-sm">
                  <span>🏫 Same College Only</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 text-xs text-amber-800 dark:text-amber-300 font-medium shadow-sm">
                  <span>👥 6 Members / Team</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 text-xs text-emerald-800 dark:text-emerald-300 font-medium shadow-sm">
                  <span>👩 1+ Female Member Mandate</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 text-xs text-sky-800 dark:text-sky-300 font-medium shadow-sm">
                  <span>⚡ Diverse Skill Mix</span>
                </div>
              </div>
            </div>

            {/* Hero CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <button
                onClick={() => handleProtectedAction(`/teams/create?hackathon=${SIH_HACKATHON_ID}`)}
                className="btn btn-lime text-xs py-3 px-5 font-bold text-black dark:text-black bg-[#B4F461] hover:bg-[#a3e64f] shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-transform hover:scale-105"
              >
                <span className="text-black dark:text-black">+ Create SIH Team</span>
              </button>

              <button
                onClick={handleToggleLookingForTeam}
                disabled={togglingStatus}
                className={`btn text-xs py-3 px-4 flex items-center justify-center gap-1.5 transition cursor-pointer ${isUserLookingForTeam
                    ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 font-bold"
                    : "bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  }`}
              >
                {isUserLookingForTeam ? "Looking for Team ✓" : "🙋‍♂️ List Myself for SIH"}
              </button>

              <button
                onClick={() => setShowSIHShareModal(true)}
                className="btn text-xs py-3 px-4 flex items-center justify-center gap-1.5 transition cursor-pointer bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 font-bold"
                title="Share SIH 2026 Teammate Matcher to college WhatsApp groups"
              >
                <span>📲 Share to WhatsApp</span>
              </button>
            </div>
          </div>
        </div>

        {/* D.J. Sanghvi College of Engineering SIH 2026 Internal Portal Header */}
        <DJSCEHackathonHeader
          activeCollege={userCollege}
          onSelectCollege={(col) => setUserCollege(col)}
        />

        {/* Prominent Mock SIH Practice Screening Guidance Banner */}
        <div className="mb-8 p-6 rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/80 dark:bg-gradient-to-r dark:from-emerald-950/40 dark:via-zinc-900 dark:to-zinc-950 shadow-md dark:shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden transition-colors">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-3xl pointer-events-none rounded-full" />
          
          <div className="flex items-start gap-4 relative z-10">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 flex items-center justify-center text-2xl shrink-0">
              🏆
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase bg-emerald-200/80 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30">
                  FREE SIH PRACTICE SCREENING
                </span>
                <span className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono">100+ Official SIH PS Auto-Fill</span>
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
                Will Your SIH Pitch Pass Your College SPOC Internal Screening?
              </h3>
              <p className="text-xs text-zinc-700 dark:text-zinc-300 max-w-xl mt-1 leading-relaxed">
                Submit your 6-slide SIH pitch deck for diagnostic evaluation before your college internal round. Get scored out of 100 on <strong className="text-emerald-700 dark:text-emerald-400">SIH Rules, Tech Feasibility, UI/UX, and SPOC Rejection Red Flags</strong>.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0 w-full md:w-auto relative z-10">
            <button
              onClick={() => setActiveTab("mock_sih")}
              className="w-full md:w-auto px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              📊 View Scorecards
            </button>
            <button
              onClick={() => {
                if (!currentUserId) {
                  router.push(`/?next=${encodeURIComponent("/hackathons/sih")}&auth=true`);
                  return;
                }
                const userTeam = allTeams.find(
                  (t) => t.owner_id === currentUserId || t.team_members?.some((m) => m.user_id === currentUserId)
                );
                if (userTeam) {
                  setSelectedTeamForMockSubmit(userTeam);
                  setMockSubmissionModalOpen(true);
                } else {
                  showToast("Create or join an SIH team below first to run a Mock Evaluation!", "info");
                  handleProtectedAction(`/teams/create?hackathon=${SIH_HACKATHON_ID}`);
                }
              }}
              className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              🚀 Practice Screen My Pitch →
            </button>
          </div>
        </div>

        {/* College Context & Picker Bar */}
        <div className="mb-8 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-lg shrink-0">
              🎓
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">College / Institution Filter</div>
              <div className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2 mt-0.5">
                {userCollege ? (
                  <span>Showing builders & teams from: <strong className="text-orange-600 dark:text-orange-400">{userCollege}</strong></span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">⚠️ No college selected in your profile. Select your college to filter teammates.</span>
                )}
              </div>
            </div>
          </div>

          <div>
            {!editingCollege ? (
              <button
                onClick={() => setEditingCollege(true)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 transition"
              >
                {userCollege ? "Change College" : "Select College"}
              </button>
            ) : (
              <div className="flex items-center gap-2 relative">
                <input
                  type="text"
                  value={collegeInput}
                  onChange={(e) => {
                    setCollegeInput(e.target.value);
                    setCollegeSearch(e.target.value);
                  }}
                  placeholder="Type college name..."
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-orange-500 w-64"
                />
                <button
                  onClick={handleSaveCollege}
                  disabled={savingCollege}
                  className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 font-bold text-xs text-white transition"
                >
                  {savingCollege ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setEditingCollege(false)}
                  className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                >
                  Cancel
                </button>

                {/* College Autocomplete Dropdown */}
                {collegeSearch.length > 1 && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                    {filteredCollegesList.map((col) => (
                      <button
                        key={col}
                        onClick={() => {
                          setCollegeInput(col);
                          setCollegeSearch("");
                          if (currentUserId) {
                            setSavingCollege(true);
                            supabase
                              .from("profiles")
                              .update({ college: col })
                              .eq("id", currentUserId)
                              .then(({ error }) => {
                                setSavingCollege(false);
                                if (error) {
                                  showToast(error.message, "error");
                                } else {
                                  setUserCollege(col);
                                  if (currentUserProfile) {
                                    setCurrentUserProfile({ ...currentUserProfile, college: col });
                                  }
                                  setEditingCollege(false);
                                  showToast("College updated! Filtered SIH listings for your institution.", "success");
                                }
                              });
                          } else {
                            setUserCollege(col);
                            setEditingCollege(false);
                            showToast(`Filter applied for ${col}!`, "info");
                          }
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition truncate border-b border-zinc-100 dark:border-zinc-800/50 last:border-0"
                      >
                        {col}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tab & Controls Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-zinc-200 dark:border-zinc-900">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <span>College Teammate Matcher & Mock Hub</span>
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Filtered strictly by {userCollege ? userCollege : "all institutions across India"}.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1 text-xs">
              <button
                onClick={() => setActiveTab("teams")}
                className={`px-4 py-1.5 rounded-md font-mono uppercase tracking-wider text-[10px] transition cursor-pointer ${activeTab === "teams"
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
              >
                Teams Recruiting ({filteredTeams.length})
              </button>
              <button
                onClick={() => setActiveTab("builders")}
                className={`px-4 py-1.5 rounded-md font-mono uppercase tracking-wider text-[10px] transition cursor-pointer ${activeTab === "builders"
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
              >
                Builders Looking ({filteredBuilders.length})
              </button>
              <button
                onClick={() => setActiveTab("mock_sih")}
                className={`px-4 py-1.5 rounded-md font-mono uppercase tracking-wider text-[10px] transition cursor-pointer flex items-center gap-1.5 ${activeTab === "mock_sih"
                    ? "bg-emerald-500 text-zinc-950 font-bold shadow-sm"
                    : "text-emerald-400 hover:text-emerald-300 font-semibold"
                  }`}
              >
                🏆 Mock SIH Pitches ({mockLeaderboardTotal})
              </button>
            </div>
          </div>
        </div>

        {/* Teams Feed */}
        {activeTab === "teams" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredTeams.length === 0 ? (
              <div className="col-span-2 p-12 text-center rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
                <div className="text-3xl mb-3">🚀</div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">No SIH Teams Recruiting Yet</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-md mx-auto mb-6">
                  {userCollege
                    ? `No teams from ${userCollege} have registered for SIH 2026 yet. Be the first to create one!`
                    : "No teams found. Select your college above or create a team."}
                </p>
                <button
                  onClick={() => handleProtectedAction(`/teams/create?hackathon=${SIH_HACKATHON_ID}`)}
                  className="btn btn-lime text-xs py-2.5 px-4 font-bold bg-[#B4F461] text-black dark:text-black hover:bg-[#a3e64f] inline-flex items-center gap-1.5"
                >
                  + Create SIH Team
                </button>
              </div>
            ) : (
              filteredTeams.map((team) => {
                const memberCount = team.team_members?.length || 1;
                const members = team.team_members || [];

                const hasFemaleMember = members.some(
                  (m) => m.profiles?.gender?.toLowerCase() === "female"
                );

                const memberSkillsSet = new Set<string>();
                members.forEach((m) => {
                  (m.profiles?.skills || []).forEach((s) => memberSkillsSet.add(s));
                });
                const combinedSkills = Array.from(memberSkillsSet);

                const coreRolesNeeded = ["Frontend", "Backend", "AI/ML", "UI/UX", "Mobile"];
                const missingRoles = (team.roles_needed || coreRolesNeeded).filter(
                  (role) => !combinedSkills.some((s) => s.toLowerCase().includes(role.toLowerCase()))
                );

                const isUserTeamMember = Boolean(
                  currentUserId &&
                    (team.owner_id === currentUserId ||
                      members.some((m) => m.user_id === currentUserId || m.profiles?.id === currentUserId))
                );

                return (
                  <div
                    key={team.id}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 hover:border-zinc-300 dark:hover:border-zinc-700 transition flex flex-col justify-between shadow-sm"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h3 className="text-base font-bold text-zinc-900 dark:text-white tracking-tight leading-snug">
                            {team.name}
                          </h3>
                          {team.college && (
                            <span className="inline-block text-[11px] text-orange-600 dark:text-orange-400 font-mono mt-0.5">
                              🏫 {team.college}
                            </span>
                          )}
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shrink-0">
                          {memberCount} / 6 Members
                        </span>
                      </div>

                      <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 mb-4 font-sans leading-relaxed">
                        {team.description || "Building for Smart India Hackathon 2026."}
                      </p>

                      <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 mb-4 space-y-2 text-xs">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold border-b border-zinc-200 dark:border-zinc-800 pb-1 flex items-center justify-between">
                          <span>SIH Compliance Checklist</span>
                          <span className="text-orange-600 dark:text-orange-400">Target: 6 Members</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-zinc-600 dark:text-zinc-400">Team Headcount:</span>
                          <span className={memberCount === 6 ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-amber-600 dark:text-amber-400 font-medium"}>
                            {memberCount === 6 ? "✓ 6/6 Members (Complete)" : `${memberCount}/6 Members (${6 - memberCount} needed)`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-zinc-600 dark:text-zinc-400">Female Representation:</span>
                          <span className={hasFemaleMember ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-amber-600 dark:text-amber-400 font-medium"}>
                            {hasFemaleMember ? "✅ 1+ Female Member" : "⚠️ Requires Female Member"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-zinc-600 dark:text-zinc-400">Skill Coverage:</span>
                          <span className={missingRoles.length === 0 ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-sky-600 dark:text-sky-400 font-medium"}>
                            {missingRoles.length === 0
                              ? "✅ Core Roles Covered"
                              : `Missing: ${missingRoles.slice(0, 2).join(", ")}`}
                          </span>
                        </div>
                      </div>

                      <div className="mb-4">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                          Team Skill Mix
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {combinedSkills.length > 0 ? (
                            combinedSkills.slice(0, 6).map((skill) => (
                              <span
                                key={skill}
                                className="px-2 py-0.5 rounded text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/60 font-mono"
                              >
                                {skill}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">No skills listed yet</span>
                          )}
                          {combinedSkills.length > 6 && (
                            <span className="px-2 py-0.5 rounded text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-mono">
                              +{combinedSkills.length - 6} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                      <div className="flex items-center -space-x-2">
                        {members.map((m) => (
                          <div
                            key={m.id}
                            className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 border-2 border-white dark:border-zinc-900 overflow-hidden flex items-center justify-center text-[10px] font-bold text-zinc-700 dark:text-zinc-300"
                            title={m.profiles?.full_name || "Member"}
                          >
                            {m.profiles?.avatar_url ? (
                              <img src={m.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              (m.profiles?.full_name || "M").substring(0, 1)
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        {isUserTeamMember && (
                          <button
                            onClick={() =>
                              setSelectedExportTeam({
                                team: {
                                  id: team.id,
                                  name: team.name,
                                  description: team.description || "",
                                  owner_id: team.owner_id,
                                  max_members: team.max_members,
                                  college: team.college,
                                  hackathon_name: "Smart India Hackathon 2026",
                                  skills: team.skills,
                                  roles_needed: team.roles_needed,
                                },
                                members: members.map((m) => ({
                                  id: m.id,
                                  role: m.role,
                                  project_role: m.project_role || undefined,
                                  profiles: {
                                    id: m.profiles?.id || m.user_id,
                                    full_name: m.profiles?.full_name || "Member",
                                    email: m.profiles?.email || "N/A",
                                    avatar_url: m.profiles?.avatar_url,
                                    skills: m.profiles?.skills,
                                    gender: m.profiles?.gender,
                                    college: team.college,
                                  },
                                })),
                              })
                            }
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-orange-700 dark:text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 transition flex items-center gap-1 cursor-pointer"
                          >
                            📄 Export SPOC
                          </button>
                        )}

                        {mockSubmissionsMap[team.id] ? (
                          <button
                            onClick={() => {
                              setSelectedSubmissionForScorecard(mockSubmissionsMap[team.id]);
                              setSelectedTeamNameForScorecard(team.name);
                              setMockScorecardModalOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition flex items-center gap-1 cursor-pointer"
                          >
                            🏆 {mockSubmissionsMap[team.id].total_score || 0}/100 Scorecard
                          </button>
                        ) : (
                          isUserTeamMember && (
                            <button
                              onClick={() => {
                                setSelectedTeamForMockSubmit(team);
                                setMockSubmissionModalOpen(true);
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition flex items-center gap-1 cursor-pointer"
                            >
                              🚀 Mock Pitch
                            </button>
                          )
                        )}

                        <Link
                          href={`/teams/${team.id}`}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-black dark:text-black bg-[#B4F461] hover:bg-[#a3e64f] transition shadow-sm"
                        >
                          View & Apply →
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Builders Feed */}
        {activeTab === "builders" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredBuilders.length === 0 ? (
              <div className="col-span-2 p-12 text-center rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
                <div className="text-3xl mb-3">🙋‍♂️</div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">No Builders Seeking Teams Yet</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-md mx-auto mb-6">
                  {userCollege
                    ? `No other builders from ${userCollege} have listed themselves for SIH 2026 yet.`
                    : "No builders listed. Select your college above or list yourself."}
                </p>
                <button
                  onClick={handleToggleLookingForTeam}
                  disabled={togglingStatus}
                  className="btn btn-primary text-xs py-2.5 px-4 font-bold bg-[#B4F461] text-black hover:bg-[#a3e64f] inline-flex items-center gap-1.5"
                >
                  {isUserLookingForTeam ? "Looking for Team ✓" : "🙋‍♂️ List Myself for SIH"}
                </button>
              </div>
            ) : (
              filteredBuilders.map((builder) => (
                <div
                  key={builder.id}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 hover:border-zinc-300 dark:hover:border-zinc-700 transition flex flex-col justify-between shadow-sm"
                >
                  <div>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center text-lg font-bold text-zinc-700 dark:text-zinc-300">
                        {builder.avatar_url ? (
                          <img src={builder.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (builder.full_name || builder.email || "B").substring(0, 1)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                            {builder.full_name || "Anonymous Builder"}
                          </h3>
                          <VerifiedBuilderBadge profile={builder} />
                          {builder.id === currentUserId && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20 shrink-0">
                              You
                            </span>
                          )}
                          {builder.gender?.toLowerCase() === "female" && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-500/10 text-pink-700 dark:text-pink-400 border border-pink-500/20 shrink-0">
                              👩 Female Builder
                            </span>
                          )}
                        </div>
                        {builder.college && (
                          <p className="text-[11px] text-orange-600 dark:text-orange-400 font-mono truncate mt-0.5">
                            🏫 {builder.college}
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 mb-4 font-sans leading-relaxed">
                      {builder.bio || "Builder looking to join a 6-member SIH team."}
                    </p>

                    <div className="mb-4">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                        Prominent Skill Tags
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {builder.skills && builder.skills.length > 0 ? (
                          builder.skills.map((skill) => (
                            <span
                              key={skill}
                              className="px-2 py-0.5 rounded text-[11px] bg-orange-50 dark:bg-orange-500/10 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-500/20 font-mono"
                            >
                              {skill}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">No skills specified</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {builder.is_available !== false ? "🟢 Available to join" : "⚪ Busy"}
                    </span>

                    <Link
                      href={`/profile/${builder.id}`}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-zinc-800 dark:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-700 transition"
                    >
                      View Profile →
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Mock SIH Scalable Leaderboard (Req 6) */}
        {activeTab === "mock_sih" && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-emerald-50/80 dark:bg-gradient-to-r dark:from-emerald-950/40 dark:via-zinc-900 dark:to-zinc-950 border border-emerald-200 dark:border-emerald-500/30 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md dark:shadow-xl transition-colors">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase bg-emerald-200/80 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                  SIH 2026 Practice Screening Hub
                </span>
                <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight mt-1">
                  National Mock SIH Pitch Leaderboard
                </h3>
                <p className="text-xs text-zinc-700 dark:text-zinc-400 max-w-xl mt-1 leading-relaxed">
                  Teams submitted their SIH 6-Slide Pitch PPTs for diagnostic AI + Jury scoring across Problem Novelty, Tech Architecture, UI/UX, Impact, and Team Balance.
                </p>
              </div>

              {currentUserId && (
                <button
                  onClick={() => {
                    const userTeam = allTeams.find(
                      (t) => t.owner_id === currentUserId || t.team_members?.some((m) => m.user_id === currentUserId)
                    );
                    if (userTeam) {
                      setSelectedTeamForMockSubmit(userTeam);
                      setMockSubmissionModalOpen(true);
                    } else {
                      showToast("Please create or join a team first to submit for Mock SIH.", "warning");
                    }
                  }}
                  className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition shrink-0 cursor-pointer"
                >
                  🚀 Submit My Team Pitch for Review
                </button>
              )}
            </div>

            {/* Filters & Search Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Search by PS ID or Title..."
                  value={mockLeaderboardSearch}
                  onChange={(e) => {
                    setMockLeaderboardSearch(e.target.value);
                    fetchLeaderboard(1, mockLeaderboardCategory, e.target.value);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 text-xs w-full sm:w-64 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 font-mono">
                <button
                  onClick={() => {
                    setMockLeaderboardCategory("all");
                    fetchLeaderboard(1, "all", mockLeaderboardSearch);
                  }}
                  className={`px-3 py-1 rounded-lg transition ${
                    mockLeaderboardCategory === "all"
                      ? "bg-emerald-500 text-zinc-950 font-bold"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  All ({mockLeaderboardTotal})
                </button>
                <button
                  onClick={() => {
                    setMockLeaderboardCategory("software");
                    fetchLeaderboard(1, "software", mockLeaderboardSearch);
                  }}
                  className={`px-3 py-1 rounded-lg transition ${
                    mockLeaderboardCategory === "software"
                      ? "bg-emerald-500 text-zinc-950 font-bold"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  Software
                </button>
                <button
                  onClick={() => {
                    setMockLeaderboardCategory("hardware");
                    fetchLeaderboard(1, "hardware", mockLeaderboardSearch);
                  }}
                  className={`px-3 py-1 rounded-lg transition ${
                    mockLeaderboardCategory === "hardware"
                      ? "bg-emerald-500 text-zinc-950 font-bold"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  Hardware
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {mockLeaderboardList.length === 0 ? (
                <div className="col-span-2 p-12 text-center rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
                  <div className="text-3xl mb-3">🏆</div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">
                    No Mock SIH Submissions Found
                  </h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-md mx-auto mb-6">
                    Be the first team to submit your SIH pitch deck for diagnostic evaluation before your college internal screening!
                  </p>
                </div>
              ) : (
                mockLeaderboardList.map((sub: any) => {
                  const matchingTeam = sub.teams || allTeams.find((t) => t.id === sub.team_id);
                  const score = sub.total_score || 0;
                  const grade = sub.grade || "Pending Evaluation";

                  return (
                    <div
                      key={sub.id}
                      className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 shadow-sm hover:border-emerald-500/40 transition flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            PS #{sub.ps_number}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {grade}
                          </span>
                        </div>

                        <h4 className="font-bold text-zinc-900 dark:text-white text-sm line-clamp-1">
                          {sub.ps_title}
                        </h4>

                        <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                          Team: <strong className="text-zinc-900 dark:text-zinc-200">{matchingTeam?.name || "SIH Squad"}</strong>
                          {matchingTeam?.college && ` • ${matchingTeam.college}`}
                        </div>

                        <div className="mt-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 flex items-center justify-between">
                          <div className="text-[11px] text-zinc-500 font-mono">
                            Category: <span className="capitalize font-bold text-zinc-700 dark:text-zinc-300">{sub.ps_category}</span>
                          </div>
                          <div className="text-right font-mono font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                            {score} <span className="text-[10px] text-zinc-500 font-normal">/ 100 PTS</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                        {sub.ppt_url && (() => {
                          const isOwnTeam =
                            matchingTeam?.owner_id === currentUserId ||
                            matchingTeam?.team_members?.some((m: TeamMember) => m.user_id === currentUserId);
                          return isOwnTeam ? (
                            <a
                              href={sub.ppt_url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 transition"
                            >
                              📄 View Pitch PPT
                            </a>
                          ) : (
                            <span className="px-3 py-1.5 rounded-lg text-xs font-mono text-zinc-400 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 cursor-not-allowed select-none" title="PPT link is private to the submitting team">
                              🔒 Pitch Deck (Private)
                            </span>
                          );
                        })()}

                        <button
                          onClick={() => {
                            setSelectedSubmissionForScorecard(sub);
                            setSelectedTeamNameForScorecard(matchingTeam?.name || "SIH Squad");
                            setMockScorecardModalOpen(true);
                          }}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 transition shadow-sm"
                        >
                          📊 View Scorecard →
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination Controls */}
            {mockLeaderboardTotal > 20 && (
              <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800 text-xs font-mono">
                <button
                  disabled={mockLeaderboardPage <= 1}
                  onClick={() => fetchLeaderboard(mockLeaderboardPage - 1, mockLeaderboardCategory, mockLeaderboardSearch)}
                  className="px-3 py-1.5 rounded bg-zinc-100 dark:bg-zinc-800 disabled:opacity-50"
                >
                  ← Previous
                </button>
                <span>
                  Page {mockLeaderboardPage} of {Math.ceil(mockLeaderboardTotal / 20)}
                </span>
                <button
                  disabled={mockLeaderboardPage >= Math.ceil(mockLeaderboardTotal / 20)}
                  onClick={() => fetchLeaderboard(mockLeaderboardPage + 1, mockLeaderboardCategory, mockLeaderboardSearch)}
                  className="px-3 py-1.5 rounded bg-zinc-100 dark:bg-zinc-800 disabled:opacity-50"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {selectedExportTeam && (
        <SIHExportModal
          isOpen={!!selectedExportTeam}
          onClose={() => setSelectedExportTeam(null)}
          team={selectedExportTeam.team}
          members={selectedExportTeam.members}
        />
      )}

      <ContextualProfileNudgeModal
        isOpen={nudgeModalOpen}
        onClose={() => setNudgeModalOpen(false)}
        onProceed={() => {
          setNudgeModalOpen(false);
          if (pendingAction) {
            const act = pendingAction;
            setPendingAction(null);
            act();
          }
        }}
        userProfile={currentUserProfile}
        actionTitle={pendingActionTitle}
        onProfileUpdated={(updated) => {
          setCurrentUserProfile(updated);
        }}
      />

      {currentUserId && (
        <SIHQuickOnboardingModal
          isOpen={quickOnboardingModalOpen}
          onClose={() => setQuickOnboardingModalOpen(false)}
          userId={currentUserId}
          initialCollege={userCollege}
          onSuccess={handleQuickOnboardingSuccess}
        />
      )}

      {/* Guest Sticky Bottom Action Bar for Unauthenticated Visitors */}
      {!currentUserId && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-40 p-4 rounded-xl border border-emerald-500/40 bg-zinc-950/95 backdrop-blur-md shadow-2xl shadow-emerald-950/80 flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-lg shrink-0">
              🏆
            </div>
            <div>
              <p className="text-xs font-bold text-white leading-snug">Building for SIH 2026?</p>
              <p className="text-[11px] text-zinc-400">Connect with builders from your college.</p>
            </div>
          </div>
          <button
            onClick={() => router.push(`/?next=${encodeURIComponent("/hackathons/sih?action=list_myself")}&auth=true`)}
            className="btn btn-primary text-xs py-2 px-3.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold shrink-0 cursor-pointer border-none shadow-md"
          >
            Join Now
          </button>
        </div>
      )}

      {/* SIH Hub Share Modal */}
      <ShareModal
        isOpen={showSIHShareModal}
        onClose={() => setShowSIHShareModal(false)}
        title="Share SIH 2026 Teammate Matcher"
        subtitle="Broadcast to your college WhatsApp & Telegram groups"
        shareUrl={typeof window !== "undefined" ? `${window.location.origin}/hackathons/sih` : "https://hackermate.in/hackathons/sih"}
        shareText={`🚨 *Looking for SIH 2026 Teammates?* 🇮🇳\n\nFind verified engineering teammates & form official 6-member teams for Smart India Hackathon 2026 on HackerMate:\n\n*(Share this in your college WhatsApp group so everyone can complete their SIH teams!)* ⚡`}
        type="team"
        metadata={{
          teamName: "SIH 2026 College Teammate Matcher",
          hackathonName: "Smart India Hackathon 2026",
        }}
      />

      {/* Mock SIH Submission Modal */}
      <MockSIHSubmissionModal
        isOpen={mockSubmissionModalOpen}
        onClose={() => setMockSubmissionModalOpen(false)}
        team={selectedTeamForMockSubmit}
        existingSubmission={
          selectedTeamForMockSubmit ? mockSubmissionsMap[selectedTeamForMockSubmit.id] : undefined
        }
        onSubmitted={(newSub?: any) => {
          loadSIHData();
          setActiveTab("mock_sih");
          if (newSub) {
            const tName = selectedTeamForMockSubmit?.name || "SIH Team";
            setSelectedSubmissionForScorecard(newSub);
            setSelectedTeamNameForScorecard(tName);
            setMockScorecardModalOpen(true);
          }
        }}
      />

      {/* Mock SIH Scorecard Modal */}
      <MockSIHScorecardModal
        isOpen={mockScorecardModalOpen}
        onClose={() => setMockScorecardModalOpen(false)}
        submission={selectedSubmissionForScorecard}
        teamName={selectedTeamNameForScorecard}
        isOwnTeam={(() => {
          if (!selectedSubmissionForScorecard || !currentUserId) return false;
          const t = allTeams.find((team) => team.id === selectedSubmissionForScorecard.team_id);
          return (
            t?.owner_id === currentUserId ||
            t?.team_members?.some((m: TeamMember) => m.user_id === currentUserId) ||
            false
          );
        })()}
        onReEvaluated={() => loadSIHData()}
      />

      <Footer />
    </div>
  );
}
