-- Migration: 202607240002_add_last_sent_to_organizer_leads
-- Add last_sent_to column to organizer_leads to prevent overwriting original scraped organizer_email

ALTER TABLE public.organizer_leads 
ADD COLUMN IF NOT EXISTS last_sent_to TEXT;
