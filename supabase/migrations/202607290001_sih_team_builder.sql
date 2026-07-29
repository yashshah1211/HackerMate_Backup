-- Migration: 202607290001_sih_team_builder
-- Adds gender column to profiles and inserts Smart India Hackathon 2026 anchor row into public.hackathons.

-- 1. Ensure profiles has optional gender column for SIH team composition checks
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender VARCHAR(20);

-- 2. Insert Smart India Hackathon 2026 anchor row in public.hackathons
INSERT INTO public.hackathons (
  id,
  name,
  description,
  start_date,
  end_date,
  location,
  mode,
  prize_pool,
  website_url,
  tags,
  type
) VALUES (
  '00000000-0000-0000-0000-000001703935',
  'Smart India Hackathon 2026 (SIH Internal Round)',
  'Official college-level internal team formation round for Smart India Hackathon 2026. Assemble your 6-member team from your college with diverse skills and mandatory female representation.',
  '2026-08-01T00:00:00Z',
  '2026-09-30T23:59:59Z',
  'Your College Campus',
  'hybrid',
  'Nomination to SIH 2026 National Round',
  'https://sih.gov.in',
  ARRAY['SIH 2026', 'College Round', 'Internal Selection', 'Government of India'],
  'external'
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  website_url = EXCLUDED.website_url,
  tags = EXCLUDED.tags,
  type = EXCLUDED.type;
