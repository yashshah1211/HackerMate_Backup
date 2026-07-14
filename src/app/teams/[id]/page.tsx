"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import TeamDetailsView from "@/components/TeamDetailsView";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";

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

type Member = {
  id: string;
  role: string;
  project_role?: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string | null;
  };
};

function TeamDetailsContent() {
  const { showToast, confirm } = useNotification();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const teamId = params.id as string;
  const joinParam = searchParams.get("join") === "true";
  const tokenParam = searchParams.get("token") || "";
  const tabParam = searchParams.get("tab") as "chat" | "tasks" | "brainstorm" | "resources" | "submission" | null;

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [teamFull, setTeamFull] = useState(false);
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [processedJoin, setProcessedJoin] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<{ id: string; status: string } | null>(null);
  const [listedHackathons, setListedHackathons] = useState<any[]>([]);

  useEffect(() => {
    if (teamId) {
      loadTeam();
      checkExistingRequest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    if (!loading && team && joinParam && !isOwner && !isMember && !teamFull && !processedJoin) {
      setTimeout(() => setProcessedJoin(true), 0);
      confirm({
        title: "Join Team Instantly",
        message: `Would you like to instantly join team "${team.name}"?`,
        confirmText: "Join Team",
        cancelText: "Cancel",
        onConfirm: async () => {
          try {
            const { error } = await supabase.rpc("join_team_instantly", {
              p_team_id: teamId,
              p_token: tokenParam,
            });

            if (error) {
              showToast(error.message, "error");
            } else {
              showToast(`You have successfully joined "${team.name}"!`, "success");
              loadTeam();
            }
          } catch (err) {
            console.error(err);
            showToast("Failed to join team instantly.", "error");
          }
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, team, isOwner, isMember, teamFull, joinParam, processedJoin, teamId, confirm, showToast]);

  async function loadTeam() {
    const { data: teamData, error: teamError } = await supabase
      .from("teams")
      .select("*")
      .eq("id", teamId)
      .single();

    if (teamError) {
      console.error(teamError);
      setLoading(false);
      return;
    }

    setTeam(teamData);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("skills")
        .eq("id", user.id)
        .single();

      setUserSkills(profile?.skills || []);

      if (teamData.owner_id === user.id) {
        setIsOwner(true);
      }

      // Check for pending invite
      const { data: inviteData } = await supabase
        .from("team_invites")
        .select("id, status")
        .eq("team_id", teamId)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .maybeSingle();

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
          email,
          avatar_url,
          skills
        )
      `)
      .eq("team_id", teamId);

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

    if (hackError) {
      console.error("Error loading team hackathons:", hackError);
      setListedHackathons([]);
    } else if (hackData) {
      const list = hackData
        .map((h: any) => h.hackathons)
        .filter(Boolean);
      setListedHackathons(list);
    } else {
      setListedHackathons([]);
    }

    setLoading(false);
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("team_join_requests")
      .select("id")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (data) {
      setRequestSent(true);
    }

    const { data: membership } = await supabase
      .from("team_members")
      .select("id")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .maybeSingle();

    setIsMember(!!membership);
  }

  async function requestToJoin() {
    setRequestLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      showToast("Please login first", "warning");
      setRequestLoading(false);
      return;
    }

    const { data: membership } = await supabase
      .from("team_members")
      .select("id")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membership) {
      showToast("You are already a member of this team", "warning");
      setRequestLoading(false);
      return;
    }

    const { error } = await supabase.rpc("request_to_join_team", {
      p_team_id: teamId,
    });

    if (error) {
      console.error(error);
      if (error.code === "23505") {
        showToast("Request already sent", "warning");
      } else {
        showToast(error.message, "error");
      }
      setRequestLoading(false);
      return;
    }

    showToast("Join request sent!", "success");
    setRequestSent(true);
    setRequestLoading(false);

    // Trigger email alert
    if (team) {
      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: user.id,
          recipientId: team.owner_id,
          type: "join_request",
          teamId: teamId,
        }),
      }).catch((err) => console.error("Failed to send fallback notification email:", err));
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
    return (
      <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading team details...</p>
        </div>
      </main>
    );
  }

  if (!team) {
    return (
      <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
        <div className="card card-static p-12 text-center">
          <h1 className="text-sm font-semibold text-white mb-1">Team not found</h1>
          <p className="text-xs text-zinc-500">This team does not exist or has been deleted.</p>
        </div>
      </main>
    );
  }

  return (
      <TeamDetailsView
        team={team}
        members={members}
        isMember={isMember}
        isOwner={isOwner}
        teamFull={teamFull}
        requestLoading={requestLoading}
        requestSent={requestSent}
        requestToJoin={requestToJoin}
        removeMember={removeMember}
        disbandTeam={disbandTeam}
        leaveTeam={leaveTeam}
        toggleRecruiting={toggleRecruiting}
        matchScore={matchScore}
        matchedSkills={matchedSkills}
        missingSkills={missingSkills}
        refreshTeam={loadTeam}
        pendingInvite={pendingInvite}
        listedHackathons={listedHackathons}
        unlinkHackathon={unlinkHackathon}
        initialTab={tabParam ?? undefined}
      />
  );


}

export default function TeamDetailsPage() {
  return (
    <AuthGuard>
      <Suspense fallback={
        <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading team...</p>
          </div>
        </main>
      }>
        <TeamDetailsContent />
      </Suspense>
    </AuthGuard>
  );
}
