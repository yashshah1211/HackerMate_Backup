"""GL Bajaj Phase B: run the real migration, read-only checks and rollback in a
disposable local PostgreSQL cluster with synthetic profiles only. Never Supabase.

Requires local PostgreSQL binaries (initdb, pg_ctl, psql; Windows PG18 fallback via
docs/architecture/matchmaking-v2/verify_draft.py) and Node with this worktree's
node_modules. Every profile and team is fictitious; spellings marked "synthetic"
are test inputs, not production values.

Run: python scripts/test-gl-bajaj-college-alias-local.py
"""
import importlib.util
import json
import os
import re
import shutil
import socket
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("mm_fixture", ROOT / "docs/architecture/matchmaking-v2/verify_draft.py")
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

V2 = ROOT / "supabase/migrations/20260925221500_matchmaking_v2_engine.sql"
MIGRATION = ROOT / "supabase/migrations/20261024120000_gl_bajaj_college_alias.sql"
ROLLBACK = ROOT / "supabase/rollback/20261024120000_gl_bajaj_college_alias_rollback.sql"
PRECHECK = ROOT / "scripts/sql/gl_bajaj_phase_b_precheck.sql"
POSTCHECK = ROOT / "scripts/sql/gl_bajaj_phase_b_postcheck.sql"
M = "GL Bajaj Group of Institutions, Mathura"
N = "GL Bajaj Institute of Technology & Management, Greater Noida"
MK, NK = "gl-bajaj-mathura", "gl-bajaj-greater-noida"
OLD = "2000-01-01 00:00:00+00"

REVIEWED = [
    "GL Bajaj Group Of Institutions Mathura", "GL Bajaj Group Of Institutions, Mathura",
    "G.L. Bajaj Group Of Institutions, Mathura", "G.L.bajaj group of institutions mathura",
    "GL Bajaj group of institution mathura", "G.l bajaj mathura", "Gl bajaj mathura",
]
# 11 legacy rows, 9 distinct spellings; the audited canonical row is separate.
LEGACY = REVIEWED + [
    "G L Bajaj Group of Institutions Mathura",   # synthetic
    "gl bajaj group of institutions , mathura",  # synthetic
    "Gl bajaj mathura",                          # repeated spelling
    "GL Bajaj Group Of Institutions, Mathura",   # repeated spelling
]
AMBIGUOUS = [
    "GL Bajaj", "GL Bajaj Group of Institutions", "Gl bajaj group of institution",
    "G.L. Bajaj Group Of Institutions", "GL BAJAJ GROUP OF INSTITUTIONS",
    "GL Bajaj Mathura Greater Noida", "GL Bajaj Institute of Technology and Management",
]
# The first Mathura row models the audit; two extra synthetic rows test both campuses.
CANONICAL = [M, M, N]
UNRELATED = ["DJSCE", "GLA University Mathura", "Bajaj Institute of Technology Wardha",
             "Jamnalal Bajaj Institute of Management Studies", "GLBITM", "Offline Campus"]


def uid(group, i):
    return f"00000000-0000-0000-0000-{group}{i:011d}"


def tid(i):
    return f"10000000-0000-0000-0000-{i:012d}"


PROFILES = ([(uid("a", i), v, "legacy_mathura") for i, v in enumerate(LEGACY)]
            + [(uid("b", i), v, "ambiguous") for i, v in enumerate(AMBIGUOUS)]
            + [(uid("c", i), v, "canonical") for i, v in enumerate(CANONICAL)]
            + [(uid("d", i), v, "unrelated") for i, v in enumerate(UNRELATED)])
A = [p for p in PROFILES if p[2] == "legacy_mathura"]
B = [p for p in PROFILES if p[2] == "ambiguous"]
C = [p for p in PROFILES if p[2] == "canonical"]
D = [p for p in PROFILES if p[2] == "unrelated"]


def q(value):
    return "'" + value.replace("'", "''") + "'"


def norm(value):
    return re.sub(r"\s+", " ", value).strip().lower()


