"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { COLLEGES } from "@/lib/colleges";
import SIHExportModal from "@/components/SIHExportModal";
import { SIHTeamExport, SIHTeamMemberExport } from "@/lib/sihExport";
import ContextualProfileNudgeModal from "@/components/ContextualProfileNudgeModal";
import { calculateProfileCompleteness } from "@/lib/profileCompleteness";
import VerifiedBuilderBadge from "@/components/VerifiedBuilderBadge";
import SIHQuickOnboardingModal from "@/components/SIHQuickOnboardingModal";
import CertificateModal, { UserBadge } from "@/components/CertificateModal";
import { SIH_HACKATHON_ID } from "@/lib/constants";
import ShareModal from "@/components/ShareModal";
import { trackEvent } from "@/lib/posthog";
import { ArrowRight, Building2, CheckCircle2, FileSpreadsheet, GraduationCap, Lightbulb, Plus, Share2, Target, TriangleAlert, UserPlus, Users, Zap } from "lucide-react";
import { eventTimeline } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  Avatar,
  AvatarStack,
  Button,
  ButtonLink,
  Chip,
  EmptyState,
  Input,
  Page,
  PageHeader,
  PageLoader,
  SeatMeter,
  Segmented,
  SkeletonRows,
  StatusDot,
  Tape,
  TeamMark,
} from "@/components/system";

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
    college?: string | null;
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
  team_ppt_evaluations?: { total_score: number; grade: string; status: string }[];
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

  // Handle DJSCE / Dwarkadas J. Sanghvi synonyms
  const isDJSCEA = a.includes("djsce") || a.includes("dwarkadas");
  const isDJSCEB = b.includes("djsce") || b.includes("dwarkadas");
  if (isDJSCEA && isDJSCEB) return true;

  const getFirstWord = (s: string) => s.split(/[\s,()]+/)[0];
  const w1 = getFirstWord(a);
  const w2 = getFirstWord(b);

  const acronyms = ["djsce", "spit", "vjti", "tsec", "vesit", "coep", "pict", "vit", "mit", "vnit", "iit", "nit", "iiit"];
  if (acronyms.includes(w1) && w1 === w2) return true;

  return a.includes(b) || b.includes(a);
}

