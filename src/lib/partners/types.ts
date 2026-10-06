import type { SupabaseClient } from "@supabase/supabase-js";

// Both forms are resolved against the database; neither supplies caller identity.
export type PartnerAccessTarget =
  | { partnerSlug: string; hackathonId?: never }
  | { hackathonId: string; partnerSlug?: never };

export interface PartnerAccessResult {
  userId: string;
  hackathonId: string;
  partnerId: string | null;
  // Retains the verified caller's JWT for subsequent scoped RPCs.
  supabaseUserClient: SupabaseClient;
}
