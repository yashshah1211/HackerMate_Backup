"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DevShell from "../../DevShell";
import TeamWorkspaceView from "@/components/TeamWorkspaceView";

// Obviously fake ids (valid UUID shape so read queries return nothing instead of erroring).
const FAKE_TEAM_ID = "00000000-0000-4000-8000-00000000d3a1";
const FAKE_EVENT_ID = "00000000-0000-4000-8000-00000000e1e1";

const MEMBERS = [
  { id: "m1", role: "owner", project_role: "Frontend", profiles: { id: "00000000-0000-4000-8000-0000000000a1", full_name: "Ananya Rao", email: "", avatar_url: null, skills: ["React", "Figma"] } },
  { id: "m2", role: "member", project_role: "ML", profiles: { id: "00000000-0000-4000-8000-0000000000a2", full_name: "Sara Qureshi", email: "", avatar_url: null, skills: ["Python"] } },
];

type Tab = "chat" | "tasks" | "brainstorm" | "resources" | "github" | "activity" | "deployments" | "ppt" | "gap_filler";

/**
 * Dev-only harness: the real TeamWorkspaceView with a fake team, rendered
 * signed-out. With no user the view performs no writes and loads no team
 * data, so every tab shows its real empty state. 404s in production.
 */
function Harness() {
  const tab = (useSearchParams().get("tab") as Tab) || "tasks";
  const [end] = useState(() => new Date(Date.now() + 5 * 86400000 + 3 * 3600000).toISOString());
  // Signed in, the view's init would call ensure_team_conversation and may
  // create a default brainstorm doc. Refuse to render with a session so this
  // harness can never write anything, even for a fake team id.
  const [session, setSession] = useState<"checking" | "none" | "present">("checking");
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ? "present" : "none"));
  }, []);

  if (session !== "none") {
    return (
      <DevShell pathname={`/teams/${FAKE_TEAM_ID}/workspace`}>
        <p className="p-8 text-[13px] text-ink-3">
          {session === "checking" ? "Checking session…" : "This harness only runs signed out (it must never write). Open it in a private window."}
        </p>
      </DevShell>
    );
  }

  return (
    <DevShell pathname={`/teams/${FAKE_TEAM_ID}/workspace`}>
      <TeamWorkspaceView
        team={{
          id: FAKE_TEAM_ID,
          name: "Null Pointers",
          description: "Fixture team",
          owner_id: MEMBERS[0].profiles.id,
          max_members: 6,
          college: null,
          hackathon_name: "Dev Hackathon 2026",
          skills: ["React", "Python", "Figma", "PostgreSQL"],
          roles_needed: ["Backend"],
          hackathon_id: FAKE_EVENT_ID,
        }}
        members={MEMBERS}
        isOwner
        initialTab={tab}
        listedHackathons={[{ id: FAKE_EVENT_ID, name: "Dev Hackathon 2026", end_date: end }]}
      />
    </DevShell>
  );
}

export default function DevWorkspaceLive() {
  return (
    <Suspense fallback={null}>
      <Harness />
    </Suspense>
  );
}
