-- REVIEW ONLY. NOT AN ACTIVE MIGRATION. NO PRODUCTION EXECUTION AUTHORIZATION.
-- Deterministic final definitions only; separate committed freeze MUST precede this transaction.
-- Regenerate with node scripts/mission20-atomic-candidate.cjs --write; never run against an existing database.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $mission20_preflight$
DECLARE expected record; actual record;
BEGIN
 IF current_user<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN
  RAISE EXCEPTION 'reviewed_postgres17_owner_required'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'read_committed_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hackathon_registrations'
  AND policyname='mission20_release_freeze' AND permissive='RESTRICTIVE' AND cmd='INSERT' AND with_check='false')
  OR has_any_column_privilege('authenticated','public.hackathon_registrations','INSERT') THEN
  RAISE EXCEPTION 'separately_committed_freeze_and_revoked_insert_required'; END IF;
 IF to_regnamespace('mission20_private') IS NOT NULL THEN RAISE EXCEPTION 'mission20_namespace_drift_stop'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.hackathons'::regclass AND attname='start_date') IS DISTINCT FROM 'date'
 OR (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.hackathons'::regclass AND attname='end_date') IS DISTINCT FROM 'date'
 OR (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.hackathons'::regclass AND attname='registration_start') IS DISTINCT FROM 'timestamp with time zone'
 OR (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.hackathons'::regclass AND attname='registration_end') IS DISTINCT FROM 'timestamp with time zone'
 OR (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.hackathons'::regclass AND attname='type') IS DISTINCT FROM 'character varying(50)' THEN
  RAISE EXCEPTION 'confirmed_event_column_types_required'; END IF;
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RAISE EXCEPTION 'reviewed_ledger_required'; END IF;
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>147 OR
 (SELECT max(version::text) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20261025081515' THEN
  RAISE EXCEPTION 'migration_ledger_drift_stop'; END IF;
 FOR expected IN SELECT * FROM (VALUES
 ('public.accept_team_invite(uuid)','ec636cb3bef80b67420d7967c3ac72c33017e550816b8257a16e956d4eb92cac'),
 ('public.accept_team_join_request(uuid)','e758a8ec46db28b3b1af658eeea8b31c8b533523f82c0998d3c227377d0c7217'),
 ('public.ensure_team_conversation(uuid)','99583e20dfeb8bb970fd948811f9438f90f7dbec3daf7ab0f0a5f4031f8e07b1'),
 ('public.delete_user_completely(uuid)','ea2036ee96a7fac12b49c330bc6d292716cd853763bd956be912a63981291cfe'),
 ('public.add_user_to_team(uuid,uuid,text)','5b5c5ce785d0226bd86f6eb33749ed7af4fd4ddd563650c5735700099df508b4')
 ) AS required(signature,sha256) LOOP
  SELECT p.*,pg_get_userbyid(p.proowner) AS owner INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature);
  IF NOT FOUND THEN RAISE EXCEPTION 'missing_baseline_function: %',expected.signature; END IF;
  IF actual.owner<>'postgres' OR NOT actual.prosecdef OR NOT ('search_path=public, pg_temp'=ANY(coalesce(actual.proconfig,'{}'))) OR
   encode(sha256(convert_to(actual.prosrc,'UTF8')),'hex')<>expected.sha256 THEN
   RAISE EXCEPTION 'unreviewed_function_variant_stop: %',expected.signature; END IF;
 END LOOP;
 IF has_function_privilege('anon','public.add_user_to_team(uuid,uuid,text)','EXECUTE') OR
 has_function_privilege('authenticated','public.add_user_to_team(uuid,uuid,text)','EXECUTE') OR
 has_function_privilege('service_role','public.add_user_to_team(uuid,uuid,text)','EXECUTE') THEN
  RAISE EXCEPTION 'hardened_add_member_private_execute_required'; END IF;
END; $mission20_preflight$;

-- Source stage: expand
SET LOCAL lock_timeout = '3s';

-- Source stage: expand
SET LOCAL statement_timeout = '15s';

-- Source stage: expand
DO $$ BEGIN
  IF current_user <> 'postgres' OR current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'reviewed_postgres_owner_and_version_required';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.hackathon_registrations'::regclass
      AND conname='hackathon_registrations_team_id_fkey'
      AND confrelid='public.teams'::regclass AND confdeltype='c') THEN
    RAISE EXCEPTION 'confirmed_team_cascade_fk_required';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid='public.team_members'::regclass AND c.confrelid='public.teams'::regclass
      AND c.contype='f' AND c.confdeltype='c' AND c.convalidated
      AND c.conkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid='public.team_members'::regclass AND attname='team_id')]::smallint[]) THEN
    RAISE EXCEPTION 'confirmed_membership_cascade_fk_required';
  END IF;
