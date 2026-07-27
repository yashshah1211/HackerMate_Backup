-- Migration: Add referrer_source to public.profiles
-- Tracks the acquisition channel (e.g. reddit, linkedin, instagram, whatsapp, discord, direct) for each user.

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS referrer_source text;

-- Create an index to speed up admin reporting queries by referral channel
CREATE INDEX IF NOT EXISTS idx_profiles_referrer_source ON public.profiles(referrer_source);
