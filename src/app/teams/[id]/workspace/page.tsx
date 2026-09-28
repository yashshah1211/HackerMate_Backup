"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Lock, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import TeamWorkspaceView from "@/components/TeamWorkspaceView";
import { ButtonLink, EmptyState, Page, PageLoader } from "@/components/system";

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

type WorkspaceTab = "chat" | "tasks" | "brainstorm" | "resources" | "github" | "activity" | "deployments" | "ppt" | "gap_filler";

function TeamWorkspaceContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const teamId = params.id as string;
  const tabParam = (searchParams.get("tab") as WorkspaceTab) || "chat";

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isMember, setIsMember] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [listedHackathons, setListedHackathons] = useState<any[]>([]);

  useEffect(() => {
    if (teamId) {
      loadTeam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    if (!loading && team && currentUser && !isOwner && !isMember) {
      const timer = setTimeout(() => {
        router.replace(`/teams/${team.id}`);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [loading, team, currentUser, isOwner, isMember, router]);

  async function loadTeam() {
    const { data: teamData, error: teamError } = await supabase
      .from("teams")
      .select("*, team_hackathons(hackathon_id)")
      .eq("id", teamId)
      .single();

    if (teamError) {
      console.error(teamError);
      setLoading(false);
      return;
    }

    const requestedHackathonId = searchParams.get("hackathon_id");
    const linkedHackathons = (teamData.team_hackathons || []).map((th: any) => th.hackathon_id).filter(Boolean);
    const linkedHackathonId = 
      (requestedHackathonId && linkedHackathons.includes(requestedHackathonId) ? requestedHackathonId : null) ||
      teamData.team_hackathons?.[0]?.hackathon_id || 
      teamData.hackathon_id;

    setTeam({ ...teamData, hackathon_id: linkedHackathonId });


    const {
      data: { user },
    } = await supabase.auth.getUser();

    setCurrentUser(user);

    let userIsOwner = false;
    if (user && teamData.owner_id === user.id) {
      userIsOwner = true;
      setIsOwner(true);
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
          skills
        )

      `)
      .eq("team_id", teamId);

    let userIsMember = false;
    if (memberError) {
      console.error(memberError);
    } else {
      const activeMembers = (memberData as unknown as Member[]) || [];
      setMembers(activeMembers);
      
      if (user) {
        userIsMember = activeMembers.some((m) => m.profiles?.id === user.id);
        setIsMember(userIsMember);
      }
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

      if (linkedHackathonId) {
        list.sort((a: any, b: any) => (a.id === linkedHackathonId ? -1 : b.id === linkedHackathonId ? 1 : 0));
      }

      setListedHackathons(list);

    } else {
      setListedHackathons([]);
    }

    setLoading(false);
  }

  if (loading) {
    return <PageLoader label="Opening workspace" />;
  }

  if (!team) {
    return (
      <Page width="narrow" className="pt-10">
        <EmptyState
          icon={<Users />}
          title="Team not found"
          body="This team doesn't exist or has been disbanded."
          action={
            <ButtonLink href="/my-teams" size="sm" variant="secondary">
              Your teams
            </ButtonLink>
          }
        />
      </Page>
    );
  }

  // Auth Guard for workspace: must be owner OR member
  const canAccessWorkspace = isOwner || isMember;

  if (!currentUser) {
    return (
      <Page width="narrow" className="pt-10">
        <EmptyState
          icon={<Lock />}
          title="Sign in to open this workspace"
          body="Team workspaces are private to the team's members."
          action={
            <>
              <ButtonLink href={`/login?next=${encodeURIComponent(`/teams/${team.id}/workspace`)}`} size="sm" variant="primary">
                Sign in
              </ButtonLink>
              <ButtonLink href={`/teams/${team.id}`} size="sm" variant="ghost">
                View team page
              </ButtonLink>
            </>
          }
        />
      </Page>
    );
  }

  if (!canAccessWorkspace) {
    return (
      <Page width="narrow" className="pt-10">
        <EmptyState
          icon={<Lock />}
          title={`${team.name}'s workspace is members-only`}
          body="Taking you back to the team page, where you can ask to join."
          action={
            <ButtonLink href={`/teams/${team.id}`} size="sm" variant="secondary">
              Go to team page
            </ButtonLink>
          }
        />
      </Page>
    );
  }

  return (
    <TeamWorkspaceView
      team={team}
      members={members}
      isOwner={isOwner}
      initialTab={tabParam}
      listedHackathons={listedHackathons}
      refreshTeam={loadTeam}
    />
  );
}

export default function TeamWorkspacePage() {
  return (
    <Suspense fallback={<PageLoader label="Opening workspace" />}>
      <TeamWorkspaceContent />
    </Suspense>
  );
}
