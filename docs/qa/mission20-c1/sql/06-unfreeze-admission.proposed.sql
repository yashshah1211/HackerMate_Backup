-- REVIEW ONLY. Not rollout authorization. Operator receipts/gates in DESIGN.md
-- must be satisfied separately; SQL cannot prove all deployed adapters upgraded.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.team_members'::regclass
    AND tgname='mission20_lock_roster_parents' AND tgenabled='O')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE tablename='hackathon_registrations'
      AND schemaname='public' AND policyname='mission20_no_direct_native' AND permissive='RESTRICTIVE')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.hackathon_registrations'::regclass
      AND tgname='mission20_registration_write' AND tgenabled='O') THEN
    RAISE EXCEPTION 'per_team_and_contract_release_gate_required';
  END IF;
END; $$;
DROP POLICY mission20_release_freeze ON public.hackathon_registrations;
COMMIT;
