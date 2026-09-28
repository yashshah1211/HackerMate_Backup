"use client";

import { useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { DevelopersView } from "./DevelopersView";
import { useDevelopersData } from "./useDevelopersData";

function DevelopersContent() {
  const [search, setSearch] = useState("");
  const d = useDevelopersData(search);
  return (
    <DevelopersView
      builders={d.builders}
      viewer={d.viewer}
      recs={d.recs}
      relationships={d.relationships}
      ownedTeams={d.ownedTeams}
      loading={d.loading}
      error={d.error}
      onRetry={d.retry}
      search={search}
      onSearch={setSearch}
      onSendInvite={d.sendInvite}
      inviteBusy={d.inviteBusy}
    />
  );
}

export default function DevelopersPage() {
  return (
    <AuthGuard>
      <DevelopersContent />
    </AuthGuard>
  );
}
