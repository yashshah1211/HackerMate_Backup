-- Migration: 202608110002_fix_dilmangemore_college.sql
-- Description: Update college column for team 'DILMANGEMORE' to match owner's college (TCET Mumbai)

UPDATE public.teams
SET college = 'TCET Mumbai (Thakur College of Engineering and Technology)'
WHERE id = '20eb641e-7e21-4906-8acf-793e8fc87203'
  AND name = 'DILMANGEMORE';
