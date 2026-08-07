-- Migration: Add track column to public.teams and public.team_hackathons
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS track text DEFAULT NULL;
ALTER TABLE public.team_hackathons ADD COLUMN IF NOT EXISTS track text DEFAULT NULL;

COMMENT ON COLUMN public.teams.track IS 'Selected event track/category ID for hackathon team listings';
COMMENT ON COLUMN public.team_hackathons.track IS 'Selected event track/category ID for team hackathon registration';
