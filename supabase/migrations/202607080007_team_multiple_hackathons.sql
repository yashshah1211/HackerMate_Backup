-- Migration: 202607080007_team_multiple_hackathons
-- Create team_hackathons junction table to support multiple hackathon listings per team.

CREATE TABLE IF NOT EXISTS public.team_hackathons (
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  hackathon_id UUID REFERENCES public.hackathons(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (team_id, hackathon_id)
);

-- Enable RLS
ALTER TABLE public.team_hackathons ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY team_hackathons_read ON public.team_hackathons
  FOR SELECT TO authenticated USING (true);

CREATE POLICY team_hackathons_insert ON public.team_hackathons
  FOR INSERT TO authenticated WITH CHECK (public.is_team_owner(team_id));

CREATE POLICY team_hackathons_delete ON public.team_hackathons
  FOR DELETE TO authenticated USING (public.is_team_owner(team_id));

-- Migrate existing relationships from teams to team_hackathons
INSERT INTO public.team_hackathons (team_id, hackathon_id)
SELECT id, hackathon_id FROM public.teams WHERE hackathon_id IS NOT NULL
ON CONFLICT (team_id, hackathon_id) DO NOTHING;

-- Update create_team_with_owner function
CREATE OR REPLACE FUNCTION public.create_team_with_owner(
  p_name text,
  p_description text,
  p_max_members integer,
  p_college text,
  p_hackathon_id uuid,
  p_hackathon_name text,
  p_skills text[],
  p_roles_needed text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_team_id uuid;
BEGIN
  IF v_user_id is null THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF nullif(btrim(p_name), '') is null or nullif(btrim(p_description), '') is null THEN
    RAISE EXCEPTION 'Team name and description are required';
  END IF;
  IF p_max_members < 2 or p_max_members > 20 THEN
    RAISE EXCEPTION 'Team size must be between 2 and 20';
  END IF;

  INSERT INTO public.teams (
    name, description, owner_id, max_members, college, hackathon_id,
    hackathon_name, skills, roles_needed
  )
  VALUES (
    btrim(p_name), btrim(p_description), v_user_id, p_max_members, p_college,
    p_hackathon_id, p_hackathon_name, p_skills, p_roles_needed
  )
  RETURNING id INTO v_team_id;

  -- Insert link into team_hackathons if hackathon is specified
  IF p_hackathon_id IS NOT NULL THEN
    INSERT INTO public.team_hackathons (team_id, hackathon_id)
    VALUES (v_team_id, p_hackathon_id)
    ON CONFLICT (team_id, hackathon_id) DO NOTHING;
  END IF;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (v_team_id, v_user_id, 'owner');

  RETURN v_team_id;
END;
$$;
