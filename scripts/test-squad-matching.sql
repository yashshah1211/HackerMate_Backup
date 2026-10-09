-- Entirely fictitious data; executed only by test-squad-matching-local.py's throwaway cluster.
create function public.squad_assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAIL: %',message; end if; end $$;

insert into public.profiles(id,full_name,skills,is_available,onboarding_completed,show_track_record,email,gender,college)
select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'Fixture builder '||i,
  case when i=1 or i=2 then array['React','Git','TypeScript']
       when i=3 or i=4 then array['FastAPI','Git','TypeScript']
       when i=5 then array['reactjs'] when i=6 then '{}'::text[]
       when i=7 then array['Unlisted Custom Tool']
       when i=8 then array['Python'] else array['Figma'] end,
  case when i=6 then null else true end,true,false,'PRIVATE_EMAIL',
  case when i%2=0 then 'female' else 'male' end,
  case when i%2=0 then 'Fixture College' else 'Other College' end
from generate_series(1,60) i;
update public.profiles set bio='Fixture public bio',hackathon_wins=4,show_track_record=false where id='00000000-0000-0000-0000-000000000004';
insert into public.teams(id,name,owner_id,is_recruiting,max_members,skills,roles_needed)
values ('10000000-0000-0000-0000-000000000001','Fixture squad','00000000-0000-0000-0000-000000000001',true,8,array['React','FastAPI'],array['Backend']);
-- Owner deliberately absent in this legacy roster: still counts toward capacity and skill coverage.
insert into public.team_members values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Frontend');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);

