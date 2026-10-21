-- UNAPPLIED. Registration stays HARD-OFF. Separate production approval required.
-- Google provenance is verified by the trusted PKCE callback against Google's
-- fixed userinfo endpoint; no browser can register its own proof.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Trusted postgres executor required'; END IF;
 IF to_regprocedure('public.hustle_phase2_participant_identity()') IS NULL
 OR to_regprocedure('public.hustle_phase2_has_active_session()') IS NULL THEN
  RAISE EXCEPTION 'Reviewed participant and active-session migrations required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid IN
  ('public.hustle_phase2_participant_identity()'::regprocedure,'public.hustle_phase2_has_active_session()'::regprocedure)
  AND proowner<>'postgres'::regrole) THEN RAISE EXCEPTION 'Unexpected trusted owner'; END IF;
 IF NOT has_column_privilege('postgres','auth.sessions','id','SELECT')
 OR NOT has_column_privilege('postgres','auth.sessions','user_id','SELECT')
 OR NOT has_column_privilege('postgres','auth.sessions','not_after','SELECT') THEN
  RAISE EXCEPTION 'Trusted session privileges required; do not broaden Auth grants'; END IF;
END $$;

-- No provider tokens, email, invitation, or other participant details stored.
-- No Auth schema changes/FKs/grants. Missing/revoked sessions always deny even
-- if an expired proof row remains. Retention cleanup is an operator task.
CREATE TABLE public.hustle_phase2_google_sessions (
 session_id uuid PRIMARY KEY,
 user_id uuid NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '24 hours'),
 CHECK(expires_at>verified_at AND expires_at<=verified_at+interval '24 hours 1 second')
);
ALTER TABLE public.hustle_phase2_google_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hustle_phase2_google_sessions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.hustle_phase2_attest_google_session(p_user uuid,p_session uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
 JOIN public.profiles p ON p.id=u.id WHERE s.id=p_session AND s.user_id=p_user
 AND (s.not_after IS NULL OR s.not_after>clock_timestamp())
 AND u.is_anonymous IS FALSE AND u.email_confirmed_at IS NOT NULL AND p.is_banned IS FALSE)
 THEN RAISE EXCEPTION 'Verified active session required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.hustle_phase2_google_sessions(session_id,user_id) VALUES(p_session,p_user)
 ON CONFLICT(session_id) DO NOTHING;
 RETURN EXISTS(SELECT 1 FROM public.hustle_phase2_google_sessions g WHERE g.session_id=p_session
 AND g.user_id=p_user AND g.expires_at>clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.hustle_phase2_attest_google_session(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hustle_phase2_attest_google_session(uuid,uuid) TO service_role;

CREATE FUNCTION public.hustle_phase2_google_session()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.hustle_phase2_has_active_session() THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.hustle_phase2_google_sessions g
 WHERE g.user_id=auth.uid() AND g.session_id=(auth.jwt()->>'session_id')::uuid
 AND g.expires_at>statement_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.hustle_phase2_google_session() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.hustle_phase2_google_session() TO authenticated;

-- Same signature, owner and existing ACL. All four participant RPCs funnel
-- through this helper, including direct PostgREST calls while Next is disabled.
CREATE OR REPLACE FUNCTION public.hustle_phase2_participant_identity()
RETURNS TABLE(user_id uuid,email text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.hustle_phase2_google_session() THEN RAISE EXCEPTION 'Verified Google participant access required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT u.id,lower(btrim(u.email)) FROM auth.users u JOIN public.profiles p ON p.id=u.id
 WHERE u.id=auth.uid() AND u.is_anonymous IS FALSE AND u.email_confirmed_at IS NOT NULL
 AND u.email IS NOT NULL AND btrim(u.email)<>'' AND p.is_banned IS FALSE AND p.onboarding_completed IS TRUE
 AND NOT EXISTS(SELECT 1 FROM auth.users other WHERE other.id<>u.id AND lower(btrim(other.email))=lower(btrim(u.email)) AND other.email_confirmed_at IS NOT NULL AND other.is_anonymous IS FALSE);
 IF NOT FOUND THEN RAISE EXCEPTION 'Verified participant access required' USING ERRCODE='42501'; END IF;
END $$;
COMMIT;
