-- Migration: 202608070001_team_sizes_and_rounds
-- Adds team size limits (min_team_size, max_team_size) and rounds configuration (rounds_count, rounds_info) to public.hackathons.

ALTER TABLE public.hackathons 
  ADD COLUMN IF NOT EXISTS min_team_size INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_team_size INT DEFAULT 4,
  ADD COLUMN IF NOT EXISTS rounds_count INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rounds_info JSONB DEFAULT '[]'::jsonb;
