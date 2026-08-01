export interface ProfileMatchData {
  id?: string;
  full_name?: string | null;
  skills?: string[] | null;
  bio?: string | null;
  college?: string | null;
  hackathon_wins?: number | null;
  has_participated_hackathon?: boolean | null;
  hackathon_participations?: number | null;
}

const FRONTEND_SKILLS = new Set([
  "react", "react.js", "reactjs", "next.js", "nextjs", "vue", "vue.js", "vuejs",
  "svelte", "angular", "html", "css", "tailwind", "tailwind css", "tailwindcss",
  "ui/ux", "figma", "frontend", "flutter", "react native", "swift", "kotlin",
  "android", "web design", "javascript", "typescript"
]);

const BACKEND_SKILLS = new Set([
  "node", "node.js", "nodejs", "express", "express.js", "expressjs", "python",
  "django", "flask", "fastapi", "postgresql", "postgres", "mongodb", "mongo",
  "supabase", "firebase", "sql", "go", "golang", "java", "spring boot", "c++",
  "docker", "aws", "gcp", "backend", "graphql", "rest api", "redis", "prisma"
]);

const ML_AI_SKILLS = new Set([
  "python", "pytorch", "tensorflow", "scikit-learn", "sklearn", "machine learning",
  "deep learning", "ai", "openai", "langchain", "nlp", "computer vision", "pandas",
  "numpy", "data science", "llm"
]);

const VARIATIONS_3_SHARED = [
  "ideal tech stack alignment for rapid hackathon builds",
  "excellent shared foundation for fast project execution",
  "great tech stack harmony for hackathon sprints",
  "covers key core requirements for a high-velocity team",
  "strong core tech synergy to hit the ground running",
  "solid overlap for end-to-end hackathon MVP delivery",
  "highly compatible toolkit for building complex features",
  "seamless workflow alignment for fast-paced builds",
  "great technical synergy for turning ideas into working code",
  "gives your team immediate momentum during hackathons",
  "provides a unified stack with zero setup friction",
  "combines strong core proficiency across your build pipeline",
  "perfect skill alignment for quick architectural decisions",
  "brings proven overlap across key development tools",
  "gives your hackathon team a major head start on build day"
];

const VARIATIONS_2_SHARED = [
  "great combination for building out features together",
  "strong baseline overlap for smooth collaboration",
  "complements your team's core technical toolkit",
  "solid foundation for rapid hackathon prototyping",
  "excellent pair for building full-featured hackathon projects",
  "brings valuable skill depth to your project stack",
  "accelerates project setup and feature implementation",
  "well-suited for cross-functional hackathon builds",
  "provides a reliable technical bridge between frontend and backend",
  "helps streamline feature distribution across the team",
  "strong dual-stack synergy for fast team sprints",
  "boosts overall build speed and feature execution"
];

function getFirstName(fullName?: string | null, fallback: string = "Builder"): string {
  if (!fullName || !fullName.trim()) return fallback;
  return fullName.trim().split(" ")[0];
}

function getVariation(seed: string, list: string[]): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return list[Math.abs(hash) % list.length];
}

/**
 * Deterministically generates a 1-2 sentence "Why this match" blurb between two profiles.
 * Pure logic — zero external API calls, 0 cost.
 */
