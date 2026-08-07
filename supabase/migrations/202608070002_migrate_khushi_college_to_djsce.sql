-- Migration: 202608070002_migrate_khushi_college_to_djsce
-- Migrates Khushi Mokani's profile and any legacy "Dwarkadas J. Sanghvi College of Engineering"
-- entries to the canonical college string "DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)".

UPDATE public.profiles
SET college = 'DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)'
WHERE LOWER(full_name) LIKE '%khushi%mokani%'
   OR college = 'Dwarkadas J. Sanghvi College of Engineering'
   OR college ILIKE '%dwarkadas%sanghvi%';

UPDATE public.teams
SET college = 'DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)'
WHERE college = 'Dwarkadas J. Sanghvi College of Engineering'
   OR college ILIKE '%dwarkadas%sanghvi%';
