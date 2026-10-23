/* eslint-disable @typescript-eslint/no-require-imports -- Disposable local PostgreSQL only. */
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const BIN = process.env.HM_PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
const port = process.env.HM_PG_PORT || '55462';
const args = ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'mission02_fixture', '-v', 'ON_ERROR_STOP=1'];
assert(/^\d{4,5}$/.test(port), 'Dedicated local port required');
assert(!process.env.DATABASE_URL && !process.env.PGDATABASE && !process.env.PGSERVICE, 'Refuse external database configuration');
const db = 'mission02_synthetic_' + process.pid;
const sql = (query, database = db) => execFileSync(path.join(BIN, 'psql.exe'), [...args, '-d', database, '-At'], { input: query, encoding: 'utf8', maxBuffer: 8e6 });
const functionRows = JSON.parse(readFileSync(path.join(ROOT, 'docs/qa/team-formation-outcomes/deployed-functions.json')));
const fixture = `
DO $$BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='postgres') THEN CREATE ROLE postgres SUPERUSER; END IF; END$$;
DO $$BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; END IF; END$$;
SET ROLE postgres;
CREATE SCHEMA auth; CREATE SCHEMA vault; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto SCHEMA extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
INSERT INTO vault.decrypted_secrets VALUES('hmac_invite_secret','mission02-synthetic-only');
CREATE TABLE auth.users(id uuid PRIMARY KEY,created_at timestamptz DEFAULT now());
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,created_at timestamptz DEFAULT now());
-- Local fixture simulates Auth creation before profile creation; no real Auth service runs.
CREATE FUNCTION public.synthetic_registration() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN INSERT INTO auth.users(id) VALUES(NEW.id) ON CONFLICT DO NOTHING; RETURN NEW; END $$;
CREATE TRIGGER synthetic_auth BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.synthetic_registration();
CREATE TABLE public.teams(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,description text,owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,max_members integer,college text,hackathon_id uuid,hackathon_name text,skills text[],roles_needed text[]);
CREATE TABLE public.team_hackathons(team_id uuid REFERENCES public.teams ON DELETE CASCADE,hackathon_id uuid,UNIQUE(team_id,hackathon_id));
CREATE TABLE public.team_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),team_id uuid NOT NULL REFERENCES public.teams ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,role text DEFAULT 'member' CHECK(role IN ('owner','member')),created_at timestamptz DEFAULT now(),project_role text DEFAULT 'Developer',UNIQUE(team_id,user_id));
CREATE TABLE public.team_join_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),team_id uuid NOT NULL REFERENCES public.teams ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,status text NOT NULL DEFAULT 'pending',created_at timestamptz DEFAULT now(),UNIQUE(team_id,user_id));
CREATE TABLE public.team_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),team_id uuid REFERENCES public.teams ON DELETE CASCADE,invited_user_id uuid REFERENCES public.profiles ON DELETE CASCADE,invited_by uuid REFERENCES public.profiles ON DELETE CASCADE,status text DEFAULT 'pending',created_at timestamptz DEFAULT now());
CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES public.profiles ON DELETE CASCADE,message text,link text);
CREATE TABLE public.conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),team_id uuid,type text);
CREATE TABLE public.conversation_participants(conversation_id uuid,user_id uuid,UNIQUE(conversation_id,user_id));
CREATE FUNCTION public.is_team_owner(p_team_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT EXISTS(SELECT FROM public.teams WHERE id=p_team_id AND owner_id=auth.uid())$$;
GRANT USAGE ON SCHEMA public,auth,extensions TO anon,authenticated,service_role;
GRANT SELECT ON public.teams,public.team_members,public.team_join_requests TO anon,authenticated,service_role;
GRANT DELETE ON public.teams,public.team_members,public.team_join_requests TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY; ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY; ALTER TABLE public.team_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY teams_read ON public.teams FOR SELECT USING(true);
CREATE POLICY teams_delete ON public.teams FOR DELETE TO authenticated USING(owner_id=auth.uid());
CREATE POLICY members_read ON public.team_members FOR SELECT USING(true);
CREATE POLICY members_delete ON public.team_members FOR DELETE TO authenticated USING(user_id=auth.uid() OR public.is_team_owner(team_id));
CREATE POLICY requests_read ON public.team_join_requests FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_team_owner(team_id));
CREATE POLICY requests_delete ON public.team_join_requests FOR DELETE TO authenticated USING(user_id=auth.uid() OR public.is_team_owner(team_id));
`;
const concurrent = query => new Promise((resolve, reject) => {
  const child = spawn(path.join(BIN, 'psql.exe'), [...args, '-d', db, '-At'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = ''; child.stdout.on('data', data => out += data); child.stderr.on('data', data => err += data);
  child.on('error', reject); child.on('close', code => resolve({ code, out, err })); child.stdin.end(query);
});
const benchmark = `BEGIN; SET ROLE postgres;
INSERT INTO public.profiles(id) VALUES('00000000-0000-4000-8000-000000009999');
INSERT INTO public.teams(id,name,owner_id,max_members) VALUES('00000000-0000-4000-8000-000000009999','Synthetic latency','00000000-0000-4000-8000-000000000001',NULL);
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000009999';
DO $$DECLARE started timestamptz:=clock_timestamp(); request uuid; BEGIN FOR i IN 1..100 LOOP
  request:=public.request_to_join_team('00000000-0000-4000-8000-000000009999');
  DELETE FROM public.team_join_requests WHERE id=request;
END LOOP; PERFORM set_config('fixture.elapsed',extract(epoch FROM clock_timestamp()-started)::text,true); END $$;
SELECT current_setting('fixture.elapsed'); ROLLBACK;`;
async function main() {
  const evidence = path.join(ROOT, 'docs/qa/team-formation-outcomes'); mkdirSync(evidence, { recursive: true });
  let created = false;
  try {
    const identity = sql("SELECT current_user||'|'||host(inet_server_addr())||'|'||current_setting('server_version_num');", 'postgres');
    assert.match(identity, /^mission02_fixture\|127\.0\.0\.1\|/);
    sql('CREATE DATABASE ' + db + ';', 'postgres'); created = true;
    sql(fixture);
    for (const f of functionRows) {
      const types = { accept_team_invite:'uuid',accept_team_join_request:'uuid',add_user_to_team:'uuid,uuid,text',create_team_with_owner:'text,text,integer,text,uuid,text,text[],text[]',join_team_instantly:'uuid,text',request_to_join_team:'uuid' }[f.proname];
      sql('SET ROLE postgres;\n'+f.definition+';\nREVOKE ALL ON FUNCTION public.'+f.proname+'('+types+') FROM PUBLIC,anon,authenticated,service_role;'+(f.acl.includes('authenticated=')?'GRANT EXECUTE ON FUNCTION public.'+f.proname+'('+types+') TO authenticated;':'')+(f.acl.includes('service_role=')?'GRANT EXECUTE ON FUNCTION public.'+f.proname+'('+types+') TO service_role;':''));
    }
    // Baseline records precede migration; no email extensions, webhooks or network functions are installed.
    sql("SET ROLE postgres; INSERT INTO public.profiles(id) VALUES('00000000-0000-4000-8000-000000000001');");
    const baselineSeconds = Number(sql(benchmark).trim().split(/\r?\n/).at(-2));
    const before = Date.now();
    sql('SET ROLE postgres;\n'+readFileSync(path.join(ROOT,'supabase/migrations/20261023130455_team_formation_outcomes.sql'),'utf8'));
    const migrationMs = Date.now()-before;
    const journalSeconds = Number(sql(benchmark).trim().split(/\r?\n/).at(-2));
    assert(Number.isFinite(baselineSeconds) && Number.isFinite(journalSeconds));
    const addedMs = (journalSeconds-baselineSeconds)*10;
    assert(addedMs<10,'Stop on material local overhead: >=10ms per submission/removal pair');
    const checks = sql('SET ROLE postgres;\n'+readFileSync(path.join(ROOT,'scripts/test-team-formation-outcomes.sql'),'utf8'));
    const results = await Promise.all([
      concurrent("BEGIN;SET ROLE authenticated;SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';SELECT public.accept_team_join_request('00000000-0000-4000-8000-000000000101');COMMIT;"),
      concurrent("BEGIN;SET ROLE authenticated;SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';SELECT public.reject_team_join_request('00000000-0000-4000-8000-000000000101');COMMIT;")
    ]);
    assert.equal(results.filter(r=>r.code===0).length,1,'Exactly one concurrent accept/reject wins');
    assert.equal(sql("SELECT count(*) FROM audit.team_formation_events WHERE request_id='00000000-0000-4000-8000-000000000101' AND kind='request_resolved';").trim(),'1');
    const accept = id => concurrent("BEGIN;SET ROLE authenticated;SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';SELECT public.accept_team_join_request('00000000-0000-4000-8000-"+id+"');COMMIT;");
    const first = await Promise.all([accept('000000000102'),accept('000000000103')]);
    assert(first.every(r=>r.code===0),'Concurrent memberships on different teams both commit');
    assert.equal(sql("SELECT count(*) FROM audit.team_formation_accounts WHERE user_id='00000000-0000-4000-8000-000000000020' AND activated_at IS NOT NULL;").trim(),'1');
    const capacity = await Promise.all([accept('000000000104'),accept('000000000105')]);
    assert.equal(capacity.filter(r=>r.code===0).length,1,'One last-seat acceptance wins');
    assert.equal(sql("SELECT count(*) FROM public.team_members WHERE team_id='00000000-0000-4000-8000-000000000073';").trim(),'2');
    const plans = sql("SET ROLE service_role; EXPLAIN (ANALYZE,BUFFERS) SELECT public.get_team_formation_report(now()-interval '35 days',now()-interval '7 days'); SELECT pg_total_relation_size('audit.team_formation_events');");
    const actualReport=JSON.parse(sql("SET ROLE service_role; SELECT public.get_team_formation_report(now()-interval '35 days',now()-interval '7 days');").trim().split(/\r?\n/).at(-1));
    const dto=require('./ppt-vision-harness.cjs').harness({}, {URLSearchParams}).load('src/lib/admin/teamFormationReport.ts');
    assert(dto.isFormationReport(actualReport),'Actual SQL aggregate must satisfy the TypeScript DTO contract');
    sql('SET ROLE postgres;\n'+readFileSync(path.join(evidence,'rollback.sql'),'utf8'));
    for(const f of functionRows.filter(f=>['accept_team_invite','accept_team_join_request','join_team_instantly','create_team_with_owner'].includes(f.proname))) {
      const restored = sql("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='"+f.proname+"';").replaceAll('\r','').trim();
      assert.equal(restored,f.definition.replaceAll('\r','').trim(),'Rollback restores captured deployed '+f.proname);
    }
    assert.equal(sql("SET ROLE service_role;SELECT public.get_team_formation_report(now()-interval '35 days',now()-interval '7 days')->>'coverage';").trim().split('\n').at(-1),'unavailable');
    writeFileSync(path.join(evidence,'sql-results.txt'),identity+'Migration milliseconds: '+migrationMs+'\n100 submission/removal pairs, baseline seconds: '+baselineSeconds+'; journal seconds: '+journalSeconds+'; added milliseconds per pair: '+addedMs+'\n'+checks+'\nConcurrent accept/reject: one winner; one terminal fact.\nConcurrent first memberships: two memberships, one first activation.\nLast-seat race: one acceptance, capacity preserved.\nRollback: all four captured deployed definitions restored; coverage unavailable.\n'+plans);
    console.log('Local SQL lifecycle/security/retention checks passed; concurrency winner verified; synthetic database will be dropped.');
  } finally {
    if(created) sql('DROP DATABASE '+db+' WITH (FORCE);','postgres');
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
