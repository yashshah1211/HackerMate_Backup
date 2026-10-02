"use client";

import DevShell from "../../DevShell";
import { TeamsView } from "@/app/teams/TeamsView";
import type { ListTeam } from "@/app/teams/useTeamsData";


const TEAMS: ListTeam[] = [
  {
    id: "dev-team-1",
    name: "Null Pointers",
    description: "Offline-first attendance for rural schools. Need a designer and an ML person.",
    skills: ["Figma", "Python", "React", "PostgreSQL"],
    college: "NIT Trichy",
    hackathon_id: "dev-hackathon-1",
    hackathon_name: null,
    max_members: 6,
    is_recruiting: true,
    team_members: [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }],
    team_hackathons: [{ hackathons: { id: "dev-hackathon-1", name: "Hackathon 2026", end_date: "2026-12-10", status: "active" } }],
    team_ppt_evaluations: [{ total_score: 82, grade: "A", status: "completed" }],
  },
  {
    id: "dev-team-2",
    name: "Latency Zero",
    description: "Realtime multiplayer whiteboard. Looking for a Go backend dev.",
    skills: ["Go", "WebSockets", "React"],
    college: "IIT Madras",
    hackathon_id: "h2",
    hackathon_name: null,
    max_members: 4,
    is_recruiting: true,
    team_members: [{ id: "1" }, { id: "2" }],
    team_hackathons: [{ hackathons: { id: "h2", name: "Axcentra All India Hackathon", end_date: "2026-11-01", status: "active" } }],
  },
  {
    id: "dev-team-3",
    name: "Paper Planes",
    description: "Independent project: a study planner that talks to your calendar.",
    skills: ["Flutter", "Firebase"],
    college: null,
    hackathon_id: null,
    hackathon_name: null,
    max_members: 3,
    is_recruiting: true,
    team_members: [{ id: "1" }, { id: "2" }, { id: "3" }],
    team_hackathons: [],
  },
  {
    id: "dev-team-4",
    name: "Byte Brigade",
    description: "Agri-tech drone imagery pipeline.",
    skills: ["Python", "PyTorch", "Computer Vision"],
    college: "BITS Pilani",
    hackathon_id: "h3",
    hackathon_name: null,
    max_members: 5,
    is_recruiting: true,
    team_members: [{ id: "1" }],
    team_hackathons: [{ hackathons: { id: "h3", name: "Morrow 1.0", end_date: "2026-12-20", status: "active" } }],
  },
];

export default function DevTeams() {
  return (
    <DevShell pathname="/teams">
      <TeamsView teams={TEAMS} viewerSkills={["React", "Python"]} loading={false} error={null} onRetry={() => {}} today="2026-09-28" />
    </DevShell>
  );
}
