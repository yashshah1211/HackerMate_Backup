-- REVIEWED ROLLBACK TEMPLATE: generate a new migration with the CLI before release.
-- First release clients that no longer call reject_team_join_request. Never auto-apply this file.
BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.profiles,public.teams,public.team_join_requests,public.team_members,public.team_invites IN SHARE ROW EXCLUSIVE MODE;
UPDATE audit.team_formation_coverage SET ended_at=clock_timestamp();
DROP TRIGGER team_formation_registration ON public.profiles;
DROP TRIGGER team_formation_request ON public.team_join_requests;
DROP TRIGGER team_formation_member_insert ON public.team_members;
DROP TRIGGER team_formation_member_delete ON public.team_members;
DROP TRIGGER team_formation_reassignment ON public.team_members;
CREATE OR REPLACE FUNCTION public.accept_team_invite(p_invite_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_team_name text;
begin
  select i.team_id, t.name into v_team_id, v_team_name
  from public.team_invites i
  join public.teams t on t.id = i.team_id
  where i.id = p_invite_id
    and i.invited_user_id = v_user_id
    and i.status = 'pending'
  for update of i;

  if v_team_id is null then
    raise exception 'Pending invitation not found';
  end if;

  perform public.add_user_to_team(v_team_id, v_user_id, 'member');
  update public.team_invites set status = 'accepted' where id = p_invite_id;
  delete from public.team_join_requests
  where team_id = v_team_id and user_id = v_user_id;
  insert into public.notifications (user_id, message, link)
  values (v_user_id, 'You joined ' || v_team_name, '/teams/' || v_team_id::text);

  return v_team_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.accept_team_join_request(p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_team_id uuid;
  v_requester_id uuid;
begin
  select r.team_id, r.user_id into v_team_id, v_requester_id
  from public.team_join_requests r
  join public.teams t on t.id = r.team_id
  where r.id = p_request_id
    and r.status = 'pending'
    and t.owner_id = auth.uid()
  for update of r;

  if v_team_id is null then
    raise exception 'Pending request not found or not authorized';
  end if;

  perform public.add_user_to_team(v_team_id, v_requester_id, 'member');
  delete from public.team_join_requests where id = p_request_id;
  insert into public.notifications (user_id, message, link)
  values (
    v_requester_id,
    'Your team request was accepted',
    '/teams/' || v_team_id::text
  );

  return v_team_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_team_with_owner(p_name text, p_description text, p_max_members integer, p_college text, p_hackathon_id uuid, p_hackathon_name text, p_skills text[], p_roles_needed text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  IF p_hackathon_id IS NOT NULL THEN
    INSERT INTO public.team_hackathons (team_id, hackathon_id)
    VALUES (v_team_id, p_hackathon_id)
    ON CONFLICT (team_id, hackathon_id) DO NOTHING;
  END IF;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (v_team_id, v_user_id, 'owner');

  RETURN v_team_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.join_team_instantly(p_team_id uuid, p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_is_already_member boolean;
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
$function$
;
DROP FUNCTION public.reject_team_join_request(uuid);
-- Keep private facts/markers and their erasure FKs for investigation and approved
-- retention. Existing daily prune must continue until detail is gone. Aggregate
-- retains endedAt and returns unavailable, never measured zero after rollback.
COMMIT;
