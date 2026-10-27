-- DESIGN ONLY: intentionally outside supabase/migrations. Never apply to connected databases.
-- No dependency on PR A tables, no contacts or bearer material, no production grants.
-- Future adapter must recheck exact-event organizer authority + activated shortlist +
-- current PR A invitation and reserve genuinely shared quota. This ledger is NOT authorization.
BEGIN;
CREATE SCHEMA hustle_comms;
REVOKE ALL ON SCHEMA hustle_comms FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA hustle_comms REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE hustle_comms.email_dispatch (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL DEFAULT '0da43cba-90dc-449c-a126-a2fc8be8a379' CHECK(event_id='0da43cba-90dc-449c-a126-a2fc8be8a379'),
 team_id uuid NOT NULL,
 purpose text NOT NULL DEFAULT 'round2-invitation-v1' CHECK(purpose='round2-invitation-v1'),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','accepted','rejected','unknown','confirmed_delivered')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 claim_id uuid, attempt_started_at timestamptz, outcome_recorded_at timestamptz,
 provider_id text UNIQUE CHECK(provider_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 delivery_event_id text, delivered_at timestamptz,
 UNIQUE(event_id,team_id,purpose),
 CHECK((state='queued') = (claim_id IS NULL)),
 CHECK((claim_id IS NULL) = (attempt_started_at IS NULL)),
 CHECK(state NOT IN ('accepted','confirmed_delivered') OR provider_id IS NOT NULL),
 CHECK(state NOT IN ('queued','rejected') OR provider_id IS NULL),
 CHECK((state='confirmed_delivered') = (delivery_event_id IS NOT NULL AND delivered_at IS NOT NULL))
);
CREATE TABLE hustle_comms.daily_allocation (
 provider_day date PRIMARY KEY,
 max_attempts integer NOT NULL CHECK(max_attempts BETWEEN 0 AND 100),
 reserved_attempts integer NOT NULL DEFAULT 0 CHECK(reserved_attempts BETWEEN 0 AND max_attempts),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Set only by a future reviewed GLOBAL budget coordinator, never a dashboard request.
-- All claims reserve budget conservatively, including crashes/rejections/unknowns.
-- This local sub-allocation alone cannot prove the provider-wide daily/monthly remainder.
CREATE TABLE hustle_comms.delivery_evidence (
 event_id text PRIMARY KEY CHECK(event_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 provider_id text NOT NULL CHECK(provider_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 occurred_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(occurred_at <= recorded_at + interval '5 minutes')
);
CREATE INDEX hustle_comms_delivery_provider ON hustle_comms.delivery_evidence(provider_id);
CREATE TABLE hustle_comms.email_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 dispatch_id uuid NOT NULL REFERENCES hustle_comms.email_dispatch(id),
 state text NOT NULL CHECK(state IN ('queued','accepted','rejected','unknown','confirmed_delivered')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE hustle_comms.manual_contact (
 action_id uuid PRIMARY KEY,
 event_id uuid NOT NULL DEFAULT '0da43cba-90dc-449c-a126-a2fc8be8a379' CHECK(event_id='0da43cba-90dc-449c-a126-a2fc8be8a379'),
 team_id uuid NOT NULL, actor_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('chat_opened','organizer_marked_sent','organizer_marked_replied')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- All rows private, no policies/grants. Owner-only design fixture until security review.
ALTER TABLE hustle_comms.email_dispatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE hustle_comms.daily_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE hustle_comms.delivery_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE hustle_comms.email_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE hustle_comms.manual_contact ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hustle_comms FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hustle_comms FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION hustle_comms.queue_email(p_team uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 INSERT INTO hustle_comms.email_dispatch(team_id) VALUES(p_team)
 ON CONFLICT(event_id,team_id,purpose) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NOT NULL THEN
  INSERT INTO hustle_comms.email_audit(dispatch_id,state) VALUES(v_id,'queued');
 ELSE SELECT id INTO v_id FROM hustle_comms.email_dispatch WHERE team_id=p_team; END IF;
 RETURN v_id;
END; $$;
CREATE FUNCTION hustle_comms.claim_email(p_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_claim uuid; v_day date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
 -- Lock dispatch before quota. Duplicate workers cannot consume quota or send twice.
 PERFORM id FROM hustle_comms.email_dispatch WHERE id=p_id AND state='queued' FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE hustle_comms.daily_allocation SET reserved_attempts=reserved_attempts+1
 WHERE provider_day=v_day AND verified_at BETWEEN clock_timestamp()-interval '10 minutes' AND clock_timestamp()
 AND reserved_attempts < max_attempts;
 IF NOT FOUND THEN RETURN NULL; END IF;
 v_claim := gen_random_uuid();
 UPDATE hustle_comms.email_dispatch SET state='unknown',claim_id=v_claim,attempt_started_at=clock_timestamp() WHERE id=p_id;
 INSERT INTO hustle_comms.email_audit(dispatch_id,state) VALUES(p_id,'unknown');
 RETURN v_claim;
END; $$;
CREATE FUNCTION hustle_comms.record_outcome(p_id uuid,p_claim uuid,p_state text,p_provider text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_evidence hustle_comms.delivery_evidence%ROWTYPE; v_state text;
BEGIN
 IF p_state IS NULL OR p_state NOT IN ('accepted','rejected','unknown') OR (p_state='accepted') <> (p_provider IS NOT NULL)
 THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
 -- Serializes delivery receipts with acceptance, including receipt-before-response races.
 IF p_provider IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_provider,0)); END IF;
 PERFORM id FROM hustle_comms.email_dispatch WHERE id=p_id AND claim_id=p_claim AND state='unknown' AND outcome_recorded_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO v_evidence FROM hustle_comms.delivery_evidence WHERE provider_id=p_provider ORDER BY recorded_at,event_id LIMIT 1;
 v_state := CASE WHEN p_state='accepted' AND v_evidence.event_id IS NOT NULL THEN 'confirmed_delivered' ELSE p_state END;
 UPDATE hustle_comms.email_dispatch SET state=v_state,provider_id=p_provider,outcome_recorded_at=clock_timestamp(),
 delivery_event_id=v_evidence.event_id,delivered_at=v_evidence.occurred_at WHERE id=p_id;
 INSERT INTO hustle_comms.email_audit(dispatch_id,state) VALUES(p_id,v_state);
 RETURN true;
END; $$;
-- Only a future signature-verifying Resend adapter may call this. No HTTP endpoint in PR C.
CREATE FUNCTION hustle_comms.record_delivery(p_provider text,p_event text,p_at timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_provider,0));
 INSERT INTO hustle_comms.delivery_evidence(provider_id,event_id,occurred_at) VALUES(p_provider,p_event,p_at)
 ON CONFLICT(event_id) DO NOTHING;
 IF EXISTS(SELECT 1 FROM hustle_comms.delivery_evidence WHERE event_id=p_event AND (provider_id<>p_provider OR occurred_at<>p_at)) THEN RAISE EXCEPTION 'Conflicting evidence'; END IF;
 UPDATE hustle_comms.email_dispatch SET state='confirmed_delivered',delivery_event_id=p_event,delivered_at=p_at
 WHERE provider_id=p_provider AND state='accepted' RETURNING id INTO v_id;
 IF v_id IS NOT NULL THEN INSERT INTO hustle_comms.email_audit(dispatch_id,state) VALUES(v_id,'confirmed_delivered'); END IF;
 RETURN v_id IS NOT NULL;
END; $$;
CREATE FUNCTION hustle_comms.record_manual(p_action_id uuid,p_team uuid,p_actor uuid,p_action text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 INSERT INTO hustle_comms.manual_contact(action_id,team_id,actor_id,action) VALUES(p_action_id,p_team,p_actor,p_action) ON CONFLICT(action_id) DO NOTHING;
 IF EXISTS(SELECT 1 FROM hustle_comms.manual_contact WHERE action_id=p_action_id AND (team_id<>p_team OR actor_id<>p_actor OR action<>p_action)) THEN RAISE EXCEPTION 'Conflicting manual action'; END IF;
 RETURN true;
END; $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hustle_comms FROM PUBLIC, anon, authenticated, service_role;
-- No GRANT to anon, authenticated or service_role. Production adapters/permissions do not exist yet.
COMMIT;
