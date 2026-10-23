-- Mission 02. Apply only after isolated verification and separate release approval.
-- No existing table permissions or authentication behavior are changed.
BEGIN;
DO $drift$ BEGIN
  IF md5(replace(pg_get_functiondef('public.accept_team_invite(uuid)'::regprocedure),chr(13),'')) <> 'f1cbccd3f8fc8937ce3483c7bbe7bc31' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.accept_team_invite(uuid)'::regprocedure) <> 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.accept_team_invite(uuid)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Unreviewed drift in accept_team_invite'; END IF;
  IF md5(replace(pg_get_functiondef('public.accept_team_join_request(uuid)'::regprocedure),chr(13),'')) <> 'a12d07fed167b2a09dbcd03488fd7833' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.accept_team_join_request(uuid)'::regprocedure) <> 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.accept_team_join_request(uuid)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Unreviewed drift in accept_team_join_request'; END IF;
  IF md5(replace(pg_get_functiondef('public.add_user_to_team(uuid,uuid,text)'::regprocedure),chr(13),'')) <> '600fe22c39e11292d43ddda1f6de4b23' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.add_user_to_team(uuid,uuid,text)'::regprocedure) <> 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.add_user_to_team(uuid,uuid,text)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres}' THEN RAISE EXCEPTION 'Unreviewed drift in add_user_to_team'; END IF;
  IF md5(replace(pg_get_functiondef('public.create_team_with_owner(text,text,integer,text,uuid,text,text[],text[])'::regprocedure),chr(13),'')) <> '713499d110c9ec1cda8c41055b2b3e00' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.create_team_with_owner(text,text,integer,text,uuid,text,text[],text[])'::regprocedure) <> 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.create_team_with_owner(text,text,integer,text,uuid,text,text[],text[])'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Unreviewed drift in create_team_with_owner'; END IF;
  IF md5(replace(pg_get_functiondef('public.join_team_instantly(uuid,text)'::regprocedure),chr(13),'')) <> 'bbf25a618a427da443a153c9fddb61f3' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.join_team_instantly(uuid,text)'::regprocedure) <> 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.join_team_instantly(uuid,text)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}' THEN RAISE EXCEPTION 'Unreviewed drift in join_team_instantly'; END IF;
  IF md5(replace(pg_get_functiondef('public.request_to_join_team(uuid)'::regprocedure),chr(13),'')) <> '522be87189c29cbcf9405876eb573183' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.request_to_join_team(uuid)'::regprocedure) <> 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.request_to_join_team(uuid)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Unreviewed drift in request_to_join_team'; END IF;
END $drift$;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- Cutover cannot race submissions, membership writes or new registrations.
LOCK TABLE public.profiles, public.teams, public.team_join_requests, public.team_members, public.team_invites IN SHARE ROW EXCLUSIVE MODE;
CREATE SCHEMA audit AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA audit FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA audit TO service_role;

CREATE TABLE audit.team_formation_coverage (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz,
  last_cleanup_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO audit.team_formation_coverage DEFAULT VALUES;

CREATE TABLE audit.team_formation_accounts (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  registered_at timestamptz,
  eligible boolean NOT NULL,
  activated_at timestamptz,
  activation_source text CHECK (activation_source IN ('owner_creation','request_acceptance','invitation','signed_link','unattributed')),
  CHECK ((activated_at IS NULL) = (activation_source IS NULL))
);
-- Existing accounts cannot be called first-ever activations from incomplete history.
INSERT INTO audit.team_formation_accounts(user_id, registered_at, eligible)
SELECT p.id, u.created_at, false FROM public.profiles p LEFT JOIN auth.users u ON u.id=p.id;

CREATE TABLE audit.team_formation_events (
  event_key text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('request_submitted','request_baseline','request_resolved','membership_created','membership_baseline','membership_removed','membership_reassigned')),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid NOT NULL,
  request_id uuid,
  membership_id uuid,
  occurred_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  source text NOT NULL CHECK (source IN ('submission','baseline','accepted','rejected','superseded_invite','superseded_token','removed_unclassified','owner_creation','request_acceptance','invitation','signed_link','unattributed')),
  transaction_id bigint NOT NULL DEFAULT txid_current(),
  CHECK ((kind LIKE 'request_%') = (request_id IS NOT NULL)),
  CHECK (kind NOT LIKE 'membership_%' OR membership_id IS NOT NULL)
);
CREATE UNIQUE INDEX team_formation_one_terminal ON audit.team_formation_events(request_id) WHERE kind = 'request_resolved';
CREATE UNIQUE INDEX team_formation_one_acquisition ON audit.team_formation_events(membership_id) WHERE kind = 'membership_created';
CREATE INDEX team_formation_expiry ON audit.team_formation_events(recorded_at);
CREATE INDEX team_formation_cohorts ON audit.team_formation_events(kind, occurred_at);
CREATE INDEX team_formation_erasure ON audit.team_formation_events(user_id);

