-- Migration: 202607180007_cleanup_app_settings_webhook_secret
-- Cleans up the leftover plaintext webhook secret from the live app_settings table.

DELETE FROM public.app_settings WHERE key = 'webhook_secret';