END; $$;

-- Source stage: expand
CREATE SCHEMA mission20_private AUTHORIZATION postgres;

-- Source stage: expand
REVOKE ALL ON SCHEMA mission20_private FROM PUBLIC, anon, authenticated, service_role;

-- Source stage: expand
CREATE FUNCTION mission20_private.boundary(p_value text, p_end boolean DEFAULT false)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = '' AS $$
DECLARE v_date date;
BEGIN
  IF p_value IS NULL OR p_value = '' THEN RETURN NULL; END IF;
  IF p_value ~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_date := p_value::date;
    RETURN ((v_date + CASE WHEN p_end THEN 1 ELSE 0 END)::timestamp AT TIME ZONE 'Asia/Kolkata');
  END IF;
  IF p_value !~* '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$' THEN RETURN NULL; END IF;
  RETURN p_value::timestamptz;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format OR SQLSTATE '22009' THEN RETURN NULL;
END;
$$;

-- Source stage: expand
CREATE FUNCTION mission20_private.assert_window_at(p_event jsonb, p_native boolean, p_reviewed boolean, p_now timestamptz)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = '' AS $$
DECLARE
  v_now timestamptz := p_now;
  v_end timestamptz := mission20_private.boundary(p_event->>'end_date', true);
  v_start timestamptz := mission20_private.boundary(p_event->>'registration_start');
  v_deadline timestamptz := mission20_private.boundary(p_event->>'registration_end', true);
  v_status text := lower(btrim(coalesce(p_event->>'registration_status', '')));
  v_unknown boolean;
BEGIN
  IF v_now IS NULL THEN RAISE EXCEPTION 'clock_required' USING ERRCODE = '22023'; END IF;
  IF v_end IS NOT NULL AND v_now >= v_end THEN
    RAISE EXCEPTION 'event_ended' USING ERRCODE = 'P0001';
  END IF;
  -- Community participation never certifies external/official admission.
  IF NOT p_native THEN RETURN; END IF;
  IF v_status IN ('closed', 'finished', 'cancelled') OR (v_deadline IS NOT NULL AND v_now >= v_deadline) THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = 'P0001';
  END IF;
  IF v_start IS NOT NULL AND v_now < v_start THEN
    RAISE EXCEPTION 'registration_not_open' USING ERRCODE = 'P0001';
  END IF;
  v_unknown := (nullif(p_event->>'registration_start', '') IS NOT NULL AND v_start IS NULL)
    OR (nullif(p_event->>'registration_end', '') IS NOT NULL AND v_deadline IS NULL)
    OR (v_start IS NOT NULL AND v_deadline IS NOT NULL AND v_start >= v_deadline)
    OR NOT ((v_start IS NOT NULL AND v_deadline IS NOT NULL) OR v_status = 'open');
  IF v_unknown AND p_reviewed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'review_registration_required' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- Source stage: expand
