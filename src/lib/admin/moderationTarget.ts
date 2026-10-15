import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const MODERATION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOUNDER_EMAIL = "yashshah7117@gmail.com";
export class ModerationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function moderationFailure(error: unknown) {
  if (!(error instanceof ModerationError)) console.error("[admin/moderation] Operation failed:", error);
  return NextResponse.json({ success: false, error: error instanceof ModerationError ? error.message : "Unable to confirm the action. Refresh before retrying." },
    { status: error instanceof ModerationError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } });
}

export async function moderationTarget(client: SupabaseClient, actorId: string, input: unknown) {
  if (typeof input !== "string" || !MODERATION_UUID.test(input)) throw new ModerationError(400, "A valid user ID is required.");
  const id = input.toLowerCase();
  if (id === actorId.toLowerCase()) throw new ModerationError(403, "You cannot moderate your own account.");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new ModerationError(503, "Account verification is temporarily unavailable.");
  const auth = await client.auth.admin.getUserById(id);
  if (auth.error) {
    console.error("[admin/moderation] Target identity lookup failed:", auth.error);
    throw new ModerationError(auth.error.status === 404 ? 404 : 500, "Unable to verify the target account.");
  }
  if (!auth.data.user) throw new ModerationError(404, "Target account not found.");
  if (auth.data.user.id !== id || !auth.data.user.email) throw new ModerationError(403, "Unable to verify the target account.");
  const result = await client.from("profiles").select("id, role, is_banned, email, full_name, updated_at").eq("id", id).maybeSingle();
  if (result.error) {
    console.error("[admin/moderation] Target profile lookup failed:", result.error);
    throw new ModerationError(500, "Unable to verify the target account.");
  }
  const profile = result.data;
  if (!profile) throw new ModerationError(404, "Target profile not found.");
  if (profile.id !== id || typeof profile.is_banned !== "boolean") throw new ModerationError(403, "Unable to verify the target account.");
  if (profile.role !== "user" || [auth.data.user.email, profile.email].some(email => typeof email === "string" && email.trim().toLowerCase() === FOUNDER_EMAIL)) {
    throw new ModerationError(403, "Protected administrator accounts cannot be moderated here.");
  }
  return { id, profile, email: auth.data.user.email, emailConfirmed: Boolean(auth.data.user.email_confirmed_at) };
}
