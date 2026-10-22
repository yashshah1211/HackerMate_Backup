-- Unapplied. Requires PR #45 migration; separate recovery/execution approval.
-- New run table has no prior application queries. Existing delivery ACLs unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Trusted postgres executor required'; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'hustle_phase2_%')<>21
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'hustle_phase2_%' AND proowner<>'postgres'::regrole)
 OR EXISTS(SELECT 1 FROM public.hustle_phase2_deliveries)
 THEN RAISE EXCEPTION 'STOP: expected trusted empty delivery baseline'; END IF;
END $$;
-- Hard schedule at the database boundary too; no historical migration replay.
ALTER TABLE public.hustle_phase2_deliveries ADD CONSTRAINT hustle_phase2_exact_schedule
 CHECK (scheduled_at='2026-10-23T08:35:00Z'::timestamptz);
CREATE TABLE public.hustle_phase2_autodispatch_runs (
 job text PRIMARY KEY CHECK(job='hustle-r2-2026-10-23'),
 manifest_hash text NOT NULL CHECK(manifest_hash ~ '^[a-f0-9]{64}$'),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','stopped')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
 problem_provider_id uuid,
 CHECK ((status='running')=(finished_at IS NULL))
);
ALTER TABLE public.hustle_phase2_autodispatch_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hustle_phase2_autodispatch_runs FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.hustle_phase2_autodispatch_claim(p_actor uuid,p_manifest text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.hustle_phase2_authorized(p_actor,true) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_manifest IS NULL OR p_manifest !~ '^[a-f0-9]{64}$'
 OR clock_timestamp()<'2026-10-23T00:45:00Z' OR clock_timestamp()>='2026-10-23T01:45:00Z'
 THEN RAISE EXCEPTION 'Invalid job scope or date'; END IF;
 INSERT INTO public.hustle_phase2_autodispatch_runs(job,manifest_hash,actor_id)
 VALUES('hustle-r2-2026-10-23',p_manifest,p_actor) ON CONFLICT DO NOTHING;
 RETURN FOUND; -- Never reset/reclaim running, stopped or completed jobs.
END $$;
CREATE FUNCTION public.hustle_phase2_autodispatch_finish(p_actor uuid,p_manifest text,p_complete boolean,p_problem uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.hustle_phase2_authorized(p_actor,true) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_complete IS NULL THEN RAISE EXCEPTION 'Explicit outcome required'; END IF;
 IF p_complete AND (p_problem IS NOT NULL OR (SELECT count(*) FROM public.hustle_phase2_deliveries)<>51
 OR EXISTS(SELECT 1 FROM public.hustle_phase2_deliveries WHERE status<>'accepted' OR provider_id IS NULL OR scheduled_at<>'2026-10-23T08:35:00Z'))
 THEN RAISE EXCEPTION 'Incomplete delivery reconciliation'; END IF;
 UPDATE public.hustle_phase2_autodispatch_runs SET status=CASE WHEN p_complete THEN 'completed' ELSE 'stopped' END,
 finished_at=clock_timestamp(),problem_provider_id=p_problem
 WHERE job='hustle-r2-2026-10-23' AND actor_id=p_actor AND manifest_hash=p_manifest AND status='running';
 IF NOT FOUND THEN RAISE EXCEPTION 'No matching running job; no overwrite'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.hustle_phase2_autodispatch_claim(uuid,text),public.hustle_phase2_autodispatch_finish(uuid,text,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hustle_phase2_autodispatch_claim(uuid,text),public.hustle_phase2_autodispatch_finish(uuid,text,boolean,uuid) TO service_role;
COMMIT;