do $$ declare result jsonb; candidate jsonb; first_id text; begin
  result := public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001',20);
  perform public.squad_assert(result#>>'{context,memberCount}'='2','Owner counts even without membership');
  perform public.squad_assert(result#>>'{context,capacity}'='8','Team capacity is not hardcoded to six');
  perform public.squad_assert(result#>'{context,gapSkills}'='["fastapi"]','Requested skills are not existing roster skills');
  first_id := result#>>'{candidates,0,id}';
  perform public.squad_assert(first_id='00000000-0000-0000-0000-000000000003','Backend gap ranks ahead of identical frontend and private experience');
  perform public.squad_assert(result#>>'{candidates,0,matchedRole}'='Backend','Open role recognized with reused aliases');
  perform public.squad_assert(result#>'{candidates,0,matchedSkills}' @> '["fastapi"]','Gap evidence displayed');
  perform public.squad_assert((result#>'{candidates,0,reasons}')::text like '%recorded%','Explanation acknowledges recorded skills');
  perform public.squad_assert((result#>'{candidates,0,reasons}')::text like '%not yet recorded on the roster%','Missing records do not establish missing ability');
  perform public.squad_assert(jsonb_array_length(result->'candidates')=20,'Result limit capped');
  perform public.squad_assert(jsonb_array_length(public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001',0)->'candidates')=1,'Negative/zero clamp');
  perform public.squad_assert(result=public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001',20),'Deterministic ties');
  -- No private columns projected, even though the fixture contains them.
  perform public.squad_assert(not (result::text like '%PRIVATE_EMAIL%' or result::text like '%gender%' or result::text like '%hackathon_wins%'),'Safe projection');
  select x into candidate from jsonb_array_elements(result->'candidates') x where x->>'id'='00000000-0000-0000-0000-000000000004';
  perform public.squad_assert(not (candidate->'reasons')::text like '%experience%','Hidden track record is not used or revealed');
  update public.profiles set skills=array['React','FastAPI','TypeScript'] where id='00000000-0000-0000-0000-000000000002';
  perform public.squad_assert(public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001')#>'{context,gapSkills}'='[]','Changed roster skills remove the actual gap');
  update public.profiles set skills=array['React','Git','TypeScript'] where id='00000000-0000-0000-0000-000000000002';
end $$;

-- Gender/college neither change ranking nor leak into output.
create temporary table expected_rank as select public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001',20) as value;
update public.profiles set gender='changed',college='Other unrelated college';
select public.squad_assert(value=public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001',20),'Gender and college have no effect') from expected_rank;

-- Canonical aliases cover the same actual skill, while unknown custom tools match exactly.
update public.teams set skills=array['react.js','Unlisted Custom Tool'],roles_needed=array['Custom role'] where id='10000000-0000-0000-0000-000000000001';
do $$ declare result jsonb; begin
  result := public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001',20);
  perform public.squad_assert(result#>'{context,gapSkills}'='["unlisted custom tool"]','Alias coverage and custom skill preservation');
  perform public.squad_assert(result#>>'{candidates,0,id}'='00000000-0000-0000-0000-000000000007','Exact custom required skill is useful without taxonomy inference');
  perform public.squad_assert(result#>>'{candidates,0,matchedRole}' is null,'Unknown custom role is not guessed');
end $$;

update public.teams set skills='{}',roles_needed='{}' where id='10000000-0000-0000-0000-000000000001';
-- Unknown availability and skills do not make a profile incompatible.
do $$ declare result jsonb; sparse jsonb; begin
  result := public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001',20);
  select x into sparse from jsonb_array_elements(result->'candidates') x where x->>'id'='00000000-0000-0000-0000-000000000006';
  -- Sparse builders can be outside the top-N when plenty of positive evidence exists.
  perform public.squad_assert(matchmaking.squad_candidate_eligible('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006'),'Sparse profiles remain eligible');
  update public.profiles set is_available=false where id not in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000006');
  result := public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001',20);
  perform public.squad_assert(result#>>'{candidates,0,id}'='00000000-0000-0000-0000-000000000006','Sparse cold-start suggestion retained');
  perform public.squad_assert(result#>>'{candidates,0,limitedEvidence}'='true','Sparse evidence explicitly disclosed');
  perform public.squad_assert((result#>'{candidates,0,reasons}')::text like '%Availability not specified%','Unknown availability disclosed');
end $$;
update public.profiles set is_available=true where id<>'00000000-0000-0000-0000-000000000006';
-- A builder who also shares the roster's frontend adds backend capability. Novelty is directional.
update public.profiles set is_available=false where id not in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003');
update public.profiles set skills=array['React','FastAPI'] where id='00000000-0000-0000-0000-000000000003';
select public.squad_assert(public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001')#>>'{candidates,0,fitKind}'='complementary','Hybrid builder adds a missing domain even with shared frontend skills');
update public.profiles set skills=array['FastAPI','Git','TypeScript'] where id='00000000-0000-0000-0000-000000000003';
update public.profiles set is_available=true where id<>'00000000-0000-0000-0000-000000000006';
update public.profiles set is_available=null where id='00000000-0000-0000-0000-000000000006';
update public.teams set skills=array['FastAPI'],roles_needed=array['Full Stack Developer'] where id='10000000-0000-0000-0000-000000000001';
do $$ declare result jsonb; candidate jsonb; begin
  result := public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001',20);
  select x into candidate from jsonb_array_elements(result->'candidates') x where x->>'id'='00000000-0000-0000-0000-000000000003';
  perform public.squad_assert(candidate->>'matchedRole' is null,'Backend-only does not satisfy full stack');
end $$;

-- Independently exercise bans, blocks in both directions (including another member),
-- pending invites/requests, membership, availability and incomplete onboarding.
insert into public.blocked_users values
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003'),
 ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005'),
 ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002');
update public.profiles set is_banned=true where id='00000000-0000-0000-0000-000000000007';
update public.profiles set onboarding_completed=false where id='00000000-0000-0000-0000-000000000008';
update public.profiles set is_available=false where id='00000000-0000-0000-0000-000000000009';
insert into public.team_invites(team_id,invited_user_id,status) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','pending');
insert into public.team_join_requests values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','pending');
do $$ declare result jsonb; i integer; begin
  result := public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001',20);
  for i in 1..11 loop
    perform public.squad_assert(not exists(select 1 from jsonb_array_elements(result->'candidates') x
      where x->>'id'='00000000-0000-0000-0000-'||lpad(i::text,12,'0')),'Hard exclusion '||i);
  end loop;
end $$;

-- Capacity/recruiting and explicit event limits (including multi-event links).
insert into public.hackathons values ('20000000-0000-0000-0000-000000000001',2,3),('20000000-0000-0000-0000-000000000002',1,2);
update public.teams set hackathon_id='20000000-0000-0000-0000-000000000001' where id='10000000-0000-0000-0000-000000000001';
select public.squad_assert(public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001')#>>'{context,capacity}'='3','Explicit event maximum applies');
insert into public.team_hackathons values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002');
select public.squad_assert(public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001')#>>'{context,status}'='full','Strictest linked event maximum');
do $$ begin
  begin perform public.send_squad_invite('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012'); raise exception 'Full event invite accepted'; exception when insufficient_privilege then null; end;
end $$;
delete from public.team_hackathons;
update public.teams set hackathon_id=null,max_members=null where id='10000000-0000-0000-0000-000000000001';
select public.squad_assert(public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001')#>>'{context,status}'='needs_capacity','Unknown capacity is not invented');
update public.teams set max_members=2 where id='10000000-0000-0000-0000-000000000001';
select public.squad_assert(public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001')->'candidates'='[]','Full team receives no candidates');
update public.teams set max_members=8,is_recruiting=false where id='10000000-0000-0000-0000-000000000001';
select public.squad_assert(public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001')#>>'{context,status}'='closed','Closed recruiting');
do $$ begin
  begin perform public.send_squad_invite('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012'); raise exception 'Closed invite accepted'; exception when insufficient_privilege then null; end;
end $$;
update public.teams set is_recruiting=true where id='10000000-0000-0000-0000-000000000001';

-- Exercise callers under authenticated permissions, without private schema/table grants.
set role authenticated;
select public.squad_assert(public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001')#>>'{context,canInvite}'='true','Owner can invite');
select public.send_squad_invite('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012');
do $$ declare i integer; begin
  begin perform public.send_squad_invite('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012'); raise exception 'Duplicate accepted'; exception when insufficient_privilege then null; end;
  begin perform public.send_squad_invite('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003'); raise exception 'Blocked invite accepted'; exception when insufficient_privilege then null; end;
  for i in 1..11 loop
    begin
      perform public.send_squad_invite('10000000-0000-0000-0000-000000000001',('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid);
      raise exception 'Excluded invitation accepted %',i;
    exception when insufficient_privilege then null; end;
  end loop;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.squad_assert(public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001')#>>'{context,canInvite}'='false','Member read allowed, invitation denied');
do $$ begin
  begin perform public.send_squad_invite('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000013'); raise exception 'Member invited'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000013',false);
do $$ begin
  begin perform public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001'); raise exception 'Outsider read accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select public.squad_assert((select count(*) from public.notifications)=1,'Existing invite notification preserved');
select public.squad_assert((select count(*) from public.team_invites where invited_user_id='00000000-0000-0000-0000-000000000012' and status='pending')=1,'Existing workflow creates exactly one pending invitation');
select public.squad_assert(not has_schema_privilege('authenticated','matchmaking','usage'),'Private schema stays private');
select public.squad_assert(not has_function_privilege('anon','public.get_team_builder_recommendations(uuid,integer)','execute'),'Anon cannot recommend');
select public.squad_assert(not has_function_privilege('anon','public.send_squad_invite(uuid,uuid)','execute'),'Anon cannot invite');
select set_config('request.jwt.claim.sub','',false);
do $$ begin
  begin perform public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001'); raise exception 'Absent auth accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
update public.profiles set is_banned=true where id='00000000-0000-0000-0000-000000000001';
do $$ begin
  begin perform public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001'); raise exception 'Banned caller accepted'; exception when insufficient_privilege then null; end;
end $$;
update public.profiles set is_banned=false,onboarding_completed=false where id='00000000-0000-0000-0000-000000000001';
select public.squad_assert(public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001')#>>'{context,status}'='profile_incomplete','Incomplete caller receives onboarding state');
select 'PASS: squad ranking, evidence, exclusions, event capacity, authorization, privacy and invitation regressions';
