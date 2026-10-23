-- Executed ONLY by test-team-formation-local.cjs in its disposable synthetic DB.
CREATE FUNCTION pg_temp.check_ok(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION pg_temp.failure(query text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE query; RETURN 'NO_ERROR'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $$;

SELECT pg_temp.check_ok(NOT (SELECT eligible FROM audit.team_formation_accounts WHERE user_id='00000000-0000-4000-8000-000000000001'),'legacy account is not first-ever eligible');
INSERT INTO public.profiles(id) SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(10,30) n;
INSERT INTO public.teams(id,name,owner_id,max_members) SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Synthetic team','00000000-0000-4000-8000-000000000001',CASE WHEN n IN(70,73) THEN 2 ELSE 10 END FROM generate_series(70,75) n;
INSERT INTO public.team_members(team_id,user_id,role) SELECT id,owner_id,'owner' FROM public.teams;

SET ROLE anon;
SELECT pg_temp.check_ok(pg_temp.failure('SELECT * FROM audit.team_formation_events')='42501','anonymous cannot read private facts');
SELECT pg_temp.check_ok(pg_temp.failure('SELECT public.get_team_formation_report(now()-interval ''1 day'',now())')='42501','anonymous cannot invoke aggregate');
RESET ROLE; SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000010';
SELECT pg_temp.check_ok(pg_temp.failure('SELECT * FROM audit.team_formation_accounts')='42501','authenticated cannot read private markers');
SELECT pg_temp.check_ok(pg_temp.failure('SELECT audit.record_membership(gen_random_uuid(),gen_random_uuid(),''owner_creation'')')='42501','authenticated cannot fabricate source');
SELECT pg_temp.check_ok(pg_temp.failure('SELECT public.prune_team_formation_history()')='42501','authenticated cannot purge facts');
SELECT pg_temp.check_ok(pg_temp.failure('SELECT public.add_user_to_team(gen_random_uuid(),gen_random_uuid(),''member'')')='42501','protected helper grant remains revoked');
SELECT public.request_to_join_team('00000000-0000-4000-8000-000000000070');
RESET ROLE; SET ROLE postgres;
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM audit.team_formation_events WHERE kind='request_submitted' AND user_id='00000000-0000-4000-8000-000000000010'),'one durable submission');
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT public.accept_team_join_request((SELECT id FROM public.team_join_requests WHERE user_id='00000000-0000-4000-8000-000000000010'));
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM audit.team_formation_events WHERE kind='request_resolved' AND source='accepted'),'accepted terminal exactly once');
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM audit.team_formation_events WHERE kind='membership_created' AND source='request_acceptance'),'canonical acquisition beats deferred fallback');
SELECT pg_temp.check_ok((SELECT activation_source='request_acceptance' FROM audit.team_formation_accounts WHERE user_id='00000000-0000-4000-8000-000000000010'),'new user first activation');
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM public.notifications WHERE user_id='00000000-0000-4000-8000-000000000010'),'accept notification preserved locally');
SELECT pg_temp.check_ok(pg_temp.failure('SELECT public.accept_team_join_request((SELECT request_id FROM audit.team_formation_events WHERE source=''accepted'' LIMIT 1))')<>'NO_ERROR','lost-response replay cannot duplicate terminal');

-- Explicit rejection and unauthorized decisions.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000011';
SELECT public.request_to_join_team('00000000-0000-4000-8000-000000000074');
SELECT pg_temp.check_ok(pg_temp.failure('SELECT public.reject_team_join_request((SELECT id FROM public.team_join_requests WHERE user_id=auth.uid()))')<>'NO_ERROR','applicant cannot reject as owner');
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT public.reject_team_join_request((SELECT id FROM public.team_join_requests WHERE user_id='00000000-0000-4000-8000-000000000011'));
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM audit.team_formation_events WHERE source='rejected'),'one explicit rejection');
SELECT pg_temp.check_ok(NOT EXISTS(SELECT FROM public.team_members WHERE user_id='00000000-0000-4000-8000-000000000011'),'rejection creates no membership');

