-- Migration: 202607180005_high_severity_rls_fixes
-- Fixes hackathon registrations update policy and brainstorm board management access controls.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix registrations_update_self Policy
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS registrations_update_self ON public.hackathon_registrations;
CREATE POLICY registrations_update_self ON public.hackathon_registrations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid() AND 
    (team_id IS NULL OR public.is_team_owner(team_id))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fix team_brainstorm_ideas manage policy
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow team members to manage their brainstorm ideas" ON public.team_brainstorm_ideas;

CREATE POLICY "Allow team members to update their brainstorm ideas" ON public.team_brainstorm_ideas
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id AND 
    auth.uid() IN (
      SELECT user_id FROM public.team_members 
      WHERE team_id = team_brainstorm_ideas.team_id
    )
  )
  WITH CHECK (
    auth.uid() = user_id AND 
    auth.uid() IN (
      SELECT user_id FROM public.team_members 
      WHERE team_id = team_brainstorm_ideas.team_id
    )
  );

CREATE POLICY "Allow team members to delete their brainstorm ideas" ON public.team_brainstorm_ideas
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id AND 
    auth.uid() IN (
      SELECT user_id FROM public.team_members 
      WHERE team_id = team_brainstorm_ideas.team_id
    )
  );
