import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { ModerationError, moderationFailure, moderationTarget } from "@/lib/admin/moderationTarget";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["userId", "is_banned"].includes(key)) ||
      !("userId" in body) || !("is_banned" in body) || typeof body.is_banned !== "boolean") {
      throw new ModerationError(400, "A user ID and boolean ban state are required.");
    }
    const target = await moderationTarget(auth.supabaseAdmin, auth.user.id, body.userId);
    const desired = body.is_banned;
    if (target.profile.is_banned === desired) return NextResponse.json({ success: true, changed: false, userId: target.id, is_banned: desired },
      { headers: { "Cache-Control": "private, no-store" } });
    // Compare the verified snapshot: a concurrent promotion, ban or profile
    // update must never be overwritten by this service-role operation.
    let update = auth.supabaseAdmin.from("profiles").update({ is_banned: desired }).eq("id", target.id)
      .eq("role", "user").eq("is_banned", target.profile.is_banned);
    for (const key of ["email", "updated_at"] as const) update = target.profile[key] == null ? update.is(key, null) : update.eq(key, target.profile[key]);
    const result = await update.select("id, role, is_banned").maybeSingle();
    if (result.error) {
      console.error("[admin/ban-user] Conditional update failed:", result.error);
      throw new ModerationError(result.error.code === "42501" ? 403 : 500, "Unable to confirm ban status. Refresh before retrying.");
    }
    if (!result.data) throw new ModerationError(409, "Account changed or is no longer available. Refresh before retrying.");
    if (result.data.id !== target.id || result.data.role !== "user" || result.data.is_banned !== desired) throw new ModerationError(500, "Unable to confirm ban status. Refresh before retrying.");
    return NextResponse.json({ success: true, changed: true, userId: target.id, is_banned: desired }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return moderationFailure(error); }
}
