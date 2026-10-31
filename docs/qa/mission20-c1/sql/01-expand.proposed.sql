-- REVIEW ONLY. NOT A MIGRATION. NOT EXECUTED. See DESIGN.md and TEST-PLAN.md.
-- A later approved release must generate real migration filenames and rehearse
-- these objects against an isolated PostgreSQL fixture before any promotion.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
DO $$ BEGIN
  IF current_user <> 'postgres' OR current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'reviewed_postgres_owner_and_version_required';
  END IF;
END; $$;

-- Deliberately fail if this namespace already exists: inspect ownership/drift.
CREATE SCHEMA mission20_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA mission20_private FROM PUBLIC, anon, authenticated, service_role;

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

-- Only internal code can execute the clock-injected helper. Admission always
-- uses this wrapper's database clock; the RPC accepts no clock parameter.
CREATE FUNCTION mission20_private.assert_window(p_event jsonb, p_native boolean, p_reviewed boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM mission20_private.assert_window_at(p_event, p_native, p_reviewed, clock_timestamp());
END;
$$;

-- Called only by the restricted worker/trigger, never directly by clients.
CREATE FUNCTION mission20_private.lock_context(p_event_id uuid, p_team_id uuid, p_native boolean, p_reviewed boolean, p_validate_team boolean DEFAULT true)
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
  SELECT h.* INTO v_event FROM public.hackathons h WHERE h.id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status IS DISTINCT FROM 'approved' OR v_event.archived IS DISTINCT FROM false
    OR (p_native AND v_event.type IS DISTINCT FROM 'native')
    OR (NOT p_native AND (v_event.type IS NULL OR v_event.type NOT IN ('external', 'official'))) THEN
    RAISE EXCEPTION 'event_unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF p_team_id IS NOT NULL AND p_validate_team THEN
    SELECT t.owner_id INTO v_owner FROM public.teams t WHERE t.id = p_team_id FOR SHARE;
    IF NOT FOUND OR v_owner IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'team_owner_required' USING ERRCODE = '42501';
    END IF;
    IF p_native THEN
      -- Correctness-first proposal: blocks roster phantoms AND departures.
      -- SHARE locks coexist for registrations, but delay all roster DML.
      -- Review the contention trade-off before approving this design.
      LOCK TABLE public.team_members IN SHARE MODE;
      SELECT count(*) INTO v_size FROM (
        SELECT tm.user_id FROM public.team_members tm WHERE tm.team_id = p_team_id
        UNION SELECT v_owner
      ) people;
    END IF;
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

-- Owner postgres is an intentional elevated boundary for authoritative counts.
-- No role membership/BYPASSRLS role or base-table read grant is added.
CREATE FUNCTION mission20_private.guard_registration_write()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' SET lock_timeout = '3s' SET statement_timeout = '15s' AS $$
DECLARE v_event public.hackathons%ROWTYPE; v_confirmed bigint; v_native boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Includes cancellations/admin cascades; never blocks leaving an ended event.
    PERFORM 1 FROM public.hackathons h WHERE h.id = OLD.hackathon_id FOR UPDATE;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Preserve preferences, hidden state and guarded track metadata after closure.
    -- No existing writer edits admission identity/status. Future promotions need
    -- a separately reviewed, event-locked mechanism, not a privileged raw UPDATE.
    IF (NEW.id, NEW.hackathon_id, NEW.user_id, NEW.status, NEW.created_at)
      IS DISTINCT FROM (OLD.id, OLD.hackathon_id, OLD.user_id, OLD.status, OLD.created_at)
      OR (NEW.team_id IS DISTINCT FROM OLD.team_id AND NOT (
        NEW.team_id IS NULL AND OLD.team_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM public.teams t WHERE t.id = OLD.team_id))) THEN
      RAISE EXCEPTION 'registration_identity_and_status_immutable' USING ERRCODE = '42501';
    END IF;
    -- Permit a genuine FK ON DELETE SET NULL after its parent disappeared.
    -- Column ACLs still forbid callers from manually changing team_id.
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'registration_identity_mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT h.type = 'native' INTO v_native FROM public.hackathons h WHERE h.id = NEW.hackathon_id;
  v_event := mission20_private.lock_context(NEW.hackathon_id, NEW.team_id, coalesce(v_native, false), true);
  -- Separate SQL command after acquiring the event lock: fresh READ COMMITTED
  -- snapshot sees the previous registrant's committed insertion.
  SELECT count(*) INTO v_confirmed FROM public.hackathon_registrations r
    WHERE r.hackathon_id = NEW.hackathon_id AND r.status = 'confirmed';
  NEW.status := CASE WHEN v_event.max_participants IS NOT NULL AND v_confirmed >= v_event.max_participants
    THEN 'waitlisted' ELSE 'confirmed' END;
  PERFORM mission20_private.assert_window(to_jsonb(v_event), coalesce(v_native, false), true);
  RETURN NEW;
