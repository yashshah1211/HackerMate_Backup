import type { SupabaseClient } from "@supabase/supabase-js";

export type SquadStatus = "ready" | "full" | "closed" | "needs_capacity" | "profile_incomplete";
export type SquadContext = {
  teamId: string; teamName: string; status: SquadStatus; canInvite: boolean;
  memberCount: number; capacity: number | null; teamCapacity: number | null; eventCapacity: number | null;
  rolesNeeded: string[]; requiredSkills: string[]; coveredSkills: string[]; gapSkills: string[];
};
export type SquadCandidate = {
  id: string; fullName: string | null; avatarUrl: string | null; bio: string | null;
  skills: string[]; isAvailable: boolean | null; matchedRole: string | null;
  matchedSkills: string[]; addedSkills: string[]; reasons: string[]; limitedEvidence: boolean;
  fitKind: "role_match" | "skill_gap" | "complementary" | "explore";
};
export type SquadRecommendations = { context: SquadContext; candidates: SquadCandidate[]; scoreVersion: "squad-v1" };
const textOrNull = (value: unknown): string | null => typeof value === "string" ? value : null;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((s): s is string => typeof s === "string") : [];
const countOrNull = (value: unknown): number | null => typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
const statuses: SquadStatus[] = ["ready", "full", "closed", "needs_capacity", "profile_incomplete"];
const fitKinds: SquadCandidate["fitKind"][] = ["role_match", "skill_gap", "complementary", "explore"];

// Explicit projection keeps accidental/private RPC additions out of the browser view model.
export function parseSquadRecommendations(value: unknown, teamId: string): SquadRecommendations {
  if (!value || typeof value !== "object") throw new Error("Invalid squad response");
  const raw = value as Record<string, unknown>;
  const c = raw.context as Record<string, unknown> | undefined;
  if (!c || c.teamId !== teamId || !statuses.includes(c.status as SquadStatus)
    || typeof c.memberCount !== "number" || !Number.isInteger(c.memberCount) || c.memberCount < 1
    || typeof c.canInvite !== "boolean" || raw.scoreVersion !== "squad-v1" || !Array.isArray(raw.candidates)) throw new Error("Invalid squad response");
  const context: SquadContext = {
    teamId, teamName: textOrNull(c.teamName) || "Your team", status: c.status as SquadStatus,
    canInvite: c.canInvite, memberCount: c.memberCount, capacity: countOrNull(c.capacity),
    teamCapacity: countOrNull(c.teamCapacity), eventCapacity: countOrNull(c.eventCapacity),
    rolesNeeded: strings(c.rolesNeeded), requiredSkills: strings(c.requiredSkills),
    coveredSkills: strings(c.coveredSkills), gapSkills: strings(c.gapSkills),
  };
  if (context.status === "ready" && (!context.capacity || context.memberCount >= context.capacity)) throw new Error("Invalid squad capacity");
  const candidates: SquadCandidate[] = raw.candidates.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid squad candidate");
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || !fitKinds.includes(r.fitKind as SquadCandidate["fitKind"])) throw new Error("Invalid squad candidate");
    return {
      id: r.id, fullName: textOrNull(r.fullName), avatarUrl: textOrNull(r.avatarUrl), bio: textOrNull(r.bio),
      skills: strings(r.skills), isAvailable: typeof r.isAvailable === "boolean" ? r.isAvailable : null,
      matchedRole: textOrNull(r.matchedRole), matchedSkills: strings(r.matchedSkills), addedSkills: strings(r.addedSkills),
      reasons: strings(r.reasons), limitedEvidence: r.limitedEvidence !== false, fitKind: r.fitKind as SquadCandidate["fitKind"],
    };
  });
  return { context, candidates: context.status === "ready" ? candidates : [], scoreVersion: "squad-v1" };
}

export async function loadSquadRecommendations(client: SupabaseClient, teamId: string): Promise<SquadRecommendations> {
  const { data, error } = await client.rpc("get_team_builder_recommendations", { p_team_id: teamId, p_limit: 8 });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") throw new Error("Squad suggestions are not available yet. You can still browse builders.");
    if (error.code === "42501") throw new Error("Only eligible team members can view these suggestions.");
    throw new Error("Could not load squad suggestions. Try again.");
  }
  return parseSquadRecommendations(data, teamId);
}

export async function sendSquadInvite(client: SupabaseClient, teamId: string, candidateId: string): Promise<void> {
  // Rechecks eligibility and delegates to the existing owner-authorized send_team_invite RPC.
  const { error } = await client.rpc("send_squad_invite", { p_team_id: teamId, p_invited_user_id: candidateId });
  if (error) throw new Error("The invite could not be sent. Refresh suggestions; the team or builder may no longer be available.");
}

export const squadStatusCopy: Record<Exclude<SquadStatus, "ready">, { title: string; body: string }> = {
  full: { title: "All seats are filled", body: "The roster has reached the team's recorded capacity or an event maximum." },
  closed: { title: "Recruiting is paused", body: "The team owner can reopen recruiting in team settings." },
  needs_capacity: { title: "Set your team capacity", body: "Add a team capacity in settings so suggestions respect the number of available seats." },
  profile_incomplete: { title: "Complete your profile", body: "Finish onboarding to see teammate suggestions. Missing skills can be added later." },
};

export function squadFitLabel(candidate: SquadCandidate): string {
  if (candidate.limitedEvidence) return "Explore profile";
  return { role_match: "Relevant role skills", skill_gap: "Fills a skill gap", complementary: "Adds complementary skills", explore: "Explore profile" }[candidate.fitKind];
}
