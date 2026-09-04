-- Migration: 202608180001_grant_profiles_year_of_study.sql
-- Description: Grant column-level SELECT and UPDATE on year_of_study to anon and authenticated roles.

-- 1. Grant SELECT on year_of_study to anon and authenticated
GRANT SELECT (year_of_study) ON public.profiles TO anon, authenticated;

-- 2. Grant UPDATE on year_of_study to authenticated
GRANT UPDATE (year_of_study) ON public.profiles TO authenticated;
