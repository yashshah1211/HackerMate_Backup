-- HackerMate core authorization and transactional workflows.
-- Apply with `supabase db push` after linking this directory to the project.

create extension if not exists pgcrypto;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_team_owner(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.teams
    where id = p_team_id and owner_id = auth.uid()
  );
$$;

create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_team_owner(p_team_id) or exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) or exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and c.team_id is not null
      and public.is_team_member(c.team_id)
  );
$$;

revoke all on function public.is_team_owner(uuid) from public;
revoke all on function public.is_team_member(uuid) from public;
revoke all on function public.can_access_conversation(uuid) from public;
grant execute on function public.is_team_owner(uuid) to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.can_access_conversation(uuid) to authenticated;

create or replace function public.create_team_with_owner(
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

  insert into public.conversations (type, team_id)
  values ('team', v_team_id)
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conversation_id, v_user_id);

  return v_team_id;
end;
$$;

create or replace function public.send_team_invite(
  p_team_id uuid,
  p_invited_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite_id uuid;
  v_team_name text;
begin
  select name into v_team_name
  from public.teams
  where id = p_team_id and owner_id = v_user_id
  for update;

  if v_team_name is null then
    raise exception 'Only the team owner can invite members';
  end if;
  if p_invited_user_id = v_user_id then
    raise exception 'You are already the team owner';
  end if;
  if exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = p_invited_user_id
  ) then
    raise exception 'This builder is already a team member';
  end if;
  if exists (
    select 1 from public.team_invites
    where team_id = p_team_id
      and invited_user_id = p_invited_user_id
      and status = 'pending'
  ) then
    raise exception 'An invitation is already pending';
  end if;

  insert into public.team_invites (team_id, invited_user_id, invited_by, status)
  values (p_team_id, p_invited_user_id, v_user_id, 'pending')
  returning id into v_invite_id;

  insert into public.notifications (user_id, message, link)
  values (p_invited_user_id, 'You have been invited to join ' || v_team_name, '/invites');

  return v_invite_id;
end;
$$;

create or replace function public.request_to_join_team(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_request_id uuid;
  v_owner_id uuid;
  v_team_name text;
  v_max_members integer;
  v_member_count integer;
begin
  select owner_id, name, max_members
    into v_owner_id, v_team_name, v_max_members
  from public.teams
  where id = p_team_id
  for update;

  if v_owner_id is null then
    raise exception 'Team not found';
  end if;
  if v_owner_id = v_user_id or exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = v_user_id
  ) then
    raise exception 'You are already a member of this team';
  end if;

  select count(*) into v_member_count
  from public.team_members where team_id = p_team_id;
  if v_max_members is not null and v_member_count >= v_max_members then
    raise exception 'This team is full';
  end if;
  if exists (
    select 1 from public.team_join_requests
    where team_id = p_team_id and user_id = v_user_id and status = 'pending'
  ) then
    raise exception 'A join request is already pending';
  end if;

  insert into public.team_join_requests (team_id, user_id, status)
  values (p_team_id, v_user_id, 'pending')
  returning id into v_request_id;

  insert into public.notifications (user_id, message, link)
  values (
    v_owner_id,
    'New join request for ' || v_team_name,
    '/teams/' || p_team_id::text || '/requests'
  );

  return v_request_id;
end;
$$;

create or replace function public.add_user_to_team(
  p_team_id uuid,
  p_user_id uuid,
  p_role text default 'member'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max_members integer;
  v_member_count integer;
  v_conversation_id uuid;
begin
  select max_members into v_max_members
  from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'Team not found';
  end if;

  select count(*) into v_member_count
  from public.team_members where team_id = p_team_id;
  if v_max_members is not null and v_member_count >= v_max_members then
    raise exception 'This team is full';
  end if;
  if exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = p_user_id
  ) then
    raise exception 'This builder is already a team member';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (p_team_id, p_user_id, p_role);

  select id into v_conversation_id
  from public.conversations
  where team_id = p_team_id and type = 'team'
  limit 1;

  if v_conversation_id is not null and not exists (
    select 1 from public.conversation_participants
    where conversation_id = v_conversation_id and user_id = p_user_id
  ) then
    insert into public.conversation_participants (conversation_id, user_id)
    values (v_conversation_id, p_user_id);
  end if;
end;
$$;

create or replace function public.accept_team_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_team_name text;
begin
  select i.team_id, t.name into v_team_id, v_team_name
  from public.team_invites i
  join public.teams t on t.id = i.team_id
  where i.id = p_invite_id
    and i.invited_user_id = v_user_id
    and i.status = 'pending'
  for update of i;

  if v_team_id is null then
    raise exception 'Pending invitation not found';
  end if;

  perform public.add_user_to_team(v_team_id, v_user_id, 'member');
  update public.team_invites set status = 'accepted' where id = p_invite_id;
  delete from public.team_join_requests
  where team_id = v_team_id and user_id = v_user_id;
  insert into public.notifications (user_id, message, link)
  values (v_user_id, 'You joined ' || v_team_name, '/teams/' || v_team_id::text);

  return v_team_id;
end;
$$;