export default function SIHTeamBuilderPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading SIH team builder" />}>
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
  const [activeTab, setActiveTab] = useState<"teams" | "builders">("teams");
  const [selectedExportTeam, setSelectedExportTeam] = useState<{
    team: SIHTeamExport;
    members: SIHTeamMemberExport[];
  } | null>(null);

  const [quickOnboardingModalOpen, setQuickOnboardingModalOpen] = useState(false);
  const [onboardingIntent, setOnboardingIntent] = useState<{ mode: "create_team" | "list_myself"; targetUrl?: string } | null>(null);
  const [showSIHShareModal, setShowSIHShareModal] = useState(false);

  const [selectedCertBadge, setSelectedCertBadge] = useState<UserBadge | null>(null);
  const [showCertModal, setShowCertModal] = useState(false);

  function updateCollegeInUrl(newCollege: string) {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (newCollege && newCollege.trim().length > 0) {
      params.set("college", newCollege.trim());
    } else {
      params.delete("college");
    }
    const newQuery = params.toString();
    const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : "");
    router.replace(newUrl, { scroll: false });
  }

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

      const urlCollege = searchParams ? searchParams.get("college") : null;
      const DEFAULT_COLLEGE = "DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)";
      let currentCollege = DEFAULT_COLLEGE;

      if (user) {
        setCurrentUserId(user.id);
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, college, skills, gender, role, bio, github_url, linkedin_url, onboarding_completed")
          .eq("id", user.id)
          .single();

        if (prof) {
          setCurrentUserProfile({
            ...prof,
            email: user.email || "",
          } as Profile);
          if (prof.college && prof.college.trim().length > 0) {
            currentCollege = prof.college.trim();
          }
        }

        const { data: userReg } = await supabase
          .from("hackathon_registrations")
          .select("id, looking_for_team")
          .eq("user_id", user.id)
          .eq("hackathon_id", SIH_HACKATHON_ID)
          .maybeSingle();

        setIsUserLookingForTeam(!!userReg?.looking_for_team);
      }

      // URL parameter takes highest priority if explicitly specified
      if (urlCollege !== null) {
        currentCollege = urlCollege.trim();
      }

      setUserCollege(currentCollege);
      setCollegeInput(currentCollege);

      // 3. Fetch ALL Teams registered for SIH (Universally accessible for logged-in and incognito users)
      const { data: sihTeamsData } = await supabase
        .from("teams")
        .select("*, team_members(*, profiles(id, full_name, avatar_url, college, skills, gender, role)), team_ppt_evaluations(total_score, grade, status)")
        .or(`hackathon_id.eq.${SIH_HACKATHON_ID},hackathon_id.eq.00000000-0000-0000-0000-000001703935,hackathon_name.ilike.%sih%,hackathon_name.ilike.%smart india%`);

      const parsedTeams: Team[] = (sihTeamsData || []).filter(Boolean) as Team[];
      const existingIds = new Set(parsedTeams.map((t) => t.id));

      const isForSIH = (t: any) => {
        if (!t) return false;
        if (t.hackathon_id === SIH_HACKATHON_ID || t.hackathon_id === "00000000-0000-0000-0000-000001703935") return true;
        const hName = (t.hackathon_name || "").toLowerCase().trim();
        if (hName.includes("smart india") || hName.includes("sih")) return true;
        if (t.hackathon_id && t.hackathon_id !== SIH_HACKATHON_ID && t.hackathon_id !== "00000000-0000-0000-0000-000001703935") return false;
        if (hName.length > 0) return false;
        return true;
      };

      if (user) {
        // Also fetch user's own created or joined teams if not already present
        const { data: myTeamsData } = await supabase
          .from("teams")
          .select("*, team_members(*, profiles(id, full_name, avatar_url, college, skills, gender, role)), team_ppt_evaluations(total_score, grade, status)")
          .eq("owner_id", user.id);

        const { data: myMemberTeamsData } = await supabase
          .from("team_members")
          .select("team_id, teams(*, team_members(*, profiles(id, full_name, avatar_url, college, skills, gender, role)), team_ppt_evaluations(total_score, grade, status))")
          .eq("user_id", user.id);

        if (myTeamsData) {
          myTeamsData.forEach((t: any) => {
            if (t && !existingIds.has(t.id) && isForSIH(t)) {
              existingIds.add(t.id);
              parsedTeams.push(t);
            }
          });
        }

        if (myMemberTeamsData) {
          myMemberTeamsData.forEach((item: any) => {
            if (item.teams && !existingIds.has(item.teams.id) && isForSIH(item.teams)) {
              existingIds.add(item.teams.id);
              parsedTeams.push(item.teams);
            }
          });
        }
      }

      setAllTeams(parsedTeams);

      // 4. Fetch Builders registered for SIH looking for team
      const { data: regData, error: regErr } = await supabase
        .from("hackathon_registrations")
        .select("user_id, looking_for_team, profiles(id, full_name, avatar_url, college, skills, gender, role)")
        .eq("hackathon_id", SIH_HACKATHON_ID)
        .eq("looking_for_team", true);

      if (regErr) {
        console.error("Error fetching regData:", regErr);
      }

      const parsedBuilders: Profile[] = (Array.isArray(regData) ? regData : [])
        .map((r: any) => r.profiles)
        .filter(Boolean);

      setAllBuilders(parsedBuilders);

      setAllBuilders(parsedBuilders);
    } catch (err) {
      console.error("Error loading SIH data:", err);
    } finally {
      setLoading(false);
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
          updateCollegeInUrl(finalCollege);
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
      updateCollegeInUrl(finalCollege);
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
      setOnboardingIntent({ mode: "list_myself" });
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
    } else {
      router.push(targetUrl);
    }
  }

  function handleQuickOnboardingSuccess(updatedProfile: any) {
    setCurrentUserProfile(updatedProfile as Profile);
    if (updatedProfile.college) {
      setUserCollege(updatedProfile.college);
      updateCollegeInUrl(updatedProfile.college);
      setCollegeInput(updatedProfile.college);
    }

    setOnboardingIntent(null);
    showToast("Profile set up! You are now listed for SIH 2026.", "success");
    executeToggleLookingForTeam();
  }

  const getTeamCollege = (team: Team) =>
    team.college ||
    team.team_members?.find((m) => m.user_id === team.owner_id)?.profiles?.college ||
    team.team_members?.find((m) => m.profiles?.college)?.profiles?.college ||
    null;

  // Filter teams and builders by college
  const filteredTeams = allTeams.filter((team) => {
    if (!userCollege) return true;
    const effCollege = getTeamCollege(team);
    return isSameCollege(effCollege, userCollege);
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
      <Page>
        <PageHeader eyebrow="Smart India Hackathon 2026" title="SIH team builder" meta="Loading teams and builders from your college…" />
        <SkeletonRows rows={5} avatar="square" className="mt-4" />
      </Page>
    );
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const isEventConcluded = Boolean(hackathon?.end_date && hackathon.end_date < todayStr);
  const sihTimeline = hackathon ? eventTimeline(hackathon.start_date, hackathon.end_date) : null;

  return (
    <Page>
      <PageHeader
        eyebrow={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span className="text-sih">Smart India Hackathon 2026</span>
            <span className="text-ink-4" aria-hidden>
              ×
            </span>
            <span>HackerMate</span>
          </span>
        }
        title="SIH team builder"
        meta={
          <>
            Form your official 6-member team from your college for the SIH 2026 internal round.
            {sihTimeline && sihTimeline.state !== "unknown" && (
              <span className={cn("ml-1.5 font-mono text-[12.5px] tabular", sihTimeline.urgent ? "text-warn" : "text-ink-2")}>
                {sihTimeline.label}
              </span>
            )}
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              icon={<Share2 />}
              onClick={() => setShowSIHShareModal(true)}
              title="Share SIH 2026 Teammate Matcher to college WhatsApp groups"
              className="max-md:h-9"
            >
              Share
            </Button>
            <Button
              variant="secondary"
              onClick={handleToggleLookingForTeam}
              loading={togglingStatus}
              aria-pressed={isUserLookingForTeam}
              title={isUserLookingForTeam ? "You're listed. Select to remove yourself." : undefined}
              icon={isUserLookingForTeam ? <CheckCircle2 className="text-ok" /> : <UserPlus />}
              className="max-md:h-9"
            >
              {isUserLookingForTeam ? "Looking for team" : "List myself"}
            </Button>
            <Button
              variant="primary"
              icon={<Plus />}
              onClick={() => handleProtectedAction(`/teams/create?hackathon=${SIH_HACKATHON_ID}`)}
              className="max-md:h-9"
            >
              Create SIH team
            </Button>
          </>
        }
      />

      {/* SIH rules as compact facts */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        {[
          ["Team size", "6 members"],
          ["Eligibility", "Same college"],
          ["Mandate", "1+ female member"],
          ["Skills", "Diverse mix"],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 bg-raised px-4 py-3">
            <dt className="caps-label text-ink-3">{label}</dt>
            <dd className="mt-1 text-[13.5px] font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {/* College Context & Picker */}
      <div className="mt-4 rounded-lg border border-line bg-raised px-4 py-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-selected text-ink-2" aria-hidden>
              <GraduationCap className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="caps-label text-ink-3">College filter</p>
              {userCollege ? (
                <p className="mt-0.5 break-words text-[13.5px] font-medium text-ink">{userCollege}</p>
              ) : (
                <p className="mt-0.5 flex items-start gap-1.5 text-[13px] text-warn">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>No college selected in your profile. Pick your college to filter teammates.</span>
                </p>
              )}
            </div>
          </div>

          {!editingCollege && (
            <Button variant="secondary" onClick={() => setEditingCollege(true)} className="self-start max-md:h-9 sm:self-auto">
              {userCollege ? "Change college" : "Select college"}
            </Button>
          )}
        </div>

        {editingCollege && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="relative min-w-0 flex-1">
              <Input
                type="text"
                aria-label="College name"
                autoComplete="off"
                value={collegeInput}
                onChange={(e) => {
                  setCollegeInput(e.target.value);
                  setCollegeSearch(e.target.value);
                }}
                placeholder="Type college name…"
                className="max-md:h-10"
              />

              {/* College Autocomplete Dropdown */}
              {collegeSearch.length > 1 && filteredCollegesList.length > 0 && (
                <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-line bg-overlay p-1 shadow-pop">
                  {filteredCollegesList.map((col) => (
                    <button
                      key={col}
                      type="button"
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
                                updateCollegeInUrl(col);
                                if (currentUserProfile) {
                                  setCurrentUserProfile({ ...currentUserProfile, college: col });
                                }
                                setEditingCollege(false);
                                showToast("College updated! Filtered SIH listings for your institution.", "success");
                              }
                            });
                        } else {
                          setUserCollege(col);
                          updateCollegeInUrl(col);
                          setEditingCollege(false);
                          showToast(`Filter applied for ${col}!`, "info");
                        }
                      }}
                      className="flex h-9 w-full items-center rounded-[5px] px-2.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
                    >
                      <span className="truncate">{col}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="inverse" onClick={handleSaveCollege} loading={savingCollege} className="max-md:h-9">
                {savingCollege ? "Saving…" : "Save"}
              </Button>
              <Button variant="ghost" onClick={() => setEditingCollege(false)} className="max-md:h-9">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Directory header */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">College teammate matcher</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            Filtered by {userCollege ? userCollege : "all institutions across India"}.
          </p>
        </div>
        <Segmented<"teams" | "builders">
          label="SIH directory"
          value={activeTab}
          onChange={setActiveTab}
          className="self-start sm:self-auto"
          options={[
            { value: "teams", label: "Teams recruiting", count: filteredTeams.length },
            { value: "builders", label: "Builders looking", count: filteredBuilders.length },
          ]}
        />
      </div>

      {/* Teams Feed */}
      {activeTab === "teams" && (
        <div className="mt-4">
          {filteredTeams.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="No SIH teams recruiting yet"
              body={
                userCollege
                  ? `No teams from ${userCollege} have registered for SIH 2026 yet. Be the first to create one.`
                  : "No teams found. Select your college above or create a team."
              }
              action={
                <Button
                  variant="secondary"
                  icon={<Plus />}
                  onClick={() => handleProtectedAction(`/teams/create?hackathon=${SIH_HACKATHON_ID}`)}
                  className="max-md:h-9"
                >
                  Create SIH team
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredTeams.map((team) => {
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

                const pptEval = team.team_ppt_evaluations?.find((e: any) => e.status === "completed");
                const teamCollege = getTeamCollege(team);
                const isClosed = isEventConcluded || team.is_recruiting === false;

                return (
                  <article key={team.id} className="flex min-w-0 flex-col rounded-lg border border-line bg-raised">
                    <div className="flex items-start gap-3 px-4 pt-4">
                      <TeamMark name={team.name} tone="sih" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="min-w-0 truncate text-[15px] font-semibold leading-snug text-ink">
                            <Link href={`/teams/${team.id}`} className="decoration-line-strong underline-offset-4 hover:underline">
                              {team.name}
                            </Link>
                          </h3>
                          {isUserTeamMember ? (
                            <Tape tone="accent" className="shrink-0">Your team</Tape>
                          ) : isClosed ? (
                            <Tape tone="neutral" className="shrink-0">Closed</Tape>
                          ) : (
                            <Tape tone="sih" className="shrink-0">Recruiting</Tape>
                          )}
                        </div>
                        {teamCollege && (
                          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[12.5px] text-ink-3">
                            <Building2 className="size-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{teamCollege}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="mt-2.5 line-clamp-2 px-4 text-[13px] leading-relaxed text-ink-2">
                      {team.description || "Building for Smart India Hackathon 2026."}
                    </p>

                    <div className="mt-3 px-4">
                      <SeatMeter filled={memberCount} total={6} />
                    </div>

                    {/* SIH compliance checklist */}
                    <ul className="mx-4 mt-3 divide-y divide-line rounded-md border border-line bg-sunken" aria-label="SIH compliance checklist">
                      <CheckRow
                        status={memberCount === 6 ? "ok" : "warn"}
                        label="Headcount"
                        value={memberCount === 6 ? "6/6 complete" : `${memberCount}/6 · ${6 - memberCount} needed`}
                      />
                      <CheckRow
                        status={hasFemaleMember ? "ok" : "warn"}
                        label="Female member"
                        value={hasFemaleMember ? "1+ on team" : "Required"}
                      />
                      <CheckRow
                        status={missingRoles.length === 0 ? "ok" : "info"}
                        label="Skill coverage"
                        value={missingRoles.length === 0 ? "Core roles covered" : `Missing: ${missingRoles.slice(0, 2).join(", ")}`}
                      />
                      <CheckRow
                        status={pptEval ? "ok" : "neutral"}
                        icon={<Target />}
                        label="Pitch deck score"
                        value={
                          pptEval ? (
                            <span className="font-mono tabular">
                              {pptEval.total_score}/100 <span className="text-ink-3">({pptEval.grade})</span>
                            </span>
                          ) : (
                            "Not evaluated"
                          )
                        }
                      />
                    </ul>

                    <div className="mt-3 flex flex-wrap gap-1 px-4">
                      {combinedSkills.length > 0 ? (
                        <>
                          {combinedSkills.slice(0, 6).map((skill) => (
                            <Chip key={skill}>{skill}</Chip>
                          ))}
                          {combinedSkills.length > 6 && <Chip>+{combinedSkills.length - 6} more</Chip>}
                        </>
                      ) : (
                        <span className="text-[12.5px] text-ink-3">No skills listed yet</span>
                      )}
                    </div>

                    <div className="min-h-4 flex-1" aria-hidden />
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
                      <AvatarStack
                        max={6}
                        people={members.map((m) => ({
                          id: m.id,
                          name: m.profiles?.full_name || "Member",
                          src: m.profiles?.avatar_url,
                        }))}
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        {isUserTeamMember && (
                          <Button
                            variant="secondary"
                            icon={<FileSpreadsheet />}
                            className="max-md:h-9"
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
                          >
                            Export SPOC
                          </Button>
                        )}

                        <ButtonLink
                          href={`/teams/${team.id}`}
                          variant={!isUserTeamMember && !isClosed ? "primary" : "secondary"}
                          iconRight={<ArrowRight />}
                          className="max-md:h-9"
                        >
                          {isUserTeamMember ? "View team" : isClosed ? "View team" : "View & apply"}
                        </ButtonLink>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Builders Feed */}
      {activeTab === "builders" && (
        <div className="mt-4">
          {filteredBuilders.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="No builders looking for a team yet"
              body={
                userCollege
                  ? `No other builders from ${userCollege} have listed themselves for SIH 2026 yet.`
                  : "No builders listed. Select your college above or list yourself."
              }
              action={
                <Button
                  variant="secondary"
                  onClick={handleToggleLookingForTeam}
                  loading={togglingStatus}
                  icon={isUserLookingForTeam ? <CheckCircle2 className="text-ok" /> : <Zap />}
                  className="max-md:h-9"
                >
                  {isUserLookingForTeam ? "Looking for team" : "List myself for SIH"}
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredBuilders.map((builder) => (
                <article key={builder.id} className="flex min-w-0 flex-col rounded-lg border border-line bg-raised">
                  <div className="flex items-start gap-3 px-4 pt-4">
                    <Avatar name={builder.full_name || builder.email || "B"} src={builder.avatar_url} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <h3 className="min-w-0 truncate text-[15px] font-semibold text-ink">
                          <Link href={`/profile/${builder.id}`} className="decoration-line-strong underline-offset-4 hover:underline">
                            {builder.full_name || "Anonymous Builder"}
                          </Link>
                        </h3>
                        <VerifiedBuilderBadge profile={builder} />
                        {builder.id === currentUserId && <Tape tone="accent">You</Tape>}
                        {builder.gender?.toLowerCase() === "female" && <Tape tone="info">Female builder</Tape>}
                      </div>
                      {builder.college && (
                        <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[12.5px] text-ink-3">
                          <Building2 className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{builder.college}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <p className="mt-2.5 line-clamp-2 px-4 text-[13px] leading-relaxed text-ink-2">
                    {builder.bio || "Builder looking to join a 6-member SIH team."}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1 px-4">
                    {builder.skills && builder.skills.length > 0 ? (
                      builder.skills.map((skill) => <Chip key={skill}>{skill}</Chip>)
                    ) : (
                      <span className="text-[12.5px] text-ink-3">No skills specified</span>
                    )}
                  </div>

                  <div className="min-h-4 flex-1" aria-hidden />
                  <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3">
                      <StatusDot tone={builder.is_available !== false ? "ok" : "idle"} />
                      {builder.is_available !== false ? "Available to join" : "Busy"}
                    </span>
                    <ButtonLink href={`/profile/${builder.id}`} variant="secondary" iconRight={<ArrowRight />} className="max-md:h-9">
                      View profile
                    </ButtonLink>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Official DJSCE SIH Nomination Certificate Modal */}
      <CertificateModal
        isOpen={showCertModal}
        onClose={() => setShowCertModal(false)}
        badge={selectedCertBadge}
        recipientName={currentUserProfile?.full_name || "DJSCE Builder"}
      />

      {/* SIH Quick Onboarding Modal (only for "List Myself" flow) */}
      <SIHQuickOnboardingModal
        isOpen={quickOnboardingModalOpen}
        onClose={() => {
          setQuickOnboardingModalOpen(false);
          setOnboardingIntent(null);
        }}
        userId={currentUserId || ""}
        initialCollege={userCollege}
        title="List Yourself for SIH 2026 Teammate Matching"
        subtitle="Teammates from your college will find you on the SIH builder board."
        buttonText="Publish Profile & Get Matched"
        onSuccess={(updatedProfile) => {
          setQuickOnboardingModalOpen(false);
          handleQuickOnboardingSuccess(updatedProfile);
        }}
      />

      {/* Contextual Profile Nudge Modal */}
      <ContextualProfileNudgeModal
        isOpen={nudgeModalOpen}
        onClose={() => setNudgeModalOpen(false)}
        onProceed={() => {
          setNudgeModalOpen(false);
          if (pendingAction) {
            pendingAction();
            setPendingAction(null);
          }
        }}
        userProfile={currentUserProfile}
        actionTitle={pendingActionTitle || "SIH Action"}
        onProfileUpdated={(updated) => {
          setCurrentUserProfile(updated);
        }}
      />

      {/* WhatsApp & Social Share Modal */}
      <ShareModal
        isOpen={showSIHShareModal}
        onClose={() => setShowSIHShareModal(false)}
        title="Share SIH 2026 Teammate Matcher"
        subtitle={`Connect with builders from ${userCollege || "your college"} looking for SIH 2026 teams!`}
        shareUrl={typeof window !== "undefined" ? `${window.location.origin}/hackathons/sih${userCollege ? `?college=${encodeURIComponent(userCollege)}` : ""}` : "https://hackermate.in/hackathons/sih"}
        shareText={`Building for Smart India Hackathon 2026? Find 6-member team updates and teammates from ${userCollege || "our college"} on HackerMate!`}
        type="team"
        metadata={{
          hackathonName: "Smart India Hackathon 2026",
        }}
      />

      {/* SIH Team Export Modal */}
      {selectedExportTeam && (
        <SIHExportModal
          isOpen={!!selectedExportTeam}
          onClose={() => setSelectedExportTeam(null)}
          team={selectedExportTeam.team}
          members={selectedExportTeam.members}
        />
      )}
    </Page>
  );
}

/** One row of the SIH compliance checklist. */
function CheckRow({
  status,
  label,
  value,
  icon,
}: {
  status: "ok" | "warn" | "info" | "neutral";
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const glyph =
    status === "ok" ? (
      <CheckCircle2 className="text-ok" />
    ) : status === "warn" ? (
      <TriangleAlert className="text-warn" />
    ) : status === "info" ? (
      <Lightbulb className="text-info" />
    ) : (
      icon || <Target />
    );
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]">
      <span className="shrink-0 text-ink-3">{label}</span>
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5 text-right [&_svg]:size-3.5 [&_svg]:shrink-0",
          status === "ok" ? "text-ok" : status === "warn" ? "text-warn" : status === "info" ? "text-ink-2" : "text-ink-3",
        )}
      >
        {glyph}
        <span className="truncate">{value}</span>
      </span>
    </li>
  );
}
