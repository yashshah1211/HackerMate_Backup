-- Migration: Create resend_webhook_events table for tracking email delivery, opens, clicks, and bounces
CREATE TABLE IF NOT EXISTS public.resend_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_email_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for fast lookup by email ID and date
CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_email_id ON public.resend_webhook_events(resend_email_id);
CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_created_at ON public.resend_webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_event_type ON public.resend_webhook_events(event_type);

-- Enable RLS
ALTER TABLE public.resend_webhook_events ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on resend_webhook_events"
  ON public.resend_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