SETUP_EXTRA = """
alter table public.profiles add column show_track_record boolean, add column email text, add column gender text,
  add column updated_at timestamptz default now();
alter table public.team_invites add column id uuid default gen_random_uuid(), add column invited_by uuid;
create table public.hackathons(id uuid primary key,min_team_size integer,max_team_size integer);
create table public.team_hackathons(team_id uuid,hackathon_id uuid);
create table public.notifications(user_id uuid,message text,link text);
-- Mirrors the live set_profiles_updated_at trigger so its side effect is observable.
create function public.handle_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.handle_updated_at();
"""


def seed_sql():
    rows = ",\n".join(
        f"({q(pid)}::uuid,'FAKE builder {i}',{q(college)},array['React','TypeScript'],true,true,2)"
        for i, (pid, college, _) in enumerate(PROFILES))
    return f"""
insert into public.profiles(id,full_name,college,skills,is_available,onboarding_completed,hackathon_participations) values
{rows};
insert into public.teams(id,name,owner_id,college,is_recruiting,max_members,skills,roles_needed) values
 ('{tid(1)}','FAKE team legacy owner','{A[0][0]}','Offline Campus',true,4,array['React'],array['Frontend']),
 ('{tid(2)}','FAKE team canonical Mathura','{C[0][0]}',{q(M)},true,4,array['React'],array['Frontend']),
 ('{tid(3)}','FAKE team canonical Greater Noida','{C[2][0]}',{q(N)},true,4,array['React'],array['Frontend']),
 ('{tid(4)}','FAKE team unrelated','{D[5][0]}','DJSCE',true,4,array['React'],array['Frontend']);
insert into public.team_members(team_id,user_id,project_role) values ('{tid(1)}','{A[1][0]}','Frontend');
-- Timestamp markers expose exactly which rows the migration touches.
alter table public.profiles disable trigger set_profiles_updated_at;
update public.profiles set updated_at = '{OLD}';
alter table public.profiles enable trigger set_profiles_updated_at;
update matchmaking.builder_feature set refreshed_at = '{OLD}';
update matchmaking.team_feature set refreshed_at = '{OLD}';
"""


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    check.count += 1


check.count = 0


