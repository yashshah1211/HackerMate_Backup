-- REVIEW ONLY. C2 cancellation contract; never an active migration.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hackathon_registrations' AND policyname='mission20_release_freeze') THEN
  RAISE EXCEPTION 'admission_freeze_required'; END IF;
END; $$;
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
REVOKE ALL ON FUNCTION mission20_private.lock_own_cancellation(uuid,uuid),public.mission20_cancel_registration(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION mission20_private.lock_own_cancellation(uuid,uuid),public.mission20_cancel_registration(uuid,uuid) TO authenticated;
COMMIT;
