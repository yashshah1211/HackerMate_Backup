-- Migration: 202607180002_add_college_to_hackathons
-- Adds optional college text column to hackathons table.

ALTER TABLE public.hackathons ADD COLUMN IF NOT EXISTS college TEXT DEFAULT NULL;
