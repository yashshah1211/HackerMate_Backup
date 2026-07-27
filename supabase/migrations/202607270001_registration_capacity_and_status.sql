-- Migration: 202607270001_registration_capacity_and_status
-- Add max_participants column to public.hackathons and status column to public.hackathon_registrations.

ALTER TABLE public.hackathons ADD COLUMN IF NOT EXISTS max_participants INTEGER NULL;

ALTER TABLE public.hackathon_registrations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hackathon_registrations_status_check'
  ) THEN
    ALTER TABLE public.hackathon_registrations
      ADD CONSTRAINT hackathon_registrations_status_check CHECK (status IN ('confirmed', 'waitlisted'));
  END IF;
END $$;