CREATE FUNCTION mission20_private.assert_window(p_event jsonb, p_native boolean, p_reviewed boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM mission20_private.assert_window_at(p_event, p_native, p_reviewed, clock_timestamp());
END;
$$;

-- Source stage: per-team
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

-- Source stage: existing-writers
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

-- Source stage: expand
CREATE TRIGGER mission20_registration_write BEFORE INSERT OR UPDATE OR DELETE
ON public.hackathon_registrations FOR EACH ROW EXECUTE FUNCTION mission20_private.guard_registration_write();

-- Source stage: per-team
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

-- Source stage: expand
CREATE FUNCTION public.register_native_hackathon(p_hackathon_id uuid, p_team_id uuid DEFAULT NULL, p_reviewed_unknown boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  SELECT mission20_private.register_native(p_hackathon_id, p_team_id, p_reviewed_unknown);
$$;

-- Source stage: expand
CREATE FUNCTION mission20_private.guard_hackathon_approval()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  -- current_user inside a definer would always be postgres: NEVER use it here.
  v_role text := current_setting('role', true);
  v_trusted boolean;
  v_confirmed_rows bigint;
BEGIN
  v_trusted := v_role = 'service_role' OR (v_role = 'none' AND session_user = 'postgres');
  IF NEW.max_participants < 0 THEN RAISE EXCEPTION 'invalid_capacity' USING ERRCODE = '22023'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.max_participants IS DISTINCT FROM OLD.max_participants AND NEW.max_participants IS NOT NULL THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'read_committed_required' USING ERRCODE = '25000';
    END IF;
    -- Explicitly take the admission lock before a separate fresh count query.
    PERFORM 1 FROM public.hackathons h WHERE h.id = OLD.id FOR UPDATE;
    SELECT count(*) INTO v_confirmed_rows FROM public.hackathon_registrations r
      WHERE r.hackathon_id = OLD.id AND r.status = 'confirmed';
    IF NEW.max_participants < v_confirmed_rows THEN
      RAISE EXCEPTION 'capacity_below_existing_confirmed' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF v_trusted THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR public.has_verified_event_identity() IS DISTINCT FROM true OR NEW.organizer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'event_owner_required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT ((NEW.type = 'native' AND NEW.status = 'pending') OR (NEW.type = 'external' AND NEW.status = 'approved'))
      OR NEW.type IS NULL OR NEW.status IS NULL
      OR coalesce(NEW.ai_feedback, '{}'::jsonb) ?| ARRAY['reviewed_at', 'reviewed_by']
      OR ((NEW.ai_feedback ? 'status') AND NEW.ai_feedback->>'status' IS DISTINCT FROM NEW.status) THEN
      RAISE EXCEPTION 'invalid_initial_approval' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF (NEW.id, NEW.organizer_id, NEW.type, NEW.status) IS DISTINCT FROM (OLD.id, OLD.organizer_id, OLD.type, OLD.status)
      OR jsonb_build_array(NEW.ai_feedback->'status', NEW.ai_feedback->'reviewed_at', NEW.ai_feedback->'reviewed_by')
        IS DISTINCT FROM jsonb_build_array(OLD.ai_feedback->'status', OLD.ai_feedback->'reviewed_at', OLD.ai_feedback->'reviewed_by') THEN
      RAISE EXCEPTION 'approval_transition_requires_admin' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Source stage: expand
CREATE TRIGGER mission20_hackathon_approval BEFORE INSERT OR UPDATE ON public.hackathons
FOR EACH ROW EXECUTE FUNCTION mission20_private.guard_hackathon_approval();

-- Source stage: expand
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mission20_private FROM PUBLIC, anon, authenticated, service_role;

-- Source stage: expand
REVOKE ALL ON FUNCTION public.register_native_hackathon(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;

-- Source stage: expand
GRANT USAGE ON SCHEMA mission20_private TO authenticated;

-- Source stage: expand
GRANT EXECUTE ON FUNCTION mission20_private.register_native(uuid, uuid, boolean) TO authenticated;

-- Source stage: expand
GRANT EXECUTE ON FUNCTION public.register_native_hackathon(uuid, uuid, boolean) TO authenticated;

-- Source stage: writer-protocol
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

-- Source stage: per-team
REVOKE ALL ON FUNCTION mission20_private.lock_roster_parents() FROM PUBLIC,anon,authenticated,service_role;

-- Source stage: per-team
CREATE TRIGGER mission20_lock_roster_parents BEFORE INSERT OR UPDATE OR DELETE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION mission20_private.lock_roster_parents();

-- Source stage: writer-protocol
SET LOCAL lock_timeout='3s';

-- Source stage: writer-protocol
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hackathon_registrations' AND policyname='mission20_release_freeze') THEN
    RAISE EXCEPTION 'admission_freeze_required'; END IF;
END; $$;

-- Source stage: writer-protocol
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

-- Source stage: writer-protocol
CREATE FUNCTION mission20_private.lock_team_events(p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE event uuid;
BEGIN
  FOR event IN SELECT DISTINCT r.hackathon_id FROM public.hackathon_registrations r
    WHERE r.team_id=ANY(p_ids) ORDER BY r.hackathon_id LOOP
    PERFORM 1 FROM public.hackathons h WHERE h.id=event FOR UPDATE;
  END LOOP;
END; $$;

-- Source stage: writer-protocol
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

-- Source stage: writer-protocol
CREATE FUNCTION public.mission20_remove_team_member(p_team_id uuid,p_member_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE removed uuid;
BEGIN
  PERFORM mission20_private.lock_authorized_team(p_team_id);
  DELETE FROM public.team_members WHERE team_id=p_team_id AND id=p_member_id RETURNING id INTO removed;
  IF NOT FOUND THEN RAISE EXCEPTION 'membership_change_not_authorized_or_stale' USING ERRCODE='42501'; END IF;
  RETURN removed;
END; $$;

-- Source stage: writer-protocol
CREATE FUNCTION public.mission20_set_project_role(p_team_id uuid,p_member_id uuid,p_role text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE changed uuid;
BEGIN
  PERFORM mission20_private.lock_authorized_team(p_team_id);
  UPDATE public.team_members SET project_role=p_role WHERE team_id=p_team_id AND id=p_member_id RETURNING id INTO changed;
  IF NOT FOUND THEN RAISE EXCEPTION 'membership_change_not_authorized_or_stale' USING ERRCODE='42501'; END IF;
  RETURN changed;
END; $$;

-- Source stage: writer-protocol
CREATE FUNCTION public.mission20_delete_team(p_team_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE removed uuid;
BEGIN
  PERFORM mission20_private.lock_authorized_team(p_team_id,true);
  DELETE FROM public.teams WHERE id=p_team_id RETURNING id INTO removed;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_delete_not_authorized_or_stale' USING ERRCODE='42501'; END IF;
  RETURN removed;
END; $$;

-- Source stage: writer-protocol
REVOKE ALL ON FUNCTION mission20_private.lock_team_parents(uuid[]),mission20_private.lock_team_events(uuid[]),
  mission20_private.lock_authorized_team(uuid,boolean),
  public.mission20_remove_team_member(uuid,uuid),public.mission20_set_project_role(uuid,uuid,text),
  public.mission20_delete_team(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Source stage: writer-protocol
GRANT EXECUTE ON FUNCTION mission20_private.lock_authorized_team(uuid,boolean),public.mission20_remove_team_member(uuid,uuid),
  public.mission20_set_project_role(uuid,uuid,text),public.mission20_delete_team(uuid) TO authenticated;

-- Source stage: existing-writers
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hackathon_registrations' AND policyname='mission20_release_freeze')
 OR to_regprocedure('mission20_private.lock_team_parents(uuid[])') IS NULL THEN
  RAISE EXCEPTION 'frozen_writer_protocol_required'; END IF;
END; $$;

-- Source stage: existing-writers
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

-- Source stage: existing-writers
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

-- Source stage: existing-writers
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

-- Source stage: existing-writers
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

-- Source stage: cancel
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hackathon_registrations' AND policyname='mission20_release_freeze') THEN
  RAISE EXCEPTION 'admission_freeze_required'; END IF;
END; $$;

-- Source stage: cancel
CREATE FUNCTION mission20_private.lock_own_cancellation(p_event_id uuid,p_registration_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE v_team uuid;
BEGIN
 SELECT team_id INTO v_team FROM public.hackathon_registrations
 WHERE id=p_registration_id AND hackathon_id=p_event_id AND user_id=auth.uid();
 IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'participation_changed_retry' USING ERRCODE='55P03'; END IF;
 PERFORM mission20_private.lock_team_parents(CASE WHEN v_team IS NULL THEN '{}'::uuid[] ELSE ARRAY[v_team] END);
 PERFORM 1 FROM public.hackathons WHERE id=p_event_id FOR UPDATE;
END; $$;

-- Source stage: cancel
CREATE FUNCTION public.mission20_cancel_registration(p_event_id uuid,p_registration_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE removed uuid;
BEGIN
 PERFORM mission20_private.lock_own_cancellation(p_event_id,p_registration_id);
 -- Retain existing ACL/RLS, owner-only linkage removal and self cancellation.
 DELETE FROM public.team_hackathons th WHERE th.hackathon_id=p_event_id AND public.is_team_owner(th.team_id)
   AND th.team_id=(SELECT r.team_id FROM public.hackathon_registrations r
     WHERE r.id=p_registration_id AND r.user_id=auth.uid() AND r.hackathon_id=p_event_id);
 DELETE FROM public.hackathon_registrations WHERE id=p_registration_id AND hackathon_id=p_event_id AND user_id=auth.uid() RETURNING id INTO removed;
 IF NOT FOUND THEN RAISE EXCEPTION 'participation_changed_retry' USING ERRCODE='55P03'; END IF;
 RETURN removed;
END; $$;

-- Source stage: cancel
REVOKE ALL ON FUNCTION mission20_private.lock_own_cancellation(uuid,uuid),public.mission20_cancel_registration(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Source stage: cancel
GRANT EXECUTE ON FUNCTION mission20_private.lock_own_cancellation(uuid,uuid),public.mission20_cancel_registration(uuid,uuid) TO authenticated;
DO $mission20_final$ BEGIN
 IF position('LOCK TABLE' in upper(pg_get_functiondef('mission20_private.lock_context(uuid,uuid,boolean,boolean,boolean)'::regprocedure)))>0
 OR position('NOWAIT' in pg_get_functiondef('mission20_private.lock_roster_parents()'::regprocedure))=0
 OR position('NOWAIT' in pg_get_functiondef('mission20_private.guard_registration_write()'::regprocedure))=0
 OR to_regprocedure('public.mission20_cancel_registration(uuid,uuid)') IS NULL
 OR to_regprocedure('mission20_private.transfer_members(jsonb)') IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE policyname='mission20_release_freeze' AND schemaname='public' AND tablename='hackathon_registrations') THEN
  RAISE EXCEPTION 'atomic_final_protocol_required'; END IF;
END; $mission20_final$;
COMMIT;
