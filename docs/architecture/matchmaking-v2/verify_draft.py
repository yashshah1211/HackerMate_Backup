"""Verify the SQL draft in a throwaway local PostgreSQL cluster, never Supabase.

Requires PostgreSQL server/client binaries on PATH (Windows PG18 fallback included).
All records are fictitious. The entire cluster is stopped and deleted in finally.
Run: python docs/architecture/matchmaking-v2/verify_draft.py
"""
from pathlib import Path
import os
import shutil
import socket
import subprocess
import tempfile
import time

HERE = Path(__file__).resolve().parent
BIN = Path(shutil.which("psql") or r"C:\Program Files\PostgreSQL\18\bin\psql.exe").parent
SUFFIX = ".exe" if os.name == "nt" else ""
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def run(args, **kwargs):
    # PostgreSQL's background Windows children can retain pipe handles. A file
    # avoids waiting for pipe EOF after pg_ctl itself has already exited.
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as output:
        result = subprocess.run(args, text=True, stdout=output, stderr=subprocess.STDOUT,
                                creationflags=FLAGS, **kwargs)
        output.seek(0)
        value = output.read()
    if result.returncode:
        raise RuntimeError(value)
    return value


def main():
    root = Path(tempfile.mkdtemp(prefix="hackermate-mm-draft-")).resolve()
    data = root / "data"
    started = False
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    pgctl = str(BIN / ("pg_ctl" + SUFFIX))
    base = [str(BIN / ("psql" + SUFFIX)), "-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1",
            "-p", str(port), "-U", "mm_test", "-d", "postgres"]
    env = os.environ.copy()
    # Do not inherit production connection settings or per-user psql startup code.
    for key in list(env):
        if key.startswith("PG"):
            del env[key]
    try:
        run([str(BIN / ("initdb" + SUFFIX)), "-D", str(data), "-U", "mm_test", "-A", "trust",
             "--no-locale", "--encoding=UTF8"], env=env)
        run([pgctl, "-D", str(data), "-l", str(root / "server.log"), "-o",
             f"-h 127.0.0.1 -p {port}", "-w", "start"], env=env)
        started = True
        setup = root / "setup.sql"
        setup.write_text(SETUP, encoding="utf-8")
        run(base + ["-f", str(setup)], env=env)
        run(base + ["-f", str(HERE / "blueprint.sql")], env=env)
        checks = root / "checks.sql"
        checks.write_text(CHECKS, encoding="utf-8")
        print(run(base + ["-f", str(checks)], env=env), flush=True)
        if "--benchmark" in __import__("sys").argv:
            bench = root / "benchmark.sql"
            bench.write_text(BENCHMARK, encoding="utf-8")
            before = time.monotonic()
            print(run(base + ["-f", str(bench)], env=env), flush=True)
            print(f"Benchmark phase elapsed: {time.monotonic()-before:.1f}s")
        print("PASS: draft compiled and behavior assertions passed in an isolated PostgreSQL cluster.")
    finally:
        if (data / "postmaster.pid").exists():
            run([pgctl, "-D", str(data), "-m", "immediate", "-w", "stop"], env=env)
        # Only the exact directory allocated above may be removed.
        if root.parent == Path(tempfile.gettempdir()).resolve() and root.name.startswith("hackermate-mm-draft-"):
            shutil.rmtree(root)


SETUP = r"""
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table public.profiles (
 id uuid primary key,full_name text,avatar_url text,college text,bio text,skills text[],
 github_url text,linkedin_url text,year_of_study text,is_available boolean,
 onboarding_completed boolean not null default false,is_banned boolean,
 hackathon_participations integer default 0,hackathon_wins integer default 0,has_won_hackathon boolean default false
);
create table public.teams (
 id uuid primary key,name text not null,description text,college text,skills text[],roles_needed text[],
 hackathon_id uuid,hackathon_name text,max_members integer,is_recruiting boolean,
 owner_id uuid not null references public.profiles(id) on delete cascade
);
create table public.team_members (
 team_id uuid references public.teams(id) on delete cascade,
 user_id uuid references public.profiles(id) on delete cascade,project_role text,
 primary key(team_id,user_id)
);
create table public.blocked_users (
 blocker_id uuid not null references public.profiles(id) on delete cascade,
 blocked_id uuid not null references public.profiles(id) on delete cascade,
 unique(blocker_id,blocked_id)
);
create table public.team_join_requests(team_id uuid,user_id uuid,status text);
create table public.team_invites(team_id uuid,invited_user_id uuid,status text);
"""

