-- ============================================================
-- Migration: sih_mock_submissions_v2
-- Add versioning, submission history, request locking/idempotency,
-- evaluation stages, score deductions, and stale status tracking.
-- ============================================================

-- 1. Add versioning & status metadata columns
ALTER TABLE public.sih_mock_submissions
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.sih_mock_submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS evaluation_stage TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS score_deductions JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT false;

-- 2. Drop strict unique constraint on team_id so historical versions can exist
ALTER TABLE public.sih_mock_submissions
  DROP CONSTRAINT IF EXISTS sih_mock_submissions_team_unique;

-- 3. Create partial unique index ensuring only ONE active submission per team
CREATE UNIQUE INDEX IF NOT EXISTS idx_sih_mock_submissions_active_team
  ON public.sih_mock_submissions (team_id)
  WHERE is_active = true;

-- 4. Add performance indexes for scalable leaderboard & history lookups
CREATE INDEX IF NOT EXISTS idx_sih_mock_submissions_active_score
  ON public.sih_mock_submissions (is_active, total_score DESC);

CREATE INDEX IF NOT EXISTS idx_sih_mock_submissions_team_version
  ON public.sih_mock_submissions (team_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_sih_mock_submissions_idempotency
  ON public.sih_mock_submissions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 5. Re-create the public security definer view exposing safe columns for leaderboard consumers
CREATE OR REPLACE VIEW public.sih_mock_submissions_public
  WITH (security_invoker = true)
AS
SELECT
  id,
  team_id,
  submitted_by,
  ps_number,
  ps_title,
  ps_category,
  theme,
  status,
  evaluation_stage,
  version,
  is_active,
  parent_id,
  is_stale,
  score_novelty,
  score_tech,
  score_ui_ux,
  score_impact,
  score_team,
  total_score,
  grade,
  ai_feedback,
  score_deductions,
  created_at,
  updated_at,
  -- Link Privacy: Only expose URLs to team members, owner, or admins
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = sih_mock_submissions.team_id
        AND tm.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = sih_mock_submissions.team_id
        AND t.owner_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
    THEN ppt_url
    ELSE NULL
  END AS ppt_url,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = sih_mock_submissions.team_id
        AND tm.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = sih_mock_submissions.team_id
        AND t.owner_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
    THEN github_url
    ELSE NULL
  END AS github_url,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = sih_mock_submissions.team_id
        AND tm.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = sih_mock_submissions.team_id
        AND t.owner_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
    THEN demo_url
    ELSE NULL
  END AS demo_url
FROM public.sih_mock_submissions;

GRANT SELECT ON public.sih_mock_submissions_public TO authenticated;