create or replace function public.reject_team_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.team_invites
  set status = 'rejected'
  where id = p_invite_id
    and invited_user_id = auth.uid()
    and status = 'pending';
  if not found then
    raise exception 'Pending invitation not found';
  end if;
end;
$$;

create or replace function public.accept_team_join_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team_id uuid;
  v_requester_id uuid;
begin
  select r.team_id, r.user_id into v_team_id, v_requester_id
  from public.team_join_requests r
  join public.teams t on t.id = r.team_id
  where r.id = p_request_id
    and r.status = 'pending'
    and t.owner_id = auth.uid()
  for update of r;

  if v_team_id is null then
    raise exception 'Pending request not found or not authorized';
  end if;

  perform public.add_user_to_team(v_team_id, v_requester_id, 'member');
  delete from public.team_join_requests where id = p_request_id;
  insert into public.notifications (user_id, message, link)
  values (
    v_requester_id,
    'Your team request was accepted',
    '/teams/' || v_team_id::text
  );

  return v_team_id;
end;
$$;

create or replace function public.send_connection_request(p_receiver_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sender_id uuid := auth.uid();
  v_request_id uuid;
begin
  if v_sender_id is null or p_receiver_id = v_sender_id then
    raise exception 'Invalid connection request';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(least(v_sender_id::text, p_receiver_id::text) || ':' ||
      greatest(v_sender_id::text, p_receiver_id::text), 0)
  );
  if exists (
    select 1 from public.friend_requests
    where (sender_id = v_sender_id and receiver_id = p_receiver_id)
       or (sender_id = p_receiver_id and receiver_id = v_sender_id)
  ) then
    raise exception 'A connection or request already exists';
  end if;

  insert into public.friend_requests (sender_id, receiver_id, status)
  values (v_sender_id, p_receiver_id, 'pending')
  returning id into v_request_id;
  insert into public.notifications (user_id, message, link)
  values (p_receiver_id, 'You have a new connection request', '/connections');
  return v_request_id;
end;
$$;

create or replace function public.accept_connection_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sender_id uuid;
begin
  update public.friend_requests
  set status = 'accepted'
  where id = p_request_id
    and receiver_id = auth.uid()
    and status = 'pending'
  returning sender_id into v_sender_id;
  if v_sender_id is null then
    raise exception 'Pending connection request not found';
  end if;
  insert into public.notifications (user_id, message, link)
  values (
    v_sender_id,
    'Your connection request was accepted',
    '/profile/' || auth.uid()::text
  );
  return p_request_id;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'Conversation access denied';
  end if;
  update public.messages
  set is_read = true
  where conversation_id = p_conversation_id
    and sender_id <> auth.uid()
    and is_read = false;
end;
$$;

create or replace function public.get_or_create_dm(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user_id is null or other_user_id = v_user_id then
    raise exception 'Invalid direct-message recipient';
  end if;
  if not exists (
    select 1 from public.friend_requests
    where status = 'accepted'
      and (
        (sender_id = v_user_id and receiver_id = other_user_id)
        or (sender_id = other_user_id and receiver_id = v_user_id)
      )
  ) then
    raise exception 'You can only message connected builders';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(least(v_user_id::text, other_user_id::text) || ':' ||
      greatest(v_user_id::text, other_user_id::text), 1)
  );

  select c.id into v_conversation_id
  from public.conversations c
  where c.type = 'dm'
    and exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = c.id and p.user_id = v_user_id
    )
    and exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = c.id and p.user_id = other_user_id
    )
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (type)
    values ('dm')
    returning id into v_conversation_id;
    insert into public.conversation_participants (conversation_id, user_id)
    values
      (v_conversation_id, v_user_id),
      (v_conversation_id, other_user_id);
  end if;

  return v_conversation_id;
end;
$$;

