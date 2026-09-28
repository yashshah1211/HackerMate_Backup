import { SIH_HACKATHON_ID } from "@/lib/constants";

export type TeamCategory = "sih" | "project" | "hackathon";

type HackathonRef = { id?: string; name?: string; type?: string | null; tags?: string[] | null } | null;

/**
 * Classifies a team by the event it targets. Moved verbatim (logic-wise) from
 * the V1 dashboard so every surface labels teams the same way.
 */
export function getTeamCategoryInfo(team: {
  hackathon_id?: string | null;
  hackathons?: HackathonRef;
  team_hackathons?: { hackathon_id: string; hackathons: HackathonRef }[];
}): {
  category: TeamCategory;
  tag: "SIH" | "PROJECT" | "HACKATHON";
  eventName: string;
} {
  const hackathon = team.team_hackathons?.[0]?.hackathons || team.hackathons;
  const targetHackathonId = team.team_hackathons?.[0]?.hackathon_id || team.hackathon_id;

  // 1. Exact relational UUID check for SIH
  if (targetHackathonId === SIH_HACKATHON_ID || hackathon?.id === SIH_HACKATHON_ID) {
    return {
      category: "sih",
      tag: "SIH",
      eventName: hackathon?.name || "Smart India Hackathon 2026 (SIH internal round)",
    };
  }

  // 2. Relational hackathon.type check
  if (hackathon?.type) {
    if (hackathon.type === "external" || hackathon.type === "partner") {
      return { category: "hackathon", tag: "HACKATHON", eventName: hackathon.name || "External Hackathon" };
    }
    if (hackathon.type === "native") {
      return { category: "project", tag: "PROJECT", eventName: hackathon.name || "Active project" };
    }
  }

  // 3. No hackathon linked = independent project
  if (!targetHackathonId && !hackathon) {
    return { category: "project", tag: "PROJECT", eventName: "Active project" };
  }

  // 4. Last-resort fallback when the record lacks both id and type
  const hackName = hackathon?.name || "";
  if (/smart india hackathon|sih/i.test(hackName) || hackathon?.tags?.some((t) => /sih/i.test(t))) {
    return { category: "sih", tag: "SIH", eventName: hackName || "Smart India Hackathon 2026" };
  }

  return { category: "hackathon", tag: "HACKATHON", eventName: hackName || "Hackathon" };
}

/** Maps a team category onto the V2 tape/mark tone. */
export const CATEGORY_TONE: Record<TeamCategory, "sih" | "hack" | "proj"> = {
  sih: "sih",
  hackathon: "hack",
  project: "proj",
};
