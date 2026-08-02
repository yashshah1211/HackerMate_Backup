"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import TeamWorkspaceView from "@/components/TeamWorkspaceView";

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

type WorkspaceTab = "chat" | "tasks" | "brainstorm" | "resources" | "submission" | "github" | "activity" | "deployments";

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

    const linkedHackathonId = teamData.team_hackathons?.[0]?.hackathon_id || teamData.hackathon_id;
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
          email,
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
      setListedHackathons(list);
    } else {
      setListedHackathons([]);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading team workspace...</p>
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

  // Auth Guard for workspace: must be owner OR member
  const canAccessWorkspace = isOwner || isMember;

  if (!currentUser) {
    return (
      <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
        <div className="card card-static p-12 text-center max-w-lg mx-auto space-y-4">
          <span className="text-3xl">🔒</span>
          <h1 className="text-base font-bold text-white">Sign In Required</h1>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Team workspaces are private for team builders. Please sign in to access workspace features.
          </p>
          <Link
            href={`/teams/${team.id}`}
            className="btn btn-primary btn-sm inline-block"
          >
            View Team Profile →
          </Link>
        </div>
      </main>
    );
  }

  if (!canAccessWorkspace) {
    return (
      <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
        <div className="card card-static p-12 text-center max-w-lg mx-auto space-y-4">
          <span className="text-3xl">🚫</span>
          <h1 className="text-base font-bold text-white">Workspace Access Restricted</h1>
          <p className="text-xs text-zinc-400 leading-relaxed">
            The workspace for &quot;{team.name}&quot; is accessible only to active team members and the team owner.
          </p>
          <Link
            href={`/teams/${team.id}`}
            className="btn btn-primary btn-sm inline-block"
          >
            Back to Team Overview & Join Request →
          </Link>
        </div>
      </main>
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
    <Suspense fallback={
      <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading workspace...</p>
        </div>
      </main>
    }>
      <TeamWorkspaceContent />
    </Suspense>
  );
}
