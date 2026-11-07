import 'server-only';
import { renderHackerMateEmail } from '@/lib/emailTemplate';
import { COMMUNICATION_EVENT_ID, CONFIRMATION_CLOSES, INVITATION_PURPOSE, type EphemeralInvitation, type InvitationEmail, type ShortlistedLeader, type TemplateApproval } from './contracts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const controls = /[\u0000-\u001f\u007f]/;
function name(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 120 || controls.test(value)) throw new Error('Invalid template field.');
  return value.trim();
}
export function validEmail(value: string): boolean {
  return typeof value === 'string' && value.length <= 254 && value === value.trim() && !controls.test(value)
    && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value)
    && !value.startsWith('.') && !value.includes('..');
}
export function eligibleLeader(leader: ShortlistedLeader, now: number): boolean {
  const checked = Date.parse(leader.checkedAt);
  return leader.eventId === COMMUNICATION_EVENT_ID && uuid.test(leader.teamId) && leader.activeShortlist === true
    && leader.registration === 'pending' && validEmail(leader.email) && Number.isFinite(now)
    && checked <= now && now - checked <= 60_000 && now < Date.parse(CONFIRMATION_CLOSES);
}
/** Origin allowlist is defense in depth, not proof of a valid/current PR A invitation. No path/token format is assumed. */
export function validatedConfirmationUrl(invitation: EphemeralInvitation, approval: TemplateApproval, now: number): string {
  if (approval.organizerApproved !== true || approval.version !== INVITATION_PURPOSE || !approval.allowedOrigins.length) throw new Error('Organizer approval required.');
  const raw = invitation.confirmationUrl;
  if (typeof raw !== 'string' || raw.length > 2048 || raw !== raw.trim() || controls.test(raw)) throw new Error('Invalid confirmation link.');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Invalid confirmation link.'); }
  const expires = Date.parse(invitation.expiresAt);
  const allowed = approval.allowedOrigins.some(origin => {
    try { const configured = new URL(origin); return configured.protocol === 'https:' && !configured.username && !configured.password && !configured.port && configured.origin === origin && url.origin === origin; }
    catch { return false; }
  });
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port
    || !Number.isFinite(now) || !Number.isFinite(expires) || expires <= now || expires > Date.parse(CONFIRMATION_CLOSES)) throw new Error('Invalid confirmation link.');
  return url.href;
}
export function prepareInvitationEmail(leader: ShortlistedLeader, invitation: EphemeralInvitation, approval: TemplateApproval, from: string, now: number): InvitationEmail {
  if (!eligibleLeader(leader, now)) throw new Error('Leader is not eligible for an invitation.');
  // Sender ownership/domain verification is an additional launch prerequisite.
  if (!validEmail(from) || from.toLowerCase().endsWith('@resend.dev')) throw new Error('Verified sender required.');
  const link = validatedConfirmationUrl(invitation, approval, now);
  const team = name(leader.teamName); const person = name(leader.leaderName);
  const instructions = `Congratulations! Your team, ${team}, has qualified for Hustle Carnival 2026 Round 2.\n\nClub Ellusion invites your shortlisted team to the on-campus finale on 24 October 2026 at G.L. Bajaj Group of Institutions, Mathura, in partnership with HackerMate.\n\nThe team leader must respond for the whole team on 23 October 2026, from 10:00 AM until before 11:00 PM IST (UTC+05:30). Open your personal secure link and choose Confirm attendance or Decline invitation. Opening the link alone does not confirm participation.\n\nKeep this personal link private. If it is lost, expired or shared by mistake, contact Club Ellusion at ellusion@glbajajgroup.org. Follow the organizer’s official instructions for the finale.`;
  return {
    from, to: leader.email, subject: 'Congratulations — your Hustle Carnival Round 2 invitation',
    reply_to: 'ellusion@glbajajgroup.org',
    text: `HackerMate × Club Ellusion\n\nHi ${person},\n\n${instructions}\n\nConfirm or decline securely: ${link}\n\nYou are receiving this invitation as the recorded leader of an officially shortlisted team.`,
    html: renderHackerMateEmail({
      title: 'You’re through to Round 2.', recipientName: person, badgeText: 'HackerMate × Club Ellusion', introText: instructions,
      details: [{ label: 'Team', value: team }, { label: 'Finale', value: '24 October 2026 · Mathura' }, { label: 'Respond by', value: '23 October 2026 · before 11:00 PM IST' }],
      actionLabel: 'Confirm or decline securely', actionUrl: link,
      footerNote: 'Club Ellusion × HackerMate. Sent only to an officially shortlisted team leader. Email receipt is not registration confirmation. Your response is recorded only through the secure confirmation page.',
    }),
  };
}

/** Syntax normalization only. Ownership and WhatsApp availability are NOT verified. Never infer a country code. */
export function normalizeWhatsApp(value: string | null): string | null {
  if (typeof value !== 'string' || value.length > 40 || !/^\+[0-9 ()-]+$/.test(value)) return null;
  const normalized = value.replace(/[ ()-]/g, '');
  return /^\+[1-9][0-9]{7,14}$/.test(normalized) ? normalized : null;
}
export function prepareWhatsApp(leader: ShortlistedLeader, organizerApproved: boolean, now: number): { href: string; message: string } | null {
  const phone = normalizeWhatsApp(leader.whatsapp);
  if (!phone || organizerApproved !== true || !eligibleLeader(leader, now)) return null;
  // Deliberately no bearer URL: wa.me query text is shared with WhatsApp and browser history.
  const message = `HackerMate × Club Ellusion\nHi ${name(leader.leaderName)}, congratulations! ${name(leader.teamName)} has qualified for Hustle Carnival Round 2 on 24 October 2026 at G.L. Bajaj Group of Institutions, Mathura.\nPlease use the personal link in your official email invitation to confirm or decline for your team on 23 October, 10:00 AM–before 11:00 PM IST. If you have not received the email, contact Club Ellusion at ellusion@glbajajgroup.org.\nThis is a manual message from the organizer; opening this chat does not confirm registration.`;
  return { href: `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(message)}`, message };
}
