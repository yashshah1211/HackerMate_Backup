"use client";

import { useEffect, useState } from "react";
import DevShell from "../../DevShell";
import { DEV_BUILDERS } from "../../fixtures";
import { DashboardView } from "@/app/dashboard/DashboardView";
import type { DashboardData } from "@/app/dashboard/useDashboardData";

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60000).toISOString();

const FULL: DashboardData = {
  loading: false,
  redirecting: false,
  profile: {
    id: "dev-viewer",
    full_name: "Ananya Rao",
    college: "NIT Trichy",
    bio: "",
    github_url: "https://github.com/example",
    linkedin_url: null,
    avatar_url: null,
    skills: ["React", "Python"],
    onboarding_completed: true,
    current_streak: 6,
    longest_streak: 11,
    year_of_study: "3rd Year",
  },
  completeness: { percent: 80, missing: [{ key: "bio", label: "Bio / About You" }] },
  nextStep: "Write a line about what you build and the role you want.",
  bestFit: DEV_BUILDERS,
  campus: DEV_BUILDERS.filter((b) => b.same_college),
  matchError: null,
  connectionStates: { "dev-b-3": "connected", "dev-b-4": "request_sent" },
  teams: [
    {
      id: "dev-team-1",
      name: "Null Pointers",
      category: "hackathon",
      tag: "HACKATHON",
      eventName: "Hackathon 2026",
      memberCount: 4,
      maxMembers: 6,
      members: DEV_BUILDERS.map((b) => ({ id: b.id, name: b.full_name, src: null })),
      isOwner: true,
      firstHackathonId: null,
    },
    {
      id: "dev-team-2",
      name: "Latency Zero",
      category: "hackathon",
      tag: "HACKATHON",
      eventName: "Axcentra All India Hackathon",
      memberCount: 3,
      maxMembers: 4,
      members: DEV_BUILDERS.slice(0, 3).map((b) => ({ id: b.id, name: b.full_name, src: null })),
      isOwner: false,
      firstHackathonId: null,
    },
  ],
  queue: [
    { kind: "invite", id: "inv-1", teamId: "dev-team-9", teamName: "Byte Brigade", teamDescription: "Building an offline-first attendance app for rural schools.", inviterName: "Rohan Das" },
    { kind: "join", teamId: "dev-team-1", teamName: "Null Pointers", count: 2, category: "hackathon" },
    {
      kind: "connection",
      id: "req-1",
      user: { id: "dev-b-2", full_name: "Sara Qureshi", avatar_url: null, college: "NIT Trichy" },
      message: "Saw you're doing a hackathon — I can own the CV pipeline if you need ML.",
      createdAt: iso(95),
    },
  ],
  stats: { builders: 1284, teams: 212, hackathons: 18, closingSoon: 3 },
  activity: [
    { id: "a1", message: "Kabir Menon accepted your connection request", link: null, createdAt: iso(12) },
    { id: "a2", message: "Registration for Axcentra closes in 2 days", link: null, createdAt: iso(300) },
    { id: "a3", message: "Meera Iyer joined Null Pointers", link: null, createdAt: iso(1500) },
  ],
  partners: [],
  year: { visible: false, value: "3rd Year", saving: false },
  busyId: null,
};

const EMPTY: DashboardData = {
  ...FULL,
  profile: { ...FULL.profile!, full_name: "Ananya Rao", skills: [], bio: null, github_url: null },
  completeness: {
    percent: 40,
    missing: [
      { key: "bio", label: "Bio / About You" },
      { key: "skills", label: "Skills" },
      { key: "github_url", label: "GitHub Profile" },
    ],
  },
  nextStep: "Add your skills — matching is skill-based, so without them you don't show up.",
  bestFit: [],
  campus: [],
  teams: [],
  queue: [],
  activity: [],
  connectionStates: {},
  year: { visible: true, value: "2nd Year", saving: false },
};

export default function DevDashboard() {
  const [variant, setVariant] = useState<"full" | "empty" | "loading">("full");
  useEffect(() => {
    Promise.resolve().then(() => {
      const s = new URLSearchParams(window.location.search).get("state");
      if (s === "empty" || s === "loading") setVariant(s);
    });
  }, []);
  const data = variant === "empty" ? EMPTY : variant === "loading" ? { ...FULL, loading: true } : FULL;
  const noop = () => {};
  return (
    <DevShell pathname="/dashboard">
      <DashboardView
        data={data}
        unreadMessages={variant === "full" ? 2 : 0}
        handlers={{
          onConfirmYear: noop,
          onYearChange: noop,
          onOpenProfileSetup: noop,
          onAcceptInvite: noop,
          onDeclineInvite: noop,
          onAcceptConnection: noop,
          onDeclineConnection: noop,
          onOpenInbox: noop,
        }}
      />
    </DevShell>
  );
}
