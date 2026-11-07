BEGIN;

-- The server verifies the HMAC before calling this RPC. Never grant browser roles
-- EXECUTE: possession of a UUID alone must not authorize tracking updates.
CREATE FUNCTION public.record_organizer_email_open(p_lead_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.organizer_leads
  SET open_count = COALESCE(open_count, 0) + 1,
      opened_at = statement_timestamp(),
      updated_at = statement_timestamp(),
      status = CASE WHEN status IN ('new', 'pitch_sent') THEN 'opened' ELSE status END
  WHERE id = p_lead_id
    -- A provider/mail proxy can fetch the image before send bookkeeping commits.
    -- Do not turn a never-contacted new lead into opened and defeat the sender's
    -- status compare-and-set (which would lose contact history/dedup evidence).
    AND pitch_sent_at IS NOT NULL
    -- Positive allowlist: removed/archived/no_email/held/unknown future states
    -- are unchanged, including timestamps. Predicate rechecks under row locking.
    AND status IN ('new', 'pitch_sent', 'opened', 'replied', 'negotiating', 'partner_live');
$$;

REVOKE ALL ON FUNCTION public.record_organizer_email_open(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_organizer_email_open(uuid) TO service_role;

COMMIT;
