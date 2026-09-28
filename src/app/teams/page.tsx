"use client";

import { useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { TeamsView } from "./TeamsView";
import { useTeamsData } from "./useTeamsData";

function TeamsContent() {
  const d = useTeamsData();
  // Computed once per mount so render stays pure.
  const [today] = useState(() => new Date().toISOString().split("T")[0]);
  return <TeamsView teams={d.teams} viewerSkills={d.viewerSkills} loading={d.loading} error={d.error} onRetry={d.reload} today={today} />;
}

export default function TeamsPage() {
  return (
    <AuthGuard>
      <TeamsContent />
    </AuthGuard>
  );
}
