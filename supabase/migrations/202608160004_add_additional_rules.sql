-- ============================================================
-- Migration: 202608160004_add_additional_rules
-- Description: Add optional additional_rules column to weekly_challenges
--              so admins can define custom challenge-specific rules.
-- ============================================================

ALTER TABLE IF EXISTS public.weekly_challenges
ADD COLUMN IF NOT EXISTS additional_rules TEXT;
