-- Migration: Add GitHub statistics columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS github_stats JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS github_stats_updated_at TIMESTAMPTZ DEFAULT NULL;
