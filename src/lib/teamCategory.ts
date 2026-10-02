

export type TeamCategory = "project" | "hackathon";

type HackathonRef = { id?: string; name?: string; type?: string | null; tags?: string[] | null } | null;

/**
 * Classifies a team by the event it targets. Moved verbatim (logic-wise) from
 * the V1 dashboard so every surface labels teams the same way.
 */
export function getTeamCategoryInfo(team: {
  hackathon_id?: string | null;
  hackathons?: HackathonRef;
  team_hackathons?: { hackathon_id?: string; hackathons: HackathonRef }[];
}): {
  category: TeamCategory;
  tag: "PROJECT" | "HACKATHON";
  eventName: string;
} {
  const hackathon = team.team_hackathons?.[0]?.hackathons || team.hackathons;
  const targetHackathonId = team.team_hackathons?.[0]?.hackathon_id || team.team_hackathons?.[0]?.hackathons?.id || team.hackathon_id;



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



  const hackName = hackathon?.name || "";
  return { category: "hackathon", tag: "HACKATHON", eventName: hackName || "Hackathon" };
}

/** Maps a team category onto the V2 tape/mark tone. */
export const CATEGORY_TONE: Record<TeamCategory, "hack" | "proj"> = {
  hackathon: "hack",
  project: "proj",
};
