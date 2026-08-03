-- Migration: 202608030003_add_last_onboarding_nudge_sent_at
-- Adds last_onboarding_nudge_sent_at column to public.profiles to enforce 3-day cooldown on email nudges.

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_onboarding_nudge_sent_at TIMESTAMP WITH TIME ZONE;
