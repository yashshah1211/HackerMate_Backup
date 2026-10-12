"""Execute the candidate search migration in a disposable local PostgreSQL cluster.

Never connects to Supabase. Requires PostgreSQL binaries and pg_trgm locally.
Run: python scripts/test-builder-search-local.py [--pg-bin /path/to/bin]
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/202610120001_builder_profile_search.sql"
VIEWER = "00000000-0000-0000-0000-000000000001"
FIELDS = "id,full_name,college,year_of_study,bio,avatar_url,skills,is_available,has_participated_hackathon,hackathon_participations,has_won_hackathon,hackathon_wins,last_seen_at,created_at"


def run(args, env):
    # pg_ctl children must not inherit captured pipes.
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as output:
        result = subprocess.run(args, env=env, text=True, stdout=output, stderr=subprocess.STDOUT)
        output.seek(0)
        text = output.read()
    if result.returncode:
        raise RuntimeError(text)
    return text


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", type=Path)
    parser.add_argument("--existing-trgm-schema", choices=["public", "extensions"])
    args = parser.parse_args()
    bin_dir = args.pg_bin or Path(shutil.which("psql") or "missing-postgresql/psql").parent
    suffix = ".exe" if os.name == "nt" else ""
    for name in ["psql", "initdb", "pg_ctl"]:
        if not (bin_dir / (name + suffix)).is_file():
            raise RuntimeError("Local PostgreSQL binaries are required; use --pg-bin. No remote database is used.")
    root = Path(tempfile.mkdtemp(prefix="hackermate-builder-search-")).resolve()
    data = root / "data"
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    ctl = str(bin_dir / ("pg_ctl" + suffix))
    base = [str(bin_dir / ("psql" + suffix)), "-X", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
            "-h", "127.0.0.1", "-p", str(port), "-U", "search_fixture", "-d", "postgres", "-t", "-A", "-q"]
    count = 0

    def sql(statement, role="authenticated"):
        prefix = f"set request.jwt.claim.sub={literal(VIEWER)}; set role {role};" if role else ""
        return run(base + ["-c", prefix + statement], env).strip()

    def check(condition, label):
        nonlocal count
        if not condition:
            raise AssertionError(label)
        count += 1
        print("PASS:", label, flush=True)

    def matches(term, sort="new", limit=1000):
        statement = "select coalesce(json_agg(r), '[]'::json) from public.search_builder_profiles(" + literal(term) + "," + literal(sort) + f",{limit}) r;"
        return json.loads(sql(statement))

    def denied(statement, code="42501", role="authenticated"):
        try:
            sql(statement, role)
        except RuntimeError as error:
            return code in str(error)
        return False

    try:
        run([str(bin_dir / ("initdb" + suffix)), "-D", str(data), "-U", "search_fixture", "-A", "trust",
             "--no-locale", "--encoding=UTF8"], env)
        run([ctl, "-D", str(data), "-l", str(root / "server.log"), "-o", f"-h 127.0.0.1 -p {port} -k {root}", "-w", "start"], env)
        setup = """
create role authenticated;
create role anon;
create schema auth;
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema public, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create table public.profiles (
 id uuid primary key, full_name text, college text, year_of_study text, bio text, avatar_url text,
 skills text[], is_available boolean, has_participated_hackathon boolean, hackathon_participations integer,
 has_won_hackathon boolean, hackathon_wins integer, last_seen_at timestamptz, created_at timestamptz,
 email text, fixture_visible boolean default true
);
alter table public.profiles enable row level security;
create policy fixture_profiles_read on public.profiles for select to authenticated using (fixture_visible);
""" + f"grant select ({FIELDS}) on public.profiles to authenticated;"
        sql(setup, role=None)
        if args.existing_trgm_schema:
            sql("create schema if not exists extensions; create extension pg_trgm with schema " + args.existing_trgm_schema + ";", role=None)
        run(base + ["-f", str(MIGRATION)], env)
        if args.existing_trgm_schema:
            schema = sql("select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm';", role=None)
            check(schema == args.existing_trgm_schema, "existing pg_trgm schema is preserved")
        fixtures = [
            (1, "Ada", "Alpha College", ["Python", "TypeScript", "React Native", "C++", "C#", "Node.js", "Next.js"], True),
            (2, "Second", "Beta College", ["pYtHoN"], False),
            (3, "Third", "Gamma College", ["PYTHON"], None),
            (4, "Python Person", "Delta College", ["Ruby"], True),
            (5, "Punctuation", "Punctuation College", ["comma,skill", "paren(skill)", "brace{skill}", 'quote"skill', "percent%skill", "under_score", "back\\slash", "single'quote", "cross", "boundary"], None),
            (6, "Single Element", "Other College", ["cross\nboundary"], None),
        ]
        for number, name, college, skills, available in fixtures:
            array = "array[" + ",".join(literal(skill) for skill in skills) + "]"
            status = "null" if available is None else str(available).lower()
            sql(f"insert into public.profiles (id,full_name,college,skills,is_available,created_at,last_seen_at,email) values ('10000000-0000-0000-0000-{number:012}',{literal(name)},{literal(college)},{array},{status},'2026-01-{number:02}'," + ("null" if number == 3 else f"'2026-02-{7-number:02}'") + ",'PRIVATE_EMAIL');", role=None)
        sql("""