ALTER TABLE audit.team_formation_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.team_formation_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.team_formation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.team_formation_coverage FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.team_formation_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.team_formation_events FORCE ROW LEVEL SECURITY;
-- No policies: ordinary roles default-denied. Service-role BYPASSRLS is used only
-- by the verified admin aggregate endpoint; private schema is never API-exposed.
REVOKE ALL ON ALL TABLES IN SCHEMA audit FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA audit TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA audit REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

INSERT INTO audit.team_formation_events(event_key,kind,user_id,team_id,request_id,occurred_at,source)
SELECT 'r:baseline:'||id,'request_baseline',user_id,team_id,id,created_at,'baseline' FROM public.team_join_requests;
INSERT INTO audit.team_formation_events(event_key,kind,user_id,team_id,membership_id,occurred_at,source)
SELECT 'm:baseline:'||id,'membership_baseline',user_id,team_id,id,created_at,'baseline' FROM public.team_members;

CREATE FUNCTION audit.record_membership(p_team uuid, p_user uuid, p_source text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, audit AS $$
DECLARE v_id uuid; v_time timestamptz := clock_timestamp();
BEGIN
  IF p_source NOT IN ('owner_creation','request_acceptance','invitation','signed_link','unattributed') THEN RAISE EXCEPTION 'Invalid acquisition source'; END IF;
  SELECT id INTO STRICT v_id FROM public.team_members WHERE team_id=p_team AND user_id=p_user;
  -- Serializes concurrent first activations without changing profile/auth rows.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text, 2902));
  INSERT INTO audit.team_formation_events(event_key,kind,user_id,team_id,membership_id,occurred_at,source)
  VALUES ('m:create:'||v_id,'membership_created',p_user,p_team,v_id,v_time,p_source)
  ON CONFLICT (event_key) DO UPDATE SET source=EXCLUDED.source
    WHERE team_formation_events.source='unattributed' AND team_formation_events.transaction_id=txid_current();
  UPDATE audit.team_formation_accounts SET activated_at=v_time,activation_source=p_source
  WHERE user_id=p_user AND eligible AND activated_at IS NULL;
  -- SET CONSTRAINTS ALL IMMEDIATE can run fallback before its authorized wrapper.
  UPDATE audit.team_formation_accounts SET activation_source=p_source
  WHERE user_id=p_user AND activation_source='unattributed' AND EXISTS (
    SELECT 1 FROM audit.team_formation_events WHERE event_key='m:create:'||v_id
      AND transaction_id=txid_current() AND source=p_source AND occurred_at=activated_at
  );
  RETURN v_id;
END $$;

