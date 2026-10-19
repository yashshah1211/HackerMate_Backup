"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Users } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import TeamOverviewView from "@/components/TeamOverviewView";
import { useNotification } from "@/context/NotificationContext";
import { ButtonLink, EmptyState, ErrorNotice, Page, PageLoader } from "@/components/system";
import { trackEvent } from "@/lib/posthog";

type Team = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  max_members: number;
  college: string | null;
  hackathon_name: string | null;
  skills: string[] | null;
  roles_needed: string[] | null;
  is_recruiting?: boolean;
  github_repo_url?: string | null;
};

type ListedHackathon = { id: string; name: string; description?: string | null; start_date?: string; end_date?: string; status?: string };

type Member = {
  id: string;
  role: string;
  project_role?: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string | null;
    skills?: string[] | null;
    gender?: string | null;
  };
};

function TeamDetailsContent({ currentUser, sessionIsCurrent, recheckSession }: {
  currentUser: User | null;
  sessionIsCurrent: () => boolean;
  recheckSession: () => void;
}) {
  const { showToast, confirm } = useNotification();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const teamId = params.id as string;
  const joinParam = searchParams.get("join") === "true";
  const tokenParam = searchParams.get("token") || "";

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestStatus, setRequestStatus] = useState<"checking" | "ready" | "error">("checking");
  const scope = useRef(0);
  const teamRead = useRef(0);
  const requestRead = useRef(0);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const [isMember, setIsMember] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [teamFull, setTeamFull] = useState(false);
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const processedJoin = useRef(false);
  const [pendingInvite, setPendingInvite] = useState<{ id: string; status: string } | null>(null);
  const [listedHackathons, setListedHackathons] = useState<ListedHackathon[]>([]);

  useEffect(() => {
    mounted.current = true;
    ++scope.current;
    return () => { mounted.current = false; };
  }, []);

  function current(epoch: number) {
    return mounted.current && scope.current === epoch && sessionIsCurrent();
  }

  useEffect(() => {
    if (teamId) {
      loadTeam();
      checkExistingRequest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (!submitting.current) void checkExistingRequest(); }, 0);
    };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("hm:teams-changed", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("hm:teams-changed", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
    // The keyed page owns one immutable team/account scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading && team && currentUser && requestStatus === "ready" && joinParam && !isOwner && !isMember && !teamFull && !processedJoin.current) {
      const epoch = scope.current;
      processedJoin.current = true;
      confirm({
        title: "Join Team Instantly",
        message: `Would you like to instantly join team "${team.name}"?`,
        confirmText: "Join Team",
        cancelText: "Cancel",
        onConfirm: async () => {
          if (!current(epoch)) return;
          try {
            const { data: auth, error: authError } = await supabase.auth.getUser();
            if (!current(epoch)) return;
            if (authError) throw authError;
            if (auth.user?.id !== currentUser.id) { recheckSession(); return; }
            const { error } = await supabase.rpc("join_team_instantly", {
              p_team_id: teamId,
              p_token: tokenParam,
            });

            if (!current(epoch)) return;

            if (error) {
              console.error("[team] instant join failed:", error);
              showToast(error.message, "error");
            } else {
              showToast(`You have successfully joined "${team.name}"!`, "success");
              refreshTeam();
            }
          } catch (err) {
            console.error(err);
            if (current(epoch)) showToast("Failed to join team instantly.", "error");
          }
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, team, isOwner, isMember, teamFull, joinParam, teamId, confirm, showToast, currentUser, requestStatus]);

  async function loadTeam() {
    const epoch = scope.current;
    const generation = ++teamRead.current;
    const valid = () => current(epoch) && generation === teamRead.current;
    try {
      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("*, team_hackathons(hackathon_id)")
        .eq("id", teamId)
        .single();

      if (!valid()) return;

      if (teamError) {
        console.error("[team] team read failed:", teamError);
        setLoading(false);
        return;
      }

      const requestedHackathonId = searchParams.get("hackathon_id");
      const linkedHackathons = ((teamData.team_hackathons || []) as { hackathon_id: string }[]).map((th) => th.hackathon_id).filter(Boolean);
      const linkedHackathonId =
        (requestedHackathonId && linkedHackathons.includes(requestedHackathonId) ? requestedHackathonId : null) ||
        teamData.team_hackathons?.[0]?.hackathon_id ||
        teamData.hackathon_id;

      setTeam({ ...teamData, hackathon_id: linkedHackathonId });


      const user = currentUser;
      setIsOwner(teamData.owner_id === user?.id);

      if (user) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("skills")
          .eq("id", user.id)
          .single();

        if (!valid()) return;
        if (profileError) console.error("[team] skills read failed:", profileError);

        setUserSkills(profile?.skills || []);

        // Check for pending invite
        const { data: inviteData, error: inviteError } = await supabase
          .from("team_invites")
          .select("id, status")
          .eq("team_id", teamId)
          .eq("invited_user_id", user.id)
          .eq("status", "pending")
          .maybeSingle();

        if (!valid()) return;
        if (inviteError) console.error("[team] invite read failed:", inviteError);

        setPendingInvite(inviteData || null);
      }

      // Load members
      const { data: memberData, error: memberError } = await supabase
        .from("team_members")
        .select(`
          id,
          role,
          project_role,
          profiles (
            id,
            full_name,
            avatar_url,
            skills,
            gender
          )

        `)
        .eq("team_id", teamId);

      if (!valid()) return;

      if (memberError) {
        console.error(memberError);
      } else {
        const activeMembers = (memberData as unknown as Member[]) || [];
        setMembers(activeMembers);

        const isFull = teamData.max_members && activeMembers.length >= teamData.max_members;
        setTeamFull(!!isFull);
      }

      // Load listed hackathons from team_hackathons junction table
      const { data: hackData, error: hackError } = await supabase
        .from("team_hackathons")
        .select(`
          hackathon_id,
          hackathons (
            id,
            name,
            description,
            start_date,
            end_date
          )
        `)
        .eq("team_id", teamId);

      if (!valid()) return;

      if (hackError) {
        console.error("Error loading team hackathons:", hackError);
        setListedHackathons([]);
      } else if (hackData) {
        const list = (hackData as unknown as { hackathons: ListedHackathon | null }[])
          .map((h) => h.hackathons)
          .filter((h): h is ListedHackathon => Boolean(h));
        setListedHackathons(list);
      } else {
        setListedHackathons([]);
      }

      setLoading(false);
    } catch (error) {
      console.error("[team] team load failed:", error);
      if (valid()) setLoading(false);
    }
  }

  function refreshTeam() {
    void loadTeam();
    if (!submitting.current) void checkExistingRequest();
  }

  async function performRemove(memberId: string) {
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("id", memberId);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      return;
    }

    showToast("Member removed from team", "success");
    loadTeam();
  }

  async function removeMember(memberId: string) {
    confirm({
      title: "Remove Team Member",
      message: "Are you sure you want to remove this member from the team?",
      confirmText: "Remove Member",
      cancelText: "Keep Member",
      onConfirm: () => {
        performRemove(memberId);
      }
    });
  }

  async function leaveTeam(memberId: string) {
    setLoading(true);
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("id", memberId);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      setLoading(false);
      return;
    }

    showToast("You have left the team", "success");
    router.push("/teams");
  }

  async function disbandTeam() {
    setLoading(true);
    const { error } = await supabase
      .from("teams")
      .delete()
      .eq("id", teamId);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      setLoading(false);
      return;
    }

    showToast("Team disbanded successfully.", "info");
    router.push("/teams");
  }

  async function toggleRecruiting() {
    if (!team) return;
    const nextVal = team.is_recruiting === false ? true : false;
    const { error } = await supabase
      .from("teams")
      .update({ is_recruiting: nextVal })
      .eq("id", team.id);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      return;
    }

    showToast(nextVal ? "Recruitment is now open!" : "Recruitment is now closed.", "info");
    loadTeam();
  }

  async function checkExistingRequest() {
    const epoch = scope.current;
    const generation = ++requestRead.current;
    const valid = () => current(epoch) && generation === requestRead.current;
    setRequestStatus("checking");
    if (!currentUser) { setRequestSent(false); setIsMember(false); setRequestStatus("ready"); return null; }
    try {
      const [request, membership] = await Promise.all([
        supabase.from("team_join_requests").select("id").eq("team_id", teamId)
          .eq("user_id", currentUser.id).eq("status", "pending").maybeSingle(),
        supabase.from("team_members").select("id").eq("team_id", teamId)
          .eq("user_id", currentUser.id).maybeSingle(),
      ]);
      if (!valid()) return null;
      if (request.error) console.error("[team] request status read failed:", request.error);
      if (membership.error) console.error("[team] membership read failed:", membership.error);
      // Successful reads replace previous values, including an absent pending row.
      if (!request.error) setRequestSent(!!request.data);
      if (!membership.error) setIsMember(!!membership.data);
      if (request.error || membership.error) { setRequestStatus("error"); return null; }
      setRequestStatus("ready");
      return { pending: !!request.data, member: !!membership.data };
    } catch (error) {
      console.error("[team] request status check failed:", error);
      if (valid()) setRequestStatus("error");
      return null;
    }
  }

  async function requestToJoin() {
    if (submitting.current || requestStatus !== "ready" || requestSent || isMember || isOwner || !currentUser) return;
    submitting.current = true;
    const epoch = scope.current;
    setRequestLoading(true);
    ++requestRead.current; // Invalidate any read started before this explicit action.
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!current(epoch)) return;
      if (authError) throw authError;
      if (auth.user?.id !== currentUser.id) { recheckSession(); return; }
      const status = await checkExistingRequest();
      if (!current(epoch) || !status) return;
      if (status.member || status.pending) return;
      // Auth may change while the preflight reads are in flight.
      const { data: latest, error: latestError } = await supabase.auth.getUser();
      if (!current(epoch)) return;
      if (latestError) throw latestError;
      if (latest.user?.id !== currentUser.id) { recheckSession(); return; }
      const { error } = await supabase.rpc("request_to_join_team", { p_team_id: teamId });
      if (!current(epoch)) return;
      if (error) {
        console.error("[team] request submission failed:", error);
        showToast(error.code === "23505" ? "Request already sent" : error.message, error.code === "23505" ? "warning" : "error");
        // Reconcile duplicate/race errors using reads, never resubmit automatically.
        await checkExistingRequest();
        return;
      }
      trackEvent("team_join_request_sent", { source: "team_detail" });
      showToast("Join request sent!", "success");
      setRequestSent(true);
      setRequestStatus("ready");
    } catch (error) {
      console.error("[team] request submission failed:", error);
      if (current(epoch)) {
        setRequestStatus("error");
        showToast("Couldn't verify your request. Check its status before trying again.", "error");
      }
    } finally {
      submitting.current = false;
      if (current(epoch)) setRequestLoading(false);
    }
  }


  async function unlinkHackathon(hackathonId: string) {
    if (!team) return;
    confirm({
      title: "Remove from Hackathon Listing",
      message: "Are you sure you want to remove this team from the hackathon listing?",
      confirmText: "Remove Listing",
      cancelText: "Cancel",
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from("team_hackathons")
            .delete()
            .eq("team_id", team.id)
            .eq("hackathon_id", hackathonId);

          if (error) {
            showToast(error.message, "error");
          } else {
            showToast("Team unlinked from hackathon.", "success");
            loadTeam();
          }
        } catch (err) {
          console.error(err);
          showToast("Failed to unlink team.", "error");
        }
      }
    });
  }

  const teamSkills = team?.skills || [];
  const matchedSkills = teamSkills.filter((skill) => userSkills.includes(skill));
  const missingSkills = teamSkills.filter((skill) => !userSkills.includes(skill));

  const matchScore =
    teamSkills.length > 0 ? Math.round((matchedSkills.length / teamSkills.length) * 100) : 0;

  if (loading) {
    return <PageLoader label="Loading team" />;
  }

  if (!team) {
    return (
      <Page width="narrow" className="pt-10">
        <EmptyState
          icon={<Users />}
          title="Team not found"
          body="This team doesn't exist or has been disbanded."
          action={
            <ButtonLink href="/teams" size="sm" variant="secondary">
              Browse teams
            </ButtonLink>
          }
        />
      </Page>
    );
  }

  return (
    <TeamOverviewView
      team={team}
      members={members}
      isMember={isMember}
      isOwner={isOwner}
      teamFull={teamFull}
      requestLoading={requestLoading}
      requestSent={requestSent}
      requestStatus={requestStatus}
      retryRequest={checkExistingRequest}
      requestToJoin={requestToJoin}
      removeMember={removeMember}
      disbandTeam={disbandTeam}
      leaveTeam={leaveTeam}
      toggleRecruiting={toggleRecruiting}
      matchScore={matchScore}
      matchedSkills={matchedSkills}
      missingSkills={missingSkills}
      refreshTeam={refreshTeam}
      pendingInvite={pendingInvite}
      listedHackathons={listedHackathons}
      unlinkHackathon={unlinkHackathon}
      isPublicVisitor={!currentUser}
    />
  );
}

