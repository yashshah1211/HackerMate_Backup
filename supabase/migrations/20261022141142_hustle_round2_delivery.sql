-- Unapplied. Separate production recovery, migration and delivery approvals required.
-- No existing table/function ACLs or participant authorization predicates are changed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Trusted postgres executor required'; END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname LIKE 'hustle_phase2_%') <> 17
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname LIKE 'hustle_phase2_%' AND p.proowner<>'postgres'::regrole)
 THEN RAISE EXCEPTION 'STOP: expected trusted Phase 2 baseline'; END IF;
END $$;

CREATE TABLE public.hustle_phase2_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 team_id uuid NOT NULL UNIQUE REFERENCES public.hustle_phase2_teams(id),
 batch_id uuid NOT NULL REFERENCES public.hustle_phase2_batches(id),
 token_hash text NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 scheduled_at timestamptz NOT NULL CHECK(scheduled_at < '2026-10-23T17:30:00Z'),
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','dispatching','accepted','rejected','failed','unknown')),
 provider_id uuid UNIQUE, provider_code integer CHECK(provider_code BETWEEN 100 AND 599),
 prepared_by uuid NOT NULL REFERENCES auth.users(id), prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 attempted_at timestamptz, finished_at timestamptz,
 CHECK ((status='prepared') = (attempted_at IS NULL)),
 CHECK ((status IN ('prepared','dispatching')) = (finished_at IS NULL)),
 CHECK ((status='accepted') = (provider_id IS NOT NULL))
);
CREATE TABLE public.hustle_phase2_delivery_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 delivery_id uuid NOT NULL REFERENCES public.hustle_phase2_deliveries(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL CHECK(action IN ('prepared','dispatching','accepted','rejected','failed','unknown')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.hustle_phase2_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hustle_phase2_delivery_events ENABLE ROW LEVEL SECURITY;
-- No browser or service raw-table access; only four narrowly scoped service RPCs.
REVOKE ALL ON public.hustle_phase2_deliveries,public.hustle_phase2_delivery_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.hustle_phase2_delivery_prepare(p_actor uuid,p_batch uuid,p_digest text,p_count integer,p_scheduled timestamptz,p_entries jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.hustle_phase2_batches%ROWTYPE; t public.hustle_phase2_teams%ROWTYPE;
 e jsonb; d public.hustle_phase2_deliveries%ROWTYPE; v_id uuid; n integer:=0;
BEGIN
 IF NOT public.hustle_phase2_authorized(p_actor,true) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(20261023,1);
 IF p_count IS NULL OR p_count NOT BETWEEN 1 AND 500 OR p_scheduled IS NULL OR p_scheduled < clock_timestamp()+interval '5 minutes'
 OR p_scheduled >= '2026-10-23T17:30:00Z' OR public.hustle_phase2_window(clock_timestamp())='closed'
 OR jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid launch scope'; END IF;
 SELECT * INTO b FROM public.hustle_phase2_batches WHERE id=p_batch FOR UPDATE;
 IF NOT FOUND OR b.event_id<>'0da43cba-90dc-449c-a126-a2fc8be8a379' OR b.source_digest IS DISTINCT FROM p_digest
 OR b.row_count<>p_count OR p_count<>(SELECT count(*) FROM public.hustle_phase2_teams WHERE batch_id=p_batch)
 OR jsonb_array_length(p_entries)<>p_count
 OR (SELECT count(DISTINCT value->>'team_id') FROM jsonb_array_elements(p_entries))<>p_count
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_entries) x WHERE NOT EXISTS(SELECT 1 FROM public.hustle_phase2_teams WHERE id=(x->>'team_id')::uuid AND batch_id=p_batch))
 THEN RAISE EXCEPTION 'Approved batch mismatch'; END IF;
 -- Lock ordering matches participant response/revocation: team, then invitation.
 FOR t IN SELECT * FROM public.hustle_phase2_teams WHERE batch_id=p_batch ORDER BY id FOR UPDATE LOOP
  SELECT value INTO e FROM jsonb_array_elements(p_entries) WHERE value->>'team_id'=t.id::text;
  IF (e->>'token_hash') IS NULL OR (e->>'token_hash') !~ '^[a-f0-9]{64}$' OR (e->>'payload_hash') IS NULL OR (e->>'payload_hash') !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'Invalid delivery integrity'; END IF;
  SELECT * INTO d FROM public.hustle_phase2_deliveries WHERE team_id=t.id;
  IF FOUND THEN
   IF d.batch_id<>p_batch OR d.token_hash<>e->>'token_hash' OR d.payload_hash<>e->>'payload_hash' OR d.scheduled_at<>p_scheduled
   THEN RAISE EXCEPTION 'Existing launch mismatch; no replacement'; END IF;
   CONTINUE;
  END IF;
  IF t.decision<>'pending' OR EXISTS(SELECT 1 FROM public.hustle_phase2_invites WHERE team_id=t.id)
  THEN RAISE EXCEPTION 'Existing decision or invitation; STOP'; END IF;
 END LOOP;
 -- Existing reviewed activation/issuance routines; all changes roll back together.
 PERFORM public.hustle_phase2_activate(p_actor,p_batch,p_digest);
 FOR t IN SELECT * FROM public.hustle_phase2_teams WHERE batch_id=p_batch ORDER BY id LOOP
  IF EXISTS(SELECT 1 FROM public.hustle_phase2_deliveries WHERE team_id=t.id) THEN CONTINUE; END IF;
  SELECT value INTO e FROM jsonb_array_elements(p_entries) WHERE value->>'team_id'=t.id::text;
  PERFORM public.hustle_phase2_invite(p_actor,t.id,e->>'token_hash');
  INSERT INTO public.hustle_phase2_deliveries(team_id,batch_id,token_hash,payload_hash,scheduled_at,prepared_by)
   VALUES(t.id,p_batch,e->>'token_hash',e->>'payload_hash',p_scheduled,p_actor) RETURNING id INTO v_id;
  INSERT INTO public.hustle_phase2_delivery_events(delivery_id,actor_id,action) VALUES(v_id,p_actor,'prepared'); n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('active',true,'prepared',n,'total',p_count);
END $$;

CREATE FUNCTION public.hustle_phase2_delivery_claim(p_actor uuid,p_team uuid,p_hash text,p_payload text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.hustle_phase2_deliveries%ROWTYPE; t public.hustle_phase2_teams%ROWTYPE;
BEGIN
 IF NOT public.hustle_phase2_authorized(p_actor,true) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(20261023,2);
 SELECT * INTO t FROM public.hustle_phase2_teams WHERE id=p_team FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown delivery'; END IF;
 SELECT * INTO d FROM public.hustle_phase2_deliveries WHERE team_id=p_team FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unprepared delivery'; END IF;
 IF d.status<>'prepared' THEN RETURN 'false'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM public.hustle_phase2_deliveries WHERE status IN ('dispatching','unknown','rejected','failed'))
 THEN RAISE EXCEPTION 'Outstanding delivery requires reconciliation'; END IF;
 IF public.hustle_phase2_window(clock_timestamp())='closed' OR d.scheduled_at < clock_timestamp()+interval '1 minute'
 OR t.decision<>'pending' OR d.token_hash IS DISTINCT FROM p_hash OR d.payload_hash IS DISTINCT FROM p_payload
 OR NOT EXISTS(SELECT 1 FROM public.hustle_phase2_batches WHERE id=d.batch_id AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM public.hustle_phase2_invites WHERE team_id=p_team AND token_hash=d.token_hash AND revoked_at IS NULL AND expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'Delivery no longer eligible'; END IF;
 UPDATE public.hustle_phase2_deliveries SET status='dispatching',attempted_at=clock_timestamp() WHERE team_id=p_team;
 INSERT INTO public.hustle_phase2_delivery_events(delivery_id,actor_id,action) VALUES(d.id,p_actor,'dispatching');
 RETURN jsonb_build_object('id',d.id);
END $$;

CREATE FUNCTION public.hustle_phase2_delivery_finish(p_actor uuid,p_team uuid,p_status text,p_provider uuid,p_code integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.hustle_phase2_deliveries%ROWTYPE;
BEGIN
 IF NOT public.hustle_phase2_authorized(p_actor,true) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('accepted','rejected','failed','unknown') OR ((p_status='accepted')<>(p_provider IS NOT NULL))
 THEN RAISE EXCEPTION 'Invalid provider acknowledgment'; END IF;
 SELECT * INTO d FROM public.hustle_phase2_deliveries WHERE team_id=p_team FOR UPDATE;
 IF NOT FOUND OR d.status<>'dispatching' THEN RAISE EXCEPTION 'Delivery was not claimed; no overwrite'; END IF;
 UPDATE public.hustle_phase2_deliveries SET status=p_status,provider_id=p_provider,provider_code=p_code,finished_at=clock_timestamp() WHERE team_id=p_team;
 INSERT INTO public.hustle_phase2_delivery_events(delivery_id,actor_id,action) VALUES(d.id,p_actor,p_status);
 RETURN true;
END $$;

CREATE FUNCTION public.hustle_phase2_delivery_report(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.hustle_phase2_authorized(p_actor,true) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('counts',jsonb_build_object(
 'shortlisted',(SELECT count(*) FROM public.hustle_phase2_teams),
 'active',(SELECT count(*) FROM public.hustle_phase2_teams t JOIN public.hustle_phase2_batches b ON b.id=t.batch_id WHERE b.activated_at IS NOT NULL),
 'account_verified',(SELECT count(*) FROM public.hustle_phase2_participants WHERE user_id IS NOT NULL),
 'confirmed',(SELECT count(*) FROM public.hustle_phase2_teams WHERE decision='confirmed'),
 'declined',(SELECT count(*) FROM public.hustle_phase2_teams WHERE decision='declined'),
 'pending',(SELECT count(*) FROM public.hustle_phase2_teams WHERE decision='pending'),
 'prepared',(SELECT count(*) FROM public.hustle_phase2_deliveries WHERE status='prepared'),
 'submitted',(SELECT count(*) FROM public.hustle_phase2_deliveries WHERE attempted_at IS NOT NULL),
 'accepted',(SELECT count(*) FROM public.hustle_phase2_deliveries WHERE status='accepted'),
 'rejected',(SELECT count(*) FROM public.hustle_phase2_deliveries WHERE status='rejected'),
 'failed',(SELECT count(*) FROM public.hustle_phase2_deliveries WHERE status='failed'),
 'unknown',(SELECT count(*) FROM public.hustle_phase2_deliveries WHERE status IN ('unknown','dispatching')),
 'window',public.hustle_phase2_window(clock_timestamp())),
 'deliveries',coalesce((SELECT jsonb_agg(jsonb_build_object('team_id',team_id,'status',status)) FROM public.hustle_phase2_deliveries),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.hustle_phase2_delivery_prepare(uuid,uuid,text,integer,timestamptz,jsonb),public.hustle_phase2_delivery_claim(uuid,uuid,text,text),public.hustle_phase2_delivery_finish(uuid,uuid,text,uuid,integer),public.hustle_phase2_delivery_report(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hustle_phase2_delivery_prepare(uuid,uuid,text,integer,timestamptz,jsonb),public.hustle_phase2_delivery_claim(uuid,uuid,text,text),public.hustle_phase2_delivery_finish(uuid,uuid,text,uuid,integer),public.hustle_phase2_delivery_report(uuid) TO service_role;
COMMIT;
