-- ============================================================
-- Migration: 20260905210000_add_track_id_to_team_ppt_evaluations.sql
-- Description: Adds track_id column to team_ppt_evaluations and updates
--              public safe view team_ppt_evaluations_public.
-- ============================================================

-- 1. Add track_id column to team_ppt_evaluations table
ALTER TABLE public.team_ppt_evaluations
ADD COLUMN IF NOT EXISTS track_id TEXT NOT NULL DEFAULT 'web_dev';

-- 2. Create index for fast lookups / filtering by track
CREATE INDEX IF NOT EXISTS idx_team_ppt_evaluations_track_id
ON public.team_ppt_evaluations(track_id);

-- 3. Recreate public safe view with track_id included
DROP VIEW IF EXISTS public.team_ppt_evaluations_public CASCADE;
CREATE VIEW public.team_ppt_evaluations_public
    WITH (security_invoker = true)
AS
SELECT
    id,
    team_id,
    submitted_by,
    track_id,
    ps_title,
    ps_category,
    submission_type,
    external_link_url,
    file_name,
    version,
    status,
    score_novelty,
    score_tech,
    score_ui_ux,
    score_team,
    score_impact,
    score_plan,
    score_clarity,
    total_score,
    grade,
    slide_breakdown,
    ai_feedback,
    error_message,
    created_at,
    updated_at,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = team_ppt_evaluations.team_id
            AND tm.user_id = auth.uid()
        ) OR EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = team_ppt_evaluations.team_id
            AND t.owner_id = auth.uid()
        ) OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
        THEN ppt_url
        ELSE NULL
    END AS ppt_url
FROM public.team_ppt_evaluations;

-- 4. Grant SELECT on public view to authenticated users
GRANT SELECT ON public.team_ppt_evaluations_public TO authenticated;
