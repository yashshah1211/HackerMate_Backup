-- Migration: 202607080005_offline_email_notifications
-- Sets up offline email notifications trigger and schema changes.

-- 1. Enable pg_net extension for async HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Add last_seen_at to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;

-- 3. Create app_settings table for environment configs inside the DB
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Enable RLS on app_settings to prevent unauthorized read/write
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Seed default/mock values
INSERT INTO public.app_settings (key, value)
VALUES 
  ('site_url', 'http://localhost:3000'),
  ('webhook_secret', 'super-secret-webhook-key-change-me')
ON CONFLICT (key) DO NOTHING;

-- 4. Create trigger function to fire webhook when notifications are inserted for offline users
CREATE OR REPLACE FUNCTION public.handle_notification_insert_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient_email TEXT;
  v_recipient_name TEXT;
  v_last_seen TIMESTAMP WITH TIME ZONE;
  v_is_banned BOOLEAN;
  v_site_url TEXT;
  v_webhook_secret TEXT;
  v_payload JSONB;
  v_headers JSONB;
BEGIN
  -- Fetch recipient details
  SELECT email, full_name, last_seen_at, coalesce(is_banned, false)
  INTO v_recipient_email, v_recipient_name, v_last_seen, v_is_banned
  FROM public.profiles
  WHERE id = NEW.user_id;

  -- Skip if recipient is banned, or has no email
  IF v_is_banned OR v_recipient_email IS NULL OR v_recipient_email = '' THEN
    RETURN NEW;
  END IF;

  -- Fetch app settings
  SELECT value INTO v_site_url FROM public.app_settings WHERE key = 'site_url';
  SELECT value INTO v_webhook_secret FROM public.app_settings WHERE key = 'webhook_secret';

  -- If configuration is missing, do not attempt to call webhook
  IF v_site_url IS NULL OR v_site_url = '' OR v_webhook_secret IS NULL OR v_webhook_secret = '' THEN
    RETURN NEW;
  END IF;

  -- User is considered offline if last_seen_at is NULL or older than 1 minute
  IF v_last_seen IS NULL OR v_last_seen < (now() - INTERVAL '1 minute') THEN
    -- Construct payload
    v_payload := jsonb_build_object(
      'notificationId', NEW.id,
      'recipientId', NEW.user_id,
      'recipientEmail', v_recipient_email,
      'recipientName', v_recipient_name,
      'message', NEW.message,
      'link', NEW.link
    );

    -- Construct authorization header
    v_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_webhook_secret
    );

    -- Fire asynchronous HTTP POST request to Next.js API
    PERFORM net.http_post(
      url := v_site_url || '/api/webhooks/notification',
      headers := v_headers,
      body := v_payload
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Create Trigger on notifications table
DROP TRIGGER IF EXISTS trg_notification_insert_webhook ON public.notifications;
CREATE TRIGGER trg_notification_insert_webhook
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_notification_insert_webhook();
