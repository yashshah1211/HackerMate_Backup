-- REVIEW ONLY. Generated complete writer prototypes; never an active migration.
-- Source: f7845bc5993a8145782b1d614c62a391c1012081; regenerate/check with scripts/mission20-c1-writer-proposals.cjs.
-- No caller/target/owner/protection/storage/audit checks removed. No ACL changes
-- for existing functions: CREATE OR REPLACE preserves their existing grants.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hackathon_registrations' AND policyname='mission20_release_freeze')
 OR to_regprocedure('mission20_private.lock_team_parents(uuid[])') IS NULL THEN
  RAISE EXCEPTION 'frozen_writer_protocol_required'; END IF;
END; $$;
create or replace function public.accept_team_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
SET lock_timeout='3s' SET statement_timeout='15s'
AS $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_team_name text;
begin

  -- M20 LOCK BEGIN
  select i.team_id into v_team_id from public.team_invites i
  where i.id=p_invite_id and i.invited_user_id=v_user_id and i.status='pending';
  if v_team_id is null then raise exception 'Pending invitation not found'; end if;
  perform mission20_private.lock_team_parents(ARRAY[v_team_id]);
  v_team_id:=null;
  -- M20 LOCK END
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
$$;

create or replace function public.accept_team_join_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
SET lock_timeout='3s' SET statement_timeout='15s'
AS $$
declare
  v_team_id uuid;
  v_requester_id uuid;
begin

  -- M20 LOCK BEGIN
  select r.team_id into v_team_id from public.team_join_requests r join public.teams t on t.id=r.team_id
  where r.id=p_request_id and r.status='pending' and t.owner_id=auth.uid();
  if v_team_id is null then raise exception 'Pending request not found or not authorized'; end if;
  perform mission20_private.lock_team_parents(ARRAY[v_team_id]);
  v_team_id:=null;
  -- M20 LOCK END
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
$$;

