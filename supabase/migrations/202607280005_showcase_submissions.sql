-- Migration: 202607280005_showcase_submissions
-- Adds completion_status and screenshot_url to team_submissions with public RLS read policy for completed showcase submissions.

ALTER TABLE public.team_submissions
  ADD COLUMN IF NOT EXISTS completion_status TEXT DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS screenshot_url TEXT;

-- Update existing records without status to 'submitted'
UPDATE public.team_submissions
SET completion_status = 'submitted'
WHERE completion_status IS NULL;

-- Public RLS Select Policy for Completed Showcase Submissions
DROP POLICY IF EXISTS team_submissions_public_read ON public.team_submissions;
CREATE POLICY team_submissions_public_read ON public.team_submissions
  FOR SELECT TO authenticated, anon
  USING (completion_status IN ('submitted', 'completed'));
