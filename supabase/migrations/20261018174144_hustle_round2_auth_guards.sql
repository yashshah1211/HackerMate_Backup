-- Proposed only: never apply to a connected database without separate approval.
-- Query/caller inventory: docs/hustle-round2-profile-query-audit.md.
-- Does not change profiles/Auth table grants, policies, accounts or sessions.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $guard$
BEGIN
 IF current_user <> 'postgres' THEN
  RAISE EXCEPTION 'Trusted postgres executor required' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.is_admin(uuid)'::regprocedure AND proowner='postgres'::regrole)
 OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.hustle_phase2_snapshot()'::regprocedure AND proowner='postgres'::regrole)
 THEN RAISE EXCEPTION 'Unexpected authorization function owner'; END IF;
 IF NOT has_schema_privilege('postgres','auth','USAGE')
 OR NOT has_column_privilege('postgres','auth.sessions','id','SELECT')
 OR NOT has_column_privilege('postgres','auth.sessions','user_id','SELECT')
 OR NOT has_column_privilege('postgres','auth.sessions','not_after','SELECT')
 THEN RAISE EXCEPTION 'Trusted owner lacks required Auth session privileges'; END IF;
END $guard$;

-- Signature/owner/EXECUTE ACL remain unchanged. Existing RLS and the role/ban
-- trigger now reject banned/null-ban admins without revoking editable columns.
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.profiles p
  WHERE p.id = user_id AND p.role = 'admin' AND p.is_banned IS FALSE);
$$;

-- Claims must come from the verified PostgREST/Auth JWT, never user_metadata.
-- Bind session to auth.uid as well as its PK. No caller-supplied IDs or rows.
CREATE FUNCTION public.hustle_phase2_has_active_session()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_user uuid := auth.uid();
 v_session text := auth.jwt()->>'session_id';
BEGIN
 IF v_user IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
 OR v_session IS NULL OR v_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN false; END IF;
 RETURN EXISTS (SELECT 1 FROM auth.sessions s
  WHERE s.id = v_session::uuid AND s.user_id = v_user
   AND (s.not_after IS NULL OR s.not_after > statement_timestamp()));
END;
$$;
REVOKE ALL ON FUNCTION public.hustle_phase2_has_active_session() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hustle_phase2_has_active_session() TO authenticated;
COMMENT ON FUNCTION public.hustle_phase2_has_active_session() IS
 'Boolean-only current-caller session check for Hustle Round 2; exposes no session identifiers or data.';

CREATE OR REPLACE FUNCTION public.hustle_phase2_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.hustle_phase2_has_active_session() OR NOT public.can_access_partner_event('0da43cba-90dc-449c-a126-a2fc8be8a379') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'counts',(SELECT jsonb_build_object('shortlisted',count(*),'confirmed',count(*) FILTER(WHERE decision='confirmed'),'declined',count(*) FILTER(WHERE decision='declined'),'pending',count(*) FILTER(WHERE decision='pending')) FROM public.hustle_phase2_teams),
 'teams',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'external_team_id',t.external_team_id,'team_name',t.team_name,'leader_name',t.leader_name,'leader_email',t.leader_email,'leader_whatsapp',t.leader_whatsapp,'second_member_name',t.second_member_name,'batch_id',t.batch_id,'decision',t.decision,'decided_at',t.decided_at,'invite_status',CASE WHEN i.team_id IS NULL THEN 'not_created' WHEN i.revoked_at IS NOT NULL THEN 'revoked' ELSE 'ready' END) ORDER BY t.external_team_id) FROM public.hustle_phase2_teams t LEFT JOIN public.hustle_phase2_invites i ON i.team_id=t.id),'[]'::jsonb),
 'batches',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'source_digest',source_digest,'row_count',row_count,'activated_at',activated_at) ORDER BY imported_at) FROM public.hustle_phase2_batches),'[]'::jsonb));
END; $$;

COMMIT;
