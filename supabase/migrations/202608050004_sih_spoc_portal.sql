-- Migration: Add SPOC Portal & Jury Viva Scoring Columns to sih_mock_submissions

ALTER TABLE sih_mock_submissions
ADD COLUMN IF NOT EXISTS spoc_approval_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS spoc_notes TEXT,
ADD COLUMN IF NOT EXISTS jury_viva_score INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS final_composite_score INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS college_name TEXT DEFAULT 'D.J. Sanghvi College of Engineering (DJSCE)';

-- Update sih_mock_submissions_public view to include SPOC approval fields safely
CREATE OR REPLACE VIEW sih_mock_submissions_public AS
SELECT 
  id,
  team_id,
  ps_number,
  ps_title,
  ps_category,
  theme,
  status,
  evaluation_stage,
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
FROM sih_mock_submissions
WHERE is_active = true OR is_active IS NULL;

-- Enable public read permissions on sih_mock_submissions_public view
GRANT SELECT ON sih_mock_submissions_public TO anon, authenticated;
