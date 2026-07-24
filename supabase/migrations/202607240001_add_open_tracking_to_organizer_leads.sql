-- Migration: 202607240001_add_open_tracking_to_organizer_leads
-- Add columns for email open tracking to public.organizer_leads

ALTER TABLE public.organizer_leads 
ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS open_count INT DEFAULT 0;
