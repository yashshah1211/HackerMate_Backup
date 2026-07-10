-- Migration: 202607100007_require_signed_invite_tokens
-- Security fix M8: Require signed invite tokens for instant team joins.
--
-- Adds generate_team_invite_token(uuid) which generates a signed HMAC token
-- valid for 7 days, restricting generation to the team owner.
--
-- Replaces join_team_instantly(uuid) with join_team_instantly(uuid, text) which
-- decodes, validates the signature, verifies expiration, and joins the team.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Create function to generate signed team invite tokens
CREATE OR REPLACE FUNCTION public.generate_team_invite_token(p_team_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_expiry TIMESTAMP WITH TIME ZONE;
  v_message TEXT;
  v_secret TEXT := 'hackermate-secret-key-for-hmac-tokens-please-do-not-change';
  v_signature TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify user is the team owner
  IF NOT public.is_team_owner(p_team_id) THEN
    RAISE EXCEPTION 'Access denied: only the team owner can generate invite tokens';
  END IF;

  v_expiry := now() + INTERVAL '7 days';
  v_message := p_team_id::text || '|' || extract(epoch from v_expiry)::text;
  v_signature := encode(hmac(v_message::bytea, v_secret::bytea, 'sha256'), 'hex');

  RETURN v_message || '|' || v_signature;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_team_invite_token(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.generate_team_invite_token(UUID) TO authenticated;

-- 2. Update join_team_instantly to require and validate a token
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
  v_secret TEXT := 'hackermate-secret-key-for-hmac-tokens-please-do-not-change';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_token IS NULL OR p_token = '' THEN
    RAISE EXCEPTION 'Invite token is required';
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
  v_expected_signature := encode(hmac(v_message::bytea, v_secret::bytea, 'sha256'), 'hex');
  IF v_token_signature != v_expected_signature THEN
    RAISE EXCEPTION 'Invalid invite token signature';
  END IF;

  -- Verify expiration
  IF extract(epoch from now()) > v_token_expiry THEN
    RAISE EXCEPTION 'Invite token has expired';
  END IF;

  -- Fetch team name
  SELECT name INTO v_team_name
  FROM public.teams
  WHERE id = p_team_id;

  IF v_team_name IS NULL THEN
    RAISE EXCEPTION 'Team not found';
  END IF;

  -- Add user to team
  PERFORM public.add_user_to_team(p_team_id, v_user_id, 'member');

  -- Delete any pending requests
  DELETE FROM public.team_join_requests
  WHERE team_id = p_team_id AND user_id = v_user_id;

  -- Notify user
  INSERT INTO public.notifications (user_id, message, link)
  VALUES (v_user_id, 'You joined ' || v_team_name || ' via invite link', '/teams/' || p_team_id::text);
END;
$$;

-- Revoke execute on the new function signature from public and grant to authenticated
REVOKE ALL ON FUNCTION public.join_team_instantly(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.join_team_instantly(UUID, TEXT) TO authenticated;

-- Drop the old single-parameter function to avoid conflicts
DROP FUNCTION IF EXISTS public.join_team_instantly(UUID);
