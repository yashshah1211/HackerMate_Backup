import type { SupabaseClient } from "@supabase/supabase-js";

// Person-to-person matching remains separate from squad role-fit recommendations.
// Both discovery surfaces use the same engine, limit and missing-function fallback.
export async function loadTeammateRecommendations(client: SupabaseClient, userId: string) {
  const args = { p_user_id: userId, p_limit: 50 };
  const v3 = await client.rpc("get_recommended_teammates_v3", args);
  if (v3.error && (v3.error.code === "PGRST202" || v3.error.code === "42883"
    || v3.error.message?.includes("Could not find the function")
    || v3.error.message?.includes("function get_recommended_teammates_v3 does not exist"))) {
    const v2 = await client.rpc("get_recommended_teammates", args);
    return { data: v2.data, error: v2.error, matchEngine: "v2" as const };
  }
  return { data: v3.data, error: v3.error, matchEngine: "v3" as const };
}

export function compareRecommendationRanks(
  a: { compatibility: number; rank?: number } | undefined,
  b: { compatibility: number; rank?: number } | undefined,
): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  // Rounded display scores can tie even when server ranking differs. Keep that ranking.
  if (typeof a.rank === "number" && typeof b.rank === "number") return a.rank - b.rank;
  return b.compatibility - a.compatibility;
}