/** Remount private page state on identity/team changes; fence delayed authentication. */
function TeamDetailsSession() {
  const params = useParams();
  const [account, setAccount] = useState<{ user: User | null; ready: boolean; error: boolean; epoch: number }>({ user: null, ready: false, error: false, epoch: 0 });
  const [retry, setRetry] = useState(0);
  const identity = useRef<string | null>(null);
  const identityEpoch = useRef(0);
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    const generation = ++revision.current;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const user = event === "SIGNED_OUT" ? null : session?.user || null;
      // Even a same-user event invalidates an older getUser lookup.
      ++revision.current;
      if (identity.current !== (user?.id || null)) ++identityEpoch.current;
      identity.current = user?.id || null;
      setAccount({ user, ready: true, error: false, epoch: identityEpoch.current });
    });
    void (async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (!active || generation !== revision.current) return;
        // Missing local session is the normal signed-out visitor case.
        if (error && !(error.name === "AuthSessionMissingError" && !user)) throw error;
        identity.current = user?.id || null;
        setAccount({ user, ready: true, error: false, epoch: ++identityEpoch.current });
      } catch (error) {
        console.error("[team] account verification failed:", error);
        if (active && generation === revision.current) {
          identity.current = null;
          setAccount({ user: null, ready: false, error: true, epoch: ++identityEpoch.current });
        }
      }
    })();
    return () => { active = false; subscription.unsubscribe(); };
  }, [retry]);
  if (account.error) return <Page width="narrow" className="pt-10"><ErrorNotice title="Couldn't verify your account" onRetry={() => setRetry(value => value + 1)} /></Page>;
  if (!account.ready) return <PageLoader label="Loading team" />;
  return <TeamDetailsContent key={`${params.id}:${account.epoch}`} currentUser={account.user}
    sessionIsCurrent={() => identityEpoch.current === account.epoch && identity.current === (account.user?.id || null)}
    recheckSession={() => { ++identityEpoch.current; identity.current = null; setAccount(previous => ({ ...previous, ready: false })); setRetry(value => value + 1); }} />;
}

export default function TeamDetailsPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading team" />}>
      <TeamDetailsSession />
    </Suspense>
  );
}
