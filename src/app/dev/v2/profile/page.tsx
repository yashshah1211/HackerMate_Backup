"use client";

import { useEffect, useState } from "react";
import DevShell from "../../DevShell";
import { ProfileView } from "@/app/profile/[id]/ProfileView";
import type { BuilderProfile, ConnectionState } from "@/app/profile/[id]/useProfileData";
import type { TrackRecordData } from "@/components/BuilderTrackRecord";

const PROFILE: BuilderProfile = {
  id: "dev-b-1",
  full_name: "Kabir Menon",
  username: "kabir",
  college: "IIT Madras",
  year_of_study: "3rd Year",
  bio: "Full-stack builder. I like realtime apps and boring, reliable backends.\nShipped four hackathon projects; looking for a design-minded teammate for the next hackathon.",
  github_url: "https://github.com/example",
  linkedin_url: "https://linkedin.com/in/example",
  avatar_url: null,
  skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "Redis", "Docker", "Figma"],
  is_available: true,
  github_stats: {
    followers: 48,
    public_repos: 31,
    top_languages: { TypeScript: 14, Python: 6, Go: 3, CSS: 2 },
    repos: [
      { name: "attendance-offline", description: "Offline-first attendance for rural schools. Built at Hackathon 2025.", language: "TypeScript", stars: 42, url: "#" },
      { name: "pg-queue", description: "Tiny job queue on Postgres SKIP LOCKED.", language: "Go", stars: 18, url: "#" },
    ],
  },
  github_stats_updated_at: new Date(Date.now() - 86400000 * 3).toISOString(),
  has_participated_hackathon: true,
  hackathon_participations: 4,
  hackathon_wins: 1,
  current_streak: 6,
  last_active_date: new Date().toISOString().split("T")[0],
  last_seen_at: new Date(Date.now() - 60000).toISOString(),
  created_at: "2026-02-10T10:00:00Z",
  show_track_record: true,
};

const TRACK: TrackRecordData = {
  profile: {
    id: "dev-b-1",
    full_name: "Kabir Menon",
    college: "IIT Madras",
    bio: null,
    avatar_url: null,
    skills: [],
    github_url: null,
    linkedin_url: null,
    created_at: "2026-02-10T10:00:00Z",
    show_track_record: true,
  },
  registrations: [
    { registration_id: "r1", hackathon_id: "h1", hackathon_name: "Hackathon 2026", mode: "hybrid", location: null, prize_pool: null, start_date: "2026-09-12", end_date: "2026-09-14", website_url: null, registration_status: "registered", looking_for_team: false, registered_at: "2026-08-20" },
    { registration_id: "r2", hackathon_id: "h2", hackathon_name: "Axcentra All India Hackathon", mode: "online", location: null, prize_pool: null, start_date: "2026-07-02", end_date: "2026-07-04", website_url: null, registration_status: "registered", looking_for_team: false, registered_at: "2026-06-11" },
    { registration_id: "r3", hackathon_id: "h3", hackathon_name: "Morrow 1.0", mode: "offline", location: null, prize_pool: null, start_date: "2026-04-18", end_date: "2026-04-19", website_url: null, registration_status: "registered", looking_for_team: true, registered_at: "2026-04-01" },
  ],
  teams: [
    {
      team_id: "t1",
      team_name: "Null Pointers",
      description: null,
      user_role: "Backend",
      joined_at: "2026-08-21",
      team_hackathons: ["h1"],
      teammates: [
        { user_id: "u1", full_name: "Sara Qureshi", avatar_url: null, role: "member" },
        { user_id: "u2", full_name: "Meera Iyer", avatar_url: null, role: "member" },
      ],
    },
    { team_id: "t2", team_name: "Latency Zero", description: null, user_role: "Full stack", joined_at: "2026-06-12", team_hackathons: ["h2"], teammates: [{ user_id: "u3", full_name: "Dev Malhotra", avatar_url: null, role: "member" }] },
  ],
  submissions: [{ team_id: "t1", hackathon_id: "h1", project_title: "Offline attendance", demo_url: "#", github_url: "#", slides_url: "#", completion_status: "submitted", submitted_at: "2026-09-14" }],
};

export default function DevProfile() {
  const [state, setState] = useState<ConnectionState | "own">("not_connected");
  useEffect(() => {
    Promise.resolve().then(() => {
      const s = new URLSearchParams(window.location.search).get("state");
      if (s) setState(s as ConnectionState | "own");
    });
  }, []);
  const noop = () => {};
  const own = state === "own";
  return (
    <DevShell pathname="/profile/dev-b-1">
      <ProfileView
        profile={PROFILE}
        viewerId="dev-viewer"
        isOwnProfile={own}
        connectionState={own ? "self" : state}
        isBlockedByMe={false}
        badges={[{ id: "bd1", user_id: "dev-b-1", badge_type: "winner", badge_name: "Axcentra — Track winner", issuer_name: "Axcentra", rank_title: "1st place", issued_at: "2026-07-05" }]}
        trackRecord={TRACK}
        trackRecordLoading={false}
        stats={{ connections: 37, teams: 2, practice: 9, registrations: 3 }}
        canInvite
        alreadyInvited={false}
        busy={null}
        actions={{
          onConnect: noop,
          onAccept: noop,
          onRemove: noop,
          onToggleBlock: noop,
          onReport: noop,
          onInvite: noop,
          onSyncGithub: noop,
          onDelete: noop,
          onViewCertificate: noop,
          onShareBadge: noop,
          onCopyLink: noop,
        }}
      />
    </DevShell>
  );
}
