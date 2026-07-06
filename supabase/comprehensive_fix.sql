-- ============================================================================
-- COMPREHENSIVE SUPABASE FIX SCRIPT
-- This script fixes all identified issues in the HackerMate database
-- ============================================================================

-- ============================================================================
-- 1. FIX TRIGGER FUNCTIONS WITH INVALID ON CONFLICT CLAUSES
-- ============================================================================

-- Fix create_team_conversation trigger
CREATE OR REPLACE FUNCTION public.create_team_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
begin
  -- Only insert if conversation doesn't already exist for this team
  if not exists (
    select 1 from conversations 
    where team_id = new.id and type = 'team'
  ) then
    insert into conversations (type, team_id)
    values ('team', new.id);
  end if;
  return new;
end;
$$;

-- Fix add_member_to_team_conversation trigger  
CREATE OR REPLACE FUNCTION public.add_member_to_team_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  conv_id uuid;
begin
  select id into conv_id
  from conversations
  where team_id = new.team_id and type = 'team'
  limit 1;

  if conv_id is not null then
    insert into conversation_participants (conversation_id, user_id)
    values (conv_id, new.user_id);
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 2. UPDATE create_team_with_owner TO MATCH MIGRATION FILE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_team_with_owner(
  p_name text,
  p_description text,
  p_max_members integer,
  p_college text,
  p_hackathon_id uuid,
  p_hackathon_name text,
  p_skills text[],
  p_roles_needed text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_description), '') is null then
    raise exception 'Team name and description are required';
  end if;
  if p_max_members < 2 or p_max_members > 20 then
    raise exception 'Team size must be between 2 and 20';
  end if;

  insert into public.teams (
    name, description, owner_id, max_members, college, hackathon_id,
    hackathon_name, skills, roles_needed
  )
  values (
    btrim(p_name), btrim(p_description), v_user_id, p_max_members, p_college,
    p_hackathon_id, p_hackathon_name, p_skills, p_roles_needed
  )
  returning id into v_team_id;

  insert into public.team_members (team_id, user_id, role)
  values (v_team_id, v_user_id, 'owner');

  -- Only create conversation if it doesn't already exist
  insert into public.conversations (type, team_id)
  values ('team', v_team_id)
  on conflict (team_id) do update set type = 'team'
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conversation_id, v_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return v_team_id;
end;
$$;

-- ============================================================================
-- 3. ADD MISSING RLS POLICY FOR FEEDBACK TABLE
-- ============================================================================

-- Allow users to read their own feedback
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'feedback' 
      AND policyname = 'feedback_read_own'
  ) THEN
    CREATE POLICY "feedback_read_own" 
    ON public.feedback FOR SELECT 
    TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- ============================================================================
-- 4. ENSURE team_documents HAS PROPER UNIQUE CONSTRAINT
-- ============================================================================

-- The migration already has UNIQUE constraint on team_id, but let's verify
-- If it doesn't exist, add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'team_documents_team_id_key'
  ) THEN
    ALTER TABLE public.team_documents 
    ADD CONSTRAINT team_documents_team_id_key UNIQUE (team_id);
  END IF;
END $$;

-- ============================================================================
-- 5. VERIFY AND FIX conversation_participants UNIQUE CONSTRAINT
-- ============================================================================

-- Add unique constraint on (conversation_id, user_id) if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'conversation_participants_conversation_user_key'
  ) THEN
    ALTER TABLE public.conversation_participants 
    ADD CONSTRAINT conversation_participants_conversation_user_key 
    UNIQUE (conversation_id, user_id);
  END IF;
END $$;

-- ============================================================================
-- 6. ENSURE PROPER INDEXES FOR PERFORMANCE
-- ============================================================================

-- Create indexes for common queries if they don't exist
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_invited_user_id ON public.team_invites(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_team_id ON public.team_invites(team_id);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_user_id ON public.team_join_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_team_id ON public.team_join_requests(team_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_id ON public.friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_id ON public.friend_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON public.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON public.conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_hackathon_registrations_user_id ON public.hackathon_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_hackathon_registrations_hackathon_id ON public.hackathon_registrations(hackathon_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker_id ON public.blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_id ON public.blocked_users(blocked_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_id ON public.user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported_id ON public.user_reports(reported_id);

-- ============================================================================
-- 7. VERIFY conversations TABLE HAS team_id INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_conversations_team_id ON public.conversations(team_id);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON public.conversations(type);

-- ============================================================================
-- 8. CLEANUP REDUNDANT ALTER TABLE STATEMENTS FROM FEEDBACK MIGRATION
-- ============================================================================
-- Note: The redundant ALTER statements in the feedback migration are harmless
-- since they use IF NOT EXISTS, but they're unnecessary. This is noted for
-- future cleanup in the migration file itself.

-- ============================================================================
-- 9. ENSURE PROPER FUNCTION PERMISSIONS
-- ============================================================================

-- Revoke and grant permissions for all functions
REVOKE ALL ON FUNCTION public.create_team_with_owner(text,text,integer,text,uuid,text,text[],text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.create_team_with_owner(text,text,integer,text,uuid,text,text[],text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.send_team_invite(uuid,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.send_team_invite(uuid,uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.request_to_join_team(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.request_to_join_team(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.add_user_to_team(uuid,uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.add_user_to_team(uuid,uuid,text) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_team_invite(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_team_invite(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_team_invite(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_team_join_request(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_team_join_request(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.send_connection_request(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.send_connection_request(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_connection_request(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_connection_request(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_or_create_dm(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.send_message(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.send_message(uuid,text) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_feedback(text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_feedback(text,text) TO authenticated;

REVOKE ALL ON FUNCTION public.join_team_instantly(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.join_team_instantly(uuid) TO authenticated;

-- ============================================================================
-- 10. VERIFY ALL TABLES HAVE RLS ENABLED
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hackathons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hackathon_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '=== COMPREHENSIVE FIX COMPLETED ===';
  RAISE NOTICE '1. Fixed trigger functions with invalid ON CONFLICT clauses';
  RAISE NOTICE '2. Updated create_team_with_owner to match migration file';
  RAISE NOTICE '3. Added missing RLS policy for feedback table';
  RAISE NOTICE '4. Verified team_documents unique constraint';
  RAISE NOTICE '5. Added conversation_participants unique constraint';
  RAISE NOTICE '6. Created performance indexes';
  RAISE NOTICE '7. Verified conversations table indexes';
  RAISE NOTICE '8. Ensured proper function permissions';
  RAISE NOTICE '9. Verified RLS is enabled on all tables';
  RAISE NOTICE '====================================';
END $$;
