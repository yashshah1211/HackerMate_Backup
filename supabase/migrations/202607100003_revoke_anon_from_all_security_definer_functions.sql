-- Migration: 202607100003_revoke_anon_from_all_security_definer_functions
-- Security fix C5: Systemic revoke of anon execute rights on all
-- SECURITY DEFINER functions in the public schema.
--
-- Strategy:
--   1. Blanket REVOKE from anon.
--   2. Re-grant authenticated for all user-facing RPCs and RLS helpers.
--   3. Trigger-only and internal helper functions get NO new grants.
--   4. is_admin() is temporarily re-granted to anon because the profiles_read
--      policy is TO public and calls is_admin(). Remove after L3 fix
--      (changing profiles_read to TO authenticated).

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Blanket revoke from anon
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Re-grant authenticated for user-facing RPCs
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.accept_connection_request(p_request_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(p_invite_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_team_join_request(p_request_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_user_to_team(p_team_id uuid, p_user_id uuid, p_role text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_with_owner(p_name text, p_description text, p_max_members integer, p_college text, p_hackathon_id uuid, p_hackathon_name text, p_skills text[], p_roles_needed text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_team_conversation(p_team_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm(other_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_deadline_reminders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_team_instantly(p_team_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(p_conversation_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_deadline_reminder_sent(p_saved_ids uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pin_message(p_message_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_team_invite(p_invite_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_to_join_team(p_team_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_connection_request(p_receiver_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_message(p_conversation_id uuid, p_content text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_message_with_mentions(p_conversation_id uuid, p_content text, p_mentions uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_team_invite(p_team_id uuid, p_invited_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_feedback(p_type text, p_message text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_message_pin(p_message_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpin_message(p_message_id uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Re-grant authenticated for RLS helper functions
-- (used inside RLS policy USING expressions on authenticated-only tables)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.is_team_member(p_team_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_owner(p_team_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_conversation(p_conversation_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(conv_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(user_id uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: Temporary: re-grant is_admin to anon
-- The profiles_read policy is TO public and calls is_admin(auth.uid()).
-- Without this, unauthenticated profile reads would fail.
-- TODO: Remove this line after applying the L3 fix (profiles_read TO authenticated).
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.is_admin(user_id uuid) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger-only and internal helper functions intentionally receive no grants:
--   handle_new_user()
--   handle_notification_insert_webhook()
--   handle_profile_roles_update()
--   add_member_to_team_conversation()
--   create_team_conversation()
--   remove_member_from_team_conversation()
-- These are invoked exclusively by database triggers, not by application code.
-- ─────────────────────────────────────────────────────────────────────────────
