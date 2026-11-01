import type { SupabaseClient } from "@supabase/supabase-js";

export const WRITER_TIMEOUT_MS = 12_000;
export class WriterError extends Error {
  constructor(message: string, public status = 503, public retryable = false, public outcomeUnknown = false) { super(message); }
}
/** One absolute budget spans authentication, reads, transport and confirmation.
 * A transport abort cannot prove that a remote transaction did not commit. */
export class WriterBudget {
  private readonly controller = new AbortController();
  readonly deadlineAt: number;
  readonly signal: AbortSignal;
  constructor(milliseconds = WRITER_TIMEOUT_MS, parent?: AbortSignal) {
    this.deadlineAt = Date.now() + milliseconds;
    this.signal = parent ? AbortSignal.any([this.controller.signal, parent]) : this.controller.signal;
  }
  check() {
    if (this.signal.aborted || Date.now() >= this.deadlineAt) { this.controller.abort(); throw new WriterError("The request timed out. Refresh to verify the outcome before trying again.", 504, false, true); }
  }
  async run<T>(work: () => PromiseLike<T>): Promise<T> {
    this.check();
    return new Promise<T>((resolve, reject) => {
      const abort = () => { cleanup(); this.controller.abort(); reject(new WriterError("The request timed out. Refresh to verify the outcome before trying again.", 504, false, true)); };
      const timer = setTimeout(abort, Math.max(1, this.deadlineAt - Date.now()));
      const cleanup = () => { clearTimeout(timer); this.signal.removeEventListener("abort", abort); };
      this.signal.addEventListener("abort", abort, { once: true });
      Promise.resolve().then(() => { this.check(); return work(); }).then(value => {
        try { this.check(); cleanup(); resolve(value); } catch (error) { cleanup(); reject(error); }
      }, error => { cleanup(); reject(error); });
    });
  }
  query<T>(work: () => PromiseLike<T> & { retry?: (enabled: boolean) => PromiseLike<T>; abortSignal?: (signal: AbortSignal) => PromiseLike<T> }) {
    return this.run(() => { let query = work(); if (query.retry) query = query.retry(false); return query.abortSignal ? query.abortSignal(this.signal) : query; });
  }
}