create or replace function public.send_message(
  p_conversation_id uuid,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_content text := btrim(p_content);
  v_message_id uuid;
  v_match text[];
  v_url text;
  v_domain text;
  v_allowed text[] := array[
    'github.com', 'gitlab.com', 'bitbucket.org', 'vercel.app', 'netlify.app',
    'figma.com', 'miro.com', 'notion.so', 'notion.site', 'discord.gg',
    'discord.com', 'whatsapp.com', 'slack.com', 'zoom.us', 'meet.google.com',
    'google.com', 'linkedin.com', 'x.com', 'twitter.com', 'unstop.com',
    'devpost.com'
  ];
begin
  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'Conversation access denied';
  end if;
  if v_content is null or char_length(v_content) = 0 or char_length(v_content) > 5000 then
    raise exception 'Messages must contain between 1 and 5000 characters';
  end if;
  if v_content ~* '\m(fuck|shit|bitch|asshole|bastard|cunt|dick|pussy|motherfuck|whore|slut|faggot|nigger|chutiya|bhenchod|madarchod|gandu|bsdk)\M' then
    raise exception 'Message blocked by the community safety filter';
  end if;

  for v_match in
    select regexp_matches(
      v_content,
      '(https?://[^[:space:]]+|www\.[^[:space:]]+|[a-zA-Z0-9.-]+\.(com|org|net|in|co|io|edu|gov|us|xyz|info|biz|me|cc|tv)(/[^[:space:]]*)?)',
      'gi'
    )
  loop
    v_url := lower(v_match[1]);
    v_domain := regexp_replace(v_url, '^(https?://)?(www\.)?([^/:?#]+).*$', '\3');
    if not exists (
      select 1 from unnest(v_allowed) allowed
      where v_domain = allowed or right(v_domain, char_length(allowed) + 1) = '.' || allowed
    ) then
      raise exception 'This link domain is not allowed in HackerMate messages';
    end if;
  end loop;

  insert into public.messages (conversation_id, sender_id, content)
  values (p_conversation_id, auth.uid(), v_content)
  returning id into v_message_id;
  return v_message_id;
end;
$$;

revoke all on function public.create_team_with_owner(text,text,integer,text,uuid,text,text[],text[]) from public;
revoke all on function public.send_team_invite(uuid,uuid) from public;
revoke all on function public.request_to_join_team(uuid) from public;
revoke all on function public.add_user_to_team(uuid,uuid,text) from public;
revoke all on function public.accept_team_invite(uuid) from public;
revoke all on function public.reject_team_invite(uuid) from public;
revoke all on function public.accept_team_join_request(uuid) from public;
revoke all on function public.send_connection_request(uuid) from public;
revoke all on function public.accept_connection_request(uuid) from public;
revoke all on function public.mark_conversation_read(uuid) from public;
revoke all on function public.get_or_create_dm(uuid) from public;
revoke all on function public.send_message(uuid,text) from public;
grant execute on function public.create_team_with_owner(text,text,integer,text,uuid,text,text[],text[]) to authenticated;
grant execute on function public.send_team_invite(uuid,uuid) to authenticated;
grant execute on function public.request_to_join_team(uuid) to authenticated;
grant execute on function public.accept_team_invite(uuid) to authenticated;
grant execute on function public.reject_team_invite(uuid) to authenticated;
grant execute on function public.accept_team_join_request(uuid) to authenticated;
grant execute on function public.send_connection_request(uuid) to authenticated;
grant execute on function public.accept_connection_request(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.get_or_create_dm(uuid) to authenticated;
grant execute on function public.send_message(uuid,text) to authenticated;

-- Remove existing policies on application tables so a legacy permissive policy
-- cannot silently override the policies below.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'profiles', 'teams', 'team_members', 'team_invites',
        'team_join_requests', 'friend_requests', 'hackathons',
        'hackathon_registrations', 'conversations',
        'conversation_participants', 'messages', 'notifications', 'feedback'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I',
      r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.team_join_requests enable row level security;
alter table public.friend_requests enable row level security;
alter table public.hackathons enable row level security;
alter table public.hackathon_registrations enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.feedback enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_create_self on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy teams_read on public.teams for select to authenticated using (true);
create policy teams_update_owner on public.teams for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy teams_delete_owner on public.teams for delete to authenticated
  using (owner_id = auth.uid());

create policy team_members_read on public.team_members for select to authenticated using (true);
create policy team_members_remove on public.team_members for delete to authenticated
  using (user_id = auth.uid() or public.is_team_owner(team_id));

create policy team_invites_read on public.team_invites for select to authenticated
  using (
    invited_user_id = auth.uid()
    or invited_by = auth.uid()
    or public.is_team_owner(team_id)
  );
create policy join_requests_read on public.team_join_requests for select to authenticated
  using (user_id = auth.uid() or public.is_team_owner(team_id));
create policy join_requests_remove on public.team_join_requests for delete to authenticated
  using (user_id = auth.uid() or public.is_team_owner(team_id));

create policy friend_requests_read on public.friend_requests for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy friend_requests_remove on public.friend_requests for delete to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy hackathons_read on public.hackathons for select to authenticated using (true);
create policy hackathons_create on public.hackathons for insert to authenticated
  with check (organizer_id = auth.uid());
create policy hackathons_update_organizer on public.hackathons for update to authenticated
  using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
create policy hackathons_delete_organizer on public.hackathons for delete to authenticated
  using (organizer_id = auth.uid());

create policy registrations_read on public.hackathon_registrations for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.hackathons h
      where h.id = hackathon_id and h.organizer_id = auth.uid()
    )
  );
create policy registrations_create_self on public.hackathon_registrations for insert to authenticated
  with check (
    user_id = auth.uid()
    and (team_id is null or public.is_team_owner(team_id))
  );
create policy registrations_delete_self on public.hackathon_registrations for delete to authenticated
  using (user_id = auth.uid());

create policy conversations_read on public.conversations for select to authenticated
  using (public.can_access_conversation(id));
create policy participants_read on public.conversation_participants for select to authenticated
  using (public.can_access_conversation(conversation_id));
create policy messages_read on public.messages for select to authenticated
  using (public.can_access_conversation(conversation_id));
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy feedback_create on public.feedback for insert to authenticated
  with check (user_id = auth.uid());

-- Notification recipients may only toggle the read marker, not rewrite content.
revoke update on table public.notifications from authenticated;
grant update (is_read) on table public.notifications to authenticated;
