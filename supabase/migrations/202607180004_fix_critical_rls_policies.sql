-- Migration: 202607180004_fix_critical_rls_policies
-- Fixes critical vulnerability in conversation_participants and team_submissions RLS policies.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix conversation_participants_insert Policy
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS conversation_participants_insert ON public.conversation_participants;
CREATE POLICY conversation_participants_insert ON public.conversation_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    can_access_conversation(conversation_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fix team_submissions_insert Shadowing Policy
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS team_submissions_insert ON public.team_submissions;
CREATE POLICY team_submissions_insert ON public.team_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = team_submissions.team_id
      AND team_members.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = team_submissions.team_id
      AND teams.owner_id = auth.uid()
    )
  );
