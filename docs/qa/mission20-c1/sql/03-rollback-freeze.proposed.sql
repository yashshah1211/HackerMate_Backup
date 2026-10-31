-- REVIEW ONLY. Availability rollback by write freeze; NEVER restore the bypass.
-- Run only in a separately authorized release response, not during C1.
BEGIN;
SET LOCAL lock_timeout = '3s';
REVOKE EXECUTE ON FUNCTION public.register_native_hackathon(uuid, uuid, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION mission20_private.register_native(uuid, uuid, boolean) FROM authenticated;
REVOKE INSERT ON public.hackathon_registrations FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS mission20_admission_frozen ON public.hackathon_registrations;
CREATE POLICY mission20_admission_frozen ON public.hackathon_registrations AS RESTRICTIVE
FOR INSERT TO authenticated WITH CHECK (false);
DO $$
DECLARE v_columns text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO v_columns
    FROM pg_catalog.pg_attribute WHERE attrelid = 'public.hackathon_registrations'::regclass
      AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s) ON public.hackathon_registrations FROM PUBLIC, anon, authenticated', v_columns);
END;
$$;
-- Keep readers, preferences, cancellation, records and approval guard intact.
-- Restore only reviewed function definitions from the release snapshot or fix
-- forward while writes are frozen; re-qualify before reopening admission.
COMMIT;
