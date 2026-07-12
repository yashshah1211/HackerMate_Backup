-- Migration: 202607120003_team_single_active_hackathon
-- Prevent teams from registering for multiple active hackathons simultaneously.

CREATE OR REPLACE FUNCTION public.check_team_active_hackathons()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_active_count integer;
BEGIN
  -- Count active hackathon registrations for this team (excluding the one being updated, if any)
  SELECT count(*)
  INTO v_active_count
  FROM public.team_hackathons th
  JOIN public.hackathons h ON th.hackathon_id = h.id
  WHERE th.team_id = NEW.team_id
    AND th.hackathon_id <> NEW.hackathon_id
    AND (h.end_date IS NULL OR h.end_date >= timezone('utc'::text, now()));

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'A team cannot register for more than one active hackathon at a time.';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop trigger if exists and create it
DROP TRIGGER IF EXISTS trg_check_team_active_hackathons ON public.team_hackathons;
CREATE TRIGGER trg_check_team_active_hackathons
BEFORE INSERT OR UPDATE ON public.team_hackathons
FOR EACH ROW
EXECUTE FUNCTION public.check_team_active_hackathons();