export function generateMatchReasoning(
  userA: ProfileMatchData | null | undefined,
  userB: ProfileMatchData | null | undefined,
  isSelfViewer: boolean = true,
  matchScore?: number,
  minThreshold: number = 50
): string {
  if (!userB) return "";

  // Hide blurb if match score is below minimum threshold (e.g. < 50%)
  if (matchScore !== undefined && matchScore < minThreshold) {
    return "";
  }

  const nameA = isSelfViewer ? "You" : getFirstName(userA?.full_name, "Builder A");
  const nameAPossessiveStart = isSelfViewer ? "Your" : `${nameA}'s`;
  const nameAPossessiveMid = isSelfViewer ? "your" : `${nameA}'s`;
  const nameB = getFirstName(userB.full_name, "This builder");
  const nameBPossessive = `${nameB}'s`;

  const skillsA = (userA?.skills || []).map(s => s.trim());
  const skillsB = (userB?.skills || []).map(s => s.trim());

  const skillsALower = skillsA.map(s => s.toLowerCase());
  const skillsBLower = skillsB.map(s => s.toLowerCase());

  // Find shared skills (case-preserving from B or A)
  const sharedSkills: string[] = [];
  skillsA.forEach(s => {
    const sLower = s.toLowerCase();
    if (skillsBLower.includes(sLower) && !sharedSkills.some(existing => existing.toLowerCase() === sLower)) {
      sharedSkills.push(s);
    }
  });

  // College check
  const collegeA = userA?.college?.trim().toLowerCase() || "";
  const collegeB = userB?.college?.trim().toLowerCase() || "";
  const isSameCollege = Boolean(collegeA && collegeB && collegeA === collegeB);
  const collegeBonus = isSameCollege ? ` Plus, both are from ${userB.college?.trim()}.` : "";

  const seedKey = userB?.id || userB?.full_name || nameB;

  // 1. Strong Overlap (3+ shared skills)
  if (sharedSkills.length >= 3) {
    const s1 = sharedSkills[0];
    const s2 = sharedSkills[1];
    const s3 = sharedSkills[2];
    const uniqueB = skillsB.find(s => !sharedSkills.some(sh => sh.toLowerCase() === s.toLowerCase()));
    const variation = getVariation(seedKey + "_3", VARIATIONS_3_SHARED);

    if (uniqueB) {
      return `Both know ${s1}, ${s2}, and ${s3}, with ${nameB} also bringing ${uniqueB} expertise — ${variation}.${collegeBonus}`;
    }
    return `Both know ${s1}, ${s2}, and ${s3} — ${variation}.${collegeBonus}`;
  }

  // 1b. 2 Shared Skills (Varied using unique skills to prevent duplicate blurbs across profiles)
  if (sharedSkills.length === 2) {
    const s1 = sharedSkills[0];
    const s2 = sharedSkills[1];

    const uniqueB = skillsB.find(s => !sharedSkills.some(sh => sh.toLowerCase() === s.toLowerCase()));
    const uniqueA = skillsA.find(s => !sharedSkills.some(sh => sh.toLowerCase() === s.toLowerCase()));
    const variation = getVariation(seedKey + "_2", VARIATIONS_2_SHARED);

    if (uniqueB) {
      return `Both know ${s1} and ${s2}, with ${nameB} also bringing ${uniqueB} expertise — ${variation}.${collegeBonus}`;
    }
    if (uniqueA) {
      return `Both build with ${s1} and ${s2}, paired with ${nameAPossessiveMid} ${uniqueA} background — ${variation}.${collegeBonus}`;
    }
    return `Both know ${s1} and ${s2} — ${variation}.${collegeBonus}`;
  }

  // 2. Single shared skill + complementary skills
  if (sharedSkills.length === 1) {
    const shared = sharedSkills[0];
    const uniqueA = skillsA.find(s => s.toLowerCase() !== shared.toLowerCase());
    const uniqueB = skillsB.find(s => s.toLowerCase() !== shared.toLowerCase());

    if (uniqueA && uniqueB) {
      return `Both list ${shared}, combining ${nameAPossessiveMid} ${uniqueA} with ${nameBPossessive} ${uniqueB} skills.${collegeBonus}`;
    }
    return `Shared foundation in ${shared} — great base for collaborating on build ideas.${collegeBonus}`;
  }

  // 3. Complementary Full-Stack / ML pairing (0 shared skills)
  const frontendA = skillsA.filter(s => FRONTEND_SKILLS.has(s.toLowerCase()));
  const backendA = skillsA.filter(s => BACKEND_SKILLS.has(s.toLowerCase()) || ML_AI_SKILLS.has(s.toLowerCase()));
  
  const frontendB = skillsB.filter(s => FRONTEND_SKILLS.has(s.toLowerCase()));
  const backendB = skillsB.filter(s => BACKEND_SKILLS.has(s.toLowerCase()) || ML_AI_SKILLS.has(s.toLowerCase()));

  // Case A: User A is Frontend, User B is Backend/ML
  if (frontendA.length > 0 && backendB.length > 0 && frontendB.length === 0) {
    const feSkill = frontendA[0];
    const beSkill = backendB[0];
    return `${nameAPossessiveStart} ${feSkill} skills and ${nameBPossessive} ${beSkill} background cover a full-stack team.${collegeBonus}`;
  }

  // Case B: User B is Frontend, User A is Backend/ML
  if (backendA.length > 0 && frontendB.length > 0 && frontendA.length === 0) {
    const beSkill = backendA[0];
    const feSkill = frontendB[0];
    return `${nameBPossessive} ${feSkill} expertise complements ${nameAPossessiveMid} ${beSkill} backend experience for full-stack coverage.${collegeBonus}`;
  }

  // Case C: General complementary stack
  if (skillsA.length > 0 && skillsB.length > 0) {
    const topA = skillsA[0];
    const topB = skillsB[0];
    return `${nameA} (${topA}) and ${nameB} (${topB}) bring complementary tech stacks for cross-functional builds.${collegeBonus}`;
  }

  // 4. Hackathon Experience Match
  const winsA = userA?.hackathon_wins || 0;
  const winsB = userB?.hackathon_wins || 0;
  const partA = userA?.has_participated_hackathon || (userA?.hackathon_participations || 0) > 0;
  const partB = userB?.has_participated_hackathon || (userB?.hackathon_participations || 0) > 0;

  if (winsA > 0 && winsB > 0) {
    return `Both are proven hackathon winners, combining competitive event experience.${collegeBonus}`;
  }
  if (partA && partB) {
    return `Both are active hackathon contenders, ready to jump straight into team building.${collegeBonus}`;
  }

  // 5. Same College fallback
  if (isSameCollege) {
    return `Both attend ${userB.college?.trim()}, making local hackathon team coordination seamless.`;
  }

  // 6. Generic specific fallback
  if (skillsB.length > 0) {
    return `${nameB} brings specialized skills in ${skillsB.slice(0, 2).join(" and ")}, adding versatility to your squad.`;
  }

  return `${nameB}'s profile adds valuable capacity and team availability to your builder network.`;
}
