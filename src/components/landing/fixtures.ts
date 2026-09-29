/**
 * Example data for the landing page product previews.
 *
 * Every person, team and number here is illustrative. The previews render
 * the real V2 interface patterns, but none of this is (or claims to be)
 * live data, and no real builder is shown on the public page.
 */

export type ExampleBuilder = {
  id: string;
  name: string;
  college: string;
  year: string;
  skills: string[];
  available: boolean;
  online: boolean;
  wins: number;
  competed: boolean;
  /** 0-100, only ever shown as a band (Strong / Good fit), like the app. */
  fit: number;
  reason: string;
  lastActive: string;
};

export const EXAMPLE_BUILDERS: ExampleBuilder[] = [
  {
    id: "b-meera",
    name: "Meera Iyer",
    college: "NIT Trichy",
    year: "3rd year",
    skills: ["Figma", "UI/UX", "Framer", "React"],
    available: true,
    online: true,
    wins: 1,
    competed: true,
    fit: 91,
    reason: "Adds Figma and Framer to your stack",
    lastActive: "Online now",
  },
  {
    id: "b-dev",
    name: "Dev Malhotra",
    college: "BITS Pilani",
    year: "4th year",
    skills: ["Flutter", "Firebase", "Kotlin", "Figma"],
    available: true,
    online: false,
    wins: 0,
    competed: true,
    fit: 88,
    reason: "Adds Flutter and Firebase to your stack",
    lastActive: "Active 2h ago",
  },
  {
    id: "b-sara",
    name: "Sara Qureshi",
    college: "NIT Trichy",
    year: "2nd year",
    skills: ["Python", "PyTorch", "FastAPI", "ML"],
    available: true,
    online: true,
    wins: 0,
    competed: true,
    fit: 84,
    reason: "Adds PyTorch and FastAPI to your stack",
    lastActive: "Online now",
  },
  {
    id: "b-arjun",
    name: "Arjun Nair",
    college: "VIT Vellore",
    year: "2nd year",
    skills: ["Go", "PostgreSQL", "Docker", "React"],
    available: false,
    online: false,
    wins: 2,
    competed: true,
    fit: 76,
    reason: "Also builds with React",
    lastActive: "Active 1d ago",
  },
  {
    id: "b-priya",
    name: "Priya Kulkarni",
    college: "COEP Pune",
    year: "3rd year",
    skills: ["ML", "Python", "Flutter", "Figma"],
    available: true,
    online: false,
    wins: 1,
    competed: true,
    fit: 81,
    reason: "Adds ML and Flutter to your stack",
    lastActive: "Active 5h ago",
  },
];

/** Filter chips offered in the discovery preview. */
export const DISCOVERY_SKILLS = ["Figma", "Flutter", "Python", "ML", "React"];

export const EXAMPLE_TEAM = {
  name: "Null Pointers",
  event: "Smart India Hackathon 2026",
  eventShort: "SIH 2026",
  idea: "Attendance from existing CCTV, no new hardware",
  maxMembers: 6,
  skills: ["React", "Python", "PostgreSQL", "Figma", "Flutter"],
};

export type RosterMember = { id: string; name: string; role: "Owner" | "Member"; projectRole: string; skills: string[] };

export const EXAMPLE_ROSTER: RosterMember[] = [
  { id: "m-ananya", name: "Ananya Rao", role: "Owner", projectRole: "Frontend", skills: ["React"] },
  { id: "m-sara", name: "Sara Qureshi", role: "Member", projectRole: "ML", skills: ["Python"] },
  { id: "m-kabir", name: "Kabir Menon", role: "Member", projectRole: "Backend", skills: ["PostgreSQL"] },
  { id: "m-meera", name: "Meera Iyer", role: "Member", projectRole: "Design", skills: ["Figma"] },
];

export const JOINING_MEMBER: RosterMember = {
  id: "m-dev",
  name: "Dev Malhotra",
  role: "Member",
  projectRole: "Mobile",
  skills: ["Flutter"],
};

/** Starting point of the example event clock (it ticks down on the page). */
export const EXAMPLE_COUNTDOWN_SECONDS = 12 * 86400 + 7 * 3600 + 41 * 60 + 9;

export function splitCountdown(total: number) {
  const t = Math.max(0, total);
  return {
    days: Math.floor(t / 86400),
    hours: Math.floor((t % 86400) / 3600),
    minutes: Math.floor((t % 3600) / 60),
    seconds: t % 60,
  };
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
