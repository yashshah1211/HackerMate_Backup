-- Migration: 202608040002_add_metadata_to_hackathon_registrations
-- Adds metadata JSONB column to public.hackathon_registrations to support event tracks.

ALTER TABLE public.hackathon_registrations 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