END;
$$;
CREATE TRIGGER mission20_registration_write BEFORE INSERT OR UPDATE OR DELETE
ON public.hackathon_registrations FOR EACH ROW EXECUTE FUNCTION mission20_private.guard_registration_write();

CREATE FUNCTION mission20_private.register_native(p_hackathon_id uuid, p_team_id uuid, p_reviewed_unknown boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' SET lock_timeout = '3s' SET statement_timeout = '15s' AS $$
DECLARE v_status text;
BEGIN
  IF p_hackathon_id IS NULL THEN RAISE EXCEPTION 'event_required' USING ERRCODE = '22023'; END IF;
  -- Match the existing endpoint: after identity/event restrictions, a retry
  -- returns its existing row without reinterpreting a replacement team input.
  PERFORM mission20_private.lock_context(p_hackathon_id, NULL, true, p_reviewed_unknown, false);
  SELECT r.status INTO v_status FROM public.hackathon_registrations r
    WHERE r.hackathon_id = p_hackathon_id AND r.user_id = auth.uid();
  IF FOUND THEN RETURN jsonb_build_object('status', v_status, 'alreadyRegistered', true); END IF;
  PERFORM mission20_private.lock_context(p_hackathon_id, p_team_id, true, p_reviewed_unknown, true);
  INSERT INTO public.hackathon_registrations(hackathon_id, user_id, team_id)
    VALUES (p_hackathon_id, auth.uid(), p_team_id) RETURNING status INTO v_status;
  RETURN jsonb_build_object('status', v_status, 'alreadyRegistered', false);
END;
$$;

CREATE FUNCTION public.register_native_hackathon(p_hackathon_id uuid, p_team_id uuid DEFAULT NULL, p_reviewed_unknown boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  SELECT mission20_private.register_native(p_hackathon_id, p_team_id, p_reviewed_unknown);
$$;

CREATE FUNCTION mission20_private.guard_hackathon_approval()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  -- current_user inside a definer would always be postgres: NEVER use it here.
  v_role text := current_setting('role', true);
  v_trusted boolean;
  v_confirmed bigint;
BEGIN
  v_trusted := v_role = 'service_role' OR (v_role = 'none' AND session_user = 'postgres');
  IF NEW.max_participants < 0 THEN RAISE EXCEPTION 'invalid_capacity' USING ERRCODE = '22023'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.max_participants IS DISTINCT FROM OLD.max_participants AND NEW.max_participants IS NOT NULL THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'read_committed_required' USING ERRCODE = '25000';
    END IF;
    -- Explicitly take the admission lock before a separate fresh count query.
    PERFORM 1 FROM public.hackathons h WHERE h.id = OLD.id FOR UPDATE;
    SELECT count(*) INTO v_confirmed FROM public.hackathon_registrations r
      WHERE r.hackathon_id = OLD.id AND r.status = 'confirmed';
    IF NEW.max_participants < v_confirmed THEN
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
CREATE TRIGGER mission20_hackathon_approval BEFORE INSERT OR UPDATE ON public.hackathons
FOR EACH ROW EXECUTE FUNCTION mission20_private.guard_hackathon_approval();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mission20_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.register_native_hackathon(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
-- Private worker remains safe even if explicitly called by a SQL client: it
-- accepts no caller identity/status, and repeats all authorization internally.
-- Keep this schema OUT of exposed Data API schemas; do not change that config.
GRANT USAGE ON SCHEMA mission20_private TO authenticated;
GRANT EXECUTE ON FUNCTION mission20_private.register_native(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_native_hackathon(uuid, uuid, boolean) TO authenticated;
COMMIT;
