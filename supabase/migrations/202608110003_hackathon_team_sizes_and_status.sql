-- Migration: 202608110003_hackathon_team_sizes_and_status
-- Ensure team size limits, status, rounds info, and ai_feedback exist on public.hackathons table.

ALTER TABLE public.hackathons 
  ADD COLUMN IF NOT EXISTS min_team_size INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_team_size INT DEFAULT 4,
  ADD COLUMN IF NOT EXISTS rounds_count INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rounds_info JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS ai_feedback JSONB DEFAULT '{}'::jsonb;

-- Grant read access on public.hackathons to authenticated and anon roles
GRANT SELECT ON public.hackathons TO authenticated, anon;
