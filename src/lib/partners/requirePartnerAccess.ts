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
  target: PartnerAccessTarget,
  options: { detailedErrors?: boolean } = {}
): Promise<PartnerAccessResult | NextResponse> {
  function failure(status: 403 | 404 | 500, operation?: string, code?: string): NextResponse {
    if (operation) console.error("[requirePartnerAccess] Lookup failed", { operation, code });
    if (!options.detailedErrors) return denied();
    const error = status === 404 ? "Partner event not found." : status === 500
      ? "Unable to load partner access." : "Forbidden: Unable to verify event access.";
    return NextResponse.json({ error }, { status });
  }
  try {
    const authorization = await requireVerifiedProfile(req, options.detailedErrors
      ? { unauthenticatedStatus: 401, lookupFailureStatus: 500 } : {});
    if (authorization instanceof NextResponse) return options.detailedErrors ? authorization : denied();
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
      if (typeof slug !== "string" || slug.length > 100 || !SLUG.test(slug)) return failure(404);
      const { data: partner, error } = await supabaseUserClient
        .from("partner_configs")
        .select("id, hackathon_id")
        .eq("slug", slug)
        .maybeSingle();
      if (error) return failure(500, "partner_configs", error.code);
      if (!partner || typeof partner.id !== "string" || !UUID.test(partner.id)) return failure(404);
      hackathonId = partner.hackathon_id;
      partnerId = partner.id;
    } else {
      hackathonId = target.hackathonId;
    }
    if (typeof hackathonId !== "string" || !UUID.test(hackathonId)) return failure(404);
    hackathonId = hackathonId.toLowerCase();

    const { data: event, error: eventError } = await supabaseUserClient
      .from("hackathons")
      .select("id")
      .eq("id", hackathonId)
      .maybeSingle();
    if (eventError) return failure(500, "hackathons", eventError.code);
    if (!event || event.id !== hackathonId) return failure(404);

    // The SQL predicate rechecks the current profile and event assignment with
    // the caller's JWT. Missing migration, RPC errors and unknown results deny.
    const { data: allowed, error: accessError } = await supabaseUserClient.rpc(
      "can_access_partner_event",
      { p_hackathon_id: event.id }
    );
    if (accessError) return failure(accessError.code === "42501" ? 403 : 500, "can_access_partner_event", accessError.code);
    if (allowed !== true) return denied();

    return { userId: user.id, hackathonId: event.id, partnerId, supabaseUserClient };
  } catch (error) {
    // Avoid logging database payloads or identity fields in private API failures.
    if (options.detailedErrors) return failure(500, "unexpected");
    console.error("[requirePartnerAccess] Event authorization failed:", error);
    return denied();
  }
}
