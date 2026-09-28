"use client";

import { useState } from "react";
import DevShell from "../../DevShell";
import { DEV_BUILDERS } from "../../fixtures";
import { DevelopersView } from "@/app/developers/DevelopersView";
import type { Builder } from "@/app/developers/useDevelopersData";

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60000).toISOString();

const MORE: Builder[] = [
  { id: "dev-b-5", full_name: "Arjun Nair", college: "IIT Madras", year_of_study: "2nd Year", bio: "Rust + systems. Wants a team that ships infra.", avatar_url: null, skills: ["Rust", "Go", "Docker", "Kubernetes"], is_available: true, has_participated_hackathon: true, hackathon_wins: 0, last_seen_at: iso(2), created_at: iso(9000) },
  { id: "dev-b-6", full_name: "Priya Kulkarni", college: "VJTI Mumbai", year_of_study: "4th Year", bio: "Product + frontend. Two wins at Smart India Hackathon.", avatar_url: null, skills: ["React", "Next.js", "Tailwind", "Figma"], is_available: false, has_participated_hackathon: true, hackathon_wins: 2, last_seen_at: iso(400), created_at: iso(20000) },
];

const BUILDERS: Builder[] = [
  ...DEV_BUILDERS.map((b, i) => ({
    id: b.id,
    full_name: b.full_name,
    college: b.college,
    year_of_study: b.year_of_study,
    bio: b.bio,
    avatar_url: null,
    skills: b.skills,
    is_available: b.is_available,
    has_participated_hackathon: i % 2 === 0,
    hackathon_wins: i === 0 ? 1 : 0,
    last_seen_at: iso(i * 90 + 1),
    created_at: iso(5000 - i * 100),
  })),
  ...MORE,
];

export default function DevBuilders() {
  const [search, setSearch] = useState("");
  return (
    <DevShell pathname="/developers">
      <DevelopersView
        builders={BUILDERS}
        viewer={{ id: "dev-viewer", full_name: "Ananya Rao", college: "NIT Trichy", bio: null, avatar_url: null, skills: ["React", "Python"] }}
        recs={Object.fromEntries(DEV_BUILDERS.map((b) => [b.id, { compatibility: b.compatibility, reasons: b.reasons }]))}
        relationships={{ "dev-b-3": "connected", "dev-b-4": "request_sent" }}
        ownedTeams={[{ id: "dev-team-1", name: "Null Pointers", owner_id: "dev-viewer" }]}
        loading={false}
        error={null}
        onRetry={() => {}}
        search={search}
        onSearch={setSearch}
        onSendInvite={async () => true}
        inviteBusy={false}
      />
    </DevShell>
  );
}