CREATE FUNCTION audit.resolve_request(p_request uuid, p_source text, p_membership uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, audit AS $$
DECLARE r public.team_join_requests%ROWTYPE;
BEGIN
  IF p_source NOT IN ('accepted','rejected','superseded_invite','superseded_token','removed_unclassified') THEN RAISE EXCEPTION 'Invalid resolution'; END IF;
  SELECT * INTO STRICT r FROM public.team_join_requests WHERE id=p_request FOR UPDATE;
  -- Existing invite/token cleanup also deletes legacy non-pending rows. Their
  -- earlier status transition is unknown, not a second supersession outcome.
  IF r.status IS DISTINCT FROM 'pending' THEN
    IF p_source IN ('superseded_invite','superseded_token') THEN RETURN; END IF;
    RAISE EXCEPTION 'Request is no longer pending';
  END IF;
  IF p_source IN ('accepted','superseded_invite','superseded_token') AND NOT EXISTS (
    SELECT 1 FROM public.team_members WHERE id=p_membership AND team_id=r.team_id AND user_id=r.user_id
  ) THEN RAISE EXCEPTION 'Membership confirmation required'; END IF;
  INSERT INTO audit.team_formation_events(event_key,kind,user_id,team_id,request_id,membership_id,occurred_at,source)
  VALUES ('r:resolved:'||r.id,'request_resolved',r.user_id,r.team_id,r.id,p_membership,clock_timestamp(),p_source);
END $$;

CREATE FUNCTION audit.capture_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, audit AS $$
DECLARE v_registered timestamptz;
BEGIN
  -- Registration is an Auth database fact, never a client-supplied profile date.
  SELECT created_at INTO v_registered FROM auth.users WHERE id=NEW.id;
  INSERT INTO audit.team_formation_accounts(user_id,registered_at,eligible)
  VALUES(NEW.id, v_registered, v_registered IS NOT NULL AND v_registered >= (SELECT started_at FROM audit.team_formation_coverage) AND v_registered <= clock_timestamp());
  RETURN NEW;
END $$;
CREATE TRIGGER team_formation_registration AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION audit.capture_profile();

CREATE FUNCTION audit.capture_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, audit AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO audit.team_formation_events(event_key,kind,user_id,team_id,request_id,occurred_at,source)
    VALUES ('r:submitted:'||NEW.id,CASE WHEN NEW.status='pending' THEN 'request_submitted' ELSE 'request_baseline' END,
      NEW.user_id,NEW.team_id,NEW.id,clock_timestamp(),CASE WHEN NEW.status='pending' THEN 'submission' ELSE 'baseline' END);
    RETURN NEW;
  END IF;
  -- Account erasure removes all subject facts via FK; never recreate erased links.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id=OLD.user_id) AND (TG_OP='DELETE' OR (OLD.status='pending' AND NEW.status IS DISTINCT FROM 'pending')) THEN
    INSERT INTO audit.team_formation_events(event_key,kind,user_id,team_id,request_id,occurred_at,source)
    VALUES('r:resolved:'||OLD.id,'request_resolved',OLD.user_id,OLD.team_id,OLD.id,clock_timestamp(),'removed_unclassified')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER team_formation_request AFTER INSERT OR DELETE OR UPDATE OF status ON public.team_join_requests FOR EACH ROW EXECUTE FUNCTION audit.capture_request();

CREATE FUNCTION audit.capture_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, audit AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.team_members WHERE id=NEW.id) THEN
      PERFORM audit.record_membership(NEW.team_id,NEW.user_id,'unattributed');
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.profiles WHERE id=OLD.user_id) THEN
    INSERT INTO audit.team_formation_events(event_key,kind,user_id,team_id,membership_id,occurred_at,source)
    VALUES('m:remove:'||OLD.id,'membership_removed',OLD.user_id,OLD.team_id,OLD.id,clock_timestamp(),'unattributed') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER team_formation_member_insert AFTER INSERT ON public.team_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION audit.capture_membership();
CREATE TRIGGER team_formation_member_delete AFTER DELETE ON public.team_members FOR EACH ROW EXECUTE FUNCTION audit.capture_membership();

CREATE FUNCTION audit.capture_reassignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, audit AS $$
BEGIN
  INSERT INTO audit.team_formation_events(event_key,kind,user_id,team_id,membership_id,occurred_at,source)
  VALUES('m:reassigned:'||NEW.id||':'||txid_current(),'membership_reassigned',NEW.user_id,NEW.team_id,NEW.id,clock_timestamp(),'unattributed') ON CONFLICT DO NOTHING;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,2902));
    UPDATE audit.team_formation_accounts SET activated_at=clock_timestamp(),activation_source='unattributed'
    WHERE user_id=NEW.user_id AND eligible AND activated_at IS NULL;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER team_formation_reassignment AFTER UPDATE OF id,team_id,user_id ON public.team_members FOR EACH ROW
WHEN (OLD.id IS DISTINCT FROM NEW.id OR OLD.team_id IS DISTINCT FROM NEW.team_id OR OLD.user_id IS DISTINCT FROM NEW.user_id)
EXECUTE FUNCTION audit.capture_reassignment();

