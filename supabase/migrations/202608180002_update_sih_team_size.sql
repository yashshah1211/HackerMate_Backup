-- Migration: 202608180002_update_sih_team_size.sql
-- Description: Update SIH 2026 team size to 1-6 members

UPDATE public.hackathons
SET min_team_size = 1,
    max_team_size = 6
WHERE id = '00000000-0000-0000-0000-000001703935'
   OR LOWER(name) LIKE '%smart india hackathon%';
