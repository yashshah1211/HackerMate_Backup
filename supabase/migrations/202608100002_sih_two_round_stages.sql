-- Migration: 202608100002_sih_two_round_stages
-- Adds round_stage column to sih_mock_submissions table and updates sih_mock_submissions_public view.

ALTER TABLE public.sih_mock_submissions
  ADD COLUMN IF NOT EXISTS evaluation_stage TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS round_stage TEXT DEFAULT 'round1_submitted',
  ADD COLUMN IF NOT EXISTS round1_decided_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS round2_decided_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS version INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS score_novelty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_tech INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_ui_ux INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_impact INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_team INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jury_viva_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_composite_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grade TEXT,
  ADD COLUMN IF NOT EXISTS spoc_approval_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS spoc_notes TEXT,
  ADD COLUMN IF NOT EXISTS ai_feedback JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS score_deductions JSONB DEFAULT '{}'::jsonb;

-- Update sih_mock_submissions_public view to include round_stage safely
DROP VIEW IF EXISTS public.sih_mock_submissions_public CASCADE;
CREATE VIEW public.sih_mock_submissions_public AS
SELECT 
  id,
  team_id,
  ps_number,
  ps_title,
  ps_category,
  theme,
  status,
  evaluation_stage,
  round_stage,
  version,
  is_active,
  is_stale,
  score_novelty,
  score_tech,
  score_ui_ux,
  score_impact,
  score_team,
  total_score,
  jury_viva_score,
  final_composite_score,
  grade,
  spoc_approval_status,
  spoc_notes,
  ai_feedback,
  score_deductions,
  submitted_by,
  created_at,
  updated_at
FROM public.sih_mock_submissions
WHERE is_active = true OR is_active IS NULL;

-- Enable public read permissions on sih_mock_submissions_public view
GRANT SELECT ON public.sih_mock_submissions_public TO anon, authenticated;
