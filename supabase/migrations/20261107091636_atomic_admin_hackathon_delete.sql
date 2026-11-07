BEGIN;

-- The API authorizes the administrator first. Existing FK CASCADE / SET NULL
-- actions run with this one parent DELETE; restrictive FKs and trigger errors
-- abort all its effects. Do not manually clear protected dependent tables.
CREATE FUNCTION public.admin_delete_hackathon(p_hackathon_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH deleted AS (
    DELETE FROM public.hackathons
    WHERE id = p_hackathon_id
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM deleted);
$$;

REVOKE ALL ON FUNCTION public.admin_delete_hackathon(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_hackathon(uuid) TO service_role;

COMMIT;
