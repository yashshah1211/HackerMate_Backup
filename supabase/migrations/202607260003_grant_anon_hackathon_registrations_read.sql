-- Migration: 202607260003_grant_anon_hackathon_registrations_read.sql
-- Description: Grant anonymous/public read access to hackathon_registrations table for partner pages.

DROP POLICY IF EXISTS registrations_read_anon ON public.hackathon_registrations;
CREATE POLICY registrations_read_anon ON public.hackathon_registrations
  FOR SELECT TO anon
  USING (true);