CREATE FUNCTION public.reject_team_join_request(p_request_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_team uuid; v_rows integer;
BEGIN
  SELECT team_id INTO v_team FROM public.team_join_requests
  WHERE id=p_request_id AND status='pending' FOR UPDATE;
  IF v_team IS NULL THEN RAISE EXCEPTION 'Pending request not found or not authorized'; END IF;
  PERFORM 1 FROM public.teams WHERE id=v_team AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending request not found or not authorized'; END IF;
  PERFORM audit.resolve_request(p_request_id,'rejected');
  DELETE FROM public.team_join_requests WHERE id=p_request_id AND team_id=v_team AND status='pending';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'Request deletion could not be confirmed'; END IF;
  RETURN p_request_id;
END $$;
REVOKE ALL ON FUNCTION public.reject_team_join_request(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_team_join_request(uuid) TO authenticated;

-- A daily job already exists. Prune at 88 days to leave a two-day operating
-- margin before the approved 90-day ceiling. No new schedule is installed.
CREATE FUNCTION public.prune_team_formation_history() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, audit AS $$
DECLARE v_rows integer;
BEGIN
  DELETE FROM audit.team_formation_events WHERE recorded_at <= clock_timestamp()-interval '88 days';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  UPDATE audit.team_formation_coverage SET last_cleanup_at=clock_timestamp();
  RETURN jsonb_build_object('deleted',v_rows);
END $$;
REVOKE ALL ON FUNCTION public.prune_team_formation_history() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prune_team_formation_history() TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA audit FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_team_formation_report(p_start timestamptz, p_end timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, audit AS $$
DECLARE v_now timestamptz := statement_timestamp(); v_report jsonb;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end)
    OR p_start>=p_end OR p_end>v_now OR p_end-p_start>interval '60 days' OR p_start<v_now-interval '87 days'
  THEN RAISE EXCEPTION 'Invalid bounded report window'; END IF;
  IF EXISTS (SELECT 1 FROM audit.team_formation_events WHERE recorded_at<=v_now-interval '90 days') THEN
    RAISE EXCEPTION 'Retention overdue: report unavailable until cleanup is verified';
  END IF;
  WITH coverage AS (SELECT * FROM audit.team_formation_coverage),
  cohort AS (
    SELECT s.*, CASE WHEN t.request_id IS NOT NULL AND (t.user_id<>s.user_id OR t.team_id<>s.team_id) THEN 'removed_unclassified' ELSE t.source END AS outcome,
      t.occurred_at AS decided_at, CASE WHEN t.user_id=s.user_id AND t.team_id=s.team_id THEN t.membership_id END AS converted_membership,
      t.request_id IS NOT NULL AND (t.user_id<>s.user_id OR t.team_id<>s.team_id) AS mismatched,
      EXISTS(SELECT 1 FROM public.team_join_requests r WHERE r.id=s.request_id AND r.user_id=s.user_id AND r.team_id=s.team_id AND r.status='pending') AS is_pending,
      s.occurred_at<=v_now-interval '7 days' AS mature
    FROM audit.team_formation_events s LEFT JOIN audit.team_formation_events t
      ON t.request_id=s.request_id AND t.kind='request_resolved'
    WHERE s.kind='request_submitted' AND s.occurred_at>=p_start AND s.occurred_at<p_end
  ),
  totals AS (
    SELECT count(*) AS submitted,count(DISTINCT user_id) AS applicants,
      count(*) FILTER(WHERE mature) AS mature, count(*) FILTER(WHERE NOT mature) AS immature,
      count(*) FILTER(WHERE mature AND outcome='accepted') AS accepted,
      count(*) FILTER(WHERE mature AND outcome='rejected') AS rejected,
      count(*) FILTER(WHERE mature AND outcome IN ('superseded_invite','superseded_token')) AS superseded,
      count(*) FILTER(WHERE mature AND (outcome='removed_unclassified' OR outcome IS NULL AND NOT is_pending)) AS unclassified,
      count(*) FILTER(WHERE mature AND outcome IS NULL AND is_pending) AS pending,
      count(*) FILTER(WHERE mature AND outcome IN ('accepted','rejected') AND decided_at>=occurred_at AND decided_at<=occurred_at+interval '7 days') AS responded7,
      count(*) FILTER(WHERE mature AND converted_membership IS NOT NULL AND EXISTS(
        SELECT 1 FROM audit.team_formation_events m WHERE m.kind='membership_created' AND m.membership_id=cohort.converted_membership
      )) AS converted,
      percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM decided_at-occurred_at)/3600)
        FILTER(WHERE mature AND outcome IN ('accepted','rejected') AND decided_at>=occurred_at) AS decision_p50_hours,
      percentile_cont(0.9) WITHIN GROUP(ORDER BY extract(epoch FROM decided_at-occurred_at)/3600)
        FILTER(WHERE mature AND outcome IN ('accepted','rejected') AND decided_at>=occurred_at) AS decision_p90_hours,
      count(*) FILTER(WHERE mature AND (mismatched OR outcome IS NULL AND NOT is_pending)) AS unexplained
    FROM cohort
  ), backlog AS (
    SELECT count(*) AS pending,count(*) FILTER(WHERE created_at IS NULL OR created_at>v_now) AS unknown_age,
      count(*) FILTER(WHERE created_at<v_now-interval '7 days') AS over7,
      count(*) FILTER(WHERE created_at<v_now-interval '14 days') AS over14,
      percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM v_now-created_at)/86400) FILTER(WHERE created_at<=v_now) AS age_p50_days,
      percentile_cont(0.9) WITHIN GROUP(ORDER BY extract(epoch FROM v_now-created_at)/86400) FILTER(WHERE created_at<=v_now) AS age_p90_days
    FROM public.team_join_requests WHERE status='pending'
  ), acquisitions AS (
    SELECT count(*) AS episodes,count(DISTINCT user_id) AS people,
      count(*) FILTER(WHERE source='owner_creation') AS creators,
      count(*) FILTER(WHERE source IN ('request_acceptance','invitation','signed_link')) AS joiners,
      count(*) FILTER(WHERE source='unattributed') AS unattributed
    FROM audit.team_formation_events WHERE kind='membership_created' AND occurred_at>=p_start AND occurred_at<p_end
  ), activation AS (
    SELECT count(*) AS registrations,count(*) FILTER(WHERE registered_at<=v_now-interval '7 days') AS mature,
      count(*) FILTER(WHERE registered_at>v_now-interval '7 days') AS immature,
      count(*) FILTER(WHERE registered_at<=v_now-interval '7 days' AND activated_at>=registered_at AND activated_at<=registered_at+interval '7 days') AS activated7,
      count(*) FILTER(WHERE registered_at<=v_now-interval '7 days' AND activated_at>=registered_at AND activated_at<=registered_at+interval '7 days' AND activation_source='owner_creation') AS creators7,
      count(*) FILTER(WHERE registered_at<=v_now-interval '7 days' AND activated_at>=registered_at AND activated_at<=registered_at+interval '7 days' AND activation_source IN ('request_acceptance','invitation','signed_link')) AS joiners7,
      count(*) FILTER(WHERE registered_at<=v_now-interval '7 days' AND activated_at>=registered_at AND activated_at<=registered_at+interval '7 days' AND activation_source='unattributed') AS unattributed7
    FROM audit.team_formation_accounts WHERE eligible AND registered_at>=p_start AND registered_at<p_end
  )
  SELECT jsonb_build_object(
    'version',1,'generatedAt',v_now,'start',p_start,'end',p_end,'coverageStart',c.started_at,
    'coverage',CASE WHEN c.ended_at IS NOT NULL THEN 'unavailable' WHEN p_start<c.started_at OR c.last_cleanup_at<v_now-interval '36 hours' OR t.unclassified>0 OR t.unexplained>0 OR a.unattributed>0 OR EXISTS(SELECT 1 FROM audit.team_formation_events WHERE kind='membership_reassigned' OR (source<>'baseline' AND (occurred_at IS NULL OR occurred_at>v_now))) THEN 'partial' ELSE 'complete' END,
    'cleanupAt',c.last_cleanup_at,'endedAt',c.ended_at,
    'requests',to_jsonb(t),'backlog',to_jsonb(b),'memberships',to_jsonb(a),'activation',to_jsonb(f),
    'removals',(SELECT count(*) FROM audit.team_formation_events WHERE kind='membership_removed' AND occurred_at>=p_start AND occurred_at<p_end),
    'collaboratingTeams',(SELECT count(*) FROM (SELECT team_id FROM public.team_members GROUP BY team_id HAVING count(DISTINCT user_id)>=2) x),
    'baselineFacts',(SELECT count(*) FROM audit.team_formation_events WHERE source='baseline'),
    'excludedAccounts',(SELECT count(*) FROM audit.team_formation_accounts WHERE NOT eligible),
    'qualityIssues',(SELECT count(*) FROM audit.team_formation_events WHERE kind='membership_reassigned' OR (source<>'baseline' AND (occurred_at IS NULL OR occurred_at>v_now))),
    'warnings',jsonb_build_array('Pre-coverage decisions and legacy first-team history are unknown. Erased accounts are excluded; original denominators cannot be reconstructed. No anonymous long-term totals are retained.',
      'Owner decisions are only explicit acceptance/rejection; supersession and unclassified removal never count as owner responses.',
      'Reports use one statement snapshot. Detailed facts expire at 88 days; windows older than 87 days are refused. Identity-key maintenance is outside measured acquisition coverage.')
  ) INTO v_report FROM coverage c CROSS JOIN totals t CROSS JOIN backlog b CROSS JOIN acquisitions a CROSS JOIN activation f;
  RETURN v_report;
