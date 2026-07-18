-- Migration: 202607180008_restrict_policies_to_authenticated
-- Enforces authenticated role access on team tables by adding TO authenticated explicitly.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. team_task_comments
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow team members to view task comments" ON public.team_task_comments;
CREATE POLICY "Allow team members to view task comments" ON public.team_task_comments
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.team_members
      WHERE team_id = (SELECT team_id FROM public.team_tasks WHERE id = task_id)
    )
  );

DROP POLICY IF EXISTS "Allow team members to insert task comments" ON public.team_task_comments;
CREATE POLICY "Allow team members to insert task comments" ON public.team_task_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    auth.uid() IN (
      SELECT user_id FROM public.team_members
      WHERE team_id = (SELECT team_id FROM public.team_tasks WHERE id = task_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. team_link_upvotes
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow team members to view link upvotes" ON public.team_link_upvotes;
CREATE POLICY "Allow team members to view link upvotes" ON public.team_link_upvotes
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.team_members
      WHERE team_id = (SELECT team_id FROM public.team_links WHERE id = link_id)
    )
  );

DROP POLICY IF EXISTS "Allow team members to manage link upvotes" ON public.team_link_upvotes;
CREATE POLICY "Allow team members to manage link upvotes" ON public.team_link_upvotes
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id AND
    auth.uid() IN (
      SELECT user_id FROM public.team_members
      WHERE team_id = (SELECT team_id FROM public.team_links WHERE id = link_id)
    )
  )
  WITH CHECK (
    auth.uid() = user_id AND
    auth.uid() IN (
      SELECT user_id FROM public.team_members
      WHERE team_id = (SELECT team_id FROM public.team_links WHERE id = link_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. team_link_comments
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow team members to view link comments" ON public.team_link_comments;
CREATE POLICY "Allow team members to view link comments" ON public.team_link_comments
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.team_members
      WHERE team_id = (SELECT team_id FROM public.team_links WHERE id = link_id)
    )
  );

DROP POLICY IF EXISTS "Allow team members to insert link comments" ON public.team_link_comments;
CREATE POLICY "Allow team members to insert link comments" ON public.team_link_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    auth.uid() IN (
      SELECT user_id FROM public.team_members
      WHERE team_id = (SELECT team_id FROM public.team_links WHERE id = link_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. team_deployments
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow team members to view deployments" ON public.team_deployments;
CREATE POLICY "Allow team members to view deployments" ON public.team_deployments
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.team_members
      WHERE team_id = team_deployments.team_id
    )
  );

DROP POLICY IF EXISTS "Allow team members to manage deployments" ON public.team_deployments;
CREATE POLICY "Allow team members to manage deployments" ON public.team_deployments
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.team_members
      WHERE team_id = team_deployments.team_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM public.team_members
      WHERE team_id = team_deployments.team_id
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. team_brainstorm_ideas (view/insert; update/delete are already TO authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow team members to view brainstorm ideas" ON public.team_brainstorm_ideas;
CREATE POLICY "Allow team members to view brainstorm ideas" ON public.team_brainstorm_ideas
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.team_members
      WHERE team_id = team_brainstorm_ideas.team_id
    )
  );

DROP POLICY IF EXISTS "Allow team members to insert brainstorm ideas" ON public.team_brainstorm_ideas;
CREATE POLICY "Allow team members to insert brainstorm ideas" ON public.team_brainstorm_ideas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    auth.uid() IN (
      SELECT user_id FROM public.team_members
      WHERE team_id = team_brainstorm_ideas.team_id
    )
  );