def main():
    root = Path(tempfile.mkdtemp(prefix="hackermate-gl-bajaj-")).resolve()
    data = root / "data"
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    env["PGTZ"] = "UTC"  # Stable timestamp text for the untouched-row markers.
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    ctl = str(fixture.BIN / ("pg_ctl" + fixture.SUFFIX))
    psql_bin = str(fixture.BIN / ("psql" + fixture.SUFFIX))
    files = iter(range(10_000))

    def write(text):
        path = root / f"step-{next(files)}.sql"
        path.write_text(text, encoding="utf-8")
        return str(path)

    def psql(db, *args, quiet=True):
        base = [psql_bin, "-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", str(port),
                "-U", "gl_test", "-d", db, "-At", "-F", "|"] + (["-q"] if quiet else [])
        return fixture.run(base + list(args), env=env)

    def rows(db, query):
        return [line.split("|") for line in psql(db, "-f", write(query)).splitlines() if "|" in line]

    assert "create role anon;" in fixture.SETUP and "create role authenticated;" in fixture.SETUP
    setup = (fixture.SETUP
             .replace("create role anon;", "do $r$ begin create role anon; exception when duplicate_object then null; end $r$;")
             .replace("create role authenticated;", "do $r$ begin create role authenticated; exception when duplicate_object then null; end $r$;")
             + SETUP_EXTRA)

    def build(db, extra=""):
        psql("postgres", "-c", f"create database {db}")
        psql(db, "-f", write(setup))
        psql(db, "-f", str(V2))
        psql(db, "-f", write(seed_sql() + extra))

    def read_only(db, path):
        out = psql(db, "-c", "set default_transaction_read_only = on", "-f", str(path))
        return [line.split("|") for line in out.splitlines() if "|" in line]

    def profiles(db):
        result = rows(db, """
select p.id, p.college, coalesce(f.college_key,''), f.refreshed_at::text, p.updated_at::text,
  coalesce((select string_agg(b.bucket, ',' order by b.bucket) from matchmaking.builder_feed b
            where b.user_id=p.id and b.bucket like 'college:%'), '')
from public.profiles p left join matchmaking.builder_feature f on f.user_id=p.id order by p.id;""")
        return {r[0]: r[1:] for r in result}

    def teams(db):
        result = rows(db, """
select t.id, coalesce(f.college_key,''), f.refreshed_at::text,
  coalesce((select string_agg(b.bucket, ',' order by b.bucket) from matchmaking.team_feed b
            where b.team_id=t.id and b.bucket like 'college:%'), '')
from public.teams t left join matchmaking.team_feature f on f.team_id=t.id order by t.id;""")
        return {r[0]: r[1:] for r in result}

    def aliases(db):
        return sorted(tuple(r) for r in rows(db, "select alias, college_key from matchmaking.college_alias order by 1;"))

    def scalar(db, query):
        return psql(db, "-c", query).strip().splitlines()[-1]

    def same_college(db, viewer):
        result = rows(db, f"select set_config('request.jwt.claim.sub','{viewer}',false);"
                          f"select id, coalesce(same_college::text,'null') from public.get_recommended_teammates('{viewer}',50);")
        return {r[0]: r[1] for r in result}

    def gates_pass(result, label):
        gates = [r for r in result if r[0] == "gate"]
        check(gates, f"{label} returned gate rows")
        failed = [r for r in gates if r[4] != "t"]
        check(not failed, f"{label} gates failed: {failed}")

    try:
        fixture.run([str(fixture.BIN / ("initdb" + fixture.SUFFIX)), "-D", str(data), "-U", "gl_test",
                     "-A", "trust", "--no-locale", "--encoding=UTF8"], env=env)
        fixture.run([ctl, "-D", str(data), "-l", str(root / "server.log"), "-o", f"-h 127.0.0.1 -p {port}", "-w", "start"], env=env)

        # Audit-shaped fixture: 19 GL Bajaj profiles = 11 legacy + 1 canonical + 7 cityless.
        # Remove extra campus/unrelated Bajaj fixtures; all spellings remain synthetic.
        build("gl_audit", f"""
delete from public.teams where college ilike '%bajaj%';
delete from public.profiles where id in ('{C[1][0]}','{C[2][0]}','{D[2][0]}','{D[3][0]}');
update public.profiles set college='GL Bajaj Group Of Institution' where id='{B[5][0]}';
""")
        audit_pre = read_only("gl_audit", PRECHECK)
        gates_pass(audit_pre, "audited-count precheck")
        audit_detail = [r for r in audit_pre if r[0] == "detail"]
        check(sum(int(r[3]) for r in audit_detail) == 19, "audit fixture has exactly 19 GL Bajaj profiles")
        check(sum(int(r[3]) for r in audit_detail if r[1] == "legacy_mathura") == 11
              and sum(r[1] == "legacy_mathura" for r in audit_detail) == 9,
              "audit precheck separates 11 legacy rows across 9 spellings")
        check([(r[2], r[3]) for r in audit_detail if r[1] == "canonical_mathura"] == [(M, "1")],
              "audit precheck excludes the single canonical Mathura profile from legacy counts")
        check(sum(int(r[3]) for r in audit_detail if r[1] == "ambiguous") == 7
              and not any("greater_noida" in r[1] for r in audit_detail),
              "audit fixture has 7 ambiguous and no explicit Greater Noida profiles")
        audit_before, audit_aliases = profiles("gl_audit"), aliases("gl_audit")
        check(audit_before[C[0][0]][1] == "", "audited canonical profile starts with a NULL cached key")
        out = psql("gl_audit", "-f", str(MIGRATION), quiet=False)
        check("first_run=t" in out and "profiles_updated=11" in out
              and "builders_refreshed=1" in out and "teams_refreshed=0" in out,
              f"audited-count migration summary: {out[-600:]}")
        print("Audit fixture: " + re.search(r"GL Bajaj Phase B: first_run=.*", out).group(0), flush=True)
        audit_after = profiles("gl_audit")
        check(sum(audit_after[pid][0] != before[0] for pid, before in audit_before.items()) == 11,
              "audit fixture changes exactly 11 stored colleges")
        canonical = audit_after[C[0][0]]
        check(canonical[0] == M and canonical[3] == audit_before[C[0][0]][3]
              and canonical[1] == MK and canonical[2] != audit_before[C[0][0]][2]
              and canonical[4] == "college:" + MK,
              "audited canonical college and updated_at preserved while its cache and feed are repaired")
        check(all(audit_after[pid] == audit_before[pid] for pid, _, _ in B),
              "all seven audited ambiguous profiles, caches, feeds and timestamps stay unchanged")
        check(scalar("gl_audit", f"select count(*) from matchmaking.gl_bajaj_college_backfill where profile_id='{C[0][0]}'") == "0",
              "already-canonical profile is not recorded for rollback")
        gates_pass(read_only("gl_audit", POSTCHECK), "audited-count postcheck")
        out = psql("gl_audit", "-f", str(ROLLBACK), quiet=False)
        check("profiles_restored=11" in out and "profiles_skipped_user_edited=0" in out,
              "audit rollback restores exactly the 11 legacy profiles")
        audit_rolled = profiles("gl_audit")
        check(all(audit_rolled[pid][0] == before[0] for pid, before in audit_before.items())
              and aliases("gl_audit") == audit_aliases, "audit rollback restores stored colleges and original aliases")
        check(audit_rolled[C[0][0]][3] == audit_before[C[0][0]][3]
              and audit_rolled[C[0][0]][1] == "", "rollback preserves the canonical profile and clears its cached GL Bajaj key")

        build("gl_main")
        original_aliases = aliases("gl_main")
        before_profiles = profiles("gl_main")
        before_teams = teams("gl_main")
        check(all(v[1] == "" for k, v in before_profiles.items() if k[24] in "abc"), "GL Bajaj builders start uncached (as audited)")

        # 1. SQL key == Phase A collegeMatchKey(); Phase A normalizeCollege agrees with the categories.
        inputs = [p[1] for p in PROFILES] + [
            "Vivekanand Education Society's Institute of Technology", "K. J. Somaiya Institute", "A&B  C", "", "   ",
            "G.L.B", "gl-bajaj", "x y z", "IIT (BHU)", "12 a b 3 c", "a", "GL&Bajaj", "G.L. BAJAJ   ", "glbajaj mathura"]
        function = re.search(r"CREATE OR REPLACE FUNCTION pg_temp\.gl_bajaj_match_key\(v text\).*?\n\$\$;\n",
                             MIGRATION.read_text(encoding="utf-8"), re.S).group(0)
        sql_keys = [line[1:-1] for line in psql("gl_main", "-f", write(
            function + "select '[' || pg_temp.gl_bajaj_match_key(j.v) || ']' from json_array_elements_text($json$"
            + json.dumps(inputs) + "$json$::json) with ordinality j(v, n) order by j.n;")).splitlines()
            if line.startswith("[")]
        payload = root / "inputs.json"
        payload.write_text(json.dumps(inputs), encoding="utf-8")
        code = ("const {harness}=require('./scripts/ppt-vision-harness.cjs');const c=harness().load('src/lib/colleges.ts');"
                "const input=JSON.parse(require('node:fs').readFileSync(process.argv[1],'utf8'));"
                "console.log(JSON.stringify(input.map(v=>[c.collegeMatchKey(v),c.normalizeCollege(v)])));")
        js = json.loads(fixture.run([shutil.which("node") or "node", "-e", code, str(payload)], env=env, cwd=ROOT).strip().splitlines()[-1])
        check(sql_keys == [k for k, _ in js], f"SQL and Phase A keys differ: {list(zip(inputs, sql_keys, [k for k, _ in js]))}")
        for (_, college, category), (_, normalized) in zip(PROFILES, js):
            if category == "legacy_mathura":
                check(normalized == M, f"Phase A maps legacy {college!r} to Mathura")
            elif category == "ambiguous" or (category == "unrelated" and college != "DJSCE"):
                check(normalized == re.sub(r"\s+", " ", college).strip(), f"Phase A leaves {college!r} unchanged")

        # 2. Read-only precheck: all gates pass and categories match the fixture.
        pre = read_only("gl_main", PRECHECK)
        gates_pass(pre, "precheck")
        detail = {(r[1], r[2]): int(r[3]) for r in pre if r[0] == "detail"}
        expected = {}
        for _, college, category in PROFILES:
            if "bajaj" not in college.lower():
                continue
            cat = {"canonical": "canonical_mathura" if college == M else "canonical_greater_noida"}.get(category, category)
            expected[(cat, college)] = expected.get((cat, college), 0) + 1
        check(detail == expected, f"precheck categories differ: {detail} vs {expected}")
        pre_info = {r[1]: r[2] for r in pre if r[0] == "info"}
        fingerprints = {k: v for k, v in pre_info.items() if k.startswith("fingerprint ")}
        check(len(fingerprints) == 5, f"precheck fingerprints all five matchmaking functions: {fingerprints}")
        for name, value in sorted(fingerprints.items()):
            print(f"Repository {name}: {value}  (compare with the production precheck)", flush=True)

        # 3. First application.
        out = psql("gl_main", "-f", str(MIGRATION), quiet=False)
        check("first_run=t" in out and "profiles_updated=11" in out and "builders_refreshed=3" in out
              and "teams_refreshed=2" in out, f"unexpected migration summary: {out[-600:]}")
        after = profiles("gl_main")
        for pid, college, category in PROFILES:
            new_college, key, refreshed, updated, buckets = after[pid]
            old = before_profiles[pid]
            if category == "legacy_mathura":
                check(new_college == M, f"{college!r} backfilled to Mathura")
                check((key, buckets) == (MK, "college:" + MK), f"{college!r} cached as Mathura")
                check(refreshed != OLD and updated != OLD, f"{college!r} refreshed by trigger")
            elif category == "canonical":
                expected_key = MK if college == M else NK
                check(new_college == college and (key, buckets) == (expected_key, "college:" + expected_key),
                      f"canonical {college!r} keyed {expected_key}")
                check(refreshed != OLD and updated == OLD, f"canonical {college!r} cache refreshed without a profile write")
            else:
                check(after[pid] == old, f"{category} {college!r} untouched (college, cache, feed, updated_at)")
        team_after = teams("gl_main")
        check(team_after[tid(1)][0] == "" and team_after[tid(1)][1] != OLD, "legacy owner's team re-derived by trigger, key unchanged")
        check(team_after[tid(2)][::2] == [MK, "college:" + MK] and team_after[tid(2)][1] != OLD, "canonical Mathura team keyed")
        check(team_after[tid(3)][::2] == [NK, "college:" + NK] and team_after[tid(3)][1] != OLD, "canonical Greater Noida team keyed")
        check(team_after[tid(4)] == before_teams[tid(4)], "unrelated team untouched")

        expected_m = {norm(v) for v in [M] + REVIEWED + LEGACY}
        now_aliases = aliases("gl_main")
        check([a for a in now_aliases if a[1] not in (MK, NK)] == original_aliases, "unrelated aliases unchanged")
        check({a for a, k in now_aliases if k == MK} == expected_m, "Mathura aliases are exactly canonical + reviewed + stored")
        check([a for a, k in now_aliases if k == NK] == [norm(N)], "Greater Noida alias is the canonical name only")
        gl_aliases = {a for a, k in now_aliases if k in (MK, NK)}
        for value in AMBIGUOUS + UNRELATED:
            check(norm(value) not in gl_aliases, f"{value!r} has no GL Bajaj alias")
        backfill = rows("gl_main", "select profile_id, previous_college, new_college from matchmaking.gl_bajaj_college_backfill order by 1;")
        check(sorted((r[0], r[1], r[2]) for r in backfill) == sorted((p, c, M) for p, c, _ in A), "backfill record holds every previous value")
        check(scalar("gl_main", "select has_table_privilege('authenticated','matchmaking.gl_bajaj_college_backfill','select')") == "f",
              "backfill record not readable by authenticated")

        # Same-college recognition in both directions, never across campuses. The RPC
        # reports unknown (NULL key) as false; the cached keys above prove NULL.
        viewer = same_college("gl_main", A[0][0])
        check(viewer[C[0][0]] == "true" and viewer[A[6][0]] == "true", "Mathura viewer matches Mathura peers")
        check(viewer[C[2][0]] == "false", "Mathura viewer does not match Greater Noida")
        check(viewer[B[0][0]] == "false" and viewer[D[0][0]] == "false", "ambiguous and other colleges never match Mathura")
        reverse = same_college("gl_main", C[0][0])
        check(reverse[A[0][0]] == "true" and reverse[C[2][0]] == "false", "canonical Mathura viewer matches backfilled peers only")
        noida = same_college("gl_main", C[2][0])
        check(noida[A[0][0]] == "false" and noida[C[0][0]] == "false", "Greater Noida viewer does not match Mathura")
        check(all(v == "false" for v in same_college("gl_main", B[0][0]).values()), "ambiguous viewer has no college match")

        post = read_only("gl_main", POSTCHECK)
        gates_pass(post, "postcheck")
        post_info = {r[1]: r[2] for r in post if r[0] == "info"}
        check(pre_info["unrelated alias rows (compare with postcheck)"] == post_info["unrelated alias rows (must equal precheck)"]
              and pre_info["unrelated alias fingerprint (compare with postcheck)"] == post_info["unrelated alias fingerprint (must equal precheck)"],
              "unrelated alias fingerprint identical before and after")

        # 4. Idempotence: a second run changes nothing at all.
        snapshot = (profiles("gl_main"), teams("gl_main"), aliases("gl_main"))
        out = psql("gl_main", "-f", str(MIGRATION), quiet=False)
        check("first_run=f" in out and "aliases_added=0" in out and "profiles_updated=0" in out
              and "builders_refreshed=0" in out and "teams_refreshed=0" in out, f"re-run not a no-op: {out[-600:]}")
        check((profiles("gl_main"), teams("gl_main"), aliases("gl_main")) == snapshot, "re-run left every row identical")

        # 5. Rollback restores the exact previous state, then the migration re-applies cleanly.
        out = psql("gl_main", "-f", str(ROLLBACK), quiet=False)
        check("profiles_restored=11" in out and "profiles_skipped_user_edited=0" in out, f"rollback summary: {out[-600:]}")
        rolled = profiles("gl_main")
        for pid, college, _ in PROFILES:
            expected_key = "djsce-mumbai" if college == "DJSCE" else ""
            check(rolled[pid][:2] == [college, expected_key] and "gl-bajaj" not in rolled[pid][4],
                  f"{college!r} restored with no GL Bajaj cache")
        check(aliases("gl_main") == original_aliases, "rollback restored the original alias table exactly")
        check(all(not v[0] or v[0] == "djsce-mumbai" for v in teams("gl_main").values()), "rollback cleared team GL keys")
        check(scalar("gl_main", "select to_regclass('matchmaking.gl_bajaj_college_backfill') is null") == "t", "backfill table dropped")
        out = psql("gl_main", "-f", str(MIGRATION), quiet=False)
        check("first_run=t" in out and "profiles_updated=11" in out, "migration re-applies after rollback")
        gates_pass(read_only("gl_main", POSTCHECK), "postcheck after re-apply")

        # 6. Drift guards abort atomically and leave no partial state.
        scenarios = [
            ("drift_extra", f"insert into public.profiles(id,full_name,college,skills,onboarding_completed) values ('{uid('e', 1)}','FAKE','GL Bajaj mathura',array['React'],true);",
             "expected 11 legacy Mathura rows, found 12"),
            ("drift_resaved", f"update public.profiles set college={q(M)} where id='{A[0][0]}';",
             "expected 11 legacy Mathura rows, found 10"),
            ("drift_noida", f"insert into public.profiles(id,full_name,college,skills,onboarding_completed) values ('{uid('e', 2)}','FAKE','GL Bajaj Institute of Technology and Management, Greater Noida',array['React'],true);",
             "unreviewed Greater Noida legacy rows"),
            ("drift_ambiguous", f"insert into public.profiles(id,full_name,college,skills,onboarding_completed) values ('{uid('e', 3)}','FAKE','GL Bajaj Group',array['React'],true);",
             "ambiguous GL Bajaj rows"),
            ("drift_spelling", f"update public.profiles set college='G.L Bajaj Mathura' where id='{A[10][0]}';",
             "distinct legacy Mathura spellings"),
            ("drift_alias", "insert into matchmaking.college_alias values ('gl bajaj mathura','some-other-campus');",
             "conflicts with an intended GL Bajaj alias"),
            ("drift_trigger", "alter table public.profiles disable trigger matchmaking_profile_changed;",
             "trigger is missing or not enabled for origin sessions"),
            ("drift_trigger_replica", "alter table public.profiles enable replica trigger matchmaking_profile_changed;",
             "trigger is missing or not enabled for origin sessions"),
        ]
        for db, mutation, message in scenarios:
            build(db, mutation)
            if db in ("drift_trigger", "drift_trigger_replica"):
                gate = {r[1]: r[4] for r in read_only(db, PRECHECK) if r[0] == "gate"}
                check(gate["matchmaking_profile_changed enabled on profiles"] == "f",
                      f"{db}: precheck rejects a trigger that does not fire for origin sessions")
            state = (profiles(db), teams(db), aliases(db))
            try:
                psql(db, "-f", str(MIGRATION), quiet=False)
                raise AssertionError(f"{db}: migration should have aborted")
            except RuntimeError as error:
                check(message in str(error), f"{db}: expected guard {message!r}, got {str(error)[-400:]}")
            check((profiles(db), teams(db), aliases(db)) == state, f"{db}: no partial changes")
            check(scalar(db, "select to_regclass('matchmaking.gl_bajaj_college_backfill') is null") == "t", f"{db}: no backfill table")
        gate = {r[1]: r[4] for r in read_only("drift_extra", PRECHECK) if r[0] == "gate"}
        check(gate["legacy Mathura rows"] == "f", "precheck flags the extra legacy row before apply")

        # Normal origin mode is exercised above; ALWAYS mode must also be accepted.
        psql("drift_trigger_replica", "-c", "alter table public.profiles enable always trigger matchmaking_profile_changed;")
        gates_pass(read_only("drift_trigger_replica", PRECHECK), "precheck with ALWAYS trigger")
        out = psql("drift_trigger_replica", "-f", str(MIGRATION), quiet=False)
        check("first_run=t" in out and "profiles_updated=11" in out, "migration accepts ALWAYS trigger")
        gates_pass(read_only("drift_trigger_replica", POSTCHECK), "postcheck with ALWAYS trigger")

        print(f"PASS: {check.count} GL Bajaj Phase B checks in an isolated local PostgreSQL cluster; no remote database used.", flush=True)
    finally:
        if (data / "postmaster.pid").exists():
            fixture.run([ctl, "-D", str(data), "-m", "immediate", "-w", "stop"], env=env)
        if root.parent == Path(tempfile.gettempdir()).resolve() and root.name.startswith("hackermate-gl-bajaj-"):
            shutil.rmtree(root)


if __name__ == "__main__":
    main()
