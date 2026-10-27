import 'server-only';
import type { EmailDispatch } from '@/lib/emailDispatch';
import type { DispatchLedger, InvitationEmail, Outcome, ResendTransport } from './contracts';

export const COMMUNICATIONS_RELEASE_APPROVED = false;
/** No environment flag, route, worker or cron can enable real messaging in PR C. */
export async function dispatchRound2Invitation() {
  return { state: 'blocked' as const, reason: 'Communications integration and launch review required.', retrySafe: false as const };
}
export function providerOutcome(result: EmailDispatch): Outcome {
  const id = typeof result.providerId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(result.providerId) ? result.providerId : null;
  if (result.status === 'accepted' && result.attempted === true && result.intendedRecipientAccepted === true && result.sandbox === false && id) return { state: 'accepted', providerId: id };
  if (result.status === 'failed' && result.attempted === true && result.sandbox === false && result.providerStatus !== undefined
    && result.providerStatus >= 400 && result.providerStatus < 500 && ![408, 409].includes(result.providerStatus)) return { state: 'rejected', providerId: null };
  return { state: 'unknown', providerId: null };
}
/** Fixture-only execution seam. Never imports/calls a live provider; a fake transport is injected by tests. */
export async function simulateInvitationDispatch(teamId: string, email: InvitationEmail, ledger: DispatchLedger, simulatedProvider: ResendTransport) {
  const retrySafe = false as const;
  if (process.env.NODE_ENV === 'production' || !/^[^@\s]+@example\.invalid$/.test(email.to)
    || !/^[^@\s]+@example\.invalid$/.test(email.from)) return { state: 'blocked' as const, recorded: false, retrySafe };
  let queued;
  try { queued = await ledger.queue(teamId); } catch { return { state: 'blocked' as const, recorded: false, retrySafe }; }
  let claim;
  try { claim = await ledger.claim(queued.id); }
  catch { return { state: 'unknown' as const, recorded: false, retrySafe }; }
  if (!claim) return { state: 'blocked' as const, recorded: true, retrySafe };
  // Durable claim is already unknown. Worker death here must never make the job retryable.
  let outcome: Outcome;
  try { outcome = providerOutcome(await simulatedProvider(email)); }
  catch { outcome = { state: 'unknown', providerId: null }; }
  let recorded = false;
  try { recorded = await ledger.finish(claim, outcome); } catch { /* Preserve acceptance; never retry a persistence failure. */ }
  return { state: outcome.state, recorded, retrySafe };
}
