-- Migration: 20260808180000_fix_profiles_email_privacy_leak
-- Restricts public/anon column-level SELECT on public.profiles.email to eliminate PII leakage over REST API.
-- Email is ONLY viewable by the user themselves, accepted teammates, accepted connection partners, or platform admins.

-- 1. Revoke default full table SELECT permission on public.profiles from anon and authenticated
REVOKE SELECT ON public.profiles FROM anon, authenticated;

-- 2. Grant SELECT on ALL 30 safe, non-sensitive public profile columns to anon and authenticated
GRANT SELECT (
  id,
  full_name,
  college,
  bio,
  avatar_url,
  skills,
  github_url,
  linkedin_url,
  created_at,
  updated_at,
  role,
  is_available,
  onboarding_completed,
  is_banned,
  gender,
  has_participated_hackathon,
  hackathon_participations,
  has_won_hackathon,
  hackathon_wins,
  last_seen_at,
  github_stats,
  github_stats_updated_at,
  onboarding_nudge_sent_at,
  last_onboarding_nudge_sent_at,
  referrer_source,
  profile_nudge_count,
  last_nudge_sent_at,
  sih_broadcast_sent_at,
  username,
  show_track_record
) ON public.profiles TO anon, authenticated;

-- 3. Create SECURITY DEFINER function to safely resolve email for authorized callers
CREATE OR REPLACE FUNCTION public.get_authorized_profile_email(p_target_user_id UUID, p_caller_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_effective_caller UUID;
  v_caller_role TEXT;
  v_target_email TEXT;
  v_is_teammate BOOLEAN := false;
  v_is_connected BOOLEAN := false;
BEGIN
  v_effective_caller := COALESCE(auth.uid(), p_caller_id);
  
  IF v_effective_caller IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Self Check
  IF v_effective_caller = p_target_user_id THEN
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_user_id;
    RETURN v_target_email;
  END IF;

  -- 2. Admin Check
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_effective_caller;
  IF v_caller_role = 'admin' THEN
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_user_id;
    RETURN v_target_email;
  END IF;

  -- 3. Teammate Check (Both belong to at least 1 common team)
  SELECT EXISTS (
    SELECT 1 
    FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = v_effective_caller 
      AND tm2.user_id = p_target_user_id
  ) INTO v_is_teammate;

  IF v_is_teammate THEN
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_user_id;
    RETURN v_target_email;
  END IF;

  -- 4. Accepted Connection Check
  SELECT EXISTS (
    SELECT 1 
    FROM public.connection_requests
    WHERE status = 'accepted'
      AND ((sender_id = v_effective_caller AND receiver_id = p_target_user_id)
        OR (sender_id = p_target_user_id AND receiver_id = v_effective_caller))
  ) INTO v_is_connected;

  IF v_is_connected THEN
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_user_id;
    RETURN v_target_email;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_authorized_profile_email(UUID, UUID) TO authenticated, anon;
