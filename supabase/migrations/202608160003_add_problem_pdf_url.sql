-- ============================================================
-- Migration: 202608160003_add_problem_pdf_url
-- Description: Add optional problem_pdf_url to weekly_challenges
--              so organizers can attach an official Problem Briefing PDF.
-- ============================================================

ALTER TABLE IF EXISTS public.weekly_challenges
ADD COLUMN IF NOT EXISTS problem_pdf_url TEXT;