CHECKS = r"""
insert into public.profiles(id,full_name,skills,is_available,onboarding_completed,college,hackathon_participations)
select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'FAKE builder '||i,
 case when i=1 or i%2=0 then array['React','Git','TypeScript'] else array['FastAPI','Git','TypeScript'] end,
 true,true,case when i=1 then 'DJSCE' else 'Dwarkadas J. Sanghvi College of Engineering' end,2
from generate_series(1,75) i;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$
declare c integer; value double precision;
begin
 if (select count(*) from public.get_recommended_teammates('00000000-0000-0000-0000-000000000001',1000))<>50 then
   raise exception 'Limit clamp failed'; end if;
 if (select count(*) from public.get_recommended_teammates('00000000-0000-0000-0000-000000000001',-1))<>1 then
   raise exception 'Negative limit clamp failed'; end if;
 if (select count(*) from public.get_recommended_teammates('00000000-0000-0000-0000-000000000001',null))<>10 then
   raise exception 'Null limit clamp failed'; end if;
 if (select id from public.get_recommended_teammates('00000000-0000-0000-0000-000000000001',1))<>'00000000-0000-0000-0000-000000000003'::uuid then
   raise exception 'Complementarity or deterministic tiebreak failed'; end if;
 if (select cardinality(f.skills) from matchmaking.skill_features(array['React','reactjs','react.js']) f)<>1 then
   raise exception 'Alias deduplication failed'; end if;
 if (select f.domains[3] from matchmaking.skill_features(array['Python']) f)<>0 then
   raise exception 'Python incorrectly inferred as ML'; end if;
 if matchmaking.novelty(array[0.7,0,0,0,0,0,0]::float8[],array[0.7,0,0,0,0,0,0]::float8[])<>0 then
   raise exception 'Identical domains should have no novelty'; end if;
 if matchmaking.baseline('{}','{}') is not null then raise exception 'Missing foundations should be unknown'; end if;
 if matchmaking.experience(0,0,false) is not null then raise exception 'Legacy defaults should be unknown'; end if;
 if matchmaking.norm(E'\t React  \n')<>'react' then raise exception 'Whitespace normalization failed'; end if;
 if (select matchmaking.baseline_bits(a.foundation_mask,b.foundation_mask)
     from matchmaking.skill_features(array['Git','Python']) a,
          matchmaking.skill_features(array['Git','Java']) b) is distinct from 0.5::float8 then
   raise exception 'Foundation bitmask scoring failed'; end if;
 begin
   perform public.get_recommended_teammates('00000000-0000-0000-0000-000000000002',1);
   raise exception 'Identity spoof accepted';
 exception when insufficient_privilege then null; end;
end;
$$;

insert into public.blocked_users values
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003'),
 ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001');
update public.profiles set is_banned=true where id='00000000-0000-0000-0000-000000000007';
update public.profiles set onboarding_completed=false where id='00000000-0000-0000-0000-000000000009';
do $$ begin
 if exists(select 1 from public.get_recommended_teammates('00000000-0000-0000-0000-000000000001',50)
 where id=any(array['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000007',
 '00000000-0000-0000-0000-000000000009']::uuid[])) then raise exception 'Eligibility failure'; end if;
end $$;

insert into public.teams(id,name,owner_id,is_recruiting,max_members,roles_needed,skills)
select ('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'FAKE team '||i,
 '00000000-0000-0000-0000-000000000011',true,4,
 case when i=2 then array['Full Stack Developer'] else array['Frontend Developer'] end,
 array['FastAPI','Git','TypeScript'] from generate_series(1,10) i;
insert into public.team_members(team_id,user_id,project_role)
select t.id,t.owner_id,'Backend' from public.teams t;
do $$ declare r record; begin
 select compatibility,matched_role,components into r from public.get_recommended_teams('00000000-0000-0000-0000-000000000001',10)
 where id='10000000-0000-0000-0000-000000000001';
 if r.matched_role<>'Frontend Developer' or (r.components->>'role_gap')::float8<>1 then
   raise exception 'Vacancy scoring failed'; end if;
 if (select (components->>'role_gap')::float8 from public.get_recommended_teams('00000000-0000-0000-0000-000000000001',10)
 where id='10000000-0000-0000-0000-000000000002')<>0 then raise exception 'Fullstack must require both domains'; end if;
end $$;
-- Each team fails one independent eligibility condition.
update public.teams set is_recruiting=false where id='10000000-0000-0000-0000-000000000003';
update public.teams set max_members=1 where id='10000000-0000-0000-0000-000000000004';
insert into public.team_members values('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','Frontend');
insert into public.team_join_requests values('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','pending');
insert into public.team_invites values('10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','pending');
insert into public.team_members values('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000005','Backend');
update public.teams set owner_id='00000000-0000-0000-0000-000000000003' where id='10000000-0000-0000-0000-000000000009';
update public.teams set owner_id='00000000-0000-0000-0000-000000000001' where id='10000000-0000-0000-0000-000000000010';
do $$ begin
 if (select count(*) from public.get_recommended_teams('00000000-0000-0000-0000-000000000001',50))<>2 then
   raise exception 'Team eligibility failure'; end if;
end $$;
update public.profiles set skills=array['FastAPI','Git','TypeScript'] where id='00000000-0000-0000-0000-000000000001';
do $$ begin
 if (select f.domains[2] from matchmaking.team_feature f where team_id='10000000-0000-0000-0000-000000000005')<>1 then
   raise exception 'Profile change failed to refresh team'; end if;
end $$;
-- Real API role checks, not just superuser execution.
set role authenticated;
select count(*) as authenticated_builder_results from public.get_recommended_teammates('00000000-0000-0000-0000-000000000001',10);
select count(*) as authenticated_team_results from public.get_recommended_teams('00000000-0000-0000-0000-000000000001',10);
reset role;
do $$ begin
 if has_schema_privilege('authenticated','matchmaking','USAGE') then raise exception 'Private schema exposed'; end if;
 if has_function_privilege('anon','public.get_recommended_teammates(uuid,integer,boolean)','EXECUTE') then
   raise exception 'Anonymous RPC access'; end if;
end $$;
select set_config('request.jwt.claim.sub','',false);
do $$ begin
 begin
   perform public.get_recommended_teammates('00000000-0000-0000-0000-000000000001',1);
   raise exception 'Unauthenticated request accepted';
 exception when insufficient_privilege then null; end;
end $$;
"""

