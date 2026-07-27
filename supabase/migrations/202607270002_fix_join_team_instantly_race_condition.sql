-- Migration: 202607270002_fix_join_team_instantly_race_condition
-- Security & Concurrency Fix: Add FOR UPDATE row lock on public.teams in join_team_instantly()
-- to serialize concurrent instant join attempts and prevent capacity overflow race conditions.

CREATE OR REPLACE FUNCTION public.join_team_instantly(p_team_id UUID, p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_team_name TEXT;
  v_parts TEXT[];
  v_token_team_id UUID;
  v_token_expiry numeric;
  v_token_signature TEXT;
  v_expected_signature TEXT;
  v_message TEXT;
  v_secret TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_token IS NULL OR p_token = '' THEN
    RAISE EXCEPTION 'Invite token is required';
  END IF;

  -- Retrieve secret from Supabase Vault
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'hmac_invite_secret'
  LIMIT 1;

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'HMAC secret key is not configured in the database vault';
  END IF;

  -- Parse token: team_id|expiry_epoch|signature
  v_parts := regexp_split_to_array(p_token, '\|');
  IF array_length(v_parts, 1) != 3 THEN
    RAISE EXCEPTION 'Invalid invite token format';
  END IF;

  BEGIN
    v_token_team_id := v_parts[1]::uuid;
    v_token_expiry := v_parts[2]::numeric;
    v_token_signature := v_parts[3];
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Malformed invite token payload';
  END;

  -- Verify team matches
  IF v_token_team_id != p_team_id THEN
    RAISE EXCEPTION 'Invite token does not match this team';
  END IF;

  -- Verify signature
  v_message := v_token_team_id::text || '|' || v_token_expiry::text;
  v_expected_signature := encode(extensions.hmac(v_message::bytea, v_secret::bytea, 'sha256'), 'hex');
  IF v_token_signature != v_expected_signature THEN
    RAISE EXCEPTION 'Invalid invite token signature';
  END IF;

  -- Verify expiration
  IF extract(epoch from now()) > v_token_expiry THEN
    RAISE EXCEPTION 'Invite token has expired';
  END IF;

  -- 🔒 ACQUIRE EXCLUSIVE ROW LOCK ON TEAMS TO SERIALIZE CONCURRENT JOIN ATTEMPTS
  SELECT name INTO v_team_name
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;

  IF v_team_name IS NULL THEN
    RAISE EXCEPTION 'Team not found';
  END IF;

  -- Add user to team (add_user_to_team checks member count while lock is held)
  PERFORM public.add_user_to_team(p_team_id, v_user_id, 'member');

  -- Delete any pending requests or invites for this user on this team
  DELETE FROM public.team_join_requests
  WHERE team_id = p_team_id AND user_id = v_user_id;

  DELETE FROM public.team_invites
  WHERE team_id = p_team_id AND invited_user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_team_instantly(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.join_team_instantly(UUID, TEXT) TO authenticated;
