-- Migration: 20260808180500_builder_track_record_privacy_and_slug
-- Adds optional username slug and privacy controls for Builder Track Record profiles.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_track_record BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles (LOWER(username));
ALTER TABLE public.hackathon_registrations ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_public_builder_profile(p_target_id TEXT, p_caller_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile RECORD;
  v_user_uuid UUID;
  v_registrations JSONB;
  v_teams JSONB;
  v_submissions JSONB;
  v_show_email BOOLEAN := false;
  v_email_val TEXT := NULL;
BEGIN
  IF p_target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_target_id::UUID;
  ELSE
    SELECT id INTO v_user_uuid FROM public.profiles WHERE LOWER(username) = LOWER(p_target_id);
  END IF;

  IF v_user_uuid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, role, is_available, show_track_record, username, gender
  INTO v_profile
  FROM public.profiles
  WHERE id = v_user_uuid;

  IF v_profile.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_caller_id IS NOT NULL THEN
    IF p_caller_id = v_user_uuid THEN
      v_show_email := true;
    ELSIF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_caller_id AND role = 'admin') THEN
      v_show_email := true;
    END IF;
  END IF;

  IF v_show_email THEN
    SELECT email INTO v_email_val FROM public.profiles WHERE id = v_user_uuid;
  END IF;

  IF NOT COALESCE(v_profile.show_track_record, true) AND (p_caller_id IS NULL OR p_caller_id != v_user_uuid) THEN
    RETURN jsonb_build_object(
      'profile', jsonb_build_object(
        'id', v_profile.id,
        'username', v_profile.username,
        'full_name', v_profile.full_name,
        'email', v_email_val,
        'college', v_profile.college,
        'bio', v_profile.bio,
        'avatar_url', v_profile.avatar_url,
        'skills', v_profile.skills,
        'github_url', v_profile.github_url,
        'linkedin_url', v_profile.linkedin_url,
        'created_at', v_profile.created_at,
        'show_track_record', false
      ),
      'hackathons', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'registration_id', r.id,
      'hackathon_id', h.id,
      'hackathon_name', h.name,
      'mode', h.mode,
      'location', h.location,
      'prize_pool', h.prize_pool,
      'start_date', h.start_date,
      'end_date', h.end_date,
      'website_url', h.website_url,
      'registration_status', r.status,
      'looking_for_team', r.looking_for_team,
      'registered_at', r.created_at
    ) ORDER BY h.start_date DESC NULLS LAST
  ), '[]'::jsonb)
  INTO v_registrations
  FROM public.hackathon_registrations r
  JOIN public.hackathons h ON h.id = r.hackathon_id
  WHERE r.user_id = v_user_uuid
    AND COALESCE(r.is_hidden, false) = false;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'team_id', t.id,
      'team_name', t.name,
      'description', t.description,
      'user_role', tm.role,
      'joined_at', tm.created_at,
      'team_hackathons', (
        SELECT COALESCE(jsonb_agg(th.hackathon_id), '[]'::jsonb)
        FROM public.team_hackathons th
        WHERE th.team_id = t.id
      ),
      'teammates', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'user_id', tm2.user_id,
            'full_name', p2.full_name,
            'avatar_url', p2.avatar_url,
            'role', tm2.role
          )
        ), '[]'::jsonb)
        FROM public.team_members tm2
        JOIN public.profiles p2 ON p2.id = tm2.user_id
        WHERE tm2.team_id = t.id
      )
    )
  ), '[]'::jsonb)
  INTO v_teams
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.user_id = v_user_uuid;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'team_id', ts.team_id,
      'hackathon_id', ts.hackathon_id,
      'project_title', ts.project_title,
      'demo_url', ts.demo_url,
      'github_url', ts.github_url,
      'pitch_video_url', ts.pitch_video_url,
      'slides_url', ts.slides_url,
      'completion_status', ts.completion_status,
      'submitted_at', ts.updated_at
    )
  ), '[]'::jsonb)
  INTO v_submissions
  FROM public.team_submissions ts
  WHERE ts.team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = v_user_uuid)
    AND ts.completion_status IN ('submitted', 'completed');

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'username', v_profile.username,
      'full_name', v_profile.full_name,
      'email', v_email_val,
      'college', v_profile.college,
      'bio', v_profile.bio,
      'avatar_url', v_profile.avatar_url,
      'skills', v_profile.skills,
      'github_url', v_profile.github_url,
      'linkedin_url', v_profile.linkedin_url,
      'created_at', v_profile.created_at,
      'show_track_record', v_profile.show_track_record
    ),
    'registrations', v_registrations,
    'teams', v_teams,
    'submissions', v_submissions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_builder_profile(TEXT, UUID) TO authenticated, anon;
