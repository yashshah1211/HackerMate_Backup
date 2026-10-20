-- UNAPPLIED. Install only after separate review/approval, with registration OFF.
-- Existing canonical migrations are immutable. No Auth/browser table grants.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Trusted postgres executor required'; END IF;
 IF to_regprocedure('public.hustle_phase2_has_active_session()') IS NULL THEN RAISE EXCEPTION 'Reviewed auth-guards migration required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid IN ('public.hustle_phase2_has_active_session()'::regprocedure,'public.hustle_phase2_inspect(text)'::regprocedure,'public.hustle_phase2_respond(text,text)'::regprocedure,'public.hustle_phase2_snapshot()'::regprocedure) AND proowner<>'postgres'::regrole) THEN RAISE EXCEPTION 'Unexpected trusted function ownership'; END IF;
 IF NOT has_column_privilege('postgres','auth.users','email_confirmed_at','SELECT')
 OR NOT has_column_privilege('postgres','auth.users','is_anonymous','SELECT') THEN RAISE EXCEPTION 'Trusted owner Auth metadata privileges required; do not broaden browser grants'; END IF;
 -- The official roster has not arrived. Do not infer/backfill member identity.
 IF EXISTS(SELECT 1 FROM public.hustle_phase2_teams) THEN RAISE EXCEPTION 'Existing shortlist requires separately reviewed identity reconciliation'; END IF;
END $$;

-- Names are not identity: legitimate namesakes are distinguished by approved emails/UUIDs.
ALTER TABLE public.hustle_phase2_teams DROP CONSTRAINT hustle_phase2_teams_check;
ALTER TABLE public.hustle_phase2_teams ADD CONSTRAINT hustle_phase2_teams_second_member_name_check CHECK(length(second_member_name) BETWEEN 1 AND 120);

