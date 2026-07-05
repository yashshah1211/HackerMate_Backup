create or replace function public.join_team_instantly(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select name into v_team_name
  from public.teams
  where id = p_team_id;

  if v_team_name is null then
    raise exception 'Team not found';
  end if;

  -- Add user to team
  perform public.add_user_to_team(p_team_id, v_user_id, 'member');

  -- Delete any pending requests
  delete from public.team_join_requests
  where team_id = p_team_id and user_id = v_user_id;

  -- Notify user
  insert into public.notifications (user_id, message, link)
  values (v_user_id, 'You joined ' || v_team_name || ' via invite link', '/teams/' || p_team_id::text);
end;
$$;

revoke all on function public.join_team_instantly(uuid) from public;
grant execute on function public.join_team_instantly(uuid) to authenticated;