const rejections: Record<string, string> = {
  registration_closed: "Registration is closed.", registration_not_open: "Registration has not opened yet.",
  event_ended: "This event has ended.", event_unavailable: "This event is unavailable.",
  review_registration_required: "Review the unverified registration availability before submitting.",
  team_size_ineligible: "Your team does not meet the listed team-size requirements.",
  participation_changed_retry: "Participation changed. Refresh before trying again.",
};
export function writerFailure(error: unknown): WriterError {
  if (error instanceof WriterError) return error;
  const detail = error && typeof error === "object" ? error as { code?: string; message?: string } : {};
  if (["55P03", "40P01", "40001"].includes(detail.code || "")) return new WriterError("The change conflicted with another request. Refresh before trying again.", 503, true);
  if (detail.code === "57014") return new WriterError("The database request timed out and was rolled back. Refresh before trying again.", 504, true);
  if (detail.code === "42501") return new WriterError("You do not have permission to make this change.", 403);
  if (detail.code === "PGRST301") return new WriterError("Sign in again before continuing.", 401);
  if (["PGRST202", "PGRST203", "42883", "42703"].includes(detail.code || "")) return new WriterError("This change is temporarily unavailable. Refresh before trying again.");
  if (["22023", "22P02"].includes(detail.code || "")) return new WriterError("The change contains invalid input.", 400);
  if (detail.code === "P0002") return new WriterError("The requested record is unavailable.", 404);
  if (detail.code === "P0001") return detail.message === "new_admission_frozen"
    ? new WriterError("New registrations are temporarily paused. Please check again later.", 503, true)
    : new WriterError(rejections[detail.message || ""] || "The change was rejected. Refresh and check its requirements.", 409);
  if (["23503", "23505"].includes(detail.code || "")) return new WriterError("The record changed or has dependencies. Refresh before trying again.", 409);
  if (/^[A-Z0-9]{5}$/.test(detail.code || "")) return new WriterError("The database rejected the change. Refresh before trying again.", 500);
  return new WriterError("Couldn't verify the outcome. Refresh before trying again.", 503, false, true);
}
export function writerMessage(error: unknown) { return writerFailure(error).message; }
type NativeResult = { status: "confirmed" | "waitlisted"; alreadyRegistered: boolean };
type Contract = {
  register_native_hackathon: { p_hackathon_id: string; p_team_id: string | null; p_reviewed_unknown: boolean };
  mission20_remove_team_member: { p_team_id: string; p_member_id: string };
  mission20_set_project_role: { p_team_id: string; p_member_id: string; p_role: string };
  mission20_delete_team: { p_team_id: string };
  mission20_cancel_registration: { p_event_id: string; p_registration_id: string };
  accept_team_invite: { p_invite_id: string };
  accept_team_join_request: { p_request_id: string };
  ensure_team_conversation: { p_team_id: string };
  delete_user_completely: { p_target_user_id: string };
};
const object = (data: unknown): data is Record<string, unknown> => !!data && typeof data === "object" && !Array.isArray(data);
export function nativeResult(data: unknown): NativeResult {
  if (!object(data) || typeof data.status !== "string" || !["confirmed", "waitlisted"].includes(data.status) || typeof data.alreadyRegistered !== "boolean") {
    throw new WriterError("Registration returned an invalid confirmation. Refresh to verify participation.", 503, false, true);
  }
  return { status: data.status as NativeResult["status"], alreadyRegistered: data.alreadyRegistered };
}
async function identity(client: SupabaseClient, expected: string, budget: WriterBudget, pinnedToken?: string) {
  const session = pinnedToken ? null : await budget.run(() => client.auth.getSession());
  if (session?.error) { console.error("[writer] session failed:", session.error); throw new WriterError("Sign in again before continuing.", 401); }
  const token = pinnedToken || session?.data.session?.access_token;
  if (!token || (!pinnedToken && session?.data.session?.user.id !== expected)) throw new WriterError("Your account changed. Refresh before trying again.", 401);
  const { data, error } = await budget.run(() => client.auth.getUser(token));
  if (error) { console.error("[writer] identity failed:", error); throw new WriterError("Sign in again before continuing.", 401); }
  if (!expected || data.user?.id !== expected) throw new WriterError("Your account changed. Refresh before trying again.", 401);
  return token;
}
export async function writerRpc<K extends keyof Contract>(client: SupabaseClient, name: K, args: Contract[K], expectedUserId: string, budget = new WriterBudget(), pinnedToken?: string): Promise<unknown> {
  try {
    const token = await identity(client, expectedUserId, budget, pinnedToken);
    const { data, error } = await budget.query(() => client.rpc(name, args).setHeader("Authorization", `Bearer ${token}`));
    if (error) { console.error("[writer] RPC failed:", name, error); throw writerFailure(error); }
    budget.check();
    if (!pinnedToken) {
      const current = await budget.run(() => client.auth.getSession());
      if (current.error) console.error("[writer] confirmation session failed:", current.error);
      if (current.error || (current.data.session?.user.id !== expectedUserId && !(name === "delete_user_completely" && current.data.session === null))) throw new WriterError("Your account changed. Refresh to verify the outcome.", 409, false, true);
    }
    return data;
  } catch (error) {
    if (!(error instanceof WriterError)) console.error("[writer] request failed:", name, error);
    throw writerFailure(error);
  }
}
function exactId(data: unknown, expected?: string) {
  if (typeof data !== "string" || !data.trim() || (expected && data.toLowerCase() !== expected.toLowerCase())) throw new WriterError("Couldn't verify the change. Refresh before trying again.", 503, false, true);
  return data;
}
export async function removeTeamMember(client: SupabaseClient, teamId: string, memberId: string, actor: string, budget?: WriterBudget) {
  return exactId(await writerRpc(client, "mission20_remove_team_member", { p_team_id: teamId, p_member_id: memberId }, actor, budget), memberId);
}
export async function setProjectRole(client: SupabaseClient, teamId: string, memberId: string, role: string, actor: string, budget?: WriterBudget) {
  return exactId(await writerRpc(client, "mission20_set_project_role", { p_team_id: teamId, p_member_id: memberId, p_role: role }, actor, budget), memberId);
}
export async function deleteTeam(client: SupabaseClient, teamId: string, actor: string, budget?: WriterBudget) {
  return exactId(await writerRpc(client, "mission20_delete_team", { p_team_id: teamId }, actor, budget), teamId);
}
export async function acceptTeamInvite(client: SupabaseClient, inviteId: string, teamId: string, actor: string, budget?: WriterBudget) {
  return exactId(await writerRpc(client, "accept_team_invite", { p_invite_id: inviteId }, actor, budget), teamId);
}
export async function acceptTeamRequest(client: SupabaseClient, requestId: string, teamId: string, actor: string, budget?: WriterBudget) {
  return exactId(await writerRpc(client, "accept_team_join_request", { p_request_id: requestId }, actor, budget), teamId);
}
export async function ensureTeamConversation(client: SupabaseClient, teamId: string, actor: string, budget?: WriterBudget) {
  const id = exactId(await writerRpc(client, "ensure_team_conversation", { p_team_id: teamId }, actor, budget));
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw new WriterError("Conversation returned an invalid confirmation. Refresh before trying again.", 503, false, true);
  return id;
}
export async function deleteAccount(client: SupabaseClient, targetId: string, actor: string, budget?: WriterBudget, pinnedToken?: string) {
  const data = await writerRpc(client, "delete_user_completely", { p_target_user_id: targetId }, actor, budget, pinnedToken);
  if (data !== null) throw new WriterError("Couldn't verify account deletion. Refresh to verify the outcome.", 503, false, true);
}
/** Unlink and cancellation share one reviewed database transaction. */
export async function cancelRegistration(client: SupabaseClient, eventId: string, registrationId: string, actor: string, budget = new WriterBudget()) {
  return exactId(await writerRpc(client, "mission20_cancel_registration", { p_event_id: eventId, p_registration_id: registrationId }, actor, budget), registrationId);
}
