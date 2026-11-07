BEGIN;

-- A restoration changes eligibility state only. Durable history stays intact.
CREATE FUNCTION public.restore_organizer_lead(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_status text;
  changed_id uuid;
BEGIN
  SELECT status INTO current_status
  FROM public.organizer_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'missing', 'lead_id', p_lead_id);
  END IF;
  IF current_status IS DISTINCT FROM 'removed' THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'conflict', 'lead_id', p_lead_id);
  END IF;
  UPDATE public.organizer_leads
  SET status = 'restored_review', updated_at = pg_catalog.statement_timestamp()
  WHERE id = p_lead_id AND status = 'removed'
  RETURNING id INTO changed_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'conflict', 'lead_id', p_lead_id);
  END IF;
  RETURN pg_catalog.jsonb_build_object('outcome', 'restored', 'lead_id', changed_id, 'status', 'restored_review');
END;
$$;

REVOKE ALL ON FUNCTION public.restore_organizer_lead(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_organizer_lead(uuid) TO service_role;

COMMIT;
