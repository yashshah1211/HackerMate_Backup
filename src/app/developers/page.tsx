"use client";

import { useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { DevelopersView } from "./DevelopersView";
import { useDevelopersData } from "./useDevelopersData";

function DevelopersContent() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"fit" | "active" | "new">("fit");
  const d = useDevelopersData(search, sort);
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
      sort={sort}
      onSort={setSort}
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
