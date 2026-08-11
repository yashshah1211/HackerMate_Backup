-- Migration: 202608110001_remove_sih_internal_round_hosting
-- Removes SIH 2026 internal-round hosting tables, views, RLS policies, and triggers.

-- 1. Drop public security view
DROP VIEW IF EXISTS public.sih_mock_submissions_public CASCADE;

-- 2. Drop RLS policies & tables
DROP TABLE IF EXISTS public.sih_mock_submissions CASCADE;
DROP TABLE IF EXISTS public.sih_spoc_allowlist CASCADE;

-- 3. Drop trigger function
DROP FUNCTION IF EXISTS public.set_sih_mock_submissions_updated_at() CASCADE;
