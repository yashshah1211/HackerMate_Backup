-- Migration: 202607100009_restrict_team_deletions
-- Security fix M7: Restrict team_tasks/team_links deletes to creator or owner.
--
-- Adds a created_by column to team_tasks to track who created each task.
-- Replaces the generic FOR ALL policies with granular SELECT, INSERT, UPDATE,
-- and DELETE policies for both team_tasks and team_links.
--
-- Only the item creator (created_by) or the team owner (is_team_owner) can
-- delete team tasks and team links. Other team members can still view, insert,
-- and update them.

-- 1. Add created_by column to team_tasks if it doesn't exist
ALTER TABLE public.team_tasks ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid();

-- 2. Restructure policies for team_tasks
DROP POLICY IF EXISTS team_tasks_policy ON public.team_tasks;

CREATE POLICY team_tasks_select ON public.team_tasks
  FOR SELECT TO authenticated USING (public.is_team_member(team_id));

CREATE POLICY team_tasks_insert ON public.team_tasks
  FOR INSERT TO authenticated WITH CHECK (public.is_team_member(team_id) AND (created_by IS NULL OR created_by = auth.uid()));

CREATE POLICY team_tasks_update ON public.team_tasks
  FOR UPDATE TO authenticated
  USING (public.is_team_member(team_id))
  WITH CHECK (public.is_team_member(team_id));

CREATE POLICY team_tasks_delete ON public.team_tasks
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_team_owner(team_id));

-- 3. Restructure policies for team_links
DROP POLICY IF EXISTS team_links_policy ON public.team_links;

CREATE POLICY team_links_select ON public.team_links
  FOR SELECT TO authenticated USING (public.is_team_member(team_id));

CREATE POLICY team_links_insert ON public.team_links
  FOR INSERT TO authenticated WITH CHECK (public.is_team_member(team_id) AND (created_by IS NULL OR created_by = auth.uid()));

CREATE POLICY team_links_update ON public.team_links
  FOR UPDATE TO authenticated
  USING (public.is_team_member(team_id))
  WITH CHECK (public.is_team_member(team_id));

CREATE POLICY team_links_delete ON public.team_links
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_team_owner(team_id));