END $$;
REVOKE ALL ON FUNCTION public.get_team_formation_report(timestamptz,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_team_formation_report(timestamptz,timestamptz) TO service_role;

-- Captured deployed body, with only authoritative journal calls added.
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
  perform audit.record_membership(v_team_id, v_user_id, 'invitation');
  perform audit.resolve_request(r.id, 'superseded_invite', (select id from public.team_members where team_id=v_team_id and user_id=v_user_id)) from public.team_join_requests r where r.team_id=v_team_id and r.user_id=v_user_id;
  update public.team_invites set status = 'accepted' where id = p_invite_id;
  delete from public.team_join_requests
  where team_id = v_team_id and user_id = v_user_id;
  IF EXISTS (SELECT 1 FROM public.team_join_requests WHERE team_id=v_team_id AND user_id=v_user_id) THEN RAISE EXCEPTION 'Request cleanup could not be confirmed'; END IF;
  insert into public.notifications (user_id, message, link)
  values (v_user_id, 'You joined ' || v_team_name, '/teams/' || v_team_id::text);

  return v_team_id;
end;
$function$
;

-- Captured deployed body, with only authoritative journal calls added.
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
  perform audit.resolve_request(p_request_id, 'accepted', audit.record_membership(v_team_id, v_requester_id, 'request_acceptance'));
  delete from public.team_join_requests where id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request deletion could not be confirmed'; END IF;
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

-- Captured deployed body, with only authoritative journal calls added.
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

  PERFORM audit.record_membership(v_team_id, v_user_id, 'owner_creation');
  RETURN v_team_id;
END;
$function$
;

-- Captured deployed body, with only authoritative journal calls added.
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

  PERFORM audit.record_membership(p_team_id, v_user_id, 'signed_link');
  PERFORM audit.resolve_request(r.id, 'superseded_token', (select id from public.team_members where team_id=p_team_id and user_id=v_user_id)) from public.team_join_requests r where r.team_id=p_team_id and r.user_id=v_user_id;

  -- Delete any pending requests
  DELETE FROM public.team_join_requests
  WHERE team_id = p_team_id AND user_id = v_user_id;
  IF EXISTS (SELECT 1 FROM public.team_join_requests WHERE team_id=p_team_id AND user_id=v_user_id) THEN RAISE EXCEPTION 'Request cleanup could not be confirmed'; END IF;

  -- Notify user
  INSERT INTO public.notifications (user_id, message, link)
  VALUES (v_user_id, 'You joined ' || v_team_name || ' via invite link', '/teams/' || p_team_id::text);
END;
$function$
;

ALTER TABLE audit.team_formation_events OWNER TO postgres;
ALTER TABLE audit.team_formation_accounts OWNER TO postgres;
ALTER TABLE audit.team_formation_coverage OWNER TO postgres;
ALTER FUNCTION public.reject_team_join_request(uuid) OWNER TO postgres;
ALTER FUNCTION public.prune_team_formation_history() OWNER TO postgres;
ALTER FUNCTION public.get_team_formation_report(timestamptz,timestamptz) OWNER TO postgres;
DO $owners$ DECLARE f regprocedure; BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace='audit'::regnamespace LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f);
  END LOOP;
END $owners$;
COMMIT;
