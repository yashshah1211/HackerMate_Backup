-- ============================================================
-- Migration: 20260814205000_add_ui_ux_team_columns_to_ppt_evaluations
-- Description: Adds score_ui_ux and score_team columns to team_ppt_evaluations table.
-- ============================================================

ALTER TABLE public.team_ppt_evaluations ADD COLUMN IF NOT EXISTS score_ui_ux INT DEFAULT 0;
ALTER TABLE public.team_ppt_evaluations ADD COLUMN IF NOT EXISTS score_team INT DEFAULT 0;
