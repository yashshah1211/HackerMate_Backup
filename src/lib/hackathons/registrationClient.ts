import type { SupabaseClient } from "@supabase/supabase-js";

export async function submitNativeRegistration(client: SupabaseClient, eventId: string, teamId: string | null, reviewedUnknown: boolean, expectedUserId: string) {
  const { data, error } = await client.auth.getSession();
  if (error) { console.error("Registration session failed:", error); throw new Error("Sign in again before registering."); }
  if (data.session?.user?.id !== expectedUserId) throw new Error("Your account changed. Reload before registering.");
  if (!data.session?.access_token) throw new Error("Sign in again before registering.");
  const response = await fetch(`/api/hackathons/${encodeURIComponent(eventId)}/register`, { method: "POST",
    headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, reviewedUnknown }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Registration could not be verified.");
  if (!["confirmed", "waitlisted"].includes(result.status)) throw new Error("Registration returned an invalid result.");
  return result as { status: "confirmed" | "waitlisted"; alreadyRegistered: boolean };
}