insert into public.profiles (id,full_name,skills,created_at,fixture_visible)
values ('90000000-0000-0000-0000-000000000001','Hidden',array['Python','private-secret'],'2026-12-01',false);
insert into public.profiles (id,full_name,skills,created_at,last_seen_at)
select ('20000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'Bulk '||g,array['LoadCase'],
 '2026-03-01'::timestamptz + g*interval '1 second', '2026-04-01'::timestamptz + g*interval '1 second'
from generate_series(1,1200) g;
insert into public.profiles (id,full_name,skills,created_at)
values ('30000000-0000-0000-0000-000000000001','Old but searchable',array['RareNeedle'],'2020-01-01');
analyze public.profiles;
""", role=None)
        expected = [f"10000000-0000-0000-0000-{number:012}" for number in [4, 3, 2, 1]]
        for term in ["Python", "python", "PYTHON", "PyThOn"]:
            check([r["id"] for r in matches(term)] == expected, term + " finds mixed-case skills and name, excluding RLS-hidden rows")
        for term in ["script", "React Native", "react native", "C++", "c#", "node.js", "NEXT.JS"]:
            check([r["id"] for r in matches(term)] == [expected[-1]], "literal partial/multiword/punctuation skill: " + term)
        for term in ["comma,skill", "paren(skill)", "brace{skill}", 'quote"skill', "%", "_", "back\\slash", "single'quote"]:
            check([r["id"] for r in matches(term)] == ["10000000-0000-0000-0000-000000000005"], "search metacharacters stay literal: " + term)
        for term, number in [("(", 5), (")", 5), ("{", 5), ("}", 5), ('"', 5), (",", 5), ("+", 1), ("#", 1)]:
            check([r["id"] for r in matches(term)] == [f"10000000-0000-0000-0000-{number:012}"], "standalone punctuation stays literal: " + term)
        check(matches("%_'); drop table public.profiles; --") == [], "SQL-looking input cannot alter query structure")
        check([r["full_name"] for r in matches("cross\nboundary")] == ["Single Element"], "indexed document never matches across distinct skill boundaries")
        check([r["full_name"] for r in matches("ada")] == ["Ada"], "case-insensitive name matching")
        check([r["full_name"] for r in matches("ALPHA COLLEGE")] == ["Ada"], "case-insensitive college matching")
        check(matches("no-such-skill") == [], "no match produces a genuine empty result")
        check([r["full_name"] for r in matches("RareNeedle")] == ["Old but searchable"], "search happens before the cap, beyond the first 1000 profiles")
        check(len(matches("loadcase", limit=5000)) == 1000, "result cap cannot exceed 1000")
        check(len(matches("loadcase", limit=2)) == 2 and matches("loadcase", limit=0) == [], "requested limits remain bounded")
        check(matches(" \t\n ", limit=2) == matches("", limit=2), "empty/whitespace search")
        check([r["id"] for r in matches("python", "fit")] == expected, "Fit retrieval keeps creation ordering")
        check([r["id"] for r in matches("python", "active")] == [expected[-1], expected[-2], expected[0], expected[1]], "Active retrieval keeps last_seen ordering with nulls last")
        check(set(matches("Python")[0]) == set(FIELDS.split(",")), "explicit projection contains no email or internal policy columns")
        check([r["is_available"] for r in matches("Python")] == [True, None, False, True], "availability values are unchanged")
        check(denied("select email from public.profiles;"), "email column remains inaccessible")
        check(denied("select * from public.search_builder_profiles('Python');", role="anon"), "anon cannot execute search")
        check(denied("set request.jwt.claim.sub=''; select * from public.search_builder_profiles('Python');"), "authenticated role without an identity is rejected")
        check(denied("select * from public.search_builder_profiles('Python','active; drop table public.profiles');", "22023"), "sort input cannot alter SQL")
        check(denied("select * from public.search_builder_profiles(" + literal("a" * 257) + ");", "22023"), "query length is bounded")
        sql("revoke select (skills) on public.profiles from authenticated;", role=None)
        check(denied("select * from public.search_builder_profiles('Python');"), "invoker search cannot bypass missing column permission")
        sql("grant select (skills) on public.profiles to authenticated;", role=None)
        check(sql("select prosecdef from pg_proc where oid='public.search_builder_profiles(text,text,integer)'::regprocedure;", role=None) == "f", "RPC uses SECURITY INVOKER")
        indexes = sql("select count(*) from pg_indexes where tablename='profiles' and indexname like 'profiles_builder_search_%';", role=None)
        check(indexes == "3", "three trigram indexes installed")
        for expression, index in [
            ("lower(full_name) like '%ada%'", "name"),
            ("lower(college) like '%alpha%'", "college"),
            ("public.builder_skill_search_document(skills) like '%python%'", "skills"),
        ]:
            plan = sql("set enable_seqscan=off; explain (format json) select id from public.profiles where " + expression + ";", role=None)
            check(f"profiles_builder_search_{index}_trgm_idx" in plan, "planner supports indexed " + index + " candidate retrieval")
        print(f"PASS: {count} real PostgreSQL search/security/index checks; no remote database used.", flush=True)
    finally:
        if (data / "postmaster.pid").exists():
            run([ctl, "-D", str(data), "-m", "immediate", "-w", "stop"], env)
        if root.parent == Path(tempfile.gettempdir()).resolve() and root.name.startswith("hackermate-builder-search-"):
            shutil.rmtree(root)


if __name__ == "__main__":
    main()