-- Invitation/token supersession is not owner acceptance. Conversation behavior remains.
INSERT INTO public.conversations(team_id,type) VALUES('00000000-0000-4000-8000-000000000074','team');
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000012';
SELECT public.request_to_join_team('00000000-0000-4000-8000-000000000074');
INSERT INTO public.team_invites(team_id,invited_user_id,invited_by) VALUES('00000000-0000-4000-8000-000000000074',auth.uid(),'00000000-0000-4000-8000-000000000001');
SELECT public.accept_team_invite((SELECT id FROM public.team_invites WHERE invited_user_id=auth.uid()));
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM audit.team_formation_events WHERE source='superseded_invite'),'invitation supersedes request');
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM public.conversation_participants WHERE user_id=auth.uid()),'conversation participant preserved');
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000013';
SELECT public.request_to_join_team('00000000-0000-4000-8000-000000000074');
INSERT INTO public.team_invites(team_id,invited_user_id,invited_by) VALUES('00000000-0000-4000-8000-000000000074',auth.uid(),'00000000-0000-4000-8000-000000000001');
SELECT pg_temp.check_ok(pg_temp.failure('SELECT public.join_team_instantly(''00000000-0000-4000-8000-000000000074'',''invalid'')')<>'NO_ERROR','invalid token still denied');
DO $$DECLARE message text := '00000000-0000-4000-8000-000000000074|'||floor(extract(epoch FROM now())+3600)::text;
BEGIN PERFORM public.join_team_instantly('00000000-0000-4000-8000-000000000074',message||'|'||encode(extensions.hmac(message::bytea,'mission02-synthetic-only'::bytea,'sha256'),'hex')); END $$;
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM audit.team_formation_events WHERE source='superseded_token'),'signed link supersedes request');
SELECT pg_temp.check_ok((SELECT status='pending' FROM public.team_invites WHERE invited_user_id=auth.uid()),'deployed token behavior retains invitations');
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM public.notifications WHERE user_id=auth.uid() AND message LIKE '%via invite link'),'deployed token notification retained');

SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000014';
SELECT public.create_team_with_owner('Synthetic creator','Synthetic fixture',4,NULL,NULL,NULL,'{}','{}');
SELECT pg_temp.check_ok((SELECT activation_source='owner_creation' FROM audit.team_formation_accounts WHERE user_id=auth.uid()),'creator activation distinguished');
UPDATE public.team_members SET project_role='Developer',role='owner' WHERE user_id=auth.uid();
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM audit.team_formation_events WHERE user_id=auth.uid() AND kind='membership_created'),'role-only maintenance is not another acquisition');

-- Legacy direct removal stays unclassified; real reapplication is a new attempt.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000015';
SELECT public.request_to_join_team('00000000-0000-4000-8000-000000000074');
SET ROLE authenticated;
DELETE FROM public.team_join_requests WHERE user_id=auth.uid();
RESET ROLE; SET ROLE postgres;
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM audit.team_formation_events WHERE user_id=auth.uid() AND source='removed_unclassified'),'bare delete not inferred as rejection');
SELECT public.request_to_join_team('00000000-0000-4000-8000-000000000074');
SELECT pg_temp.check_ok((SELECT count(*)=2 FROM audit.team_formation_events WHERE user_id=auth.uid() AND kind='request_submitted'),'reapplication has distinct submission');

-- Force an authoritative fact failure: request and membership must roll back.
CREATE FUNCTION pg_temp.fail_terminal() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.kind='request_resolved' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit.team_formation_events FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_terminal();
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT pg_temp.check_ok(pg_temp.failure('SELECT public.accept_team_join_request((SELECT id FROM public.team_join_requests WHERE user_id=''00000000-0000-4000-8000-000000000015''))')<>'NO_ERROR','audit failure aborts acceptance');
SELECT pg_temp.check_ok(NOT EXISTS(SELECT FROM public.team_members WHERE user_id='00000000-0000-4000-8000-000000000015') AND EXISTS(SELECT FROM public.team_join_requests WHERE user_id='00000000-0000-4000-8000-000000000015'),'business mutation rolled back with journal');
DROP TRIGGER synthetic_audit_failure ON audit.team_formation_events;

-- Account erasure removes detailed identifying links and compact markers.
INSERT INTO public.team_members(team_id,user_id) VALUES('00000000-0000-4000-8000-000000000075','00000000-0000-4000-8000-000000000016');
DELETE FROM auth.users WHERE id='00000000-0000-4000-8000-000000000016';
SELECT pg_temp.check_ok(NOT EXISTS(SELECT FROM audit.team_formation_accounts WHERE user_id='00000000-0000-4000-8000-000000000016') AND NOT EXISTS(SELECT FROM audit.team_formation_events WHERE user_id='00000000-0000-4000-8000-000000000016'),'account erasure clears every subject link');

