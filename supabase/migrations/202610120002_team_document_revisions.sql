-- Apply in a controlled release BEFORE the new editor. Never apply from tests to Supabase.
-- Existing content, RLS policies and table privileges are unchanged.
BEGIN;

ALTER TABLE public.team_documents
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);

CREATE OR REPLACE FUNCTION public.guard_team_document_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 1;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.team_id IS DISTINCT FROM OLD.team_id THEN
      RAISE EXCEPTION 'Document identity cannot change' USING ERRCODE = '22023';
    END IF;
    -- Old browser bundles omit revision and must fail closed. A stale explicit
    -- revision also fails after PostgreSQL acquires the row lock.
    IF NEW.revision IS DISTINCT FROM OLD.revision + 1 THEN
      RAISE EXCEPTION 'Document revision required; reload the editor and review changes'
        USING ERRCODE = '40001';
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

-- Column-specific UPDATE intentionally leaves the existing updated_by FK's
-- ON DELETE SET NULL action intact. Every content write is guarded, even a no-op.
DROP TRIGGER IF EXISTS guard_team_document_revision ON public.team_documents;
CREATE TRIGGER guard_team_document_revision
BEFORE INSERT OR UPDATE OF content, revision, id, team_id ON public.team_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_team_document_revision();

CREATE OR REPLACE FUNCTION public.save_team_document(
  p_team_id uuid, p_document_id uuid, p_expected_revision integer, p_content text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE saved public.team_documents%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_team_member(p_team_id) THEN
    RAISE EXCEPTION 'Team membership required' USING ERRCODE = '42501';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 1 OR p_content IS NULL THEN
    RAISE EXCEPTION 'A revision and document content are required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.team_documents
    SET content = p_content, revision = p_expected_revision + 1
    WHERE id = p_document_id AND team_id = p_team_id AND revision = p_expected_revision
    RETURNING * INTO saved;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'saved', 'document', to_jsonb(saved));
  END IF;

  -- A zero-row UPDATE is never success. Separate authorization, deletion and
  -- revision conflict; a concurrent winner is visible to this next statement.
  IF NOT public.is_team_member(p_team_id) THEN
    RAISE EXCEPTION 'Team membership required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO saved FROM public.team_documents
    WHERE id = p_document_id AND team_id = p_team_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;
  IF saved.revision = p_expected_revision THEN
    RAISE EXCEPTION 'Document update was denied' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('status', 'conflict', 'document', to_jsonb(saved));
END;
$$;

REVOKE ALL ON FUNCTION public.guard_team_document_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_team_document(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_team_document(uuid, uuid, integer, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
