import 'server-only';
import { Webhook } from 'svix';

export type VerifiedDelivery = Readonly<{ providerId: string; eventId: string; occurredAt: string }>;
/** Same Svix verification infrastructure as the existing Resend webhook, without persisting its PII-bearing payload. No endpoint is introduced. */
export function verifyDeliveryEvidence(raw: string, headers: Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>, secret: string): VerifiedDelivery | null {
  if (!secret || Buffer.byteLength(raw, 'utf8') > 16_384 || !/^[a-zA-Z0-9_-]{1,128}$/.test(headers['svix-id'] || '')) return null;
  try {
    const event = new Webhook(secret).verify(raw, headers) as { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } };
    if (!event || event.type !== 'email.delivered' || typeof event.created_at !== 'string'
      || !Number.isFinite(Date.parse(event.created_at)) || Date.parse(event.created_at) > Date.now() + 300_000
      || typeof event.data?.email_id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(event.data.email_id)) return null;
    return { providerId: event.data.email_id, eventId: headers['svix-id'], occurredAt: new Date(event.created_at).toISOString() };
  } catch { return null; }
}
