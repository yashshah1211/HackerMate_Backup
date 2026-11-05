-- STAB-021/022/023. Prepared for review; production application is a separate gate.
-- Query/column inventory: docs/stabilization/MISSION_03_PERMISSION_SWEEP.md.
-- Table-level REVOKE alone does not remove independent column-level grants.
BEGIN;

REVOKE UPDATE ON public.team_tasks, public.team_links FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, team_id, created_by, created_at) ON public.team_tasks FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, team_id, created_by, created_at) ON public.team_links FROM PUBLIC, anon, authenticated;
GRANT UPDATE (title, description, status, priority, assignee_id, due_date) ON public.team_tasks TO authenticated;
GRANT UPDATE (title, url, category, hackathon_id) ON public.team_links TO authenticated;

-- Keep existing owner-or-member semantics, including an owner with no membership
-- row. Read current suspension state instead of a potentially stale JWT claim.
DO $migration$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['team_tasks', 'team_links'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_select', target);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_insert', target);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_update', target);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target || '_delete', target);
    EXECUTE format($policy$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
        public.is_team_member(team_id) AND EXISTS (
          SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_banned = false
        ))$policy$, target || '_select', target);
    EXECUTE format($policy$
      CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
        public.is_team_member(team_id) AND (created_by IS NULL OR created_by = (SELECT auth.uid()))
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_banned = false)
      )$policy$, target || '_insert', target);
    EXECUTE format($policy$
      CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (public.is_team_member(team_id) AND EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_banned = false
      ))
      WITH CHECK (public.is_team_member(team_id) AND EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_banned = false
      ))$policy$, target || '_update', target);
    EXECUTE format($policy$
      CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (
        public.is_team_member(team_id) AND (created_by = (SELECT auth.uid()) OR public.is_team_owner(team_id))
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_banned = false)
      )$policy$, target || '_delete', target);
  END LOOP;
END;
$migration$;

-- STAB-023 review follow-up: the invoker document RPC must also obey current
-- account suspension. Keep the existing membership/revision protections intact.
-- The additional query inventory was recorded before this policy was authored.
DROP POLICY IF EXISTS team_documents_active_actor ON public.team_documents;
CREATE POLICY team_documents_active_actor ON public.team_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_team_member(team_id) AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_banned = false
  ))
  WITH CHECK (public.is_team_member(team_id) AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_banned = false
  ));

COMMIT;
