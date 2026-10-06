import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedProfile } from "@/lib/admin/requireAdmin";
import type { PartnerAccessResult, PartnerAccessTarget } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function denied(): NextResponse {
  // Missing, inaccessible and invalid events deliberately share a response.
  return NextResponse.json({ error: "Forbidden: Unable to verify event access." }, { status: 403 });
}

/** Server authorization only; no dashboard data, service client or provisioning. */
export async function requirePartnerAccess(
  req: NextRequest,
  target: PartnerAccessTarget
): Promise<PartnerAccessResult | NextResponse> {
  try {
    const authorization = await requireVerifiedProfile(req);
    if (authorization instanceof NextResponse) return denied();
    const { user, supabaseUserClient } = authorization;

    // Reject ambiguous/spoofed inputs rather than resolving one supplied ID and
    // accidentally using another later. Authority always comes from auth.uid().
    if (!target || typeof target !== "object") return denied();
    const keys = Object.keys(target);
    if (keys.length !== 1 || !["partnerSlug", "hackathonId"].includes(keys[0])) return denied();

    let hackathonId: string;
    let partnerId: string | null = null;
    if ("partnerSlug" in target) {
      const slug = target.partnerSlug;
      if (typeof slug !== "string" || slug.length > 100 || !SLUG.test(slug)) return denied();
      const { data: partner, error } = await supabaseUserClient
        .from("partner_configs")
        .select("id, hackathon_id")
        .eq("slug", slug)
        .maybeSingle();
      if (error || !partner || typeof partner.id !== "string" || !UUID.test(partner.id)) return denied();
      hackathonId = partner.hackathon_id;
      partnerId = partner.id;
    } else {
      hackathonId = target.hackathonId;
    }
    if (typeof hackathonId !== "string" || !UUID.test(hackathonId)) return denied();
    hackathonId = hackathonId.toLowerCase();

    const { data: event, error: eventError } = await supabaseUserClient
      .from("hackathons")
      .select("id")
      .eq("id", hackathonId)
      .maybeSingle();
    if (eventError || !event || event.id !== hackathonId) return denied();

    // The SQL predicate rechecks the current profile and event assignment with
    // the caller's JWT. Missing migration, RPC errors and unknown results deny.
    const { data: allowed, error: accessError } = await supabaseUserClient.rpc(
      "can_access_partner_event",
      { p_hackathon_id: event.id }
    );
    if (accessError || allowed !== true) return denied();

    return { userId: user.id, hackathonId: event.id, partnerId, supabaseUserClient };
  } catch (error) {
    console.error("[requirePartnerAccess] Event authorization failed:", error);
    return denied();
  }
}
