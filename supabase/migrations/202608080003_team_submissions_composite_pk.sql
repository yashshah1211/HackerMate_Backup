-- Migration: 202608080003_team_submissions_composite_pk
-- Converts team_submissions primary key from (team_id) to (team_id, hackathon_id) to support multi-event project submissions.

-- 1. Add hackathon_id column if not exists
ALTER TABLE public.team_submissions
  ADD COLUMN IF NOT EXISTS hackathon_id UUID REFERENCES public.hackathons(id) ON DELETE CASCADE;

-- 2. Backfill existing rows with correct hackathon_id
UPDATE public.team_submissions ts
SET hackathon_id = COALESCE(
  (SELECT th.hackathon_id FROM public.team_hackathons th WHERE th.team_id = ts.team_id ORDER BY th.created_at ASC LIMIT 1),
  (SELECT t.hackathon_id FROM public.teams t WHERE t.id = ts.team_id LIMIT 1)
)
WHERE ts.hackathon_id IS NULL;

-- 3. Delete any orphaned test submission rows where hackathon_id could not be resolved
DELETE FROM public.team_submissions WHERE hackathon_id IS NULL;

-- 4. Enforce NOT NULL on hackathon_id
ALTER TABLE public.team_submissions
  ALTER COLUMN hackathon_id SET NOT NULL;

-- 5. Change primary key to composite (team_id, hackathon_id)
ALTER TABLE public.team_submissions
  DROP CONSTRAINT IF EXISTS team_submissions_pkey;

ALTER TABLE public.team_submissions
  ADD CONSTRAINT team_submissions_pkey PRIMARY KEY (team_id, hackathon_id);

-- 6. Index hackathon_id for gallery lookups
CREATE INDEX IF NOT EXISTS idx_team_submissions_hackathon_id
  ON public.team_submissions(hackathon_id);
