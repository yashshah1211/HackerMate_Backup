-- Migration: 202607280006_profile_nudge_tracking
-- Adds profile_nudge_count and last_nudge_sent_at columns to profiles table for multi-stage automated profile reminder tracking.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_nudge_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_nudge_sent_at TIMESTAMPTZ;

-- Backfill previously nudged profiles
UPDATE public.profiles
SET
  last_nudge_sent_at = onboarding_nudge_sent_at,
  profile_nudge_count = 1
WHERE onboarding_nudge_sent_at IS NOT NULL AND profile_nudge_count = 0;
