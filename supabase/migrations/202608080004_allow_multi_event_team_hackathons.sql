-- Migration: 202608080004_allow_multi_event_team_hackathons
-- Drops the single-active-hackathon trigger to allow teams to register for multiple active hackathons concurrently.

DROP TRIGGER IF EXISTS trg_check_team_active_hackathons ON public.team_hackathons;
DROP FUNCTION IF EXISTS public.check_team_active_hackathons();
