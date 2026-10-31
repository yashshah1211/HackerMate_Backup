-- REVIEW ONLY. NOT EXECUTED. Requires expansion, adapter cutover and acceptance.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN ('authenticated','anon') AND (rolsuper OR rolbypassrls))
    OR pg_has_role('authenticated', 'postgres', 'MEMBER') OR pg_has_role('authenticated', 'service_role', 'MEMBER')
    OR pg_has_role('anon', 'postgres', 'MEMBER') OR pg_has_role('anon', 'service_role', 'MEMBER')
    OR has_table_privilege('authenticated', 'public.hackathon_registrations', 'TRUNCATE')
    OR has_table_privilege('anon', 'public.hackathon_registrations', 'TRUNCATE') THEN
    RAISE EXCEPTION 'unsafe_client_role_or_privilege_drift_requires_review';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.hackathon_registrations'::regclass
    AND tgname = 'mission20_registration_write' AND tgenabled = 'O')
    OR (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'hackathon_registrations') <> 4
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'hackathon_registrations'
      AND policyname NOT IN ('registrations_read_scoped', 'registrations_create_self', 'registrations_update_self', 'registrations_delete_self')) THEN
    RAISE EXCEPTION 'review_expansion_and_registration_policy_drift_before_contract';
  END IF;
END; $$;

-- Table-level REVOKE alone does not remove existing explicit column grants.
REVOKE INSERT ON public.hackathon_registrations FROM PUBLIC, anon, authenticated;
DO $$
DECLARE v_columns text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO v_columns
    FROM pg_catalog.pg_attribute WHERE attrelid = 'public.hackathon_registrations'::regclass
      AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s) ON public.hackathon_registrations FROM PUBLIC, anon, authenticated', v_columns);
END;
$$;
-- Backward-compatible community payload; status is overwritten by the trigger.
GRANT INSERT(hackathon_id, user_id, team_id, status, looking_for_team, metadata, is_hidden)
ON public.hackathon_registrations TO authenticated;
DROP POLICY registrations_create_self ON public.hackathon_registrations;
CREATE POLICY registrations_create_community ON public.hackathon_registrations FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid()) AND (SELECT public.has_verified_event_identity())
  AND (team_id IS NULL OR public.is_team_owner(team_id))
  AND EXISTS(SELECT 1 FROM public.hackathons h WHERE h.id = hackathon_registrations.hackathon_id
    AND h.type IN ('external', 'official') AND h.status = 'approved' AND h.archived IS FALSE)
);
-- Restrictive gate cannot be OR-bypassed by another permissive INSERT policy.
CREATE POLICY mission20_no_direct_native ON public.hackathon_registrations AS RESTRICTIVE
FOR INSERT TO authenticated WITH CHECK (
  user_id = (SELECT auth.uid()) AND (SELECT public.has_verified_event_identity())
  AND (team_id IS NULL OR public.is_team_owner(team_id))
  AND EXISTS(SELECT 1 FROM public.hackathons h WHERE h.id = hackathon_registrations.hackathon_id
    AND h.type IN ('external', 'official') AND h.status = 'approved' AND h.archived IS FALSE)
);
-- Existing private SELECT, guarded preference UPDATE, self DELETE and service
-- ACLs are unchanged. The insert trigger derives status for every role.

CREATE POLICY mission20_hackathon_create ON public.hackathons AS RESTRICTIVE
FOR INSERT TO authenticated WITH CHECK (
  organizer_id = (SELECT auth.uid())
  AND ((type = 'native' AND status = 'pending') OR (type = 'external' AND status = 'approved'))
);
CREATE POLICY mission20_hackathon_update ON public.hackathons AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (organizer_id = (SELECT auth.uid())) WITH CHECK (organizer_id = (SELECT auth.uid()));
COMMIT;
