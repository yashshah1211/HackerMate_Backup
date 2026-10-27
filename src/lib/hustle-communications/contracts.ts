import type { dispatchEmail, EmailDispatch } from '@/lib/emailDispatch';

export const COMMUNICATION_EVENT_ID = '0da43cba-90dc-449c-a126-a2fc8be8a379';
export const INVITATION_PURPOSE = 'round2-invitation-v1';
export const CONFIRMATION_CLOSES = '2026-10-23T17:30:00.000Z';
export type RegistrationState = 'pending' | 'confirmed' | 'declined';
export type EmailState = 'queued' | 'accepted' | 'rejected' | 'unknown' | 'confirmed_delivered';
export type ManualContactState = 'not_contacted' | 'chat_opened' | 'organizer_marked_sent' | 'organizer_marked_replied';

/** DTO, NOT proof of authority. Only a future authenticated PR A adapter may build this from fresh authoritative reads. */
export type ShortlistedLeader = Readonly<{
  eventId: string; teamId: string; teamName: string; leaderName: string;
  email: string; whatsapp: string | null; activeShortlist: boolean;
  registration: RegistrationState; checkedAt: string;
}>;
/** One-time in-memory handoff from PR A. Never serialize to a queue, log or analytics. */
export type EphemeralInvitation = Readonly<{ confirmationUrl: string; expiresAt: string }>;
export type TemplateApproval = Readonly<{ organizerApproved: boolean; version: 'round2-invitation-v1'; allowedOrigins: readonly string[] }>;
export const UNAPPROVED_TEMPLATE: TemplateApproval = { organizerApproved: false, version: INVITATION_PURPOSE, allowedOrigins: [] };
export type InvitationEmail = Parameters<typeof dispatchEmail>[0] & { to: string; text: string };
/** Reuses the EXISTING Resend transport's input/outcome contract; no second HTTP client. */
export type ResendTransport = (payload: InvitationEmail) => Promise<EmailDispatch>;
export type Outcome = Readonly<{ state: 'accepted' | 'rejected' | 'unknown'; providerId: string | null }>;
export type EmailClaim = Readonly<{ id: string; claimId: string }>;
export interface DispatchLedger {
  queue(teamId: string): Promise<{ id: string }>;
  /** Must atomically change queued -> unknown and reserve verified quota BEFORE any provider call. */
  claim(id: string): Promise<EmailClaim | null>;
  finish(claim: EmailClaim, outcome: Outcome): Promise<boolean>;
}
export type CommunicationRow = Readonly<{
  teamId: string; teamName: string; leaderName: string;
  registration: RegistrationState; email: EmailState | 'not_queued';
  whatsapp: ManualContactState; lastEvidenceAt: string | null;
}>;
