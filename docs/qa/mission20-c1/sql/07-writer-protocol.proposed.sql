-- REVIEW ONLY. C2 writer prototype, not an active migration or release approval.
-- Run only via the disposable local writer qualification. No base grants/RLS/FK
-- change. Writer pre-locks are primary; NOWAIT is a legacy-child-first backstop.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hackathon_registrations' AND policyname='mission20_release_freeze') THEN
    RAISE EXCEPTION 'admission_freeze_required'; END IF;
END; $$;
CREATE FUNCTION mission20_private.lock_team_parents(p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE parent uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'read_committed_required' USING ERRCODE='25000'; END IF;
  FOR parent IN SELECT DISTINCT x.id FROM unnest(p_ids) x(id) ORDER BY x.id LOOP
    PERFORM 1 FROM public.teams t WHERE t.id=parent FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'team_changed_retry' USING ERRCODE='55P03'; END IF;
  END LOOP;
END; $$;
CREATE FUNCTION mission20_private.lock_team_events(p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE event uuid;
BEGIN
  FOR event IN SELECT DISTINCT r.hackathon_id FROM public.hackathon_registrations r
    WHERE r.team_id=ANY(p_ids) ORDER BY r.hackathon_id LOOP
    PERFORM 1 FROM public.hackathons h WHERE h.id=event FOR UPDATE;
  END LOOP;
END; $$;
-- This helper grants no write authority. The invoker writer still evaluates
-- actual table ACLs/RLS at its DML statement, including any restrictive policy.
CREATE FUNCTION mission20_private.lock_authorized_team(p_team uuid,p_events boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='3s' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.teams t WHERE t.id=p_team
    AND (t.owner_id=auth.uid() OR (NOT p_events AND EXISTS(SELECT 1 FROM public.team_members m WHERE m.team_id=t.id AND m.user_id=auth.uid()))
      OR public.is_admin(auth.uid()))) THEN
    RAISE EXCEPTION 'team_access_required' USING ERRCODE='42501';
  END IF;
  PERFORM mission20_private.lock_team_parents(ARRAY[p_team]);
  IF p_events THEN PERFORM mission20_private.lock_team_events(ARRAY[p_team]); END IF;
END; $$;

CREATE FUNCTION public.mission20_remove_team_member(p_team_id uuid,p_member_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE removed uuid;
BEGIN
  PERFORM mission20_private.lock_authorized_team(p_team_id);
  DELETE FROM public.team_members WHERE team_id=p_team_id AND id=p_member_id RETURNING id INTO removed;
  IF NOT FOUND THEN RAISE EXCEPTION 'membership_change_not_authorized_or_stale' USING ERRCODE='42501'; END IF;
  RETURN removed;
END; $$;
CREATE FUNCTION public.mission20_set_project_role(p_team_id uuid,p_member_id uuid,p_role text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE changed uuid;
BEGIN
  PERFORM mission20_private.lock_authorized_team(p_team_id);
  UPDATE public.team_members SET project_role=p_role WHERE team_id=p_team_id AND id=p_member_id RETURNING id INTO changed;
  IF NOT FOUND THEN RAISE EXCEPTION 'membership_change_not_authorized_or_stale' USING ERRCODE='42501'; END IF;
  RETURN changed;
END; $$;
CREATE FUNCTION public.mission20_delete_team(p_team_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE removed uuid;
BEGIN
  PERFORM mission20_private.lock_authorized_team(p_team_id,true);
  DELETE FROM public.teams WHERE id=p_team_id RETURNING id INTO removed;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_delete_not_authorized_or_stale' USING ERRCODE='42501'; END IF;
  RETURN removed;
END; $$;

-- Privileged qualification/maintenance prototype ONLY; no client EXECUTE and no
-- existing transfer API is replaced. Validate complete parents before any child
-- DML. DELETE+INSERT invokes the real INSERT/DELETE conversation hooks, unlike
-- a raw team_id UPDATE. No ownership handover is invented by this function.
CREATE FUNCTION mission20_private.transfer_members(p_moves jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE parents uuid[]; move record; member public.team_members%ROWTYPE; members public.team_members[]:='{}';
BEGIN
  IF jsonb_typeof(p_moves) IS DISTINCT FROM 'array' OR jsonb_array_length(p_moves)=0 THEN
    RAISE EXCEPTION 'moves_required' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(DISTINCT id ORDER BY id) INTO parents FROM (
    SELECT x.from_team AS id FROM jsonb_to_recordset(p_moves) x(from_team uuid,to_team uuid,user_id uuid)
    UNION SELECT x.to_team FROM jsonb_to_recordset(p_moves) x(from_team uuid,to_team uuid,user_id uuid)
  ) ids;
  IF array_position(parents,NULL) IS NOT NULL OR EXISTS(SELECT 1 FROM jsonb_to_recordset(p_moves) x(from_team uuid,to_team uuid,user_id uuid)
    WHERE x.user_id IS NULL OR x.from_team=x.to_team) OR
    (SELECT count(*) FROM jsonb_to_recordset(p_moves) x(from_team uuid,to_team uuid,user_id uuid)) <>
    (SELECT count(DISTINCT (x.from_team,x.user_id)) FROM jsonb_to_recordset(p_moves) x(from_team uuid,to_team uuid,user_id uuid)) THEN
    RAISE EXCEPTION 'invalid_moves' USING ERRCODE='22023';
  END IF;
  PERFORM mission20_private.lock_team_parents(parents);
  IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_moves) x(from_team uuid,to_team uuid,user_id uuid)
    JOIN public.teams t ON t.id=x.from_team LEFT JOIN public.team_members m ON m.team_id=x.from_team AND m.user_id=x.user_id
    WHERE m.user_id IS NULL OR m.role='owner' OR t.owner_id=x.user_id) THEN
    RAISE EXCEPTION 'transfer_source_changed_or_owner' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.teams t WHERE t.id=ANY(parents) AND t.max_members IS NOT NULL AND
    (SELECT count(*) FROM public.team_members m WHERE m.team_id=t.id)
      -(SELECT count(*) FROM jsonb_to_recordset(p_moves) x(from_team uuid,to_team uuid,user_id uuid) WHERE x.from_team=t.id)
      +(SELECT count(*) FROM jsonb_to_recordset(p_moves) x(from_team uuid,to_team uuid,user_id uuid) WHERE x.to_team=t.id)>t.max_members) THEN
    RAISE EXCEPTION 'team_full' USING ERRCODE='P0001';
  END IF;
  -- Remove every source first so reciprocal moves cannot collide with sources
  -- that are part of this same atomic operation. Retain complete row payload.
  FOR move IN SELECT * FROM jsonb_to_recordset(p_moves) x(from_team uuid,to_team uuid,user_id uuid) ORDER BY from_team,user_id LOOP
    DELETE FROM public.team_members WHERE team_id=move.from_team AND user_id=move.user_id RETURNING * INTO member;
    member.team_id:=move.to_team;
    members:=array_append(members,member);
  END LOOP;
  INSERT INTO public.team_members SELECT * FROM unnest(members) ORDER BY team_id,user_id;
END; $$;

CREATE OR REPLACE FUNCTION mission20_private.lock_roster_parents()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]:='{}'; parent uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'read_committed_required' USING ERRCODE='25000'; END IF;
  IF TG_OP<>'INSERT' THEN ids:=array_append(ids,OLD.team_id); END IF;
  IF TG_OP<>'DELETE' THEN ids:=array_append(ids,NEW.team_id); END IF;
  FOR parent IN SELECT DISTINCT x.id FROM unnest(ids) x(id) ORDER BY x.id LOOP
    -- A legacy direct UPDATE/DELETE may already hold its child tuple. Never
    -- wait for a parent here: abort its entire statement with retryable 55P03.
    PERFORM 1 FROM public.teams t WHERE t.id=parent FOR UPDATE NOWAIT;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION mission20_private.lock_team_parents(uuid[]),mission20_private.lock_team_events(uuid[]),
  mission20_private.lock_authorized_team(uuid,boolean),mission20_private.transfer_members(jsonb),
  public.mission20_remove_team_member(uuid,uuid),public.mission20_set_project_role(uuid,uuid,text),
  public.mission20_delete_team(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION mission20_private.lock_authorized_team(uuid,boolean),public.mission20_remove_team_member(uuid,uuid),
  public.mission20_set_project_role(uuid,uuid,text),public.mission20_delete_team(uuid) TO authenticated;
COMMIT;
