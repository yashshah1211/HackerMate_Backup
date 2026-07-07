-- Migration: 202607080001_security_and_schema_fixes
-- Fixes critical database security and schema constraint issues.

-- ----------------------------------------------------
-- A. Drop Insecure Client-Side Policies
-- ----------------------------------------------------
DROP POLICY IF EXISTS team_members_insert ON public.team_members;

-- ----------------------------------------------------
-- B. Correct Trigger Idempotency & Function Security
-- ----------------------------------------------------
-- 1. Fix handle_new_user profile creation (add ON CONFLICT)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2. Add search_path to is_conversation_participant
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  select exists (
    select 1
    from conversation_participants
    where conversation_id = conv_id
    and user_id = auth.uid()
  );
$$;

-- 3. Add search_path to remove_member_from_team_conversation
CREATE OR REPLACE FUNCTION public.remove_member_from_team_conversation()
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
  where team_id = old.team_id and type = 'team'
  limit 1;

  if conv_id is not null then
    delete from conversation_participants
    where conversation_id = conv_id and user_id = old.user_id;
  end if;

  return old;
end;
$$;

-- ----------------------------------------------------
-- C. Revoke PUBLIC execution grants on security definers
-- ----------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.add_member_to_team_conversation() FROM public;
REVOKE EXECUTE ON FUNCTION public.create_team_conversation() FROM public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;
REVOKE EXECUTE ON FUNCTION public.remove_member_from_team_conversation() FROM public;
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.pin_message(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.unpin_message(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.send_message_with_mentions(uuid, text, uuid[]) FROM public;

GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pin_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpin_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_message_with_mentions(uuid, text, uuid[]) TO authenticated;

-- ----------------------------------------------------
-- D. Fix Foreign Key Constraints & Cascade Behavior
-- ----------------------------------------------------
-- 1. team_members.user_id (add ON DELETE CASCADE)
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_user_id_fkey;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. team_join_requests.team_id & user_id (add ON DELETE CASCADE)
ALTER TABLE public.team_join_requests DROP CONSTRAINT IF EXISTS team_join_requests_team_id_fkey;
ALTER TABLE public.team_join_requests ADD CONSTRAINT team_join_requests_team_id_fkey 
  FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE public.team_join_requests DROP CONSTRAINT IF EXISTS team_join_requests_user_id_fkey;
ALTER TABLE public.team_join_requests ADD CONSTRAINT team_join_requests_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 3. teams.hackathon_id (add ON DELETE SET NULL)
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_hackathon_id_fkey;
ALTER TABLE public.teams ADD CONSTRAINT teams_hackathon_id_fkey 
  FOREIGN KEY (hackathon_id) REFERENCES public.hackathons(id) ON DELETE SET NULL;

-- ----------------------------------------------------
-- E. Redundancy Cleanup
-- ----------------------------------------------------
ALTER TABLE public.conversation_participants DROP CONSTRAINT IF EXISTS unique_participant;