CREATE OR REPLACE FUNCTION public.ensure_team_conversation(p_team_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout='3s' SET statement_timeout='15s'
AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
  -- Only team members may call this
  IF NOT public.is_team_member(p_team_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;


  -- M20 LOCK BEGIN
  PERFORM mission20_private.lock_team_parents(ARRAY[p_team_id]);
  IF NOT public.is_team_member(p_team_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
  -- M20 LOCK END
  -- Try to find an existing conversation first
  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE team_id = p_team_id AND type = 'team'
  LIMIT 1;

  IF v_conversation_id IS NULL THEN
    -- Insert, ignoring a race-condition duplicate
    INSERT INTO public.conversations (type, team_id)
    VALUES ('team', p_team_id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_conversation_id;

    -- If a concurrent session inserted simultaneously, fetch it now
    IF v_conversation_id IS NULL THEN
      SELECT id INTO v_conversation_id
      FROM public.conversations
      WHERE team_id = p_team_id AND type = 'team'
      LIMIT 1;
    END IF;
  END IF;

  -- Ensure the calling user is a conversation participant
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conversation_id, auth.uid())
  ON CONFLICT DO NOTHING;

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_completely(p_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout='3s' SET statement_timeout='15s'
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller record;
  v_target record;
  v_team record;
  v_successor uuid;
  v_audit_count bigint;
  -- M20 LOCK BEGIN
  v_team_ids uuid[];
  -- M20 LOCK END

BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT p.role, p.is_banned, u.email INTO v_caller
  FROM public.profiles p JOIN auth.users u ON u.id = p.id
  WHERE p.id = v_caller_id FOR SHARE OF p, u;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caller not found' USING ERRCODE = '42501';
  END IF;
  -- Keep the existing self-delete entry point. Deleting another account needs
  -- a current non-banned DB admin or the exact authenticated founder identity.
  IF v_caller_id <> p_target_user_id AND (
    v_caller.is_banned IS TRUE OR
    (v_caller.role IS DISTINCT FROM 'admin' AND
      lower(btrim(coalesce(v_caller.email, ''))) <> 'yashshah7117@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;

  SELECT p.role, u.email INTO v_target
  FROM public.profiles p JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_target_user_id FOR UPDATE OF p, u;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target account not found' USING ERRCODE = 'P0002';
  END IF;
  -- Recheck under lock: the HTTP preflight alone cannot protect a role/email
  -- changed between its reads and the deletion transaction.
  IF v_caller_id <> p_target_user_id AND (
    v_target.role = 'admin' OR
    lower(btrim(coalesce(v_target.email, ''))) = 'yashshah7117@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Protected administrator account' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects
             WHERE owner = p_target_user_id OR owner_id = p_target_user_id::text) THEN
    RAISE EXCEPTION 'Owned storage objects must be resolved before deletion' USING ERRCODE = 'P0001';
  END IF;


  -- M20 LOCK BEGIN
  -- Include NON-owned memberships and team-linked registrations before any child
  -- DML or Auth cascade. The existing caller/target identity locks stay first.
  SELECT array_agg(id ORDER BY id) INTO v_team_ids FROM (
    SELECT id FROM public.teams WHERE owner_id=p_target_user_id
    UNION SELECT team_id FROM public.team_members WHERE user_id=p_target_user_id
    UNION SELECT team_id FROM public.hackathon_registrations WHERE user_id=p_target_user_id AND team_id IS NOT NULL
  ) affected;
  PERFORM mission20_private.lock_team_parents(coalesce(v_team_ids,'{}'));
  -- One sorted union: do not lock separate event subsets in different orders.
  PERFORM h.id FROM public.hackathons h WHERE EXISTS(
    SELECT 1 FROM public.hackathon_registrations r WHERE r.hackathon_id=h.id
      AND (r.user_id=p_target_user_id OR r.team_id=ANY(v_team_ids))) ORDER BY h.id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.teams t WHERE t.owner_id=p_target_user_id AND NOT(t.id=ANY(coalesce(v_team_ids,'{}'))))
    OR EXISTS(SELECT 1 FROM public.team_members m WHERE m.user_id=p_target_user_id AND NOT(m.team_id=ANY(coalesce(v_team_ids,'{}')))) THEN
    RAISE EXCEPTION 'membership_scope_changed_retry' USING ERRCODE='55P03';
  END IF;
  -- M20 LOCK END
  FOR v_team IN
    SELECT id, name FROM public.teams WHERE owner_id = p_target_user_id
    ORDER BY id FOR UPDATE
  LOOP
    -- Membership is unique on (team_id, user_id). Lock existing memberships
    -- before choosing an owner; never interpret a failed lookup as an empty team.
    PERFORM 1 FROM public.team_members WHERE team_id = v_team.id
    ORDER BY user_id FOR UPDATE;
    v_successor := NULL;
    SELECT m.user_id INTO v_successor
    FROM public.team_members m JOIN public.profiles p ON p.id = m.user_id
    WHERE m.team_id = v_team.id AND m.user_id <> p_target_user_id
      AND p.is_banned IS NOT TRUE
    ORDER BY m.created_at ASC NULLS LAST, m.user_id ASC
    LIMIT 1 FOR UPDATE OF m, p NOWAIT;
    IF v_successor IS NOT NULL THEN
      UPDATE public.teams SET owner_id = v_successor
      WHERE id = v_team.id AND owner_id = p_target_user_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Team ownership changed' USING ERRCODE = 'P0001';
      END IF;
      UPDATE public.team_members SET role = 'member'
      WHERE team_id = v_team.id AND role = 'owner' AND user_id <> v_successor;
      UPDATE public.team_members SET role = 'owner'
      WHERE team_id = v_team.id AND user_id = v_successor;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Successor membership missing' USING ERRCODE = 'P0001';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = v_team.id AND owner_id = v_successor)
        OR NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = v_team.id
                       AND user_id = v_successor AND role = 'owner')
        OR (SELECT count(*) FROM public.team_members WHERE team_id = v_team.id AND role = 'owner') <> 1 THEN
        RAISE EXCEPTION 'Ownership handover incomplete' USING ERRCODE = 'P0001';
      END IF;
      -- Notification failure aborts the transaction rather than hiding a partial
      -- handover. No mutation error is swallowed.
      INSERT INTO public.notifications (user_id, message, link)
      VALUES (v_successor,
        'You have been promoted to owner of team "' || v_team.name || '" because the previous owner left.',
        '/teams/' || v_team.id::text);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Successor notification missing' USING ERRCODE = 'P0001';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM public.team_members
                  WHERE team_id = v_team.id AND user_id <> p_target_user_id) THEN
      RAISE EXCEPTION 'No eligible successor for occupied team' USING ERRCODE = 'P0001';
    ELSE
      DELETE FROM public.teams WHERE id = v_team.id AND owner_id = p_target_user_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Team ownership changed' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END LOOP;

  -- Current notifications.user_id has no FK. Other dependent records follow
  -- verified CASCADE / SET NULL constraints; NO ACTION blockers abort everything.
  DELETE FROM public.notifications WHERE user_id = p_target_user_id;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE user_id = p_target_user_id) THEN
    RAISE EXCEPTION 'Notification cleanup incomplete' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_audit_count FROM public.deleted_user_logs WHERE user_id = p_target_user_id;
  DELETE FROM auth.users WHERE id = p_target_user_id;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Account deletion incomplete' USING ERRCODE = 'P0001';
  END IF;
  -- The existing audit trigger swallows insert failures. Require its record so
  -- an audit failure rolls back deletion instead of silently losing evidence.
  IF (SELECT count(*) FROM public.deleted_user_logs WHERE user_id = p_target_user_id) <= v_audit_count THEN
    RAISE EXCEPTION 'Deletion audit record missing' USING ERRCODE = 'P0001';
  END IF;
  -- M20 LOCK BEGIN
EXCEPTION WHEN deadlock_detected OR lock_not_available THEN
  -- Preserve rollback and expose a bounded retryable failure, never success.
  RAISE EXCEPTION 'team_write_retry' USING ERRCODE='55P03', DETAIL='Original SQLSTATE: '||SQLSTATE;
  -- M20 LOCK END
END;
$$;

CREATE OR REPLACE FUNCTION mission20_private.guard_registration_write()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' SET lock_timeout = '3s' SET statement_timeout = '15s' AS $$
DECLARE v_event public.hackathons%ROWTYPE; v_confirmed_rows bigint; v_native boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Includes cancellations/admin cascades; never blocks leaving an ended event.
    PERFORM 1 FROM public.hackathons h WHERE h.id = OLD.hackathon_id FOR UPDATE NOWAIT;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Preserve preferences, hidden state and guarded track metadata after closure.
    -- No existing writer edits admission identity/status. Future promotions need
    -- a separately reviewed, event-locked mechanism, not a privileged raw UPDATE.
    IF (NEW.id, NEW.hackathon_id, NEW.user_id, NEW.team_id, NEW.status, NEW.created_at)
      IS DISTINCT FROM (OLD.id, OLD.hackathon_id, OLD.user_id, OLD.team_id, OLD.status, OLD.created_at) THEN
      RAISE EXCEPTION 'registration_identity_and_status_immutable' USING ERRCODE = '42501';
    END IF;
    -- Confirmed production FK is ON DELETE CASCADE, not SET NULL. Parent team
    -- deletion takes the DELETE branch and removes the registration row.
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public'
    AND tablename='hackathon_registrations' AND policyname IN ('mission20_release_freeze','mission20_admission_frozen')) THEN
    RAISE EXCEPTION 'new_admission_frozen' USING ERRCODE='P0001';
  END IF;
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'registration_identity_mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT h.type = 'native' INTO v_native FROM public.hackathons h WHERE h.id = NEW.hackathon_id;
  v_event := mission20_private.lock_context(NEW.hackathon_id, NEW.team_id, coalesce(v_native, false), true);
  -- Compatibility contract: max_participants is enforced as a limit on
  -- confirmed REGISTRATION ROWS, not teams or distinct human participants.
  -- Separate SQL command after acquiring the event lock: fresh READ COMMITTED
  -- snapshot sees the previous registrant's committed insertion.
  SELECT count(*) INTO v_confirmed_rows FROM public.hackathon_registrations r
    WHERE r.hackathon_id = NEW.hackathon_id AND r.status = 'confirmed';
  NEW.status := CASE WHEN v_event.max_participants IS NOT NULL AND v_confirmed_rows >= v_event.max_participants
    THEN 'waitlisted' ELSE 'confirmed' END;
  PERFORM mission20_private.assert_window(to_jsonb(v_event), coalesce(v_native, false), true);
  RETURN NEW;
END;
$$;
COMMIT;