BENCHMARK = r"""
-- Synthetic distribution only; this is not a Supabase production benchmark.
-- Triggers are verified above. Bulk fixture loading bypasses their repeated
-- execution to measure read performance separately from backfill/write cost.
alter table public.profiles disable trigger matchmaking_profile_changed;
insert into public.profiles(id,full_name,skills,is_available,onboarding_completed,hackathon_participations)
select ('20000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'FAKE benchmark '||i,
 case i%7 when 0 then array['React','Git','TypeScript'] when 1 then array['FastAPI','Git','Python']
 when 2 then array['PyTorch','Git','Python'] when 3 then array['Flutter','Git']
 when 4 then array['Docker','Git'] when 5 then array['Figma'] else array['Pitching'] end,
 i%3=0,true,i%8 from generate_series(1,99925) i;
alter table public.profiles enable trigger matchmaking_profile_changed;
create temporary table feature_templates as
 select raw.skills as raw_skills,f.skills,f.foundations,f.domains,f.foundation_mask
 from (select distinct p.skills from public.profiles p) raw
 cross join lateral matchmaking.skill_features(raw.skills) f;
insert into matchmaking.builder_feature
 (user_id,skills,foundations,domains,college_key,available,experience,eligible,ticket,foundation_mask)
 select p.id,f.skills,f.foundations,f.domains,null,p.is_available,
 matchmaking.experience(p.hackathon_participations,0,false),true,md5(p.id::text)::uuid,f.foundation_mask
 from public.profiles p join feature_templates f on f.raw_skills=p.skills
 where p.id::text like '20000000%';
insert into matchmaking.builder_feed(bucket,ticket,user_id)
 select k.bucket,f.ticket,f.user_id from matchmaking.builder_feature f
 cross join lateral (
 select 'all'::text as bucket
 union all select 'd:'||i from generate_series(1,7) i where f.domains[i]>=0.6
 union all select 'available' where f.available is true
 ) k where f.user_id::text like '20000000%';
alter table public.teams disable trigger matchmaking_team_changed;
alter table public.team_members disable trigger matchmaking_member_changed;
insert into public.teams(id,name,owner_id,is_recruiting,max_members,roles_needed,skills)
select ('30000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'FAKE benchmark team '||i,
 ('20000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,true,4,
 case i%7 when 0 then array['Frontend'] when 1 then array['Backend'] when 2 then array['AI/ML']
 when 3 then array['Mobile'] when 4 then array['DevOps'] when 5 then array['UI/UX'] else array['Pitch/Product'] end,
 array['React','Git'] from generate_series(1,19990) i;
insert into public.team_members(team_id,user_id,project_role)
select t.id,t.owner_id,'Frontend' from public.teams t where t.id::text like '30000000%';
alter table public.teams enable trigger matchmaking_team_changed;
alter table public.team_members enable trigger matchmaking_member_changed;
create temporary table team_templates as
 select raw.skills as raw_skills,f.skills,f.foundations,f.domains,f.foundation_mask
 from (select distinct t.skills||p.skills as skills from public.teams t
       join public.profiles p on p.id=t.owner_id where t.id::text like '30000000%') raw
 cross join lateral matchmaking.skill_features(raw.skills) f;
insert into matchmaking.team_feature
 (team_id,skills,foundations,domains,role_keys,role_counts,college_key,ticket,foundation_mask)
 select t.id,f.skills,f.foundations,f.domains,
 array(select a.role_key from unnest(t.roles_needed) r(raw)
       join matchmaking.role_alias a on a.alias=matchmaking.norm(r.raw)),
 '{1,0,0,0,0,0,0}'::integer[],null,md5(t.id::text)::uuid,f.foundation_mask
 from public.teams t join public.profiles p on p.id=t.owner_id
 join team_templates f on f.raw_skills=t.skills||p.skills where t.id::text like '30000000%';
insert into matchmaking.team_feed(bucket,ticket,team_id)
 select k.bucket,f.ticket,f.team_id from matchmaking.team_feature f
 cross join lateral (
 select 'all'::text as bucket
 union select 'd:'||d.domain from matchmaking.role_definition r
 cross join lateral unnest(r.required_domains) d(domain) where r.key=any(f.role_keys)
 ) k where f.team_id::text like '30000000%';
analyze;
create temporary table timings(surface text, elapsed_ms double precision);
do $$ declare i integer; started timestamptz; viewer uuid; begin
 for i in 1..120 loop
   viewer:=('20000000-0000-0000-0000-'||lpad((i*37)::text,12,'0'))::uuid;
   perform set_config('request.jwt.claim.sub',viewer::text,true);
   started:=clock_timestamp(); perform public.get_recommended_teammates(viewer,10,true);
   if i>20 then insert into timings values('builders',extract(epoch from clock_timestamp()-started)*1000); end if;
   started:=clock_timestamp(); perform public.get_recommended_teams(viewer,10,true);
   if i>20 then insert into timings values('teams',extract(epoch from clock_timestamp()-started)*1000); end if;
 end loop;
end $$;
select surface,round(percentile_cont(0.5) within group(order by elapsed_ms)::numeric,2) as p50_ms,
 round(percentile_cont(0.95) within group(order by elapsed_ms)::numeric,2) as p95_ms,
 round(max(elapsed_ms)::numeric,2) as max_ms from timings group by surface;
"""

if __name__ == "__main__":
    main()
