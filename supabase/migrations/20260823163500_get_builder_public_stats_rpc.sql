-- Migration: 20260823163500_get_builder_public_stats_rpc
-- Description: Create SECURITY DEFINER function to securely return public stats (connection count, teams count)
-- without leaking private message payloads or being restricted by friend_requests RLS.

CREATE OR REPLACE FUNCTION public.get_builder_public_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connections integer := 0;
  v_teams integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'connections_count', 0,
      'teams_count', 0
    );
  END IF;

  -- Count accepted friend connections for this builder
  SELECT COUNT(*)
  INTO v_connections
  FROM public.friend_requests
  WHERE status = 'accepted'
    AND (sender_id = p_user_id OR receiver_id = p_user_id);

  -- Count teams joined by this builder
  SELECT COUNT(*)
  INTO v_teams
  FROM public.team_members
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'connections_count', COALESCE(v_connections, 0),
    'teams_count', COALESCE(v_teams, 0)
  );
END;
$$;

-- Grant execution to both authenticated users and public visitors
GRANT EXECUTE ON FUNCTION public.get_builder_public_stats(uuid) TO anon, authenticated;
