-- Migration: 202607180001_add_onboarding_nudge_column
-- Adds onboarding_nudge_sent_at column to profiles to prevent duplicate onboarding reminders.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_nudge_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
