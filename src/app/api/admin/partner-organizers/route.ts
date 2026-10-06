import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { accountId, dbFailure, existingEvent, failure, PartnerAdminError, query, readBody, reply, privateDenial } from "@/lib/admin/partnerManagement";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return privateDenial(auth);
    const eventId = accountId(query(req, ["eventId"]).get("eventId"));
    await existingEvent(auth.supabaseAdmin, eventId);
    const rows: { user_id: string; created_at: string }[] = [], ids = new Set<string>();
    for (let offset = 0; offset <= 10_000; offset += 500) {
      const result = await auth.supabaseUserClient.from("event_organizers").select("user_id, created_at").eq("hackathon_id", eventId).order("user_id").range(offset, offset + 499);
      if (result.error) dbFailure(result.error, "Unable to load organizer assignments.");
      for (const row of result.data || []) {
        if (ids.has(row.user_id)) throw new PartnerAdminError(409, "Organizer assignments changed. Please reload.");
        ids.add(row.user_id); rows.push(row);
      }
      if (rows.length > 10_000) throw new PartnerAdminError(413, "The organizer list exceeds the management limit.");
      if ((result.data || []).length < 500) break;
    }
    const profiles = new Map<string, string | null>();
    for (let offset = 0; offset < rows.length; offset += 100) {
      const names = await auth.supabaseAdmin.from("profiles").select("id, full_name").in("id", rows.slice(offset, offset + 100).map(row => row.user_id));
      if (names.error) dbFailure(names.error, "Unable to load organizer account names.");
      for (const profile of names.data || []) profiles.set(profile.id, profile.full_name);
    }
    return reply({ eventId, organizers: rows.map(row => ({ user_id: row.user_id, created_at: row.created_at, full_name: profiles.get(row.user_id) || null })) });
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return privateDenial(auth);
    query(req, []);
    const body = await readBody(req, ["eventId", "userId"]);
    const eventId = accountId(body.eventId), userId = accountId(body.userId, "Account");
    await existingEvent(auth.supabaseAdmin, eventId);
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new PartnerAdminError(503, "Account verification is temporarily unavailable.");
    const target = await auth.supabaseAdmin.auth.admin.getUserById(userId);
    if (target.error) {
      console.error("[admin/partners] Account verification failed:", target.error);
      throw new PartnerAdminError(target.error.status === 404 ? 404 : 500, "Unable to verify the existing account.");
    }
    if (!target.data.user || target.data.user.id.toLowerCase() !== userId || !target.data.user.email) throw new PartnerAdminError(404, "Existing account not found.");
    const profile = await auth.supabaseAdmin.from("profiles").select("id, role, is_banned").eq("id", userId).maybeSingle();
    if (profile.error) dbFailure(profile.error, "Unable to verify the account profile.");
    if (!profile.data || profile.data.id !== userId || profile.data.is_banned !== false) throw new PartnerAdminError(403, "The account needs an eligible, non-banned HackerMate profile.");
    if (profile.data.role === "admin" || target.data.user.email.trim().toLowerCase() === "yashshah7117@gmail.com") throw new PartnerAdminError(409, "HackerMate administrators already have organizer access; an assignment is unnecessary.");
    const result = await auth.supabaseUserClient.from("event_organizers").insert({ hackathon_id: eventId, user_id: userId, created_by: auth.user.id }).select("user_id, created_at").single();
    if (result.error?.code === "23505") throw new PartnerAdminError(409, "This account is already assigned to the event.");
    if (result.error || !result.data) dbFailure(result.error, "Unable to grant organizer access.");
    return reply({ eventId, organizer: { user_id: result.data.user_id, created_at: result.data.created_at } }, 201);
  } catch (error) { return failure(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return privateDenial(auth);
    query(req, []);
    const body = await readBody(req, ["eventId", "userId"]);
    const eventId = accountId(body.eventId), userId = accountId(body.userId, "Account");
    await existingEvent(auth.supabaseAdmin, eventId);
    const result = await auth.supabaseUserClient.from("event_organizers").delete().eq("hackathon_id", eventId).eq("user_id", userId).select("user_id");
    if (result.error) dbFailure(result.error, "Unable to revoke organizer access.");
    return reply({ eventId, userId, revoked: Boolean(result.data?.length) });
  } catch (error) { return failure(error); }
}
