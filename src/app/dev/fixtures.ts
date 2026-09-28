/**
 * Fixture data for the dev gallery. Every name here is a made-up
 * placeholder; ids are fake and never touch the database.
 */
import type { ShellTeam } from "@/components/shell/useShellSession";

export const DEV_TEAMS: ShellTeam[] = [
  { id: "dev-team-1", name: "Null Pointers", tone: "sih", isOwner: true, eventName: "Smart India Hackathon 2026" },
  { id: "dev-team-2", name: "Latency Zero", tone: "hack", isOwner: false, eventName: "Axcentra All India Hackathon" },
  { id: "dev-team-3", name: "Paper Planes", tone: "proj", isOwner: false, eventName: "Independent project" },
];

export const DEV_BUILDERS = [
  {
    id: "dev-b-1",
    full_name: "Kabir Menon",
    college: "IIT Madras",
    year_of_study: "3rd Year",
    skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "Figma"],
    avatar_url: null,
    is_available: true,
    compatibility: 86,
    shared_skills: ["React", "TypeScript"],
    same_college: false,
    reasons: ["Adds complementary domain evidence", "Available for a team"],
    bio: "Full-stack builder. Shipped 4 hackathon projects, likes realtime apps.",
    github_url: "https://github.com/example",
    linkedin_url: null,
  },
  {
    id: "dev-b-2",
    full_name: "Sara Qureshi",
    college: "NIT Trichy",
    year_of_study: "2nd Year",
    skills: ["Python", "PyTorch", "FastAPI", "Computer Vision"],
    avatar_url: null,
    is_available: true,
    compatibility: 78,
    shared_skills: ["Python"],
    same_college: true,
    reasons: ["Same verified college mapping", "Adds complementary domain evidence"],
    bio: "ML + CV. Looking for a team for SIH.",
    github_url: null,
    linkedin_url: "https://linkedin.com/in/example",
  },
  {
    id: "dev-b-3",
    full_name: "Dev Malhotra",
    college: "BITS Pilani",
    year_of_study: "4th Year",
    skills: ["Flutter", "Firebase", "Kotlin"],
    avatar_url: null,
    is_available: false,
    compatibility: 64,
    shared_skills: [],
    same_college: false,
    reasons: ["Shares collaboration foundations"],
    bio: "Mobile first. Two SIH finals.",
    github_url: "https://github.com/example",
    linkedin_url: null,
  },
  {
    id: "dev-b-4",
    full_name: "Meera Iyer",
    college: "NIT Trichy",
    year_of_study: "3rd Year",
    skills: ["UI/UX", "Figma", "Framer", "React"],
    avatar_url: null,
    is_available: true,
    compatibility: 58,
    shared_skills: ["React"],
    same_college: true,
    reasons: ["Discovery suggestion: role evidence is incomplete"],
    bio: "Designer who prototypes in code.",
    github_url: null,
    linkedin_url: null,
  },
];
