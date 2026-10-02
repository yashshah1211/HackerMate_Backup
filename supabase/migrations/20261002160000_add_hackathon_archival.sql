-- Migration: add_hackathon_archival
-- Purpose: Introduce a generic archival state for hackathons to preserve historical data while removing them from discovery surfaces.

-- 1. Add the column safely
ALTER TABLE public.hackathons 
ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;


