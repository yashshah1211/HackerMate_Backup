-- ============================================================================
-- Migration: 20260822120000_p0_hot_path_indexes
-- Purpose: Backfill missing indexes on the hottest access paths.
--   - Chat tables had NO indexes at all: every chat open, unread-count,
--     and last-message preview seq-scanned `messages`, while the RLS policy
--     `messages_read` re-evaluated can_access_conversation() PER ROW.
--   - FK columns below were never indexed (Postgres does not auto-index FKs).
-- Safe to run online: plain CREATE INDEX (tables are small; CONCURRENTLY is
-- not possible inside migration transactions anyway).
-- ============================================================================

-- ── Chat (hottest path: chatThread pagination, messages-page previews,
--    RLS policy probes, realtime DELETE replica lookups) ────────────────────

-- Serves: WHERE conversation_id = ? ORDER BY created_at DESC (+ range paging).
-- Leftmost prefix also covers bare conversation_id equality lookups, so no
-- separate single-column index on messages(conversation_id) is needed.
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON public.messages (conversation_id, created_at DESC);

-- Serves: can_access_conversation()'s EXISTS(conversation_id AND user_id)
-- probe, evaluated once per candidate message row under the RLS policy.
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conv_user
  ON public.conversation_participants (conversation_id, user_id);

-- Serves: "my conversations" inbox queries (WHERE user_id = ?).
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user
  ON public.conversation_participants (user_id);

-- Serves: sender-based stats/moderation lookups.
CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON public.messages (sender_id);

-- ── Notifications (navbar badge on every page load + /notifications feed) ──
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- ── Teams & membership (owner checks in RLS policies, "my teams", rosters) ─
CREATE INDEX IF NOT EXISTS idx_teams_owner
  ON public.teams (owner_id);

-- Roster scan direction (WHERE team_id = ?) — also powers member-count triggers.
CREATE INDEX IF NOT EXISTS idx_team_members_team_user
  ON public.team_members (team_id, user_id);

-- Reverse direction (WHERE user_id = ?): dashboard/my-teams membership lookup.
CREATE INDEX IF NOT EXISTS idx_team_members_user_team
  ON public.team_members (user_id, team_id);

-- Reverse lookup for trg_check_team_active_hackathons + per-hackathon team
-- counts. Composite PK (team_id, hackathon_id) does NOT serve this direction.
CREATE INDEX IF NOT EXISTS idx_team_hackathons_hackathon
  ON public.team_hackathons (hackathon_id);

-- ── Invites & join requests ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_team_invites_invited_user
  ON public.team_invites (invited_user_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_team
  ON public.team_invites (team_id);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_team_status
  ON public.team_join_requests (team_id, status);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_user
  ON public.team_join_requests (user_id);

-- ── Connections & blocks (dashboard runs pair lookups on every visit) ──────
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender
  ON public.friend_requests (sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver
  ON public.friend_requests (receiver_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker
  ON public.blocked_users (blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked
  ON public.blocked_users (blocked_id);

-- ── Hackathon registrations & saved hackathons ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hackathon_registrations_hackathon
  ON public.hackathon_registrations (hackathon_id);
CREATE INDEX IF NOT EXISTS idx_hackathon_registrations_user
  ON public.hackathon_registrations (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_hackathons_user
  ON public.saved_hackathons (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_hackathons_hackathon
  ON public.saved_hackathons (hackathon_id);

-- ── Badges ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_badges_user
  ON public.user_badges (user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_hackathon
  ON public.user_badges (hackathon_id);
