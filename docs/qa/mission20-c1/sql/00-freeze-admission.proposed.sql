-- REVIEW ONLY. Later separately authorized release gate; local fixture only now.
-- First freeze new ordinary admissions. SELECT/preferences/cancellation remain.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE POLICY mission20_release_freeze ON public.hackathon_registrations AS RESTRICTIVE
FOR INSERT TO authenticated WITH CHECK(false);
REVOKE INSERT ON public.hackathon_registrations FROM PUBLIC,anon,authenticated;
DO $$ DECLARE columns text; BEGIN
  SELECT string_agg(quote_ident(attname),', ' ORDER BY attnum) INTO columns
  FROM pg_catalog.pg_attribute WHERE attrelid='public.hackathon_registrations'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s) ON public.hackathon_registrations FROM PUBLIC, anon, authenticated',columns);
END; $$;
COMMIT;
