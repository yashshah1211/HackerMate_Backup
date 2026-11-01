import type { SupabaseClient } from "@supabase/supabase-js";
import { WriterBudget, WriterError, nativeResult, writerFailure } from "@/lib/writers";

export async function submitNativeRegistration(client: SupabaseClient, eventId: string, teamId: string | null, reviewedUnknown: boolean, expectedUserId: string, budget = new WriterBudget()) {
  try {
  const { data, error } = await budget.run(() => client.auth.getSession());
  if (error) { console.error("Registration session failed:", error); throw new WriterError("Sign in again before registering.", 401); }
  if (data.session?.user?.id !== expectedUserId) throw new WriterError("Your account changed. Reload before registering.", 401);
  if (!data.session?.access_token) throw new Error("Sign in again before registering.");
  const response = await budget.run(() => fetch(`/api/hackathons/${encodeURIComponent(eventId)}/register`, { method: "POST",
    headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, reviewedUnknown }), signal: budget.signal }));
  const result = await budget.run(() => response.json());
  if (!response.ok) throw new WriterError(typeof result?.error === "string" ? result.error : "Registration could not be verified. Refresh before trying again.", response.status, result?.retryable === true, result?.outcomeUnknown === true);
  const current = await budget.run(() => client.auth.getSession());
  if (current.error) console.error("Registration confirmation session failed:", current.error);
  if (current.error || current.data.session?.user.id !== expectedUserId) throw new WriterError("Your account changed. Refresh to verify participation.", 409, false, true);
  return nativeResult(result);
  } catch (error) { console.error("Registration request failed:", error); throw writerFailure(error); }
}
