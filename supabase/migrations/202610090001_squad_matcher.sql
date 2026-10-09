-- Smart Squad Matcher: additive team-to-builder recommendations, not a V3 replacement.
-- Requires the deployed V2 matchmaking primitives. Apply only after release approval.
-- No backfill, table changes, RLS changes, AI dependency, or private profile projection.
begin;

do $$ begin
  if to_regprocedure('matchmaking.builder_pool(text[],uuid)') is null
    or to_regprocedure('matchmaking.skill_features(text[])') is null
    or to_regprocedure('matchmaking.novelty(double precision[],double precision[])') is null
    or to_regprocedure('public.send_team_invite(uuid,uuid)') is null then
    raise exception 'Squad Matcher requires the existing V2 engine and authorized invite workflow';
  end if;
end $$;

create function matchmaking.squad_context(p_team_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid(); t public.teams; roster uuid[]; actual text[];
  wanted text[]; missing text[]; event_capacity integer; capacity integer; state text;
begin
  if viewer is null or not exists (select 1 from public.profiles p
    where p.id=viewer and not coalesce(p.is_banned,false)) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select * into t from public.teams where id=p_team_id;
  if not found or not (t.owner_id=viewer or exists (select 1 from public.team_members m
    where m.team_id=p_team_id and m.user_id=viewer)) then
    raise exception 'Team membership required' using errcode='42501';
  end if;
  roster := array(select m.user_id from public.team_members m where m.team_id=p_team_id
                  union select t.owner_id);
  -- Recorded event limits only. Multiple linked events use the strictest supplied maximum.
  select min(h.max_team_size) into event_capacity from public.hackathons h
  where h.max_team_size>0 and (h.id=t.hackathon_id or exists (select 1
    from public.team_hackathons th where th.team_id=p_team_id and th.hackathon_id=h.id));
  capacity := least(case when t.max_members>0 then t.max_members end,event_capacity);
  -- Actual member skills must NOT include the skills the team is still asking for.
  actual := array(select distinct coalesce(a.skill_key,matchmaking.norm(s.raw))
    from public.profiles p cross join lateral unnest(p.skills) s(raw)
    left join matchmaking.skill_alias a on a.alias=matchmaking.norm(s.raw)
    where p.id=any(roster) and matchmaking.norm(s.raw)<>'' order by 1);
  wanted := array(select distinct coalesce(a.skill_key,matchmaking.norm(s.raw))
    from unnest(t.skills) s(raw) left join matchmaking.skill_alias a on a.alias=matchmaking.norm(s.raw)
    where matchmaking.norm(s.raw)<>'' order by 1);
  missing := array(select x from unnest(wanted) x where not x=any(actual) order by x);
  state := case
    when not exists(select 1 from public.profiles p where p.id=viewer and p.onboarding_completed is true)
      then 'profile_incomplete'
    when t.is_recruiting is not true then 'closed'
    when capacity is null then 'needs_capacity'
    when cardinality(roster)>=capacity then 'full'
    else 'ready' end;
  return jsonb_build_object('teamId',t.id,'teamName',t.name,'status',state,
    'canInvite',t.owner_id=viewer and state='ready','memberCount',cardinality(roster),
    'capacity',capacity,'teamCapacity',t.max_members,'eventCapacity',event_capacity,
    'rolesNeeded',coalesce(t.roles_needed,'{}'::text[]),'requiredSkills',wanted,
    'coveredSkills',actual,'gapSkills',missing);
end;
$$;

create function matchmaking.squad_candidate_eligible(p_team_id uuid,p_candidate uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists(select 1 from public.profiles p join public.teams t on t.id=p_team_id
    where p.id=p_candidate and p.onboarding_completed is true
      and not coalesce(p.is_banned,false) and p.is_available is distinct from false
      and p.id<>t.owner_id
      and not exists(select 1 from public.team_members m where m.team_id=t.id and m.user_id=p.id)
      and not exists(select 1 from public.team_invites i
        where i.team_id=t.id and i.invited_user_id=p.id and i.status='pending')
      and not exists(select 1 from public.team_join_requests j
        where j.team_id=t.id and j.user_id=p.id and j.status='pending')
      and not exists(select 1 from public.blocked_users b where
        (b.blocked_id=p.id and (b.blocker_id=t.owner_id or exists(select 1
          from public.team_members m where m.team_id=t.id and m.user_id=b.blocker_id)))
        or (b.blocker_id=p.id and (b.blocked_id=t.owner_id or exists(select 1
          from public.team_members m where m.team_id=t.id and m.user_id=b.blocked_id)))));
$$;

create function public.get_team_builder_recommendations(p_team_id uuid,p_limit integer default 8)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ctx jsonb; actual text[]; wanted text[]; missing text[]; roster_domains float8[];
  pivot uuid; result jsonb; lim integer := least(greatest(coalesce(p_limit,8),1),20);
begin
  ctx := matchmaking.squad_context(p_team_id);
  if ctx->>'status'<>'ready' then
    return jsonb_build_object('context',ctx,'candidates','[]'::jsonb,'scoreVersion','squad-v1');
  end if;
  actual := array(select jsonb_array_elements_text(ctx->'coveredSkills'));
  wanted := array(select jsonb_array_elements_text(ctx->'requiredSkills'));
  missing := array(select jsonb_array_elements_text(ctx->'gapSkills'));
  select f.domains into roster_domains from matchmaking.skill_features(actual) f;
  pivot := md5(p_team_id::text||':'||(now() at time zone 'UTC')::date::text||':squad:v1')::uuid;
  with pool as materialized (
    -- Reuse indexed, rotating V2 retrieval; <=96 per bucket, not the first 100 profiles.
    select q.id from matchmaking.builder_pool(
      array['all','available','d:1','d:2','d:3','d:4','d:5','d:6','d:7'],pivot) q
  ), candidates as materialized (
    select p.id,p.full_name,p.avatar_url,p.bio,p.skills,p.is_available,
      f.domains,f.skills as canonical_skills,
      array(select distinct coalesce(a.skill_key,matchmaking.norm(s.raw))
        from unnest(p.skills) s(raw) left join matchmaking.skill_alias a on a.alias=matchmaking.norm(s.raw)
        where matchmaking.norm(s.raw)<>'' order by 1) as recorded_skills,
      case when p.show_track_record is true then
        matchmaking.experience(p.hackathon_participations,p.hackathon_wins,p.has_won_hackathon) end as experience
    from pool q join public.profiles p on p.id=q.id
    cross join lateral matchmaking.skill_features(p.skills) f
    where matchmaking.squad_candidate_eligible(p_team_id,p.id)
  ), facts as materialized (
    select c.*,role.label as matched_role,coalesce(role.readiness,0) as role_fit,
      array(select s from unnest(c.recorded_skills) s where s=any(missing) order by s) as gap_matches,
      array(select s from unnest(c.recorded_skills) s where s=any(wanted) order by s) as wanted_matches,
      array(select s from unnest(c.recorded_skills) s where not s=any(actual) order by s) as additions,
      coalesce(matchmaking.novelty(c.domains,roster_domains),0) as complement
    from candidates c left join lateral (
      select r.raw as label,(select min(c.domains[d]) from unnest(def.required_domains) d) as readiness
      from jsonb_array_elements_text(ctx->'rolesNeeded') r(raw)
      join matchmaking.role_alias a on a.alias=matchmaking.norm(r.raw)
      join matchmaking.role_definition def on def.key=a.role_key
      order by readiness desc,r.raw limit 1
    ) role on role.readiness>0
  ), ranked as materialized (
    select f.*,
      40*role_fit + 25*cardinality(gap_matches)::float8/greatest(cardinality(missing),1)
      +10*cardinality(wanted_matches)::float8/greatest(cardinality(wanted),1)
      +15*complement + case when is_available is true then 5 else 0 end
      +5*coalesce(experience,0) as rank_score,
      case when role_fit>0 then 'role_match' when cardinality(gap_matches)>0 then 'skill_gap'
        when complement>0 then 'complementary' else 'explore' end as fit_kind
    from facts f
    order by rank_score desc,id limit lim
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'fullName',r.full_name,'avatarUrl',r.avatar_url,'bio',r.bio,
    'skills',coalesce(r.skills,'{}'::text[]),'isAvailable',r.is_available,
    'matchedRole',r.matched_role,'matchedSkills',r.wanted_matches,'addedSkills',r.additions,
    'fitKind',r.fit_kind,'limitedEvidence',cardinality(r.canonical_skills)=0 and cardinality(r.wanted_matches)=0,
    'reasons',array_remove(array[
      case when r.role_fit>0 then 'Lists skills relevant to your open '||r.matched_role||' role' end,
      case when cardinality(r.gap_matches)>0 then 'Lists requested skills not yet recorded on the roster: '
        ||array_to_string(r.gap_matches[1:3],', ') end,
      case when r.complement>0 and cardinality(r.additions)>0 then 'Adds '
        ||array_to_string(r.additions[1:3],', ')||' to your team''s recorded skills' end,
      case when r.is_available is true then 'Open to joining a team' end,
      case when r.experience>0 then 'Reports previous hackathon experience' end,
      case when r.is_available is null then 'Availability not specified; confirm before inviting' end,
      case when r.fit_kind='explore' then 'Limited role-fit evidence; explore their profile' end
    ],null)
  ) order by r.rank_score desc,r.id),'[]'::jsonb) into result from ranked r;
  return jsonb_build_object('context',ctx,'candidates',result,'scoreVersion','squad-v1');
end;
$$;

-- Recheck changing eligibility before using the existing owner-authorized invite workflow.
create function public.send_squad_invite(p_team_id uuid,p_invited_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ctx jsonb;
begin
  ctx := matchmaking.squad_context(p_team_id);
  if not (ctx->>'canInvite')::boolean then
    raise exception 'Only the owner of an open team with space can invite' using errcode='42501';
  end if;
  perform 1 from public.teams t where t.id=p_team_id for update;
  ctx := matchmaking.squad_context(p_team_id);
  if not (ctx->>'canInvite')::boolean or not matchmaking.squad_candidate_eligible(p_team_id,p_invited_user_id) then
    raise exception 'This invitation is no longer available; refresh the suggestions' using errcode='42501';
  end if;
  return public.send_team_invite(p_team_id,p_invited_user_id);
end;
$$;

revoke all on function matchmaking.squad_context(uuid) from public,anon,authenticated;
revoke all on function matchmaking.squad_candidate_eligible(uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_team_builder_recommendations(uuid,integer) from public,anon;
revoke all on function public.send_squad_invite(uuid,uuid) from public,anon;
grant execute on function public.get_team_builder_recommendations(uuid,integer) to authenticated;
grant execute on function public.send_squad_invite(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