-- One statement report, zeros, immature/non-joining registrations, and no IDs.
SET ROLE service_role;
SELECT pg_temp.check_ok(pg_temp.failure('DELETE FROM audit.team_formation_events')='42501','service role cannot directly mutate facts');
SELECT pg_temp.check_ok(public.get_team_formation_report(now()-interval '35 days',now()-interval '7 days')->'requests'->>'mature'='0','empty mature cohort is measured zero with partial coverage');
SELECT pg_temp.check_ok(public.get_team_formation_report(now()-interval '1 hour',now())->'activation'->>'activated7'='0','immature activations excluded from mature numerator');
SELECT pg_temp.check_ok(public.get_team_formation_report(now()-interval '1 hour',now())::text NOT LIKE '%00000000-%','aggregate contains no entity or person IDs');
RESET ROLE; SET ROLE postgres;
UPDATE audit.team_formation_events SET recorded_at=now()-interval '91 days' WHERE source='rejected';
SET ROLE service_role;
SELECT pg_temp.check_ok(pg_temp.failure('SELECT public.get_team_formation_report(now()-interval ''1 day'',now())')<>'NO_ERROR','overdue retention fails report closed');
SELECT public.prune_team_formation_history();
RESET ROLE; SET ROLE postgres;
SELECT pg_temp.check_ok(NOT EXISTS(SELECT FROM audit.team_formation_events WHERE recorded_at<=now()-interval '88 days'),'cleanup physically deletes expired detail');
SELECT pg_temp.check_ok(EXISTS(SELECT FROM audit.team_formation_accounts WHERE user_id='00000000-0000-4000-8000-000000000014' AND activated_at IS NOT NULL),'eligible compact activation survives detail purge');
SELECT pg_temp.check_ok(NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='audit' AND (has_function_privilege('authenticated',p.oid,'execute') OR has_function_privilege('anon',p.oid,'execute') OR has_function_privilege('service_role',p.oid,'execute'))),'internal function execution denied to all API roles');
SELECT pg_temp.check_ok(NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='audit' AND (pg_get_userbyid(p.proowner)<>'postgres' OR NOT p.prosecdef OR NOT p.proconfig @> ARRAY['search_path=pg_catalog, audit'])),'private writers have pinned owner and search path');

-- Request reserved for concurrent accept/reject in the runner (one seat available).
INSERT INTO public.team_join_requests(id,team_id,user_id) VALUES('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000075','00000000-0000-4000-8000-000000000017');

-- Synthetic time travel is test-only, never a historical production backfill.
INSERT INTO public.team_join_requests(id,team_id,user_id) VALUES
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000021'),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000022'),
 ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000023');
SELECT public.reject_team_join_request('00000000-0000-4000-8000-000000000201');
SELECT public.reject_team_join_request('00000000-0000-4000-8000-000000000203');
UPDATE audit.team_formation_events SET occurred_at=statement_timestamp()-interval '8 days' WHERE kind='request_submitted' AND request_id IN ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000203');
UPDATE audit.team_formation_events t SET occurred_at=s.occurred_at+interval '7 days'+CASE WHEN t.request_id='00000000-0000-4000-8000-000000000203' THEN interval '1 second' ELSE interval '0 seconds' END FROM audit.team_formation_events s WHERE t.kind='request_resolved' AND s.kind='request_submitted' AND t.request_id=s.request_id AND s.request_id IN('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000203');
UPDATE audit.team_formation_accounts SET registered_at=now()-interval '8 days',activated_at=now()-interval '1 day',activation_source='request_acceptance' WHERE user_id='00000000-0000-4000-8000-000000000021';
UPDATE audit.team_formation_accounts SET registered_at=now()-interval '8 days' WHERE user_id='00000000-0000-4000-8000-000000000022';
DO $$DECLARE report jsonb := public.get_team_formation_report(now()-interval '9 days',now()-interval '7 days'); BEGIN
  PERFORM pg_temp.check_ok(report->'requests'->>'mature'='3' AND report->'requests'->>'responded7'='1' AND report->'requests'->>'pending'='1','seven-day boundary: all mature submissions, pending and late decisions in denominator');
  PERFORM pg_temp.check_ok(report->'activation'->>'mature'='2' AND report->'activation'->>'activated7'='1','registration denominator includes non-joiners');
