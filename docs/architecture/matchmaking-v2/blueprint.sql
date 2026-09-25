-- REVIEW DRAFT: not a production migration. See DESIGN.md before adoption.
-- PostgreSQL 15+ / Supabase. Assumes the existing HackerMate public tables.
-- No base-table RLS or column GRANT changes. New private tables are inaccessible
-- to API roles. Run as the trusted migration owner, in a maintenance transaction.
-- This replaces the old two-argument RPC; coordinate the frontend deployment.
begin;

create schema matchmaking;
revoke all on schema matchmaking from public, anon, authenticated;

create function matchmaking.norm(v text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(btrim(regexp_replace(coalesce(v, ''), '\s+', ' ', 'g')));
$$;

-- Domain order is permanent: frontend, backend, ml, mobile, devops, design, product.
-- Weights indicate specificity of evidence, NOT verified proficiency.
create table matchmaking.skill (
  key text primary key,
  domain_weights double precision[] not null check (
    cardinality(domain_weights)=7 and array_lower(domain_weights,1)=1
    and array_position(domain_weights,null) is null
    and 0<=all(domain_weights) and 1>=all(domain_weights)
  ),
  foundation boolean not null default false,
  foundation_slot smallint unique check (foundation_slot between 0 and 15)
);
create table matchmaking.skill_alias (
  alias text primary key,
  skill_key text not null references matchmaking.skill(key)
);
insert into matchmaking.skill(key, domain_weights, foundation) values
 ('react',          '{1,0,0,0,0,0,0}', false),
 ('next.js',        '{1,0.5,0,0,0,0,0}', false),
 ('vue',            '{1,0,0,0,0,0,0}', false),
 ('angular',        '{1,0,0,0,0,0,0}', false),
 ('svelte',         '{1,0,0,0,0,0,0}', false),
 ('html',           '{0.6,0,0,0,0,0,0}', false),
 ('css',            '{0.6,0,0,0,0,0,0}', false),
 ('tailwind',       '{0.7,0,0,0,0,0,0}', false),
 ('node.js',        '{0,0.8,0,0,0,0,0}', false),
 ('express',        '{0,1,0,0,0,0,0}', false),
 ('fastapi',        '{0,1,0,0,0,0,0}', false),
 ('django',         '{0,1,0,0,0,0,0}', false),
 ('flask',          '{0,1,0,0,0,0,0}', false),
 ('spring boot',    '{0,1,0,0,0,0,0}', false),
 ('postgresql',     '{0,0.7,0,0,0,0,0}', false),
 ('mongodb',        '{0,0.7,0,0,0,0,0}', false),
 ('redis',          '{0,0.7,0,0,0,0,0}', false),
 ('supabase',       '{0,0.6,0,0,0,0,0}', false),
 ('firebase',       '{0,0.6,0,0.3,0,0,0}', false),
 ('pytorch',        '{0,0,1,0,0,0,0}', false),
 ('tensorflow',     '{0,0,1,0,0,0,0}', false),
 ('scikit-learn',   '{0,0,1,0,0,0,0}', false),
 ('machine learning','{0,0,1,0,0,0,0}', false),
 ('deep learning',  '{0,0,1,0,0,0,0}', false),
 ('nlp',            '{0,0,0.8,0,0,0,0}', false),
 ('computer vision','{0,0,0.8,0,0,0,0}', false),
 ('pandas',         '{0,0,0.4,0,0,0,0}', false),
 ('numpy',          '{0,0,0.3,0,0,0,0}', false),
 ('react native',   '{0.3,0,0,1,0,0,0}', false),
 ('flutter',        '{0,0,0,1,0,0,0}', false),
 ('android',        '{0,0,0,1,0,0,0}', false),
 ('ios',            '{0,0,0,1,0,0,0}', false),
 ('swift',          '{0,0,0,0.7,0,0,0}', false),
 ('kotlin',         '{0,0.3,0,0.7,0,0,0}', false),
 ('docker',         '{0,0,0,0,0.7,0,0}', false),
 ('kubernetes',     '{0,0,0,0,1,0,0}', false),
 ('terraform',      '{0,0,0,0,1,0,0}', false),
 ('aws',            '{0,0,0,0,0.7,0,0}', false),
 ('gcp',            '{0,0,0,0,0.7,0,0}', false),
 ('azure',          '{0,0,0,0,0.7,0,0}', false),
 ('ci/cd',          '{0,0,0,0,0.8,0,0}', false),
 ('figma',          '{0,0,0,0,0,0.7,0}', false),
 ('ui design',      '{0,0,0,0,0,1,0}', false),
 ('ux research',    '{0,0,0,0,0,1,0}', false),
 ('ui/ux',          '{0,0,0,0,0,1,0}', false),
 ('prototyping',    '{0,0,0,0,0,0.8,0}', false),
 ('product management','{0,0,0,0,0,0,1}', false),
 ('pitching',       '{0,0,0,0,0,0,1}', false),
 ('public speaking','{0,0,0,0,0,0,0.7}', false),
 ('market research','{0,0,0,0,0,0,0.8}', false),
 ('git',            '{0,0,0,0,0,0,0}', true),
 ('javascript',     '{0,0,0,0,0,0,0}', true),
 ('typescript',     '{0,0,0,0,0,0,0}', true),
 ('python',         '{0,0,0,0,0,0,0}', true),
 ('sql',            '{0,0,0,0,0,0,0}', true),
 ('http',           '{0,0,0,0,0,0,0}', true),
 ('rest api',       '{0,0,0,0,0,0,0}', true),
 ('java',           '{0,0,0,0,0,0,0}', true),
 ('go',             '{0,0,0,0,0,0,0}', true),
 ('c',              '{0,0,0,0,0,0,0}', true),
 ('c++',            '{0,0,0,0,0,0,0}', true),
 ('c#',             '{0,0,0,0,0,0,0}', true);

-- Permanent foundation bit positions; append new keys, never reorder old slots.
update matchmaking.skill s set foundation_slot=(f.ordinality-1)::smallint
from unnest(array['git','javascript','typescript','python','sql','http','rest api',
                  'java','go','c','c++','c#']) with ordinality f(key,ordinality)
where s.key=f.key;
alter table matchmaking.skill add constraint foundation_has_slot
check (foundation=(foundation_slot is not null));

insert into matchmaking.skill_alias(alias, skill_key)
select s.key, s.key from matchmaking.skill s;
insert into matchmaking.skill_alias(alias, skill_key) values
 ('reactjs','react'), ('react.js','react'), ('nextjs','next.js'),
 ('vue.js','vue'), ('vuejs','vue'), ('tailwindcss','tailwind'),
 ('tailwind css','tailwind'), ('node','node.js'), ('nodejs','node.js'),
 ('express.js','express'), ('expressjs','express'), ('postgres','postgresql'),
 ('mongo','mongodb'), ('sklearn','scikit-learn'), ('scikit learn','scikit-learn'),
 ('ml','machine learning'), ('natural language processing','nlp'),
 ('react-native','react native'), ('google cloud','gcp'),
 ('amazon web services','aws'), ('github actions','ci/cd'),
 ('ui ux','ui/ux'), ('user research','ux research'),
 ('product manager','product management'), ('pitch','pitching'),
 ('js','javascript'), ('ts','typescript'), ('golang','go'),
 ('rest apis','rest api'), ('git/github','git');

create table matchmaking.role_definition (
  key text primary key,
  label text not null,
  required_domains smallint[] not null check (
    cardinality(required_domains)>0 and array_position(required_domains,null) is null
    and 1<=all(required_domains) and 7>=all(required_domains)
  )
);
insert into matchmaking.role_definition values
 ('frontend','Frontend Developer','{1}'), ('backend','Backend Developer','{2}'),
 ('ml','AI/ML Engineer','{3}'), ('mobile','Mobile Developer','{4}'),
 ('devops','Cloud/DevOps Engineer','{5}'), ('design','UI/UX Designer','{6}'),
 ('product','Product/Pitch','{7}'), ('fullstack','Full Stack Developer','{1,2}');
create table matchmaking.role_alias (
  alias text primary key,
  role_key text not null references matchmaking.role_definition(key)
);
insert into matchmaking.role_alias
select matchmaking.norm(r.label), r.key from matchmaking.role_definition r;
insert into matchmaking.role_alias values
 ('frontend','frontend'), ('backend','backend'), ('ai/ml','ml'),
 ('ai/ml engineer','ml'), ('ai lead','ml'), ('machine learning engineer','ml'),
 ('mobile','mobile'), ('devops','devops'), ('devops engineer','devops'),
 ('ui/ux','design'), ('designer','design'), ('pitch/product','product'),
 ('project manager','product'), ('product manager','product'),
 ('fullstack developer','fullstack'), ('full-stack developer','fullstack')
on conflict (alias) do nothing;

create table matchmaking.college_alias (
  alias text primary key,
  college_key text not null
);
insert into matchmaking.college_alias values
 ('djsce','djsce-mumbai'),
 ('dwarkadas j. sanghvi college of engineering','djsce-mumbai'),
 ('dwarkadas j sanghvi college of engineering','djsce-mumbai'),
 ('vjti','vjti-mumbai'), ('veermata jijabai technological institute','vjti-mumbai'),
 ('spit','spit-mumbai'), ('sardar patel institute of technology','spit-mumbai'),
 ('coep','coep-pune'), ('coep technological university','coep-pune'),
 ('college of engineering pune','coep-pune');
-- VIT/MIT are deliberately unresolved: neither uniquely identifies a campus.

create function matchmaking.college_key(v text) returns text
language sql stable set search_path = '' as $$
  select a.college_key from matchmaking.college_alias a
  where a.alias = matchmaking.norm(v);
$$;

create function matchmaking.skill_features(v text[])
returns table (skills text[], foundations text[], domains double precision[], foundation_mask bit(16))
language sql stable set search_path = '' as $$
  with mapped as materialized (
    select distinct a.skill_key
    from unnest(coalesce(v, '{}'::text[])) x(raw)
    join matchmaking.skill_alias a on a.alias = matchmaking.norm(x.raw)
  ), defs as materialized (
    select s.key, s.domain_weights, s.foundation, s.foundation_slot
    from mapped m join matchmaking.skill s on s.key = m.skill_key
  )
  select
    array(select d.key from defs d order by d.key),
    array(select d.key from defs d where d.foundation order by d.key),
    array(select coalesce((select max(d.domain_weights[i]) from defs d), 0)
          from generate_series(1,7) i order by i),
    coalesce((select sum(1::integer << d.foundation_slot) from defs d where d.foundation),0)::bit(16);
$$;

create function matchmaking.experience(participations integer, wins integer, won boolean)
returns double precision language sql immutable set search_path = '' as $$
  -- Existing zero defaults cannot distinguish unfilled from confirmed zero.
  -- Without positive evidence, keep experience unknown in v1.
  select case when greatest(coalesce(participations,0),coalesce(wins,0),
                            case when won then 1 else 0 end) > 0 then
    0.8 * ln(1.0 + least(greatest(coalesce(participations,0),
                               coalesce(wins,0),case when won then 1 else 0 end),10)) / ln(11.0)
    + 0.2 * ln(1.0 + least(greatest(coalesce(wins,0),case when won then 1 else 0 end),3)) / ln(4.0)
  else null end;
$$;

create table matchmaking.builder_feature (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  skills text[] not null, foundations text[] not null,
  domains double precision[] not null check (cardinality(domains)=7),
  college_key text, available boolean, experience double precision,
  eligible boolean not null, ticket uuid not null,
  version integer not null default 1, refreshed_at timestamptz not null default now(),
  foundation_mask bit(16) not null
);
create table matchmaking.team_feature (
  team_id uuid primary key references public.teams(id) on delete cascade,
  skills text[] not null, foundations text[] not null,
  domains double precision[] not null check (cardinality(domains)=7),
  role_keys text[] not null, role_counts integer[] not null,
  college_key text, ticket uuid not null,
  version integer not null default 1, refreshed_at timestamptz not null default now(),
  foundation_mask bit(16) not null
);
create table matchmaking.builder_feed (
  bucket text not null, ticket uuid not null,
  user_id uuid not null references matchmaking.builder_feature(user_id) on delete cascade,
  primary key (bucket, ticket, user_id)
);
create index builder_feed_user on matchmaking.builder_feed(user_id);
create table matchmaking.team_feed (
  bucket text not null, ticket uuid not null,
  team_id uuid not null references matchmaking.team_feature(team_id) on delete cascade,
  primary key (bucket, ticket, team_id)
);
create index team_feed_team on matchmaking.team_feed(team_id);

create function matchmaking.refresh_builder(v_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f matchmaking.builder_feature;
begin
  insert into matchmaking.builder_feature
    (user_id,skills,foundations,domains,college_key,available,experience,eligible,ticket,foundation_mask)
  select p.id,s.skills,s.foundations,s.domains,matchmaking.college_key(p.college),
         p.is_available,matchmaking.experience(p.hackathon_participations,p.hackathon_wins,p.has_won_hackathon),
         p.onboarding_completed is true and not coalesce(p.is_banned,false),md5(p.id::text)::uuid,s.foundation_mask
  from public.profiles p cross join lateral matchmaking.skill_features(p.skills) s
  where p.id=v_id
  on conflict (user_id) do update set
    skills=excluded.skills, foundations=excluded.foundations, domains=excluded.domains,
    college_key=excluded.college_key, available=excluded.available,
    experience=excluded.experience,eligible=excluded.eligible,version=1,refreshed_at=now(),
    foundation_mask=excluded.foundation_mask;
  if not found then return; end if;
  select b.user_id,b.skills,b.foundations,b.domains,b.college_key,b.available,
         b.experience,b.eligible,b.ticket,b.version,b.refreshed_at,b.foundation_mask into f
  from matchmaking.builder_feature b where b.user_id=v_id;
  delete from matchmaking.builder_feed b where b.user_id=v_id;
  if f.eligible then
    insert into matchmaking.builder_feed(bucket,ticket,user_id)
    select distinct k.bucket,f.ticket,v_id from (
      select 'all'::text as bucket
      union all select 'd:'||i from generate_series(1,7) i where f.domains[i]>=0.6
      union all select 'available' where f.available is true
      union all select 'college:'||f.college_key where f.college_key is not null
    ) k;
  end if;
end;
$$;

create function matchmaking.refresh_team(v_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t record; s record; roles text[]; counts integer[]; ticket_value uuid;
begin
  -- Serialize feature rebuilds for this team. The subsequent reads use the
  -- current READ COMMITTED snapshot after a concurrent writer releases its lock.
  select x.id,x.skills,x.roles_needed,x.college,x.is_recruiting,x.owner_id into t
  from public.teams x where x.id=v_id for no key update;
  if not found then return; end if;
  select sf.skills,sf.foundations,sf.domains,sf.foundation_mask into s
  from matchmaking.skill_features(array(
    select distinct raw.skill from (
      select unnest(coalesce(t.skills,'{}'::text[])) as skill
      union all
      select unnest(coalesce(p.skills,'{}'::text[]))
      from public.profiles p where p.id in (
        select tm.user_id from public.team_members tm where tm.team_id=v_id
        union select t.owner_id
      )
    ) raw
  )) sf;
  roles := array(select distinct a.role_key
    from unnest(coalesce(t.roles_needed,'{}'::text[])) x(raw)
    join matchmaking.role_alias a on a.alias=matchmaking.norm(x.raw) order by a.role_key);
  counts := array(select (
    select count(distinct tm.user_id)::integer
    from public.team_members tm
    join matchmaking.role_alias a on a.alias=matchmaking.norm(tm.project_role)
    join matchmaking.role_definition r on r.key=a.role_key
    where tm.team_id=v_id and i=any(r.required_domains)
  ) from generate_series(1,7) i order by i);
  ticket_value := md5(v_id::text)::uuid;
  insert into matchmaking.team_feature
    (team_id,skills,foundations,domains,role_keys,role_counts,college_key,ticket,foundation_mask)
  values(v_id,s.skills,s.foundations,s.domains,roles,counts,
         matchmaking.college_key(t.college),ticket_value,s.foundation_mask)
  on conflict(team_id) do update set skills=excluded.skills,foundations=excluded.foundations,
    domains=excluded.domains,role_keys=excluded.role_keys,role_counts=excluded.role_counts,
    college_key=excluded.college_key,version=1,refreshed_at=now(),foundation_mask=excluded.foundation_mask;
  delete from matchmaking.team_feed f where f.team_id=v_id;
  if t.is_recruiting is true then
    insert into matchmaking.team_feed(bucket,ticket,team_id)
    select distinct b.bucket,ticket_value,v_id from (
      select 'all'::text as bucket
      union all select 'd:'||d.domain
      from matchmaking.role_definition r cross join lateral unnest(r.required_domains) d(domain)
      where r.key=any(roles)
      union all select 'college:'||matchmaking.college_key(t.college)
      where matchmaking.college_key(t.college) is not null
    ) b;
  end if;
end;
$$;

create function matchmaking.profile_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_team uuid;
begin
  perform matchmaking.refresh_builder(new.id);
  for v_team in select related.id from (
    select tm.team_id as id from public.team_members tm where tm.user_id=new.id
    union select t.id from public.teams t where t.owner_id=new.id
  ) related order by related.id loop
    perform matchmaking.refresh_team(v_team);
  end loop;
  return new;
end;
$$;
create trigger matchmaking_profile_changed after insert or update of
  skills,college,is_available,hackathon_participations,hackathon_wins,
  has_won_hackathon,onboarding_completed,is_banned
on public.profiles for each row execute function matchmaking.profile_changed();

create function matchmaking.team_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform matchmaking.refresh_team(new.id); return new; end;
$$;
create trigger matchmaking_team_changed after insert or update of
  skills,roles_needed,college,is_recruiting,owner_id
on public.teams for each row execute function matchmaking.team_changed();

create function matchmaking.member_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ids uuid[] := '{}'; v_team uuid;
begin
  if tg_op <> 'INSERT' then ids:=array_append(ids,old.team_id); end if;
  if tg_op <> 'DELETE' then ids:=array_append(ids,new.team_id); end if;
  for v_team in select distinct x.id from unnest(ids) x(id) order by x.id loop
    perform matchmaking.refresh_team(v_team);
  end loop;
  return null;
end;
$$;
create trigger matchmaking_member_changed after insert or delete or update of team_id,user_id,project_role
on public.team_members for each row execute function matchmaking.member_changed();

-- Existing base-table permissions are untouched. Check deployed equivalent
-- indexes before adopting these names to avoid redundant storage.
create index if not exists mm_blocks_reverse on public.blocked_users(blocked_id,blocker_id);
-- Existing UNIQUE(blocker_id,blocked_id) serves the forward direction.
create index if not exists idx_team_members_team_user on public.team_members(team_id,user_id);
create index if not exists idx_team_members_user_team on public.team_members(user_id,team_id);
create index if not exists mm_requests_pending on public.team_join_requests(user_id,team_id) where status='pending';
create index if not exists mm_invites_pending on public.team_invites(invited_user_id,team_id) where status='pending';

create function matchmaking.baseline(a text[], b text[]) returns double precision
language sql immutable parallel safe set search_path = '' as $$
  select case when cardinality(a)=0 or cardinality(b)=0 then null else
    least(1.0,(select count(*) from (select unnest(a) intersect select unnest(b)) q)/2.0)
  end;
$$;
create function matchmaking.baseline_bits(a bit(16), b bit(16)) returns double precision
language sql immutable parallel safe as $$
  select case when a=B'0000000000000000' or b=B'0000000000000000' then null
    else least(1.0,pg_catalog.bit_count(a & b)/2.0)::double precision end;
$$;
create function matchmaking.novelty(a double precision[], b double precision[])
returns double precision language sql immutable parallel safe as $$
  -- Pure invoker expression, deliberately inlineable (no SET or table reads).
  -- Called only inside the locked-down RPC search path. Seven fixed domains.
  select case when a[1]+a[2]+a[3]+a[4]+a[5]+a[6]+a[7]>0
               and b[1]+b[2]+b[3]+b[4]+b[5]+b[6]+b[7]>0 then
    (greatest(a[1]-b[1],0)+greatest(a[2]-b[2],0)+greatest(a[3]-b[3],0)
     +greatest(a[4]-b[4],0)+greatest(a[5]-b[5],0)+greatest(a[6]-b[6],0)
     +greatest(a[7]-b[7],0))/(a[1]+a[2]+a[3]+a[4]+a[5]+a[6]+a[7])
  else null end;
$$;
create function matchmaking.context_value(available boolean, same_college boolean, prefer boolean)
returns double precision language sql immutable parallel safe as $$
  select case when prefer then
    0.75*(case when available then 1.0 when available is false then 0.0 else 0.5 end)
    +0.25*(case when same_college then 1.0 else 0.5 end)
  else case when available then 1.0 when available is false then 0.0 else 0.5 end end;
$$;
create function matchmaking.context_evidence(available boolean, same_college boolean, prefer boolean)
returns double precision language sql immutable parallel safe as $$
  select case when prefer then
    0.75*(available is not null)::integer + 0.25*(same_college is not null)::integer
  else (available is not null)::integer end;
$$;

-- Indexed ring sampling. Both index ranges are bounded; no ORDER BY random().
-- Pool retrieval is approximate; hard eligibility is checked BEFORE scoring.
create function matchmaking.builder_pool(buckets text[], pivot uuid)
returns table(id uuid) language sql stable set search_path = '' as $$
  select distinct picked.user_id
  from (select distinct unnest(buckets) as bucket) b
  cross join lateral (
    select ring.user_id from (
      (select f.user_id,f.ticket,0 as phase from matchmaking.builder_feed f
       where f.bucket=b.bucket and f.ticket>=pivot order by f.ticket,f.user_id limit 96)
      union all
      (select f.user_id,f.ticket,1 as phase from matchmaking.builder_feed f
       where f.bucket=b.bucket and f.ticket<pivot order by f.ticket,f.user_id limit 96)
    ) ring order by ring.phase,ring.ticket,ring.user_id limit 96
  ) picked;
$$;
create function matchmaking.team_pool(buckets text[], pivot uuid)
returns table(id uuid) language sql stable set search_path = '' as $$
  select distinct picked.team_id
  from (select distinct unnest(buckets) as bucket) b
  cross join lateral (
    select ring.team_id from (
      (select f.team_id,f.ticket,0 as phase from matchmaking.team_feed f
       where f.bucket=b.bucket and f.ticket>=pivot order by f.ticket,f.team_id limit 96)
      union all
      (select f.team_id,f.ticket,1 as phase from matchmaking.team_feed f
       where f.bucket=b.bucket and f.ticket<pivot order by f.ticket,f.team_id limit 96)
    ) ring order by ring.phase,ring.ticket,ring.team_id limit 96
  ) picked;
$$;

create function matchmaking.assert_viewer(p_user_id uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id
                and p.onboarding_completed is true and not coalesce(p.is_banned,false)) then
    raise exception 'Account is not eligible for recommendations' using errcode='42501';
  end if;
  if not exists(select 1 from matchmaking.builder_feature b where b.user_id=p_user_id and b.version=1) then
    raise exception 'Matchmaking features unavailable' using errcode='55000';
  end if;
end;
$$;

-- A changed RETURNS TABLE cannot be deployed via CREATE OR REPLACE.
-- No CASCADE: unexpected SQL dependents must stop deployment for inspection.
drop function if exists public.get_recommended_teammates(uuid,integer);
create function public.get_recommended_teammates(
  p_user_id uuid, p_limit integer default 10, p_prefer_same_college boolean default false
)
returns table (
  id uuid,full_name text,avatar_url text,college text,bio text,skills text[],
  github_url text,linkedin_url text,year_of_study text,is_available boolean,
  compatibility integer,shared_skills text[],same_college boolean,
  confidence double precision,components jsonb,reasons text[],score_version text
)
language plpgsql stable security definer set search_path = '' as $$
declare me matchmaking.builder_feature; blocked uuid[]; buckets text[]; pivot uuid;
        lim integer := least(greatest(coalesce(p_limit,10),1),50);
        prefer boolean := coalesce(p_prefer_same_college,false);
begin
  perform matchmaking.assert_viewer(p_user_id);
  select b.user_id,b.skills,b.foundations,b.domains,b.college_key,b.available,b.experience,
         b.eligible,b.ticket,b.version,b.refreshed_at,b.foundation_mask into strict me
  from matchmaking.builder_feature b where b.user_id=p_user_id;
  blocked:=array(select b.blocked_id from public.blocked_users b where b.blocker_id=p_user_id
                 union select b.blocker_id from public.blocked_users b where b.blocked_id=p_user_id);
  -- All domain buckets retain same-domain specialists; complementarity is ranking,
  -- not an eligibility constraint. Daily viewer-specific rotation spreads exposure.
  buckets:=array['all','available','d:1','d:2','d:3','d:4','d:5','d:6','d:7'];
  if prefer and me.college_key is not null then buckets:=array_append(buckets,'college:'||me.college_key); end if;
  pivot:=md5(p_user_id::text||':'||(now() at time zone 'UTC')::date::text||':builders:v1')::uuid;
  return query
  with pool as materialized (select q.id from matchmaking.builder_pool(buckets,pivot) q),
  eligible as materialized (
    select p.id,f.skills as canonical_skills,f.foundation_mask,f.domains,f.experience,
           p.is_available,
           case when me.college_key is null or f.college_key is null then null
                else me.college_key=f.college_key end as same
    from pool q join public.profiles p on p.id=q.id
    join matchmaking.builder_feature f on f.user_id=p.id and f.version=1
    where p.id<>p_user_id and p.onboarding_completed is true and not coalesce(p.is_banned,false)
      and not (p.id=any(blocked))
  ), raw as materialized (
    select e.id,e.canonical_skills,e.same,
      (matchmaking.novelty(me.domains,e.domains)+matchmaking.novelty(e.domains,me.domains))/2.0 as comp,
      matchmaking.baseline_bits(me.foundation_mask,e.foundation_mask) as base,
      case when me.experience is null or e.experience is null then null else
        0.5*(1-abs(me.experience-e.experience))+0.5*least(1.0,(me.experience+e.experience)/0.8) end as exp,
      matchmaking.context_value(e.is_available,e.same,prefer) as ctx,
      matchmaking.context_evidence(e.is_available,e.same,prefer) as ctx_evidence
    from eligible e
  ), ranked as materialized (
    select r.id,r.canonical_skills,r.same,r.comp,r.base,r.exp,r.ctx,
      0.55*coalesce(r.comp,0.5)+0.20*coalesce(r.base,0.5)+0.15*coalesce(r.exp,0.5)+0.10*r.ctx as fit,
      0.55*(r.comp is not null)::integer+0.20*(r.base is not null)::integer
        +0.15*(r.exp is not null)::integer+0.10*r.ctx_evidence as evidence
    from raw r
    order by fit desc,evidence desc,r.id limit lim
  )
  select p.id,p.full_name,p.avatar_url,p.college,p.bio,p.skills,p.github_url,p.linkedin_url,
    p.year_of_study,p.is_available,round((r.fit*100)::numeric)::integer,
    array(select unnest(me.skills) intersect select unnest(r.canonical_skills) order by 1),
    coalesce(r.same,false),r.evidence,
    jsonb_build_object('complementarity',r.comp,'foundation',r.base,'experience',r.exp,'context',r.ctx),
    array_remove(array[
      case when r.comp>=0.7 then 'Adds complementary domain evidence' end,
      case when r.base>=0.5 then 'Shares collaboration foundations' end,
      case when r.same then 'Same verified college mapping' end,
      case when p.is_available then 'Available for a team' end,
      case when r.comp is null then 'Discovery suggestion: role evidence is incomplete' end
    ],null),'mm-v1'::text
  from ranked r join public.profiles p on p.id=r.id
  order by r.fit desc,r.evidence desc,r.id;
end;
$$;

create function public.get_recommended_teams(
  p_user_id uuid, p_limit integer default 10, p_prefer_same_college boolean default false
)
returns table (
  id uuid,name text,description text,college text,skills text[],roles_needed text[],
  hackathon_id uuid,hackathon_name text,max_members integer,member_count integer,
  compatibility integer,same_college boolean,matched_role text,
  confidence double precision,components jsonb,reasons text[],score_version text
)
language plpgsql stable security definer set search_path = '' as $$
declare me matchmaking.builder_feature; blocked uuid[]; buckets text[]; pivot uuid;
        lim integer := least(greatest(coalesce(p_limit,10),1),50);
        prefer boolean := coalesce(p_prefer_same_college,false);
begin
  perform matchmaking.assert_viewer(p_user_id);
  select b.user_id,b.skills,b.foundations,b.domains,b.college_key,b.available,b.experience,
         b.eligible,b.ticket,b.version,b.refreshed_at,b.foundation_mask into strict me
  from matchmaking.builder_feature b where b.user_id=p_user_id;
  blocked:=array(select b.blocked_id from public.blocked_users b where b.blocker_id=p_user_id
                 union select b.blocker_id from public.blocked_users b where b.blocked_id=p_user_id);
  buckets:=array['all']||array(select 'd:'||i from generate_series(1,7) i where me.domains[i]>0);
  if prefer and me.college_key is not null then buckets:=array_append(buckets,'college:'||me.college_key); end if;
  pivot:=md5(p_user_id::text||':'||(now() at time zone 'UTC')::date::text||':teams:v1')::uuid;
  return query
  with pool as materialized (select q.id from matchmaking.team_pool(buckets,pivot) q),
  eligible as materialized (
    select t.id,t.max_members,roster.n as member_count,
           f.domains,f.foundation_mask,f.role_keys,f.role_counts,
           case when me.college_key is null or f.college_key is null then null
                else me.college_key=f.college_key end as same
    from pool q join public.teams t on t.id=q.id
    join public.profiles owner on owner.id=t.owner_id
    join matchmaking.team_feature f on f.team_id=t.id and f.version=1
    cross join lateral (
      -- Owner counts even if a legacy roster omitted their membership row.
      select count(*)::integer as n from (
        select tm.user_id from public.team_members tm where tm.team_id=t.id
        union select t.owner_id
      ) people
    ) roster
    where t.is_recruiting is true and t.max_members>0 and roster.n<t.max_members
      and t.owner_id<>p_user_id and not (t.owner_id=any(blocked))
      and owner.onboarding_completed is true and not coalesce(owner.is_banned,false)
      and not exists(select 1 from public.team_members tm where tm.team_id=t.id
                     and (tm.user_id=p_user_id or tm.user_id=any(blocked)))
      and not exists(select 1 from public.team_join_requests jr where jr.team_id=t.id
                     and jr.user_id=p_user_id and jr.status='pending')
      and not exists(select 1 from public.team_invites ti where ti.team_id=t.id
                     and ti.invited_user_id=p_user_id and ti.status='pending')
  ), raw as materialized (
    select e.id,e.member_count,e.same,best.label,
      case when (select sum(x) from unnest(me.domains) x)>0 then best.value else null end as role_fit,
      matchmaking.novelty(me.domains,e.domains) as novelty,
      matchmaking.baseline_bits(me.foundation_mask,e.foundation_mask) as base,
      -- Prefer teams with some existing collaborators, not teams with most vacancies.
      least(1.0,e.member_count::double precision/greatest(e.max_members-1,1)) as size_fit,
      case when e.same then 1.0 else 0.5 end as college_fit,
      e.same is not null as college_known
    from eligible e
    left join lateral (
      select r.label,
        (select min(me.domains[d])*(0.85+0.15/(1+avg(e.role_counts[d])))
         from unnest(r.required_domains) d) as value
      from matchmaking.role_definition r where r.key=any(e.role_keys)
      order by value desc,r.key limit 1
    ) best on true
  ), ranked as materialized (
    select r.id,r.member_count,r.same,
      case when r.role_fit>0 then r.label end as matched_role,
      r.role_fit,r.novelty,r.base,
      0.70*coalesce(r.novelty,0.5)+0.30*coalesce(r.base,0.5) as skill_fit,
      case when prefer then 0.75*r.size_fit+0.25*r.college_fit else r.size_fit end as context_fit,
      0.60*coalesce(r.role_fit,0.5)
       +0.30*(0.70*coalesce(r.novelty,0.5)+0.30*coalesce(r.base,0.5))
       +0.10*(case when prefer then 0.75*r.size_fit+0.25*r.college_fit else r.size_fit end) as fit,
      0.60*(r.role_fit is not null)::integer
       +0.21*(r.novelty is not null)::integer+0.09*(r.base is not null)::integer
       +0.10*(case when prefer then 0.75+0.25*r.college_known::integer else 1.0 end) as evidence
    from raw r order by fit desc,evidence desc,r.id limit lim
  )
  select t.id,t.name,t.description,t.college,t.skills,t.roles_needed,t.hackathon_id,t.hackathon_name,
    t.max_members,r.member_count,round((r.fit*100)::numeric)::integer,coalesce(r.same,false),r.matched_role,
    r.evidence::double precision,jsonb_build_object('role_gap',r.role_fit,'skill_fit',r.skill_fit,
      'novelty',r.novelty,'foundation',r.base,'context',r.context_fit),
    array_remove(array[
      case when r.matched_role is not null then 'Evidence for vacancy: '||r.matched_role end,
      case when r.novelty>=0.7 then 'Adds domain coverage' end,
      case when r.same then 'Same verified college mapping' end,
      case when r.role_fit is null then 'Discovery suggestion: vacancy or role evidence is incomplete' end
    ],null),'mm-v1'::text
  from ranked r join public.teams t on t.id=r.id
  order by r.fit desc,r.evidence desc,r.id;
end;
$$;

-- Private internals are not PostgREST schemas and cannot be called by API users.
-- Newly created private tables have NO pre-existing application consumers.
alter table matchmaking.skill enable row level security;
alter table matchmaking.skill_alias enable row level security;
alter table matchmaking.role_definition enable row level security;
alter table matchmaking.role_alias enable row level security;
alter table matchmaking.college_alias enable row level security;
alter table matchmaking.builder_feature enable row level security;
alter table matchmaking.team_feature enable row level security;
alter table matchmaking.builder_feed enable row level security;
alter table matchmaking.team_feed enable row level security;
revoke all on all tables in schema matchmaking from public,anon,authenticated;
revoke all on all functions in schema matchmaking from public,anon,authenticated;
revoke all on function public.get_recommended_teammates(uuid,integer,boolean) from public,anon;
revoke all on function public.get_recommended_teams(uuid,integer,boolean) from public,anon;
grant execute on function public.get_recommended_teammates(uuid,integer,boolean) to authenticated;
grant execute on function public.get_recommended_teams(uuid,integer,boolean) to authenticated;

-- Backfill inside this adoption transaction. For a live zero-downtime rollout,
-- split into prepare/backfill/switch migrations as described in DESIGN.md.
do $$
declare v_id uuid;
begin
  for v_id in select p.id from public.profiles p order by p.id loop
    perform matchmaking.refresh_builder(v_id);
  end loop;
  for v_id in select t.id from public.teams t order by t.id loop
    perform matchmaking.refresh_team(v_id);
  end loop;
end;
$$;
analyze matchmaking.builder_feature;
analyze matchmaking.builder_feed;
analyze matchmaking.team_feature;
analyze matchmaking.team_feed;
notify pgrst, 'reload schema';
commit;
