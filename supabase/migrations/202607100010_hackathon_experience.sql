-- Migration: 202607100010_hackathon_experience
-- Adds fields for hackathon experience and wins to profiles.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_participated_hackathon BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hackathon_participations INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_won_hackathon BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hackathon_wins INTEGER DEFAULT 0;
