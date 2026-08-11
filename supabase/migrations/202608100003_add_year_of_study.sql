-- Migration: Add year_of_study column to public.profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS year_of_study TEXT DEFAULT '2nd Year';

-- Comment on column
COMMENT ON COLUMN public.profiles.year_of_study IS 'Academic year of study (e.g. 1st Year, 2nd Year, 3rd Year, 4th Year, Postgrad / Alumni)';
