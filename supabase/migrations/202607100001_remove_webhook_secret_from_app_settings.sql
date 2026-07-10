-- Migration: 202607100001_remove_webhook_secret_from_app_settings
-- Security fix C3: Remove the plaintext webhook secret from the app_settings table.
--
-- The /api/webhooks/notification route already validates the incoming Authorization
-- header against process.env.NOTIFICATION_WEBHOOK_SECRET (an env var). Storing the
-- same secret in a plain database table is redundant, exposes it to anyone with DB
-- read access, and causes silent divergence after secret rotation.
--
-- The handle_notification_insert_webhook trigger already has a null-guard:
--   IF v_webhook_secret IS NULL OR v_webhook_secret = '' THEN RETURN NEW; END IF;
-- so removing this row gracefully disables the trigger's outbound HTTP call rather
-- than causing an error. (The offline notification feature requires a proper
-- secrets-safe redesign -- e.g. Supabase Vault -- before it can be re-enabled.)
--
-- The site_url row is left intact; it is non-secret config that the trigger
-- uses to construct the callback URL.

DELETE FROM public.app_settings WHERE key = 'webhook_secret';
