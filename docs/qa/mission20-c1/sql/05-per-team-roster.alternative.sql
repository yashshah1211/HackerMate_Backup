-- REVIEW ONLY. Per-team prototype, never an active migration or FK change.
-- Apply after 01, while admission is frozen, inside the local runner. Replaces the
-- global roster lock and installs a parent-row lock for all membership DML.
-- BEFORE row hooks do not precede executor tuple locks: the local suite also
-- reproduces a residual child-delete/parent-cascade 40P01. Review writer RPC
-- parent pre-locks and controlled retries before any release (see DESIGN.md).
BEGIN;
CREATE FUNCTION mission20_private.lock_roster_parents()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE ids uuid[] := '{}'; parent uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN ids := array_append(ids, OLD.team_id); END IF;
  IF TG_OP <> 'DELETE' THEN ids := array_append(ids, NEW.team_id); END IF;
  FOR parent IN SELECT DISTINCT x.id FROM unnest(ids) x(id) ORDER BY x.id LOOP
    PERFORM 1 FROM public.teams t WHERE t.id=parent FOR UPDATE;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION mission20_private.lock_roster_parents() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER mission20_lock_roster_parents BEFORE INSERT OR UPDATE OR DELETE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION mission20_private.lock_roster_parents();
CREATE OR REPLACE FUNCTION mission20_private.lock_context(p_event_id uuid, p_team_id uuid, p_native boolean, p_reviewed boolean, p_validate_team boolean DEFAULT true)
RETURNS public.hackathons LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_size bigint := 1;
  v_event public.hackathons%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'read_committed_required' USING ERRCODE = '25000';
  END IF;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'sign_in_required' USING ERRCODE = '42501'; END IF;
  -- Database identities/flags, never mutable user_metadata or supplied user IDs.
  PERFORM p.id FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE p.id = v_actor AND p.is_banned IS FALSE
      AND nullif(btrim(u.email), '') IS NOT NULL
      AND coalesce((to_jsonb(u)->>'is_anonymous')::boolean, false) IS FALSE
      AND (to_jsonb(u)->>'deleted_at') IS NULL
      AND coalesce((to_jsonb(u)->>'banned_until')::timestamptz, '-infinity'::timestamptz) <= clock_timestamp()
      AND (NOT p_native OR p.onboarding_completed IS TRUE)
    FOR SHARE OF p, u;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_ineligible' USING ERRCODE = '42501'; END IF;
  IF p_team_id IS NOT NULL AND p_validate_team THEN
    SELECT t.owner_id INTO v_owner FROM public.teams t WHERE t.id = p_team_id FOR UPDATE;
    IF NOT FOUND OR v_owner IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'team_owner_required' USING ERRCODE = '42501';
    END IF;
    IF p_native THEN
      SELECT count(*) INTO v_size FROM (
        SELECT tm.user_id FROM public.team_members tm WHERE tm.team_id = p_team_id
        UNION SELECT v_owner
      ) people;
    END IF;
  END IF;
  SELECT h.* INTO v_event FROM public.hackathons h WHERE h.id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status IS DISTINCT FROM 'approved' OR v_event.archived IS DISTINCT FROM false
    OR (p_native AND v_event.type IS DISTINCT FROM 'native')
    OR (NOT p_native AND (v_event.type IS NULL OR v_event.type NOT IN ('external', 'official'))) THEN
    RAISE EXCEPTION 'event_unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF v_event.max_participants < 0 OR (p_native AND (
    v_event.min_team_size < 1 OR v_event.max_team_size < 1 OR v_event.min_team_size > v_event.max_team_size)) THEN
    RAISE EXCEPTION 'event_configuration_invalid' USING ERRCODE = 'P0001';
  END IF;
  IF p_native AND p_validate_team AND ((v_event.min_team_size IS NOT NULL AND v_size < v_event.min_team_size)
    OR (v_event.max_team_size IS NOT NULL AND v_size > v_event.max_team_size)) THEN
    RAISE EXCEPTION 'team_size_ineligible' USING ERRCODE = 'P0001';
  END IF;
  PERFORM mission20_private.assert_window(to_jsonb(v_event), p_native, p_reviewed);
  RETURN v_event;
END;
$$;

CREATE OR REPLACE FUNCTION mission20_private.register_native(p_hackathon_id uuid,p_team_id uuid,p_reviewed_unknown boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='3s' SET statement_timeout='15s' AS $$
DECLARE v_status text;
BEGIN
  IF p_hackathon_id IS NULL THEN RAISE EXCEPTION 'event_required' USING ERRCODE='22023'; END IF;
  SELECT r.status INTO v_status FROM public.hackathon_registrations r
    WHERE r.hackathon_id=p_hackathon_id AND r.user_id=auth.uid();
  IF FOUND THEN
    -- Read-only retry: no admission/team write. Recheck identity/event and own
    -- row after the event lock; don't acquire a team lock after an event lock.
    PERFORM mission20_private.lock_context(p_hackathon_id,NULL,true,p_reviewed_unknown,false);
    SELECT r.status INTO v_status FROM public.hackathon_registrations r
      WHERE r.hackathon_id=p_hackathon_id AND r.user_id=auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'participation_changed_retry' USING ERRCODE='P0001'; END IF;
    RETURN jsonb_build_object('status',v_status,'alreadyRegistered',true);
  END IF;
  -- Mutating path: account -> parent team -> event, before any insertion.
  PERFORM mission20_private.lock_context(p_hackathon_id,p_team_id,true,p_reviewed_unknown,true);
  SELECT r.status INTO v_status FROM public.hackathon_registrations r
    WHERE r.hackathon_id=p_hackathon_id AND r.user_id=auth.uid();
  IF FOUND THEN RETURN jsonb_build_object('status',v_status,'alreadyRegistered',true); END IF;
  INSERT INTO public.hackathon_registrations(hackathon_id,user_id,team_id)
    VALUES(p_hackathon_id,auth.uid(),p_team_id) RETURNING status INTO v_status;
  RETURN jsonb_build_object('status',v_status,'alreadyRegistered',false);
END;
$$;
COMMIT;
