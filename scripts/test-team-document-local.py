"""Real competing PostgreSQL transactions in a disposable localhost cluster only.

No connection URL accepted, no production credentials loaded. Requires local PG
server binaries; uses the repository's existing initdb/pg_ctl test harness.
"""
import concurrent.futures
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("pg_fixture", ROOT / "docs/architecture/matchmaking-v2/verify_draft.py")
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
A, B, C, OUTSIDER = [f"00000000-0000-0000-0000-{i:012}" for i in range(1, 5)]
TEAM = "10000000-0000-0000-0000-000000000001"
EMPTY_TEAM = "10000000-0000-0000-0000-000000000002"
DOC = "20000000-0000-0000-0000-000000000001"


def main():
    root = Path(tempfile.mkdtemp(prefix="hackermate-document-test-")).resolve()
    data = root / "data"
    env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    ctl = str(fixture.BIN / ("pg_ctl" + fixture.SUFFIX))
    base = [str(fixture.BIN / ("psql" + fixture.SUFFIX)), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
            "-h", "127.0.0.1", "-p", str(port), "-U", "document_test", "-d", "postgres"]
    processes = []

    def sql(query):
        return fixture.run(base + ["-c", query], env=env).strip()

    def identity(user):
        return f"SET ROLE authenticated; SET request.jwt.claim.sub='{user}'; "

    def save(user, revision, content, doc=DOC):
        return identity(user) + f"SELECT public.save_team_document('{TEAM}','{doc}',{revision},'{content}');"

    def expect_error(query, fragment):
        try:
            sql(query)
        except RuntimeError as error:
            assert fragment in str(error), str(error)
        else:
            raise AssertionError(f"Expected error: {fragment}")

    def held(query):
        proc = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, env=env, creationflags=fixture.FLAGS)
        processes.append(proc)
        proc.stdin.write("BEGIN;\n" + query + "\n\\echo HELD\n")
        proc.stdin.flush()
        output = []
        for line in proc.stdout:
            if line.strip() == "HELD":
                return proc, "".join(output).strip()
            output.append(line)
        raise AssertionError("Transaction exited: " + "".join(output))

    def wait_for_blocked():
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if int(sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")):
                return
            time.sleep(0.03)
        raise AssertionError("Competing transaction never blocked on the held row")

    try:
        fixture.run([str(fixture.BIN / ("initdb" + fixture.SUFFIX)), "-D", str(data), "-U", "document_test",
                     "-A", "trust", "--no-locale", "--encoding=UTF8"], env=env)
        fixture.run([ctl, "-D", str(data), "-l", str(root / "server.log"), "-o",
                     f"-h 127.0.0.1 -p {port}", "-w", "start"], env=env)
        sql("""CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
CREATE TABLE public.profiles(id uuid PRIMARY KEY);
CREATE TABLE public.teams(id uuid PRIMARY KEY,owner_id uuid REFERENCES profiles(id));
CREATE TABLE public.team_members(team_id uuid,user_id uuid);
CREATE PUBLICATION supabase_realtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO authenticated;
""")
        core = (ROOT / "supabase/migrations/202607020001_core_security.sql").read_text()
        sql(core[core.index("create or replace function public.is_team_owner"):core.index("create or replace function public.can_access_conversation")])
        fixture.run(base + ["-f", str(ROOT / "supabase/migrations/202607050001_team_workspace.sql")], env=env)
        sql(f"""INSERT INTO profiles VALUES ('{A}'),('{B}'),('{C}'),('{OUTSIDER}');
INSERT INTO teams VALUES ('{TEAM}','{A}'),('{EMPTY_TEAM}','{A}');
INSERT INTO team_members VALUES ('{TEAM}','{B}'),('{TEAM}','{C}'),('{EMPTY_TEAM}','{B}');
INSERT INTO team_documents(id,team_id,content,updated_by,updated_at)
VALUES ('{DOC}','{TEAM}','Existing Markdown content','{A}','2026-01-01T00:00:00Z');""")
        snapshot = sql("SELECT content,updated_by,updated_at FROM team_documents")
        migration = ROOT / "supabase/migrations/202610120002_team_document_revisions.sql"
        print(f"Testing migration twice in isolated PostgreSQL: {migration.name}", flush=True)
        for _ in range(2):
            fixture.run(base + ["-f", str(migration)], env=env)
        assert sql("SELECT content,updated_by,updated_at FROM team_documents") == snapshot
        assert sql("SELECT revision FROM team_documents") == "1"
        assert sql("SELECT prosecdef FROM pg_proc WHERE proname='save_team_document'") == "f"
        print("PASS: additive migration reruns, retains original content/metadata, RPC is invoker", flush=True)

        # Hold A's update before COMMIT. B must wait and then see a conflict.
        first, output = held(save(A, 1, "A committed"))
        assert json.loads(output)["status"] == "saved"
        with concurrent.futures.ThreadPoolExecutor() as pool:
            second = pool.submit(sql, save(B, 1, "B stale"))
            wait_for_blocked()
            first.stdin.write("COMMIT;\n\\q\n"); first.stdin.flush(); first.wait(timeout=10)
            result = json.loads(second.result(timeout=10))
        assert result["status"] == "conflict" and result["document"]["content"] == "A committed"
        assert result["document"]["revision"] == 2
        assert json.loads(sql(save(B, 1, "B sequential stale")))["status"] == "conflict"
        assert json.loads(sql(save(B, 2, "B reviewed override")))["status"] == "saved"
        assert json.loads(sql(save(C, 3, "C intervened")))["status"] == "saved"
        assert json.loads(sql(save(B, 3, "B old dialog")))["status"] == "conflict"
        assert sql("SELECT content,revision FROM team_documents") == "C intervened|4"
        print("PASS: real blocked writers, sequential stale save, reviewed override, third writer", flush=True)

        expect_error(identity(A) + f"UPDATE team_documents SET content='legacy write' WHERE id='{DOC}'", "Document revision required")
        expect_error(identity(A) + f"UPDATE team_documents SET revision=90,content='skip' WHERE id='{DOC}'", "Document revision required")
        expect_error(identity(OUTSIDER) + f"INSERT INTO team_documents(team_id,content) VALUES ('{TEAM}','bad')", "row-level security")
        expect_error(save(OUTSIDER, 4, "bad"), "Team membership required")
        expect_error(f"SET ROLE anon; SELECT public.save_team_document('{TEAM}','{DOC}',4,'bad')", "permission denied")
        assert sql(identity(OUTSIDER) + "SELECT count(*) FROM team_documents") == "0"
        assert sql(identity(OUTSIDER) + f"UPDATE team_documents SET content='bad',revision=5 WHERE id='{DOC}' RETURNING id") == ""
        assert json.loads(sql(save(A, 1, "missing", "20000000-0000-0000-0000-000000000099")))["status"] == "missing"
        # Simulate UPDATE being denied while SELECT and membership still work.
        sql("CREATE POLICY fixture_deny_update ON team_documents AS RESTRICTIVE FOR UPDATE TO authenticated USING(false)")
        expect_error(save(A, 4, "denied"), "Document update was denied")
        sql("DROP POLICY fixture_deny_update ON team_documents")
        sql(f"DELETE FROM team_members WHERE team_id='{TEAM}' AND user_id='{B}'")
        expect_error(save(B, 4, "removed member"), "Team membership required")
        print("PASS: legacy writes fail closed, RLS/anonymous/removed member denial, missing vs denied", flush=True)

        # Unique team_id: two first-open inserts cannot overwrite one another.
        first, _ = held(identity(A) + f"INSERT INTO team_documents(team_id,content) VALUES ('{EMPTY_TEAM}','First creator');")
        with concurrent.futures.ThreadPoolExecutor() as pool:
            second = pool.submit(sql, identity(B) + f"INSERT INTO team_documents(team_id,content) VALUES ('{EMPTY_TEAM}','Second creator');")
            wait_for_blocked()
            first.stdin.write("COMMIT;\n\\q\n"); first.stdin.flush(); first.wait(timeout=10)
            try:
                second.result(timeout=10)
                raise AssertionError("Duplicate creation unexpectedly succeeded")
            except RuntimeError as error:
                assert "duplicate key" in str(error)
        assert sql(f"SELECT content,revision FROM team_documents WHERE team_id='{EMPTY_TEAM}'") == "First creator|1"
        # FK deletion must still work without weakening content-write protection.
        sql(f"DELETE FROM profiles WHERE id='{C}'")
        assert sql(f"SELECT updated_by IS NULL,content,revision FROM team_documents WHERE id='{DOC}'") == "t|C intervened|4"
        print("PASS: concurrent creation preserves winner; author FK cleanup remains compatible", flush=True)
        print("PASS: actual PostgreSQL concurrency and permission suite (isolated localhost only)", flush=True)
    finally:
        for proc in processes:
            if proc.poll() is None:
                proc.kill(); proc.wait(timeout=10)
        if (data / "postmaster.pid").exists():
            fixture.run([ctl, "-D", str(data), "-m", "immediate", "-w", "stop"], env=env)
        if root.parent == Path(tempfile.gettempdir()).resolve() and root.name.startswith("hackermate-document-test-"):
            shutil.rmtree(root)


if __name__ == "__main__":
    main()
