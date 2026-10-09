"""Run the real V2 and squad migrations in a temporary local PG cluster; never Supabase."""
import importlib.util
import os
from pathlib import Path
import shutil
import socket
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("mm_fixture", ROOT / "docs/architecture/matchmaking-v2/verify_draft.py")
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

def main():
    root = Path(tempfile.mkdtemp(prefix="hackermate-squad-test-")).resolve()
    data = root / "data"
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    ctl = str(fixture.BIN / ("pg_ctl" + fixture.SUFFIX))
    base = [str(fixture.BIN / ("psql" + fixture.SUFFIX)), "-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", str(port), "-U", "squad_test", "-d", "postgres"]
    try:
        fixture.run([str(fixture.BIN / ("initdb" + fixture.SUFFIX)), "-D", str(data), "-U", "squad_test", "-A", "trust", "--no-locale", "--encoding=UTF8"], env=env)
        fixture.run([ctl, "-D", str(data), "-l", str(root / "server.log"), "-o", f"-h 127.0.0.1 -p {port}", "-w", "start"], env=env)
        setup = fixture.SETUP + """
alter table public.profiles add column show_track_record boolean, add column email text, add column gender text;
alter table public.team_invites add column id uuid default gen_random_uuid(), add column invited_by uuid;
create table public.hackathons(id uuid primary key,min_team_size integer,max_team_size integer);
create table public.team_hackathons(team_id uuid,hackathon_id uuid);
create table public.notifications(user_id uuid,message text,link text);
"""
        path = root / "setup.sql"
        path.write_text(setup, encoding="utf-8")
        fixture.run(base + ["-f", str(path)], env=env)
        for name in ["20260925221500_matchmaking_v2_engine.sql", "202608070003_invite_notification_team_link.sql", "202610090001_squad_matcher.sql"]:
            fixture.run(base + ["-f", str(ROOT / "supabase/migrations" / name)], env=env)
        output = fixture.run(base + ["-f", str(ROOT / "scripts/test-squad-matching.sql")], env=env)
        print(output[-650:], flush=True)
        # Exercise the server-to-client JSON contract, using the real SQL output and TS parser.
        fixture.run(base + ["-c", "update public.profiles set onboarding_completed=true where id='00000000-0000-0000-0000-000000000001'"], env=env)
        query = "set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; select public.get_team_builder_recommendations('10000000-0000-0000-0000-000000000001');"
        payload = fixture.run(base + ["-t", "-A", "-c", query], env=env).strip().splitlines()[-1]
        snapshot = root / "rpc.json"
        snapshot.write_text(payload, encoding="utf-8")
        code = "const a=require('node:assert/strict');const raw=JSON.parse(require('node:fs').readFileSync(process.argv[1],'utf8'));const {harness}=require('./scripts/ppt-vision-harness.cjs');const result=harness().load('src/lib/squadMatching.ts').parseSquadRecommendations(raw,raw.context.teamId);a.equal(result.context.capacity,8);a.equal(result.context.memberCount,2);a(result.candidates.length>0);a.deepEqual(Array.from(result.candidates,c=>c.id),raw.candidates.map(c=>c.id));console.log('PASS: real SQL recommendation JSON passes the actual client contract.');"
        print(fixture.run([shutil.which("node") or "node", "-e", code, str(snapshot)], env=env, cwd=ROOT), flush=True)
        print("PASS: actual migrations compile and behavioral SQL assertions pass locally.", flush=True)
    finally:
        if (data / "postmaster.pid").exists():
            fixture.run([ctl, "-D", str(data), "-m", "immediate", "-w", "stop"], env=env)
        # Verify the exact allocated absolute temp path before recursive cleanup.
        if root.parent == Path(tempfile.gettempdir()).resolve() and root.name.startswith("hackermate-squad-test-"):
            shutil.rmtree(root)

if __name__ == "__main__":
    main()
