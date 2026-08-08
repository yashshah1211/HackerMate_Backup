-- Migration: 202608080001_migrate_tcet_colleges
-- Consolidates all Thakur College of Engineering and Technology (TCET) entries under canonical string:
-- "TCET Mumbai (Thakur College of Engineering and Technology)"

UPDATE public.profiles
SET college = 'TCET Mumbai (Thakur College of Engineering and Technology)'
WHERE college = 'tcet'
   OR college = 'Thakur College of engineering and technology'
   OR college = 'Thakur College of Engineering and Technology'
   OR (college ILIKE '%thakur%' AND college ILIKE '%engineering%')
   OR (college ILIKE '%tcet%' AND college != 'TCET Mumbai (Thakur College of Engineering and Technology)');

UPDATE public.teams
SET college = 'TCET Mumbai (Thakur College of Engineering and Technology)'
WHERE college = 'tcet'
   OR college = 'Thakur College of engineering and technology'
   OR college = 'Thakur College of Engineering and Technology'
   OR (college ILIKE '%thakur%' AND college ILIKE '%engineering%')
   OR (college ILIKE '%tcet%' AND college != 'TCET Mumbai (Thakur College of Engineering and Technology)');