CREATE TABLE public.hustle_phase2_participants (
 team_id uuid NOT NULL REFERENCES public.hustle_phase2_teams(id),
 event_id uuid NOT NULL DEFAULT '0da43cba-90dc-449c-a126-a2fc8be8a379' CHECK(event_id='0da43cba-90dc-449c-a126-a2fc8be8a379'),
 role text NOT NULL CHECK(role IN ('leader','member')),
 full_name text NOT NULL CHECK(length(full_name) BETWEEN 1 AND 120),
 email text NOT NULL CHECK(email=lower(btrim(email)) AND length(email)<=254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 verified_at timestamptz,
 PRIMARY KEY(team_id,role), UNIQUE(event_id,email), UNIQUE(event_id,user_id)
);
ALTER TABLE public.hustle_phase2_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hustle_phase2_participants FROM PUBLIC,anon,authenticated,service_role;
-- Import may create official slots, never manufacture a verified account binding.
GRANT INSERT(team_id,role,full_name,email) ON public.hustle_phase2_participants TO service_role;
ALTER TABLE public.hustle_phase2_audit DROP CONSTRAINT hustle_phase2_audit_action_check;
ALTER TABLE public.hustle_phase2_audit ADD CONSTRAINT hustle_phase2_audit_action_check CHECK(action IN ('import','activate','invite','revoke','confirmed','declined','account_verified'));

CREATE FUNCTION public.hustle_phase2_participant_identity()
RETURNS TABLE(user_id uuid,email text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.hustle_phase2_has_active_session() THEN RAISE EXCEPTION 'Verified participant access required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT u.id,lower(btrim(u.email)) FROM auth.users u JOIN public.profiles p ON p.id=u.id
 WHERE u.id=auth.uid() AND u.is_anonymous IS FALSE AND u.email_confirmed_at IS NOT NULL
 AND u.email IS NOT NULL AND btrim(u.email)<>'' AND p.is_banned IS FALSE AND p.onboarding_completed IS TRUE
 AND NOT EXISTS(SELECT 1 FROM auth.users other WHERE other.id<>u.id AND lower(btrim(other.email))=lower(btrim(u.email)) AND other.email_confirmed_at IS NOT NULL AND other.is_anonymous IS FALSE);
 IF NOT FOUND THEN RAISE EXCEPTION 'Verified participant access required' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION public.hustle_phase2_invitation_matches(p_team uuid,p_hash text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_hash ~ '^[a-f0-9]{64}$' AND EXISTS(SELECT 1 FROM public.hustle_phase2_invites i
 WHERE i.team_id=p_team AND i.token_hash=p_hash AND i.revoked_at IS NULL AND i.expires_at>clock_timestamp());
$$;

CREATE FUNCTION public.hustle_phase2_participant(p_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_identity record; v_slot public.hustle_phase2_participants%ROWTYPE; v_count integer; v_verified integer;
BEGIN
 SELECT * INTO STRICT v_identity FROM public.hustle_phase2_participant_identity();
 SELECT p.* INTO v_slot FROM public.hustle_phase2_participants p JOIN public.hustle_phase2_teams t ON t.id=p.team_id
 JOIN public.hustle_phase2_batches b ON b.id=t.batch_id
 WHERE p.user_id=v_identity.user_id AND p.email=v_identity.email AND p.verified_at IS NOT NULL AND b.activated_at IS NOT NULL;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF p_hash IS NOT NULL AND (v_slot.role<>'leader' OR NOT public.hustle_phase2_invitation_matches(v_slot.team_id,p_hash)) THEN RAISE EXCEPTION 'Invitation unavailable for this account' USING ERRCODE='42501'; END IF;
 SELECT count(*),count(*) FILTER(WHERE user_id IS NOT NULL AND verified_at IS NOT NULL) INTO v_count,v_verified FROM public.hustle_phase2_participants WHERE team_id=v_slot.team_id;
 RETURN (SELECT jsonb_build_object('team_name',t.team_name,'leader_name',t.leader_name,'second_member_name',t.second_member_name,
 'role',v_slot.role,'own_verified',true,'members_required',v_count,'members_verified',v_verified,'fully_onboarded',v_count=v_verified,
 'decision',t.decision,'window',public.hustle_phase2_window(clock_timestamp()),'can_respond',v_slot.role='leader' AND p_hash IS NOT NULL)
 FROM public.hustle_phase2_teams t WHERE t.id=v_slot.team_id);
END $$;

CREATE FUNCTION public.hustle_phase2_claim(p_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_identity record; v_slot public.hustle_phase2_participants%ROWTYPE;
BEGIN
 SELECT * INTO STRICT v_identity FROM public.hustle_phase2_participant_identity();
 SELECT p.* INTO v_slot FROM public.hustle_phase2_participants p JOIN public.hustle_phase2_teams t ON t.id=p.team_id
 JOIN public.hustle_phase2_batches b ON b.id=t.batch_id WHERE p.email=v_identity.email AND b.activated_at IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved shortlist identity not available' USING ERRCODE='42501'; END IF;
 -- All participant mutations lock team before slot/invite. Signup has no attendance cutoff.
 PERFORM id FROM public.hustle_phase2_teams WHERE id=v_slot.team_id FOR UPDATE;
 SELECT * INTO STRICT v_slot FROM public.hustle_phase2_participants WHERE team_id=v_slot.team_id AND role=v_slot.role FOR UPDATE;
 IF p_hash IS NOT NULL AND (v_slot.role<>'leader' OR NOT public.hustle_phase2_invitation_matches(v_slot.team_id,p_hash)) THEN RAISE EXCEPTION 'Invitation unavailable for this account' USING ERRCODE='42501'; END IF;
 IF (v_slot.user_id IS NOT NULL AND v_slot.user_id<>v_identity.user_id) OR (v_slot.user_id IS NULL AND v_slot.verified_at IS NOT NULL) THEN RAISE EXCEPTION 'Organizer identity reconciliation required' USING ERRCODE='42501'; END IF;
 IF NOT public.hustle_phase2_limit('claim:'||v_identity.user_id::text,30) THEN RAISE SQLSTATE 'PT429' USING MESSAGE='Too many participant requests'; END IF;
 IF v_slot.user_id IS NULL THEN
  UPDATE public.hustle_phase2_participants SET user_id=v_identity.user_id,verified_at=clock_timestamp() WHERE team_id=v_slot.team_id AND role=v_slot.role;
  INSERT INTO public.hustle_phase2_audit(actor_id,team_id,action) VALUES(v_identity.user_id,v_slot.team_id,'account_verified');
 END IF;
 RETURN public.hustle_phase2_participant(p_hash);
END $$;

-- Same legacy signatures, different authority: old service-role/token-only callers fail closed.
CREATE OR REPLACE FUNCTION public.hustle_phase2_inspect(p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
 IF p_hash IS NULL THEN RAISE EXCEPTION 'Invitation required' USING ERRCODE='42501'; END IF;
 v_result:=public.hustle_phase2_participant(p_hash);
 IF v_result IS NULL THEN RAISE EXCEPTION 'Verified participant access required' USING ERRCODE='42501'; END IF;
 RETURN v_result;
END $$;
CREATE OR REPLACE FUNCTION public.hustle_phase2_respond(p_hash text,p_decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_identity record; v_team public.hustle_phase2_teams%ROWTYPE; v_invite public.hustle_phase2_invites%ROWTYPE; v_now timestamptz;
BEGIN
 SELECT * INTO STRICT v_identity FROM public.hustle_phase2_participant_identity();
 IF p_decision IS NULL OR p_decision NOT IN ('confirmed','declined') THEN RETURN jsonb_build_object('status','invalid'); END IF;
 SELECT t.* INTO v_team FROM public.hustle_phase2_teams t JOIN public.hustle_phase2_invites i ON i.team_id=t.id WHERE i.token_hash=p_hash FOR UPDATE OF t;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.hustle_phase2_participants p WHERE p.team_id=v_team.id AND p.role='leader' AND p.user_id=v_identity.user_id AND p.email=v_identity.email AND p.verified_at IS NOT NULL) THEN RAISE EXCEPTION 'Verified leader required' USING ERRCODE='42501'; END IF;
 IF NOT public.hustle_phase2_limit('response:'||v_identity.user_id::text,12) THEN RAISE SQLSTATE 'PT429' USING MESSAGE='Too many participant requests'; END IF;
 SELECT * INTO v_invite FROM public.hustle_phase2_invites WHERE team_id=v_team.id AND token_hash=p_hash FOR UPDATE;
 v_now:=clock_timestamp();
 IF NOT FOUND OR v_invite.revoked_at IS NOT NULL OR v_invite.expires_at<=v_now OR NOT EXISTS(SELECT 1 FROM public.hustle_phase2_batches WHERE id=v_team.batch_id AND activated_at IS NOT NULL) THEN RETURN jsonb_build_object('status','invalid'); END IF;
 IF public.hustle_phase2_window(v_now)<>'open' THEN RETURN jsonb_build_object('status','closed'); END IF;
 IF v_team.decision<>'pending' THEN RETURN jsonb_build_object('status',CASE WHEN v_team.decision=p_decision THEN 'ok' ELSE 'conflict' END,'decision',v_team.decision); END IF;
 -- Intentionally no second-member readiness condition: attendance is independent.
 UPDATE public.hustle_phase2_teams SET decision=p_decision,decided_at=v_now WHERE id=v_team.id;
 INSERT INTO public.hustle_phase2_audit(actor_id,team_id,action) VALUES(v_identity.user_id,v_team.id,p_decision);
 RETURN jsonb_build_object('status','ok','decision',p_decision);
END $$;

CREATE OR REPLACE FUNCTION public.hustle_phase2_import(p_actor uuid,p_digest text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_batch uuid; v_count integer; r record; v_team uuid;
BEGIN
 IF NOT public.hustle_phase2_authorized(p_actor,true) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(20261023,1);
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Rows required'; END IF;
 v_count:=jsonb_array_length(p_rows);
 IF v_count NOT BETWEEN 1 AND 500 OR (SELECT count(*) FROM public.hustle_phase2_teams)+v_count>500 THEN RAISE EXCEPTION 'Invalid batch size'; END IF;
 INSERT INTO public.hustle_phase2_batches(source_digest,imported_by,row_count) VALUES(p_digest,p_actor,v_count) RETURNING id INTO v_batch;
 FOR r IN SELECT * FROM jsonb_to_recordset(p_rows) AS x(external_team_id text,team_name text,leader_name text,leader_email text,leader_whatsapp text,second_member_name text,second_member_email text) LOOP
  IF (r.second_member_name IS NULL)<>(r.second_member_email IS NULL) THEN RAISE EXCEPTION 'Paired member name and email required together'; END IF;
  INSERT INTO public.hustle_phase2_teams(batch_id,external_team_id,team_name,leader_name,leader_email,leader_whatsapp,second_member_name)
  VALUES(v_batch,r.external_team_id,r.team_name,r.leader_name,r.leader_email,r.leader_whatsapp,r.second_member_name) RETURNING id INTO v_team;
  INSERT INTO public.hustle_phase2_participants(team_id,role,full_name,email) VALUES(v_team,'leader',r.leader_name,r.leader_email);
  IF r.second_member_name IS NOT NULL THEN INSERT INTO public.hustle_phase2_participants(team_id,role,full_name,email) VALUES(v_team,'member',r.second_member_name,r.second_member_email); END IF;
 END LOOP;
 INSERT INTO public.hustle_phase2_audit(actor_id,batch_id,action) VALUES(p_actor,v_batch,'import');
 RETURN jsonb_build_object('batchId',v_batch,'imported',v_count,'active',false);
END $$;

CREATE OR REPLACE FUNCTION public.hustle_phase2_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.hustle_phase2_has_active_session() OR NOT public.can_access_partner_event('0da43cba-90dc-449c-a126-a2fc8be8a379') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'counts',(SELECT jsonb_build_object('shortlisted',count(*),'confirmed',count(*) FILTER(WHERE decision='confirmed'),'declined',count(*) FILTER(WHERE decision='declined'),'pending',count(*) FILTER(WHERE decision='pending')) FROM public.hustle_phase2_teams),
 'teams',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'external_team_id',t.external_team_id,'team_name',t.team_name,'leader_name',t.leader_name,'leader_email',t.leader_email,'leader_whatsapp',t.leader_whatsapp,'second_member_name',t.second_member_name,'batch_id',t.batch_id,'decision',t.decision,'decided_at',t.decided_at,
 'members',(SELECT jsonb_agg(jsonb_build_object('role',p.role,'name',p.full_name,'email',p.email,'verified',p.user_id IS NOT NULL AND p.verified_at IS NOT NULL) ORDER BY p.role) FROM public.hustle_phase2_participants p WHERE p.team_id=t.id),
 'invite_status',CASE WHEN i.team_id IS NULL THEN 'not_created' WHEN i.revoked_at IS NOT NULL THEN 'revoked' ELSE 'ready' END) ORDER BY t.external_team_id) FROM public.hustle_phase2_teams t LEFT JOIN public.hustle_phase2_invites i ON i.team_id=t.id),'[]'::jsonb),
 'batches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'source_digest',source_digest,'row_count',row_count,'activated_at',activated_at) ORDER BY imported_at) FROM public.hustle_phase2_batches),'[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.hustle_phase2_participant_identity(),public.hustle_phase2_invitation_matches(uuid,text),public.hustle_phase2_claim(text),public.hustle_phase2_participant(text),public.hustle_phase2_inspect(text),public.hustle_phase2_respond(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hustle_phase2_claim(text),public.hustle_phase2_participant(text),public.hustle_phase2_inspect(text),public.hustle_phase2_respond(text,text) TO authenticated;
COMMIT;
