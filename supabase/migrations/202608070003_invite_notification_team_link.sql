-- Update send_team_invite so in-app invitation notifications link directly to the team overview route /teams/[team_id]
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

  if v_owner_id is null or v_owner_id <> v_user_id then
    raise exception 'Only the team owner can send invitations';
  end if;
  if p_invited_user_id = v_user_id or exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = p_invited_user_id
  ) then
    raise exception 'This user is already a team member';
  end if;

  select count(*) into v_member_count
  from public.team_members where team_id = p_team_id;
  if v_max_members is not null and v_member_count >= v_max_members then
    raise exception 'This team is full';
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
  values (p_invited_user_id, 'You have been invited to join ' || v_team_name, '/teams/' || p_team_id::text);

  return v_invite_id;
end;
$$;
