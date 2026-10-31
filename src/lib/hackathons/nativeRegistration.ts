import type { SupabaseClient } from "@supabase/supabase-js";
import { nativeRegistrationRestriction, registrationState } from "./lifecycle";
import { loadEventRegistrationCounts } from "./eventParticipation";
import { loadPublicEvent } from "./publicBrowsing";

export class RegistrationError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

/** Runs with the verified caller's RLS context, never service-role authority. */
export async function registerNativeEvent(client: SupabaseClient, eventId: string, teamId: string | null, reviewedUnknown: boolean, clock = Date.now) {
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError) console.error("Native registration identity failed:", authError);
  if (authError || !user || !user.email || user.is_anonymous) throw new RegistrationError("Sign in to register.", 401);
  const { data: profile, error: profileError } = await client.from("profiles").select("id,is_banned,onboarding_completed").eq("id", user.id).maybeSingle();
  if (profileError) { console.error("Native registration profile failed:", profileError); throw new RegistrationError("Account verification is unavailable.", 503); }
  if (!profile || profile.id !== user.id || profile.is_banned !== false || profile.onboarding_completed !== true) throw new RegistrationError("An active, completed profile is required.", 403);
  const readEvent = async () => {
    const event = await loadPublicEvent(client, eventId);
    if (!event || event.type !== "native") throw new RegistrationError("This native event is unavailable.", 404);
    const restriction = nativeRegistrationRestriction(event, clock());
    if (restriction) throw new RegistrationError(restriction);
    if (registrationState(event, clock()) === "unknown" && !reviewedUnknown) throw new RegistrationError("Review the unverified registration availability before submitting.");
    return event;
  };
  const event = await readEvent();
  const { data: existing, error: ownError } = await client.from("hackathon_registrations").select("id,status")
    .eq("hackathon_id", eventId).eq("user_id", user.id).maybeSingle();
  if (ownError) { console.error("Native registration lookup failed:", ownError); throw new RegistrationError("Participation could not be verified.", 503); }
  if (existing) return { status: existing.status, alreadyRegistered: true };
  let size = 1;
  if (teamId) {
    const { data: team, error: teamError } = await client.from("teams").select("id,owner_id").eq("id", teamId).maybeSingle();
    if (teamError) { console.error("Native registration team lookup failed:", teamError); throw new RegistrationError("Team could not be verified.", 503); }
    if (!team || team.owner_id !== user.id) throw new RegistrationError("Only a team owner can register that team.", 403);
    const { count, error } = await client.from("team_members").select("id", { count: "exact", head: true }).eq("team_id", teamId);
    if (error) { console.error("Native registration team size failed:", error); throw new RegistrationError("Team size could not be verified.", 503); }
    if (count === null || !Number.isSafeInteger(count) || count < 1) throw new RegistrationError("Team size could not be verified.", 503);
    size = count;
  }
  const checkSize = (current: typeof event) => {
    if ((current.min_team_size != null && size < current.min_team_size) || (current.max_team_size != null && size > current.max_team_size)) throw new RegistrationError("Your selected participation does not meet the listed team-size requirements.");
  };
  checkSize(event);
  const totals = await loadEventRegistrationCounts(client, eventId);
  // Re-read restrictions after asynchronous identity/team/count checks; never trust the dialog's snapshot.
  const current = await readEvent();
  checkSize(current);
  const status = current.max_participants != null && totals.confirmed_count >= current.max_participants ? "waitlisted" : "confirmed";
  const { error } = await client.from("hackathon_registrations").insert({ hackathon_id: eventId, user_id: user.id, team_id: teamId, status });
  if (error) { console.error("Native registration insert failed:", error); throw new RegistrationError(error.code === "23505" ? "You are already registered. Reload your participation." : "Registration could not be saved.", error.code === "23505" ? 409 : 503); }
  return { status, alreadyRegistered: false };
}
