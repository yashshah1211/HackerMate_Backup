-- ============================================================================
-- Migration: 20260823130000_optimize_rls_initplan
-- Purpose: Optimize hot-table RLS policies by wrapping auth.uid() in (select auth.uid()).
--
-- Background:
--   PostgreSQL re-evaluates raw `auth.uid()` function calls for every single
--   row scanned during a query. Wrapping with `(select auth.uid())` allows
--   Postgres to evaluate the authentication ID once as an InitPlan constant,
--   significantly reducing CPU overhead on hot tables during large scans.
--
-- Tables covered:
--   - notifications (read, update, delete)
--   - friend_requests (read, remove)
--   - saved_hackathons (read, save, remove)
--   - blocked_users (read, block, unblock)
--   - team_invites (read)
--   - team_join_requests (read, remove)
--   - hackathon_registrations (create, update, delete)
--   - builder_streak_history (insert)
--   - conversation_participants (update)
--   - message_reactions (delete)
-- ============================================================================

-- ── 1. Notifications ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_read" ON public.notifications;
CREATE POLICY "notifications_read"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
CREATE POLICY "notifications_delete"
  ON public.notifications FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ── 2. Friend Requests ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "friend_requests_read" ON public.friend_requests;
CREATE POLICY "friend_requests_read"
  ON public.friend_requests FOR SELECT TO authenticated
  USING ((sender_id = (select auth.uid())) OR (receiver_id = (select auth.uid())));

DROP POLICY IF EXISTS "friend_requests_remove" ON public.friend_requests;
CREATE POLICY "friend_requests_remove"
  ON public.friend_requests FOR DELETE TO authenticated
  USING ((sender_id = (select auth.uid())) OR (receiver_id = (select auth.uid())));

-- ── 3. Saved Hackathons ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow users to read their own saved hackathons" ON public.saved_hackathons;
CREATE POLICY "Allow users to read their own saved hackathons"
  ON public.saved_hackathons FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Allow users to save hackathons" ON public.saved_hackathons;
CREATE POLICY "Allow users to save hackathons"
  ON public.saved_hackathons FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Allow users to remove saved hackathons" ON public.saved_hackathons;
CREATE POLICY "Allow users to remove saved hackathons"
  ON public.saved_hackathons FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ── 4. Blocked Users ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow blocker to read own blocks" ON public.blocked_users;
CREATE POLICY "Allow blocker to read own blocks"
  ON public.blocked_users FOR SELECT TO authenticated
  USING (blocker_id = (select auth.uid()));

DROP POLICY IF EXISTS "Allow blocker to block users" ON public.blocked_users;
CREATE POLICY "Allow blocker to block users"
  ON public.blocked_users FOR INSERT TO authenticated
  WITH CHECK (blocker_id = (select auth.uid()));

DROP POLICY IF EXISTS "Allow blocker to unblock users" ON public.blocked_users;
CREATE POLICY "Allow blocker to unblock users"
  ON public.blocked_users FOR DELETE TO authenticated
  USING (blocker_id = (select auth.uid()));

-- ── 5. Team Invites ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "team_invites_read" ON public.team_invites;
CREATE POLICY "team_invites_read"
  ON public.team_invites FOR SELECT TO authenticated
  USING ((invited_user_id = (select auth.uid())) OR (invited_by = (select auth.uid())) OR is_team_owner(team_id));

-- ── 6. Team Join Requests ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "join_requests_read" ON public.team_join_requests;
CREATE POLICY "join_requests_read"
  ON public.team_join_requests FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())) OR is_team_owner(team_id));

DROP POLICY IF EXISTS "join_requests_remove" ON public.team_join_requests;
CREATE POLICY "join_requests_remove"
  ON public.team_join_requests FOR DELETE TO authenticated
  USING ((user_id = (select auth.uid())) OR is_team_owner(team_id));

-- ── 7. Hackathon Registrations ──────────────────────────────────────────────
DROP POLICY IF EXISTS "registrations_create_self" ON public.hackathon_registrations;
CREATE POLICY "registrations_create_self"
  ON public.hackathon_registrations FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())) AND ((team_id IS NULL) OR is_team_owner(team_id)));

DROP POLICY IF EXISTS "registrations_update_self" ON public.hackathon_registrations;
CREATE POLICY "registrations_update_self"
  ON public.hackathon_registrations FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK ((user_id = (select auth.uid())) AND ((team_id IS NULL) OR is_team_owner(team_id)));

DROP POLICY IF EXISTS "registrations_delete_self" ON public.hackathon_registrations;
CREATE POLICY "registrations_delete_self"
  ON public.hackathon_registrations FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ── 8. Builder Streak History ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert own streak history" ON public.builder_streak_history;
CREATE POLICY "Users can insert own streak history"
  ON public.builder_streak_history FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- ── 9. Conversation Participants ───────────────────────────────────────────
DROP POLICY IF EXISTS "conversation_participants_update" ON public.conversation_participants;
CREATE POLICY "conversation_participants_update"
  ON public.conversation_participants FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ── 10. Message Reactions ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "message_reactions_delete" ON public.message_reactions;
CREATE POLICY "message_reactions_delete"
  ON public.message_reactions FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));