END $$;
UPDATE public.team_join_requests SET created_at=NULL WHERE id='00000000-0000-4000-8000-000000000202';
SELECT pg_temp.check_ok(public.get_team_formation_report(now()-interval '1 day',now())->'backlog'->>'unknown_age'='1','nullable pending time remains unknown');

-- Force immediate deferred checks; canonical source may enrich only this transaction.
BEGIN;
SET CONSTRAINTS ALL IMMEDIATE;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000024';
SELECT public.create_team_with_owner('Synthetic immediate','Synthetic test',4,NULL,NULL,NULL,'{}','{}');
COMMIT;
SELECT pg_temp.check_ok((SELECT source='owner_creation' FROM audit.team_formation_events WHERE user_id='00000000-0000-4000-8000-000000000024' AND kind='membership_created'),'immediate fallback enriched within same transaction');
SELECT pg_temp.check_ok((SELECT activation_source='owner_creation' FROM audit.team_formation_accounts WHERE user_id='00000000-0000-4000-8000-000000000024'),'immediate first activation classified correctly');
BEGIN;
INSERT INTO public.team_members(team_id,user_id) VALUES('00000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000025');
ROLLBACK;
SELECT pg_temp.check_ok(NOT EXISTS(SELECT FROM audit.team_formation_events WHERE user_id='00000000-0000-4000-8000-000000000025'),'explicit transaction rollback leaves no acquisition');
INSERT INTO auth.users(id,created_at) VALUES('00000000-0000-4000-8000-000000000031',now()-interval '1 year');
INSERT INTO public.profiles(id,created_at) VALUES('00000000-0000-4000-8000-000000000031',now());
SELECT pg_temp.check_ok((SELECT NOT eligible FROM audit.team_formation_accounts WHERE user_id='00000000-0000-4000-8000-000000000031'),'late legacy profile cannot fake a new registration');
UPDATE public.team_members SET user_id='00000000-0000-4000-8000-000000000028' WHERE team_id='00000000-0000-4000-8000-000000000074' AND user_id='00000000-0000-4000-8000-000000000012';
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM audit.team_formation_events WHERE kind='membership_reassigned'),'identity maintenance is visible without fabricating another acquisition');
SELECT pg_temp.check_ok((SELECT activation_source='unattributed' FROM audit.team_formation_accounts WHERE user_id='00000000-0000-4000-8000-000000000028'),'maintenance membership cannot fake a later first activation');
SELECT pg_temp.check_ok(public.get_team_formation_report(now()-interval '1 day',now())->>'qualityIssues'='1','founder report exposes maintenance coverage gap');
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000029';
SELECT public.request_to_join_team('00000000-0000-4000-8000-000000000075');
UPDATE public.team_join_requests SET status='legacy-resolved' WHERE user_id=auth.uid();
INSERT INTO public.team_invites(team_id,invited_user_id,invited_by) VALUES('00000000-0000-4000-8000-000000000075',auth.uid(),'00000000-0000-4000-8000-000000000001');
SELECT public.accept_team_invite((SELECT id FROM public.team_invites WHERE invited_user_id=auth.uid()));
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM audit.team_formation_events WHERE user_id=auth.uid() AND kind='request_resolved' AND source='removed_unclassified'),'legacy non-pending cleanup preserves invitation success without duplicate terminal facts');
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000030';
SELECT public.request_to_join_team('00000000-0000-4000-8000-000000000072');
UPDATE audit.team_formation_events SET occurred_at=now()-interval '8 days' WHERE user_id=auth.uid() AND kind='request_submitted';
UPDATE public.team_join_requests SET user_id='00000000-0000-4000-8000-000000000025' WHERE user_id=auth.uid();
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT public.accept_team_join_request((SELECT id FROM public.team_join_requests WHERE user_id='00000000-0000-4000-8000-000000000025'));
DO $$DECLARE report jsonb:=public.get_team_formation_report(now()-interval '9 days',now()-interval '7 days'); BEGIN
  PERFORM pg_temp.check_ok(report->'requests'->>'unexplained'='1' AND report->'requests'->>'unclassified'='1' AND report->'requests'->>'pending'='1','identity-mismatched request is unknown, never a conversion or an assumed pending row');
END $$;

INSERT INTO public.team_join_requests(id,team_id,user_id) VALUES
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000020'),
 ('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000072','00000000-0000-4000-8000-000000000020'),
 ('00000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000073','00000000-0000-4000-8000-000000000026'),
 ('00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000073','00000000-0000-4000-8000-000000000027');
